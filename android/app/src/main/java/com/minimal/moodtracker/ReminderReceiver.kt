package com.minimal.moodtracker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import java.util.Calendar

/**
 * Handles native Android scheduled reminder alarms and system notifications.
 */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        when (action) {
            ACTION_TRIGGER_REMINDER -> {
                showNotification(context, isTest = false)
                // Reschedule for the next occurrence (tomorrow)
                scheduleAllReminders(context)
            }
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                scheduleAllReminders(context)
            }
        }
    }

    companion object {
        const val ACTION_TRIGGER_REMINDER = "com.minimal.moodtracker.ACTION_TRIGGER_REMINDER"
        private const val EXTRA_SLOT_TIME = "com.minimal.moodtracker.EXTRA_SLOT_TIME"

        private const val PREFS_NAME = "CapacitorStorage"
        private const val KEY_NOTIFICATIONS_ENABLED = "notifications_enabled"
        private const val KEY_NOTIFICATION_TIMES_CSV = "notification_times_csv"
        private const val KEY_SCHEDULED_CODES = "notification_scheduled_codes"

        const val CHANNEL_ID = "mood_reminders_channel"
        private const val CHANNEL_NAME = "Mood リマインダー"
        private const val CHANNEL_DESC = "毎日の気分・体感記録のリマインダー通知"

        private const val NOTIFICATION_ID_REMINDER = 4001
        private const val NOTIFICATION_ID_TEST = 4002
        private const val BASE_ALARM_REQUEST_CODE = 5000

        fun createNotificationChannel(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing != null) return

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = CHANNEL_DESC
                enableLights(true)
                lightColor = Color.parseColor("#68B088")
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        fun hasNotificationPermission(context: Context): Boolean {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return false
            if (!manager.areNotificationsEnabled()) {
                return false
            }
            if (Build.VERSION.SDK_INT >= 33) {
                val granted = context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") ==
                    PackageManager.PERMISSION_GRANTED
                if (!granted) return false
            }
            return true
        }

        fun showNotification(context: Context, isTest: Boolean): Boolean {
            createNotificationChannel(context)
            if (!hasNotificationPermission(context)) {
                return false
            }

            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return false

            val openIntent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("moodtracker://quick-entry?openSheet=1"),
                context,
                MainActivity::class.java
            ).apply {
                putExtra(PhotoMoodWidgetProvider.EXTRA_OPEN_SHEET, true)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                if (isTest) NOTIFICATION_ID_TEST else NOTIFICATION_ID_REMINDER,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val title = "Mood"
            val body = if (isTest) {
                "テスト通知：タップして今の気分・体感を記録"
            } else {
                "今の気分・体感をワンタップで記録"
            }

            val notification = Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_mood)
                .setContentTitle(title)
                .setContentText(body)
                .setColor(Color.parseColor("#68B088"))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build()

            manager.notify(
                if (isTest) NOTIFICATION_ID_TEST else NOTIFICATION_ID_REMINDER,
                notification
            )
            return true
        }

        fun saveAndSchedule(context: Context, enabled: Boolean, timesCsv: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean(KEY_NOTIFICATIONS_ENABLED, enabled)
                .putString(KEY_NOTIFICATION_TIMES_CSV, timesCsv)
                .apply()
            scheduleAllReminders(context)
        }

        fun isRemindersEnabledInPrefs(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_NOTIFICATIONS_ENABLED, true)
        }

        fun scheduleAllReminders(context: Context) {
            createNotificationChannel(context)
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                ?: return
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // Cancel previously scheduled alarms
            val oldCodesCsv = prefs.getString(KEY_SCHEDULED_CODES, "") ?: ""
            if (oldCodesCsv.isNotBlank()) {
                oldCodesCsv.split(",")
                    .mapNotNull { it.trim().toIntOrNull() }
                    .forEach { code ->
                        val cancelIntent = Intent(context, ReminderReceiver::class.java).apply {
                            action = ACTION_TRIGGER_REMINDER
                        }
                        val pi = PendingIntent.getBroadcast(
                            context,
                            code,
                            cancelIntent,
                            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
                        )
                        if (pi != null) {
                            alarmManager.cancel(pi)
                            pi.cancel()
                        }
                    }
            }

            val enabled = prefs.getBoolean(KEY_NOTIFICATIONS_ENABLED, false)
            val timesCsv = prefs.getString(KEY_NOTIFICATION_TIMES_CSV, "") ?: ""
            if (!enabled || timesCsv.isBlank()) {
                prefs.edit().putString(KEY_SCHEDULED_CODES, "").apply()
                return
            }

            val now = System.currentTimeMillis()
            val scheduledCodes = mutableListOf<Int>()

            val slots = timesCsv.split(",")
                .map { it.trim() }
                .filter { it.matches(Regex("^\\d{2}:\\d{2}$")) }
                .distinct()

            for (slotTime in slots) {
                val parts = slotTime.split(":")
                val hour = parts[0].toIntOrNull() ?: continue
                val minute = parts[1].toIntOrNull() ?: continue
                if (hour !in 0..23 || minute !in 0..59) continue

                val requestCode = BASE_ALARM_REQUEST_CODE + hour * 60 + minute
                val calendar = Calendar.getInstance().apply {
                    timeInMillis = now
                    set(Calendar.HOUR_OF_DAY, hour)
                    set(Calendar.MINUTE, minute)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                    if (timeInMillis <= now) {
                        add(Calendar.DAY_OF_YEAR, 1)
                    }
                }

                val triggerIntent = Intent(context, ReminderReceiver::class.java).apply {
                    action = ACTION_TRIGGER_REMINDER
                    putExtra(EXTRA_SLOT_TIME, slotTime)
                }

                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    triggerIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val triggerAtMillis = calendar.timeInMillis
                try {
                    val canExact = if (Build.VERSION.SDK_INT >= 31) {
                        alarmManager.canScheduleExactAlarms()
                    } else {
                        true
                    }
                    if (canExact) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        )
                    } else {
                        alarmManager.setAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerAtMillis,
                            pendingIntent
                        )
                    }
                } catch (_: SecurityException) {
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    )
                }

                scheduledCodes.add(requestCode)
            }

            prefs.edit()
                .putString(KEY_SCHEDULED_CODES, scheduledCodes.joinToString(","))
                .apply()
        }
    }
}
