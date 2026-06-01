import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Modal, TextInput, Animated, Vibration, Alert, ActivityIndicator, Linking, RefreshControl, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callOcrProxy } from '../config/api';

export default function ScheduleScreen() {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [tasks, setTasks] = useFirestoreData('tasks', []);
  const [pomodoroStats] = useFirestoreData('pomodoro_stats', { roundsToday: 0 });
  const [expenses] = useFirestoreData('expenses', []);
  const [habits] = useFirestoreData('user_habits', []);
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [timetable] = useFirestoreData('timetable', { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] });
  
  // Segment view control: 'weekly' or 'semester'
  const [scheduleView, setScheduleView] = useState('weekly');

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };
  
  // Semester Planner States
  const [semesterDates, setSemesterDates] = useFirestoreData('semester_dates', { 
    start: '2026-01-01', 
    end: '2026-06-30',
    examStart: '',
    examEnd: ''
  });
  const [semesterEvents, setSemesterEvents] = useFirestoreData('semester_events', []);
  
  const [editingDates, setEditingDates] = useState(false);
  const [semStartInput, setSemStartInput] = useState('2026-01-01');
  const [semEndInput, setSemEndInput] = useState('2026-06-30');
  const [examStartInput, setExamStartInput] = useState('');
  const [examEndInput, setExamEndInput] = useState('');

  useEffect(() => {
    if (semesterDates) {
      setSemStartInput(semesterDates.start || '2026-01-01');
      setSemEndInput(semesterDates.end || '2026-06-30');
      setExamStartInput(semesterDates.examStart || '');
      setExamEndInput(semesterDates.examEnd || '');
    }
  }, [semesterDates]);
  
  // Form add states
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState('exam'); // exam, internal, viva, holiday, fest
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Timeline filter state
  const [selectedTimelineWeek, setSelectedTimelineWeek] = useState(0); // 0 means all
  
  // Import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(0); // 1-4
  const [showImportReview, setShowImportReview] = useState(false);
  const [importedEvents, setImportedEvents] = useState([]);
  const [scanError, setScanError] = useState(null);
  const [lastBase64, setLastBase64] = useState(null);
  const importBeamAnim = useRef(new Animated.Value(0)).current;


  const [activeDate, setActiveDate] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');

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
      try {
        const tObj = tasks.find(x => x.id === taskId);
        awardXP(userId, gamification, 10, `Completed task: ${tObj?.title || 'Study'}`).then(setGamification);
      } catch (err) {
        // ignore
      }
    }
  };

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(25)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleAddTask = () => {
    if (!newTaskText.trim() || !activeDate) return;
    const newTask = {
      id: Date.now().toString(),
      title: newTaskText.trim(),
      completed: false,
      date: activeDate
    };
    setTasks([...tasks, newTask]);
    setNewTaskText('');
    setActiveDate(null);
  };

  const handleDeleteTask = (taskId) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  // Get current week dates
  const getWeekDates = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; // Monday
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(curr.getFullYear(), curr.getMonth(), first + i);
      dates.push(d);
    }
    return dates;
  };

  const getTomorrowDayName = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return days[tomorrow.getDay()];
  };

  const getTimetableRecommendation = () => {
    if (!timetable) return null;
    const tomorrowDay = getTomorrowDayName();
    const tomorrowClasses = timetable[tomorrowDay] || [];
    
    if (tomorrowClasses.length > 0) {
      const firstClass = tomorrowClasses[0];
      const className = firstClass.subject || firstClass.name || 'lecture';
      return {
        text: `Your ${className} starts tomorrow — add revision session?`,
        class: className,
        day: tomorrowDay
      };
    }
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];
    const todayClasses = timetable[todayDay] || [];
    if (todayClasses.length > 0) {
      const firstClass = todayClasses[0];
      const className = firstClass.subject || firstClass.name || 'lecture';
      return {
        text: `You had ${className} today — add revision or homework check?`,
        class: className,
        day: todayDay
      };
    }
    return null;
  };

  const handleTapRecommendation = (rec) => {
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = rec.day === getTomorrowDayName() ? tomorrowStr : todayStr;
    setActiveDate(targetDate);
    setNewTaskText(`Revise ${rec.class}`);
  };

  const handleShareStats = async () => {
    try {
      const message = `📊 My Weekly Study Stats on Planory:\n\n` +
        `✅ Tasks Done: ${completedThisWeek}/${totalThisWeek}\n` +
        `⏱️ Focus Time: ${hours}h ${minutes}m\n` +
        `💸 Spent: ₹${totalSpentThisWeek}\n` +
        `🔄 Habit Checks: ${totalHabitCompletionsThisWeek}\n\n` +
        `Join me on Planory to supercharge your studies! 🚀`;
      await Share.share({ message });
    } catch (error) {
      console.log('Error sharing stats:', error.message);
    }
  };

  const getEmptyDayMessage = (dayName) => {
    switch (dayName) {
      case 'Monday': return "Fresh week energy! Add your first lecture task.";
      case 'Tuesday': return "Midweek momentum! What are we study-grinding today?";
      case 'Wednesday': return "Halfway through! Keep the study engine warm.";
      case 'Thursday': return "Finish line in sight. Solve some questions!";
      case 'Friday': return "Almost weekend! Plan your revision early.";
      case 'Saturday': return "Weekend prep! Finish backlogs & assignments.";
      case 'Sunday': return "Rest day — focus on simple habits & recovery.";
      default: return "No tasks today! Add a study target to begin.";
    }
  };

  const weekDates = getWeekDates();
  
  const renderDayCard = (dateObj) => {
    const dayStr = dateObj.toISOString().split('T')[0];
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const dayTasks = tasks.filter(t => t.date === dayStr);
    const isToday = dayStr === todayStr;
    const isPast = dayStr < todayStr;
    const textOpacityStyle = isPast ? { opacity: 0.6 } : null;

    return (
      <TouchableOpacity 
        key={dayStr} 
        style={[styles.dayCard, isToday && { borderLeftWidth: 3, borderLeftColor: '#BA7517', backgroundColor: 'rgba(186, 117, 23, 0.1)' }]}
        onPress={() => setActiveDate(dayStr)}
        activeOpacity={0.9}
      >
        <View style={styles.dayHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={[styles.dayName, textOpacityStyle]}>{dayName}</Text>
            <Text style={[styles.dayDate, textOpacityStyle]}>{monthDate}</Text>
          </View>
          <Ionicons name="add-circle-outline" size={16} color="#BA7517" />
        </View>
        
        <View style={styles.tasksContainer}>
          {dayTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={14} color="#BA7517" style={{ marginBottom: 4 }} />
              <Text style={[styles.emptyText, textOpacityStyle]}>{getEmptyDayMessage(dayName)}</Text>
              <TouchableOpacity 
                style={styles.emptyAddBtn} 
                onPress={() => setActiveDate(dayStr)}
              >
                <Text style={styles.emptyAddBtnText}>+ Add Task</Text>
              </TouchableOpacity>
            </View>
          ) : (
            dayTasks.map(task => (
              <View key={task.id} style={styles.taskItem}>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                  onPress={() => toggleTask(task.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, task.completed && styles.checkboxChecked]} />
                  <Text style={[styles.taskTitle, task.completed && styles.taskTitleCompleted, textOpacityStyle]} numberOfLines={1}>
                    {task.title}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteTask(task.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={13} color="#C47070" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const leftColDays = [weekDates[0], weekDates[2], weekDates[4]]; // Mon, Wed, Fri
  const rightColDays = [weekDates[1], weekDates[3], weekDates[5], weekDates[6]]; // Tue, Thu, Sat, Sun

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  
  // Estimate focus time based on pomodoro stats (25 mins per round)
  const focusMinutes = pomodoroStats.roundsToday * 25;
  const hours = Math.floor(focusMinutes / 60);
  const minutes = focusMinutes % 60;

  // Calculations for Week Review
  const weekDatesStr = weekDates.map(d => d.toISOString().split('T')[0]);
  const thisWeekTasks = tasks.filter(t => weekDatesStr.includes(t.date));
  const completedThisWeek = thisWeekTasks.filter(t => t.completed).length;
  const totalThisWeek = thisWeekTasks.length;

  const thisWeekExpenses = expenses.filter(e => {
    try {
      const eDate = new Date(e.date);
      const monday = weekDates[0];
      const sunday = new Date(weekDates[6]);
      sunday.setHours(23, 59, 59, 999);
      return eDate >= monday && eDate <= sunday;
    } catch {
      return false;
    }
  });
  const totalSpentThisWeek = thisWeekExpenses.reduce((sum, e) => sum + e.amount, 0);

  const totalHabitCompletionsThisWeek = habits.reduce((sum, h) => {
    if (!h.logs) return sum;
    const weekLogs = h.logs.filter(d => weekDatesStr.includes(d));
    return sum + weekLogs.length;
  }, 0);

  // Dynamic Coach Insights for Indian Students
  const getCoachInsight = () => {
    const taskRatio = totalThisWeek > 0 ? completedThisWeek / totalThisWeek : 0;
    
    if (totalThisWeek === 0) {
      return {
        icon: 'document-text-outline',
        iconColor: '#8B92A0',
        title: 'Empty Desk',
        text: 'Bhai, no tasks scheduled this week! Add some study targets to get started.'
      };
    }
    
    if (taskRatio === 1) {
      return {
        icon: 'trophy-outline',
        iconColor: '#BA7517',
        title: 'Exam Topper Mode',
        text: 'Outstanding! 100% tasks completed this week. Treat yourself to some extra samosas and tapri chai!'
      };
    }
    
    if (totalSpentThisWeek > 400) {
      return {
        icon: 'alert-circle-outline',
        iconColor: '#C47070',
        title: 'Budget Alert',
        text: `Spent ₹${totalSpentThisWeek} this week! Maggi and auto fares are stacking up. Try checking your budget tracker!`
      };
    }
    
    if (taskRatio >= 0.75) {
      return {
        icon: 'flame-outline',
        iconColor: '#BA7517',
        title: 'Solid Momentum',
        text: 'Great work! You are sticking to your targets. Keep this consistency up for the semester.'
      };
    }
    
    if (taskRatio < 0.4) {
      return {
        icon: 'hourglass-outline',
        iconColor: '#C47070',
        title: 'Backlogs Piling Up',
        text: 'Backlogs are piling up, friend. Break your study sessions into small 25-minute Pomodoros to start catch up.'
      };
    }
    
    return {
      icon: 'trending-up-outline',
      iconColor: '#4B6BFB',
      title: 'Keep Moving',
      text: 'Good progress. Try completing 1-2 more tasks daily to build a bulletproof daily streak.'
    };
  };

  const insight = getCoachInsight();

  // Format dates for display
  const weekStartStr = weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekEndStr = weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Calculate semester variables
  const today = new Date();
  const semesterEnd = new Date(semesterDates.end);
  const semDiffMs = semesterEnd - today;
  const semDiffDays = Math.ceil(semDiffMs / (1000 * 60 * 60 * 24));
  const weeksRemaining = Math.max(0, Math.ceil(semDiffDays / 7));

  const handleAddSemesterEvent = () => {
    if (!eventTitle.trim()) {
      Alert.alert('Required Field', 'Please enter event title.');
      return;
    }
    const newEvent = {
      id: Date.now().toString(),
      title: eventTitle.trim(),
      type: eventType,
      date: eventDate
    };
    setSemesterEvents([...semesterEvents, newEvent]);
    setEventTitle('');
    setShowAddEventModal(false);
    Vibration.vibrate(40);
  };

  const handleDeleteSemesterEvent = (id) => {
    setSemesterEvents(semesterEvents.filter(e => e.id !== id));
  };

  const handleLaunchImportCalendar = async (useCamera = false) => {
    try {
      const { status } = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Denied', `We need ${useCamera ? 'camera' : 'gallery'} access to scan your academic calendar!`);
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64 = result.assets[0].base64;
        setLastBase64(base64);
        setScanError(null);
        setShowImportModal(true);
        runCalendarOcr(base64);
      }
    } catch (e) {
      console.warn(e);
      runCalendarOcr(null);
    }
  };
  const runCalendarOcr = async (base64Data) => {
    setIsImporting(true);
    setImportStep(1);
    setScanError(null);

    // Start scan beam animation
    importBeamAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(importBeamAnim, { toValue: 150, duration: 1000, useNativeDriver: true }),
        Animated.timing(importBeamAnim, { toValue: 0, duration: 1000, useNativeDriver: true })
      ])
    ).start();

    const step2Timer = setTimeout(() => setImportStep(2), 800);
    const step3Timer = setTimeout(() => setImportStep(3), 1600);

    if (!base64Data) {
      setIsImporting(false);
      setImportStep(0);
      setScanError('read_failed');
      return;
    }

    const calendarPayload = {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are an expert academic calendar OCR assistant. Your job is to read academic calendars, extract EVERY SINGLE EVENT listed, and also detect the overall semester/term bounds and final/end-term exams period. You must be exhaustive and return a JSON object with this details.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are given an image of an academic calendar. Your task is to extract EVERY event listed in the ENTIRE calendar — do not skip or summarize. Read every row, every column, every month block carefully.
                    
                    Additionally, identify the overall date range for the Semester/Term (start and end) and the overall date range for the End-Semester/Final Exams block (examStart and examEnd).
                    
                    CLASSIFICATION RULES (use exactly these type strings):
                    - "exam" → End-term exams, theory exams, practical exams, final exams, semester exams, back-paper exams
                    - "internal" → Mid-term tests, sessional exams, internal assessments, class tests, sessional exams, CA tests
                    - "viva" → Viva voce, oral exams, lab vivas, project presentations
                    - "holiday" → Public holidays, Saturdays off, Diwali break, Holi, school / college closed
                    - "fest" → School / college fests and events, sports day, annual day, workshops, hackathons

                    Return ONLY a valid JSON object matching this structure (no backticks, no markdown, no explanation — ONLY raw JSON):
                    {
                      "semesterStart": "YYYY-MM-DD",
                      "semesterEnd": "YYYY-MM-DD",
                      "examStart": "YYYY-MM-DD",
                      "examEnd": "YYYY-MM-DD",
                      "events": [
                        { "id": "e-1", "title": "Exact Event Name From Calendar", "type": "exam", "date": "2026-06-05" }
                      ]
                    }`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Data}` }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.05
    };

    // All OCR requests go through the server proxy (cloud or local)
    // Key is stored ONLY on the server — never in the app
    try {
      const proxyResponse = await callOcrProxy(calendarPayload, 'calendar');
      const resJson = await proxyResponse.json();
      const textResult = resJson.choices?.[0]?.message?.content || '';

      const cleanJsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJsonStr);

      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setImportStep(4);

      const extractedEvents = parsedData.events || (Array.isArray(parsedData) ? parsedData : []);
      setImportedEvents(extractedEvents);

      if (parsedData.semesterStart || parsedData.examStart) {
        setSemesterDates({
          start: parsedData.semesterStart || semesterDates.start,
          end: parsedData.semesterEnd || semesterDates.end,
          examStart: parsedData.examStart || semesterDates.examStart || '',
          examEnd: parsedData.examEnd || semesterDates.examEnd || ''
        });
      }

      setIsImporting(false);
      setShowImportReview(true);
      setScanError(null);
    } catch (e) {
      console.error('Calendar OCR failed:', e);
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setIsImporting(false);
      if (e.message.includes('503') || e.message.includes('key not configured')) {
        setScanError('unavailable');
      } else if (e.message.toLowerCase().includes('network') || e.message.toLowerCase().includes('proxy') || e.message.toLowerCase().includes('unreachable')) {
        setScanError('network_error');
      } else {
        setScanError('read_failed');
      }
    }
  };

  const handleConfirmImport = () => {
    setSemesterEvents([...semesterEvents, ...importedEvents]);
    setImportedEvents([]);
    setShowImportReview(false);
    setShowImportModal(false);
    Alert.alert('Import Complete!', 'AI successfully imported events and updated exam start/end dates.');
  };

  // Generate 12 Week timeline boxes starting from today
  const generateWeeksList = () => {
    const list = [];
    const baseDate = new Date();
    for (let i = 0; i < 12; i++) {
      const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + (i * 7));
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      list.push({ weekNum: i + 1, startDate: start, endDate: end });
    }
    return list;
  };

  const weeksList = generateWeeksList();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
      
      {/* Segmented View Selector */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity 
          style={[styles.segmentBtn, scheduleView === 'weekly' && styles.segmentBtnActive]}
          onPress={() => setScheduleView('weekly')}
        >
          <Text style={[styles.segmentBtnText, scheduleView === 'weekly' && styles.segmentBtnTextActive]}>Weekly Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.segmentBtn, scheduleView === 'semester' && styles.segmentBtnActive]}
          onPress={() => setScheduleView('semester')}
        >
          <Text style={[styles.segmentBtnText, scheduleView === 'semester' && styles.segmentBtnTextActive]}>Semester Planner</Text>
        </TouchableOpacity>
      </View>

      {scheduleView === 'weekly' ? (
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
                colors={['#BA7517']} 
                tintColor="#BA7517" 
              />
            }
          >
            {/* Timetable Smart Suggestion Banner */}
            {(() => {
              const rec = getTimetableRecommendation();
              if (!rec) return null;
              return (
                <TouchableOpacity 
                  style={styles.suggestionBanner} 
                  onPress={() => handleTapRecommendation(rec)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={styles.suggestionIconBg}>
                      <Ionicons name="bulb-outline" size={16} color="#BA7517" />
                    </View>
                    <Text style={styles.suggestionText} numberOfLines={1}>{rec.text}</Text>
                  </View>
                  <View style={styles.suggestionActionBtn}>
                    <Text style={styles.suggestionActionText}>+ Add</Text>
                  </View>
                </TouchableOpacity>
              );
            })()}

            <View style={styles.gridContainer}>
              <View style={styles.column}>
                {leftColDays.map(renderDayCard)}
              </View>
              <View style={styles.column}>
                {rightColDays.map(renderDayCard)}
              </View>
            </View>

            {/* Inline Stats Summary Card */}
            <View style={styles.inlineStatsBar}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>{totalTasks}</Text>
                  <Text style={styles.statLabel}>TOTAL TASKS</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>{completedTasks}</Text>
                  <Text style={styles.statLabel}>COMPLETED</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>{hours}h {minutes}m</Text>
                  <Text style={styles.statLabel}>FOCUS TIME</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>—</Text>
                  <Text style={styles.statLabel}>BEST DAY</Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.reviewBtn} onPress={() => setShowReviewModal(true)}>
                <Text style={styles.reviewBtnText}>Week Review</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      ) : (
        /* Semester Planner View */
        <ScrollView 
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#BA7517']} 
              tintColor="#BA7517" 
            />
          }
        >
          
          {/* Weeks remaining counter */}
          <View style={styles.countdownCard}>
            <Ionicons name="hourglass-outline" size={28} color="#BA7517" style={{ marginRight: 16 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.countdownText}>{weeksRemaining} Weeks Left</Text>
              <Text style={styles.countdownSub}>Semester ends on {new Date(semesterDates.end).toLocaleDateString()}</Text>
              {semesterDates.examStart ? (
                <Text style={[styles.countdownSub, { color: '#E11D48', marginTop: 2, fontFamily: 'PlusJakartaSans_700Bold' }]}>
                  Exams: {new Date(semesterDates.examStart).toLocaleDateString()} — {new Date(semesterDates.examEnd).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setEditingDates(!editingDates)} style={{ padding: 4 }}>
              <Ionicons name={editingDates ? "close-circle" : "create-outline"} size={20} color="#BA7517" />
            </TouchableOpacity>
          </View>

          {/* Collapsible Dates Configurator */}
          {editingDates && (
            <View style={styles.datesConfiguratorCard}>
              <Text style={styles.configuratorTitle}>Configure Semester & Exam Dates</Text>
              
              <Text style={styles.configInputLabel}>Semester Start (YYYY-MM-DD)</Text>
              <TextInput 
                style={styles.configTextInput}
                value={semStartInput}
                onChangeText={setSemStartInput}
                placeholder="2026-01-01"
                placeholderTextColor="#5A6070"
              />

              <Text style={styles.configInputLabel}>Semester End (YYYY-MM-DD)</Text>
              <TextInput 
                style={styles.configTextInput}
                value={semEndInput}
                onChangeText={setSemEndInput}
                placeholder="2026-06-30"
                placeholderTextColor="#5A6070"
              />

              <Text style={styles.configInputLabel}>Exam Start Date (YYYY-MM-DD)</Text>
              <TextInput 
                style={styles.configTextInput}
                value={examStartInput}
                onChangeText={setExamStartInput}
                placeholder="2026-05-15"
                placeholderTextColor="#5A6070"
              />

              <Text style={styles.configInputLabel}>Exam End Date (YYYY-MM-DD)</Text>
              <TextInput 
                style={styles.configTextInput}
                value={examEndInput}
                onChangeText={setExamEndInput}
                placeholder="2026-05-25"
                placeholderTextColor="#5A6070"
              />

              <TouchableOpacity 
                style={styles.saveDatesBtn}
                onPress={() => {
                  setSemesterDates({
                    start: semStartInput,
                    end: semEndInput,
                    examStart: examStartInput,
                    examEnd: examEndInput
                  });
                  setEditingDates(false);
                  Vibration.vibrate(40);
                  Alert.alert("Dates Saved!", "Semester and exam dates successfully updated.");
                }}
              >
                <Text style={styles.saveDatesBtnText}>Save Workspace Dates</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add & Import actions row */}
          <View style={styles.semesterActionsRow}>
            <TouchableOpacity style={styles.addEventBtn} onPress={() => setShowAddEventModal(true)}>
              <Ionicons name="add" size={16} color="#0F1115" style={{ marginRight: 6 }} />
              <Text style={styles.addEventBtnText}>Add Event</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.importCalendarBtn} 
              onPress={() => {
                setScanError(null);
                setLastBase64(null);
                Alert.alert(
                  "AI Calendar Import",
                  "Choose a source to import your academic calendar:",
                  [
                    { text: "Choose from Gallery", onPress: () => handleLaunchImportCalendar(false) },
                    { text: "Snap Photo", onPress: () => handleLaunchImportCalendar(true) },
                    { text: "Cancel", style: "cancel" }
                  ]
                );
              }}
            >
              <Ionicons name="sparkles" size={14} color="#BA7517" style={{ marginRight: 6 }} />
              <Text style={styles.importCalendarBtnText}>AI Calendar Import</Text>
            </TouchableOpacity>
          </View>

          {/* Week Horizontal timeline strip */}
          <Text style={styles.timelineTitle}>SEMESTER WEEKS TIMELINE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 20 }}>
            <TouchableOpacity 
              style={[styles.weekPill, selectedTimelineWeek === 0 && styles.weekPillActive]}
              onPress={() => setSelectedTimelineWeek(0)}
            >
              <Text style={[styles.weekPillText, selectedTimelineWeek === 0 && { color: '#0F1115' }]}>All Weeks</Text>
            </TouchableOpacity>
            {weeksList.map(item => (
              <TouchableOpacity 
                key={item.weekNum}
                style={[styles.weekPill, selectedTimelineWeek === item.weekNum && styles.weekPillActive]}
                onPress={() => setSelectedTimelineWeek(item.weekNum)}
              >
                <Text style={[styles.weekPillText, selectedTimelineWeek === item.weekNum && { color: '#0F1115' }]}>
                  Week {item.weekNum}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Semester events timeline list */}
          <View style={{ gap: 12 }}>
            {semesterEvents
              .filter(event => {
                if (selectedTimelineWeek === 0) return true;
                // Check if event date falls within week bounds
                const dateVal = new Date(event.date);
                const bounds = weeksList[selectedTimelineWeek - 1];
                return dateVal >= bounds.startDate && dateVal <= bounds.endDate;
              })
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map(event => {
                let badgeColor = '#5A6070';
                if (event.type === 'exam') badgeColor = '#C47070';
                else if (event.type === 'internal') badgeColor = '#F59E0B';
                else if (event.type === 'viva') badgeColor = '#BA7517';
                else if (event.type === 'holiday') badgeColor = '#7C9B7A';
                else if (event.type === 'fest') badgeColor = '#8B5CF6';

                return (
                  <View key={event.id} style={[styles.eventCard, { borderLeftColor: badgeColor }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <View style={[styles.eventTypeTag, { backgroundColor: badgeColor + '30', borderWidth: 1, borderColor: badgeColor + '50' }]}>
                          <Text style={[styles.eventTypeText, { color: badgeColor }]}>{event.type.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.eventDateText}>
                        {new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteSemesterEvent(event.id)}>
                      <Ionicons name="trash-outline" size={16} color="#C47070" style={{ padding: 4 }} />
                    </TouchableOpacity>
                  </View>
                );
              })}
              
            {semesterEvents.length === 0 && (
              <Text style={styles.emptyTimelineText}>No semester events scheduled. Add or AI import one!</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Add Semester Event Modal */}
      <Modal
        visible={showAddEventModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAddEventModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Semester Event</Text>
            <Text style={styles.modalSubtitle}>Color-coded by type on timeline</Text>

            <Text style={styles.eventInputLabel}>Event Title</Text>
            <TextInput
              style={styles.modalInput}
              value={eventTitle}
              onChangeText={setEventTitle}
              placeholder="e.g. End Semester Exam"
              placeholderTextColor="#5A6070"
            />

            <Text style={styles.eventInputLabel}>Event Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={eventDate}
              onChangeText={setEventDate}
              placeholder="2026-06-15"
              placeholderTextColor="#5A6070"
            />

            <Text style={styles.eventInputLabel}>Event Type</Text>
            <View style={styles.typeSelectorRow}>
              {[
                { type: 'exam', label: 'Exam', color: '#C47070' },
                { type: 'internal', label: 'Internal', color: '#F59E0B' },
                { type: 'viva', label: 'Viva', color: '#BA7517' },
                { type: 'holiday', label: 'Holiday', color: '#7C9B7A' },
                { type: 'fest', label: 'Fest', color: '#8B5CF6' }
              ].map(item => (
                <TouchableOpacity
                  key={item.type}
                  style={[
                    styles.typeBtn,
                    eventType === item.type && [styles.typeBtnActive, { borderColor: item.color, backgroundColor: item.color + '15' }]
                  ]}
                  onPress={() => setEventType(item.type)}
                >
                  <Text style={[styles.typeBtnText, eventType === item.type && { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => setShowAddEventModal(false)}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
                onPress={handleAddSemesterEvent}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Calendar Import Modal */}
      <Modal
        visible={showImportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isImporting) setShowImportModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>AI Calendar Import</Text>
              <TouchableOpacity onPress={() => setShowImportModal(false)} disabled={isImporting}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>
                {!isImporting && !showImportReview && !scanError && (
              <View style={{ gap: 16 }}>
                {/* 4MB size tip */}
                <View style={styles.aiTipBanner}>
                  <Ionicons name="information-circle-outline" size={16} color="#BA7517" style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={styles.aiTipText}>
                    <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', color: '#BA7517' }}>Tip: </Text>
                    Groq AI has a 4MB image limit. For large photos, the app auto-compresses to 0.8 quality. For best results, use a clear, well-lit photo of the calendar.
                  </Text>
                </View>

                {/* Upload Section */}
                <View style={styles.calendarImportBox}>
                  <Ionicons name="images" size={44} color="#BA7517" style={{ marginBottom: 12 }} />
                  <TouchableOpacity style={styles.calendarActionBtn} onPress={() => handleLaunchImportCalendar(false)}>
                    <Text style={styles.calendarActionBtnText}>Choose Calendar Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.calendarActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} onPress={() => handleLaunchImportCalendar(true)}>
                    <Text style={[styles.calendarActionBtnText, { color: '#BA7517' }]}>Snap Photo</Text>
                  </TouchableOpacity>
                </View>

                {/* URL Section */}
                <Text style={styles.eventInputLabel}>OR PASTE CALENDAR URL</Text>
                <TextInput
                  style={styles.modalInput}
                  value={importUrl}
                  onChangeText={setImportUrl}
                  placeholder="https://school.edu/academic-calendar.pdf"
                  placeholderTextColor="#5A6070"
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#BA7517' }]}
                  onPress={() => {
                    if (importUrl.trim()) runCalendarOcr();
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: '#0F1115' }]}>Extract from URL</Text>
                </TouchableOpacity>

                {/* AI Powered note (no key needed — handled server-side) */}
                <View style={{ width: '100%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 8, paddingTop: 10 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, color: '#5A6070', textAlign: 'center' }}>
                    ✦ Powered by Groq AI Vision · No setup needed
                  </Text>
                </View>
              </View>
            )}

            {scanError && (
              <View style={styles.scanningProgressContainer}>
                <Ionicons name="alert-circle-outline" size={48} color="#C47070" style={{ marginBottom: 12 }} />
                <Text style={[styles.scanningStatusTitle, { textAlign: 'center', marginHorizontal: 16 }]}>
                  {scanError === 'unavailable' 
                    ? "Scan unavailable right now — try again later" 
                    : scanError === 'network_error'
                    ? "Groq Connection Failed: SSL/Network certification issue. Please verify internet access."
                    : "Could not read image. Try again?"}
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#BA7517', width: '100%', marginTop: 16 }]}
                  onPress={() => runCalendarOcr(lastBase64)}
                >
                  <Text style={[styles.primaryBtnText, { color: '#0F1115' }]}>Retry Scan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', width: '100%', marginTop: 8 }]}
                  onPress={() => {
                    setScanError(null);
                    setLastBase64(null);
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: '#8B92A0' }]}>Choose Another</Text>
                </TouchableOpacity>
              </View>
            )}

            {isImporting && (
              <View style={styles.scanningProgressContainer}>
                <View style={styles.imageOverlayContainer}>
                  <Ionicons name="document-text-outline" size={32} color="#BA7517" style={{ marginBottom: 8 }} />
                  <Animated.View style={[styles.scanBeamLine, { transform: [{ translateY: importBeamAnim }] }]} />
                </View>
                <Text style={styles.scanningStatusTitle}>AI Academic Calendar Extracting...</Text>
                <View style={styles.scanningStepLogs}>
                  <Text style={[styles.scanStepLogText, importStep >= 1 && styles.scanStepLogTextActive]}>
                    {importStep >= 1 ? '✅' : '⏳'} Fetching academic calendar elements...
                  </Text>
                  <Text style={[styles.scanStepLogText, importStep >= 2 && styles.scanStepLogTextActive]}>
                    {importStep >= 2 ? '✅' : '⏳'} Locating semester start & end dates...
                  </Text>
                  <Text style={[styles.scanStepLogText, importStep >= 3 && styles.scanStepLogTextActive]}>
                    {importStep >= 3 ? '✅' : '⏳'} Mapping Vivias, Internals, Exams and Holidays...
                  </Text>
                  <Text style={[styles.scanStepLogText, importStep >= 4 && styles.scanStepLogTextActive]}>
                    {importStep >= 4 ? '✅' : '⏳'} Academic Calendar mapped!
                  </Text>
                </View>
                <ActivityIndicator size="small" color="#BA7517" style={{ marginTop: 16 }} />
              </View>
            )}

            {showImportReview && (
              <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
                <Text style={[styles.eventInputLabel, { color: '#BA7517', marginBottom: 12 }]}>Review Extracted Calendar Events</Text>
                {importedEvents.map((item, idx) => (
                  <View key={item.id} style={styles.importReviewRow}>
                    <TextInput
                      style={[styles.importReviewInput, { flex: 2 }]}
                      value={item.title}
                      onChangeText={(val) => {
                        const updated = [...importedEvents];
                        updated[idx].title = val;
                        setImportedEvents(updated);
                      }}
                      placeholder="Title"
                    />
                    <TextInput
                      style={[styles.importReviewInput, { flex: 1.5 }]}
                      value={item.date}
                      onChangeText={(val) => {
                        const updated = [...importedEvents];
                        updated[idx].date = val;
                        setImportedEvents(updated);
                      }}
                      placeholder="Date"
                    />
                    <TouchableOpacity 
                      onPress={() => setImportedEvents(importedEvents.filter(ev => ev.id !== item.id))}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash" size={14} color="#C47070" />
                    </TouchableOpacity>
                  </View>
                ))}
                
                <TouchableOpacity 
                  style={[styles.primaryBtn, { backgroundColor: '#BA7517', marginTop: 16 }]} 
                  onPress={handleConfirmImport}
                >
                  <Text style={{ color: '#0F1115', fontFamily: 'PlusJakartaSans_700Bold' }}>Add to Schedule</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* Add Task Modal */}
      <Modal
        visible={activeDate !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActiveDate(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Schedule Task</Text>
            <Text style={styles.modalSubtitle}>For: {activeDate}</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="What needs to be done?"
              placeholderTextColor="#5A6070"
              value={newTaskText}
              onChangeText={setNewTaskText}
              autoFocus
              onSubmitEditing={handleAddTask}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => {
                  setActiveDate(null);
                  setNewTaskText('');
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
                onPress={handleAddTask}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Week Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { width: '90%', maxHeight: '85%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="stats-chart" size={20} color="#BA7517" />
                <Text style={styles.modalTitle}>Weekly Review</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReviewModal(false)}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>{weekStartStr} — {weekEndStr}</Text>

            {/* Coach Insight Card */}
            <View style={[styles.coachCard, { borderColor: insight.iconColor + '30' }]}>
              <View style={[styles.coachIconContainer, { backgroundColor: insight.iconColor + '15' }]}>
                <Ionicons name={insight.icon} size={22} color={insight.iconColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.coachTitle, { color: insight.iconColor }]}>{insight.title}</Text>
                <Text style={styles.coachText}>{insight.text}</Text>
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statsGridRow}>
                <View style={styles.gridStatCard}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#7C9B7A" style={{ marginBottom: 6 }} />
                  <Text style={styles.gridStatVal}>{completedThisWeek}/{totalThisWeek}</Text>
                  <Text style={styles.gridStatLabel}>TASKS DONE</Text>
                </View>
                <View style={styles.gridStatCard}>
                  <Ionicons name="time-outline" size={20} color="#4B6BFB" style={{ marginBottom: 6 }} />
                  <Text style={styles.gridStatVal}>{hours}h {minutes}m</Text>
                  <Text style={styles.gridStatLabel}>FOCUS TIME</Text>
                </View>
              </View>
              <View style={styles.statsGridRow}>
                <View style={styles.gridStatCard}>
                  <View style={{ height: 20, justifyContent: 'center', marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', color: '#C47070', fontSize: 16 }}>₹</Text>
                  </View>
                  <Text style={[styles.gridStatVal, { color: totalSpentThisWeek > 400 ? '#C47070' : '#F3F1EC' }]}>₹{totalSpentThisWeek}</Text>
                  <Text style={styles.gridStatLabel}>SPENT</Text>
                </View>
                <View style={styles.gridStatCard}>
                  <Ionicons name="repeat-outline" size={20} color="#BA7517" style={{ marginBottom: 6 }} />
                  <Text style={styles.gridStatVal}>{totalHabitCompletionsThisWeek}</Text>
                  <Text style={styles.gridStatLabel}>HABIT CHECKS</Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: '#BA7517' }]} 
                onPress={handleShareStats}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-social-outline" size={16} color="#BA7517" />
                  <Text style={[styles.modalActionBtnText, { color: '#BA7517' }]}>Share Stats</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
                onPress={() => setShowReviewModal(false)}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Chalo, Next Week!</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F1115',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  scrollContent: { padding: 16, paddingBottom: 24 },
  
  gridContainer: { flexDirection: 'row', gap: 12 },
  column: { flex: 1, gap: 12 },
  
  dayCard: { backgroundColor: '#171B22', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.02)' },
  dayName: { fontFamily: 'PlusJakartaSans_700Bold', color: '#F3F1EC', fontSize: 13, marginRight: 6 },
  dayDate: { fontFamily: 'PlusJakartaSans_500Medium', color: '#5A6070', fontSize: 11 },
  
  tasksContainer: { minHeight: 120, padding: 12, justifyContent: 'center' },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  emptyEmoji: { fontSize: 16, marginBottom: 4 },
  emptyText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#5A6070', fontSize: 10, textAlign: 'center' },

  taskItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' },
  checkbox: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', marginRight: 8 },
  checkboxChecked: { backgroundColor: '#BA7517', borderColor: '#BA7517' },
  taskTitle: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 11, flex: 1 },
  taskTitleCompleted: { color: '#5A6070', textDecorationLine: 'line-through' },
  deleteBtn: { padding: 4, marginLeft: 4 },

  inlineStatsBar: { 
    backgroundColor: '#171B22', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.03)', 
    borderRadius: 20,
    padding: 20, 
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    marginBottom: 16 
  },
  statItem: { 
    alignItems: 'center',
    flex: 1
  },
  statVal: { 
    fontFamily: 'PlusJakartaSans_700Bold', 
    color: '#BA7517', 
    fontSize: 16, 
    marginBottom: 4 
  },
  statLabel: { 
    fontFamily: 'PlusJakartaSans_600SemiBold', 
    color: '#8B92A0', 
    fontSize: 9, 
    letterSpacing: 0.5,
    textAlign: 'center'
  },
  
  reviewBtn: { 
    backgroundColor: '#BA7517', 
    paddingVertical: 12, 
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  reviewBtnText: { 
    fontFamily: 'PlusJakartaSans_700Bold', 
    color: '#0F1115', 
    fontSize: 14,
    letterSpacing: 0.5
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15
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
  modalInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    marginBottom: 20
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12
  },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14
  },
  coachCard: {
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  coachIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  coachTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  coachText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  statsGrid: {
    gap: 12,
    marginBottom: 8
  },
  statsGridRow: {
    flexDirection: 'row',
    gap: 12
  },
  gridStatCard: {
    flex: 1,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center'
  },
  gridStatVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 15,
    marginBottom: 4
  },
  gridStatLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#5A6070',
    fontSize: 8,
    letterSpacing: 0.5
  },

  // Segmented View Styles
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 4
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  segmentBtnActive: {
    backgroundColor: '#1D2430'
  },
  segmentBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0'
  },
  segmentBtnTextActive: {
    color: '#F3F1EC'
  },

  // Countdown card
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20
  },
  countdownText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#F3F1EC'
  },
  countdownSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2
  },

  // Actions
  semesterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24
  },
  addEventBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12
  },
  addEventBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },
  importCalendarBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.3)',
    borderRadius: 12,
    paddingVertical: 12
  },
  importCalendarBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
    fontSize: 13
  },

  // Horizontal Weeks timeline strip
  timelineTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10
  },
  weekPill: {
    backgroundColor: '#171B22',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  weekPillActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  weekPillText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0'
  },

  // Event card styles
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F28',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  eventTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#F3F1EC',
    flexShrink: 1
  },
  eventTypeTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  eventTypeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    letterSpacing: 0.8
  },
  eventDateText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#A0A8B5',
    fontSize: 12,
    marginTop: 5
  },
  emptyTimelineText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 20
  },
  // AI tip banner
  aiTipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  aiTipText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#A0A8B5',
    fontSize: 12,
    lineHeight: 18
  },

  // Modal selector inside schedule
  eventInputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 10
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    marginTop: 4
  },
  typeBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#0F1115',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  typeBtnActive: {
    borderWidth: 1
  },
  typeBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0'
  },

  // Calendar Import modal elements
  calendarImportBox: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarActionBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 10,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10
  },
  calendarActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },
  primaryBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },

  // Scanning simulation details
  scanningProgressContainer: {
    backgroundColor: '#0F1115',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center'
  },
  imageOverlayContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#171B22',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative'
  },
  scanBeamLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 10,
    height: 3,
    backgroundColor: '#BA7517',
    opacity: 0.8
  },
  scanningStatusTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
    marginBottom: 12
  },
  scanningStepLogs: {
    width: '100%',
    gap: 6
  },
  scanStepLogText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070'
  },
  scanStepLogTextActive: {
    color: '#7C9B7A'
  },
  importReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  importReviewInput: {
    backgroundColor: '#0F1115',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12
  },
  apiKeyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiKeyInput: {
    flex: 1,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    padding: 0
  },
  
  // Custom dates configurator
  datesConfiguratorCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 16,
    marginBottom: 20
  },
  configuratorTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#BA7517',
    marginBottom: 12
  },
  configInputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#8B92A0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 8
  },
  configTextInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginBottom: 4
  },
  saveDatesBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14
  },
  saveDatesBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 12
  },
  emptyAddBtn: {
    backgroundColor: 'rgba(186, 117, 23, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6
  },
  emptyAddBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#BA7517'
  },
  suggestionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    justifyContent: 'space-between'
  },
  suggestionIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(186, 117, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  suggestionText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC',
    flex: 1
  },
  suggestionActionBtn: {
    backgroundColor: '#BA7517',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  suggestionActionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#0F1115'
  }
});
