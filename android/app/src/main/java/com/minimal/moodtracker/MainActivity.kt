package com.minimal.moodtracker

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.view.Window
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Standalone Native Android Activity hosting the offline WebView bundle and bridging
 * real-time local data & photo updates to the Home Screen Widgets (QuickMood & PhotoMood).
 */
class MainActivity : Activity() {

    private var webView: WebView? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingTestNotification: Boolean = false
    private var isPageLoaded: Boolean = false
    private var pendingCameraPhotoDataUrl: String? = null
    private var pendingCameraFromWidget: Boolean = false
    private var isWidgetCameraCapture: Boolean = false

    private data class QuickEntryRequest(
        val mood: Int?,
        val openSheet: Boolean,
        val launchCamera: Boolean = false,
        val tab: String? = null
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window?.statusBarColor = Color.parseColor("#111214")
        window?.navigationBarColor = Color.parseColor("#111214")

        ReminderReceiver.createNotificationChannel(this)
        if (ReminderReceiver.isRemindersEnabledInPrefs(this)) {
            ensureNotificationPermissionIfNeeded(sendTestAfter = false)
        }

        val wv = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#111214"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = true
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    isPageLoaded = true
                    pendingCameraPhotoDataUrl?.let { dataUrl ->
                        val fromWidget = pendingCameraFromWidget
                        pendingCameraPhotoDataUrl = null
                        pendingCameraFromWidget = false
                        deliverCameraPhotoToWebView(dataUrl, fromWidget)
                    }
                    extractQuickEntryRequest(intent)?.let { req ->
                        clearQuickEntryIntent(intent)
                        if (req.launchCamera) {
                            launchCameraCapture(fromWidget = true)
                        } else {
                            dispatchQuickEntryEvent(req)
                        }
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    return try {
                        val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "image/*"
                        }
                        startActivityForResult(
                            Intent.createChooser(pickIntent, "画像を選択"),
                            REQUEST_SELECT_FILE
                        )
                        true
                    } catch (_: Exception) {
                        this@MainActivity.filePathCallback = null
                        false
                    }
                }
            }
            addJavascriptInterface(AndroidWidgetBridge(this@MainActivity), "AndroidBridge")
        }

        val rootContainer = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#111214"))
            setOnApplyWindowInsetsListener { view, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val bars = insets.getInsets(
                        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
                    )
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                    WindowInsets.CONSUMED
                } else {
                    @Suppress("DEPRECATION")
                    view.setPadding(
                        insets.systemWindowInsetLeft,
                        insets.systemWindowInsetTop,
                        insets.systemWindowInsetRight,
                        insets.systemWindowInsetBottom
                    )
                    @Suppress("DEPRECATION")
                    insets.consumeSystemWindowInsets()
                }
            }
            addView(wv)
        }

        setContentView(rootContainer)
        if (Build.VERSION.SDK_INT >= 30) {
            runCatching {
                window?.insetsController?.setSystemBarsAppearance(
                    0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                )
            }
        }
        rootContainer.requestApplyInsets()
        this.webView = wv

        val initialReq = extractQuickEntryRequest(intent)
        val baseUrl = "file:///android_asset/www/index.html"
        val startUrl = if (initialReq != null) {
            when {
                initialReq.mood != null -> "$baseUrl?mood=${initialReq.mood}&openSheet=1"
                initialReq.tab != null && !initialReq.openSheet -> "$baseUrl?tab=${initialReq.tab}"
                initialReq.openSheet -> "$baseUrl?openSheet=1"
                else -> baseUrl
            }
        } else {
            baseUrl
        }
        wv.loadUrl(startUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractQuickEntryRequest(intent)?.let { request ->
            clearQuickEntryIntent(intent)
            if (request.launchCamera) {
                launchCameraCapture(fromWidget = true)
            } else {
                dispatchQuickEntryEvent(request)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_SELECT_FILE) {
            val callback = filePathCallback ?: return
            filePathCallback = null
            val resultUri = if (resultCode == RESULT_OK && data?.data != null) {
                arrayOf(data.data!!)
            } else {
                null
            }
            callback.onReceiveValue(resultUri)
        } else if (requestCode == REQUEST_CAPTURE_PHOTO) {
            val fromWidget = isWidgetCameraCapture
            isWidgetCameraCapture = false
            if (resultCode == RESULT_OK) {
                val captureFile = File(cacheDir, "camera_capture.jpg")
                @Suppress("DEPRECATION")
                val fallbackBitmap = data?.extras?.get("data") as? Bitmap
                Thread {
                    val dataUrl = processCapturedPhoto(captureFile, fallbackBitmap)
                    if (dataUrl != null) {
                        runOnUiThread {
                            deliverCameraPhotoToWebView(dataUrl, fromWidget)
                        }
                    }
                }.start()
            }
        } else if (requestCode == REQUEST_PICK_SYNC_FOLDER) {
            val detail = if (resultCode == RESULT_OK && data?.data != null) {
                val status = DailySyncManager.saveTreeUri(this, data.data!!, data.flags)
                JSONObject().apply {
                    put("cancelled", false)
                    put("status", status)
                }
            } else {
                JSONObject().apply {
                    put("cancelled", true)
                    put("status", DailySyncManager.getStatus(this@MainActivity))
                }
            }
            dispatchCustomEvent("moodtracker:sync-folder-changed", detail)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val wv = webView
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun extractQuickEntryRequest(intent: Intent?): QuickEntryRequest? {
        if (intent == null) return null

        val data = intent.data
        if (data != null && data.scheme == "moodtracker" && data.host == "quick-entry") {
            val mood = data.getQueryParameter("mood")?.toIntOrNull()?.takeIf { it in 1..5 }
            val openSheetParam = data.getQueryParameter("openSheet")?.lowercase()
            val openSheet = openSheetParam == "1" || openSheetParam == "true"
            val cameraParam = data.getQueryParameter("camera")?.lowercase()
            val launchCamera = cameraParam == "1" || cameraParam == "true"
            val tabParam = data.getQueryParameter("tab")?.lowercase()
                ?.takeIf { it == "routines" || it == "timeline" || it == "pixels" }
            if (mood != null || openSheet || launchCamera || tabParam != null) {
                return QuickEntryRequest(
                    mood = mood,
                    openSheet = mood != null || openSheet || launchCamera,
                    launchCamera = launchCamera,
                    tab = tabParam
                )
            }
        }

        val extraMood = intent.getIntExtra(QuickMoodWidgetProvider.EXTRA_MOOD_LEVEL, 0)
            .takeIf { it in 1..5 }
        val extraOpenSheet = intent.getBooleanExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_SHEET, false)
        val extraLaunchCamera = intent.getBooleanExtra(PhotoMoodWidgetProvider.EXTRA_LAUNCH_CAMERA, false)
        val extraOpenTab = intent.getStringExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_TAB)
            ?.lowercase()
            ?.takeIf { it == "routines" || it == "timeline" || it == "pixels" }
        if (extraMood != null || extraOpenSheet || extraLaunchCamera || extraOpenTab != null) {
            return QuickEntryRequest(
                mood = extraMood,
                openSheet = extraMood != null || extraOpenSheet || extraLaunchCamera,
                launchCamera = extraLaunchCamera,
                tab = extraOpenTab
            )
        }

        return null
    }

    private fun clearQuickEntryIntent(intent: Intent?) {
        if (intent == null) return
        intent.data = null
        intent.removeExtra(QuickMoodWidgetProvider.EXTRA_MOOD_LEVEL)
        intent.removeExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_SHEET)
        intent.removeExtra(PhotoMoodWidgetProvider.EXTRA_LAUNCH_CAMERA)
        intent.removeExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_TAB)
    }

    fun launchCameraCapture(fromWidget: Boolean = false) {
        isWidgetCameraCapture = fromWidget
        runCatching {
            val captureFile = File(cacheDir, "camera_capture.jpg")
            if (captureFile.exists()) {
                captureFile.delete()
            }
            captureFile.createNewFile()

            val photoUri = Uri.parse("content://${CameraFileProvider.AUTHORITY}/camera_capture.jpg")
            val captureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                clipData = ClipData.newRawUri("", photoUri)
                addFlags(
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            startActivityForResult(captureIntent, REQUEST_CAPTURE_PHOTO)
        }.onFailure {
            isWidgetCameraCapture = false
        }
    }

    fun launchPickSyncFolder() {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
                )
            }
            startActivityForResult(intent, REQUEST_PICK_SYNC_FOLDER)
        } catch (e: Exception) {
            val detail = JSONObject().apply {
                put("cancelled", true)
                put("error", e.message ?: e.javaClass.simpleName)
                put("status", DailySyncManager.getStatus(this@MainActivity))
            }
            dispatchCustomEvent("moodtracker:sync-folder-changed", detail)
        }
    }

    private fun processCapturedPhoto(captureFile: File, fallbackBitmap: Bitmap?): String? {
        return try {
            var bitmap: Bitmap? = null
            var rotationDegrees = 0f

            if (captureFile.exists() && captureFile.length() > 0L) {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(captureFile.absolutePath, bounds)
                if (bounds.outWidth > 0 && bounds.outHeight > 0) {
                    val maxDim = 960
                    var sampleSize = 1
                    while (
                        bounds.outWidth / sampleSize > maxDim * 2 ||
                        bounds.outHeight / sampleSize > maxDim * 2
                    ) {
                        sampleSize *= 2
                    }
                    val decodeOpts = BitmapFactory.Options().apply {
                        inSampleSize = sampleSize
                    }
                    bitmap = BitmapFactory.decodeFile(captureFile.absolutePath, decodeOpts)
                    rotationDegrees = readExifRotationDegrees(captureFile.absolutePath)
                }
            }

            if (bitmap == null && fallbackBitmap != null) {
                bitmap = fallbackBitmap
            }
            val decoded = bitmap ?: return null

            val rotated = if (rotationDegrees != 0f) {
                val matrix = Matrix().apply { postRotate(rotationDegrees) }
                Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
                    .also { if (it !== decoded) decoded.recycle() }
            } else {
                decoded
            }

            val maxDim = 960
            val finalBitmap = if (rotated.width > maxDim || rotated.height > maxDim) {
                val scale = minOf(
                    maxDim.toFloat() / rotated.width.toFloat(),
                    maxDim.toFloat() / rotated.height.toFloat()
                )
                val targetW = (rotated.width * scale).toInt().coerceAtLeast(1)
                val targetH = (rotated.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(rotated, targetW, targetH, true)
                    .also { if (it !== rotated) rotated.recycle() }
            } else {
                rotated
            }

            val out = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
            finalBitmap.recycle()

            val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            "data:image/jpeg;base64,$base64"
        } catch (_: Exception) {
            null
        } catch (_: OutOfMemoryError) {
            null
        }
    }

    private fun readExifRotationDegrees(filePath: String): Float {
        return try {
            val exif = ExifInterface(filePath)
            when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } catch (_: Exception) {
            0f
        }
    }

    private fun deliverCameraPhotoToWebView(dataUrl: String, isNewEntry: Boolean = false) {
        val wv = webView
        if (!isPageLoaded || wv == null) {
            pendingCameraPhotoDataUrl = dataUrl
            pendingCameraFromWidget = isNewEntry
            return
        }
        val quotedDataUrl = JSONObject.quote(dataUrl)
        val script = """
            (function() {
              var event = new CustomEvent('moodtracker:camera-photo', {
                cancelable: true,
                detail: { imageDataUrl: $quotedDataUrl, openSheet: true, isNewEntry: $isNewEntry }
              });
              window.dispatchEvent(event);
            })();
        """.trimIndent()
        wv.post {
            wv.evaluateJavascript(script, null)
        }
    }

    private fun dispatchQuickEntryEvent(request: QuickEntryRequest) {
        val wv = webView ?: return
        val detailObj = JSONObject().apply {
            if (request.mood != null) put("mood", request.mood)
            put("openSheet", request.openSheet)
            if (request.tab != null) put("tab", request.tab)
        }
        val script = """
            (function() {
              var event = new CustomEvent('moodtracker:quick-entry', {
                cancelable: true,
                detail: ${detailObj}
              });
              window.dispatchEvent(event);
            })();
        """.trimIndent()
        wv.post {
            wv.evaluateJavascript(script, null)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_POST_NOTIFICATIONS) {
            val granted = grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED &&
                ReminderReceiver.hasNotificationPermission(this)
            var testSent = false
            if (granted) {
                ReminderReceiver.scheduleAllReminders(this)
                if (pendingTestNotification) {
                    testSent = ReminderReceiver.showNotification(this, isTest = true)
                }
            }
            pendingTestNotification = false
            dispatchNotificationPermissionEvent(granted, testSent)
        }
    }

    fun ensureNotificationPermissionIfNeeded(sendTestAfter: Boolean): Boolean {
        if (ReminderReceiver.hasNotificationPermission(this)) {
            return true
        }
        if (Build.VERSION.SDK_INT >= 33) {
            val hasPerm = checkSelfPermission("android.permission.POST_NOTIFICATIONS") ==
                PackageManager.PERMISSION_GRANTED
            if (!hasPerm) {
                if (sendTestAfter) {
                    pendingTestNotification = true
                }
                runOnUiThread {
                    requestPermissions(
                        arrayOf("android.permission.POST_NOTIFICATIONS"),
                        REQUEST_POST_NOTIFICATIONS
                    )
                }
                return false
            }
        }
        return false
    }

    private fun dispatchCustomEvent(eventName: String, detail: JSONObject) {
        val wv = webView ?: return
        val quotedEventName = JSONObject.quote(eventName)
        val script = """
            (function() {
              var event = new CustomEvent($quotedEventName, {
                cancelable: true,
                detail: $detail
              });
              window.dispatchEvent(event);
            })();
        """.trimIndent()
        wv.post {
            wv.evaluateJavascript(script, null)
        }
    }

    private fun dispatchNotificationPermissionEvent(granted: Boolean, testSent: Boolean) {
        val wv = webView ?: return
        val script = """
            (function() {
              var event = new CustomEvent('moodtracker:notification-permission', {
                cancelable: true,
                detail: { granted: $granted, testSent: $testSent }
              });
              window.dispatchEvent(event);
            })();
        """.trimIndent()
        wv.post {
            wv.evaluateJavascript(script, null)
        }
    }

    class AndroidWidgetBridge(private val activity: MainActivity) {
        private val context: Context get() = activity
        private val appContext: Context get() = activity.applicationContext

        private fun parsePositiveEpochMillis(raw: String?): Long? {
            val trimmed = raw?.trim().orEmpty()
            if (trimmed.isEmpty()) return null
            val parsed = trimmed.toLongOrNull() ?: trimmed.toDoubleOrNull()?.toLong() ?: return null
            return parsed.takeIf { it > 0L }
        }

        @JavascriptInterface
        fun syncWidgetState(
            hasLatest: Boolean,
            latestMood: Int,
            latestTimestampStr: String,
            hasPhoto: Boolean,
            photoMood: Int,
            photoTimestampStr: String,
            photoDataUrl: String
        ) {
            try {
                val prefs = appContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                val editor = prefs.edit()
                val latestTs = parsePositiveEpochMillis(latestTimestampStr)
                val photoTs = parsePositiveEpochMillis(photoTimestampStr)

                if (hasLatest && latestTs != null) {
                    editor.putString("widget_last_mood", latestMood.coerceIn(1, 5).toString())
                    editor.putString("widget_last_timestamp", latestTs.toString())
                } else {
                    editor.remove("widget_last_mood")
                    editor.remove("widget_last_timestamp")
                }

                if (hasPhoto && photoTs != null && photoDataUrl.isNotBlank() && photoDataUrl.startsWith("data:image/")) {
                    editor.putString("widget_last_photo_mood", photoMood.coerceIn(1, 5).toString())
                    editor.putString("widget_last_photo_timestamp", photoTs.toString())
                    val existingPhotoData = prefs.getString("widget_last_photo_data", null)
                    if (existingPhotoData != photoDataUrl) {
                        editor.putString("widget_last_photo_data", photoDataUrl)
                    }
                } else {
                    editor.remove("widget_last_photo_data")
                    editor.remove("widget_last_photo_mood")
                    editor.remove("widget_last_photo_timestamp")
                }

                editor.commit()

                QuickMoodWidgetProvider.updateAllWidgets(appContext)
                PhotoMoodWidgetProvider.updateAllWidgets(appContext)
            } catch (e: Exception) {
                Log.e("MoodWidgetBridge", "syncWidgetState failed", e)
            }
        }

        @JavascriptInterface
        fun syncWidget(mood: Int, timestamp: Long, photoDataUrl: String) {
            try {
                val prefs = appContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                val editor = prefs.edit()
                editor.putString("widget_last_mood", mood.coerceIn(1, 5).toString())
                editor.putString("widget_last_timestamp", timestamp.toString())
                if (photoDataUrl.isNotBlank() && photoDataUrl.startsWith("data:image/")) {
                    val existingPhotoData = prefs.getString("widget_last_photo_data", null)
                    if (existingPhotoData != photoDataUrl) {
                        editor.putString("widget_last_photo_data", photoDataUrl)
                    }
                    editor.putString("widget_last_photo_mood", mood.coerceIn(1, 5).toString())
                    editor.putString("widget_last_photo_timestamp", timestamp.toString())
                }
                editor.commit()

                QuickMoodWidgetProvider.updateAllWidgets(appContext)
                PhotoMoodWidgetProvider.updateAllWidgets(appContext)
            } catch (e: Exception) {
                Log.e("MoodWidgetBridge", "syncWidget failed", e)
            }
        }

        @JavascriptInterface
        fun syncRoutineWidget(dateKey: String, completed: Int, total: Int) {
            try {
                val prefs = appContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                prefs.edit()
                    .putString("widget_routine_date", dateKey)
                    .putInt("widget_routine_completed", completed.coerceAtLeast(0))
                    .putInt("widget_routine_total", total.coerceAtLeast(0))
                    .commit()
                PhotoMoodWidgetProvider.updateAllWidgets(appContext)
            } catch (e: Exception) {
                Log.e("MoodWidgetBridge", "syncRoutineWidget failed", e)
            }
        }

        @JavascriptInterface
        fun syncWidgetNudge(intervalMinutes: Int) {
            try {
                val prefs = appContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                prefs.edit()
                    .putInt("widget_nudge_interval_minutes", intervalMinutes.coerceAtLeast(0))
                    .commit()
                PhotoMoodWidgetProvider.updateAllWidgets(appContext)
            } catch (e: Exception) {
                Log.e("MoodWidgetBridge", "syncWidgetNudge failed", e)
            }
        }

        @JavascriptInterface
        fun hasNotificationPermission(): Boolean {
            return ReminderReceiver.hasNotificationPermission(context)
        }

        @JavascriptInterface
        fun requestNotificationPermission(): Boolean {
            if (ReminderReceiver.hasNotificationPermission(context)) {
                return true
            }
            activity.ensureNotificationPermissionIfNeeded(sendTestAfter = false)
            return ReminderReceiver.hasNotificationPermission(context)
        }

        @JavascriptInterface
        fun sendTestNotification(): Boolean {
            if (ReminderReceiver.hasNotificationPermission(context)) {
                return ReminderReceiver.showNotification(context, isTest = true)
            }
            activity.ensureNotificationPermissionIfNeeded(sendTestAfter = true)
            return false
        }

        @JavascriptInterface
        fun syncNotifications(enabled: Boolean, timesCsv: String) {
            if (enabled) {
                activity.ensureNotificationPermissionIfNeeded(sendTestAfter = false)
            }
            ReminderReceiver.saveAndSchedule(context, enabled, timesCsv)
        }

        @JavascriptInterface
        fun launchCamera(): Boolean {
            activity.runOnUiThread {
                activity.launchCameraCapture(fromWidget = false)
            }
            return true
        }

        @JavascriptInterface
        fun getDailySyncStatus(): String {
            return DailySyncManager.getStatus(context).toString()
        }

        @JavascriptInterface
        fun pickSyncFolder(): Boolean {
            activity.runOnUiThread {
                activity.launchPickSyncFolder()
            }
            return true
        }

        @JavascriptInterface
        fun clearSyncFolder(): String {
            return DailySyncManager.clearTreeUri(context).toString()
        }

        @JavascriptInterface
        fun syncDayToFolder(
            requestId: String,
            dateKey: String,
            dailyJson: String,
            imagesJson: String,
            pruneOrphanImages: Boolean
        ): Boolean {
            DailySyncManager.syncDayAsync(
                context = context,
                requestId = requestId,
                dateKey = dateKey,
                dailyJson = dailyJson,
                imagesJson = imagesJson,
                pruneOrphanImages = pruneOrphanImages
            ) { result ->
                activity.dispatchCustomEvent("moodtracker:sync-result", result)
            }
            return true
        }

        @JavascriptInterface
        fun writeSyncIndexToFolder(requestId: String, indexJson: String): Boolean {
            DailySyncManager.writeIndexAsync(
                context = context,
                requestId = requestId,
                indexJson = indexJson
            ) { result ->
                activity.dispatchCustomEvent("moodtracker:sync-result", result)
            }
            return true
        }
    }

    companion object {
        private const val REQUEST_SELECT_FILE = 2001
        private const val REQUEST_POST_NOTIFICATIONS = 2002
        private const val REQUEST_CAPTURE_PHOTO = 2003
        private const val REQUEST_PICK_SYNC_FOLDER = 2004
    }
}
