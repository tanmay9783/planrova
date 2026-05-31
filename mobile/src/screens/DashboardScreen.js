import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  Modal, 
  Platform, 
  StatusBar, 
  Animated, 
  Vibration,
  Share,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFirestoreData } from '../hooks/useFirestoreData';
import WorkspaceHubModal from '../components/WorkspaceHubModal';
import ConfettiBurst from '../components/ConfettiBurst';
import { auth } from '../firebase';
import { calculateXPProgress, getLevelTitle } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import WindDownModal from '../components/WindDownModal';
import { getTimeOfDayProfile, getGreeting, getAmbientGlow, getThemeConfig, getContextualMessage } from '../utils/themeDetector';
import { LayoutAnimation, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import XPFlyAnimation from '../components/XPFlyAnimation';

const { width, height } = Dimensions.get('window');

export default function DashboardScreen() {
  const navigation = useNavigation();
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const emailPrefix = auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Student';

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  // Core Firestore States
  const [profile, setProfile] = useFirestoreData(`${userId}_user_profile`, { name: emailPrefix, bio: 'Builder', avatar: null });
  const [gamification, setGamification] = useFirestoreData(`${userId}_gamification_state`, { level: 1, xp: 0 });
  const [tasks, setTasks] = useFirestoreData(`${userId}_tasks`, []);
  const [hydration, setHydration] = useFirestoreData(`${userId}_hydration`, { water: 0, target: 8 });
  const [pomodoroStats, setPomodoroStats] = useFirestoreData(`${userId}_pomodoro_stats`, { roundsToday: 0, date: new Date().toISOString().split('T')[0] });
  
  // New Layout & Feature states
  const [timetable] = useFirestoreData(`${userId}_timetable`, { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] });
  const [dayRatings, setDayRatings] = useFirestoreData(`${userId}_day_ratings`, {});
  const [sleepLogs, setSleepLogs] = useFirestoreData(`${userId}_sleep_logs`, []);
  const [semesterDates] = useFirestoreData(`${userId}_semester_dates`, { start: '2026-01-01', end: '2026-06-30', examStart: '', examEnd: '' });
  const [habits] = useFirestoreData(`${userId}_user_habits`, []);
  const [attendance, setAttendance] = useFirestoreData(`${userId}_attendance`, { attended: {} });
  const [expenses, setExpenses] = useFirestoreData(`${userId}_expenses`, []);
  
  const defaultDashboardConfig = [
    { id: "profile", title: "Student ID Profile", visible: true, size: "full" },
    { id: "quests", title: "Daily Quests", visible: true, size: "full" },
    { id: "productivity", title: "Today's Productivity", visible: true, size: "full" },
    { id: "tasks", title: "Today's Tasks", visible: true, size: "full" },
    { id: "calendar", title: "Study Calendar", visible: true, size: "full" },
    { id: "sleep", title: "Sleep Tracker", visible: true, size: "full" },
    { id: "timetable", title: "Next Lecture", visible: true, size: "compact" },
    { id: "quote", title: "Quote of the Day", visible: false, size: "compact" }
  ];
  const [dashboardConfig, setDashboardConfig] = useFirestoreData(`${userId}_dashboard_config`, defaultDashboardConfig);

  // Widget editing mode
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [wiggleAnim] = useState(new Animated.Value(0));

  // Night Wind-down States
  const [showWindDown, setShowWindDown] = useState(false);
  
  // Sleep log logging temp inputs
  const [sleepBedTime, setSleepBedTime] = useState('22:30');
  const [sleepWakeTime, setSleepWakeTime] = useState('06:30');
  const [sleepRating, setSleepRating] = useState(4);

  // Gamification additions
  const [loginReward, setLoginReward] = useFirestoreData(`${userId}_login_rewards`, { lastClaimed: '', streak: 0 });
  const [dailyQuestStatus, setDailyQuestStatus] = useFirestoreData(`${userId}_daily_quest_status`, { date: '', claimed: false });
  const [streaks, setStreaks] = useFirestoreData(`${userId}_streaks`, {
    tasks: 0,
    focus: 0,
    hydration: 0,
    habits: 0,
    budget: 0,
    lastUpdated: { tasks: '', focus: '', hydration: '', habits: '', budget: '' },
    shields: 1
  });

  // UI Modal / View states
  const [showHub, setShowHub] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [loginRewardXp, setLoginRewardXp] = useState(0);
  const [calendarView, setCalendarView] = useState('weekly'); // weekly or monthly
  const [newTaskText, setNewTaskText] = useState('');

  // Custom Grid Calendar Navigation States
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [modalNewTaskText, setModalNewTaskText] = useState('');

  const [showKickoffModal, setShowKickoffModal] = useState(false);
  const xpFlyRef = useRef(null);

  // Collapsed widgets state
  const [collapsedWidgets, setCollapsedWidgets] = useState({});
  // Tooltip sequence step (0: hidden, 1: Focus Timer, 2: Habits, 3: Water)
  const [tooltipStep, setTooltipStep] = useState(0);

  useEffect(() => {
    // Load collapsed widgets
    AsyncStorage.getItem('dashboard_collapsed_widgets').then(val => {
      if (val) setCollapsedWidgets(JSON.parse(val));
    });

    // Load tooltip status
    AsyncStorage.getItem('has_seen_tooltip_guide').then(val => {
      if (!val) {
        setTooltipStep(1);
      }
    });

    // Trigger confetti if onboarding was just completed
    AsyncStorage.getItem('onboarding_just_completed').then(val => {
      if (val === 'true') {
        setTimeout(() => {
          if (confettiRef.current) {
            confettiRef.current.startBurst();
          }
        }, 1000);
        AsyncStorage.removeItem('onboarding_just_completed');
      }
    });
  }, []);

  const toggleWidgetCollapse = async (id) => {
    const next = { ...collapsedWidgets, [id]: !collapsedWidgets[id] };
    setCollapsedWidgets(next);
    await AsyncStorage.setItem('dashboard_collapsed_widgets', JSON.stringify(next));
  };

  const handleNextTooltip = async () => {
    if (tooltipStep < 3) {
      setTooltipStep(tooltipStep + 1);
    } else {
      setTooltipStep(0);
      await AsyncStorage.setItem('has_seen_tooltip_guide', 'true');
    }
  };

  const renderWidgetHeader = (widgetId, title) => {
    const isCollapsed = collapsedWidgets[widgetId];
    return (
      <TouchableOpacity 
        style={styles.collapsibleWidgetHeader} 
        onPress={() => toggleWidgetCollapse(widgetId)}
        activeOpacity={0.8}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={16} color="#5A6070" />
      </TouchableOpacity>
    );
  };

  // Dashboard entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(25)).current;
  const confettiRef = useRef(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  useEffect(() => {
    const checkKickoff = async () => {
      const activeTheme = getThemeConfig();
      if (activeTheme.themeId === 'kickoff') {
        const dismissed = await AsyncStorage.getItem(`kickoff_dismissed_${new Date().getFullYear()}_${new Date().getMonth()}`);
        if (!dismissed) {
          setShowKickoffModal(true);
        }
      }
    };
    checkKickoff();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Wiggle animation loop for reorder mode
  useEffect(() => {
    if (isEditingLayout) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(wiggleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(wiggleAnim, { toValue: -1, duration: 150, useNativeDriver: true }),
          Animated.timing(wiggleAnim, { toValue: 0, duration: 150, useNativeDriver: true })
        ])
      ).start();
    } else {
      wiggleAnim.setValue(0);
    }
  }, [isEditingLayout]);

  // Night wind down auto trigger on load
  useEffect(() => {
    const currentHour = new Date().getHours();
    const isWindDownTime = currentHour >= 21 || currentHour < 4;
    const ratingKey = `rating_${todayStr}`;
    const alreadyRatedToday = dayRatings && dayRatings[ratingKey] !== undefined;
    
    if (isWindDownTime && !alreadyRatedToday) {
      const timer = setTimeout(() => {
        setShowWindDown(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [dayRatings]);

  const handleLogSleep = () => {
    try {
      const [bHour, bMin] = sleepBedTime.split(':').map(Number);
      const [wHour, wMin] = sleepWakeTime.split(':').map(Number);
      
      let bDate = new Date();
      bDate.setHours(bHour, bMin, 0);
      
      let wDate = new Date();
      wDate.setDate(wDate.getDate() + 1); // next day
      wDate.setHours(wHour, wMin, 0);
      
      let diffMs = wDate - bDate;
      if (diffMs < 0) {
        diffMs += 86400000;
      }
      const sleepHours = parseFloat((diffMs / 3600000).toFixed(1));
      
      const newLog = {
        date: todayStr,
        bedtime: sleepBedTime,
        waketime: sleepWakeTime,
        hours: sleepHours,
        rating: sleepRating
      };

      const filtered = sleepLogs.filter(log => log.date !== todayStr);
      setSleepLogs([newLog, ...filtered]);
      
      try {
        awardXP(userId, gamification, 10, 'Logged sleep session').then(setGamification);
      } catch (err) {}
      
      Vibration.vibrate(40);
      Alert.alert('Sleep Logged!', `Recorded ${sleepHours}h sleep. +10 XP Awarded!`);
    } catch (e) {
      Alert.alert('Error', 'Invalid time inputs. Use HH:MM format.');
    }
  };

  const handleSwapWidgets = (index, direction) => {
    if (index === 0 && direction === -1) return;
    if (index === dashboardConfig.length - 1 && direction === 1) return;
    
    const newConfig = [...dashboardConfig];
    const temp = newConfig[index];
    newConfig[index] = newConfig[index + direction];
    newConfig[index + direction] = temp;
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDashboardConfig(newConfig);
  };

  const handleHideWidget = (id) => {
    const newConfig = dashboardConfig.map(w => {
      if (w.id === id) return { ...w, visible: false };
      return w;
    });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDashboardConfig(newConfig);
  };

  const handleToggleWidgetSize = (id) => {
    const newConfig = dashboardConfig.map(w => {
      if (w.id === id) return { ...w, size: w.size === 'compact' ? 'full' : 'compact' };
      return w;
    });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDashboardConfig(newConfig);
  };

  const handleAddWidget = (id) => {
    const newConfig = dashboardConfig.map(w => {
      if (w.id === id) return { ...w, visible: true };
      return w;
    });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDashboardConfig(newConfig);
    setShowAddWidgetModal(false);
  };

  const cardRotate = wiggleAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-0.8deg', '0.8deg']
  });
  const cardScale = wiggleAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [0.99, 1.01]
  });

  const activeTheme = getThemeConfig();
  const timeOfDayProfile = getTimeOfDayProfile();
  const glow = getAmbientGlow(timeOfDayProfile);
  const greetingText = getGreeting(profile.name);

  const renderWidgetWrapper = (widget, content, index) => {
    if (!isEditingLayout) {
      return (
        <View key={widget.id}>
          {content}
        </View>
      );
    }

    const isFirstRaw = index === 0;
    const isLastRaw = index === dashboardConfig.length - 1;

    return (
      <Animated.View 
        key={widget.id} 
        style={[
          {
            marginBottom: 20,
            transform: [
              { rotate: cardRotate },
              { scale: cardScale }
            ]
          }
        ]}
      >
        <View style={styles.editControlsContainer}>
          <Text style={styles.editWidgetTitle}>{widget.title}</Text>
          <View style={styles.editActions}>
            <TouchableOpacity 
              style={[styles.editBtn, isFirstRaw && styles.editBtnDisabled]} 
              onPress={() => !isFirstRaw && handleSwapWidgets(index, -1)}
              disabled={isFirstRaw}
            >
              <Ionicons name="arrow-up" size={14} color={isFirstRaw ? "#444" : "#C2A878"} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.editBtn, isLastRaw && styles.editBtnDisabled]} 
              onPress={() => !isLastRaw && handleSwapWidgets(index, 1)}
              disabled={isLastRaw}
            >
              <Ionicons name="arrow-down" size={14} color={isLastRaw ? "#444" : "#C2A878"} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.editBtn} 
              onPress={() => handleToggleWidgetSize(widget.id)}
            >
              <Ionicons name={widget.size === 'compact' ? "expand-outline" : "contract-outline"} size={14} color="#C2A878" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.editBtn, { backgroundColor: 'rgba(196, 112, 112, 0.1)' }]} 
              onPress={() => handleHideWidget(widget.id)}
            >
              <Ionicons name="eye-off-outline" size={14} color="#C47070" />
            </TouchableOpacity>
          </View>
        </View>
        {content}
      </Animated.View>
    );
  };

  // Daily Login Reward Check
  useEffect(() => {
    if (!loginReward || loginReward.lastClaimed === todayStr) return;

    let newStreak = 1;
    if (loginReward.lastClaimed === yesterdayStr) {
      newStreak = (loginReward.streak || 0) + 1;
    }
    if (newStreak > 7) newStreak = 1;

    const rewards = [5, 10, 15, 20, 25, 30, 50];
    const xpReward = rewards[newStreak - 1] || 5;

    setLoginRewardXp(xpReward);
    setShowLoginModal(true);

    awardXP(userId, gamification, xpReward, `Daily login streak reward: Day ${newStreak}`).then(setGamification);

    setLoginReward({
      lastClaimed: todayStr,
      streak: newStreak
    });
  }, [loginReward]);

  // Streak Tracker Sync on mount/data update
  useEffect(() => {
    if (!streaks || !streaks.lastUpdated) return;

    let streaksChanged = false;
    const newStreaks = { ...streaks };

    const checkStreak = (category, currentActivityMet) => {
      const lastUp = newStreaks.lastUpdated[category] || '';
      if (lastUp === todayStr) return;

      if (currentActivityMet) {
        newStreaks[category] = (newStreaks[category] || 0) + 1;
        newStreaks.lastUpdated[category] = todayStr;
        streaksChanged = true;
      } else if (lastUp !== yesterdayStr && lastUp !== '') {
        // Streak is broken
        if (newStreaks[category] > 0) {
          if (newStreaks.shields > 0) {
            newStreaks.shields -= 1;
            newStreaks.lastUpdated[category] = yesterdayStr; // backdate
            streaksChanged = true;
            Vibration.vibrate([0, 80, 50, 80]);
            Alert.alert(
              'Streak Protected',
              `Your daily ${category} streak was saved from breaking by a Streak Shield!`
            );
          } else {
            newStreaks[`prev_${category}`] = newStreaks[category];
            newStreaks[category] = 0;
            streaksChanged = true;
          }
        }
      }
    };

    const taskGoalMet = tasks.filter(t => t.date === todayStr && t.completed).length >= 3;
    const focusGoalMet = pomodoroStats.roundsToday >= 2;
    const waterGoalMet = hydration.water >= 1500;

    checkStreak('tasks', taskGoalMet);
    checkStreak('focus', focusGoalMet);
    checkStreak('hydration', waterGoalMet);

    if (streaksChanged) {
      setStreaks(newStreaks);
    }
  }, [tasks, pomodoroStats, hydration]);

  // Daily Quest calculations
  const todayTasks = tasks.filter(t => t.date === todayStr);
  const completedTodayTasks = todayTasks.filter(t => t.completed).length;

  const questWaterGoal = 1500;
  const currentWaterAmount = hydration.water;

  const questWaterMet = currentWaterAmount >= questWaterGoal;
  const questFocusMet = pomodoroStats.roundsToday >= 2;
  const questTasksMet = completedTodayTasks >= 3;

  const allQuestsCompleted = questWaterMet && questFocusMet && questTasksMet;

  const handleTapHydrationQuest = () => {
    Alert.alert(
      "Daily Hydration Quest",
      `Progress: ${currentWaterAmount}ml / ${questWaterGoal}ml.\n\nWhat would you like to do?`,
      [
        { text: "Go to Water Log", onPress: () => navigation.navigate('HydrationWorkspace') },
        { text: "Log +250ml Water", onPress: () => {
          const nextWater = currentWaterAmount + 250;
          setHydration({ ...hydration, water: nextWater });
          Vibration.vibrate(40);
          Alert.alert("Success", "Logged 250ml water!");
        }},
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleTapFocusQuest = () => {
    Alert.alert(
      "Daily Focus Quest",
      `Progress: ${pomodoroStats.roundsToday || 0} / 2 Pomodoro rounds.\n\nWhat would you like to do?`,
      [
        { text: "Go to Focus Timer", onPress: () => navigation.navigate('Timer') },
        { text: "Log +1 Pomodoro Round", onPress: () => {
          const nextRounds = (pomodoroStats.roundsToday || 0) + 1;
          setPomodoroStats({
            ...pomodoroStats,
            roundsToday: nextRounds,
            date: todayStr
          });
          Vibration.vibrate(40);
          Alert.alert("Success", "Logged 1 focus round!");
        }},
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleTapTasksQuest = () => {
    Alert.alert(
      "Daily Tasks Quest",
      `Progress: ${completedTodayTasks} / 3 tasks completed.\n\nWhat would you like to do?`,
      [
        { text: "Go to Tasks / Schedule", onPress: () => navigation.navigate('Schedule') },
        { text: "Complete Next Task", onPress: () => {
          const uncompleted = todayTasks.find(t => !t.completed);
          if (uncompleted) {
            const updated = tasks.map(t => t.id === uncompleted.id ? { ...t, completed: true } : t);
            setTasks(updated);
            Vibration.vibrate(40);
            Alert.alert("Success", `Marked "${uncompleted.text}" as completed!`);
          } else {
            const nextTask = {
              id: Date.now().toString(),
              text: "Quick Daily Quest Task",
              completed: true,
              date: todayStr
            };
            setTasks([...tasks, nextTask]);
            Vibration.vibrate(40);
            Alert.alert("Success", "Added and completed a quick task!");
          }
        }},
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  // Claim Daily Quest complete reward
  useEffect(() => {
    if (allQuestsCompleted && dailyQuestStatus.date !== todayStr) {
      awardXP(userId, gamification, 30, 'Completed all daily quests').then(setGamification);
      setDailyQuestStatus({ date: todayStr, claimed: true });

      setTimeout(() => {
        if (confettiRef.current) confettiRef.current.startBurst();
      }, 300);

      Vibration.vibrate([0, 100, 50, 100]);
      Alert.alert(
        'Daily Quests Complete!',
        'Fantastic! You completed all daily study challenges. Awarded +30 XP!'
      );
    }
  }, [allQuestsCompleted, dailyQuestStatus]);

  const xpProgress = Math.min((gamification.xp / (gamification.level * 100)) * 100, 100);

  // Calculate daily score grade
  let dailyGrade = '—';
  let focusStatus = 'Incomplete';
  let statusDesc = 'No tasks completed. Add study targets below to begin your focus sprint!';
  let statusColor = '#8B92A0';
  let statusIcon = 'ellipse-outline';

  if (todayTasks.length > 0) {
    const ratio = completedTodayTasks / todayTasks.length;
    if (ratio === 1) {
      dailyGrade = 'A+';
      focusStatus = 'Perfect Day';
      statusDesc = 'Stellar performance! You achieved 100% of today\'s study targets.';
      statusColor = '#7C9B7A';
      statusIcon = 'checkmark-done-circle';
    } else if (ratio >= 0.7) {
      dailyGrade = 'A';
      focusStatus = 'High Focus';
      statusDesc = 'Great job! You finished almost all scheduled tasks today.';
      statusColor = '#7C9B7A';
      statusIcon = 'checkmark-circle-outline';
    } else if (ratio >= 0.4) {
      dailyGrade = 'B';
      focusStatus = 'Steady Progress';
      statusDesc = 'Good job! You are halfway through. Complete one more target!';
      statusColor = '#C2A878';
      statusIcon = 'trending-up';
    } else {
      dailyGrade = 'C';
      focusStatus = 'Low Focus';
      statusDesc = 'Build momentum. Ticking just one task kickstarts your study streak.';
      statusColor = '#C47070';
      statusIcon = 'alert-circle-outline';
    }
  }

  const plantProgress = todayTasks.length > 0 ? (completedTodayTasks / todayTasks.length) * 100 : 0;

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      title: newTaskText.trim(),
      completed: false,
      date: todayStr
    };
    setTasks([...tasks, newTask]);
    setNewTaskText('');
  };

  const handleAddModalTask = () => {
    if (!modalNewTaskText.trim() || !selectedCalendarDate) return;
    const newTask = {
      id: Date.now().toString(),
      title: modalNewTaskText.trim(),
      completed: false,
      date: selectedCalendarDate
    };
    setTasks([...tasks, newTask]);
    setModalNewTaskText('');
  };

  const toggleTask = (taskId) => {
    let completedState = false;
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        completedState = !t.completed;
        return { ...t, completed: completedState };
      }
      return t;
    });
    setTasks(updated);

    if (completedState) {
      Vibration.vibrate(40);
      const tObj = tasks.find(x => x.id === taskId);
      awardXP(userId, gamification, 10, `Completed task: ${tObj?.title || 'Study'}`).then(setGamification);
      xpFlyRef.current?.trigger(10, width / 2 - 35, height / 2 - 40);

      // Trigger small confetti burst on individual task completion if it's the last one
      const remainingCount = updated.filter(t => t.date === todayStr && !t.completed).length;
      if (remainingCount === 0 && updated.filter(t => t.date === todayStr).length > 0) {
        setTimeout(() => {
          if (confettiRef.current) confettiRef.current.startBurst();
        }, 100);
      }
    }
  };

  const deleteTask = (taskId) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const toggleClassAttended = (cls) => {
    const classKey = `${cls.subject}_${cls.time}`;
    const todayAttended = attendance?.attended?.[todayStr] || [];
    let updatedAttended = [];
    let isAttending = false;

    if (todayAttended.includes(classKey)) {
      updatedAttended = todayAttended.filter(k => k !== classKey);
    } else {
      updatedAttended = [...todayAttended, classKey];
      isAttending = true;
    }

    const newAttendance = {
      ...attendance,
      attended: {
        ...(attendance?.attended || {}),
        [todayStr]: updatedAttended
      }
    };
    setAttendance(newAttendance);

    if (isAttending) {
      Vibration.vibrate(45);
      awardXP(userId, gamification, 15, `Attended class: ${cls.subject}`).then(setGamification);
      if (confettiRef.current) confettiRef.current.startBurst();
    }
  };

  // Shield & Revival Actions
  const handleBuyShield = () => {
    if (gamification.xp < 30 && gamification.level === 1) {
      Alert.alert('Insufficient XP', 'You need at least 30 XP to buy a Streak Shield.');
      return;
    }
    
    let newXp = gamification.xp - 30;
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
    setStreaks({
      ...streaks,
      shields: (streaks.shields || 0) + 1
    });
    Alert.alert('Purchased', 'Streak Shield added to inventory.');
  };

  const handleReviveStreak = (category) => {
    const prevVal = streaks[`prev_${category}`] || 0;
    if (prevVal === 0) {
      Alert.alert('Nothing to Revive', 'No previous streak value found.');
      return;
    }
    if (gamification.xp < 50 && gamification.level === 1) {
      Alert.alert('Insufficient XP', 'Streak revival requires 50 XP.');
      return;
    }

    let newXp = gamification.xp - 50;
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

    const newStreaks = { ...streaks };
    newStreaks[category] = prevVal;
    newStreaks[`prev_${category}`] = 0; // consumed
    newStreaks.lastUpdated[category] = todayStr;
    setStreaks(newStreaks);

    Vibration.vibrate(60);
    Alert.alert('Streak Restored', `${category} streak is back at ${prevVal} days!`);
  };

  // Calendar Grid builder
  const generateMonthDays = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayIndex = firstDay.getDay();

    const cells = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      cells.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return cells;
  };

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };

  const selectedDateTasks = selectedCalendarDate 
    ? tasks.filter(t => t.date === selectedCalendarDate)
    : [];

  const isExamWeek = semesterDates && semesterDates.examStart && semesterDates.examEnd && todayStr >= semesterDates.examStart && todayStr <= semesterDates.examEnd;

  const getHeaderConfig = () => {
    if (isExamWeek) {
      return {
        backgroundColor: '#091026', // Deep focused blue
        borderColor: 'rgba(59, 130, 246, 0.4)',
        title: 'Exam Mode Active',
        streakColor: '#E11D48',
        textColor: '#FFFFFF'
      };
    }
    
    switch (timeOfDayProfile) {
      case 'morning':
        return {
          backgroundColor: '#1E1810', // Warm amber tint
          borderColor: 'rgba(245, 158, 11, 0.25)',
          title: 'Morning Desk',
          streakColor: '#F59E0B',
          textColor: '#F59E0B'
        };
      case 'evening':
        return {
          backgroundColor: '#15121F', // Cool purple
          borderColor: 'rgba(139, 92, 246, 0.25)',
          title: 'Evening Desk',
          streakColor: '#8B5CF6',
          textColor: '#8B5CF6'
        };
      case 'night':
        return {
          backgroundColor: '#0A0D1A', // Deep Blue
          borderColor: 'rgba(59, 130, 246, 0.25)',
          title: 'Night Desk',
          streakColor: '#3B82F6',
          textColor: '#3B82F6'
        };
      case 'afternoon':
      default:
        return {
          backgroundColor: '#11141B', // Neutral dark
          borderColor: 'rgba(255, 255, 255, 0.04)',
          title: 'Planory Desk',
          streakColor: '#C2A878',
          textColor: '#C2A878'
        };
    }
  };

  const headerConfig = getHeaderConfig();
  const showWeatherNudge = new Date().getHours() >= 11 && new Date().getHours() < 16;
  const contextualSub = getContextualMessage();

  const renderBriefingCard = () => {
    const isSunday = new Date().getDay() === 0;
    const hour = new Date().getHours();
    const isSundayEvening = isSunday && hour >= 17;
    const isMorning = hour >= 5 && hour < 12;
    
    if (isSundayEvening) {
      return (
        <View style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <Ionicons name="calendar-outline" size={20} color="#C2A878" style={{ marginRight: 8 }} />
            <Text style={styles.briefingTitle}>Here's Your Week Ahead 📅</Text>
          </View>
          <Text style={styles.briefingSubtitle}>Sunday Weekly Preview ritual. Set your intentions!</Text>
          <View style={styles.briefingStatsRow}>
            <View style={styles.briefingStatItem}>
              <Text style={styles.briefingStatVal}>{tasks.filter(t => !t.completed).length}</Text>
              <Text style={styles.briefingStatLabel}>PENDING</Text>
            </View>
            <View style={styles.briefingStatItem}>
              <Text style={styles.briefingStatVal}>{hydration.target || 2000} ml</Text>
              <Text style={styles.briefingStatLabel}>DAILY WATER</Text>
            </View>
            <View style={styles.briefingStatItem}>
              <Text style={styles.briefingStatVal}>
                {Object.keys(timetable).reduce((sum, d) => sum + (timetable[d]?.length || 0), 0)}
              </Text>
              <Text style={styles.briefingStatLabel}>LECTURES</Text>
            </View>
          </View>
          <Text style={styles.briefingQuote}>"Set your workspace targets today, grind seamlessly tomorrow."</Text>
        </View>
      );
    }
    
    if (isMorning) {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = weekdays[new Date().getDay()];
      const todayClasses = timetable && timetable[todayName] ? timetable[todayName] : [];
      const nextClassText = todayClasses.length > 0 ? `${todayClasses[0].subject} at ${todayClasses[0].time.split(' - ')[0]}` : "No classes today!";
      const displayTarget = hydration.target || 2000;

      return (
        <View style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <Ionicons name="sunny-outline" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={styles.briefingTitle}>Today's Snapshot 🌅</Text>
          </View>
          <Text style={styles.briefingSubtitle}>Morning briefing card ritual for {profile.name}</Text>
          <View style={styles.bulletList}>
            <View style={styles.bulletRow}>
              <Ionicons name="list" size={14} color="#C2A878" style={{ marginRight: 8 }} />
              <Text style={styles.bulletText}>Tasks due today: {todayTasks.length} ({completedTodayTasks} completed)</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="school" size={14} color="#7C9B7A" style={{ marginRight: 8 }} />
              <Text style={styles.bulletText}>Next Class: {nextClassText}</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="water" size={14} color="#4B6BFB" style={{ marginRight: 8 }} />
              <Text style={styles.bulletText}>Hydration level: {hydration.water} / {displayTarget} ml</Text>
            </View>
          </View>
          
          <View style={styles.randomDataBox}>
            <Ionicons name="analytics" size={12} color="#C2A878" style={{ marginRight: 6 }} />
            <Text style={styles.randomDataText}>
              Unexpected stat: You've completed {pomodoroStats.roundsToday || 3} Pomodoros today — that's {((pomodoroStats.roundsToday || 3) * 25 / 60).toFixed(1)} hours of deep study!
            </Text>
          </View>
        </View>
      );
    }

    return null;
  };

  const getClassStatusMessage = (classTimeStr) => {
    try {
      const parts = classTimeStr.split(' - ');
      if (parts.length < 2) return null;
      const startStr = parts[0].trim();
      const endStr = parts[1].trim();

      const [startHour, startMin] = startStr.split(':').map(Number);
      const [endHour, endMin] = endStr.split(':').map(Number);

      const now = new Date();
      const nowHour = now.getHours();
      const nowMin = now.getMinutes();

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const nowMinutes = nowHour * 60 + nowMin;

      if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
        return { status: 'ongoing', text: 'Ongoing Class 📖', color: '#7C9B7A' };
      } else if (nowMinutes < startMinutes) {
        const diff = startMinutes - nowMinutes;
        if (diff < 60) {
          return { status: 'starting', text: `Starts in ${diff}m ⏳`, color: diff < 5 ? '#D4836A' : '#C2A878' };
        } else {
          const hours = Math.floor(diff / 60);
          const mins = diff % 60;
          return { status: 'later', text: `Starts in ${hours}h ${mins}m`, color: '#8B92A0' };
        }
      } else {
        return { status: 'past', text: 'Ended', color: '#5A6070' };
      }
    } catch (e) {
      return null;
    }
  };

  const getSmartSuggestion = () => {
    const currentHour = new Date().getHours();
    
    // Find first incomplete task for today
    const pendingTask = todayTasks.find(t => !t.completed);
    
    // Find next class for today
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = weekdays[new Date().getDay()];
    const todayClasses = timetable && timetable[todayDay] ? timetable[todayDay] : [];

    const getMinutesUntilClass = (classTimeStr) => {
      try {
        const parts = classTimeStr.split(' - ');
        if (parts.length < 2) return -1;
        const startStr = parts[0].trim();
        const [startHour, startMin] = startStr.split(':').map(Number);
        const now = new Date();
        const nowHour = now.getHours();
        const nowMin = now.getMinutes();
        const startMinutes = startHour * 60 + startMin;
        const nowMinutes = nowHour * 60 + nowMin;
        return startMinutes - nowMinutes;
      } catch (e) {
        return -1;
      }
    };

    // Check if any class starts in 15 to 35 minutes
    if (todayClasses.length > 0) {
      for (const cls of todayClasses) {
        const diff = getMinutesUntilClass(cls.time);
        if (diff >= 15 && diff <= 35) {
          return {
            icon: 'timer-outline',
            text: `"${cls.subject}" starts in ${diff} min! Do a quick 25-min focused study block?`,
            action: () => navigation.navigate('Timer', { selectTaskId: pendingTask?.id }),
            btnText: 'Focus Now',
            color: '#4B6BFB'
          };
        }
      }
    }

    if (currentHour >= 6 && currentHour < 12) {
      if (todayClasses.length > 0) {
        return {
          icon: 'school-outline',
          text: `Today's classes scheduled! Next up: ${todayClasses[0].subject} at ${todayClasses[0].time.split(' - ')[0]}.`,
          action: () => navigation.navigate('Schedule'),
          btnText: 'View Timetable',
          color: '#7C9B7A'
        };
      }
      return {
        icon: 'sunny-outline',
        text: "Morning Ritual: Setup today's schedule and focus targets.",
        action: () => navigation.navigate('Schedule'),
        btnText: 'Open Schedule',
        color: '#C2A878'
      };
    } else if (currentHour >= 12 && currentHour < 18) {
      if (pendingTask) {
        return {
          icon: 'play-outline',
          text: `Peak Study Hours! Start focus timer for "${pendingTask.title}".`,
          action: () => navigation.navigate('Timer', { selectTaskId: pendingTask.id }),
          btnText: 'Start Pomodoro',
          color: '#4B6BFB'
        };
      }
      return {
        icon: 'book-outline',
        text: 'All tasks completed! Revise your whiteboard scanned notes.',
        action: () => navigation.navigate('NotesWorkspace'),
        btnText: 'Read Notes',
        color: '#C2A878'
      };
    } else if (currentHour >= 18 && currentHour < 21) {
      const uncheckedHabits = habits.filter(h => !h.logs || !h.logs.includes(todayStr)).length;
      if (uncheckedHabits > 0) {
        return {
          icon: 'sparkles-outline',
          text: `You have ${uncheckedHabits} habits unchecked. Keep your streak alive!`,
          action: () => navigation.navigate('Habits'),
          btnText: 'Check Habits',
          color: '#A878C2'
        };
      }
      return {
        icon: 'water-outline',
        text: 'Drink some water to hit your daily hydration goals.',
        action: () => navigation.navigate('Habits'),
        btnText: 'Hydration Log',
        color: '#4B6BFB'
      };
    } else {
      return {
        icon: 'moon-outline',
        text: 'Wind-down hour: plan tomorrow & record your sleep quality.',
        action: () => setShowWindDown(true),
        btnText: 'Start Wind-down',
        color: '#FFE5B4'
      };
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0F1115' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
      
      {/* Background Soft Glow Tint */}
      <View 
        style={[
          styles.glowTopRight, 
          { backgroundColor: glow.topColor, opacity: glow.opacity }
        ]} 
        pointerEvents="none" 
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: headerConfig.backgroundColor, borderBottomWidth: 1, borderBottomColor: headerConfig.borderColor }]}>
        <TouchableOpacity onPress={() => setShowHub(true)} style={styles.hamburger}>
          <Ionicons name="menu" size={28} color="#F3F1EC" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: activeTheme.themeId === 'exams' || isExamWeek ? '#E11D48' : '#F3F1EC' }]}>
            {activeTheme.themeId === 'diwali' ? 'Shubh Planory' : activeTheme.themeId === 'independence' ? 'Jai Hind Desk' : headerConfig.title}
          </Text>
          {isExamWeek && (
            <View style={styles.examModeBadge}>
              <Text style={styles.examModeBadgeText}>EXAM WEEK</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => setIsEditingLayout(!isEditingLayout)} style={styles.reorderToggle}>
            <Ionicons name={isEditingLayout ? "checkmark-done" : "build-outline"} size={20} color={isEditingLayout ? activeTheme.primaryColor : "#8B92A0"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowStreakModal(true)} style={styles.headerStreak}>
            <Ionicons name={activeTheme.streakIcon} size={20} color={headerConfig.streakColor} />
            <Text style={[styles.headerStreakText, { color: headerConfig.streakColor }]}>{(streaks.tasks || 0) + (streaks.focus || 0)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView 
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#C2A878']} 
              tintColor="#C2A878" 
            />
          }
        >
          
          {/* Dynamic greeting banner */}
          <View style={[styles.greetingBanner, (activeTheme.themeId === 'exams' || isExamWeek) && { borderColor: 'rgba(225, 29, 72, 0.2)' }]}>
            <Text style={[styles.greetingTitle, { color: activeTheme.themeId === 'exams' || isExamWeek ? '#E11D48' : '#F3F1EC' }]}>
              {activeTheme.greetingPrefix ? `${activeTheme.greetingPrefix}, ` : ''}{greetingText}
            </Text>
            <Text style={styles.greetingSub}>{activeTheme.brandingMessage || contextualSub}</Text>
          </View>

          {/* Daily Pulse Mini-Stats Row */}
          <View style={styles.dailyPulseRow}>
            <View style={[styles.pulseCard, { borderLeftColor: '#4B6BFB' }]}>
              <Ionicons name="checkbox-outline" size={16} color="#4B6BFB" />
              <Text style={styles.pulseVal}>{completedTodayTasks}/{todayTasks.length}</Text>
              <Text style={styles.pulseLabel}>Tasks</Text>
            </View>
            <View style={[styles.pulseCard, { borderLeftColor: '#FF8C00' }]}>
              <Ionicons name="timer-outline" size={16} color="#FF8C00" />
              <Text style={styles.pulseVal}>{pomodoroStats.roundsToday}</Text>
              <Text style={styles.pulseLabel}>Focus</Text>
            </View>
            <View style={[styles.pulseCard, { borderLeftColor: '#7C9B7A' }]}>
              <Ionicons name="flame-outline" size={16} color="#7C9B7A" />
              <Text style={styles.pulseVal}>
                {habits.filter(h => h.logs && h.logs.includes(todayStr)).length}/{habits.length}
              </Text>
              <Text style={styles.pulseLabel}>Habits</Text>
            </View>
            <View style={[styles.pulseCard, { borderLeftColor: '#00BFFF' }]}>
              <Ionicons name="water-outline" size={16} color="#00BFFF" />
              <Text style={styles.pulseVal}>
                {(() => {
                  const displayWaterTarget = hydration.target || 2000;
                  const displayWaterCurrent = hydration.water || 0;
                  return Math.round(Math.min((displayWaterCurrent / (displayWaterTarget || 2000)) * 100, 100));
                })()}%
              </Text>
              <Text style={styles.pulseLabel}>Water</Text>
            </View>
          </View>

          {/* Smart Contextual Guidance recommendation box */}
          {(() => {
            const suggestion = getSmartSuggestion();
            if (!suggestion) return null;
            return (
              <TouchableOpacity 
                style={[styles.smartSuggestionBox, { borderLeftColor: suggestion.color }]} 
                onPress={suggestion.action}
                activeOpacity={0.8}
              >
                <View style={[styles.smartSuggestionIconCircle, { backgroundColor: `${suggestion.color}15` }]}>
                  <Ionicons name={suggestion.icon} size={20} color={suggestion.color} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.smartSuggestionTitle}>RECOMMENDED ACTION</Text>
                  <Text style={styles.smartSuggestionText}>{suggestion.text}</Text>
                </View>
                <View style={[styles.smartSuggestionBtn, { backgroundColor: suggestion.color }]}>
                  <Text style={styles.smartSuggestionBtnText}>{suggestion.btnText}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* Hot summer day weather hydration nudge */}
          {showWeatherNudge && (
            <View style={styles.weatherNudgeBox}>
              <Ionicons name="sunny" size={20} color="#FFD700" style={{ marginRight: 10 }} />
              <Text style={styles.weatherNudgeText}>Hot sunny day outside! Stay hydrated: drink at least 3L water today. ☀️</Text>
            </View>
          )}

          {/* Morning briefing card / Sunday preview ritual */}
          {renderBriefingCard()}

          {/* Night Wind-down Alert banner (If 9 PM and not done) */}
          {(() => {
            const currentHour = new Date().getHours();
            const isWindDownTime = currentHour >= 21 || currentHour < 4;
            const ratingKey = `rating_${todayStr}`;
            const alreadyRatedToday = dayRatings && dayRatings[ratingKey] !== undefined;
            if (isWindDownTime && !alreadyRatedToday) {
              return (
                <TouchableOpacity style={styles.windDownBanner} onPress={() => setShowWindDown(true)}>
                  <Ionicons name="moon" size={24} color="#FFE5B4" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.windDownBannerTitle}>Wind-Down Routine Ready</Text>
                    <Text style={styles.windDownBannerSub}>Plan tomorrow, carry-over tasks, and prep sleep.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#FFE5B4" />
                </TouchableOpacity>
              );
            }
            return null;
          })()}

          {/* Dynamic widgets rendering loop */}
          {(() => {
            const config = [...dashboardConfig];
            if (!config.some(w => w.id === 'heatmap')) {
              config.push({ id: 'heatmap', title: 'Study Heatmap', visible: true, size: 'full' });
            }
            return config;
          })().map((widget, index) => {
            if (!widget.visible) return null;
            
            let widgetContent = null;
            
            if (widget.id === 'profile') {
              widgetContent = widget.size === 'full' ? (
                /* Profile Card Full */
                <TouchableOpacity 
                  style={[styles.profileCard, activeTheme.themeId === 'exams' && { borderColor: 'rgba(225, 29, 72, 0.15)' }]} 
                  onPress={() => navigation.navigate('ProfileWorkspace')}
                  activeOpacity={0.9}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person" size={24} color={activeTheme.primaryColor} />
                    </View>
                    <View style={{ marginLeft: 16, flex: 1 }}>
                      <Text style={styles.name}>{profile.name}</Text>
                      <Text style={styles.bio} numberOfLines={1}>{profile.bio || 'Desk Builder'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#5A6070" style={{ marginLeft: 8 }} />
                  </View>
                  <View style={{ marginTop: 24 }}>
                    <View style={styles.levelHeader}>
                      <Text style={[styles.levelText, { color: activeTheme.primaryColor }]}>{getLevelTitle(gamification.level)} (LVL {gamification.level})</Text>
                      <Text style={styles.xpText}>{gamification.xp} / {gamification.level * 100} XP</Text>
                    </View>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${xpProgress}%`, backgroundColor: activeTheme.primaryColor }]} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                /* Profile Card Compact */
                <TouchableOpacity 
                  style={styles.profileCardCompact} 
                  onPress={() => navigation.navigate('ProfileWorkspace')}
                  activeOpacity={0.9}
                >
                  <Ionicons name="person-circle" size={28} color={activeTheme.primaryColor} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.profileCompactName}>{profile.name} (LVL {gamification.level})</Text>
                    <Text style={styles.profileCompactXp}>{gamification.xp} / {gamification.level * 100} XP</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#5A6070" />
                </TouchableOpacity>
              );
            } else if (widget.id === 'quests') {
              widgetContent = widget.size === 'full' ? (
                /* Quests Full */
                <View style={styles.sectionNoMargin}>
                  <View style={styles.questsCard}>
                    <TouchableOpacity 
                      style={styles.questRow}
                      onPress={handleTapHydrationQuest}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name={questWaterMet ? "checkmark-circle" : "ellipse-outline"} 
                        size={20} 
                        color={questWaterMet ? "#7C9B7A" : "#5A6070"} 
                        style={{ marginRight: 12 }}
                      />
                      <Text style={[styles.questText, questWaterMet && styles.questTextCompleted]}>
                        Log 1.5L Hydration ({currentWaterAmount}/{questWaterGoal} ml)
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.questDivider} />
                    <TouchableOpacity 
                      style={styles.questRow}
                      onPress={handleTapFocusQuest}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name={questFocusMet ? "checkmark-circle" : "ellipse-outline"} 
                        size={20} 
                        color={questFocusMet ? "#7C9B7A" : "#5A6070"} 
                        style={{ marginRight: 12 }}
                      />
                      <Text style={[styles.questText, questFocusMet && styles.questTextCompleted]}>
                        Complete 2 Pomodoro Rounds ({(pomodoroStats.roundsToday || 0)}/2)
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.questDivider} />
                    <TouchableOpacity 
                      style={styles.questRow}
                      onPress={handleTapTasksQuest}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name={questTasksMet ? "checkmark-circle" : "ellipse-outline"} 
                        size={20} 
                        color={questTasksMet ? "#7C9B7A" : "#5A6070"} 
                        style={{ marginRight: 12 }}
                      />
                      <Text style={[styles.questText, questTasksMet && styles.questTextCompleted]}>
                        Complete 3 Scheduled Tasks ({completedTodayTasks}/3)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Quests Compact */
                <View style={styles.questsCardCompact}>
                  <Text style={styles.questCompactTitle}>DAILY QUESTS PROGRESS</Text>
                  <Text style={styles.questCompactProgress}>
                    {((questWaterMet?1:0) + (questFocusMet?1:0) + (questTasksMet?1:0))}/3 Completed • {allQuestsCompleted ? "All Clean! 🎉" : "Grinding..."}
                  </Text>
                </View>
              );
            } else if (widget.id === 'productivity') {
              widgetContent = widget.size === 'full' ? (
                /* Productivity Score Full */
                <View style={styles.sectionNoMargin}>
                  <View style={styles.scoreCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.gradeCircle, { borderColor: activeTheme.primaryColor }]}>
                          <Text style={[styles.scoreGrade, { color: activeTheme.primaryColor }]}>{dailyGrade}</Text>
                        </View>
                        <View style={{ marginLeft: 12 }}>
                          <Text style={styles.scoreTitle}>{focusStatus}</Text>
                          <Text style={styles.scoreSub}>{completedTodayTasks} / {todayTasks.length} Tasks completed</Text>
                        </View>
                      </View>
                      <Ionicons name={statusIcon} size={28} color={statusColor} />
                    </View>
                    <View style={styles.plantProgressBg}>
                      <View style={[styles.plantProgressFill, { width: `${plantProgress}%`, backgroundColor: activeTheme.primaryColor }]} />
                    </View>
                    <Text style={styles.scoreDesc}>{statusDesc}</Text>
                  </View>
                </View>
              ) : (
                /* Productivity Score Compact */
                <View style={styles.scoreCardCompact}>
                  <Text style={styles.scoreCompactTitle}>Grade: {dailyGrade} ({completedTodayTasks}/{todayTasks.length} Tasks)</Text>
                  <Text style={styles.scoreCompactDesc}>{focusStatus}</Text>
                </View>
              );
            } else if (widget.id === 'calendar') {
              widgetContent = widget.size === 'full' ? (
                /* Calendar Full */
                <View style={styles.sectionNoMargin}>
                  <View style={styles.calendarToggle}>
                    <TouchableOpacity style={[styles.toggleBtn, calendarView === 'weekly' && styles.toggleBtnActive]} onPress={() => setCalendarView('weekly')}>
                      <Text style={[styles.toggleBtnText, calendarView === 'weekly' && styles.toggleBtnTextActive]}>Weekly</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.toggleBtn, calendarView === 'monthly' && styles.toggleBtnActive]} onPress={() => setCalendarView('monthly')}>
                      <Text style={[styles.toggleBtnText, calendarView === 'monthly' && styles.toggleBtnTextActive]}>Monthly Grid</Text>
                    </TouchableOpacity>
                  </View>

                  {calendarView === 'monthly' ? (
                    <View style={styles.customCalendarContainer}>
                      <View style={styles.calendarHeader}>
                        <TouchableOpacity onPress={handlePrevMonth}>
                          <Ionicons name="chevron-back" size={20} color={activeTheme.primaryColor} />
                        </TouchableOpacity>
                        <Text style={styles.calendarHeaderTitle}>
                          {currentMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                        <TouchableOpacity onPress={handleNextMonth}>
                          <Ionicons name="chevron-forward" size={20} color={activeTheme.primaryColor} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.dayNamesRow}>
                        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                          <Text key={day} style={styles.dayNameCell}>{day}</Text>
                        ))}
                      </View>

                      <View style={styles.gridContainer}>
                        {generateMonthDays(currentMonthDate).map((cell, index) => {
                          const cellDateStr = cell.date.toISOString().split('T')[0];
                          const cellTasks = tasks.filter(t => t.date === cellDateStr);
                          const isToday = cellDateStr === todayStr;
                          const isSelected = selectedCalendarDate === cellDateStr;
                          
                          const completedCount = cellTasks.filter(t => t.completed).length;
                          const pendingCount = cellTasks.length - completedCount;
                          
                          return (
                            <TouchableOpacity 
                              key={index} 
                              style={[
                                styles.gridCell, 
                                !cell.isCurrentMonth && styles.gridCellMuted,
                                isToday && styles.gridCellToday,
                                isSelected && styles.gridCellSelected
                              ]}
                              onPress={() => setSelectedCalendarDate(cellDateStr)}
                            >
                              <Text style={[
                                styles.cellDayText, 
                                !cell.isCurrentMonth && styles.cellDayTextMuted,
                                isToday && { color: activeTheme.primaryColor }
                              ]}>
                                {cell.date.getDate()}
                              </Text>
                              {cellTasks.length > 0 && (
                                <View style={styles.dotsRow}>
                                  {Array.from({ length: Math.min(completedCount, 3) }).map((_, i) => (
                                    <View key={`c-${i}`} style={[styles.dot, styles.dotCompleted]} />
                                  ))}
                                  {Array.from({ length: Math.min(pendingCount, 3) }).map((_, i) => (
                                    <View key={`p-${i}`} style={[styles.dot, styles.dotPending]} />
                                  ))}
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.calendarCardCompact}>
                      <Text style={styles.calendarCompactTitle}>WEEKLY ROUTINE RUNNING</Text>
                      <Text style={styles.calendarCompactDesc}>Open Schedule Tab below to review week layout.</Text>
                    </View>
                  )}
                </View>
              ) : (
                /* Calendar Compact */
                <View style={styles.calendarCardCompact}>
                  <Text style={styles.calendarCompactTitle}>STUDY CALENDAR</Text>
                  <Text style={styles.calendarCompactDesc}>
                    {calendarView === 'monthly' ? "Monthly Grid active" : "Weekly Schedule active"}.
                  </Text>
                </View>
              );
            } else if (widget.id === 'tasks') {
              widgetContent = widget.size === 'full' ? (
                /* Tasks Full */
                <View style={styles.sectionNoMargin}>
                  <View style={{ marginTop: 12 }}>
                    {todayTasks.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>Clear schedule. A calm mind starts here.</Text>
                      </View>
                    ) : (
                      todayTasks.map(item => (
                        <TouchableOpacity 
                          key={item.id}
                          style={[styles.taskCard, item.completed && styles.taskCardCompleted]}
                          onPress={() => toggleTask(item.id)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.checkbox, item.completed && [styles.checkboxChecked, { backgroundColor: activeTheme.primaryColor, borderColor: activeTheme.primaryColor }]]} />
                          <Text style={[styles.taskTitle, item.completed && styles.taskTitleCompleted]}>
                            {item.title}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}

                    {/* Inline Task Input Row */}
                    <View style={styles.inlineInputRow}>
                      <TextInput
                        style={styles.inlineTaskInput}
                        value={newTaskText}
                        onChangeText={setNewTaskText}
                        placeholder="Add a new task for today..."
                        placeholderTextColor="#5A6070"
                        onSubmitEditing={handleAddTask}
                      />
                      <TouchableOpacity style={[styles.inlineAddBtn, { backgroundColor: activeTheme.primaryColor }]} onPress={handleAddTask}>
                        <Ionicons name="add" size={20} color="#0F1115" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                /* Tasks Compact */
                <View style={styles.tasksCardCompact}>
                  <Text style={styles.tasksCompactTitle}>TODAY'S STUDY LIST</Text>
                  <Text style={styles.tasksCompactDesc}>
                    {todayTasks.filter(t => !t.completed).length} pending study targets.
                  </Text>
                </View>
              );
            } else if (widget.id === 'sleep') {
              widgetContent = widget.size === 'full' ? (
                /* Sleep Tracker Full */
                <View style={styles.sleepTrackerFull}>
                  
                  <View style={styles.sleepInputRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sleepInputLabel}>Bedtime</Text>
                      <TextInput 
                        style={styles.sleepTimeInput}
                        value={sleepBedTime}
                        onChangeText={setSleepBedTime}
                        placeholder="22:30"
                        placeholderTextColor="#5A6070"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sleepInputLabel}>Wake time</Text>
                      <TextInput 
                        style={styles.sleepTimeInput}
                        value={sleepWakeTime}
                        onChangeText={setSleepWakeTime}
                        placeholder="06:30"
                        placeholderTextColor="#5A6070"
                      />
                    </View>
                  </View>
                  
                  <Text style={styles.sleepInputLabel}>Sleep Quality (1-5)</Text>
                  <View style={styles.sleepRatingRow}>
                    {[1, 2, 3, 4, 5].map(val => (
                      <TouchableOpacity 
                        key={val} 
                        style={[styles.sleepRatingBtn, sleepRating === val && [styles.sleepRatingBtnActive, { backgroundColor: activeTheme.primaryColor, borderColor: activeTheme.primaryColor }]]}
                        onPress={() => setSleepRating(val)}
                      >
                        <Text style={[styles.sleepRatingBtnText, sleepRating === val && { color: '#0F1115' }]}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={[styles.sleepSaveBtn, { backgroundColor: activeTheme.primaryColor }]} onPress={handleLogSleep}>
                    <Text style={styles.sleepSaveBtnText}>Save Sleep Log</Text>
                  </TouchableOpacity>

                  {/* Bar Chart */}
                  {sleepLogs.length > 0 && (
                    <View style={{ marginTop: 20 }}>
                      <Text style={styles.sleepInputLabel}>WEEKLY SLEEP TRENDS</Text>
                      <View style={styles.sleepBarChart}>
                        {sleepLogs.slice(0, 7).reverse().map((log, idx) => {
                          const barHeight = Math.min((log.hours / 10) * 80, 80);
                          const isUnderSleeping = log.hours < 6;
                          const dateObj = new Date(log.date);
                          const dayInitial = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
                          
                          return (
                            <View key={idx} style={styles.sleepBarCol}>
                              <Text style={styles.sleepBarVal}>{log.hours}h</Text>
                              <View style={[styles.sleepBarFill, { height: barHeight, backgroundColor: isUnderSleeping ? '#C47070' : '#7C9B7A' }]} />
                              <Text style={styles.sleepBarLabel}>{dayInitial}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Tip nudge */}
                  <View style={styles.sleepTipCard}>
                    <Ionicons name="bulb-outline" size={16} color={activeTheme.primaryColor} style={{ marginRight: 8 }} />
                    <Text style={styles.sleepTipText}>
                      {sleepLogs.length > 0 && sleepLogs[0].hours < 6 
                        ? `You slept ${sleepLogs[0].hours}h last night. Consider a 20-min nap before your afternoon study session.`
                        : "Great sleep! A fully charged brain is ready for deep focus. Let's hit our targets today."
                      }
                    </Text>
                  </View>
                </View>
              ) : (
                /* Sleep Tracker Compact */
                <View style={styles.sleepTrackerCompact}>
                  <Ionicons name="moon-outline" size={18} color={activeTheme.primaryColor} style={{ marginRight: 8 }} />
                  <Text style={styles.sleepCompactText}>
                    Last Night Sleep: {sleepLogs.length > 0 ? `${sleepLogs[0].hours}h (${sleepLogs[0].rating}/5)` : 'No sleep logged.'}
                  </Text>
                </View>
              );
            } else if (widget.id === 'timetable') {
              widgetContent = widget.size === 'full' ? (
                /* Timetable Full */
                <View style={styles.sleepTrackerFull}>
                  {(() => {
                    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const todayDay = weekdays[new Date().getDay()];
                    const todayClasses = timetable && timetable[todayDay] ? timetable[todayDay] : [];
                    if (todayClasses.length === 0) {
                      return <Text style={styles.noClassesText}>No classes scheduled for today! 💤</Text>;
                    }
                    return todayClasses.map((cls) => {
                      const status = getClassStatusMessage(cls.time);
                      const classKey = `${cls.subject}_${cls.time}`;
                      const isAttended = attendance?.attended?.[todayStr]?.includes(classKey);
                      return (
                        <TouchableOpacity 
                          key={cls.id || classKey} 
                          style={[styles.classWidgetRow, isAttended && styles.classWidgetRowAttended]}
                          onPress={() => toggleClassAttended(cls)}
                          activeOpacity={0.8}
                        >
                          <View style={[
                            styles.classCheckCircle, 
                            isAttended && { backgroundColor: '#7C9B7A', borderColor: '#7C9B7A' }
                          ]}>
                            {isAttended && <Ionicons name="checkmark" size={12} color="#0F1115" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.classWidgetSubject, isAttended && styles.classWidgetSubjectAttended]}>{cls.subject}</Text>
                            <Text style={styles.classWidgetTime}>{cls.time} • {cls.room || 'No Room'}</Text>
                          </View>
                          {isAttended ? (
                            <View style={[styles.classStatusPill, { backgroundColor: 'rgba(124, 155, 122, 0.15)' }]}>
                              <Text style={[styles.classStatusText, { color: '#7C9B7A' }]}>Attended ✓</Text>
                            </View>
                          ) : (
                            status && (
                              <View style={[styles.classStatusPill, { backgroundColor: `${status.color}15` }]}>
                                <Text style={[styles.classStatusText, { color: status.color }]}>{status.text}</Text>
                              </View>
                            )
                          )}
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </View>
              ) : (
                /* Timetable Compact */
                <View style={styles.timetableWidgetCompact}>
                  <Ionicons name="school-outline" size={18} color={activeTheme.primaryColor} style={{ marginRight: 8 }} />
                  <Text style={styles.timetableCompactText} numberOfLines={1}>
                    {(() => {
                      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                      const todayDay = weekdays[new Date().getDay()];
                      const todayClasses = timetable && timetable[todayDay] ? timetable[todayDay] : [];
                      if (todayClasses.length === 0) return 'No classes today! Sleep/study mode.';
                      const status = getClassStatusMessage(todayClasses[0].time);
                      const statusSuffix = status ? ` (${status.text})` : '';
                      return `Next: ${todayClasses[0].subject} at ${todayClasses[0].time.split(' - ')[0]}${statusSuffix}`;
                    })()}
                  </Text>
                </View>
              );
            } else if (widget.id === 'quote') {
              widgetContent = widget.size === 'full' ? (
                /* Quote Full */
                <View style={styles.quoteCardFull}>
                  <Ionicons name="quote" size={24} color="rgba(194,168,120,0.15)" style={{ alignSelf: 'flex-start', marginBottom: 4 }} />
                  <Text style={styles.quoteCardText}>
                    “Success is the sum of small efforts, repeated day-in and day-out.”
                  </Text>
                  <Text style={styles.quoteCardAuthor}>— Robert Collier</Text>
                  <View style={styles.quoteTipGlow}>
                    <Text style={styles.quoteTipText}>Tip: Try break study sessions into 25 min blocks. It helps you prevent backlogs!</Text>
                  </View>
                </View>
              ) : (
                /* Quote Compact */
                <View style={styles.quoteCardCompact}>
                  <Text style={styles.quoteCompactText} numberOfLines={1}>
                    “Success is the sum of small efforts, repeated daily.”
                  </Text>
                </View>
              );
            } else if (widget.id === 'heatmap') {
              widgetContent = (
                <View style={styles.sectionNoMargin}>
                  <View style={styles.heatmapCard}>
                    <View style={styles.heatmapDaysRow}>
                      {(() => {
                        const days = [];
                        for (let i = 6; i >= 0; i--) {
                          const d = new Date();
                          d.setDate(d.getDate() - i);
                          days.push(d);
                        }
                        return days.map((day, idx) => {
                          const dateStr = day.toISOString().split('T')[0];
                          const dayTasks = tasks.filter(t => t.date === dateStr);
                          const compTasks = dayTasks.filter(t => t.completed).length;
                          const compHabits = habits.filter(h => h.logs && h.logs.includes(dateStr)).length;
                          
                          const totalActivities = dayTasks.length + habits.length;
                          const compActivities = compTasks + compHabits;
                          
                          let squareColor = 'rgba(255, 255, 255, 0.03)';
                          
                          if (totalActivities > 0) {
                            const ratio = compActivities / totalActivities;
                            if (ratio >= 0.8) {
                              squareColor = '#7C9B7A'; // green
                            } else if (ratio >= 0.4) {
                              squareColor = '#C2A878'; // gold
                            } else if (compActivities > 0) {
                              squareColor = 'rgba(194, 168, 120, 0.3)'; // light gold
                            }
                          }

                          const isToday = dateStr === todayStr;
                          
                          return (
                            <View key={idx} style={styles.heatmapDayCol}>
                              <View 
                                style={[
                                  styles.heatmapSquare, 
                                  { backgroundColor: squareColor },
                                  isToday && { borderWidth: 1.5, borderColor: '#C2A878' }
                                ]} 
                              />
                              <Text style={styles.heatmapDayLabel}>
                                {day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}
                              </Text>
                              <Text style={styles.heatmapDateLabel}>
                                {day.getDate()}
                              </Text>
                            </View>
                          );
                        });
                      })()}
                    </View>
                    <View style={styles.heatmapLegendRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={[styles.legendSquare, { backgroundColor: 'rgba(255,255,255,0.03)' }]} />
                        <Text style={styles.legendText}>None</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={[styles.legendSquare, { backgroundColor: 'rgba(194, 168, 120, 0.3)' }]} />
                        <Text style={styles.legendText}>Low</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={[styles.legendSquare, { backgroundColor: '#C2A878' }]} />
                        <Text style={styles.legendText}>Med</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={[styles.legendSquare, { backgroundColor: '#7C9B7A' }]} />
                        <Text style={styles.legendText}>High</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }

            let titleText = widget.title || widget.id.toUpperCase();
            if (widget.id === 'quests') titleText = "DAILY QUESTS (XP MULTIPLIER)";
            if (widget.id === 'productivity') titleText = "TODAY'S PRODUCTIVITY";
            if (widget.id === 'calendar') titleText = "STUDY CALENDAR";
            if (widget.id === 'tasks') titleText = "TODAY'S TASKS";
            if (widget.id === 'sleep') titleText = "SLEEP TRACKING";
            if (widget.id === 'timetable') titleText = "TODAY'S CLASSES";
            if (widget.id === 'quote') titleText = "QUOTE OF THE DAY";
            if (widget.id === 'heatmap') titleText = "STUDY HEATMAP (LAST 7 DAYS)";
            if (widget.id === 'profile') titleText = "STUDENT ID PROFILE";

            const isCollapsed = collapsedWidgets[widget.id];

            const wrappedContent = (
              <View style={{ marginBottom: 20 }}>
                <TouchableOpacity 
                  style={styles.collapsibleWidgetHeader} 
                  onPress={() => toggleWidgetCollapse(widget.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sectionTitle}>{titleText}</Text>
                  <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={16} color="#5A6070" />
                </TouchableOpacity>
                {!isCollapsed && widgetContent}
              </View>
            );

            return renderWidgetWrapper(widget, wrappedContent, index);
          })}

          {/* Add Widget Button Row */}
          {isEditingLayout && (
            <TouchableOpacity style={styles.addWidgetBtnRow} onPress={() => setShowAddWidgetModal(true)}>
              <Ionicons name="add" size={18} color="#C2A878" style={{ marginRight: 6 }} />
              <Text style={styles.addWidgetBtnRowText}>Add Widgets or Manage Items</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </Animated.View>

      {/* Daily Login Reward Modal */}
      <Modal
        visible={showLoginModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loginModalContent}>
            <Ionicons name="gift" size={54} color="#C2A878" style={{ marginBottom: 12 }} />
            <Text style={styles.loginModalTitle}>Daily Login Reward!</Text>
            <Text style={styles.loginModalStreak}>Streak: Day {loginReward?.streak || 1}</Text>
            <Text style={styles.loginModalDesc}>Here is some fuel to unlock your study targets.</Text>
            
            <View style={styles.loginBonusBox}>
              <Text style={styles.loginBonusText}>+ {loginRewardXp} XP</Text>
            </View>

            <TouchableOpacity 
              style={styles.loginClaimBtn} 
              onPress={() => {
                setShowLoginModal(false);
                Vibration.vibrate(40);
                if (confettiRef.current) confettiRef.current.startBurst();
              }}
            >
              <Text style={styles.loginClaimBtnText}>Claim Points</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Streak Dashboard Modal */}
      <Modal
        visible={showStreakModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowStreakModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.loginModalContent, { width: '90%', padding: 24 }]}>
            <Text style={styles.loginModalTitle}>Streak Dashboard</Text>
            <Text style={[styles.loginModalDesc, { marginBottom: 20 }]}>Maintain study targets daily to build your streaks.</Text>
            
            {/* Streak Counters */}
            <View style={styles.streakGrid}>
              <View style={styles.streakPanelRow}>
                <Ionicons name="checkmark-done" size={20} color="#7C9B7A" />
                <Text style={styles.streakPanelLabel}>Tasks Completed Streak</Text>
                <Text style={styles.streakPanelVal}>{streaks.tasks || 0} days</Text>
                {(streaks.prev_tasks || 0) > 0 && (
                  <TouchableOpacity onPress={() => handleReviveStreak('tasks')} style={styles.reviveBtn}>
                    <Text style={styles.reviveBtnText}>Revive (50XP)</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.streakPanelRow}>
                <Ionicons name="timer" size={20} color="#C47070" />
                <Text style={styles.streakPanelLabel}>Pomodoro Focus Streak</Text>
                <Text style={styles.streakPanelVal}>{streaks.focus || 0} days</Text>
                {(streaks.prev_focus || 0) > 0 && (
                  <TouchableOpacity onPress={() => handleReviveStreak('focus')} style={styles.reviveBtn}>
                    <Text style={styles.reviveBtnText}>Revive (50XP)</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.streakPanelRow}>
                <Ionicons name="water" size={20} color="#7B93B0" />
                <Text style={styles.streakPanelLabel}>Water Logged Streak</Text>
                <Text style={styles.streakPanelVal}>{streaks.hydration || 0} days</Text>
                {(streaks.prev_hydration || 0) > 0 && (
                  <TouchableOpacity onPress={() => handleReviveStreak('hydration')} style={styles.reviveBtn}>
                    <Text style={styles.reviveBtnText}>Revive (50XP)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Streak Shield Section */}
            <View style={styles.shieldCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="shield-checkmark" size={24} color="#C2A878" style={{ marginRight: 10 }} />
                  <View>
                    <Text style={styles.shieldTitle}>Streak Shield</Text>
                    <Text style={styles.shieldSubtitle}>Active: {streaks.shields || 0} available</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleBuyShield} style={styles.buyShieldBtn}>
                  <Text style={styles.buyShieldText}>Buy (30XP)</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.loginClaimBtn, { marginTop: 24 }]} onPress={() => setShowStreakModal(false)}>
              <Text style={styles.loginClaimBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Calendar Day Schedule Modal */}
      <Modal
        visible={selectedCalendarDate !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedCalendarDate(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Daily Schedule</Text>
            <Text style={styles.modalSubtitle}>For: {selectedCalendarDate}</Text>
            
            <ScrollView style={styles.modalTasksScroll}>
              {selectedDateTasks.length === 0 ? (
                <Text style={styles.emptyModalTasks}>No tasks scheduled for this day.</Text>
              ) : (
                selectedDateTasks.map(t => (
                  <View key={t.id} style={styles.modalTaskRow}>
                    <TouchableOpacity style={styles.modalTaskLeft} onPress={() => toggleTask(t.id)}>
                      <View style={[styles.modalCheckbox, t.completed && styles.modalCheckboxChecked]} />
                      <Text style={[styles.modalTaskText, t.completed && styles.modalTaskTextCompleted]}>{t.title}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteTask(t.id)}>
                      <Ionicons name="trash-outline" size={16} color="#C47070" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalInput}
                placeholder="Schedule new task..."
                placeholderTextColor="#5A6070"
                value={modalNewTaskText}
                onChangeText={setModalNewTaskText}
                onSubmitEditing={handleAddModalTask}
              />
              <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddModalTask}>
                <Ionicons name="add" size={20} color="#0F1115" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => {
                  setSelectedCalendarDate(null);
                  setModalNewTaskText('');
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hamburger Hub Overlay */}
      <WorkspaceHubModal visible={showHub} onClose={() => setShowHub(false)} />

      {/* Night Wind-down Overlay Modal */}
      <WindDownModal 
        visible={showWindDown}
        onClose={() => setShowWindDown(false)}
        tasks={tasks}
        setTasks={setTasks}
        timetable={timetable}
        userId={userId}
        hydration={hydration}
        habits={habits}
        pomodoroStats={pomodoroStats}
        expenses={expenses}
      />

      {/* Add Widget Selection Modal */}
      <Modal
        visible={showAddWidgetModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddWidgetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.loginModalContent, { width: '85%' }]}>
            <Text style={styles.modalTitle}>Manage Widgets</Text>
            <Text style={[styles.modalSubtitle, { marginBottom: 16 }]}>Tap to add back widgets to your dashboard.</Text>
            
            <ScrollView style={{ maxHeight: 200, width: '100%', marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
              {dashboardConfig.filter(w => !w.visible).length === 0 ? (
                <Text style={{ color: '#5A6070', fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>All widgets are active on your dashboard!</Text>
              ) : (
                dashboardConfig.filter(w => !w.visible).map(w => (
                  <TouchableOpacity 
                    key={w.id} 
                    style={styles.addWidgetItemRow} 
                    onPress={() => handleAddWidget(w.id)}
                  >
                    <Text style={styles.addWidgetItemName}>{w.title}</Text>
                    <Ionicons name="add-circle" size={20} color="#C2A878" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.loginClaimBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
              onPress={() => setShowAddWidgetModal(false)}
            >
              <Text style={[styles.loginClaimBtnText, { color: '#8B92A0' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New semester kickoff modal */}
      <Modal visible={showKickoffModal} transparent={true} animationType="fade">
        <View style={styles.kickoffOverlay}>
          <View style={styles.kickoffCard}>
            <Ionicons name="rocket-outline" size={60} color="#10B981" style={{ marginBottom: 16 }} />
            <Text style={styles.kickoffTitle}>New Term / Semester Kickoff! 🚀</Text>
            <Text style={styles.kickoffSubtitle}>"New term, new you — set your goals"</Text>
            <Text style={styles.kickoffDesc}>
              Clear your mind, set your study targets, and start your daily habits fresh. Let's make this term your best one!
            </Text>
            <TouchableOpacity 
              style={styles.kickoffBtn}
              onPress={async () => {
                await AsyncStorage.setItem(`kickoff_dismissed_${new Date().getFullYear()}_${new Date().getMonth()}`, 'true');
                setShowKickoffModal(false);
              }}
            >
              <Text style={styles.kickoffBtnText}>Set My Goals</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confetti simulator */}
      <ConfettiBurst ref={confettiRef} />

      {/* XP Fly-Up Animation */}
      <XPFlyAnimation ref={xpFlyRef} />

      {/* Tooltip Tutorial Sequence */}
      {tooltipStep > 0 && (
        <View style={styles.tooltipOverlay}>
          <View style={styles.tooltipCard}>
            <View style={styles.tooltipHeader}>
              <Ionicons 
                name={
                  tooltipStep === 1 ? "timer-outline" :
                  tooltipStep === 2 ? "flame-outline" : "water-outline"
                } 
                size={28} 
                color="#C2A878" 
              />
              <Text style={styles.tooltipTitle}>
                {tooltipStep === 1 ? "1. Focus Desk Timer" :
                 tooltipStep === 2 ? "2. Daily Habits" : "3. Hydration Log"}
              </Text>
            </View>
            <Text style={styles.tooltipText}>
              {tooltipStep === 1 ? "Commit to an intention task, play offline white noise mix, and study distraction-free. Completed sessions award XP!" :
               tooltipStep === 2 ? "Build consistency rings by checking off your habits. Planory streak shields protect you on busy days." :
               "Set sensible hydration targets (e.g. 2000ml) and track your daily intake easily from the Habits deck."}
            </Text>
            <View style={styles.tooltipActions}>
              <Text style={styles.tooltipStepsIndicator}>{tooltipStep} of 3</Text>
              <TouchableOpacity style={styles.tooltipNextBtn} onPress={handleNextTooltip}>
                <Text style={styles.tooltipNextText}>{tooltipStep === 3 ? "Get Started" : "Next →"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  editControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: -1,
  },
  editWidgetTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#8B92A0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(194, 168, 120, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnDisabled: {
    opacity: 0.3,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  container: { 
    flex: 1, 
    backgroundColor: '#0F1115',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  hamburger: { padding: 4 },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#F3F1EC' },
  headerStreak: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#171B22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  headerStreakText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#C2A878', marginLeft: 6 },
  
  profileCard: { 
    backgroundColor: '#171B22', 
    borderRadius: 24, 
    padding: 24, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: 'rgba(194, 168, 120, 0.15)', // Gold tinted premium border
    shadowColor: '#C2A878',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 4
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(194, 168, 120, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#F3F1EC' },
  bio: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', marginTop: 4, fontSize: 13 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  levelText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#C2A878', fontSize: 11, letterSpacing: 0.5 },
  xpText: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#8B92A0', fontSize: 11 },
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#C2A878' },

  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5A6070', letterSpacing: 1, marginBottom: 12 },
  
  questsCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12
  },
  questText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#F3F1EC',
    flex: 1
  },
  questTextCompleted: {
    color: '#8B92A0',
    textDecorationLine: 'line-through'
  },
  questDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },

  scoreCard: { 
    backgroundColor: '#171B22', 
    borderRadius: 20, 
    padding: 20, 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3
  },
  scoreGrade: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#C2A878' },
  gradeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(194, 168, 120, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.2)'
  },
  scoreTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#F3F1EC' },
  scoreSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: '#8B92A0', marginTop: 2 },
  plantProgressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  plantProgressFill: { height: '100%', backgroundColor: '#7C9B7A', borderRadius: 3 },
  scoreDesc: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', fontSize: 13, lineHeight: 20, marginTop: 12 },

  calendarToggle: { flexDirection: 'row', backgroundColor: '#171B22', borderRadius: 12, padding: 4, marginBottom: 12 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#1D2430' },
  toggleBtnText: { color: '#8B92A0', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  toggleBtnTextActive: { color: '#C2A878' },

  customCalendarContainer: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)'
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4
  },
  calendarHeaderTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 15
  },
  dayNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingBottom: 6
  },
  dayNameCell: {
    width: '13%',
    marginHorizontal: '0.64%',
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#5A6070',
    fontSize: 10
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'space-between'
  },
  gridCell: {
    width: '13%',
    height: 52,
    marginHorizontal: '0.64%',
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#0F1115',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent'
  },
  gridCellMuted: {
    opacity: 0.25
  },
  gridCellToday: {
    backgroundColor: 'rgba(194, 168, 120, 0.08)',
    borderColor: 'rgba(194, 168, 120, 0.2)'
  },
  gridCellSelected: {
    borderColor: '#C2A878',
    backgroundColor: '#171B22'
  },
  cellDayText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 12
  },
  cellDayTextMuted: {
    color: '#5A6070'
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2
  },
  dotCompleted: {
    backgroundColor: '#7C9B7A'
  },
  dotPending: {
    backgroundColor: '#C2A878'
  },

  taskCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#171B22', 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.03)',
    borderLeftWidth: 3,
    borderLeftColor: '#C2A878', // Premium Gold left accent
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2
  },
  taskCardCompleted: { 
    opacity: 0.6, 
    borderLeftColor: '#7C9B7A' // Success Sage green left accent
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', marginRight: 12 },
  checkboxChecked: { backgroundColor: '#C2A878', borderColor: '#C2A878' },
  taskTitle: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 15, flex: 1 },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: '#8B92A0' },
  emptyState: { padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed', borderRadius: 16 },
  emptyStateText: { fontFamily: 'PlusJakartaSans_400Regular', color: '#8B92A0', fontSize: 14 },

  inlineInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  inlineTaskInput: { flex: 1, backgroundColor: '#0F1115', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#F3F1EC', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, marginRight: 10 },
  inlineAddBtn: { width: 44, height: 44, backgroundColor: '#C2A878', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    width: '90%',
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#F3F1EC'
  },
  modalSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginTop: 4,
    marginBottom: 16
  },
  modalTasksScroll: {
    maxHeight: 180,
    marginBottom: 16
  },
  emptyModalTasks: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12
  },
  modalTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.03)'
  },
  modalTaskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12
  },
  modalCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 10
  },
  modalCheckboxChecked: {
    backgroundColor: '#C2A878',
    borderColor: '#C2A878'
  },
  modalTaskText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#F3F1EC',
    fontSize: 12,
    flex: 1
  },
  modalTaskTextCompleted: {
    color: '#8B92A0',
    textDecorationLine: 'line-through'
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  modalInput: {
    flex: 1,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginRight: 8
  },
  modalAddBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#C2A878',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12
  },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13
  },

  // Daily Login styles
  loginModalContent: {
    backgroundColor: '#171B22',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '80%',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.2)'
  },
  loginModalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
    textAlign: 'center'
  },
  loginModalStreak: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#C2A878',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  loginModalDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#8B92A0',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20
  },
  loginBonusBox: {
    backgroundColor: 'rgba(194, 168, 120, 0.1)',
    borderWidth: 1.5,
    borderColor: '#C2A878',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 24
  },
  loginBonusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 22
  },
  loginClaimBtn: {
    backgroundColor: '#C2A878',
    width: '100%',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  loginClaimBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 14
  },

  // Streak Modal Grid
  streakGrid: {
    width: '100%',
    gap: 12,
    marginBottom: 20
  },
  streakPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  streakPanelLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC',
    flex: 1,
    marginLeft: 8
  },
  streakPanelVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#C2A878',
    marginRight: 6
  },
  reviveBtn: {
    backgroundColor: '#C47070',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  reviveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 9
  },
  shieldCard: {
    backgroundColor: 'rgba(194, 168, 120, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    padding: 16,
    borderRadius: 16,
    width: '100%'
  },
  shieldTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 13
  },
  shieldSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 11,
    marginTop: 2
  },
  buyShieldBtn: {
    backgroundColor: '#C2A878',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  buyShieldText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 11
  },

  // Dynamic Greetings Banner
  greetingBanner: {
    backgroundColor: '#171B22',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    padding: 24,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden'
  },
  glowOverlay: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#C2A878',
    opacity: 0.03
  },
  greetingTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: '#F3F1EC',
    marginBottom: 4
  },
  greetingSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#8B92A0',
    lineHeight: 18
  },

  // Wind-Down routine banner
  windDownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131929',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 229, 180, 0.25)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20
  },
  windDownBannerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFE5B4'
  },
  windDownBannerSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2
  },

  // Reorder edit layout controls
  reorderToggle: {
    padding: 6,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10
  },
  widgetCardContainer: {
    width: '100%'
  },
  widgetEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A212E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.2)'
  },
  widgetEditTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#C2A878',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  widgetEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  addWidgetBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#C2A878',
    backgroundColor: 'rgba(194, 168, 120, 0.03)',
    marginTop: 10,
    marginBottom: 30
  },
  addWidgetBtnRowText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 13
  },
  addWidgetItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#0F1115',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)'
  },
  addWidgetItemName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC'
  },

  // Compact card versions
  profileCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  profileCompactName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC'
  },
  profileCompactXp: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2
  },
  questsCardCompact: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  questCompactTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5
  },
  questCompactProgress: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#7C9B7A',
    marginTop: 4
  },
  scoreCardCompact: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  scoreCompactTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC'
  },
  scoreCompactDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2
  },
  calendarCardCompact: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  calendarCompactTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5
  },
  calendarCompactDesc: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC',
    marginTop: 4
  },
  tasksCardCompact: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  tasksCompactTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5
  },
  tasksCompactDesc: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC',
    marginTop: 4
  },
  sectionNoMargin: {
    width: '100%'
  },

  // Sleep widget detailed views
  sleepTrackerFull: {
    backgroundColor: '#171B22',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3
  },
  sleepInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginTop: 8
  },
  sleepInputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6
  },
  sleepTimeInput: {
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
  sleepRatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4
  },
  sleepRatingBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sleepRatingBtnActive: {
    backgroundColor: '#C2A878',
    borderColor: '#C2A878'
  },
  sleepRatingBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0'
  },
  sleepSaveBtn: {
    backgroundColor: '#C2A878',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sleepSaveBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },
  sleepBarChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 100,
    backgroundColor: '#0F1115',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginTop: 6
  },
  sleepBarCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '12%'
  },
  sleepBarVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#8B92A0',
    marginBottom: 4
  },
  sleepBarFill: {
    width: 8,
    borderRadius: 4,
    backgroundColor: '#7C9B7A',
    minHeight: 4
  },
  sleepBarLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: '#5A6070',
    marginTop: 6
  },
  sleepTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(194, 168, 120, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    borderRadius: 14,
    padding: 12,
    marginTop: 16
  },
  sleepTipText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 11,
    flex: 1,
    lineHeight: 16
  },
  sleepTrackerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  sleepCompactText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 13
  },

  // Timetable class rows
  classWidgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)'
  },
  classWidgetRowAttended: {
    borderColor: 'rgba(124, 155, 122, 0.2)',
    opacity: 0.75
  },
  classCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  classWidgetBullet: {
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: '#C2A878',
    marginRight: 12
  },
  classWidgetSubject: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 13
  },
  classWidgetSubjectAttended: {
    textDecorationLine: 'line-through',
    color: '#8B92A0'
  },
  classWidgetTime: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 11,
    marginTop: 2
  },
  noClassesText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12
  },
  timetableWidgetCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  timetableCompactText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 13,
    flex: 1
  },

  // Quotes
  quoteCardFull: {
    backgroundColor: '#171B22',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 20,
    alignItems: 'center'
  },
  quoteCardText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#F3F1EC',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20
  },
  quoteCardAuthor: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 11,
    marginTop: 8,
    alignSelf: 'flex-end'
  },
  quoteTipGlow: {
    backgroundColor: 'rgba(194, 168, 120, 0.05)',
    borderRadius: 10,
    padding: 8,
    marginTop: 16,
    width: '100%'
  },
  quoteTipText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 10,
    textAlign: 'center'
  },
  quoteCardCompact: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  quoteCompactText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#8B92A0',
    fontSize: 13,
    fontStyle: 'italic'
  },
  
  // New styles for briefings, kickoff, weather nudges and exam modes
  examModeBadge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8
  },
  examModeBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#0F1115'
  },
  weatherNudgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1810',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20
  },
  weatherNudgeText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#F59E0B',
    flex: 1,
    lineHeight: 16
  },
  briefingCard: {
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  briefingTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#F3F1EC'
  },
  briefingSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginBottom: 16
  },
  briefingStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F1115',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14
  },
  briefingStatItem: {
    alignItems: 'center',
    flex: 1
  },
  briefingStatVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#C2A878'
  },
  briefingStatLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#5A6070',
    marginTop: 2
  },
  briefingQuote: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    fontStyle: 'italic',
    textAlign: 'center'
  },
  bulletList: {
    gap: 8,
    marginBottom: 14
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  bulletText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0'
  },
  randomDataBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(194, 168, 120, 0.05)',
    borderRadius: 10,
    padding: 8
  },
  randomDataText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#8B92A0',
    lineHeight: 14,
    flex: 1
  },
  
  // Kickoff Modal styles
  kickoffOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.95)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  kickoffCard: {
    width: width * 0.85,
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center'
  },
  kickoffTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: '#10B981',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  kickoffSubtitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
    marginBottom: 16
  },
  kickoffDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24
  },
  kickoffBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  kickoffBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },
  
  // Daily Pulse Row
  dailyPulseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16
  },
  pulseCard: {
    flex: 1,
    backgroundColor: '#171B22',
    borderRadius: 12,
    padding: 8,
    borderLeftWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.01)'
  },
  pulseVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#F3F1EC',
    marginTop: 4
  },
  pulseLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: '#5A6070',
    marginTop: 2
  },

  // Smart Contextual Suggestion
  smartSuggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 12,
    borderLeftWidth: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)'
  },
  smartSuggestionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  smartSuggestionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#5A6070',
    letterSpacing: 1
  },
  smartSuggestionText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#F3F1EC',
    marginTop: 2,
    lineHeight: 14
  },
  smartSuggestionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  smartSuggestionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#0F1115'
  },

  // Timetable Class status pills
  classStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  classStatusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9
  },

  // Heatmap styles
  heatmapCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 20
  },
  heatmapDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  heatmapDayCol: {
    alignItems: 'center'
  },
  heatmapSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginBottom: 6
  },
  heatmapDayLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#5A6070'
  },
  heatmapDateLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
    color: '#3A4050',
    marginTop: 1
  },
  heatmapLegendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2
  },
  legendText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070'
  },
  // Tooltip Styles
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 11, 15, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 24,
  },
  tooltipCard: {
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: '#C2A878',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    shadowColor: '#C2A878',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  tooltipTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#F3F1EC',
  },
  tooltipText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#8B92A0',
    lineHeight: 20,
    marginBottom: 24,
  },
  tooltipActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipStepsIndicator: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#5A6070',
    fontSize: 12,
  },
  tooltipNextBtn: {
    backgroundColor: '#C2A878',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  tooltipNextText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13,
  },
  collapsibleWidgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
