package com.planrova.app

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmModule"

    @ReactMethod
    fun getAlarms(promise: Promise) {
        val prefs = reactContext.getSharedPreferences("com.planrova.app.ALARM_PREFS", Context.MODE_PRIVATE)
        val alarmsJson = prefs.getString("alarms", "[]")
        promise.resolve(alarmsJson)
    }

    @ReactMethod
    fun saveAlarms(alarmsJson: String, promise: Promise) {
        Log.d("AlarmModule", "saveAlarms JSON: $alarmsJson")
        val prefs = reactContext.getSharedPreferences("com.planrova.app.ALARM_PREFS", Context.MODE_PRIVATE)
        prefs.edit().putString("alarms", alarmsJson).apply()
        
        // Reschedule alarms using new configuration in background thread to avoid blocking main thread
        Thread {
            AlarmScheduler.rescheduleAllAlarms(reactContext)
        }.start()
        
        promise.resolve(true)
    }

    @ReactMethod
    fun stopRinging(promise: Promise) {
        Log.d("AlarmModule", "stopRinging called")
        val intent = Intent(reactContext, AlarmService::class.java)
        reactContext.stopService(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun snoozeAlarm(alarmId: String, snoozeMinutes: Int, promise: Promise) {
        Log.d("AlarmModule", "snoozeAlarm called for $alarmId with interval $snoozeMinutes mins")
        val snoozeTriggerTime = System.currentTimeMillis() + (snoozeMinutes * 60 * 1000L)
        
        Thread {
            AlarmScheduler.scheduleAlarm(reactContext, alarmId, snoozeTriggerTime)
        }.start()

        val intent = Intent(reactContext, AlarmService::class.java)
        reactContext.stopService(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun getTriggeredAlarm(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity is AlarmActivity) {
            val alarmId = activity.intent.getStringExtra("alarm_id")
            promise.resolve(alarmId)
        } else {
            // Check if service has an active ringing alarm
            promise.resolve(AlarmService.activeAlarmId)
        }
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val map = Arguments.createMap()

        // 1. Exact Alarm Permission (Android 12+)
        var canScheduleExact = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            canScheduleExact = alarmManager.canScheduleExactAlarms()
        }
        map.putBoolean("canScheduleExactAlarms", canScheduleExact)

        // 2. Notifications Permission
        val notificationsEnabled = NotificationManagerCompat.from(reactContext).areNotificationsEnabled()
        map.putBoolean("areNotificationsEnabled", notificationsEnabled)

        // 3. Battery Optimizations Disabled
        val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        var isIgnoringBattery = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            isIgnoringBattery = pm.isIgnoringBatteryOptimizations(reactContext.packageName)
        }
        map.putBoolean("isIgnoringBatteryOptimizations", isIgnoringBattery)

        promise.resolve(map)
    }

    @ReactMethod
    fun requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (e: Exception) {
                Log.e("AlarmModule", "Error requesting exact alarm permission", e)
            }
        }
    }

    @ReactMethod
    fun requestDisableBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (e: Exception) {
                // Fallback to battery optimization settings page
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    reactContext.startActivity(intent)
                } catch (ex: Exception) {
                    Log.e("AlarmModule", "Error opening battery optimization settings", ex)
                }
            }
        }
    }
}
