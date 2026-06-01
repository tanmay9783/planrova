import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  Modal, 
  TextInput, 
  Animated, 
  Vibration, 
  Alert, 
  Dimensions, 
  Platform,
  Easing,
  StatusBar,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission } from '../utils/notifications';
import { Accelerometer, Pedometer } from 'expo-sensors';

const { width, height } = Dimensions.get('window');

const SOUND_ASSETS = {
  rain: require('../../assets/music/rain.mp3'),
  tapri: require('../../assets/music/tapri.mp3'),
  sitar: require('../../assets/music/sitar.mp3'),
  lofi: require('../../assets/music/lofi.mp3')
};

const BUILT_IN_SOUNDS = [
  { id: 'lofi', name: 'Calm Lofi (Local)', type: 'local', assetKey: 'lofi' },
  { id: 'sitar', name: 'Zen Flute (Local)', type: 'local', assetKey: 'sitar' },
  { id: 'rain', name: 'Soothing Rain (Local)', type: 'local', assetKey: 'rain' },
  { id: 'tapri', name: 'Soft Cafe (Local)', type: 'local', assetKey: 'tapri' },
];

const MOTIVATIONAL_SENTENCES = [
  "Consistency is the path to academic mastery.",
  "Wake up with determination, sleep with satisfaction.",
  "Every small study session builds a massive future.",
  "Chai can wait, syllabus cannot wait today.",
  "Beat the snooze, win the morning semester."
];

