package com.minimal.moodtracker

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Manages daily JSON + separated image exports to a user-selected SAF directory tree
 * so external sync apps (Syncthing, FolderSync, DriveSync, etc.) can deliver files to bots.
 */
object DailySyncManager {

    private const val PREFS_NAME = "CapacitorStorage"
    private const val KEY_TREE_URI = "daily_sync_tree_uri"
    private const val KEY_FOLDER_LABEL = "daily_sync_folder_label"
    private const val KEY_LAST_SYNCED_AT = "daily_sync_last_at"
    private const val KEY_LAST_ERROR = "daily_sync_last_error"

    private const val DIR_DAILY = "daily"
    private const val DIR_IMAGES = "images"
    private const val INDEX_FILE_NAME = "index.json"

    private val DATE_KEY_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val executor = Executors.newSingleThreadExecutor()

    private data class DocChild(
        val docId: String,
        val displayName: String,
        val mimeType: String
    )

    fun getStatus(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val uriStr = prefs.getString(KEY_TREE_URI, "") ?: ""
        val label = prefs.getString(KEY_FOLDER_LABEL, "") ?: ""
        val lastSyncedAt = prefs.getLong(KEY_LAST_SYNCED_AT, 0L)
        val lastError = prefs.getString(KEY_LAST_ERROR, null)

        val configured = uriStr.isNotBlank()
        val hasPermission = if (configured) {
            runCatching {
                hasPersistedReadWritePermission(context, Uri.parse(uriStr))
            }.getOrDefault(false)
        } else {
            false
        }

        return JSONObject().apply {
            put("supported", true)
            put("configured", configured)
            put("hasPermission", hasPermission)
            put("label", label)
            put("lastSyncedAt", lastSyncedAt)
            put(
                "lastError",
                if (lastError.isNullOrBlank()) JSONObject.NULL else lastError
            )
        }
    }

    fun saveTreeUri(context: Context, treeUri: Uri, intentFlags: Int): JSONObject {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val previousUriStr = prefs.getString(KEY_TREE_URI, "") ?: ""
        val rwFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        val effectiveFlags = (intentFlags and rwFlags).let { masked ->
            if (masked != 0) masked else rwFlags
        }

        return try {
            context.contentResolver.takePersistableUriPermission(treeUri, effectiveFlags)
            if (previousUriStr.isNotBlank() && previousUriStr != treeUri.toString()) {
                runCatching {
                    context.contentResolver.releasePersistableUriPermission(
                        Uri.parse(previousUriStr),
                        rwFlags
                    )
                }
            }
            val label = resolveFolderLabel(context, treeUri)
            prefs.edit()
                .putString(KEY_TREE_URI, treeUri.toString())
                .putString(KEY_FOLDER_LABEL, label)
                .remove(KEY_LAST_ERROR)
                .apply()
            getStatus(context)
        } catch (e: Exception) {
            val message = e.message ?: e.javaClass.simpleName
            prefs.edit()
                .putString(KEY_LAST_ERROR, message)
                .apply()
            getStatus(context)
        }
    }

