import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Modal, Platform, StatusBar, Animated, Dimensions, Vibration, RefreshControl, Easing, Image } from 'react-native';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import ConfettiBurst from '../components/ConfettiBurst';
import XPFlyAnimation from '../components/XPFlyAnimation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleWaterReminders, cancelReminders, requestNotificationPermission } from '../utils/notifications';
import { LinearGradient } from 'expo-linear-gradient';


const DRINK_TYPES = [
  { name: 'Water', desc: 'Pure hydration', amount: 250, factor: 1.0, color: '#4B6BFB', icon: 'water-outline' },
  { name: 'Nariyal paani', desc: 'Electrolytes +', amount: 250, factor: 1.0, color: '#7C9B7A', icon: 'leaf-outline' },
  { name: 'Nimbu paani', desc: 'Vitamin C boost', amount: 250, factor: 1.0, color: '#BA7517', icon: 'sunny-outline' },
  { name: 'Cutting chai', desc: 'Diuretic (-30 ml)', amount: -30, factor: 1.0, color: '#C47070', icon: 'cafe-outline' }
];

const WaveOverlay = () => {
  const waveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  const translateX = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-25, 5]
  });

  const rotate = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-1.5deg', '1.5deg']
  });

  return (
    <Animated.View
      style={[
        styles.waveOverlay,
        {
          transform: [{ translateX }, { rotate }],
        }
      ]}
    />
  );
};

const Bubble = ({ delay }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const left = useRef(Math.random() * 110 + 20).current;
  const size = useRef(Math.random() * 4 + 3).current;

  useEffect(() => {
    const startAnim = () => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 3000 + Math.random() * 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ]).start(() => startAnim());
    };
    startAnim();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [230, 10]
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 0.6, 0.6, 0]
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        transform: [{ translateY }],
        opacity,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255, 255, 255, 0.35)',
      }}
    />
  );
};

