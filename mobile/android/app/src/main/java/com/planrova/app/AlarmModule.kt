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

        // 4. Overlay / System Alert Window Permission
        var canDrawOverlays = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canDrawOverlays = Settings.canDrawOverlays(reactContext)
        }
        map.putBoolean("canDrawOverlays", canDrawOverlays)

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

    @ReactMethod
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}")
                ).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (e: Exception) {
                Log.e("AlarmModule", "Error requesting overlay permission", e)
            }
        }
    }

    @ReactMethod
    fun requestMiuiPermission() {
        try {
            val intent = Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                putExtra("extra_pkgname", reactContext.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
            Log.d("AlarmModule", "Opened MIUI permission editor successfully")
        } catch (e: Exception) {
            Log.w("AlarmModule", "miui.intent.action.APP_PERM_EDITOR failed, falling back to standard App Settings", e)
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (ex: Exception) {
                Log.e("AlarmModule", "Error opening standard app details settings fallback", ex)
            }
        }
    }

    @ReactMethod
    fun requestAutostartPermission() {
        val intent = android.content.Intent()
        val components = arrayOf(
            // Xiaomi / POCO / Redmi
            android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            // Oppo / ColorOS / Realme
            android.content.ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            android.content.ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
            // Vivo
            android.content.ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
            android.content.ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            // Huawei
            android.content.ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
            android.content.ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
        )

        for (comp in components) {
            try {
                intent.component = comp
                intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                reactContext.startActivity(intent)
                Log.d("AlarmModule", "Successfully opened autostart settings via ComponentName: " + comp.className)
                return
            } catch (e: Exception) {
                // Try next one
            }
        }

        // Fallback to standard App Details page
        try {
            val intentFallback = android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intentFallback)
            Log.d("AlarmModule", "Opened standard App Settings fallback for autostart")
        } catch (ex: Exception) {
            Log.e("AlarmModule", "Error opening fallback settings for autostart", ex)
        }
    }
}