    fun clearTreeUri(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val previousUriStr = prefs.getString(KEY_TREE_URI, "") ?: ""
        if (previousUriStr.isNotBlank()) {
            runCatching {
                context.contentResolver.releasePersistableUriPermission(
                    Uri.parse(previousUriStr),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            }
        }
        prefs.edit()
            .remove(KEY_TREE_URI)
            .remove(KEY_FOLDER_LABEL)
            .remove(KEY_LAST_SYNCED_AT)
            .remove(KEY_LAST_ERROR)
            .apply()
        return getStatus(context)
    }

    fun syncDayAsync(
        context: Context,
        requestId: String,
        dateKey: String,
        dailyJson: String,
        imagesJson: String,
        pruneOrphanImages: Boolean,
        onComplete: (JSONObject) -> Unit
    ) {
        val appContext = context.applicationContext
        executor.execute {
            val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            try {
                if (!DATE_KEY_REGEX.matches(dateKey)) {
                    throw IllegalArgumentException("Invalid dateKey: $dateKey")
                }

                val treeUri = requireAuthorizedTreeUri(appContext)
                val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)

                val dailyDirId = findOrCreateSubDir(
                    appContext,
                    treeUri,
                    rootDocId,
                    DIR_DAILY,
                    createIfMissing = true
                ) ?: throw IllegalStateException("Unable to access daily directory")

                val dailyChildren = listChildren(appContext, treeUri, dailyDirId).toMutableMap()
                upsertFile(
                    appContext,
                    treeUri,
                    dailyDirId,
                    dailyChildren,
                    "$dateKey.json",
                    "application/json",
                    dailyJson.toByteArray(Charsets.UTF_8)
                )

                val imagesArray = if (imagesJson.isBlank()) JSONArray() else JSONArray(imagesJson)
                var writtenImages = 0

                if (imagesArray.length() > 0 || pruneOrphanImages) {
                    val imagesDirId = findOrCreateSubDir(
                        appContext,
                        treeUri,
                        rootDocId,
                        DIR_IMAGES,
                        createIfMissing = imagesArray.length() > 0
                    )
                    if (imagesDirId != null) {
                        val imageChildren = listChildren(appContext, treeUri, imagesDirId).toMutableMap()
                        val keptFileNames = HashSet<String>()

                        for (i in 0 until imagesArray.length()) {
                            val item = imagesArray.getJSONObject(i)
                            val fileName = item.optString("fileName", "").trim()
                            validateSafeFileName(fileName)
                            val mimeType = item.optString("mimeType", "image/jpeg")
                                .ifBlank { "image/jpeg" }
                            val dataUrl = item.optString("dataUrl", "")
                            val bytes = decodeDataUrl(dataUrl)
                                ?: throw IllegalArgumentException("Invalid image dataUrl for $fileName")

                            upsertFile(
                                appContext,
                                treeUri,
                                imagesDirId,
                                imageChildren,
                                fileName,
                                mimeType,
                                bytes
                            )
                            keptFileNames.add(fileName)
                            writtenImages++
                        }

                        if (pruneOrphanImages) {
                            val dayPrefix = "${dateKey}_"
                            for ((childName, child) in imageChildren) {
                                if (
                                    child.mimeType != DocumentsContract.Document.MIME_TYPE_DIR &&
                                    childName.startsWith(dayPrefix) &&
                                    !keptFileNames.contains(childName)
                                ) {
                                    val deleteUri = DocumentsContract.buildDocumentUriUsingTree(
                                        treeUri,
                                        child.docId
                                    )
                                    runCatching {
                                        DocumentsContract.deleteDocument(
                                            appContext.contentResolver,
                                            deleteUri
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                val now = System.currentTimeMillis()
                prefs.edit()
                    .putLong(KEY_LAST_SYNCED_AT, now)
                    .remove(KEY_LAST_ERROR)
                    .apply()

                onComplete(
                    JSONObject().apply {
                        put("requestId", requestId)
                        put("kind", "day")
                        put("ok", true)
                        put("dateKey", dateKey)
                        put("imageCount", writtenImages)
                        put("syncedAt", now)
                        put("status", getStatus(appContext))
                    }
                )
            } catch (e: Exception) {
                val message = e.message ?: e.javaClass.simpleName
                prefs.edit()
                    .putString(KEY_LAST_ERROR, message)
                    .apply()
                onComplete(
                    JSONObject().apply {
                        put("requestId", requestId)
                        put("kind", "day")
                        put("ok", false)
                        put("dateKey", dateKey)
                        put("error", message)
                        put("status", getStatus(appContext))
                    }
                )
            }
        }
    }

    fun writeIndexAsync(
        context: Context,
        requestId: String,
        indexJson: String,
        onComplete: (JSONObject) -> Unit
    ) {
        val appContext = context.applicationContext
        executor.execute {
            val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            try {
                val treeUri = requireAuthorizedTreeUri(appContext)
                val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)
                val rootChildren = listChildren(appContext, treeUri, rootDocId).toMutableMap()

                upsertFile(
                    appContext,
                    treeUri,
                    rootDocId,
                    rootChildren,
                    INDEX_FILE_NAME,
                    "application/json",
                    indexJson.toByteArray(Charsets.UTF_8)
                )

                val now = System.currentTimeMillis()
                prefs.edit()
                    .putLong(KEY_LAST_SYNCED_AT, now)
                    .remove(KEY_LAST_ERROR)
                    .apply()

                onComplete(
                    JSONObject().apply {
                        put("requestId", requestId)
                        put("kind", "index")
                        put("ok", true)
                        put("syncedAt", now)
                        put("status", getStatus(appContext))
                    }
                )
            } catch (e: Exception) {
                val message = e.message ?: e.javaClass.simpleName
                prefs.edit()
                    .putString(KEY_LAST_ERROR, message)
                    .apply()
                onComplete(
                    JSONObject().apply {
                        put("requestId", requestId)
                        put("kind", "index")
                        put("ok", false)
                        put("error", message)
                        put("status", getStatus(appContext))
                    }
                )
            }
        }
    }

    private fun hasPersistedReadWritePermission(context: Context, treeUri: Uri): Boolean {
        return context.contentResolver.persistedUriPermissions.any { perm ->
            perm.uri == treeUri && perm.isReadPermission && perm.isWritePermission
        }
    }

    private fun requireAuthorizedTreeUri(context: Context): Uri {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val uriStr = prefs.getString(KEY_TREE_URI, "") ?: ""
        if (uriStr.isBlank()) {
            throw IllegalStateException("同期フォルダが設定されていません")
        }
        val treeUri = Uri.parse(uriStr)
        if (!hasPersistedReadWritePermission(context, treeUri)) {
            throw IllegalStateException("同期フォルダへのアクセス権限がありません")
        }
        return treeUri
    }

    private fun resolveFolderLabel(context: Context, treeUri: Uri): String {
        val docId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull() ?: ""
        if (docId.startsWith("primary:")) {
            val sub = docId.removePrefix("primary:").trim('/')
            if (sub.isNotBlank()) return sub
            return "内部ストレージ"
        }
        if (docId.startsWith("home:")) {
            val sub = docId.removePrefix("home:").trim('/')
            return if (sub.isNotBlank()) "Documents/$sub" else "Documents"
        }

        val docUri = runCatching {
            DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        }.getOrNull()
        if (docUri != null) {
            val displayName = runCatching {
                context.contentResolver.query(
                    docUri,
                    arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                    null,
                    null,
                    null
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                        if (idx >= 0) cursor.getString(idx) else null
                    } else {
                        null
                    }
                }
            }.getOrNull()
            if (!displayName.isNullOrBlank()) {
                return displayName
            }
        }

        return docId.ifBlank { treeUri.lastPathSegment ?: "同期フォルダ" }
    }

    private fun listChildren(
        context: Context,
        treeUri: Uri,
        parentDocId: String
    ): Map<String, DocChild> {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        val result = LinkedHashMap<String, DocChild>()
        context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            val idIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
            while (cursor.moveToNext()) {
                val childId = if (idIdx >= 0) cursor.getString(idIdx) else null
                val childName = if (nameIdx >= 0) cursor.getString(nameIdx) else null
                val childMime = if (mimeIdx >= 0) cursor.getString(mimeIdx) else null
                if (!childId.isNullOrBlank() && !childName.isNullOrBlank()) {
                    result[childName] = DocChild(
                        docId = childId,
                        displayName = childName,
                        mimeType = childMime ?: ""
                    )
                }
            }
        }
        return result
    }

    private fun findOrCreateSubDir(
        context: Context,
        treeUri: Uri,
        parentDocId: String,
        dirName: String,
        createIfMissing: Boolean
    ): String? {
        val existing = listChildren(context, treeUri, parentDocId)[dirName]
        if (existing != null) {
            if (existing.mimeType == DocumentsContract.Document.MIME_TYPE_DIR) {
                return existing.docId
            }
            throw IllegalStateException("Path exists as file instead of folder: $dirName")
        }
        if (!createIfMissing) {
            return null
        }
        val parentDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentDocId)
        val createdUri = DocumentsContract.createDocument(
            context.contentResolver,
            parentDocUri,
            DocumentsContract.Document.MIME_TYPE_DIR,
            dirName
        ) ?: throw IllegalStateException("Failed to create folder: $dirName")
        return DocumentsContract.getDocumentId(createdUri)
    }

    private fun upsertFile(
        context: Context,
        treeUri: Uri,
        parentDocId: String,
        existingChildren: MutableMap<String, DocChild>,
        fileName: String,
        mimeType: String,
        bytes: ByteArray
    ) {
        val existing = existingChildren[fileName]
        if (existing != null) {
            if (existing.mimeType == DocumentsContract.Document.MIME_TYPE_DIR) {
                throw IllegalStateException("Cannot overwrite folder with file: $fileName")
            }
            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, existing.docId)
            writeBytesToUri(context.contentResolver, docUri, bytes)
            return
        }

        val parentDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentDocId)
        val createdUri = DocumentsContract.createDocument(
            context.contentResolver,
            parentDocUri,
            mimeType,
            fileName
        ) ?: throw IllegalStateException("Failed to create file: $fileName")

        writeBytesToUri(context.contentResolver, createdUri, bytes)
        val createdDocId = DocumentsContract.getDocumentId(createdUri)
        existingChildren[fileName] = DocChild(
            docId = createdDocId,
            displayName = fileName,
            mimeType = mimeType
        )
    }

    private fun writeBytesToUri(
        contentResolver: ContentResolver,
        uri: Uri,
        bytes: ByteArray
    ) {
        val stream = runCatching { contentResolver.openOutputStream(uri, "wt") }.getOrNull()
            ?: contentResolver.openOutputStream(uri, "w")
            ?: throw IllegalStateException("Unable to open output stream for $uri")
        stream.use { out ->
            out.write(bytes)
            out.flush()
        }
    }

    private fun validateSafeFileName(fileName: String) {
        if (
            fileName.isBlank() ||
            fileName.contains("/") ||
            fileName.contains("\\") ||
            fileName.contains("..")
        ) {
            throw IllegalArgumentException("Unsafe fileName: $fileName")
        }
    }

    private fun decodeDataUrl(dataUrl: String): ByteArray? {
        if (!dataUrl.startsWith("data:")) return null
        val commaIdx = dataUrl.indexOf(',')
        if (commaIdx <= 5) return null
        val header = dataUrl.substring(5, commaIdx).lowercase()
        val payload = dataUrl.substring(commaIdx + 1)
        return runCatching {
            if (header.contains(";base64")) {
                Base64.decode(payload, Base64.DEFAULT)
            } else {
                Uri.decode(payload).toByteArray(Charsets.UTF_8)
            }
        }.getOrNull()
    }
}
