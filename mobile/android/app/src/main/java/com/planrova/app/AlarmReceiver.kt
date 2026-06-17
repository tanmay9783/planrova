package com.planrova.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra("alarm_id") ?: return
        Log.d("AlarmReceiver", "Alarm fired! alarm_id=$alarmId")

        // Acquire WakeLock to turn screen on and wake up CPU
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or
            PowerManager.ACQUIRE_CAUSES_WAKEUP or
            PowerManager.ON_AFTER_RELEASE,
            "Planrova:AlarmReceiverWakeLock"
        )
        // Acquire with a 60 second timeout to ensure it gets released even if service fails
        wakeLock.acquire(60_000L)
        Log.d("AlarmReceiver", "WakeLock acquired for 60 seconds")

        // 1. Direct Activity Launch if Overlay Permission is granted (bypasses background limitations)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M && android.provider.Settings.canDrawOverlays(context)) {
            try {
                val activityIntent = Intent(context, AlarmActivity::class.java).apply {
                    putExtra("alarm_id", alarmId)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                context.startActivity(activityIntent)
                Log.d("AlarmReceiver", "AlarmActivity started directly from AlarmReceiver")
            } catch (e: Exception) {
                Log.e("AlarmReceiver", "Failed to start AlarmActivity directly from receiver", e)
            }
        }

        // 2. Start Foreground Service
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra("alarm_id", alarmId)
        }

        try {
            ContextCompat.startForegroundService(context, serviceIntent)
            Log.d("AlarmReceiver", "Foreground AlarmService started successfully")
        } catch (e: Exception) {
            Log.e("AlarmReceiver", "Error starting Foreground AlarmService, playing fallback ringtone directly in receiver", e)
            try {
                val ringtoneUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
                val ringtone = android.media.RingtoneManager.getRingtone(context, ringtoneUri)
                ringtone.play()
            } catch (ex: Exception) {
                Log.e("AlarmReceiver", "Failed to play fallback ringtone in receiver", ex)
            }
        }
    }
}
