import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermission() {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Set up Android channel if needed
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C2A878',
    });
  }

  return true;
}

/**
 * Schedule periodic hydration reminders (every 2 hours)
 */
export async function scheduleWaterReminders() {
  if (Platform.OS === 'web') return;
  
  // Cancel previous water reminders first
  await cancelReminders('water');

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Drink Water",
      body: "Time to take a sip! Keep your brain active for your next study session.",
      data: { type: 'water' },
    },
    trigger: {
      type: 'timeInterval',
      channelId: 'default',
      seconds: 7200, // 2 hours
      repeats: true,
    },
  });
}

/**
 * Schedule habit checkpoints (daily nudges)
 */
export async function scheduleHabitNudges() {
  if (Platform.OS === 'web') return;

  await cancelReminders('habits');

  // Nudge every day at 18:00
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Routine Check",
      body: "Have you checked off your daily habits today? Planory is waiting!",
      data: { type: 'habits' },
    },
    trigger: {
      type: 'daily',
      channelId: 'default',
      hour: 18,
      minute: 0,
    },
  });
}

/**
 * Schedule study task reminders
 */
export async function scheduleFocusReminders() {
  if (Platform.OS === 'web') return;

  await cancelReminders('focus');

  // Trigger focus reminder at 10:00 AM daily
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Deep Focus Time",
      body: "Set your intention and start a 25-minute Pomodoro session now.",
      data: { type: 'focus' },
    },
    trigger: {
      type: 'daily',
      channelId: 'default',
      hour: 10,
      minute: 0,
    },
  });
}

/**
 * Schedule daily morning agenda reminders
 */
export async function scheduleDailyTaskReminders() {
  if (Platform.OS === 'web') return;
  await cancelReminders('tasks');

  // Trigger daily task reminder at 9:00 AM daily
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Today's Study Agenda 📝",
      body: "Good morning! You have study tasks scheduled for today. Open Planory to check off your targets.",
      data: { type: 'tasks' },
    },
    trigger: {
      type: 'daily',
      channelId: 'default',
      hour: 9,
      minute: 0,
    },
  });
}

/**
 * Schedule a one-shot notification for Pomodoro timer completion (resilient to background suspensions)
 */
export async function schedulePomodoroNotification(mode, secondsRemaining) {
  if (Platform.OS === 'web') return null;
  await cancelReminders('pomodoro');
  
  if (secondsRemaining <= 0) return null;

  const title = mode === 'work' ? "Study Session Completed! 🔔" : "Break Over! ☕";
  const body = mode === 'work' 
    ? "Excellent focus! Time to stand up, stretch, and log your achievements." 
    : "Your short break is complete. Time to start the next study round!";

  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'pomodoro' },
      sound: true,
    },
    trigger: {
      type: 'timeInterval',
      channelId: 'default',
      seconds: secondsRemaining,
    },
  });
}

/**
 * Schedule daily wind-down reminders at 9 PM (21:00)
 */
export async function scheduleWindDownNudges() {
  if (Platform.OS === 'web') return;
  await cancelReminders('winddown');

  // Trigger wind-down reminder at 9:00 PM (21:00) daily
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Cosmic Wind-Down Time 🌙",
      body: "It's 9 PM! Time to rate your day, carry over unfinished tasks, and preview tomorrow.",
      data: { type: 'winddown' },
    },
    trigger: {
      type: 'daily',
      channelId: 'default',
      hour: 21,
      minute: 0,
    },
  });
}

/**
 * Cancel specific category of scheduled notifications
 */
export async function cancelReminders(type) {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data && notif.content.data.type === type) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
