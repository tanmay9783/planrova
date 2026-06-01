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

const getTaskSubjectBadge = (title) => {
  const t = (title || '').toLowerCase();
  if (t.includes('physics') || t.includes('phy') || t.includes('mechanics') || t.includes('kinematics') || t.includes('thermo')) {
    return { name: 'Physics', color: '#4B6BFB' };
  } else if (t.includes('math') || t.includes('integration') || t.includes('calculus') || t.includes('algebra') || t.includes('trig') || t.includes('limits') || t.includes('stats')) {
    return { name: 'Math', color: '#10B981' };
  } else if (t.includes('chemistry') || t.includes('chem') || t.includes('organic') || t.includes('inorganic') || t.includes('physical chem')) {
    return { name: 'Chemistry', color: '#8B5CF6' };
  } else if (t.includes('biology') || t.includes('bio') || t.includes('botany') || t.includes('zoology')) {
    return { name: 'Biology', color: '#EC4899' };
  } else if (t.includes('cs') || t.includes('code') || t.includes('programming') || t.includes('python') || t.includes('java') || t.includes('javascript') || t.includes('html') || t.includes('react')) {
    return { name: 'CompSci', color: '#3B82F6' };
  }
  return { name: 'Study', color: '#BA7517' };
};

const formatTaskDate = (dateStr) => {
  if (!dateStr) return 'No Date';
  try {
    const d = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', weekday: 'short' };
    return d.toLocaleDateString('en-US', options); // e.g. "Wed, Jun 3"
  } catch (e) {
    return dateStr;
  }
};

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
  const [profile, setProfile] = useFirestoreData('user_profile', { name: emailPrefix, bio: 'Builder', avatar: null });
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [tasks, setTasks] = useFirestoreData('tasks', []);
  const [hydration, setHydration] = useFirestoreData('hydration', { water: 0, target: 2000 });
  const [pomodoroStats, setPomodoroStats] = useFirestoreData('pomodoro_stats', { roundsToday: 0, date: new Date().toLocaleDateString('en-CA') });
  
  // New Layout & Feature states
  const [timetable] = useFirestoreData('timetable', { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] });
  const [dayRatings, setDayRatings] = useFirestoreData('day_ratings', {});
  const [sleepLogs, setSleepLogs] = useFirestoreData('sleep_logs', []);
  const [semesterDates] = useFirestoreData('semester_dates', { start: '2026-01-01', end: '2026-06-30', examStart: '', examEnd: '' });
  const [habits] = useFirestoreData('user_habits', []);
  const [attendance, setAttendance] = useFirestoreData('attendance', { attended: {} });
  const [expenses] = useFirestoreData('expenses', []);
  
  const defaultDashboardConfig = [
    { id: "quests", title: "Daily Quests", visible: true, size: "full" },
    { id: "productivity", title: "Today's Productivity", visible: true, size: "full" },
    { id: "tasks", title: "Today's Tasks", visible: true, size: "full" },
    { id: "calendar", title: "Study Calendar", visible: true, size: "full" }
  ];
  const [dashboardConfig, setDashboardConfig] = useFirestoreData('dashboard_config', defaultDashboardConfig);

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
  const [loginReward, setLoginReward] = useFirestoreData('login_rewards', { lastClaimed: '', streak: 0 });
  const loginCheckedRef = useRef(false);
  const [dailyQuestStatus, setDailyQuestStatus] = useFirestoreData('daily_quest_status', { date: '', claimed: false });
  const [streaks, setStreaks] = useFirestoreData('streaks', {
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

  const getLocalDateString = (date = new Date()) => {
    return date.toLocaleDateString('en-CA');
  };
  const todayStr = getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

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

  const getUpcomingTasksThisWeek = () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const endOfWeek = new Date(startOfDay);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    const upcoming = tasks.filter(t => {
      if (t.completed || !t.date) return false;
      const tDate = new Date(t.date);
      return tDate >= startOfDay && tDate <= endOfWeek;
    });

    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming.slice(0, 3);
  };

  const upcomingTasksList = getUpcomingTasksThisWeek();

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
              <Ionicons name="arrow-up" size={14} color={isFirstRaw ? "#444" : "#BA7517"} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.editBtn, isLastRaw && styles.editBtnDisabled]} 
              onPress={() => !isLastRaw && handleSwapWidgets(index, 1)}
              disabled={isLastRaw}
            >
              <Ionicons name="arrow-down" size={14} color={isLastRaw ? "#444" : "#BA7517"} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.editBtn} 
              onPress={() => handleToggleWidgetSize(widget.id)}
            >
              <Ionicons name={widget.size === 'compact' ? "expand-outline" : "contract-outline"} size={14} color="#BA7517" />
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
    if (!loginReward) return;
    if (loginReward.lastClaimed === todayStr) {
      loginCheckedRef.current = true;
      return;
    }
    if (loginCheckedRef.current) return;

    loginCheckedRef.current = true;

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
      statusColor = '#BA7517';
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
          streakColor: '#BA7517',
          textColor: '#BA7517'
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
            <Ionicons name="calendar-outline" size={20} color="#BA7517" style={{ marginRight: 8 }} />
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
              <Ionicons name="list" size={14} color="#BA7517" style={{ marginRight: 8 }} />
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
            <Ionicons name="analytics" size={12} color="#BA7517" style={{ marginRight: 6 }} />
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
          return { status: 'starting', text: `Starts in ${diff}m ⏳`, color: diff < 5 ? '#D4836A' : '#BA7517' };
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
        color: '#BA7517'
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
        color: '#BA7517'
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
          <Ionicons name="menu-outline" size={24} color="#F3F1EC" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.headerTitle, { color: isExamWeek ? '#E11D48' : '#F3F1EC' }]}>
            {headerConfig.title}
          </Text>
          {isExamWeek && (
            <View style={styles.examModeBadge}>
              <Text style={styles.examModeBadgeText}>EXAM WEEK</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => navigation.navigate('AlarmWorkspace')} style={styles.headerCircleBtn}>
            <Ionicons name="alarm-outline" size={18} color="#8B92A0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowStreakModal(true)} style={styles.streakPill}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakCountText}>{(streaks.tasks || 0) + (streaks.focus || 0)}</Text>
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
              colors={['#BA7517']} 
              tintColor="#BA7517" 
            />
          }
        >
          
          {/* Mockup Greeting Banner */}
          <View style={styles.mockGreetingCard}>
            <Text style={styles.mockGreetingTitle}>
              Good {timeOfDayProfile === 'morning' ? 'morning' : timeOfDayProfile === 'afternoon' ? 'afternoon' : timeOfDayProfile === 'evening' ? 'evening' : 'night'}, {profile.name}! 🌙
            </Text>
            <Text style={styles.mockGreetingSub}>
              {timeOfDayProfile === 'night' ? 'Late night grind? ⚡' : 'Time to focus and build streaks! 🚀'}
            </Text>
          </View>

          {/* Daily Pulse Mini-Stats Row (3 Columns) */}
          <View style={styles.mockStatsRow}>
            {/* Tasks Card */}
            <View style={styles.mockStatCard}>
              <View style={[styles.mockStatIconBg, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Ionicons name="checkbox-outline" size={16} color="#3B82F6" />
              </View>
              <Text style={styles.mockStatValue}>{completedTodayTasks}/{todayTasks.length}</Text>
              <Text style={styles.mockStatLabel}>Tasks</Text>
            </View>

            {/* Focus Card */}
            <View style={styles.mockStatCard}>
              <View style={[styles.mockStatIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                <Ionicons name="timer-outline" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.mockStatValue}>{pomodoroStats.roundsToday || 0}</Text>
              <Text style={styles.mockStatLabel}>Focus</Text>
            </View>

            {/* Habits Card */}
            <View style={styles.mockStatCard}>
              <View style={[styles.mockStatIconBg, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <Ionicons name="flame-outline" size={16} color="#10B981" />
              </View>
              <Text style={styles.mockStatValue}>
                {habits.filter(h => h.logs && h.logs.includes(todayStr)).length}/{habits.length}
              </Text>
              <Text style={styles.mockStatLabel}>Habits</Text>
            </View>
          </View>

          {/* Wind-down hour prompts (If night) */}
          {(() => {
            const currentHour = new Date().getHours();
            const isNight = currentHour >= 21 || currentHour < 4;
            if (!isNight) return null;
            return (
              <View style={{ gap: 10, marginBottom: 20 }}>
                {/* Wind-down start card */}
                <View style={styles.mockWindDownCard}>
                  <View style={styles.mockWindDownHeader}>
                    <Text style={styles.mockWindDownEmoji}>🌙</Text>
                    <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                      <Text style={styles.mockWindDownTitle}>Wind-down hour: plan tomorrow & record sleep quality.</Text>
                      <Text style={styles.mockWindDownDesc}>Wrap up your day mindfully.</Text>
                    </View>
                    <TouchableOpacity style={styles.mockWindDownStartBtn} onPress={() => setShowWindDown(true)}>
                      <Text style={styles.mockWindDownStartBtnText}>Start</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Wind-down ready card */}
                <TouchableOpacity style={styles.mockWindDownReadyCard} onPress={() => setShowWindDown(true)}>
                  <Text style={styles.mockWindDownEmoji}>🌙</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.mockWindDownReadyTitle}>Wind-Down Routine Ready</Text>
                    <Text style={styles.mockWindDownReadyDesc}>Plan tomorrow, carry-over tasks, and prep sleep.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#FFE5B4" />
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Daily Quests Widget */}
          <View style={styles.widgetCard}>
            <View style={styles.widgetHeaderRow}>
              <Text style={styles.widgetHeaderTitle}>DAILY QUESTS (XP MULTIPLIER)</Text>
              <Ionicons name="chevron-up" size={16} color="#5A6070" />
            </View>
            <View style={{ marginTop: 8 }}>
              {/* Quest 1 */}
              <TouchableOpacity 
                style={styles.questItemRow} 
                onPress={handleTapHydrationQuest}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={questWaterMet ? "checkmark-circle" : "ellipse-outline"} 
                  size={20} 
                  color={questWaterMet ? "#7C9B7A" : "#5A6070"} 
                  style={{ marginRight: 12 }}
                />
                <Text style={[styles.questText, questWaterMet && styles.questTextCompleted]}>Log 1.5L Hydration</Text>
                <Text style={styles.questProgressText}>{currentWaterAmount} / {questWaterGoal} ml</Text>
              </TouchableOpacity>
              <View style={styles.questSeparator} />

              {/* Quest 2 */}
              <TouchableOpacity 
                style={styles.questItemRow} 
                onPress={handleTapFocusQuest}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={questFocusMet ? "checkmark-circle" : "ellipse-outline"} 
                  size={20} 
                  color={questFocusMet ? "#7C9B7A" : "#5A6070"} 
                  style={{ marginRight: 12 }}
                />
                <Text style={[styles.questText, questFocusMet && styles.questTextCompleted]}>Complete 2 Pomodoro Rounds</Text>
                <Text style={styles.questProgressText}>{(pomodoroStats.roundsToday || 0)} / 2</Text>
              </TouchableOpacity>
              <View style={styles.questSeparator} />

              {/* Quest 3 */}
              <TouchableOpacity 
                style={styles.questItemRow} 
                onPress={handleTapFocusQuest}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={questTasksMet ? "checkmark-circle" : "ellipse-outline"} 
                  size={20} 
                  color={questTasksMet ? "#7C9B7A" : "#5A6070"} 
                  style={{ marginRight: 12 }}
                />
                <Text style={[styles.questText, questTasksMet && styles.questTextCompleted]}>Complete 3 Scheduled Tasks</Text>
                <Text style={styles.questProgressText}>{completedTodayTasks} / 3</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Today's Productivity Widget */}
          <View style={styles.widgetCard}>
            <Text style={styles.widgetHeaderTitle}>TODAY'S PRODUCTIVITY</Text>
            <View style={styles.productivityRow}>
              {/* Circle Ring */}
              <View style={[styles.productivityCircle, { borderColor: todayTasks.length > 0 ? '#BA7517' : '#5A6070' }]}>
                <Text style={styles.productivityCircleText}>
                  {todayTasks.length > 0 ? Math.round((completedTodayTasks / todayTasks.length) * 100) : 0}%
                </Text>
              </View>
              {/* Right side info */}
              <View style={{ flex: 1, marginLeft: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.productivityStatusText}>
                    {todayTasks.length > 0 && completedTodayTasks === todayTasks.length ? 'Complete' : 'Incomplete'}
                  </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Schedule')}>
                    <Text style={styles.productivityViewAll}>View All</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.productivityCountText}>
                  {completedTodayTasks}/{todayTasks.length} Tasks completed
                </Text>
              </View>
            </View>
            <Text style={styles.productivityHelpText}>
              {todayTasks.length === 0 
                ? 'No tasks completed. Add study targets to begin your focus sprint!'
                : completedTodayTasks === todayTasks.length 
                  ? 'Stellar performance! You completed today\'s study targets.'
                  : 'Keep going! Complete your study tasks to level up.'}
            </Text>
          </View>

          {/* Today's Tasks Widget */}
          <View style={styles.widgetCard}>
            <Text style={styles.widgetHeaderTitle}>TODAY'S TASKS</Text>
            
            {todayTasks.length === 0 ? (
              <Text style={styles.tasksEmptyText}>Clear schedule. A calm mind starts here.</Text>
            ) : (
              <View style={{ gap: 8, marginBottom: 12 }}>
                {todayTasks.map(item => (
                  <TouchableOpacity 
                    key={item.id}
                    style={[styles.taskItemRow, item.completed && styles.taskItemRowCompleted]}
                    onPress={() => toggleTask(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.taskCheckbox, item.completed && styles.taskCheckboxChecked]} />
                    <Text style={[styles.taskTitleText, item.completed && styles.taskTitleTextCompleted]}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Inline task adder */}
            <View style={styles.taskAdderBox}>
              <TextInput
                style={styles.taskAdderInput}
                value={newTaskText}
                onChangeText={setNewTaskText}
                placeholder="+ Add a new task for today..."
                placeholderTextColor="#5A6070"
                onSubmitEditing={handleAddTask}
              />
              {newTaskText.trim().length > 0 && (
                <TouchableOpacity style={styles.taskAdderBtn} onPress={handleAddTask}>
                  <Ionicons name="arrow-up-circle" size={24} color="#BA7517" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Study Calendar Widget */}
          <View style={styles.widgetCard}>
            <Text style={styles.widgetHeaderTitle}>STUDY CALENDAR</Text>

            {/* Calendar Segment Controller */}
            <View style={styles.calendarSegmentRow}>
              <TouchableOpacity 
                style={[styles.calendarSegmentBtn, calendarView === 'weekly' && styles.calendarSegmentBtnActive]} 
                onPress={() => setCalendarView('weekly')}
              >
                <Text style={[styles.calendarSegmentBtnText, calendarView === 'weekly' && styles.calendarSegmentBtnTextActive]}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.calendarSegmentBtn, calendarView === 'monthly' && styles.calendarSegmentBtnActive]} 
                onPress={() => setCalendarView('monthly')}
              >
                <Text style={[styles.calendarSegmentBtnText, calendarView === 'monthly' && styles.calendarSegmentBtnTextActive]}>Monthly Grid</Text>
              </TouchableOpacity>
            </View>

            {calendarView === 'weekly' ? (
              /* Weekly Days list */
              <View style={styles.weeklyDaysContainer}>
                {(() => {
                  const now = new Date();
                  const startOfWeek = new Date(now);
                  const currentDay = now.getDay();
                  const distance = currentDay === 0 ? -6 : 1 - currentDay;
                  startOfWeek.setDate(now.getDate() + distance);

                  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  return (
                    <View style={styles.weeklyDaysRow}>
                      {weekDays.map((dayName, idx) => {
                        const cellDate = new Date(startOfWeek);
                        cellDate.setDate(startOfWeek.getDate() + idx);
                        const isSelected = cellDate.toDateString() === now.toDateString();
                        return (
                          <View key={dayName} style={styles.weeklyDayCol}>
                            <Text style={styles.weeklyDayNameLabel}>{dayName}</Text>
                            <View style={[styles.weeklyDayNumberCircle, isSelected && styles.weeklyDayNumberCircleActive]}>
                              <Text style={[styles.weeklyDayNumberText, isSelected && styles.weeklyDayNumberTextActive]}>
                                {cellDate.getDate()}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            ) : (
              /* Monthly Calendar Grid */
              <View style={styles.customCalendarContainer}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={handlePrevMonth}>
                    <Ionicons name="chevron-back" size={20} color="#BA7517" />
                  </TouchableOpacity>
                  <Text style={styles.calendarHeaderTitle}>
                    {currentMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                  <TouchableOpacity onPress={handleNextMonth}>
                    <Ionicons name="chevron-forward" size={20} color="#BA7517" />
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
                          isToday && { color: '#BA7517' }
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

                {/* Upcoming Events List */}
                <Text style={styles.upcomingSectionTitle}>UPCOMING THIS WEEK</Text>
                {upcomingTasksList.length === 0 ? (
                  <View style={styles.emptyUpcomingCard}>
                    <Ionicons name="calendar-outline" size={24} color="#5A6070" style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyUpcomingText}>No upcoming events this week</Text>
                  </View>
                ) : (
                  <View style={styles.upcomingEventsList}>
                    {upcomingTasksList.map(item => {
                      const badgeInfo = getTaskSubjectBadge(item.title);
                      return (
                        <TouchableOpacity 
                          key={item.id} 
                          style={styles.upcomingEventCard} 
                          activeOpacity={0.8}
                          onPress={() => setSelectedCalendarDate(item.date)}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={[styles.eventBadge, { backgroundColor: `${badgeInfo.color}15` }]}>
                              <Text style={[styles.eventBadgeText, { color: badgeInfo.color }]}>{badgeInfo.name}</Text>
                            </View>
                            <Text style={styles.eventTitle}>{item.title}</Text>
                            <Text style={styles.eventTime}>{formatTaskDate(item.date)}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#5A6070" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Add Study Event Button */}
                <TouchableOpacity style={styles.addStudyEventBtn}>
                  <Text style={styles.addStudyEventBtnText}>+ Add Study Event</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Add Widget Button Row */}
          {isEditingLayout && (
            <TouchableOpacity style={styles.addWidgetBtnRow} onPress={() => setShowAddWidgetModal(true)}>
              <Ionicons name="add" size={18} color="#BA7517" style={{ marginRight: 6 }} />
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
            <Ionicons name="gift" size={54} color="#BA7517" style={{ marginBottom: 12 }} />
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
                  <Ionicons name="shield-checkmark" size={24} color="#BA7517" style={{ marginRight: 10 }} />
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
              {(() => {
                const allowedIds = ['quests', 'productivity', 'tasks', 'calendar'];
                const hidden = dashboardConfig.filter(w => allowedIds.includes(w.id) && !w.visible);
                if (hidden.length === 0) {
                  return (
                    <Text style={{ color: '#5A6070', fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>All widgets are active on your dashboard!</Text>
                  );
                }
                return hidden.map(w => (
                  <TouchableOpacity 
                    key={w.id} 
                    style={styles.addWidgetItemRow} 
                    onPress={() => handleAddWidget(w.id)}
                  >
                    <Text style={styles.addWidgetItemName}>{w.title}</Text>
                    <Ionicons name="add-circle" size={20} color="#BA7517" />
                  </TouchableOpacity>
                ));
              })()}
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
                color="#BA7517" 
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
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
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
  headerStreakText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#BA7517', marginLeft: 6 },
  
  profileCard: { 
    backgroundColor: '#171B22', 
    borderRadius: 24, 
    padding: 24, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: 'rgba(186, 117, 23, 0.15)', // Gold tinted premium border
    shadowColor: '#BA7517',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 4
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#F3F1EC' },
  bio: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', marginTop: 4, fontSize: 13 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  levelText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#BA7517', fontSize: 11, letterSpacing: 0.5 },
  xpText: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#8B92A0', fontSize: 11 },
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#BA7517' },

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
  scoreGrade: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#BA7517' },
  gradeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(186, 117, 23, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)'
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
  toggleBtnTextActive: { color: '#BA7517' },

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
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderColor: 'rgba(186, 117, 23, 0.2)'
  },
  gridCellSelected: {
    borderColor: '#BA7517',
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
    backgroundColor: '#BA7517'
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
    borderLeftColor: '#BA7517', // Premium Gold left accent
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
  checkboxChecked: { backgroundColor: '#BA7517', borderColor: '#BA7517' },
  taskTitle: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 15, flex: 1 },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: '#8B92A0' },
  emptyState: { padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed', borderRadius: 16 },
  emptyStateText: { fontFamily: 'PlusJakartaSans_400Regular', color: '#8B92A0', fontSize: 14 },

  inlineInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  inlineTaskInput: { flex: 1, backgroundColor: '#0F1115', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#F3F1EC', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, marginRight: 10 },
  inlineAddBtn: { width: 44, height: 44, backgroundColor: '#BA7517', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

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
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
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
    backgroundColor: '#BA7517',
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
    borderColor: 'rgba(186, 117, 23, 0.2)'
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
    color: '#BA7517',
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
    backgroundColor: 'rgba(186, 117, 23, 0.1)',
    borderWidth: 1.5,
    borderColor: '#BA7517',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 24
  },
  loginBonusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
    fontSize: 22
  },
  loginClaimBtn: {
    backgroundColor: '#BA7517',
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
    color: '#BA7517',
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
    backgroundColor: 'rgba(186, 117, 23, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
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
    backgroundColor: '#BA7517',
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
    backgroundColor: '#BA7517',
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
    borderColor: 'rgba(186, 117, 23, 0.2)'
  },
  widgetEditTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#BA7517',
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
    borderColor: '#BA7517',
    backgroundColor: 'rgba(186, 117, 23, 0.03)',
    marginTop: 10,
    marginBottom: 30
  },
  addWidgetBtnRowText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
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
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  sleepRatingBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0'
  },
  sleepSaveBtn: {
    backgroundColor: '#BA7517',
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
    backgroundColor: 'rgba(186, 117, 23, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
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
    backgroundColor: '#BA7517',
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
    color: '#BA7517',
    fontSize: 11,
    marginTop: 8,
    alignSelf: 'flex-end'
  },
  quoteTipGlow: {
    backgroundColor: 'rgba(186, 117, 23, 0.05)',
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
    borderColor: 'rgba(186, 117, 23, 0.15)',
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
    color: '#BA7517'
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
    backgroundColor: 'rgba(186, 117, 23, 0.05)',
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
    borderColor: '#BA7517',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    shadowColor: '#BA7517',
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
    backgroundColor: '#BA7517',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  tooltipNextText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13,
  },
  mockGreetingCard: {
    backgroundColor: 'rgba(255, 87, 34, 0.04)',
    borderColor: 'rgba(255, 87, 34, 0.15)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  mockGreetingTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
  },
  mockGreetingSub: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#FF5722',
    marginTop: 4,
  },
  mockStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  mockStatCard: {
    flex: 1,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 14,
  },
  mockStatIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  mockStatValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#F3F1EC',
  },
  mockStatLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070',
    marginTop: 2,
  },
  mockWindDownCard: {
    backgroundColor: 'rgba(255, 229, 180, 0.03)',
    borderColor: 'rgba(255, 229, 180, 0.12)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  mockWindDownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mockWindDownEmoji: {
    fontSize: 24,
  },
  mockWindDownTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
    lineHeight: 18,
  },
  mockWindDownDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2,
  },
  mockWindDownStartBtn: {
    backgroundColor: '#BA7517',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  mockWindDownStartBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#0F1115',
  },
  mockWindDownReadyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 229, 180, 0.1)',
    borderRadius: 16,
    padding: 16,
  },
  mockWindDownReadyTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFE5B4',
  },
  mockWindDownReadyDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2,
  },
  widgetCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 20,
  },
  widgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  widgetHeaderTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10.5,
    color: '#5A6070',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  questItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  questText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC',
    flex: 1,
  },
  questTextCompleted: {
    color: '#5A6070',
    textDecorationLine: 'line-through',
  },
  questProgressText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11.5,
    color: '#8B92A0',
    marginLeft: 10,
  },
  questSeparator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  productivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  productivityCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productivityCircleText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
  },
  productivityStatusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#F3F1EC',
  },
  productivityViewAll: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#BA7517',
  },
  productivityCountText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: '#8B92A0',
    marginTop: 2,
  },
  productivityHelpText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  tasksEmptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 13.5,
    textAlign: 'center',
    paddingVertical: 20,
  },
  taskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  taskItemRowCompleted: {
    opacity: 0.55,
  },
  taskCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 12,
  },
  taskCheckboxChecked: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517',
  },
  taskTitleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 13.5,
    flex: 1,
  },
  taskTitleTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#8B92A0',
  },
  taskAdderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    height: 48,
    marginTop: 10,
  },
  taskAdderInput: {
    flex: 1,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    height: '100%',
  },
  taskAdderBtn: {
    padding: 4,
  },
  calendarSegmentRow: {
    flexDirection: 'row',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  calendarSegmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  calendarSegmentBtnActive: {
    backgroundColor: '#BA7517',
  },
  calendarSegmentBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: '#5A6070',
  },
  calendarSegmentBtnTextActive: {
    color: '#0F1115',
  },
  weeklyDaysContainer: {
    paddingVertical: 6,
  },
  weeklyDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyDayCol: {
    alignItems: 'center',
    flex: 1,
  },
  weeklyDayNameLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10.5,
    color: '#5A6070',
    marginBottom: 8,
  },
  weeklyDayNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  weeklyDayNumberCircleActive: {
    backgroundColor: '#BA7517',
  },
  weeklyDayNumberText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
  },
  weeklyDayNumberTextActive: {
    color: '#0F1115',
  },
  upcomingSectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },
  upcomingEventsList: {
    gap: 8,
    marginBottom: 16,
  },
  upcomingEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  eventBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  eventBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: '#F3F1EC',
  },
  eventTime: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2,
  },
  addStudyEventBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  addStudyEventBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13,
  },
  headerCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#171B22',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5722',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  streakEmoji: {
    fontSize: 12,
  },
  streakCountText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
    marginLeft: 4,
  },
  examModeBadge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  examModeBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9.5,
    color: '#FFFFFF',
  },
  emptyUpcomingCard: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginVertical: 10,
  },
  emptyUpcomingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#8B92A0',
  },
});