export default function HydrationScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const hydrationCheckedRef = useRef(false);
  const [hydration, setHydration] = useFirestoreData('hydration', { water: 0, target: 2000 });
  const [logs, setLogs] = useFirestoreData('hydration_logs', []);
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });

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

  // Daily midnight reset & target validation
  useEffect(() => {
    if (hydration && !hydrationCheckedRef.current) {
      hydrationCheckedRef.current = true;
      const checkAndResetDaily = async () => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const lastResetDate = await AsyncStorage.getItem(`hydration_reset_date_${userId}`);
        
        let currentTargetVal = hydration.target;
        let shouldReset = false;
        
        if (!currentTargetVal || currentTargetVal < 100) {
          currentTargetVal = 2000;
          shouldReset = true;
        }
        
        if (lastResetDate !== todayStr) {
          setHydration({ water: 0, target: currentTargetVal });
          await AsyncStorage.setItem(`hydration_reset_date_${userId}`, todayStr);
        } else if (shouldReset) {
          setHydration({ ...hydration, target: currentTargetVal });
        }
      };
      checkAndResetDaily();
    }
  }, [hydration]);

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

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false
    }).start();
  }, [progress]);

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
          isSelected && { backgroundColor: `${drink.color}15` }
        ]}
        onPress={() => handleSelectDrink(idx)}
      >
        {isSelected && (
          <View style={[styles.cardSelectBadge, { backgroundColor: drink.color }]}>
            <Ionicons name="checkmark" size={10} color="#0F1115" />
          </View>
        )}
        <Animated.View style={{ transform: [{ scale: scaleAnims[idx] }], flex: 1, justifyContent: 'space-between' }}>
          <View style={styles.drinkTopRow}>
            <View style={[styles.drinkIconContainer, { backgroundColor: `${drink.color}18` }]}>
              <Ionicons name={drink.icon} size={22} color={drink.color} />
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
              colors={['#BA7517']} 
              tintColor="#BA7517" 
            />
          }
        >
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Water log</Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => { setGoalError(''); setCustomGoalInput(baseTarget.toString()); setShowSettingsModal(true); }}>
              <Ionicons name="settings-sharp" size={16} color="#BA7517" />
              <Text style={styles.settingsBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Card (Capsule Glass) */}
          <View style={styles.capsuleWrapper}>
            <View style={styles.capsuleContainer}>
              {/* Animated Liquid Fill */}
              <Animated.View style={[styles.fluidFill, { height: fillHeight }]}>
                <LinearGradient
                  colors={['#BA7517', '#4B6BFB', '#102A43']}
                  style={{ flex: 1 }}
                />
                <WaveOverlay />
                <Bubble delay={0} />
                <Bubble delay={500} />
                <Bubble delay={1000} />
                <Bubble delay={1500} />
                <Bubble delay={2000} />
              </Animated.View>

              {/* Exact Glass Cup Image Overlay */}
              <Image 
                source={require('../../assets/glass_cup.png')} 
                style={styles.glassCupImage} 
                resizeMode="cover"
              />

              {/* Centered overlays */}
              <View style={styles.capsuleOverlay}>
                <Text style={styles.capsuleVolumeText}>{hydration.water} ml</Text>
                <Text style={styles.capsuleGoalText}>/ {currentTarget} ml</Text>
              </View>
            </View>
          </View>

          {/* Progress Details & Bar below Glass */}
          <View style={styles.belowGlassProgressContainer}>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressPercentageText}>{Math.round(progress)}% Complete</Text>
              <Text style={styles.progressRemainingText}>
                {remainingWater > 0 ? `${remainingWater} ml left` : 'Daily Goal Achieved! 🌟'}
              </Text>
            </View>
            <View style={styles.progressBarTrack}>
              <LinearGradient
                colors={['#BA7517', '#4B6BFB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${progress}%` }]}
              />
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
              <View style={styles.emptyTimelineCard}>
                <Ionicons name="water-outline" size={32} color="#5A6070" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyTimelineText}>No water logged today yet</Text>
                <Text style={styles.emptyTimelineSub}>Log a drink above to start your hydration timeline.</Text>
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
                  <Text style={[styles.challengeActionBtnText, { color: '#BA7517' }]}>Start Challenge Again</Text>
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
                trackColor={{ false: '#171B22', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={isIndianSummer ? '#BA7517' : '#8B92A0'}
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
                trackColor={{ false: '#171B22', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={alertsEnabled ? '#BA7517' : '#8B92A0'}
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
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
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
    color: '#BA7517',
    marginLeft: 6
  },
  capsuleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  capsuleContainer: {
    width: 180,
    height: 320,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: '#BA7517',
    backgroundColor: '#171B22',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassCupImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 180,
    height: 320,
    opacity: 0.85,
  },
  fluidFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  capsuleOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  capsulePercentLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#BA7517',
    textTransform: 'uppercase',
    letterSpacing: 1,
    position: 'absolute',
    top: 35,
  },
  capsuleVolumeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 28,
    color: '#F3F1EC',
    marginTop: 20,
  },
  capsuleGoalText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 16,
    color: '#8B92A0',
    marginTop: 2,
  },
  remainingBadgeMini: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 12,
  },
  remainingBadgeMiniText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#BA7517',
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
    borderRadius: 20,
    padding: 16,
    minHeight: 125,
    position: 'relative',
  },
  drinkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  drinkIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
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
    backgroundColor: '#BA7517',
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
    backgroundColor: 'rgba(186, 117, 23, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  challengeModeTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#BA7517'
  },
  challengeModeSubText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    marginTop: 4,
    marginBottom: 12
  },
  challengeStartBtn: {
    backgroundColor: '#BA7517',
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
    backgroundColor: '#BA7517',
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
    color: '#C47070',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    marginBottom: 16,
    marginTop: -12
  },
  resetBtn: {
    backgroundColor: 'rgba(186, 117, 23, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20
  },
  resetBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
    fontSize: 12
  },
  waveOverlay: {
    position: 'absolute',
    top: -6,
    left: -20,
    width: '130%',
    height: 12,
    backgroundColor: '#BA7517',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    opacity: 0.6,
  },
  belowGlassProgressContainer: {
    width: '100%',
    backgroundColor: '#171B22',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressPercentageText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
  },
  progressRemainingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#BA7517',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0F1115',
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardSelectBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  emptyTimelineCard: {
    backgroundColor: '#0F1115',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyTimelineText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
  },
  emptyTimelineSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070',
    marginTop: 4,
    textAlign: 'center',
  }
});
