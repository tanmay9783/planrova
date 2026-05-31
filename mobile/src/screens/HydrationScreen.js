import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Modal, Platform, StatusBar, Animated, Dimensions, Vibration, RefreshControl } from 'react-native';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import ConfettiBurst from '../components/ConfettiBurst';
import XPFlyAnimation from '../components/XPFlyAnimation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleWaterReminders, cancelReminders, requestNotificationPermission } from '../utils/notifications';


const DRINK_TYPES = [
  { name: 'Water', desc: 'Pure hydration', amount: 250, factor: 1.0, color: '#4B6BFB', icon: 'water-outline' },
  { name: 'Nariyal paani', desc: 'Electrolytes +', amount: 250, factor: 1.0, color: '#7C9B7A', icon: 'leaf-outline' },
  { name: 'Nimbu paani', desc: 'Vitamin C boost', amount: 250, factor: 1.0, color: '#C2A878', icon: 'sunny-outline' },
  { name: 'Cutting chai', desc: 'Diuretic (-30 ml)', amount: -30, factor: 1.0, color: '#C47070', icon: 'cafe-outline' }
];

export default function HydrationScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [hydration, setHydration] = useFirestoreData(`${userId}_hydration`, { water: 0, target: 2000 });
  const [logs, setLogs] = useFirestoreData(`${userId}_hydration_logs`, []);
  const [gamification, setGamification] = useFirestoreData(`${userId}_gamification_state`, { level: 1, xp: 0 });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const confettiRef = useRef(null);
  const xpFlyRef = useRef(null);
  const { width, height } = Dimensions.get('window');
  
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [isIndianSummer, setIsIndianSummer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState('2000');
  const [goalError, setGoalError] = useState('');
  
  // Selection index for Quick Add drink
  const [selectedDrinkIdx, setSelectedDrinkIdx] = useState(0);

  // Challenge State
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeTimer, setChallengeTimer] = useState(60);
  const [challengeWon, setChallengeWon] = useState(false);

  // Daily midnight reset — resets hydration water count each new day
  useEffect(() => {
    const checkAndResetDaily = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastResetDate = await AsyncStorage.getItem(`hydration_reset_date_${userId}`);
      if (lastResetDate !== todayStr) {
        // It's a new day — reset the water counter
        setHydration(prev => ({ ...prev, water: 0 }));
        await AsyncStorage.setItem(`hydration_reset_date_${userId}`, todayStr);
      }
    };
    checkAndResetDaily();
  }, []);

  // Handle Challenge Timer
  useEffect(() => {
    let interval = null;
    if (challengeActive && challengeTimer > 0) {
      interval = setInterval(() => {
        setChallengeTimer(t => t - 1);
      }, 1000);
    } else if (challengeTimer === 0 && challengeActive) {
      setChallengeActive(false);
      setChallengeTimer(60);
    }
    return () => clearInterval(interval);
  }, [challengeActive, challengeTimer]);

  // Connect 'Lecture quiet hours' toggle to real notification scheduling
  const handleAlertsToggle = async (val) => {
    setAlertsEnabled(val);
    if (val) {
      const granted = await requestNotificationPermission();
      if (granted) {
        await scheduleWaterReminders();
      } else {
        setAlertsEnabled(false);
      }
    } else {
      await cancelReminders('water');
    }
  };

  const baseTarget = hydration.target || 2000;
  const currentTarget = isIndianSummer ? baseTarget + 750 : baseTarget;
  const progress = Math.min((hydration.water / currentTarget) * 100, 100);
  const remainingWater = Math.max(0, currentTarget - hydration.water);

  // Animated values
  const fillAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  // Selection Scale animations for drink cards
  const scaleAnims = useRef(DRINK_TYPES.map(() => new Animated.Value(1))).current;

  // Floating Bubble animations
  const [showLoggedBubble, setShowLoggedBubble] = useState(false);
  const [loggedBubbleAmount, setLoggedBubbleAmount] = useState('');
  const [loggedBubbleColor, setLoggedBubbleColor] = useState('#4B6BFB');
  const bubbleAnimY = useRef(new Animated.Value(0)).current;
  const bubbleAnimOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial scale for water card selection highlight
    Animated.spring(scaleAnims[0], {
      toValue: 1.03,
      friction: 6,
      tension: 40,
      useNativeDriver: true
    }).start();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
    setCustomGoalInput(baseTarget.toString());
  }, []);

  const fillHeight = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%']
  });

  const addCustomDrink = (drink, xpBonus = 0) => {
    const amountToLog = drink.amount;
    const newWater = Math.max(0, hydration.water + amountToLog);
    const hitGoal = newWater >= currentTarget && hydration.water < currentTarget;

    setHydration(prev => ({
      ...prev,
      water: newWater
    }));

    const newLog = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      name: drink.name,
      icon: drink.icon,
      amount: amountToLog,
      color: drink.color,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
    setLogs([newLog, ...logs]);

    // Trigger floating bubble micro-animation
    setLoggedBubbleAmount(amountToLog > 0 ? `+${amountToLog} ml` : `${amountToLog} ml`);
    setLoggedBubbleColor(drink.color);
    setShowLoggedBubble(true);
    bubbleAnimY.setValue(10);
    bubbleAnimOpacity.setValue(1);
    
    Animated.parallel([
      Animated.timing(bubbleAnimY, {
        toValue: -70,
        duration: 800,
        useNativeDriver: true
      }),
      Animated.timing(bubbleAnimOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true
      })
    ]).start(() => {
      setShowLoggedBubble(false);
    });

    if (amountToLog > 0) {
      Vibration.vibrate(40);
      let xpEarned = 5 + xpBonus;
      if (hitGoal) {
        xpEarned += 20;
        setTimeout(() => {
          confettiRef.current?.startBurst();
          Vibration.vibrate([0, 100, 50, 200]);
        }, 150);
      }
      
      awardXP(userId, gamification, xpEarned, `Logged hydration: ${drink.name} (${amountToLog}ml)`).then(setGamification);
      xpFlyRef.current?.trigger(xpEarned, width / 2 - 35, height / 2 - 40);
    }
  };

  const handleSelectDrink = (idx) => {
    setSelectedDrinkIdx(idx);
    DRINK_TYPES.forEach((_, i) => {
      Animated.spring(scaleAnims[i], {
        toValue: i === idx ? 1.03 : 1.0,
        friction: 6,
        tension: 40,
        useNativeDriver: true
      }).start();
    });
  };

  const renderDrinkCard = (idx) => {
    const drink = DRINK_TYPES[idx];
    const isSelected = selectedDrinkIdx === idx;
    return (
      <TouchableOpacity
        key={idx}
        activeOpacity={0.9}
        style={[
          styles.quickDrinkCard,
          { borderColor: isSelected ? drink.color : 'rgba(255,255,255,0.08)' },
          isSelected && { backgroundColor: `${drink.color}0D` }
        ]}
        onPress={() => handleSelectDrink(idx)}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnims[idx] }], flex: 1, justifyContent: 'space-between' }}>
          <View style={styles.drinkTopRow}>
            <View style={[styles.drinkIconContainer, { backgroundColor: `${drink.color}18` }]}>
              <Ionicons name={drink.icon} size={18} color={drink.color} />
            </View>
            <View style={styles.drinkTextColumn}>
              <Text style={styles.drinkName}>{drink.name}</Text>
              <Text style={styles.drinkDesc}>{drink.desc}</Text>
            </View>
          </View>
          <View style={[styles.volumePill, { backgroundColor: `${drink.color}15` }]}>
            <Text style={[styles.drinkVolumeTag, { color: drink.color }]}>
              {drink.amount > 0 ? `+ ${drink.amount} ml` : `- ${Math.abs(drink.amount)} ml`}
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const startChallenge = () => {
    setChallengeTimer(60);
    setChallengeActive(true);
    setChallengeWon(false);
  };

  const logChallengeDrink = () => {
    addCustomDrink(DRINK_TYPES[0], 15); // Log a water with +15 XP challenge bonus
    setChallengeWon(true);
    setChallengeActive(false);
  };

  // Stats Calculations
  const todayStr = new Date().toDateString();
  const logsToday = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr).length;

  const calculateStreak = () => {
    if (!logs || logs.length === 0) return 0;
    const dailyTotals = {};
    logs.forEach(log => {
      const dateStr = new Date(log.timestamp).toDateString();
      dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + Math.max(0, log.amount);
    });
    
    let streak = 0;
    let checkDate = new Date();
    const todayTotal = dailyTotals[checkDate.toDateString()] || 0;
    
    if (todayTotal >= currentTarget) {
      streak = 1;
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayTotal = dailyTotals[checkDate.toDateString()] || 0;
      if (yesterdayTotal >= currentTarget) {
        streak = 0; // Streak is alive, but today's goal not yet met
      } else {
        return 0;
      }
    }
    
    let yesterday = new Date();
    if (streak === 1) {
      yesterday.setDate(yesterday.getDate() - 1);
    } else {
      yesterday = checkDate;
    }
    
    while (true) {
      const dayTotal = dailyTotals[yesterday.toDateString()] || 0;
      if (dayTotal >= currentTarget) {
        streak++;
        yesterday.setDate(yesterday.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };
  const streakDays = calculateStreak();

  const calculateAvg = () => {
    if (!logs || logs.length === 0) return 1800;
    const dailyTotals = {};
    logs.forEach(log => {
      const dateStr = new Date(log.timestamp).toDateString();
      dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + Math.max(0, log.amount);
    });
    const totals = Object.values(dailyTotals);
    const sum = totals.reduce((a, b) => a + b, 0);
    return Math.round(sum / totals.length);
  };
  const avgMlPerDay = calculateAvg();

  return (
    <View style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView 
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#C2A878']} 
              tintColor="#C2A878" 
            />
          }
        >
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Water log</Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => { setGoalError(''); setCustomGoalInput(baseTarget.toString()); setShowSettingsModal(true); }}>
              <Ionicons name="settings-sharp" size={16} color="#C2A878" />
              <Text style={styles.settingsBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Card */}
          <View style={styles.progressCard}>
            <View style={styles.radialContainer}>
              <Animated.View style={[styles.fluidFill, { height: fillHeight }]} />
              <View style={styles.radialTextContainer}>
                <Text style={styles.radialPercentText}>{Math.round(progress)}%</Text>
              </View>
            </View>

            <View style={styles.statsTextColumn}>
              <Text style={styles.waterVolumeText}>
                {hydration.water} <Text style={styles.waterVolumeSub}>/ {currentTarget} ml</Text>
              </Text>
              <Text style={styles.dailyGoalLabel}>Daily goal: {currentTarget} ml</Text>
              <View style={styles.remainingBadge}>
                <Text style={styles.remainingBadgeText}>
                  {remainingWater > 0 ? `${remainingWater} ml remaining` : 'Goal Completed! 🌟'}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statMiniCard}>
              <Text style={styles.statMiniVal}>{logsToday}</Text>
              <Text style={styles.statMiniLabel}>Logs</Text>
            </View>
            <View style={styles.statMiniCard}>
              <Text style={styles.statMiniVal}>{streakDays}</Text>
              <Text style={styles.statMiniLabel}>Streak days</Text>
            </View>
            <View style={styles.statMiniCard}>
              <Text style={styles.statMiniVal}>{avgMlPerDay}</Text>
              <Text style={styles.statMiniLabel}>Avg ml/day</Text>
            </View>
          </View>

          {/* Quick Add Drink */}
          <Text style={styles.sectionTitle}>QUICK ADD DRINK</Text>
          <View style={styles.quickAddGrid}>
            <View style={styles.quickAddRow}>
              {renderDrinkCard(0)}
              {renderDrinkCard(1)}
            </View>
            <View style={styles.quickAddRow}>
              {renderDrinkCard(2)}
              {renderDrinkCard(3)}
            </View>
          </View>

          {/* Log Selected Action with Floating Bubble Animation */}
          <View style={{ position: 'relative', width: '100%' }}>
            {showLoggedBubble && (
              <Animated.View style={[
                styles.floatingBubble, 
                { 
                  transform: [{ translateY: bubbleAnimY }], 
                  opacity: bubbleAnimOpacity, 
                  backgroundColor: `${loggedBubbleColor}15`, 
                  borderColor: loggedBubbleColor 
                }
              ]}>
                <Ionicons name="water" size={12} color={loggedBubbleColor} style={{ marginRight: 4 }} />
                <Text style={[styles.floatingBubbleText, { color: loggedBubbleColor }]}>
                  {loggedBubbleAmount}
                </Text>
              </Animated.View>
            )}
            <TouchableOpacity
              style={styles.logPrimaryBtn}
              activeOpacity={0.8}
              onPress={() => addCustomDrink(DRINK_TYPES[selectedDrinkIdx])}
            >
              <Text style={styles.logPrimaryBtnText}>
                Log selected drink — {DRINK_TYPES[selectedDrinkIdx].name} ({DRINK_TYPES[selectedDrinkIdx].amount > 0 ? `+${DRINK_TYPES[selectedDrinkIdx].amount}` : `${DRINK_TYPES[selectedDrinkIdx].amount}`} ml)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Today's Timeline */}
          <Text style={styles.sectionTitle}>TODAY'S TIMELINE</Text>
          <View style={styles.timelineCard}>
            {logs.length === 0 ? (
              <View style={styles.timelineItem}>
                <View style={styles.timelineLeftColumn}>
                  <Text style={styles.timelineTimeText}>12:30 pm</Text>
                  <View style={[styles.timelineNode, { backgroundColor: '#5A6070' }]} />
                </View>
                <View style={styles.timelineRightCard}>
                  <Text style={styles.timelineTitleText}>Next reminder</Text>
                  <Text style={styles.timelineSubText}>Hydration schedule active</Text>
                </View>
              </View>
            ) : (
              <View>
                {logs.slice(0, 5).map((log, index) => (
                  <View key={log.id} style={styles.timelineItem}>
                    <View style={styles.timelineLeftColumn}>
                      <Text style={styles.timelineTimeText}>{log.time}</Text>
                      <View style={[styles.timelineNode, { backgroundColor: log.color || '#4B6BFB' }]} />
                      {index < logs.slice(0, 5).length - 1 && <View style={styles.timelineConnector} />}
                    </View>
                    <View style={styles.timelineRightCard}>
                      <Text style={styles.timelineTitleText}>{log.name}</Text>
                      <Text style={styles.timelineSubText}>Logged hydration</Text>
                      <Text style={[styles.timelineAmountText, { color: log.amount > 0 ? '#7C9B7A' : '#C47070' }]}>
                        {log.amount > 0 ? `+${log.amount} ml` : `${log.amount} ml`}
                      </Text>
                    </View>
                  </View>
                ))}
                {remainingWater > 0 && (
                  <View style={styles.timelineItem}>
                    <View style={styles.timelineLeftColumn}>
                      <Text style={styles.timelineTimeText}>Schedule</Text>
                      <View style={[styles.timelineNode, { backgroundColor: '#5A6070' }]} />
                    </View>
                    <View style={styles.timelineRightCard}>
                      <Text style={styles.timelineTitleText}>Next reminder</Text>
                      <Text style={styles.timelineSubText}>Keep up the streak!</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Challenge Mode Widget */}
          <Text style={styles.sectionTitle}>CHALLENGE MODE</Text>
          <View style={styles.challengeCard}>
            {challengeActive ? (
              <View style={{ alignItems: 'center' }}>
                <View style={styles.challengeHeaderRow}>
                  <Ionicons name="timer-outline" size={18} color="#C47070" style={{ marginRight: 6 }} />
                  <Text style={styles.challengeTimerText}>{challengeTimer}s remaining</Text>
                </View>
                <Text style={styles.challengeDescText}>Drink 1 glass of water (250 ml) right now!</Text>
                <TouchableOpacity style={styles.challengeActionBtn} onPress={logChallengeDrink}>
                  <Text style={styles.challengeActionBtnText}>I drank it! (+15 XP)</Text>
                </TouchableOpacity>
              </View>
            ) : challengeWon ? (
              <View style={{ alignItems: 'center' }}>
                <View style={styles.challengeHeaderRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#7C9B7A" style={{ marginRight: 6 }} />
                  <Text style={[styles.challengeTimerText, { color: '#7C9B7A' }]}>Challenge Completed!</Text>
                </View>
                <Text style={styles.challengeDescText}>Gained +15 XP bonus. Keep hydrating!</Text>
                <TouchableOpacity style={[styles.challengeActionBtn, { backgroundColor: '#1D2430' }]} onPress={startChallenge}>
                  <Text style={[styles.challengeActionBtnText, { color: '#C2A878' }]}>Start Challenge Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.challengeModeTitle}>60s hydration blitz</Text>
                <Text style={styles.challengeModeSubText}>Drink a full glass in 60 seconds — earn +20 XP bonus</Text>
                <TouchableOpacity style={styles.challengeStartBtn} onPress={startChallenge}>
                  <Text style={styles.challengeStartBtnText}>Start challenge</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Settings Section */}
          <Text style={styles.sectionTitle}>SETTINGS</Text>
          <View style={styles.settingsContainer}>
            <View style={styles.settingsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Indian summer mode</Text>
                <Text style={styles.settingsSub}>+750 ml on hot days</Text>
              </View>
              <Switch 
                value={isIndianSummer} 
                onValueChange={setIsIndianSummer}
                trackColor={{ false: '#171B22', true: 'rgba(194, 168, 120, 0.4)' }}
                thumbColor={isIndianSummer ? '#C2A878' : '#8B92A0'}
              />
            </View>

            <View style={[styles.settingsRow, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Class quiet hours</Text>
                <Text style={styles.settingsSub}>Mute during study/class hours</Text>
              </View>
              <Switch 
                value={alertsEnabled} 
                onValueChange={handleAlertsToggle}
                trackColor={{ false: '#171B22', true: 'rgba(194, 168, 120, 0.4)' }}
                thumbColor={alertsEnabled ? '#C2A878' : '#8B92A0'}
              />
            </View>
          </View>

        </ScrollView>
      </Animated.View>

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Hydration Settings</Text>
            <Text style={styles.modalSubtitle}>Configure your base daily goal target (ml)</Text>
                <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="e.g. 2000"
              placeholderTextColor="#5A6070"
              value={customGoalInput}
              onChangeText={(text) => {
                setCustomGoalInput(text);
                setGoalError('');
              }}
              autoFocus
            />
            
            {goalError ? (
              <Text style={styles.errorText}>{goalError}</Text>
            ) : null}

            <TouchableOpacity 
              style={styles.resetBtn} 
              onPress={() => {
                setHydration(prev => ({ ...prev, target: 2000 }));
                setCustomGoalInput('2000');
                setGoalError('');
                setShowSettingsModal(false);
              }}
            >
              <Text style={styles.resetBtnText}>Reset to recommended (2000ml)</Text>
            </TouchableOpacity>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => setShowSettingsModal(false)}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#C2A878' }]} 
                onPress={() => {
                  const goal = parseInt(customGoalInput);
                  if (isNaN(goal) || goal < 500 || goal > 5000) {
                    setGoalError('Daily goal must be between 500 ml and 5000 ml');
                    return;
                  }
                  setGoalError('');
                  setHydration(prev => ({ ...prev, target: goal }));
                  setShowSettingsModal(false);
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <ConfettiBurst ref={confettiRef} goldOnly={true} />
      <XPFlyAnimation ref={xpFlyRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#F3F1EC'
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  settingsBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#C2A878',
    marginLeft: 6
  },
  progressCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  radialContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0F1115',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginRight: 20
  },
  fluidFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(75, 107, 251, 0.25)',
  },
  radialTextContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  radialPercentText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#4B6BFB'
  },
  statsTextColumn: {
    flex: 1,
    justifyContent: 'center'
  },
  waterVolumeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#F3F1EC'
  },
  waterVolumeSub: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#5A6070'
  },
  dailyGoalLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginTop: 2,
    marginBottom: 8
  },
  remainingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124, 155, 122, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  remainingBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#7C9B7A'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24
  },
  statMiniCard: {
    flex: 1,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statMiniVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC'
  },
  statMiniLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070',
    marginTop: 2
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5A6070',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase'
  },
  quickAddGrid: {
    marginBottom: 14,
    width: '100%'
  },
  quickAddRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10
  },
  quickDrinkCard: {
    width: '48.5%',
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    minHeight: 115,
  },
  drinkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  drinkIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  drinkTextColumn: {
    marginLeft: 10,
    flex: 1
  },
  drinkName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC'
  },
  drinkDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#8B92A0',
    marginTop: 1
  },
  volumePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  drinkVolumeTag: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11
  },
  logPrimaryBtn: {
    backgroundColor: '#C2A878',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '100%'
  },
  logPrimaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115'
  },
  floatingBubble: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  floatingBubbleText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  timelineCard: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 24
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16
  },
  timelineLeftColumn: {
    width: 65,
    alignItems: 'center',
    position: 'relative',
    marginRight: 12
  },
  timelineTimeText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#8B92A0',
    marginBottom: 4
  },
  timelineNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2
  },
  timelineConnector: {
    position: 'absolute',
    top: 24,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -16,
    zIndex: 1
  },
  timelineRightCard: {
    flex: 1,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  timelineTitleText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#F3F1EC'
  },
  timelineSubText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070'
  },
  timelineAmountText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11
  },
  challengeCard: {
    backgroundColor: 'rgba(194, 168, 120, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  challengeModeTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#C2A878'
  },
  challengeModeSubText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginTop: 4,
    marginBottom: 12
  },
  challengeStartBtn: {
    backgroundColor: '#C2A878',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start'
  },
  challengeStartBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#0F1115'
  },
  challengeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  challengeTimerText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#C47070'
  },
  challengeDescText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginBottom: 12,
    textAlign: 'center'
  },
  challengeActionBtn: {
    backgroundColor: '#C2A878',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20
  },
  challengeActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#0F1115'
  },
  settingsContainer: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 20
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settingsLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC'
  },
  settingsSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070',
    marginTop: 2
  },
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
  errorText: {
    color: '#E11D48',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    marginBottom: 16,
    marginTop: -12
  },
  resetBtn: {
    backgroundColor: 'rgba(194, 168, 120, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.2)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20
  },
  resetBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 12
  }
});
