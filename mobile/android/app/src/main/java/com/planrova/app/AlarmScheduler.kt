package com.planrova.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Calendar

object AlarmScheduler {
    private const val PREFS_NAME = "com.planrova.app.ALARM_PREFS"
    private const val ALARMS_KEY = "alarms"

    fun getAlarmDetails(context: Context, id: String): JSONObject? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val alarmsJsonString = prefs.getString(ALARMS_KEY, "[]") ?: "[]"
        try {
            val alarmsList = mutableListOf<JSONObject>()
            if (alarmsJsonString.trim().startsWith("{")) {
                val rootObj = JSONObject(alarmsJsonString)
                val customArray = rootObj.optJSONArray("alarmsList")
                if (customArray != null) {
                    for (i in 0 until customArray.length()) {
                        alarmsList.add(customArray.getJSONObject(i))
                    }
                }
                val legacyObj = rootObj.optJSONObject("alarms")
                if (legacyObj != null) {
                    val wakeTime = legacyObj.optString("wakeTime", "")
                    if (wakeTime.contains(":")) {
                        val parts = wakeTime.split(":")
                        val hour = parts[0].toIntOrNull() ?: 6
                        val minute = parts[1].toIntOrNull() ?: 30
                        
                        val ringtoneObj = legacyObj.optJSONObject("wakeRingtone")
                        val ringtoneKey = ringtoneObj?.optString("assetKey", "lofi") ?: "lofi"

                        val legacyAlarm = JSONObject().apply {
                            put("id", "legacy-wake")
                            put("hour", hour)
                            put("minute", minute)
                            put("enabled", legacyObj.optBoolean("wakeEnabled", false))
                            put("label", "Wake Up")
                            put("mission", legacyObj.optString("wakeMission", "none"))
                            put("ringtone", ringtoneKey)
                            put("days", JSONArray(listOf(1, 2, 3, 4, 5, 6, 7))) // daily
                            put("snoozeTime", 5)
                        }
                        alarmsList.add(legacyAlarm)
                    }
                }
            } else {
                val alarmsArray = JSONArray(alarmsJsonString)
                for (i in 0 until alarmsArray.length()) {
                    alarmsList.add(alarmsArray.getJSONObject(i))
                }
            }

            for (alarmObj in alarmsList) {
                if (alarmObj.optString("id") == id) {
                    return alarmObj
                }
            }
        } catch (e: Exception) {
            Log.e("AlarmScheduler", "Error reading alarm details for $id", e)
        }
        return null
    }

    fun scheduleAlarm(context: Context, id: String, triggerTimeMillis: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.planrova.app.ACTION_ALARM"
            putExtra("alarm_id", id)
        }

        val requestCode = id.hashCode()
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTimeMillis,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerTimeMillis,
                    pendingIntent
                )
            }
            Log.d("AlarmScheduler", "Scheduled exact doze-immune alarm for $id at $triggerTimeMillis")
        } catch (e: SecurityException) {
            Log.e("AlarmScheduler", "Permission check failed: Cannot schedule exact alarm", e)
        }
    }

    fun cancelAlarm(context: Context, id: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.planrova.app.ACTION_ALARM"
        }
        val requestCode = id.hashCode()
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
            Log.d("AlarmScheduler", "Cancelled scheduled alarm for $id")
        }
    }

    fun calculateNextTriggerTime(hour: Int, minute: Int, days: List<Int>): Long {
        val calendar = Calendar.getInstance()
        val now = System.currentTimeMillis()
        
        calendar.set(Calendar.HOUR_OF_DAY, hour)
        calendar.set(Calendar.MINUTE, minute)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)

        // If alarm time is in the past for today or days list is empty,
        // and we have no recurrence, schedule for tomorrow.
        if (days.isEmpty()) {
            if (calendar.timeInMillis <= now) {
                calendar.add(Calendar.DAY_OF_YEAR, 1)
            }
            return calendar.timeInMillis
        }

        // Repeating days: 1 = Sunday, 2 = Monday, ..., 7 = Saturday (Calendar constants)
        val currentDayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)
        var minDiff = Int.MAX_VALUE

        for (day in days) {
            var diff = day - currentDayOfWeek
            if (diff < 0) {
                diff += 7
            } else if (diff == 0 && calendar.timeInMillis <= now) {
                diff += 7
            }
            if (diff < minDiff) {
                minDiff = diff
            }
        }

        calendar.add(Calendar.DAY_OF_YEAR, minDiff)
        return calendar.timeInMillis
    }

    fun disableAlarmInPrefs(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val alarmsJsonString = prefs.getString(ALARMS_KEY, "[]") ?: "[]"
        try {
            if (alarmsJsonString.trim().startsWith("{")) {
                val rootObj = JSONObject(alarmsJsonString)
                val customArray = rootObj.optJSONArray("alarmsList")
                if (customArray != null) {
                    val updatedCustomArray = JSONArray()
                    for (i in 0 until customArray.length()) {
                        val alarmObj = customArray.getJSONObject(i)
                        if (alarmObj.optString("id") == id) {
                            alarmObj.put("enabled", false)
                        }
                        updatedCustomArray.put(alarmObj)
                    }
                    rootObj.put("alarmsList", updatedCustomArray)
                }
                
                val legacyObj = rootObj.optJSONObject("alarms")
                if (legacyObj != null && id == "legacy-wake") {
                    legacyObj.put("wakeEnabled", false)
                    rootObj.put("alarms", legacyObj)
                }
                prefs.edit().putString(ALARMS_KEY, rootObj.toString()).apply()
            } else {
                val alarmsArray = JSONArray(alarmsJsonString)
                val updatedArray = JSONArray()
                for (i in 0 until alarmsArray.length()) {
                    val alarmObj = alarmsArray.getJSONObject(i)
                    if (alarmObj.optString("id") == id) {
                        alarmObj.put("enabled", false)
                    }
                    updatedArray.put(alarmObj)
                }
                prefs.edit().putString(ALARMS_KEY, updatedArray.toString()).apply()
            }
            Log.d("AlarmScheduler", "Disabled one-time alarm $id in SharedPreferences")
        } catch (e: Exception) {
            Log.e("AlarmScheduler", "Error disabling alarm in prefs for $id", e)
        }
    }

    fun scheduleNextOccurrenceOfAlarm(context: Context, id: String) {
        val alarmDetails = getAlarmDetails(context, id) ?: return
        val enabled = alarmDetails.optBoolean("enabled", false)
        if (!enabled) return

        val hour = alarmDetails.optInt("hour", 0)
        val minute = alarmDetails.optInt("minute", 0)
        val daysArray = alarmDetails.optJSONArray("days")
        val daysList = mutableListOf<Int>()
        if (daysArray != null) {
            for (i in 0 until daysArray.length()) {
                daysList.add(daysArray.getInt(i))
            }
        }

        if (daysList.isNotEmpty()) {
            val nextTime = calculateNextTriggerTime(hour, minute, daysList)
            scheduleAlarm(context, id, nextTime)
            Log.d("AlarmScheduler", "Scheduled next repeating occurrence for $id at $nextTime")
        } else {
            disableAlarmInPrefs(context, id)
        }
    }

    fun rescheduleAllAlarms(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val alarmsJsonString = prefs.getString(ALARMS_KEY, "[]") ?: "[]"
        Log.d("AlarmScheduler", "Rescheduling all active alarms from prefs...")
        try {
            val alarmsList = mutableListOf<JSONObject>()
            if (alarmsJsonString.trim().startsWith("{")) {
                val rootObj = JSONObject(alarmsJsonString)
                val customArray = rootObj.optJSONArray("alarmsList")
                if (customArray != null) {
                    for (i in 0 until customArray.length()) {
                        alarmsList.add(customArray.getJSONObject(i))
                    }
                }
                val legacyObj = rootObj.optJSONObject("alarms")
                if (legacyObj != null && legacyObj.optBoolean("wakeEnabled", false)) {
                    val wakeTime = legacyObj.optString("wakeTime", "")
                    if (wakeTime.contains(":")) {
                        val parts = wakeTime.split(":")
                        val hour = parts[0].toIntOrNull() ?: 6
                        val minute = parts[1].toIntOrNull() ?: 30
                        
                        val ringtoneObj = legacyObj.optJSONObject("wakeRingtone")
                        val ringtoneKey = ringtoneObj?.optString("assetKey", "lofi") ?: "lofi"

                        val legacyAlarm = JSONObject().apply {
                            put("id", "legacy-wake")
                            put("hour", hour)
                            put("minute", minute)
                            put("enabled", true)
                            put("label", "Wake Up")
                            put("mission", legacyObj.optString("wakeMission", "none"))
                            put("ringtone", ringtoneKey)
                            put("days", JSONArray(listOf(1, 2, 3, 4, 5, 6, 7))) // daily
                            put("snoozeTime", 5)
                        }
                        alarmsList.add(legacyAlarm)
                    }
                }
            } else {
                val alarmsArray = JSONArray(alarmsJsonString)
                for (i in 0 until alarmsArray.length()) {
                    alarmsList.add(alarmsArray.getJSONObject(i))
                }
            }

            // Cancel all first
            for (alarmObj in alarmsList) {
                val id = alarmObj.optString("id", "")
                if (id.isNotEmpty()) {
                    cancelAlarm(context, id)
                }
            }

            // Schedule enabled ones
            for (alarmObj in alarmsList) {
                val id = alarmObj.optString("id", "")
                val enabled = alarmObj.optBoolean("enabled", false)
                if (enabled && id.isNotEmpty()) {
                    val hour = alarmObj.optInt("hour", 0)
                    val minute = alarmObj.optInt("minute", 0)
                    
                    val daysArray = alarmObj.optJSONArray("days")
                    val daysList = mutableListOf<Int>()
                    if (daysArray != null) {
                        for (j in 0 until daysArray.length()) {
                            daysList.add(daysArray.getInt(j))
                        }
                    }
                    
                    val triggerTime = calculateNextTriggerTime(hour, minute, daysList)
                    scheduleAlarm(context, id, triggerTime)
                }
            }
        } catch (e: Exception) {
            Log.e("AlarmScheduler", "Error rescheduling alarms", e)
        }
    }
}