export default function AlarmScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [activeTab, setActiveTab] = useState('alarm'); // 'alarm' or 'sleep'

  const formatTimeWithAmPm = (timeStr) => {
    if (!timeStr) return { time: '12:00', ampm: 'AM' };
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr);
    const m = parseInt(mStr);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = m.toString().padStart(2, '0');
    return {
      time: `${displayHour}:${displayMin}`,
      ampm
    };
  };

  const getLegacyWakeCountdown = () => {
    if (!alarms.wakeEnabled || !alarms.wakeTime) return 'Alarm disabled';
    const now = new Date();
    const [h, m] = alarms.wakeTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    const diffMs = target - now;
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours === 0) {
      return `in ${mins} min`;
    }
    return `in ${hours} hr ${mins} min`;
  };

  // Firestore sync for Alarms Configuration
  const [alarms, setAlarms] = useFirestoreData('daily_alarms', {
    wakeTime: '06:30',
    wakeEnabled: true,
    wakeMission: 'math', // math, shake, typing, walking, none
    waterTimes: ['09:00', '14:00', '19:00'],
    waterEnabled: true,
    mealBreakfast: '08:30',
    mealLunch: '13:00',
    mealDinner: '20:30',
    mealsEnabled: true,
    medicationTime: '21:30',
    medicationName: 'Vitamin B12',
    medicationDose: '1 tablet',
    medicationEnabled: false,
    windDownTime: '21:00',
    windDownEnabled: true,
    customRingtones: []
  });

  // Firestore sync for Sleep Logs
  const [sleepLogs, setSleepLogs] = useFirestoreData('sleep_logs', []);
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [semesterEvents] = useFirestoreData('semester_events', []);

  // Multiple Custom Alarms List
  const [alarmsList, setAlarmsList] = useFirestoreData('alarms_list', [
    {
      id: 'default-1',
      time: '07:00',
      enabled: true,
      mission: 'math',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      ringtone: { type: 'local', name: 'Calm Lofi (Local)', assetKey: 'lofi' }
    }
  ]);

  const [activeRingingAlarm, setActiveRingingAlarm] = useState(null);

  // ── Notification Permission (contextual, on first screen visit) ──────────
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // ── Schedule all enabled alarms as system notifications ──────────────────
  // This makes alarms work even when the app is closed/backgrounded.
  // ── Schedule all enabled alarms as system notifications ──────────────────
  // This makes alarms work even when the app is closed/backgrounded.
  const scheduleAlarmNotifications = async (list, legacyWakeAlarm) => {
    // Cancel all previously scheduled alarm notifications
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'alarm' || notif.content.data?.type === 'legacy-alarm') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    // 1. Schedule custom alarms from alarmsList
    for (const alarm of list) {
      if (!alarm.enabled) continue;
      const [h, m] = alarm.time.split(':').map(Number);

      if (alarm.days && alarm.days.length > 0) {
        // Schedule for each selected weekday
        for (const day of alarm.days) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `⏰ Alarm — ${alarm.time}`,
              body: alarm.mission !== 'none'
                ? `Wake up mission: ${alarm.mission.toUpperCase()}. Complete your task to earn XP!`
                : 'Time to wake up and start your day, grinder!',
              data: { type: 'alarm', alarmId: alarm.id },
              sound: true,
            },
            trigger: {
              type: 'weekly',
              channelId: 'default',
              weekday: dayMap[day] + 1, // Expo weekday is 1=Sun...7=Sat
              hour: h,
              minute: m,
            },
          });
        }
      } else {
        // Daily alarm (no specific days)
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Alarm — ${alarm.time}`,
            body: 'Time to wake up and start your day!',
            data: { type: 'alarm', alarmId: alarm.id },
            sound: true,
          },
          trigger: {
            type: 'daily',
            channelId: 'default',
            hour: h,
            minute: m,
          },
        });
      }
    }

    // 2. Schedule legacy wake alarm if enabled
    if (legacyWakeAlarm && legacyWakeAlarm.wakeEnabled && legacyWakeAlarm.wakeTime) {
      const [h, m] = legacyWakeAlarm.wakeTime.split(':').map(Number);
      // Schedule legacy alarm for every day of the week
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Wake Up — ${legacyWakeAlarm.wakeTime}`,
            body: legacyWakeAlarm.wakeMission !== 'none'
              ? `Wake up mission: ${legacyWakeAlarm.wakeMission.toUpperCase()}. Complete your task to earn XP!`
              : 'Time to wake up and start your day, grinder!',
            data: { type: 'alarm', alarmId: 'legacy-wake' },
            sound: true,
          },
          trigger: {
            type: 'weekly',
            channelId: 'default',
            weekday: dayMap[day] + 1, // 1=Sun...7=Sat
            hour: h,
            minute: m,
          },
        });
      }
    }
  };

  // Re-schedule routine notifications whenever routine configs change
  const scheduleRoutineNotifications = async (config) => {
    // Cancel existing routine notifications
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (['water', 'meal', 'medication', 'winddown'].includes(notif.content.data?.type)) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // 1. Schedule Water Reminders
    if (config.waterEnabled && config.waterTimes) {
      for (const timeStr of config.waterTimes) {
        const [h, m] = timeStr.split(':').map(Number);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "💧 Drink Water Reminder",
            body: "Keep your hydration streak active! Take a glass of water now.",
            data: { type: 'water' },
            sound: true,
          },
          trigger: {
            type: 'daily',
            channelId: 'default',
            hour: h,
            minute: m,
          },
        });
      }
    }

    // 2. Schedule Meals (Lunch Break)
    if (config.mealsEnabled && config.mealLunch) {
      const [h, m] = config.mealLunch.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🍲 Lunch Break Reminder",
          body: "Time for a healthy meal. Take a break from study!",
          data: { type: 'meal' },
          sound: true,
        },
        trigger: {
          type: 'daily',
          channelId: 'default',
          hour: h,
          minute: m,
        },
      });
    }

    // 3. Schedule Medication (Vitamins)
    if (config.medicationEnabled && config.medicationTime) {
      const [h, m] = config.medicationTime.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `💊 Vitamins Reminder — ${config.medicationName || 'Meds'}`,
          body: `Time to take your ${config.medicationName || 'dosage'} (${config.medicationDose || '1 tablet'}).`,
          data: { type: 'medication' },
          sound: true,
        },
        trigger: {
          type: 'daily',
          channelId: 'default',
          hour: h,
          minute: m,
        },
      });
    }

    // 4. Schedule Wind Down
    if (config.windDownEnabled && config.windDownTime) {
      const [h, m] = config.windDownTime.split(':').map(Number);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🌙 Cosmic Wind-Down Time",
          body: "Bhai, study is done for today. Time to rate your day and carry over tasks.",
          data: { type: 'winddown' },
          sound: true,
        },
        trigger: {
          type: 'daily',
          channelId: 'default',
          hour: h,
          minute: m,
        },
      });
    }
  };

  // Re-schedule notifications whenever alarm list or legacy wake alarm changes
  useEffect(() => {
    scheduleAlarmNotifications(alarmsList, alarms);
  }, [alarmsList, alarms.wakeTime, alarms.wakeEnabled, alarms.wakeMission]);

  // Re-schedule routine notifications whenever routine configs change
  useEffect(() => {
    if (alarms) {
      scheduleRoutineNotifications(alarms);
    }
  }, [
    alarms.waterEnabled,
    alarms.waterTimes,
    alarms.mealsEnabled,
    alarms.mealLunch,
    alarms.medicationEnabled,
    alarms.medicationTime,
    alarms.medicationName,
    alarms.medicationDose,
    alarms.windDownEnabled,
    alarms.windDownTime
  ]);

  // Modal & Form States for Custom Alarms
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState(null);
  const [editTimeHour, setEditTimeHour] = useState('07');
  const [editTimeMin, setEditTimeMin] = useState('00');
  const [editMission, setEditMission] = useState('none');
  const [editDays, setEditDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [editRingtone, setEditRingtone] = useState({
    type: 'local',
    name: 'Calm Lofi (Local)',
    assetKey: 'lofi'
  });

  const hourScrollRef = useRef(null);
  const minScrollRef = useRef(null);

  const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  useEffect(() => {
    if (showEditModal) {
      setTimeout(() => {
        const h = parseInt(editTimeHour) || 0;
        const m = parseInt(editTimeMin) || 0;
        if (hourScrollRef.current) {
          hourScrollRef.current.scrollTo({ y: h * 60, animated: false });
        }
        if (minScrollRef.current) {
          minScrollRef.current.scrollTo({ y: m * 60, animated: false });
        }
      }, 100);
    }
  }, [showEditModal]);

  const handleHourScrollEnd = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / 60);
    const clampedIndex = Math.max(0, Math.min(index, 23));
    setEditTimeHour(clampedIndex.toString().padStart(2, '0'));
  };

  const handleMinScrollEnd = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / 60);
    const clampedIndex = Math.max(0, Math.min(index, 59));
    setEditTimeMin(clampedIndex.toString().padStart(2, '0'));
  };

  const selectHourIndex = (index) => {
    setEditTimeHour(index.toString().padStart(2, '0'));
    if (hourScrollRef.current) {
      hourScrollRef.current.scrollTo({ y: index * 60, animated: true });
    }
  };

  const selectMinIndex = (index) => {
    setEditTimeMin(index.toString().padStart(2, '0'));
    if (minScrollRef.current) {
      minScrollRef.current.scrollTo({ y: index * 60, animated: true });
    }
  };

  // Screen UI States
  const [showRingingModal, setShowRingingModal] = useState(false);
  const [ringAlarmType, setRingAlarmType] = useState('wake'); // 'wake', 'water', 'meal', 'meds', 'winddown'
  
  // Mission Progress states
  const [mathProblems, setMathProblems] = useState([]);
  const [currentMathIdx, setCurrentMathIdx] = useState(0);
  const [mathAnswerInput, setMathAnswerInput] = useState('');
  
  const [shakeCount, setShakeCount] = useState(0);
  const [targetShakes] = useState(15);
  
  const [typingQuote, setTypingQuote] = useState('');
  const [typingInput, setTypingInput] = useState('');
  
  const [walkSteps, setWalkSteps] = useState(0);
  const [targetSteps] = useState(12);

  // Time & Volume progressive stats
  const [alarmProgressTime, setAlarmProgressTime] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0.05);

  // Sleep Logging States
  const [bedtimeInput, setBedtimeInput] = useState('22:30');
  const [waketimeInput, setWaketimeInput] = useState('06:30');
  const [sleepRatingInput, setSleepRatingInput] = useState(4);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const [nextAlarmData, setNextAlarmData] = useState(null);

  const getNextAlarm = () => {
    const now = new Date();
    const currentDayIdx = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    let upcomingAlarm = null;
    let minDiffMs = Infinity;

    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    // Include custom alarms from alarmsList
    const activeAlarms = alarmsList.filter(a => a.enabled);

    // Include the legacy wake alarm if enabled
    if (alarms.wakeEnabled && alarms.wakeTime) {
      activeAlarms.push({
        id: 'legacy-wake',
        time: alarms.wakeTime,
        enabled: true,
        mission: alarms.wakeMission || 'none',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], // daily
        ringtone: { name: 'Default Beep' },
        isLegacy: true
      });
    }

    activeAlarms.forEach(alarm => {
      const [h, m] = alarm.time.split(':').map(Number);
      
      const targetDays = alarm.days && alarm.days.length > 0 
        ? alarm.days.map(d => dayMap[d]) 
        : [0, 1, 2, 3, 4, 5, 6];

      targetDays.forEach(dayIdx => {
        let dayDiff = dayIdx - currentDayIdx;
        if (dayDiff < 0) {
          dayDiff += 7;
        }

        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + dayDiff);
        targetDate.setHours(h, m, 0, 0);

        if (targetDate <= now) {
          targetDate.setDate(targetDate.getDate() + 7);
        }

        const diffMs = targetDate - now;
        if (diffMs < minDiffMs) {
          minDiffMs = diffMs;
          upcomingAlarm = {
            alarm,
            targetDate,
            diffMs
          };
        }
      });
    });

    return upcomingAlarm;
  };

  const updateNextAlarm = () => {
    const next = getNextAlarm();
    setNextAlarmData(next);
  };

  useEffect(() => {
    updateNextAlarm();
    const interval = setInterval(updateNextAlarm, 30000);
    return () => clearInterval(interval);
  }, [alarmsList, alarms]);

  // Listen for background & foreground notifications
  useEffect(() => {
    // 1. Listen for notifications received in foreground
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data) {
        if (data.type === 'alarm') {
          const alarmId = data.alarmId;
          if (alarmId === 'legacy-wake') {
            if (!showRingingModal) {
              triggerAlarm('wake', null);
            }
          } else {
            const matchingAlarm = alarmsList.find(a => a.id === alarmId);
            if (!showRingingModal) {
              triggerAlarm('wake', matchingAlarm || null);
            }
          }
        } else if (['water', 'meal', 'medication', 'winddown'].includes(data.type)) {
          const alarmType = data.type === 'medication' ? 'meds' : data.type;
          if (!showRingingModal) {
            triggerAlarm(alarmType);
          }
        }
      }
    });

    // 2. Listen for notification clicks (response received)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data) {
        if (data.type === 'alarm') {
          const alarmId = data.alarmId;
          if (alarmId === 'legacy-wake') {
            if (!showRingingModal) {
              triggerAlarm('wake', null);
            }
          } else {
            const matchingAlarm = alarmsList.find(a => a.id === alarmId);
            if (!showRingingModal) {
              triggerAlarm('wake', matchingAlarm || null);
            }
          }
        } else if (['water', 'meal', 'medication', 'winddown'].includes(data.type)) {
          const alarmType = data.type === 'medication' ? 'meds' : data.type;
          if (!showRingingModal) {
            triggerAlarm(alarmType);
          }
        }
      }
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }, [alarmsList, showRingingModal]);

  const formatCountdown = (diffMs) => {
    if (!diffMs || diffMs === Infinity) return '';
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours === 0) {
      return `Fires in ${mins}m`;
    }
    return `Fires in ${hours}h ${mins}m`;
  };

  const handleEditAlarmPress = (alarm) => {
    setEditingAlarm(alarm);
    const [h, m] = alarm.time.split(':');
    setEditTimeHour(h || '07');
    setEditTimeMin(m || '00');
    setEditMission(alarm.mission || 'none');
    setEditDays(alarm.days || []);
    setEditRingtone(alarm.ringtone || {
      type: 'default',
      name: 'Default Beep (Mixkit)',
      uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav'
    });
    setShowEditModal(true);
  };

  const handleEditHeroAlarm = () => {
    setEditingAlarm('hero');
    const [h, m] = alarms.wakeTime.split(':');
    setEditTimeHour(h || '06');
    setEditTimeMin(m || '30');
    setEditMission(alarms.wakeMission || 'math');
    setEditDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    setEditRingtone(alarms.wakeRingtone || {
      type: 'local',
      name: 'Calm Lofi (Local)',
      assetKey: 'lofi'
    });
    setShowEditModal(true);
  };

  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState(''); // 'water', 'meal', 'medication'
  
  const [routineWaterTimesStr, setRoutineWaterTimesStr] = useState('09:00, 14:00, 19:00');
  const [routineBreakfastTime, setRoutineBreakfastTime] = useState('08:30');
  const [routineLunchTime, setRoutineLunchTime] = useState('13:00');
  const [routineDinnerTime, setRoutineDinnerTime] = useState('20:30');
  const [routineMedsTime, setRoutineMedsTime] = useState('21:30');
  const [routineMedsName, setRoutineMedsName] = useState('Vitamin B12');
  const [routineMedsDose, setRoutineMedsDose] = useState('1 tablet');

  const handleEditRoutinePress = (type) => {
    setSelectedRoutine(type);
    if (type === 'water') {
      setRoutineWaterTimesStr((alarms.waterTimes || []).join(', '));
    } else if (type === 'meal') {
      setRoutineBreakfastTime(alarms.mealBreakfast || '08:30');
      setRoutineLunchTime(alarms.mealLunch || '13:00');
      setRoutineDinnerTime(alarms.mealDinner || '20:30');
    } else if (type === 'medication') {
      setRoutineMedsTime(alarms.medicationTime || '21:30');
      setRoutineMedsName(alarms.medicationName || 'Vitamin B12');
      setRoutineMedsDose(alarms.medicationDose || '1 tablet');
    }
    setShowRoutineModal(true);
  };

  const handleSaveRoutine = () => {
    if (selectedRoutine === 'water') {
      const times = routineWaterTimesStr.split(',')
        .map(t => t.trim())
        .filter(t => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t));
      
      if (times.length === 0) {
        Alert.alert("Invalid Times", "Please specify at least one valid 24-hour time format (e.g. 09:00, 14:30).");
        return;
      }
      setAlarms({
        ...alarms,
        waterTimes: times
      });
      Alert.alert("Water Reminder Saved 🎉", `Hydration scheduled for: ${times.join(', ')}.`);
    } else if (selectedRoutine === 'meal') {
      const validateTime = (t) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t);
      if (!validateTime(routineBreakfastTime) || !validateTime(routineLunchTime) || !validateTime(routineDinnerTime)) {
        Alert.alert("Invalid Times", "All meal times must be in 24-hour format (e.g., 13:00).");
        return;
      }
      setAlarms({
        ...alarms,
        mealBreakfast: routineBreakfastTime,
        mealLunch: routineLunchTime,
        mealDinner: routineDinnerTime
      });
      Alert.alert("Meal Times Saved 🎉", "Breakfast, lunch, and dinner reminder schedules updated.");
    } else if (selectedRoutine === 'medication') {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(routineMedsTime)) {
        Alert.alert("Invalid Time", "Medication time must be in 24-hour format (e.g., 21:30).");
        return;
      }
      if (!routineMedsName.trim()) {
        Alert.alert("Invalid Name", "Please specify a medication name.");
        return;
      }
      setAlarms({
        ...alarms,
        medicationTime: routineMedsTime,
        medicationName: routineMedsName,
        medicationDose: routineMedsDose
      });
      Alert.alert("Vitamins Reminder Saved 🎉", `Vitamins schedule set for ${routineMedsTime}.`);
    }
    setShowRoutineModal(false);
  };

  // Animations
  const soundRef = useRef(null);
  const previewPlayerRef = useRef(null);
  const lastTriggeredMinRef = useRef('');
  const ringScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressTimerRef = useRef(null);
  const audioIntervalRef = useRef(null);

  // Audio ringtone preview system
  const playRingtonePreview = async (tone) => {
    try {
      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.pause();
        } catch (e) {}
        previewPlayerRef.current = null;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      let source = SOUND_ASSETS.lofi;
      if (tone.type === 'file' && tone.uri) {
        source = tone.uri;
      } else if (tone.type === 'local' && tone.assetKey && SOUND_ASSETS[tone.assetKey]) {
        source = SOUND_ASSETS[tone.assetKey];
      } else if (tone.uri) {
        source = tone.uri;
      }

      const player = createAudioPlayer(source);
      player.volume = 0.5;
      player.play();
      previewPlayerRef.current = player;

      setTimeout(() => {
        if (previewPlayerRef.current === player) {
          try {
            player.pause();
          } catch (e) {}
          previewPlayerRef.current = null;
        }
      }, 4000);
    } catch (e) {
      console.warn("Ringtone preview play error:", e);
    }
  };

  const selectRingtoneWithPreview = (tone) => {
    setEditRingtone(tone);
    playRingtonePreview(tone);
  };

  const stopRingtonePreview = () => {
    if (previewPlayerRef.current) {
      try {
        previewPlayerRef.current.pause();
      } catch (e) {}
      previewPlayerRef.current = null;
    }
  };

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  }, []);

  // Alarm clock ticking detector
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      const currentHourMin = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
      
      // If we already triggered for this minute, skip checking
      if (lastTriggeredMinRef.current === currentHourMin) {
        return;
      }

      // Multiple Custom Alarms Check
      const matchingAlarm = alarmsList.find(alarm => 
        alarm.enabled && 
        alarm.time === currentHourMin && 
        (alarm.days.length === 0 || alarm.days.includes(currentDay))
      );

      if (matchingAlarm && !showRingingModal) {
        lastTriggeredMinRef.current = currentHourMin;
        triggerAlarm('wake', matchingAlarm);
      }
      // Legacy Wake Alarm Check (fallback)
      else if (alarms.wakeEnabled && currentHourMin === alarms.wakeTime && !showRingingModal) {
        lastTriggeredMinRef.current = currentHourMin;
        triggerAlarm('wake');
      }
      
      // Water Alarms Check
      else if (alarms.waterEnabled && alarms.waterTimes.includes(currentHourMin) && !showRingingModal) {
        lastTriggeredMinRef.current = currentHourMin;
        triggerAlarm('water');
      }
    }, 1000); // Check every second for sub-second precision!

    return () => clearInterval(clockInterval);
  }, [alarms, alarmsList, showRingingModal]);

  // Audio system progressive volume ramping
  const startAlarmSound = async () => {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });

      // Retrieve alarm-specific ringtone or use default local lofi
      let source = SOUND_ASSETS.lofi;
      if (activeRingingAlarm && activeRingingAlarm.ringtone) {
        const rt = activeRingingAlarm.ringtone;
        if (rt.type === 'file' && rt.uri) {
          source = rt.uri;
        } else if (rt.type === 'local' && rt.assetKey && SOUND_ASSETS[rt.assetKey]) {
          source = SOUND_ASSETS[rt.assetKey];
        } else if (rt.uri) {
          source = rt.uri;
        }
      } else if (alarms.wakeRingtone) {
        const rt = alarms.wakeRingtone;
        if (rt.type === 'file' && rt.uri) {
          source = rt.uri;
        } else if (rt.type === 'local' && rt.assetKey && SOUND_ASSETS[rt.assetKey]) {
          source = SOUND_ASSETS[rt.assetKey];
        } else if (rt.uri) {
          source = rt.uri;
        }
      }

      const player = createAudioPlayer(source);
      player.loop = true;
      player.volume = 0.05;
      player.play();
      
      soundRef.current = player;
      
      // Progressive volume logic (soft to loud over 60s)
      let vol = 0.05;
      let secs = 0;
      
      audioIntervalRef.current = setInterval(() => {
        secs += 2;
        setAlarmProgressTime(secs);
        
        // Ramps volume linearly to 1.0
        vol = Math.min(0.05 + (secs / 60) * 0.95, 1.0);
        setCurrentVolume(vol);
        
        if (soundRef.current) {
          soundRef.current.volume = vol;
        }
        
        // Vibrate in sync
        Vibration.vibrate(secs > 30 ? [0, 500, 200, 500] : 150);

        if (secs >= 60) {
          clearInterval(audioIntervalRef.current);
        }
      }, 2000);
    } catch (e) {
      console.warn("Audio Alarm system loading error:", e);
      // Fallback ticking text countdown
      let secs = 0;
      audioIntervalRef.current = setInterval(() => {
        secs += 2;
        setAlarmProgressTime(secs);
        setCurrentVolume(Math.min(0.05 + (secs / 60) * 0.95, 1.0));
        Vibration.vibrate(100);
        if (secs >= 60) clearInterval(audioIntervalRef.current);
      }, 2000);
    }
  };

  const stopAlarmSound = async () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    if (soundRef.current) {
      try {
        soundRef.current.pause();
      } catch (e) {}
      soundRef.current = null;
    }
  };

  // Pulsing scale for Ringing overlay
  useEffect(() => {
    if (showRingingModal) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 1.0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
        ])
      ).start();
      startAlarmSound();
    } else {
      ringScale.setValue(1);
      stopAlarmSound();
    }
    return () => {
      stopAlarmSound();
    };
  }, [showRingingModal, activeRingingAlarm]);

  // Shake / Walk sensors subscription in Ringing Modal
  useEffect(() => {
    let accelSubscription = null;
    let pedoSubscription = null;

    if (showRingingModal && ringAlarmType === 'wake') {
      const activeMission = activeRingingAlarm ? (activeRingingAlarm.mission || 'none') : (alarms.wakeMission || 'none');

      if (activeMission === 'shake') {
        let lastUpdate = 0;
        const SHAKE_THRESHOLD = 2.2; // G-force threshold

        Accelerometer.isAvailableAsync().then(available => {
          if (available) {
            Accelerometer.setUpdateInterval(100);
            accelSubscription = Accelerometer.addListener(data => {
              const { x, y, z } = data;
              const acceleration = Math.sqrt(x*x + y*y + z*z);
              
              if (acceleration > SHAKE_THRESHOLD) {
                const curTime = Date.now();
                if ((curTime - lastUpdate) > 500) {
                  lastUpdate = curTime;
                  handleShakeSensorTrigger();
                }
              }
            });
          }
        });
      } else if (activeMission === 'walking') {
        Pedometer.isAvailableAsync().then(available => {
          if (available) {
            let initialStepCount = -1;
            pedoSubscription = Pedometer.watchStepCount(result => {
              if (initialStepCount === -1) {
                initialStepCount = result.steps;
              } else {
                const diff = result.steps - initialStepCount;
                if (diff > 0) {
                  for (let i = 0; i < diff; i++) {
                    handleStepWalkTrigger();
                  }
                }
              }
            });
          }
        });
      }
    }

    return () => {
      if (accelSubscription) accelSubscription.remove();
      if (pedoSubscription) pedoSubscription.remove();
    };
  }, [showRingingModal, ringAlarmType, activeRingingAlarm, alarms.wakeMission]);

  const triggerAlarm = (type = 'wake', alarmObject = null) => {
    setRingAlarmType(type);
    setAlarmProgressTime(0);
    setCurrentVolume(0.05);
    setActiveRingingAlarm(alarmObject);

    if (type === 'wake') {
      const activeMission = alarmObject ? (alarmObject.mission || 'none') : (alarms.wakeMission || 'none');
      if (activeMission === 'math') {
        const problems = [
          generateProblem(1),
          generateProblem(2),
          generateProblem(2),
        ];
        setMathProblems(problems);
        setCurrentMathIdx(0);
        setMathAnswerInput('');
      } else if (activeMission === 'shake') {
        setShakeCount(0);
      } else if (activeMission === 'typing') {
        const rand = MOTIVATIONAL_SENTENCES[Math.floor(Math.random() * MOTIVATIONAL_SENTENCES.length)];
        setTypingQuote(rand);
        setTypingInput('');
      } else if (activeMission === 'walking') {
        setWalkSteps(0);
      }
    }
    setShowRingingModal(true);
  };

  const generateProblem = (level) => {
    const num1 = Math.floor(Math.random() * (level * 10)) + 5;
    const num2 = Math.floor(Math.random() * (level * 10)) + 3;
    const isMult = Math.random() > 0.6;
    
    if (isMult) {
      return {
        question: `${num1} × ${Math.floor(num2/2) + 2}`,
        answer: num1 * (Math.floor(num2/2) + 2)
      };
    }
    return {
      question: `${num1} + ${num2}`,
      answer: num1 + num2
    };
  };

  // Math answer check
  const handleMathAnswerSubmit = () => {
    const currentProb = mathProblems[currentMathIdx];
    const userAns = parseInt(mathAnswerInput);
    
    if (userAns === currentProb.answer) {
      Vibration.vibrate(50);
      if (currentMathIdx === mathProblems.length - 1) {
        completeAlarmSuccess();
      } else {
        setCurrentMathIdx(currentMathIdx + 1);
        setMathAnswerInput('');
      }
    } else {
      Vibration.vibrate([0, 100, 50, 100]);
      Alert.alert("Wrong Answer!", "Bhai, focus! Brain needs to wake up. Solve carefully.");
      setMathAnswerInput('');
    }
  };

  // Shake Phone trigger
  const handleShakeSensorTrigger = () => {
    // Visual wiggling
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true })
    ]).start();

    setShakeCount(prev => {
      const next = prev + 1;
      Vibration.vibrate(30);
      if (next >= targetShakes) {
        completeAlarmSuccess();
      }
      return next;
    });
  };

  // Typing validator
  const handleTypingTextChange = (txt) => {
    setTypingInput(txt);
    if (txt.trim() === typingQuote.trim()) {
      completeAlarmSuccess();
    }
  };

  // Step trigger
  const handleStepWalkTrigger = () => {
    setWalkSteps(prev => {
      const next = prev + 1;
      Vibration.vibrate(40);
      if (next >= targetSteps) {
        completeAlarmSuccess();
      }
      return next;
    });
  };

  const completeAlarmSuccess = () => {
    setShowRingingModal(false);
    stopAlarmSound();
    
    // Award +20 XP
    awardXP(userId, gamification, 20, 'Silenced wake-up alarm').then(setGamification);
    
    Vibration.vibrate([0, 100, 50, 150]);
    Alert.alert("Alarm Silenced! ☀️", "Awesome job completing your wake-up mission! Awarded +20 XP. Have a productive day ahead!");
  };

  const handleSnooze = () => {
    // Snooze cost or sleep debt warnings
    setShowRingingModal(false);
    stopAlarmSound();
    
    // Deduct 5 XP for snooze (Anti-snooze mechanism!)
    let newXp = gamification.xp - 5;
    let newLvl = gamification.level;
    if (newXp < 0) {
      if (newLvl > 1) {
        newLvl -= 1;
        newXp += newLvl * 100;
      } else {
        newXp = 0;
      }
    }
    setGamification({ level: newLvl, xp: newXp });

    Vibration.vibrate([0, 100, 50, 100]);
    Alert.alert(
      "Snoozed (-5 XP) ⚠️", 
      "Snoozing breaks focus habits. We'll ring again in 2 minutes. Get out of bed, grinder!"
    );

    // Trigger ring again in 2 minutes (120 seconds)
    setTimeout(() => {
      triggerAlarm('wake');
    }, 120000);
  };

  const adjustHour = (amt) => {
    let h = parseInt(editTimeHour) + amt;
    if (h > 23) h = 0;
    if (h < 0) h = 23;
    setEditTimeHour(h.toString().padStart(2, '0'));
  };

  const adjustMin = (amt) => {
    let m = parseInt(editTimeMin) + amt;
    if (m > 59) m = 0;
    if (m < 0) m = 59;
    setEditTimeMin(m.toString().padStart(2, '0'));
  };

  const handleSaveAlarm = () => {
    const h = parseInt(editTimeHour);
    const m = parseInt(editTimeMin);
    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      Alert.alert("Invalid Time", "Please specify a valid hour (00-23) and minute (00-59).");
      return;
    }

    const timeStr = `${editTimeHour.padStart(2, '0')}:${editTimeMin.padStart(2, '0')}`;
    
    if (editingAlarm === 'hero') {
      setAlarms({
        ...alarms,
        wakeTime: timeStr,
        wakeMission: editMission,
        wakeRingtone: editRingtone
      });
      Alert.alert("Wake Up Alarm Saved 🎉", `Hero Wake Up alarm set to ring at ${timeStr}.`);
    } else if (editingAlarm) {
      const updated = alarmsList.map(a => a.id === editingAlarm.id ? {
        ...a,
        time: timeStr,
        mission: editMission,
        days: editDays,
        ringtone: editRingtone
      } : a);
      setAlarmsList(updated);
      Alert.alert("Alarm Updated 🎉", `Alarm updated to ring at ${timeStr}.`);
    } else {
      const newAlarm = {
        id: Date.now().toString(),
        time: timeStr,
        enabled: true,
        mission: editMission,
        days: editDays,
        ringtone: editRingtone
      };
      setAlarmsList([...alarmsList, newAlarm]);
      Alert.alert("Alarm Set 🎉", `New alarm added for ${timeStr}.`);
    }
    
    stopRingtonePreview();
    setShowEditModal(false);
    setEditingAlarm(null);
  };

  const handleDeleteAlarm = (alarmId) => {
    Alert.alert(
      "Delete Alarm ⚠️",
      "Are you sure you want to delete this alarm?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: () => {
            const updated = alarmsList.filter(a => a.id !== alarmId);
            setAlarmsList(updated);
          }
        }
      ]
    );
  };

  const toggleAlarmStatus = (alarmId, enabled) => {
    const updated = alarmsList.map(a => a.id === alarmId ? { ...a, enabled } : a);
    setAlarmsList(updated);
  };

  const handleSelectCustomRingtone = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true
      });
      
      const isCanceled = result.canceled !== undefined ? result.canceled : result.type === 'cancel';
      if (!isCanceled) {
        const file = result.assets && result.assets.length > 0 ? result.assets[0] : result;
        const uri = file.uri;
        if (uri) {
          const tone = {
            id: 'custom-' + Date.now(),
            type: 'file',
            name: file.name || 'Custom Audio File',
            uri: uri
          };
          const currentCustomList = alarms.customRingtones || [];
          const updatedCustomList = [...currentCustomList.filter(t => t.uri !== uri), tone];
          setAlarms({
            ...alarms,
            customRingtones: updatedCustomList
          });
          selectRingtoneWithPreview(tone);
        }
      }
    } catch (e) {
      console.warn("Document picker error:", e);
      Alert.alert("Picker Error", "Failed to select file from device.");
    }
  };

  const formatAlarmTime = (timeStr) => {
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return `${displayHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  // Sleep Logging Handler
  const handleLogSleep = () => {
    try {
      const [bHour, bMin] = bedtimeInput.split(':').map(Number);
      const [wHour, wMin] = waketimeInput.split(':').map(Number);
      
      let bDate = new Date();
      bDate.setHours(bHour, bMin, 0);
      
      let wDate = new Date();
      // If waketime is earlier numerically, assume waking up next morning
      if (wHour < bHour || (wHour === bHour && wMin < bMin)) {
        wDate.setDate(wDate.getDate() + 1);
      }
      wDate.setHours(wHour, wMin, 0);
      
      let diffMs = wDate - bDate;
      const sleepHours = parseFloat((diffMs / 3600000).toFixed(1));
      
      if (isNaN(sleepHours) || sleepHours <= 0 || sleepHours > 24) {
        throw new Error();
      }

      // Calculate Sleep cycles (ideal 90 mins = 1.5h chunks)
      const numCycles = parseFloat((sleepHours / 1.5).toFixed(1));
      const todayStr = new Date().toISOString().split('T')[0];

      const newLog = {
        date: todayStr,
        bedtime: bedtimeInput,
        waketime: waketimeInput,
        hours: sleepHours,
        cycles: numCycles,
        rating: sleepRatingInput
      };

      const filtered = sleepLogs.filter(log => log.date !== todayStr);
      setSleepLogs([newLog, ...filtered]);

      // Award XP
      awardXP(userId, gamification, 15, 'Logged sleep session').then(setGamification);

      Vibration.vibrate(40);
      Alert.alert(
        "Sleep Logged!", 
        `You slept ${sleepHours}h (${numCycles} sleep cycles). Rating: ${sleepRatingInput}/5 stars. +15 XP!`
      );
    } catch (e) {
      Alert.alert("Invalid Inputs", "Please verify bedtime and waketime are in valid 24h format (HH:MM).");
    }
  };

  // Calculation of sleep stats
  const averageSleepHours = sleepLogs.length > 0
    ? parseFloat((sleepLogs.reduce((sum, log) => sum + log.hours, 0) / sleepLogs.length).toFixed(1))
    : 0;

  const showSleepDebtAlert = averageSleepHours > 0 && averageSleepHours < 6.0;

  // Check if tomorrow has an exam for the Pre-exam Sleep Enforcer Nudge
  const isExamTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    return semesterEvents.some(evt => evt.type === 'exam' && evt.date === tomorrowStr);
  };

  const ringingMission = activeRingingAlarm ? (activeRingingAlarm.mission || 'none') : (alarms.wakeMission || 'none');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#BA7517']} 
            tintColor="#BA7517" 
          />
        }
      >
        
        {/* Alarms Header */}
        <View style={styles.alarmsHeaderRow}>
          <Text style={styles.alarmsHeaderTitle}>Alarms</Text>
          <TouchableOpacity style={styles.bellIconContainer} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={20} color="#F3F1EC" />
          </TouchableOpacity>
        </View>

        {/* Tab Segment Controls */}
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'alarm' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('alarm')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alarm-outline" size={16} color={activeTab === 'alarm' ? '#BA7517' : '#8B92A0'} />
              <Text style={[styles.segmentBtnText, activeTab === 'alarm' && styles.segmentBtnTextActive]}>Alarm</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'sleep' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('sleep')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="moon-outline" size={16} color={activeTab === 'sleep' ? '#BA7517' : '#8B92A0'} />
              <Text style={[styles.segmentBtnText, activeTab === 'sleep' && styles.segmentBtnTextActive]}>Sleep Cycle</Text>
            </View>
          </TouchableOpacity>
        </View>

        {activeTab === 'alarm' ? (
          <View style={{ gap: 20, marginTop: 16 }}>
            {/* Hero Wake Up Alarm Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTimeRow}>
                <TouchableOpacity 
                  style={{ flex: 1 }} 
                  activeOpacity={0.7}
                  onPress={handleEditHeroAlarm}
                >
                  <Text style={styles.heroLabel}>WAKE UP (TAP TO EDIT)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={styles.heroTimeText}>{formatTimeWithAmPm(alarms.wakeTime).time}</Text>
                    <Text style={styles.heroAmPm}>{formatTimeWithAmPm(alarms.wakeTime).ampm}</Text>
                    <Ionicons name="create-outline" size={16} color="#BA7517" style={{ marginLeft: 8, alignSelf: 'center' }} />
                  </View>
                  <Text style={styles.heroCountdown}>{getLegacyWakeCountdown()}</Text>
                </TouchableOpacity>
                <Switch 
                  value={alarms.wakeEnabled}
                  onValueChange={(val) => setAlarms({ ...alarms, wakeEnabled: val })}
                  trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                  thumbColor={alarms.wakeEnabled ? '#BA7517' : '#8B92A0'}
                />
              </View>

              <View style={styles.heroDaysRow}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const active = alarms.wakeEnabled;
                  return (
                    <View
                      key={day}
                      style={[styles.dayPill, active && styles.dayPillActive]}
                    >
                      <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>
                        {day}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Other Alarms Section */}
            <Text style={styles.sectionTitle}>Other Alarms</Text>
            {alarmsList.length === 0 ? (
              <View style={styles.emptyAlarmsCard}>
                <Ionicons name="alarm-outline" size={32} color="#5A6070" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyAlarmsText}>No custom alarms set.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {alarmsList.map((alarm) => {
                  const formatted = formatTimeWithAmPm(alarm.time);
                  return (
                    <TouchableOpacity
                      key={alarm.id}
                      style={[styles.otherAlarmCard, !alarm.enabled && styles.cardDisabled]}
                      onPress={() => handleEditAlarmPress(alarm)}
                      onLongPress={() => {
                        Alert.alert(
                          "Delete Alarm",
                          "Do you want to delete this alarm?",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => handleDeleteAlarm(alarm.id) }
                          ]
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                          <Text style={styles.otherAlarmTime}>{formatted.time}</Text>
                          <Text style={[styles.otherAlarmAmPm, { fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold', color: '#F3F1EC', marginLeft: 2 }]}>{formatted.ampm}</Text>
                        </View>
                        <View style={styles.otherAlarmDescRow}>
                          <Text style={styles.otherAlarmDesc}>{alarm.mission === 'none' ? 'Morning Run' : `Mission: ${alarm.mission.toUpperCase()}`}</Text>
                          <View style={styles.otherAlarmBadge}>
                            <Text style={styles.otherAlarmBadgeText}>
                              {alarm.days && alarm.days.length > 0
                                ? (alarm.days.length === 7 ? 'Daily' : alarm.days.join(', '))
                                : 'Daily'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Switch 
                        value={alarm.enabled}
                        onValueChange={(val) => toggleAlarmStatus(alarm.id, val)}
                        trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                        thumbColor={alarm.enabled ? '#BA7517' : '#8B92A0'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Routine Reminders Section */}
            <Text style={styles.sectionTitle}>Routine Reminders</Text>
            <View style={{ gap: 10 }}>
              {/* Drink Water */}
              <View style={styles.routineCard}>
                <TouchableOpacity 
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} 
                  activeOpacity={0.7}
                  onPress={() => handleEditRoutinePress('water')}
                >
                  <View style={styles.routineIconContainer}>
                    <Ionicons name="water-outline" size={18} color="#BA7517" />
                  </View>
                  <View style={styles.routineTextContainer}>
                    <Text style={styles.routineTitleText}>Drink Water (Tap to Edit)</Text>
                    <Text style={styles.routineDescText}>Times: {(alarms.waterTimes || []).join(', ')}</Text>
                  </View>
                </TouchableOpacity>
                <Switch 
                  value={alarms.waterEnabled}
                  onValueChange={(val) => setAlarms({ ...alarms, waterEnabled: val })}
                  trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                  thumbColor={alarms.waterEnabled ? '#BA7517' : '#8B92A0'}
                />
              </View>

              {/* Lunch Break */}
              <View style={styles.routineCard}>
                <TouchableOpacity 
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} 
                  activeOpacity={0.7}
                  onPress={() => handleEditRoutinePress('meal')}
                >
                  <View style={styles.routineIconContainer}>
                    <Ionicons name="restaurant-outline" size={18} color="#BA7517" />
                  </View>
                  <View style={styles.routineTextContainer}>
                    <Text style={styles.routineTitleText}>Meal Reminders (Tap to Edit)</Text>
                    <Text style={styles.routineDescText}>Lunch: {alarms.mealLunch || '13:00'} | Breakfast: {alarms.mealBreakfast || '08:30'} | Dinner: {alarms.mealDinner || '20:30'}</Text>
                  </View>
                </TouchableOpacity>
                <Switch 
                  value={alarms.mealsEnabled}
                  onValueChange={(val) => setAlarms({ ...alarms, mealsEnabled: val })}
                  trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                  thumbColor={alarms.mealsEnabled ? '#BA7517' : '#8B92A0'}
                />
              </View>

              {/* Vitamins */}
              <View style={styles.routineCard}>
                <TouchableOpacity 
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} 
                  activeOpacity={0.7}
                  onPress={() => handleEditRoutinePress('medication')}
                >
                  <View style={styles.routineIconContainer}>
                    <Ionicons name="medical-outline" size={18} color="#BA7517" />
                  </View>
                  <View style={styles.routineTextContainer}>
                    <Text style={styles.routineTitleText}>Vitamins Reminder (Tap to Edit)</Text>
                    <Text style={styles.routineDescText}>{alarms.medicationName || 'Vitamin B12'} - {alarms.medicationDose || '1 tablet'} at {alarms.medicationTime || '21:30'}</Text>
                  </View>
                </TouchableOpacity>
                <Switch 
                  value={alarms.medicationEnabled}
                  onValueChange={(val) => setAlarms({ ...alarms, medicationEnabled: val })}
                  trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                  thumbColor={alarms.medicationEnabled ? '#BA7517' : '#8B92A0'}
                />
              </View>
            </View>

            {/* Add Alarm Button */}
            <TouchableOpacity 
              style={styles.addAlarmBtn} 
              activeOpacity={0.8}
              onPress={() => {
                setEditingAlarm(null);
                setEditTimeHour('07');
                setEditTimeMin('00');
                setEditMission('none');
                setEditDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                setEditRingtone({
                  type: 'default',
                  name: 'Default Beep (Mixkit)',
                  uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav'
                });
                setShowEditModal(true);
              }}
            >
              <Text style={styles.addAlarmBtnText}>+ Add Alarm</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 20, marginTop: 16 }}>
            {/* Pre-Exam Sleep Enforcer Warning */}
            {isExamTomorrow() && (
              <View style={styles.examEnforcerCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Ionicons name="shield-checkmark" size={20} color="#BA7517" style={{ marginRight: 8 }} />
                  <Text style={styles.examEnforcerTitle}>PRE-EXAM SLEEP ENFORCER</Text>
                </View>
                <Text style={styles.examEnforcerText}>
                  Bhai, you have an exam tomorrow! Bedtime is automatically set 1 hour earlier. Sleep is your best revision tool tonight. Avoid screen time after 9 PM.
                </Text>
              </View>
            )}

            {/* Sleep Debt Alert Banner */}
            {showSleepDebtAlert && (
              <View style={styles.debtAlertCard}>
                <Ionicons name="warning-outline" size={24} color="#C47070" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.debtAlertTitle}>SLEEP DEBT DETECTED</Text>
                  <Text style={styles.debtAlertText}>
                    Your weekly sleep average is {averageSleepHours}h. Studies show academic performance drops by 20% below 6h. Catch up tonight, grinder!
                  </Text>
                </View>
              </View>
            )}

            {/* Sleep Logger Section */}
            <View style={styles.card}>
              <Text style={styles.subLabel}>LOG YESTERDAY'S SLEEP</Text>
              <View style={styles.sleepInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Bedtime</Text>
                  <TextInput 
                    style={styles.timeInputBox}
                    value={bedtimeInput}
                    onChangeText={setBedtimeInput}
                    placeholder="22:30"
                    placeholderTextColor="#5A6070"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Wake-up Time</Text>
                  <TextInput 
                    style={styles.timeInputBox}
                    value={waketimeInput}
                    onChangeText={setWaketimeInput}
                    placeholder="06:30"
                    placeholderTextColor="#5A6070"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Sleep Quality Rating</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    style={[styles.starBtn, sleepRatingInput === star && styles.starBtnActive]}
                    onPress={() => setSleepRatingInput(star)}
                  >
                    <Ionicons name={sleepRatingInput >= star ? "star" : "star-outline"} size={22} color={sleepRatingInput >= star ? '#BA7517' : '#8B92A0'} />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveSleepBtn} onPress={handleLogSleep}>
                <Text style={styles.saveSleepBtnText}>Log Sleep Stats (+15 XP)</Text>
              </TouchableOpacity>

              {/* Sleep Stats graphs */}
              {sleepLogs.length > 0 && (
                <View style={{ marginTop: 24 }}>
                  <Text style={styles.subLabel}>LAST 5 DAYS SLEEP LOGS</Text>
                  <View style={styles.sleepLogList}>
                    {sleepLogs.slice(0, 5).map((log, idx) => (
                      <View key={idx} style={styles.logRow}>
                        <Text style={styles.logDate}>{log.date}</Text>
                        <Text style={styles.logHours}>{log.hours}h ({log.cycles} cycles)</Text>
                        <View style={styles.logStars}>
                          {Array.from({ length: log.rating }).map((_, i) => (
                            <Ionicons key={i} name="star" size={10} color="#BA7517" />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Alarm Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingAlarm ? 'Edit Wake Alarm' : 'Create Wake Alarm'}</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              
              {/* Time Scroll Picker */}
              <Text style={styles.modalLabel}>SCROLL TO SET TIME</Text>
              <View style={styles.scrollPickerContainer}>
                <View style={styles.scrollPickerIndicator} pointerEvents="none" />
                
                {/* Hours column */}
                <View style={styles.scrollPickerCol}>
                  <ScrollView
                    ref={hourScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={60}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleHourScrollEnd}
                    contentContainerStyle={{ paddingVertical: 60 }}
                    nestedScrollEnabled={true}
                  >
                    {HOURS.map((h, index) => {
                      const isSelected = h === editTimeHour;
                      return (
                        <TouchableOpacity 
                          key={h} 
                          style={styles.scrollPickerItem}
                          onPress={() => selectHourIndex(index)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.scrollPickerItemText, isSelected && styles.scrollPickerItemTextActive]}>
                            {h}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.scrollPickerLabel}>Hours</Text>
                </View>

                <Text style={styles.scrollPickerSeparator}>:</Text>

                {/* Minutes column */}
                <View style={styles.scrollPickerCol}>
                  <ScrollView
                    ref={minScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={60}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinScrollEnd}
                    contentContainerStyle={{ paddingVertical: 60 }}
                    nestedScrollEnabled={true}
                  >
                    {MINUTES.map((m, index) => {
                      const isSelected = m === editTimeMin;
                      return (
                        <TouchableOpacity 
                          key={m} 
                          style={styles.scrollPickerItem}
                          onPress={() => selectMinIndex(index)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.scrollPickerItemText, isSelected && styles.scrollPickerItemTextActive]}>
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.scrollPickerLabel}>Minutes</Text>
                </View>
              </View>

              {/* Repeat Days Selection */}
              <Text style={styles.modalLabel}>REPEAT ON DAYS</Text>
              <View style={styles.daysPickerRow}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const selected = editDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayPickerBadge, selected && styles.dayPickerBadgeActive]}
                      onPress={() => {
                        if (selected) {
                          setEditDays(editDays.filter(d => d !== day));
                        } else {
                          setEditDays([...editDays, day]);
                        }
                      }}
                    >
                      <Text style={[styles.dayPickerText, selected && styles.dayPickerTextActive]}>
                        {day[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Wake Up Mission Selector */}
              <Text style={styles.modalLabel}>CHOOSE WAKE-UP MISSION</Text>
              <View style={styles.modalMissionGrid}>
                {[
                  { id: 'none', label: 'Tap Stop', icon: 'hand-left-outline' },
                  { id: 'math', label: 'Maths 🧮', icon: 'calculator-outline' },
                  { id: 'shake', label: 'Shake 📳', icon: 'phone-portrait-outline' },
                  { id: 'typing', label: 'Typing 🔤', icon: 'text-outline' },
                  { id: 'walking', label: 'Walk 🚶', icon: 'walk-outline' }
                ].map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.modalMissionBtn, editMission === m.id && styles.modalMissionBtnActive]}
                    onPress={() => setEditMission(m.id)}
                  >
                    <Ionicons name={m.icon} size={16} color={editMission === m.id ? '#0F1115' : '#8B92A0'} />
                    <Text style={[styles.modalMissionBtnText, editMission === m.id && styles.modalMissionBtnTextActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Ringtone Selector */}
              <Text style={styles.modalLabel}>SELECT ALARM RINGTONE</Text>
              
              <TouchableOpacity 
                style={styles.filePickerBtn} 
                onPress={handleSelectCustomRingtone}
              >
                <Ionicons name="document-text-outline" size={16} color="#0F1115" style={{ marginRight: 6 }} />
                <Text style={styles.filePickerBtnText}>Choose from File Manager</Text>
              </TouchableOpacity>

              <Text style={styles.selectedToneText}>
                Selected: <Text style={{ color: '#BA7517', fontFamily: 'PlusJakartaSans_700Bold' }}>{editRingtone?.name}</Text>
              </Text>

              {(alarms.customRingtones && alarms.customRingtones.length > 0) && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.subModalLabel}>CUSTOM PICKED SOUNDS</Text>
                  <View style={styles.builtInSoundsList}>
                    {alarms.customRingtones.map((tone) => {
                      const isSelected = editRingtone?.type === tone.type && editRingtone?.uri === tone.uri;
                      return (
                        <TouchableOpacity
                          key={tone.id || tone.uri}
                          style={[styles.soundItem, isSelected && styles.soundItemActive]}
                          onPress={() => selectRingtoneWithPreview(tone)}
                        >
                          <Ionicons 
                            name={isSelected ? "radio-button-on" : "radio-button-off"} 
                            size={16} 
                            color={isSelected ? '#BA7517' : '#8B92A0'} 
                          />
                          <Text style={[styles.soundItemText, isSelected && styles.soundItemTextActive]}>
                            {tone.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.subModalLabel}>OR CHOOSE BUILT-IN SOUNDS</Text>
              <View style={styles.builtInSoundsList}>
                {BUILT_IN_SOUNDS.map((tone) => {
                  const isSelected = editRingtone?.type === tone.type && 
                                    (tone.type === 'local' ? editRingtone?.assetKey === tone.assetKey : editRingtone?.uri === tone.uri);
                  return (
                    <TouchableOpacity
                      key={tone.id}
                      style={[styles.soundItem, isSelected && styles.soundItemActive]}
                      onPress={() => selectRingtoneWithPreview(tone)}
                    >
                      <Ionicons 
                        name={isSelected ? "radio-button-on" : "radio-button-off"} 
                        size={16} 
                        color={isSelected ? '#BA7517' : '#8B92A0'} 
                      />
                      <Text style={[styles.soundItemText, isSelected && styles.soundItemTextActive]}>
                        {tone.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

            </ScrollView>

            {/* Modal Bottom Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalCancelBtn]} 
                onPress={() => { stopRingtonePreview(); setShowEditModal(false); }}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalSaveBtn]} 
                onPress={handleSaveAlarm}
              >
                <Text style={styles.modalSaveBtnText}>Save Alarm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Routine Modal */}
      <Modal
        visible={showRoutineModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRoutineModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRoutine === 'water' ? 'Edit Hydration Routine' :
                 selectedRoutine === 'meal' ? 'Edit Meal Schedules' :
                 'Edit Medication Schedule'}
              </Text>
              <TouchableOpacity onPress={() => setShowRoutineModal(false)}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {selectedRoutine === 'water' && (
                <View>
                  <Text style={styles.modalLabel}>HYDRATION TIMES (24H, COMMA SEPARATED)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={routineWaterTimesStr}
                    onChangeText={setRoutineWaterTimesStr}
                    placeholder="e.g. 09:00, 14:00, 19:00"
                    placeholderTextColor="#5A6070"
                    autoFocus
                  />
                  <Text style={styles.selectedToneText}>
                    Please use 24h format separated by commas (e.g. 09:00, 12:00, 15:30).
                  </Text>
                </View>
              )}

              {selectedRoutine === 'meal' && (
                <View style={{ gap: 12 }}>
                  <View>
                    <Text style={styles.modalLabel}>BREAKFAST TIME (24H)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineBreakfastTime}
                      onChangeText={setRoutineBreakfastTime}
                      placeholder="e.g. 08:30"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                  <View>
                    <Text style={styles.modalLabel}>LUNCH TIME (24H)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineLunchTime}
                      onChangeText={setRoutineLunchTime}
                      placeholder="e.g. 13:00"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                  <View>
                    <Text style={styles.modalLabel}>DINNER TIME (24H)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineDinnerTime}
                      onChangeText={setRoutineDinnerTime}
                      placeholder="e.g. 20:30"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                </View>
              )}

              {selectedRoutine === 'medication' && (
                <View style={{ gap: 12 }}>
                  <View>
                    <Text style={styles.modalLabel}>MEDICATION / VITAMIN NAME</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineMedsName}
                      onChangeText={setRoutineMedsName}
                      placeholder="e.g. Vitamin B12"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                  <View>
                    <Text style={styles.modalLabel}>DOSAGE</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineMedsDose}
                      onChangeText={setRoutineMedsDose}
                      placeholder="e.g. 1 tablet"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                  <View>
                    <Text style={styles.modalLabel}>REMINDER TIME (24H)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={routineMedsTime}
                      onChangeText={setRoutineMedsTime}
                      placeholder="e.g. 21:30"
                      placeholderTextColor="#5A6070"
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalCancelBtn]} 
                onPress={() => setShowRoutineModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalSaveBtn]} 
                onPress={handleSaveRoutine}
              >
                <Text style={styles.modalSaveBtnText}>Save Routine</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alarm Ringing fullscreen modal overlay */}
      <Modal
        visible={showRingingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}} // Block back press to prevent cheating Alarmy!
      >
        <View style={styles.ringingOverlay}>
          <Animated.View style={[styles.ringingGlowCircle, { transform: [{ scale: ringScale }] }]} />
          
          <Ionicons name="alarm" size={80} color="#E11D48" style={styles.ringingIcon} />
          <Text style={styles.ringingTitle}>
            {ringAlarmType === 'wake' ? 'WAKE UP GRINDER!' : 
             ringAlarmType === 'water' ? 'TIME TO DRINK WATER!' :
             ringAlarmType === 'meal' ? 'MEAL TIME BREAK!' :
             ringAlarmType === 'meds' ? 'TAKE YOUR MEDICINE!' :
             'WIND DOWN TIME!'}
          </Text>
          <Text style={styles.ringingSub}>
            {ringAlarmType === 'wake' 
              ? `Volume: ${Math.round(currentVolume * 100)}% (No heart-attack ramping)`
              : 'Stay consistent with your healthy study habits!'}
          </Text>
          
          <View style={styles.ringingProgressTrack}>
            <View style={[styles.ringingProgressBar, { width: `${(alarmProgressTime/60)*100}%` }]} />
          </View>
          
          {/* Ringing Missions Container */}
          <View style={styles.missionActiveCard}>
            {ringAlarmType !== 'wake' ? (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <Text style={styles.missionHeading}>ROUTINE CHECKPOINT</Text>
                <Text style={styles.missionObjective}>
                  {ringAlarmType === 'water' ? 'Drink a glass of water to keep your body and brain hydrated!' :
                   ringAlarmType === 'meal' ? 'Take a healthy meal break and recharge your brain!' :
                   ringAlarmType === 'meds' ? `Take your medication: ${alarms.medicationName || 'Vitamins'} (${alarms.medicationDose || '1 tablet'}).` :
                   'Review your study logs and start winding down for good sleep!'}
                </Text>
                <TouchableOpacity style={styles.missionSubmitBtn} onPress={completeAlarmSuccess}>
                  <Text style={styles.missionSubmitText}>I completed this!</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <Text style={styles.missionHeading}>ACTIVE WAKE-UP MISSION</Text>
                
                {/* 1. MATH MISSION */}
                {ringingMission === 'math' && mathProblems.length > 0 && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.missionObjective}>Solve this mental puzzle ({currentMathIdx + 1}/{mathProblems.length}):</Text>
                    <Text style={styles.mathQuestion}>{mathProblems[currentMathIdx]?.question}</Text>
                    <TextInput
                      style={styles.mathInput}
                      keyboardType="numeric"
                      value={mathAnswerInput}
                      onChangeText={setMathAnswerInput}
                      placeholder="Answer?"
                      placeholderTextColor="#5A6070"
                      onSubmitEditing={handleMathAnswerSubmit}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.missionSubmitBtn} onPress={handleMathAnswerSubmit}>
                      <Text style={styles.missionSubmitText}>Verify Equation</Text>
                    </TouchableOpacity>
                  </View>
                )}
     
                {/* 2. SHAKE MISSION */}
                {ringingMission === 'shake' && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.missionObjective}>Shake phone vigorously to shut off alarm:</Text>
                    <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                      <Ionicons name="phone-portrait" size={60} color="#BA7517" style={{ marginVertical: 16 }} />
                    </Animated.View>
                    <Text style={styles.shakeCounter}>{shakeCount} / {targetShakes} Shakes</Text>
                    <Text style={styles.sensorHelpText}>Accelerometer active. Shake phone, or tap button below as fallback:</Text>
                    <TouchableOpacity style={styles.manualShakeBtn} onPress={handleShakeSensorTrigger}>
                      <Text style={styles.manualShakeBtnText}>TAP FALLBACK: SHAKE PHONE 📳</Text>
                    </TouchableOpacity>
                  </View>
                )}
     
                {/* 3. TYPING MISSION */}
                {ringingMission === 'typing' && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.missionObjective}>Type this sentence exactly to silence alarm:</Text>
                    <Text style={styles.typingQuoteText}>"{typingQuote}"</Text>
                    <TextInput
                      style={styles.typingInput}
                      value={typingInput}
                      onChangeText={handleTypingTextChange}
                      placeholder="Type here..."
                      placeholderTextColor="#5A6070"
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={styles.typingMatchPercent}>
                      {typingInput === typingQuote ? "MATCHED! 🎉" : "Typing..."}
                    </Text>
                  </View>
                )}
     
                {/* 4. WALKING MISSION */}
                {ringingMission === 'walking' && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.missionObjective}>Take steps to activate your body chemistry:</Text>
                    <Ionicons name="walk" size={60} color="#7C9B7A" style={{ marginVertical: 16 }} />
                    <Text style={styles.shakeCounter}>{walkSteps} / {targetSteps} steps</Text>
                    <Text style={styles.sensorHelpText}>Pedometer tracking active. Take steps, or tap below as fallback:</Text>
                    <TouchableOpacity style={styles.manualShakeBtn} onPress={handleStepWalkTrigger}>
                      <Text style={styles.manualShakeBtnText}>TAP FALLBACK: SIMULATE STEP 🚶</Text>
                    </TouchableOpacity>
                  </View>
                )}
     
                {/* 5. NONE MISSION */}
                {ringingMission === 'none' && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.missionObjective}>Ready to grind? Tap below to stop.</Text>
                    <TouchableOpacity style={styles.missionSubmitBtn} onPress={completeAlarmSuccess}>
                      <Text style={styles.missionSubmitText}>Stop Alarm</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
 
          {/* Snooze trigger (Anti-snooze cost) */}
          <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
            <Text style={styles.snoozeBtnText}>Snooze Alarm (-5 XP)</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  scroll: { padding: 24, paddingBottom: 60 },
  sectionHeader: { marginBottom: 24 },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: '#F3F1EC' },
  subtitle: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#8B92A0', marginTop: 4 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5A6070', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 20 },
  
  card: { backgroundColor: '#171B22', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  alarmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  alarmLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: '#BA7517', letterSpacing: 0.5 },
  alarmTimeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 32, color: '#F3F1EC', marginTop: 4 },
  
  timeInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    width: 65,
    textAlign: 'center',
    marginTop: 8
  },
  subLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9, color: '#8B92A0', letterSpacing: 1, marginBottom: 10 },
  missionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  missionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  missionBtnActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  missionBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#8B92A0' },
  missionBtnTextActive: { color: '#0F1115' },
  
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8
  },
  testBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#0F1115', fontSize: 12 },

  routineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  routineTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#F3F1EC' },
  routineDesc: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: '#8B92A0', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginVertical: 4 },
  
  medInputsContainer: { backgroundColor: '#0F1115', padding: 12, borderRadius: 12, gap: 8, marginTop: 8 },
  medInput: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12
  },

  examEnforcerCard: {
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.3)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20
  },
  examEnforcerTitle: { fontFamily: 'PlusJakartaSans_700Bold', color: '#BA7517', fontSize: 11, letterSpacing: 0.5 },
  examEnforcerText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', fontSize: 12, lineHeight: 18, marginTop: 4 },

  debtAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 112, 112, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 112, 0.2)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20
  },
  debtAlertTitle: { fontFamily: 'PlusJakartaSans_700Bold', color: '#C47070', fontSize: 11, letterSpacing: 0.5 },
  debtAlertText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', fontSize: 12, lineHeight: 18, marginTop: 4 },

  sleepInputRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  inputLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: '#8B92A0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  timeInputBox: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13
  },
  ratingRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  starBtn: { padding: 4 },
  starBtnActive: {},
  saveSleepBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  saveSleepBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#0F1115', fontSize: 13 },

  sleepLogList: {
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 8
  },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: '#8B92A0' },
  logHours: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#F3F1EC' },
  logStars: { flexDirection: 'row', gap: 2 },

  // Ringing Modal styles
  ringingOverlay: {
    flex: 1,
    backgroundColor: '#0F1115',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  ringingGlowCircle: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
  },
  ringingIcon: { marginBottom: 16 },
  ringingTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 26, color: '#E11D48', letterSpacing: 1 },
  ringingSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#8B92A0', marginTop: 4 },
  
  ringingProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    width: '60%',
    marginTop: 16,
    marginBottom: 32,
    overflow: 'hidden'
  },
  ringingProgressBar: {
    height: '100%',
    backgroundColor: '#E11D48'
  },
  
  missionActiveCard: {
    width: '100%',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24
  },
  missionHeading: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#BA7517',
    letterSpacing: 1.5,
    marginBottom: 16
  },
  missionObjective: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    textAlign: 'center',
    marginBottom: 16
  },
  mathQuestion: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 36,
    color: '#F3F1EC',
    marginBottom: 16
  },
  mathInput: {
    width: '70%',
    backgroundColor: '#0F1115',
    borderWidth: 1.5,
    borderColor: 'rgba(186, 117, 23, 0.3)',
    borderRadius: 14,
    padding: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 16
  },
  missionSubmitBtn: {
    width: '70%',
    backgroundColor: '#BA7517',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  missionSubmitText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#0F1115', fontSize: 13 },
  
  shakeCounter: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#F3F1EC',
    marginBottom: 12
  },
  manualShakeBtn: {
    backgroundColor: '#1D2430',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14
  },
  manualShakeBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#BA7517', fontSize: 12 },
  
  typingQuoteText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    fontStyle: 'italic',
    color: '#F3F1EC',
    textAlign: 'center',
    backgroundColor: '#0F1115',
    padding: 16,
    borderRadius: 14,
    width: '100%',
    lineHeight: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 16
  },
  typingInput: {
    width: '100%',
    backgroundColor: '#0F1115',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12
  },
  typingMatchPercent: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#7C9B7A',
    textTransform: 'uppercase'
  },
  snoozeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14
  },
  snoozeBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#8B92A0', fontSize: 12 },

  // New section header styles
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 20
  },
  addAlarmHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(186, 117, 23, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.25)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addAlarmHeaderBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#BA7517',
  },
  emptyAlarmsCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyAlarmsText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
  },
  emptyAlarmsSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 4,
    textAlign: 'center',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  alarmListItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alarmListTime: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 28,
    color: '#F3F1EC',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  dayBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  dayBadgeActive: {
    backgroundColor: '#BA7517',
    color: '#0F1115',
  },
  dayBadgeInactive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: '#5A6070',
  },
  metaBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#8B92A0',
    maxWidth: 150,
  },
  heroCard: {
    backgroundColor: '#171B22',
    borderLeftWidth: 4,
    borderLeftColor: '#BA7517',
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nextBadge: {
    backgroundColor: '#BA7517',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nextBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#0F1115',
    letterSpacing: 0.5,
  },
  heroCountdown: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#3B82F6',
  },
  heroBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTime: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 32,
    color: '#F3F1EC',
  },
  heroDaysText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0',
    marginTop: 2,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  heroMissionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(186, 117, 23, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroMissionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#BA7517',
  },
  heroRingtonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F1115',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flex: 1,
  },
  heroRingtoneText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#8B92A0',
  },
  heroActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
    paddingTop: 12,
  },
  heroActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  heroActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0',
  },
  compactCard: {
    backgroundColor: '#171B22',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactTime: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC',
  },
  compactDaysText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#5A6070',
  },
  compactMissionText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
  },
  compactActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 8,
  },
  compactActionBtn: {
    padding: 4,
  },
  alarmActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
    marginTop: 12,
    paddingTop: 12,
    gap: 8,
  },
  alarmActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  testAlarmBtn: {
    borderColor: 'rgba(186, 117, 23, 0.15)',
    backgroundColor: 'rgba(186, 117, 23, 0.05)',
  },
  alarmActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#171B22',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#F3F1EC',
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 16,
  },
  subModalLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 14,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 20,
    paddingVertical: 16,
    marginBottom: 8,
  },
  stepperCol: {
    alignItems: 'center',
    width: 80,
  },
  stepBtn: {
    padding: 8,
  },
  stepVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 36,
    color: '#F3F1EC',
    marginVertical: 4,
  },
  stepperLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#5A6070',
    textTransform: 'uppercase',
  },
  stepperSeparator: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 32,
    color: '#BA7517',
    marginHorizontal: 12,
    paddingBottom: 20,
  },
  daysPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayPickerBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F1115',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  dayPickerBadgeActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517',
  },
  dayPickerText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0',
  },
  dayPickerTextActive: {
    color: '#0F1115',
  },
  modalMissionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  modalMissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalMissionBtnActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517',
  },
  modalMissionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#8B92A0',
  },
  modalMissionBtnTextActive: {
    color: '#0F1115',
  },
  filePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BA7517',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  filePickerBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13,
  },
  selectedToneText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  builtInSoundsList: {
    backgroundColor: '#0F1115',
    borderRadius: 16,
    padding: 8,
    gap: 4,
  },
  soundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  soundItemActive: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  soundItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#8B92A0',
  },
  soundItemTextActive: {
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
    paddingTop: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  modalCancelBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8B92A0',
    fontSize: 13,
  },
  modalSaveBtn: {
    backgroundColor: '#BA7517',
  },
  modalSaveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13,
  },
  alarmsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  alarmsHeaderTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#F3F1EC'
  },
  bellIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#171B22',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#1D2430',
  },
  segmentBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0',
  },
  segmentBtnTextActive: {
    color: '#BA7517',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  heroCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  heroLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTimeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 40,
    color: '#F3F1EC',
  },
  heroAmPm: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
    marginLeft: 4,
  },
  heroCountdown: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#BA7517',
    marginTop: 2,
    marginBottom: 12,
  },
  heroDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    width: '100%',
  },
  dayPill: {
    flex: 1,
    marginHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillActive: {
    backgroundColor: 'rgba(186, 117, 23, 0.15)',
    borderColor: '#BA7517',
  },
  dayPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: '#8B92A0',
  },
  dayPillTextActive: {
    color: '#BA7517',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  otherAlarmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#BA7517',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  otherAlarmTime: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
  },
  otherAlarmDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  otherAlarmDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
  },
  otherAlarmBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  otherAlarmBadgeText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#8B92A0',
  },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#BA7517',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  routineIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  routineTextContainer: {
    flex: 1,
  },
  routineTitleText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
  },
  routineDescText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2,
  },
  addAlarmBtn: {
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
    width: '100%',
  },
  addAlarmBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0F1115',
  },
  sensorHelpText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  scrollPickerContainer: {
    flexDirection: 'row',
    height: 180,
    backgroundColor: '#0F1115',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginVertical: 12,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  scrollPickerIndicator: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 60,
    top: 60,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
  },
  scrollPickerCol: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollPickerItem: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  scrollPickerItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: '#5A6070',
  },
  scrollPickerItemTextActive: {
    color: '#BA7517',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  scrollPickerLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    position: 'absolute',
    bottom: 2,
    textTransform: 'uppercase',
  },
  scrollPickerSeparator: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: '#BA7517',
    paddingBottom: 0,
  },
});
