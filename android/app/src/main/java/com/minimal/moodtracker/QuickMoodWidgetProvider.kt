package com.minimal.moodtracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import android.widget.RemoteViews

/**
 * 4x1 minimal key-color + outline icon home screen widget for quick mood logging.
 */
class QuickMoodWidgetProvider : AppWidgetProvider() {

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
        if (intent.action == ACTION_REFRESH_WIDGET) {
            updateAllWidgets(context)
        }
    }

    companion object {
        const val EXTRA_MOOD_LEVEL = "com.minimal.moodtracker.EXTRA_MOOD_LEVEL"
        const val ACTION_REFRESH_WIDGET = "com.minimal.moodtracker.ACTION_REFRESH_WIDGET"
        private const val PREFS_NAME = "CapacitorStorage"
        private const val KEY_LAST_MOOD = "widget_last_mood"

        private val BUTTON_IDS = mapOf(
            5 to R.id.btn_mood_5,
            4 to R.id.btn_mood_4,
            3 to R.id.btn_mood_3,
            2 to R.id.btn_mood_2,
            1 to R.id.btn_mood_1
        )

        /**
         * Refreshes all active instances of the quick mood widget.
         */
        fun updateAllWidgets(context: Context) {
            val appContext = context.applicationContext
            val manager = AppWidgetManager.getInstance(appContext)
            val componentName = ComponentName(appContext, QuickMoodWidgetProvider::class.java)
            val widgetIds = manager.getAppWidgetIds(componentName)
            for (widgetId in widgetIds) {
                updateAppWidget(appContext, manager, widgetId)
            }
        }

        private fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_quick_mood)
            val lastMood = readLastMood(context)

            for ((level, buttonId) in BUTTON_IDS) {
                val pendingIntent = createMoodPendingIntent(context, level)
                views.setOnClickPendingIntent(buttonId, pendingIntent)

                val isSelected = (level == lastMood)
                val iconBitmap = createMoodOutlineBitmap(context, level, isSelected)
                views.setImageViewBitmap(buttonId, iconBitmap)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun createMoodPendingIntent(context: Context, level: Int): PendingIntent {
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("moodtracker://quick-entry?mood=$level"),
                context,
                MainActivity::class.java
            ).apply {
                putExtra(EXTRA_MOOD_LEVEL, level)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

            return PendingIntent.getActivity(
                context,
                level,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun readLastMood(context: Context): Int? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val rawValue = prefs.all[KEY_LAST_MOOD] ?: return null
            val parsed = when (rawValue) {
                is Number -> rawValue.toInt()
                is String -> rawValue.trim().toIntOrNull()
                else -> null
            }
            return parsed?.takeIf { it in 1..5 }
        }

        /**
         * Draws a crisp white outline icon so XML android:tint applies the exact key color.
         */
        private fun createMoodOutlineBitmap(
            context: Context,
            level: Int,
            isHighlighted: Boolean
        ): Bitmap {
            val density = context.resources.displayMetrics.density
            val sizePx = (40f * density).toInt().coerceAtLeast(48)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            val center = sizePx / 2f
            val baseRadius = sizePx * 0.30f

            if (isHighlighted) {
                val haloFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.argb(42, 255, 255, 255)
                }
                canvas.drawCircle(center, center, sizePx * 0.44f, haloFillPaint)

                val haloStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = 1.5f * density
                    color = Color.argb(180, 255, 255, 255)
                }
                canvas.drawCircle(center, center, sizePx * 0.44f, haloStrokePaint)
            }

            val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                strokeWidth = (if (isHighlighted) 2.2f else 1.8f) * density
                color = if (isHighlighted) Color.WHITE else Color.argb(220, 255, 255, 255)
            }

            val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = strokePaint.color
            }

            // Outer face circle
            canvas.drawCircle(center, center, baseRadius, strokePaint)

            // Eyes
            val eyeOffsetX = baseRadius * 0.34f
            val eyeOffsetY = baseRadius * 0.22f
            val eyeRadius = (1.3f * density).coerceAtLeast(1.5f)
            canvas.drawCircle(center - eyeOffsetX, center - eyeOffsetY, eyeRadius, dotPaint)
            canvas.drawCircle(center + eyeOffsetX, center - eyeOffsetY, eyeRadius, dotPaint)

            // Mouth expression per mood level (5 = highest, 1 = lowest)
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
