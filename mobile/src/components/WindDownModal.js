import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  ScrollView, 
  Animated, 
  Vibration,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function WindDownModal({ 
  visible, 
  onClose, 
  tasks, 
  setTasks, 
  timetable, 
  userId,
  hydration = { water: 0, target: 2000 },
  habits = [],
  pomodoroStats = { roundsToday: 0 },
  expenses = []
}) {
  const [step, setStep] = useState(1); // 1: Rating, 2: Carry-over, 3: Report Card, 4: Tomorrow preview, 5: Sleep nudge
  const [rating, setRating] = useState(0);
  const [isCarryingOver, setIsCarryingOver] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);

  // Animations
  const moonScale = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tomorrowDayName = weekdays[tomorrow.getDay()];

  // Filter incomplete tasks for today
  const incompleteTodayTasks = tasks.filter(t => t.date === todayStr && !t.completed);

  // Get tomorrow's tasks & timetable first class
  const tomorrowTasks = tasks.filter(t => t.date === tomorrowStr);
  const tomorrowClasses = timetable && timetable[tomorrowDayName] ? timetable[tomorrowDayName] : [];
  
  // Sort classes by time (simplified mock sorting: assume times are entered in order or just take the first)
  const firstClass = tomorrowClasses.length > 0 ? tomorrowClasses[0] : null;

  useEffect(() => {
    if (visible) {
      setStep(1);
      setRating(0);
      setIsCarryingOver(false);
      animateEntrance();
    }
  }, [visible]);

  useEffect(() => {
    if (step === 4) {
      // Pulsing moon loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(moonScale, {
            toValue: 1.1,
            duration: 2000,
            useNativeDriver: true
          }),
          Animated.timing(moonScale, {
            toValue: 0.9,
            duration: 2000,
            useNativeDriver: true
          })
        ])
      ).start();
    }
  }, [step]);

  const animateEntrance = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true
      })
    ]).start();
  };

  const handleSaveRating = async (selectedRating) => {
    setRating(selectedRating);
    setIsSavingRating(true);
    Vibration.vibrate(40);
    
    try {
      // Save rating to users/{uid}/appData/day_ratings
      const ratingRef = doc(db, 'users', userId, 'appData', 'day_ratings');
      // Since ratings are stored by date, retrieve existing ratings or update
      // For simplicity, write as key-value under the document
      await setDoc(ratingRef, {
        id: 'day_ratings',
        [`rating_${todayStr}`]: selectedRating,
        updated_at: Date.now()
      }, { merge: true });

      setTimeout(() => {
        setIsSavingRating(false);
        setStep(2);
        animateEntrance();
      }, 600);
    } catch (e) {
      console.warn('Failed to save day rating:', e);
      setIsSavingRating(false);
      setStep(2);
      animateEntrance();
    }
  };

  const handleCarryOverTasks = () => {
    if (incompleteTodayTasks.length === 0) {
      setStep(3);
      animateEntrance();
      return;
    }

    setIsCarryingOver(true);
    Vibration.vibrate([0, 50, 50, 50]);

    setTimeout(() => {
      // Move dates of all incomplete tasks to tomorrowStr
      const updated = tasks.map(t => {
        if (t.date === todayStr && !t.completed) {
          return { ...t, date: tomorrowStr };
        }
        return t;
      });

      setTasks(updated);
      setIsCarryingOver(false);
      setStep(3);
      animateEntrance();
    }, 1000);
  };

  const todayTasks = tasks.filter(t => t.date === todayStr);
  const completedTodayTasksCount = todayTasks.filter(t => t.completed).length;
  const totalTodayTasksCount = todayTasks.length;

  const focusRounds = pomodoroStats?.roundsToday || 0;
  const focusHours = Math.floor((focusRounds * 25) / 60);
  const focusMinutes = (focusRounds * 25) % 60;

  const displayWaterTarget = hydration?.target || 2000;
  const displayWaterCurrent = hydration?.water || 0;

  const totalHabitsCount = habits?.length || 0;
  const completedHabitsCount = habits ? habits.filter(h => h.logs && h.logs.includes(todayStr)).length : 0;

  const totalSpentThisMonth = expenses ? expenses.reduce((sum, e) => sum + e.amount, 0) : 0;
  const budgetStatus = totalSpentThisMonth > 5000 ? 'Over Budget' : 'On Track';

  // Math for score
  let scoreVal = 0;
  if (totalTodayTasksCount === 0) scoreVal += 35;
  else scoreVal += (completedTodayTasksCount / totalTodayTasksCount) * 35;

  const focusRatio = Math.min(focusRounds / 4, 1);
  scoreVal += focusRatio * 25;

  const waterRatio = Math.min(displayWaterCurrent / (displayWaterTarget || 2000), 1);
  scoreVal += waterRatio * 15;

  if (totalHabitsCount === 0) scoreVal += 25;
  else scoreVal += (completedHabitsCount / totalHabitsCount) * 25;

  const finalScore = Math.round(scoreVal);

  let feedbackText = "Steady Study Day!";
  if (finalScore >= 90) feedbackText = "Outstanding day! Smashed all targets! 🔥";
  else if (finalScore >= 75) feedbackText = "Solid Study Day! Great consistency! 👍";
  else if (finalScore >= 50) feedbackText = "Decent progress. Let's finish stronger tomorrow! 💪";
  else feedbackText = "Slow day. Rest up, reset, and conquer tomorrow! 🌅";

  const xpEarnedFallback = (completedTodayTasksCount * 10) + (focusRounds * 20) + (completedHabitsCount * 30) + (displayWaterCurrent >= displayWaterTarget ? 25 : 0) + (rating > 0 ? 10 : 0);

  const renderStars = (ratingOutOfFive) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons 
          key={i} 
          name={i <= ratingOutOfFive ? "star" : "star-outline"} 
          size={12} 
          color={i <= ratingOutOfFive ? "#BA7517" : "#5A6070"} 
          style={{ marginLeft: 2 }}
        />
      );
    }
    return <View style={{ flexDirection: 'row' }}>{stars}</View>;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[
          styles.container, 
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          
          {/* Header Close */}
          {step < 5 && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Night Wind-Down</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>
          )}

          {/* Steps Progress bar */}
          {step < 5 && (
            <View style={styles.progressBarRow}>
              <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]} />
              <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]} />
              <View style={[styles.progressStep, step >= 3 && styles.progressStepActive]} />
              <View style={[styles.progressStep, step >= 4 && styles.progressStepActive]} />
            </View>
          )}

          {/* STEP 1: Rate Productivity */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Ionicons name="sparkles-outline" size={48} color="#BA7517" style={{ marginBottom: 16 }} />
              <Text style={styles.title}>Reflect on Today</Text>
              <Text style={styles.subtitle}>How productive did you feel your study sessions were today?</Text>

              {isSavingRating ? (
                <ActivityIndicator color="#BA7517" size="large" style={{ marginVertical: 32 }} />
              ) : (
                <View style={styles.ratingList}>
                  {[
                    { value: 1, label: '😭 Sluggish / Low focus' },
                    { value: 2, label: '😔 Slow progress' },
                    { value: 3, label: '😐 Steady/Normal' },
                    { value: 4, label: '🙂 Focused & checkouts' },
                    { value: 5, label: '🤩 Unstoppable grinder!' }
                  ].map(option => (
                    <TouchableOpacity 
                      key={option.value}
                      style={styles.ratingItem}
                      onPress={() => handleSaveRating(option.value)}
                    >
                      <Text style={styles.ratingItemText}>{option.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#5A6070" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* STEP 2: Carry-over Tasks */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Ionicons name="arrow-forward-circle-outline" size={48} color="#BA7517" style={{ marginBottom: 16 }} />
              <Text style={styles.title}>Incomplete Backlog</Text>
              <Text style={styles.subtitle}>
                You have {incompleteTodayTasks.length} uncompleted tasks remaining from today.
              </Text>

              <ScrollView style={styles.tasksListScroll} contentContainerStyle={{ gap: 8 }}>
                {incompleteTodayTasks.length === 0 ? (
                  <View style={styles.emptyTasksView}>
                    <Ionicons name="trophy-outline" size={32} color="#7C9B7A" style={{ marginBottom: 8 }} />
                    <Text style={styles.emptyTasksText}>Zero backlogs! You crushed every scheduled task today.</Text>
                  </View>
                ) : (
                  incompleteTodayTasks.map(t => (
                    <View key={t.id} style={styles.taskCard}>
                      <Ionicons name="ellipse-outline" size={14} color="#C47070" style={{ marginRight: 10 }} />
                      <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                    </View>
                  ))
                )}
              </ScrollView>

              {isCarryingOver ? (
                <ActivityIndicator color="#BA7517" size="small" style={{ marginTop: 24 }} />
              ) : (
                <View style={styles.actionRow}>
                  {incompleteTodayTasks.length > 0 && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleCarryOverTasks}>
                      <Ionicons name="play-forward" size={18} color="#0F1115" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryBtnText}>Carry Over to Tomorrow</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                    onPress={() => {
                      setStep(3);
                      animateEntrance();
                    }}
                  >
                    <Text style={[styles.primaryBtnText, { color: '#8B92A0' }]}>
                      {incompleteTodayTasks.length > 0 ? 'Skip / Keep in Today' : 'Continue'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* STEP 3: Report Card */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Ionicons name="receipt-outline" size={48} color="#BA7517" style={{ alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[styles.title, { textAlign: 'center' }]}>Today's Report Card</Text>
              <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 16 }]}>
                {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>

              <View style={styles.reportCardBox}>
                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>📋 Tasks</Text>
                  <Text style={styles.reportValue}>{completedTodayTasksCount}/{totalTodayTasksCount} done</Text>
                  {renderStars(totalTodayTasksCount === 0 ? 5 : Math.round((completedTodayTasksCount / totalTodayTasksCount) * 5))}
                </View>
                <View style={styles.reportDivider} />

                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>🍅 Focus</Text>
                  <Text style={styles.reportValue}>{focusHours > 0 ? `${focusHours}h ` : ''}{focusMinutes}m</Text>
                  {renderStars(Math.round(focusRatio * 5))}
                </View>
                <View style={styles.reportDivider} />

                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>💧 Water</Text>
                  <Text style={styles.reportValue}>{(displayWaterCurrent / 1000).toFixed(1)}L / {(displayWaterTarget / 1000).toFixed(1)}L</Text>
                  {renderStars(Math.round(waterRatio * 5))}
                </View>
                <View style={styles.reportDivider} />

                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>🏃 Habits</Text>
                  <Text style={styles.reportValue}>{completedHabitsCount}/{totalHabitsCount} checked</Text>
                  {renderStars(totalHabitsCount === 0 ? 5 : Math.round((completedHabitsCount / totalHabitsCount) * 5))}
                </View>
                <View style={styles.reportDivider} />

                <View style={styles.reportRow}>
                  <Text style={styles.reportLabel}>💰 Budget</Text>
                  <Text style={styles.reportValue}>{budgetStatus}</Text>
                  {renderStars(budgetStatus === 'On Track' ? 5 : 2)}
                </View>
                
                <View style={styles.scoreSummaryBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.scoreTextLabel}>Overall Day Score:</Text>
                    <Text style={styles.scoreValText}>{finalScore}/100</Text>
                  </View>
                  <Text style={styles.scoreComment}>{feedbackText}</Text>
                  <Text style={styles.xpEarnedText}>✨ Today you earned {xpEarnedFallback} XP</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                Vibration.vibrate(40);
                setStep(4);
                animateEntrance();
              }}>
                <Text style={styles.primaryBtnText}>Preview Tomorrow</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: Tomorrow Preview */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <Ionicons name="eye-outline" size={48} color="#BA7517" style={{ marginBottom: 16 }} />
              <Text style={styles.title}>Tomorrow's Preview</Text>
              <Text style={styles.subtitle}>Here is how your desk looks for tomorrow morning:</Text>

              <View style={styles.previewBox}>
                <Text style={styles.previewHeading}>TIMETABLE FIRST CLASS</Text>
                {firstClass ? (
                  <View style={styles.classCard}>
                    <Ionicons name="school" size={20} color="#BA7517" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.classSubject}>{firstClass.subject}</Text>
                      <Text style={styles.classDetail}>{firstClass.time} • {firstClass.room || 'No Room'}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.classCard}>
                    <Ionicons name="calendar-outline" size={20} color="#5A6070" style={{ marginRight: 12 }} />
                    <Text style={styles.noClassText}>No lectures scheduled for tomorrow.</Text>
                  </View>
                )}

                <Text style={[styles.previewHeading, { marginTop: 20 }]}>SCHEDULED TASKS ({tomorrowTasks.length})</Text>
                <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ gap: 6 }}>
                  {tomorrowTasks.length === 0 ? (
                    <Text style={styles.noClassText}>No tasks scheduled yet. Sleep in peace!</Text>
                  ) : (
                    tomorrowTasks.map(t => (
                      <View key={t.id} style={styles.taskPreviewItem}>
                        <Ionicons name="arrow-forward" size={12} color="#BA7517" style={{ marginRight: 8 }} />
                        <Text style={styles.taskPreviewText} numberOfLines={1}>{t.title}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                Vibration.vibrate(40);
                setStep(5);
                animateEntrance();
              }}>
                <Text style={styles.primaryBtnText}>Prepare to Wind Down</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 5: Bedtime Screen Off Nudge */}
          {step === 5 && (
            <View style={[styles.stepContainer, { justifyContent: 'center', flex: 1, paddingHorizontal: 32 }]}>
              <Animated.View style={{ transform: [{ scale: moonScale }], marginBottom: 32 }}>
                <Ionicons name="moon" size={96} color="#FFE5B4" style={styles.moonGlow} />
              </Animated.View>
              
              <Text style={[styles.title, { fontSize: 26, textAlign: 'center' }]}>Planory Complete.</Text>
              <Text style={[styles.subtitle, { textAlign: 'center', lineHeight: 24, paddingHorizontal: 12, marginBottom: 40 }]}>
                "All done. Put the phone down. Sleep is your best study tool."
              </Text>

              <TouchableOpacity 
                style={[styles.primaryBtn, { width: '80%', alignSelf: 'center', backgroundColor: '#FFE5B4' }]} 
                onPress={() => {
                  Vibration.vibrate(20);
                  onClose();
                }}
              >
                <Text style={[styles.primaryBtnText, { color: '#090D1A' }]}>Good Night 🌙</Text>
              </TouchableOpacity>
            </View>
          )}

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#090D1A', // Calm deep dark space theme
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    width: '100%',
    height: '100%',
    padding: 24,
    paddingTop: Platform.OS === 'android' ? 48 : 24,
    justifyContent: 'space-between'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#8B92A0',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  closeBtn: {
    padding: 4
  },
  progressBarRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 24
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2
  },
  progressStepActive: {
    backgroundColor: '#BA7517'
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 16
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#F3F1EC',
    marginBottom: 8
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#8B92A0',
    lineHeight: 20,
    marginBottom: 24
  },
  
  // Star rating list
  ratingList: {
    gap: 12,
    marginTop: 8
  },
  ratingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131929',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 18
  },
  ratingItemText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 14
  },

  // Carry-over tasks styles
  tasksListScroll: {
    maxHeight: 250,
    backgroundColor: '#131929',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  emptyTasksView: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32
  },
  emptyTasksText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090D1A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  taskTitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#F3F1EC',
    fontSize: 13,
    flex: 1
  },
  actionRow: {
    marginTop: 24,
    gap: 12
  },
  primaryBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  primaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 14
  },

  // Tomorrow preview styles
  previewBox: {
    backgroundColor: '#131929',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 20,
    marginBottom: 24
  },
  previewHeading: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    marginBottom: 10
  },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090D1A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  classSubject: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 14
  },
  classDetail: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 11,
    marginTop: 2
  },
  noClassText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12
  },
  taskPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  taskPreviewText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8B92A0',
    fontSize: 12,
    flex: 1
  },

  // Bedtime nudge styles
  moonGlow: {
    shadowColor: '#FFE5B4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  reportCardBox: {
    backgroundColor: '#131929',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    marginBottom: 24
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  reportLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0',
    width: '30%'
  },
  reportValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC',
    width: '35%',
    textAlign: 'left'
  },
  reportDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  scoreSummaryBox: {
    backgroundColor: '#090D1A',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  scoreTextLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0'
  },
  scoreValText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#BA7517'
  },
  scoreComment: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#7C9B7A',
    marginTop: 6
  },
  xpEarnedText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#BA7517',
    marginTop: 4
  }
});
