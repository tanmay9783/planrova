import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Vibration,
  Alert,
  Dimensions,
  Platform,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { awardXP } from '../utils/xpManager';
import { Accelerometer, Pedometer } from 'expo-sensors';
import { NativeModules } from 'react-native';

const { AlarmModule } = NativeModules;
const { width, height } = Dimensions.get('window');

const MOTIVATIONAL_SENTENCES = [
  "Consistency is the path to academic mastery.",
  "Wake up with determination, sleep with satisfaction.",
  "Every small study session builds a massive future.",
  "Chai can wait, syllabus cannot wait today.",
  "Beat the snooze, win the morning semester."
];

export default function AlarmRingingScreen() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const [userId, setUserId] = useState('guest');
  const [gamification, setGamification] = useState({ level: 1, xp: 0 });
  const [alarmId, setAlarmId] = useState(null);
  const [alarmDetails, setAlarmDetails] = useState(null);

  // Mission States
  const [mathProblems, setMathProblems] = useState([]);
  const [currentMathIdx, setCurrentMathIdx] = useState(0);
  const [mathAnswerInput, setMathAnswerInput] = useState('');
  
  const [shakeCount, setShakeCount] = useState(0);
  const [targetShakes] = useState(15);
  
  const [typingQuote, setTypingQuote] = useState('');
  const [typingInput, setTypingInput] = useState('');
  
  const [walkSteps, setWalkSteps] = useState(0);
  const [targetSteps] = useState(12);

  const [alarmProgressTime, setAlarmProgressTime] = useState(0);

  // Animations
  const ringScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // 1. Resolve Auth User
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setUserId(user.uid);
        loadGamification(user.uid);
      } else {
        setUserId('guest');
      }
    });
    return unsubscribe;
  }, []);

  const loadGamification = async (uid) => {
    try {
      const ref = doc(db, 'users', uid, 'appData', 'gamification');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const val = snap.data().value;
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (parsed) {
          setGamification(parsed);
        }
      }
    } catch (e) {
      console.warn('[RingingScreen] Error loading gamification data:', e);
    }
  };

  // 2. Fetch Triggered Alarm Details
  useEffect(() => {
    const fetchAlarmDetails = async () => {
      try {
        const activeId = await AlarmModule.getTriggeredAlarm();
        setAlarmId(activeId);
        console.log('[RingingScreen] Active Ringing Alarm ID:', activeId);

        const alarmsPrefsJson = await AlarmModule.getAlarms();
        console.log('[RingingScreen] Alarms configuration:', alarmsPrefsJson);

        let details = null;
        if (alarmsPrefsJson) {
          if (alarmsPrefsJson.trim().startsWith('{')) {
            const root = JSON.parse(alarmsPrefsJson);
            const list = root.alarmsList || [];
            details = list.find(a => a.id === activeId);

            if (!details && activeId === 'legacy-wake') {
              const legacy = root.alarms || {};
              details = {
                id: 'legacy-wake',
                label: 'Wake Up',
                mission: legacy.wakeMission || 'none',
                snoozeTime: 5
              };
            }
          } else {
            const list = JSON.parse(alarmsPrefsJson);
            details = list.find(a => a.id === activeId);
          }
        }

        if (details) {
          setAlarmDetails(details);
          setupMission(details.mission || 'none');
        } else {
          // Fallback if details not found
          setAlarmDetails({
            id: activeId || 'unknown',
            label: 'Alarm',
            mission: 'none',
            snoozeTime: 5
          });
          setupMission('none');
        }
      } catch (e) {
        console.warn('[RingingScreen] Error fetching alarm details:', e);
        setupMission('none');
      }
    };

    fetchAlarmDetails();
  }, []);

  const setupMission = (mission) => {
    if (mission === 'math') {
      const problems = [
        generateProblem(1),
        generateProblem(2),
        generateProblem(2),
      ];
      setMathProblems(problems);
      setCurrentMathIdx(0);
      setMathAnswerInput('');
    } else if (mission === 'shake') {
      setShakeCount(0);
    } else if (mission === 'typing') {
      const rand = MOTIVATIONAL_SENTENCES[Math.floor(Math.random() * MOTIVATIONAL_SENTENCES.length)];
      setTypingQuote(rand);
      setTypingInput('');
    } else if (mission === 'walking') {
      setWalkSteps(0);
    }
  };

  // 3. Setup Pulsing Animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringScale, {
          toValue: 1.25,
          duration: 1000,
          useNativeDriver: true
        }),
        Animated.timing(ringScale, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true
        })
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // 4. Progress bar counter
  useEffect(() => {
    const timer = setInterval(() => {
      setAlarmProgressTime(prev => {
        if (prev >= 60) {
          // Auto snooze or auto dismiss after 60 seconds
          handleSnooze();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [alarmDetails]);

  // 5. Sensors Setup for Shake and Walk
  useEffect(() => {
    let accelSubscription = null;
    let pedoSubscription = null;

    if (alarmDetails) {
      const activeMission = alarmDetails.mission || 'none';

      if (activeMission === 'shake') {
        let lastUpdate = 0;
        const SHAKE_THRESHOLD = 2.2;

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
  }, [alarmDetails]);

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
      Alert.alert("Wrong Answer!", "Bhai, focus! Solve carefully.");
      setMathAnswerInput('');
    }
  };

  const handleShakeSensorTrigger = () => {
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

  const handleTypingTextChange = (txt) => {
    setTypingInput(txt);
    if (txt.trim() === typingQuote.trim()) {
      completeAlarmSuccess();
    }
  };

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

  const completeAlarmSuccess = async () => {
    try {
      await AlarmModule.stopRinging();
    } catch (e) {
      console.warn("Failed to stop ringing service", e);
    }
    
    if (userId !== 'guest') {
      try {
        await awardXP(userId, gamification, 20, 'Completed wake-up alarm mission');
      } catch (e) {
        console.warn("Error awarding XP:", e);
      }
    }
    
    Vibration.vibrate([0, 100, 50, 150]);
    Alert.alert(
      "Alarm Silenced! ☀️",
      "Awesome job completing your wake-up mission! Awarded +20 XP. Have a productive day ahead!"
    );
  };

  const handleSnooze = async () => {
    const snoozeTime = alarmDetails?.snoozeTime || 5;
    try {
      await AlarmModule.snoozeAlarm(alarmId || 'legacy-wake', snoozeTime);
    } catch (e) {
      console.warn("Failed to snooze alarm service", e);
    }

    if (userId !== 'guest') {
      try {
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
        
        const gamificationRef = doc(db, 'users', userId, 'appData', 'gamification');
        await setDoc(gamificationRef, {
          id: 'gamification',
          value: JSON.stringify({ level: newLvl, xp: newXp }),
          updated_at: Date.now(),
          deleted: false
        }, { merge: true });
      } catch (e) {
        console.warn("Failed to deduct XP for snooze:", e);
      }
    }

    Vibration.vibrate([0, 100, 50, 100]);
    Alert.alert(
      "Snoozed (-5 XP) ⚠️",
      `Snoozing breaks focus habits. We'll ring again in ${snoozeTime} minutes.`
    );
  };

  if (!fontsLoaded) return null;

  const activeMission = alarmDetails?.mission || 'none';
  const alarmLabel = alarmDetails?.label || 'Alarm';

  return (
    <SafeAreaView style={styles.ringingOverlay}>
      <Animated.View style={[styles.ringingGlowCircle, { transform: [{ scale: ringScale }] }]} />
      
      <Ionicons name="alarm" size={80} color="#E11D48" style={styles.ringingIcon} />
      <Text style={styles.ringingTitle}>
        {alarmLabel.toUpperCase()}
      </Text>
      <Text style={styles.ringingSub}>
        Grind hard today. Solve the mission to turn off!
      </Text>
      
      <View style={styles.ringingProgressTrack}>
        <View style={[styles.ringingProgressBar, { width: `${(alarmProgressTime/60)*100}%` }]} />
      </View>
      
      {/* Ringing Missions Container */}
      <View style={styles.missionActiveCard}>
        <Text style={styles.missionHeading}>ACTIVE WAKE-UP MISSION</Text>
        
        {/* 1. MATH MISSION */}
        {activeMission === 'math' && mathProblems.length > 0 && (
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
        {activeMission === 'shake' && (
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.missionObjective}>Shake phone vigorously to shut off alarm:</Text>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <Ionicons name="phone-portrait" size={60} color="#C2A878" style={{ marginVertical: 16 }} />
            </Animated.View>
            <Text style={styles.shakeCounter}>{shakeCount} / {targetShakes} Shakes</Text>
            <Text style={styles.sensorHelpText}>Accelerometer active. Shake phone, or tap button below as fallback:</Text>
            <TouchableOpacity style={styles.manualShakeBtn} onPress={handleShakeSensorTrigger}>
              <Text style={styles.manualShakeBtnText}>TAP FALLBACK: SHAKE PHONE 📳</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. TYPING MISSION */}
        {activeMission === 'typing' && (
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
        {activeMission === 'walking' && (
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
        {activeMission === 'none' && (
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.missionObjective}>Ready to grind? Tap below to stop.</Text>
            <TouchableOpacity style={styles.missionSubmitBtn} onPress={completeAlarmSuccess}>
              <Text style={styles.missionSubmitText}>Stop Alarm</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Snooze trigger (Anti-snooze cost) */}
      <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
        <Text style={styles.snoozeBtnText}>Snooze Alarm (-5 XP)</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  ringingTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 26, color: '#E11D48', letterSpacing: 1, textAlign: 'center' },
  ringingSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#8B92A0', marginTop: 4, textAlign: 'center' },
  
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
    color: '#C2A878',
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
    backgroundColor: '#C2A878',
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
  sensorHelpText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070',
    textAlign: 'center',
    marginVertical: 10,
    lineHeight: 14
  },
  manualShakeBtn: {
    backgroundColor: '#1D2430',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14
  },
  manualShakeBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#C2A878', fontSize: 11 },
  
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
});
