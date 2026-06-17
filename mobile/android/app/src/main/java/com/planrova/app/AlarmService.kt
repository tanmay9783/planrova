package com.planrova.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.IOException

class AlarmService : Service() {
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var alarmId: String? = null

    companion object {
        private const val CHANNEL_ID = "planrova_alarm_channel"
        private const val NOTIFICATION_ID = 9999
        var isRinging = false
        var activeAlarmId: String? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d("AlarmService", "AlarmService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getStringExtra("alarm_id") ?: return START_NOT_STICKY
        alarmId = id
        activeAlarmId = id
        isRinging = true
        Log.d("AlarmService", "AlarmService started for alarm $id")

        // Schedule next alarm immediately so we don't miss it if the device dies or service is killed
        AlarmScheduler.scheduleNextOccurrenceOfAlarm(this, id)

        // 1. Create Notification Channel
        createNotificationChannel()

        // 2. Build Fullscreen Pending Intent
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            putExtra("alarm_id", id)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            id.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        // 3. Build Dismiss & Snooze Pending Intents for Notification Actions
        val dismissIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = "com.planrova.app.ACTION_DISMISS"
            putExtra("alarm_id", id)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            this,
            id.hashCode() + 1,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        val snoozeIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = "com.planrova.app.ACTION_SNOOZE"
            putExtra("alarm_id", id)
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(
            this,
            id.hashCode() + 2,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        // Read saved alarm details
        val alarmDetails = AlarmScheduler.getAlarmDetails(this, id)
        val alarmLabel = alarmDetails?.optString("label")?.takeIf { it.isNotEmpty() } ?: "Alarm"
        val ringtoneKey = alarmDetails?.optString("ringtone") ?: "default"

        // 4. Build Notification
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(applicationContext.applicationInfo.icon)
            .setContentTitle(alarmLabel)
            .setContentText("Alarm is ringing! Tap to complete mission.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "Snooze", snoozePendingIntent)
            .addAction(0, "Dismiss", dismissPendingIntent)
            .build()

        // 5. Start Foreground Service
        var fgsSuccess = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
                fgsSuccess = true
            } catch (e: Exception) {
                Log.e("AlarmService", "Failed to start FGS with mediaPlayback type, trying standard FGS", e)
                try {
                    startForeground(NOTIFICATION_ID, notification)
                    fgsSuccess = true
                } catch (ex: Exception) {
                    Log.e("AlarmService", "Failed to start standard FGS as well", ex)
                }
            }
        } else {
            try {
                startForeground(NOTIFICATION_ID, notification)
                fgsSuccess = true
            } catch (e: Exception) {
                Log.e("AlarmService", "Failed to start FGS below Android Q", e)
            }
        }

        if (!fgsSuccess) {
            Log.e("AlarmService", "Failed to transition service into Foreground. Stopping self to avoid ANR/system crash.")
            stopSelf()
            return START_NOT_STICKY
        }

        // Direct Activity Launch if Overlay Permission is granted (bypasses background limitations)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && android.provider.Settings.canDrawOverlays(this)) {
            try {
                startActivity(fullScreenIntent)
                Log.d("AlarmService", "AlarmActivity started directly via startActivity because overlay permission is granted")
            } catch (e: Exception) {
                Log.e("AlarmService", "Failed to start AlarmActivity directly", e)
            }
        } else {
            Log.w("AlarmService", "Overlay permission not granted. Relying only on fullScreenIntent fallback.")
        }

        // 6. Play Alarm Sound
        playAlarmSound(ringtoneKey)

        // 7. Start Vibration
        startVibration()

        return START_STICKY
    }

    private fun playAlarmSound(ringtoneKey: String) {
        stopAlarmSound()

        val uri = getRingtoneUri(ringtoneKey)
        mediaPlayer = MediaPlayer().apply {
            try {
                setDataSource(this@AlarmService, uri)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                } else {
                    @Suppress("DEPRECATION")
                    setAudioStreamType(AudioManager.STREAM_ALARM)
                }
                isLooping = true
                prepare()
                start()
                Log.d("AlarmService", "Playing alarm ringtone: $uri")
            } catch (e: Exception) {
                Log.e("AlarmService", "Failed to play ringtone, falling back to default alarm ringtone", e)
                try {
                    reset()
                    setDataSource(this@AlarmService, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build()
                        )
                    } else {
                        @Suppress("DEPRECATION")
                        setAudioStreamType(AudioManager.STREAM_ALARM)
                    }
                    isLooping = true
                    prepare()
                    start()
                } catch (e2: Exception) {
                    Log.e("AlarmService", "Default alarm fallback failed as well", e2)
                }
            }
        }
    }

    private fun getRingtoneUri(ringtoneKey: String): Uri {
        val resName = when (ringtoneKey.lowercase()) {
            "lofi" -> "lofi"
            "rain" -> "rain"
            "sitar" -> "sitar"
            "tapri" -> "tapri"
            else -> null
        }

        if (resName != null) {
            val resId = resources.getIdentifier(resName, "raw", packageName)
            if (resId != 0) {
                return Uri.parse("android.resource://$packageName/$resId")
            }
        }
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    }

    private fun stopAlarmSound() {
        mediaPlayer?.let {
            try {
                if (it.isPlaying) {
                    it.stop()
                }
            } catch (e: Exception) {
                // ignore
            }
            it.release()
        }
        mediaPlayer = null
    }

    private fun startVibration() {
        stopVibration()
        val vibratorService = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (e: Exception) {
            null
        }
        vibrator = vibratorService

        if (vibratorService != null && vibratorService.hasVibrator()) {
            val pattern = longArrayOf(0, 500, 500) // start immediately, 500ms on, 500ms off
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibratorService.vibrate(VibrationEffect.createWaveform(pattern, 0)) // repeat index 0
            } else {
                @Suppress("DEPRECATION")
                vibratorService.vibrate(pattern, 0)
            }
        }
    }

    private fun stopVibration() {
        vibrator?.cancel()
        vibrator = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Planrova Alarm Channel",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Foreground channel for Planrova alarms"
                enableLights(true)
                enableVibration(false) // Vibrate handled manually
                setSound(null, null) // Silent notification because we play manually via USAGE_ALARM stream
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setAllowBubbles(false)
                }
            }
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAlarmSound()
        stopVibration()
        isRinging = false
        activeAlarmId = null
        
        // Notify any active AlarmActivity to finish
        sendBroadcast(Intent("com.planrova.app.ACTION_DISMISS_UI"))
        Log.d("AlarmService", "AlarmService destroyed")
    }
}
