import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { useNavigation } from '@react-navigation/native';

export default function AnalyticsScreen() {
  const navigation = useNavigation();
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';

  // Load database states
  const [tasks] = useFirestoreData(`${userId}_tasks`, []);
  const [habits] = useFirestoreData(`${userId}_user_habits`, []);
  const [pomodoroStats] = useFirestoreData(`${userId}_pomodoro_stats`, { roundsToday: 0 });
  const [hydration] = useFirestoreData(`${userId}_hydration`, { water: 0, target: 8 });

  // Get date range helper for this week and last week
  const getWeekDates = (offset = 0) => {
    const curr = new Date();
    // Monday of current week (with offset in weeks)
    const first = curr.getDate() - curr.getDay() + 1 + (offset * 7);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(curr.getFullYear(), curr.getMonth(), first + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const thisWeekDays = getWeekDates(0);
  const lastWeekDays = getWeekDates(-1);

  // Subject focus hours logic based on completed tasks
  const getSubjectFocusData = () => {
    const subjectHours = {
      'CS101': 0,
      'Maths-II': 0,
      'Physics': 0,
      'General': 0
    };

    // Filter tasks completed this week
    const completedThisWeek = tasks.filter(t => t.completed && thisWeekDays.includes(t.date));
    
    // Attribute focus rounds to subjects
    completedThisWeek.forEach(t => {
      const title = t.title.toLowerCase();
      if (title.includes('cs') || title.includes('computer') || title.includes('code') || title.includes('program')) {
        subjectHours['CS101'] += 0.5; // assume ~30 mins per completed task target
      } else if (title.includes('math') || title.includes('algebra') || title.includes('calc') || title.includes('matrix')) {
        subjectHours['Maths-II'] += 0.5;
      } else if (title.includes('phys') || title.includes('mechanic') || title.includes('electro') || title.includes('wave')) {
        subjectHours['Physics'] += 0.5;
      } else {
        subjectHours['General'] += 0.5;
      }
    });

    // Add current today's pomodoro rounds (convert to hours: 25 mins per round)
    // Map to General if active task is not recognized
    const todayRoundsHours = (pomodoroStats.roundsToday || 0) * 0.4;
    subjectHours['General'] += todayRoundsHours;

    return subjectHours;
  };

  const focusData = getSubjectFocusData();
  const maxHours = Math.max(...Object.values(focusData), 2); // Avoid divide-by-zero, min max height is 2h

  // Habits comparison
  const getHabitRates = () => {
    if (habits.length === 0) return { thisWeekRate: 0, lastWeekRate: 0 };

    let thisWeekCompletions = 0;
    let lastWeekCompletions = 0;

    habits.forEach(h => {
      if (h.logs) {
        thisWeekCompletions += h.logs.filter(d => thisWeekDays.includes(d)).length;
        lastWeekCompletions += h.logs.filter(d => lastWeekDays.includes(d)).length;
      }
    });

    const totalLogsPossible = habits.length * 7;
    const thisWeekRate = Math.round((thisWeekCompletions / totalLogsPossible) * 100);
    const lastWeekRate = Math.round((lastWeekCompletions / totalLogsPossible) * 100);

    return { thisWeekRate, lastWeekRate };
  };

  const { thisWeekRate, lastWeekRate } = getHabitRates();

  // Scorecard calculation (0 - 100)
  const calculateScore = () => {
    // 1. Tasks completions this week (Max: 40 points)
    const thisWeekTasks = tasks.filter(t => thisWeekDays.includes(t.date));
    const completedTasksThisWeekCount = thisWeekTasks.filter(t => t.completed).length;
    const taskScore = thisWeekTasks.length > 0 
      ? Math.round((completedTasksThisWeekCount / thisWeekTasks.length) * 40)
      : 20; // default medium score if empty

    // 2. Focus Rounds this week (Max: 30 points, target 6 rounds)
    // Estimate focus rounds this week
    const focusRoundsThisWeek = (pomodoroStats.roundsToday || 0); // fallback today's stats
    const focusScore = Math.min(30, Math.round((focusRoundsThisWeek / 6) * 30));

    // 3. Hydration logs (Max: 15 points, target hydration)
    const hydrationCompleted = hydration.water >= hydration.target ? 1 : 0;
    const hydrationScore = hydrationCompleted * 15;

    // 4. Habits check rate (Max: 15 points)
    const habitsScore = Math.round((thisWeekRate / 100) * 15);

    const totalScore = Math.min(100, taskScore + focusScore + hydrationScore + habitsScore);
    return totalScore || 0;
  };

  const weeklyScore = calculateScore();

  const getScoreRating = (score) => {
    if (score >= 80) return { title: 'Focus Beast Mode', color: '#7C9B7A', icon: 'flame' };
    if (score >= 50) return { title: 'Solid Consistent Progress', color: '#C2A878', icon: 'trending-up' };
    return { title: 'Desk Warmup Phase', color: '#8B92A0', icon: 'hourglass-outline' };
  };

  const ratingMeta = getScoreRating(weeklyScore);

  // Best Day Dynamic Insight
  const getBestDayInsight = () => {
    // Group completions by day of week
    const completionsByDay = {
      'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0
    };

    const completedThisWeek = tasks.filter(t => t.completed && thisWeekDays.includes(t.date));
    completedThisWeek.forEach(t => {
      try {
        const dayName = new Date(t.date).toLocaleDateString('en-US', { weekday: 'long' });
        if (completionsByDay[dayName] !== undefined) {
          completionsByDay[dayName] += 1;
        }
      } catch (err) {}
    });

    let bestDay = 'Wednesday'; // Sensible fallback
    let maxCompletions = 0;
    Object.keys(completionsByDay).forEach(day => {
      if (completionsByDay[day] > maxCompletions) {
        maxCompletions = completionsByDay[day];
        bestDay = day;
      }
    });

    return `Your best study day is ${bestDay}. Schedule hard tasks then.`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#F3F1EC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workspace Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Scorecard Widget */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>WEEKLY SCORECARD</Text>
          <View style={styles.scoreContainer}>
            <View style={[styles.scoreCircle, { borderColor: ratingMeta.color }]}>
              <Text style={[styles.scoreVal, { color: ratingMeta.color }]}>{weeklyScore}</Text>
              <Text style={styles.scoreMax}>/ 100</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={ratingMeta.icon} size={18} color={ratingMeta.color} />
                <Text style={[styles.scoreStatus, { color: ratingMeta.color }]}>{ratingMeta.title}</Text>
              </View>
              <Text style={styles.scoreDesc}>
                This score combines completed tasks, focus study hours, consistency in logging daily habits, and hitting hydration goals.
              </Text>
            </View>
          </View>
        </View>

        {/* Focus Hours Bar Chart */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>FOCUS HOURS BY SUBJECT</Text>
          <View style={styles.chartContainer}>
            {Object.keys(focusData).map(subj => {
              const val = focusData[subj];
              const heightPercent = maxHours > 0 ? (val / maxHours) * 100 : 0;
              return (
                <View key={subj} style={styles.chartColumn}>
                  <View style={styles.barWrapper}>
                    <Text style={styles.barValue}>{val.toFixed(1)}h</Text>
                    <View style={[styles.bar, { height: `${Math.max(5, heightPercent)}%` }]} />
                  </View>
                  <Text style={styles.barLabel} numberOfLines={1}>{subj}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Habits Consistency rings comparison */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>HABITS COMPLETION COMPARISON</Text>
          
          <View style={{ gap: 16, marginTop: 12 }}>
            <View>
              <View style={styles.comparisonLabelRow}>
                <Text style={styles.comparisonLabel}>This Week's Streak</Text>
                <Text style={[styles.comparisonValue, { color: '#C2A878' }]}>{thisWeekRate}%</Text>
              </View>
              <View style={styles.comparisonTrack}>
                <View style={[styles.comparisonFill, { width: `${thisWeekRate}%`, backgroundColor: '#C2A878' }]} />
              </View>
            </View>

            <View>
              <View style={styles.comparisonLabelRow}>
                <Text style={styles.comparisonLabel}>Last Week's Streak</Text>
                <Text style={[styles.comparisonValue, { color: '#5A6070' }]}>{lastWeekRate}%</Text>
              </View>
              <View style={styles.comparisonTrack}>
                <View style={[styles.comparisonFill, { width: `${lastWeekRate}%`, backgroundColor: '#5A6070' }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Dynamic Coach Insights */}
        <View style={[styles.card, { borderColor: 'rgba(194, 168, 120, 0.15)', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <View style={styles.insightIconBg}>
              <Ionicons name="bulb" size={18} color="#C2A878" />
            </View>
            <Text style={styles.insightTitle}>STUDY INSIGHT</Text>
          </View>
          <Text style={styles.insightText}>
            {getBestDayInsight()} Preparing complex notes and running Pomodoros on this day will yield maximum recall efficiency.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC',
  },
  scrollContainer: {
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1115',
  },
  scoreVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
  },
  scoreMax: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070',
    marginTop: 2,
  },
  scoreStatus: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  scoreDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    lineHeight: 16,
    marginTop: 4,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 160,
    alignItems: 'flex-end',
    marginTop: 12,
  },
  chartColumn: {
    alignItems: 'center',
    width: '20%',
  },
  barWrapper: {
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  barValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#C2A878',
    marginBottom: 6,
  },
  bar: {
    width: 24,
    backgroundColor: '#C2A878',
    borderRadius: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 8,
  },
  comparisonLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  comparisonLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC',
  },
  comparisonValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  comparisonTrack: {
    height: 8,
    backgroundColor: '#0F1115',
    borderRadius: 4,
    overflow: 'hidden',
  },
  comparisonFill: {
    height: '100%',
    borderRadius: 4,
  },
  insightIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(194, 168, 120, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#C2A878',
    letterSpacing: 0.5,
  },
  insightText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    lineHeight: 18,
  },
});
