package com.minimal.moodtracker

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Minimal ContentProvider serving temporary camera capture files from cacheDir
 * without requiring AndroidX FileProvider.
 */
class CameraFileProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = "image/jpeg"

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? {
        val ctx = context ?: return null
        val safeFile = resolveSafeFile(ctx.cacheDir, uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val cursor = MatrixCursor(cols, 1)
        val row = Array<Any?>(cols.size) { index ->
            when (cols[index]) {
                OpenableColumns.DISPLAY_NAME -> safeFile.name
                OpenableColumns.SIZE -> safeFile.length()
                else -> null
            }
        }
        cursor.addRow(row)
        return cursor
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val ctx = context ?: return null
        val safeFile = resolveSafeFile(ctx.cacheDir, uri)
        if (!safeFile.exists()) {
            safeFile.parentFile?.mkdirs()
            safeFile.createNewFile()
        }
        return ParcelFileDescriptor.open(safeFile, ParcelFileDescriptor.parseMode(mode))
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?
    ): Int = 0

    private fun resolveSafeFile(cacheDir: File, uri: Uri): File {
        val fileName = File(uri.lastPathSegment ?: DEFAULT_FILE_NAME).name
        return File(cacheDir, fileName)
    }

    companion object {
        const val AUTHORITY = "com.minimal.moodtracker.fileprovider"
        private const val DEFAULT_FILE_NAME = "camera_capture.jpg"
    }
}
