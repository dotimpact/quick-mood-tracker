package com.minimal.moodtracker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.Window
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Standalone Native Android Activity hosting the offline WebView bundle and bridging
 * real-time local data & photo updates to the Home Screen Widgets (QuickMood & PhotoMood).
 */
class MainActivity : Activity() {

    private var webView: WebView? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingTestNotification: Boolean = false

    private data class QuickEntryRequest(
        val mood: Int?,
        val openSheet: Boolean
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
            layoutParams = ViewGroup.LayoutParams(
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
                    extractQuickEntryRequest(intent)?.let { req ->
                        dispatchQuickEntryEvent(req)
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

        setContentView(wv)
        this.webView = wv

        val initialReq = extractQuickEntryRequest(intent)
        val baseUrl = "file:///android_asset/www/index.html"
        val startUrl = if (initialReq != null) {
            if (initialReq.mood != null) {
                "$baseUrl?mood=${initialReq.mood}&openSheet=1"
            } else {
                "$baseUrl?openSheet=1"
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
            dispatchQuickEntryEvent(request)
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
            if (mood != null || openSheet) {
                return QuickEntryRequest(mood = mood, openSheet = true)
            }
        }

        val extraMood = intent.getIntExtra(QuickMoodWidgetProvider.EXTRA_MOOD_LEVEL, 0)
            .takeIf { it in 1..5 }
        val extraOpenSheet = intent.getBooleanExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_SHEET, false)
        if (extraMood != null || extraOpenSheet) {
            return QuickEntryRequest(mood = extraMood, openSheet = true)
        }

        return null
    }

    private fun dispatchQuickEntryEvent(request: QuickEntryRequest) {
        val wv = webView ?: return
        val detailJson = if (request.mood != null) {
            "{ mood: ${request.mood}, openSheet: true }"
        } else {
            "{ openSheet: true }"
        }
        val script = """
            (function() {
              var event = new CustomEvent('moodtracker:quick-entry', {
                cancelable: true,
                detail: $detailJson
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

        @JavascriptInterface
        fun syncWidget(mood: Int, timestamp: Long, photoDataUrl: String) {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val editor = prefs.edit()
            editor.putString("widget_last_mood", mood.toString())
            editor.putString("widget_last_timestamp", timestamp.toString())
            if (photoDataUrl.isNotBlank() && photoDataUrl.startsWith("data:image/")) {
                editor.putString("widget_last_photo_data", photoDataUrl)
                editor.putString("widget_last_photo_mood", mood.toString())
                editor.putString("widget_last_photo_timestamp", timestamp.toString())
            }
            editor.apply()

            QuickMoodWidgetProvider.updateAllWidgets(context)
            PhotoMoodWidgetProvider.updateAllWidgets(context)
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
    }

    companion object {
        private const val REQUEST_SELECT_FILE = 2001
        private const val REQUEST_POST_NOTIFICATIONS = 2002
    }
}
