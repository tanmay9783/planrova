package com.planrova.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AlarmActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val alarmId = intent.getStringExtra("alarm_id") ?: return
        Log.d("AlarmActionReceiver", "Received action $action for alarm $alarmId")

        if (action == "com.planrova.app.ACTION_DISMISS") {
            // Stop ringing service
            val serviceIntent = Intent(context, AlarmService::class.java)
            context.stopService(serviceIntent)
            Log.d("AlarmActionReceiver", "Alarm service stopped via Dismiss action")
        } else if (action == "com.planrova.app.ACTION_SNOOZE") {
            // Get snooze settings from preferences, default to 5 minutes
            val alarmDetails = AlarmScheduler.getAlarmDetails(context, alarmId)
            val snoozeMinutes = alarmDetails?.optInt("snoozeTime")?.takeIf { it > 0 } ?: 5
            
            // Calculate next trigger time for snooze (now + snoozeMinutes)
            val snoozeTriggerTime = System.currentTimeMillis() + (snoozeMinutes * 60 * 1000L)
            
            // Schedule the snooze exact alarm
            AlarmScheduler.scheduleAlarm(context, alarmId, snoozeTriggerTime)
            Log.d("AlarmActionReceiver", "Alarm $alarmId snoozed for $snoozeMinutes minutes")

            // Stop current ringing service
            val serviceIntent = Intent(context, AlarmService::class.java)
            context.stopService(serviceIntent)
        }
    }
}
