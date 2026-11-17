package com.minimal.moodtracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import android.util.Base64
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 2x2 photo + quick-add home screen widget showing the latest photo entry and mood badge.
 */
class PhotoMoodWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (
            intent.action == ACTION_REFRESH_WIDGET ||
            intent.action == QuickMoodWidgetProvider.ACTION_REFRESH_WIDGET
        ) {
            updateAllWidgets(context)
        }
    }

    companion object {
        const val EXTRA_OPEN_SHEET = "com.minimal.moodtracker.EXTRA_OPEN_SHEET"
        const val ACTION_REFRESH_WIDGET = "com.minimal.moodtracker.ACTION_REFRESH_PHOTO_WIDGET"

        private const val PREFS_NAME = "CapacitorStorage"
        private const val KEY_LAST_PHOTO_DATA = "widget_last_photo_data"
        private const val KEY_LAST_PHOTO_MOOD = "widget_last_photo_mood"
        private const val KEY_LAST_PHOTO_TIMESTAMP = "widget_last_photo_timestamp"

        private const val REQUEST_CODE_OPEN_APP = 100
        private const val REQUEST_CODE_ADD_ENTRY = 101

        private val MOOD_COLORS = mapOf(
            5 to Color.parseColor("#E5A93C"),
            4 to Color.parseColor("#68B088"),
            3 to Color.parseColor("#729BBE"),
            2 to Color.parseColor("#8E7DBE"),
            1 to Color.parseColor("#C97076")
        )

        /**
         * Refreshes all active instances of the 2x2 photo mood widget.
         */
        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, PhotoMoodWidgetProvider::class.java)
            val widgetIds = manager.getAppWidgetIds(componentName)
            for (widgetId in widgetIds) {
                updateAppWidget(context, manager, widgetId)
            }
        }

        private fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_photo_mood)

            val photoBitmap = decodePhotoBitmap(readStringPref(context, KEY_LAST_PHOTO_DATA))
            val moodLevel = readLastPhotoMood(context)
            val timestamp = readLastPhotoTimestamp(context)

            if (photoBitmap != null) {
                views.setImageViewBitmap(R.id.widget_photo_img, photoBitmap)
            } else {
                views.setImageViewBitmap(R.id.widget_photo_img, createEmptyPlaceholderBitmap(context))
            }

            if (timestamp != null || moodLevel != null) {
                val resolvedMood = moodLevel ?: 4
                val baseColor = MOOD_COLORS[resolvedMood] ?: MOOD_COLORS.getValue(4)
                val badgeColor = Color.argb(
                    230,
                    Color.red(baseColor),
                    Color.green(baseColor),
                    Color.blue(baseColor)
                )

                views.setViewVisibility(R.id.widget_mood_badge, View.VISIBLE)
                views.setInt(R.id.widget_mood_badge, "setBackgroundColor", badgeColor)
                views.setImageViewBitmap(
                    R.id.widget_badge_icon,
                    createMoodBadgeIconBitmap(context, resolvedMood)
                )

                if (timestamp != null) {
                    val date = Date(timestamp)
                    val dateFormat = SimpleDateFormat("M月d日", Locale.JAPAN)
                    val timeFormat = SimpleDateFormat("HH:mm", Locale.JAPAN)
                    views.setTextViewText(R.id.widget_badge_date, dateFormat.format(date))
                    views.setTextViewText(R.id.widget_badge_time, timeFormat.format(date))
                    views.setViewVisibility(R.id.widget_badge_date, View.VISIBLE)
                    views.setViewVisibility(R.id.widget_badge_time, View.VISIBLE)
                } else {
                    views.setViewVisibility(R.id.widget_badge_date, View.GONE)
                    views.setViewVisibility(R.id.widget_badge_time, View.GONE)
                }
            } else {
                views.setViewVisibility(R.id.widget_mood_badge, View.GONE)
            }

            views.setImageViewBitmap(R.id.widget_btn_add_entry, createAddButtonBitmap(context))
            views.setOnClickPendingIntent(R.id.widget_photo_root, createOpenAppPendingIntent(context))
            views.setOnClickPendingIntent(R.id.widget_btn_add_entry, createAddEntryPendingIntent(context))

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun createOpenAppPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            return PendingIntent.getActivity(
                context,
                REQUEST_CODE_OPEN_APP,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun createAddEntryPendingIntent(context: Context): PendingIntent {
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("moodtracker://quick-entry?openSheet=1"),
                context,
                MainActivity::class.java
            ).apply {
                putExtra(EXTRA_OPEN_SHEET, true)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            return PendingIntent.getActivity(
                context,
                REQUEST_CODE_ADD_ENTRY,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun readStringPref(context: Context, key: String): String? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.all[key] as? String
        }

        private fun readLastPhotoMood(context: Context): Int? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val rawValue = prefs.all[KEY_LAST_PHOTO_MOOD] ?: return null
            val parsed = when (rawValue) {
                is Number -> rawValue.toInt()
                is String -> rawValue.trim().toIntOrNull()
                else -> null
            }
            return parsed?.takeIf { it in 1..5 }
        }

        private fun readLastPhotoTimestamp(context: Context): Long? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val rawValue = prefs.all[KEY_LAST_PHOTO_TIMESTAMP] ?: return null
            val parsed = when (rawValue) {
                is Number -> rawValue.toLong()
                is String -> rawValue.trim().toLongOrNull()
                    ?: rawValue.trim().toDoubleOrNull()?.toLong()
                else -> null
            }
            return parsed?.takeIf { it > 0L }
        }

        private fun decodePhotoBitmap(rawData: String?): Bitmap? {
            if (rawData.isNullOrBlank()) return null
            val base64Part = rawData.trim().let { value ->
                val markerIndex = value.indexOf("base64,")
                if (markerIndex >= 0) value.substring(markerIndex + 7) else value
            }
            if (base64Part.isBlank()) return null

            return try {
                val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                if (bytes.isEmpty()) return null

                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

                val maxDim = 640
                var sampleSize = 1
                while (bounds.outWidth / sampleSize > maxDim || bounds.outHeight / sampleSize > maxDim) {
                    sampleSize *= 2
                }

                val decodeOptions = BitmapFactory.Options().apply {
                    inSampleSize = sampleSize
                    inPreferredConfig = Bitmap.Config.RGB_565
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions)
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: OutOfMemoryError) {
                null
            }
        }

        private fun createEmptyPlaceholderBitmap(context: Context): Bitmap {
            val density = context.resources.displayMetrics.density
            val sizePx = (160f * density).toInt().coerceAtLeast(240)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.parseColor("#18181B"))

            val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                strokeWidth = 2f * density
                color = Color.parseColor("#3F3F46")
            }

            val cx = sizePx / 2f
            val cy = sizePx / 2f
            val halfW = sizePx * 0.14f
            val halfH = sizePx * 0.10f
            val frame = RectF(cx - halfW, cy - halfH, cx + halfW, cy + halfH)
            canvas.drawRoundRect(frame, 4f * density, 4f * density, strokePaint)
            canvas.drawCircle(cx, cy, sizePx * 0.045f, strokePaint)

            return bitmap
        }

        private fun createAddButtonBitmap(context: Context): Bitmap {
            val density = context.resources.displayMetrics.density
            val sizePx = (40f * density).toInt().coerceAtLeast(64)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            val center = sizePx / 2f
            val radius = sizePx * 0.46f

            val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = Color.argb(204, 18, 18, 22)
            }
            canvas.drawCircle(center, center, radius, bgPaint)

            val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 1.2f * density
                color = Color.argb(56, 255, 255, 255)
            }
            canvas.drawCircle(center, center, radius - borderPaint.strokeWidth / 2f, borderPaint)

            val plusPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeWidth = 2.2f * density
                color = Color.WHITE
            }
            val arm = sizePx * 0.20f
            canvas.drawLine(center - arm, center, center + arm, center, plusPaint)
            canvas.drawLine(center, center - arm, center, center + arm, plusPaint)

            return bitmap
        }

        private fun createMoodBadgeIconBitmap(context: Context, level: Int): Bitmap {
            val density = context.resources.displayMetrics.density
            val sizePx = (18f * density).toInt().coerceAtLeast(24)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            val center = sizePx / 2f
            val baseRadius = sizePx * 0.38f

            val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                strokeWidth = 1.6f * density
                color = Color.WHITE
            }

            val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = Color.WHITE
            }

            canvas.drawCircle(center, center, baseRadius, strokePaint)

            val eyeOffsetX = baseRadius * 0.34f
            val eyeOffsetY = baseRadius * 0.22f
            val eyeRadius = (1.0f * density).coerceAtLeast(1.2f)
            canvas.drawCircle(center - eyeOffsetX, center - eyeOffsetY, eyeRadius, dotPaint)
            canvas.drawCircle(center + eyeOffsetX, center - eyeOffsetY, eyeRadius, dotPaint)

            val mouthWidth = baseRadius * 0.44f
            val mouthPath = Path()
            when (level) {
                5 -> {
                    val oval = RectF(
                        center - mouthWidth,
                        center - baseRadius * 0.08f,
                        center + mouthWidth,
                        center + baseRadius * 0.56f
                    )
                    canvas.drawArc(oval, 10f, 160f, false, strokePaint)
                }
                4 -> {
                    val oval = RectF(
                        center - mouthWidth * 0.9f,
                        center + baseRadius * 0.02f,
                        center + mouthWidth * 0.9f,
                        center + baseRadius * 0.46f
                    )
                    canvas.drawArc(oval, 15f, 150f, false, strokePaint)
                }
                3 -> {
                    val y = center + baseRadius * 0.30f
                    mouthPath.moveTo(center - mouthWidth * 0.8f, y)
                    mouthPath.lineTo(center + mouthWidth * 0.8f, y)
                    canvas.drawPath(mouthPath, strokePaint)
                }
                2 -> {
                    val oval = RectF(
                        center - mouthWidth * 0.9f,
                        center + baseRadius * 0.20f,
                        center + mouthWidth * 0.9f,
                        center + baseRadius * 0.64f
                    )
                    canvas.drawArc(oval, 195f, 150f, false, strokePaint)
                }
                else -> {
                    val oval = RectF(
                        center - mouthWidth,
                        center + baseRadius * 0.14f,
                        center + mouthWidth,
                        center + baseRadius * 0.72f
                    )
                    canvas.drawArc(oval, 190f, 160f, false, strokePaint)
                }
            }

            return bitmap
        }
    }
}
