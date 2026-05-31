import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  TextInput, 
  StatusBar,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Alert,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from './src/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { requestNotificationPermission } from './src/utils/notifications';
import * as ImagePicker from 'expo-image-picker';

const CustomTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0F1115'
  }
};

const UNLOCK_STATUS_MESSAGES = [
  "Arranging your study table...",
  "Putting the Cutting Chai on boil...",
  "Loading the pomodoro gears...",
  "Pre-heating the Maggi pan...",
  "Syncing xerox and lecture notes...",
  "Setting quiet hours for lectures..."
];

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const [user, setUser] = useState(null);
  const [showMainApp, setShowMainApp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Custom Interaction States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState(UNLOCK_STATUS_MESSAGES[0]);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  // Onboarding States
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [obStep, setObStep] = useState(1);
  const [obName, setObName] = useState('');
  const [obCollege, setObCollege] = useState('');
  const [obBranch, setObBranch] = useState('');
  const [obSemester, setObSemester] = useState('');
  const [obHabits, setObHabits] = useState([
    { name: 'Gym', icon: 'barbell-outline', selected: true },
    { name: 'Read', icon: 'book-outline', selected: true },
    { name: 'Meditate', icon: 'body-outline', selected: false },
    { name: 'Code', icon: 'code-slash-outline', selected: true },
    { name: 'Namaz', icon: 'sunny-outline', selected: false },
    { name: 'Journal', icon: 'create-outline', selected: false },
    { name: 'Study', icon: 'school-outline', selected: true },
    { name: 'Wake early', icon: 'alarm-outline', selected: false }
  ]);
  const [obStudyHours, setObStudyHours] = useState('4');
  const [obWaterTarget, setObWaterTarget] = useState('2000');
  const [obPocketLimit, setObPocketLimit] = useState('5000');

  // Onboarding Timetable States
  const [obTimetable, setObTimetable] = useState({
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: []
  });
  const [timetableImage, setTimetableImage] = useState(null);
  const [isScanningTimetable, setIsScanningTimetable] = useState(false);
  const [timetableScanStep, setTimetableScanStep] = useState(0); // 0: idle, 1: reading, 2: OCR, 3: matching, 4: complete
  const [scanError, setScanError] = useState(null);
  const [lastBase64, setLastBase64] = useState(null);
  const [showTimetableReview, setShowTimetableReview] = useState(false);
  const scanBarAnim = useRef(new Animated.Value(0)).current;


  // Groq API Key State for AI timetable scanning (vision OCR)
  // Key is NEVER hardcoded — user must paste their own Groq API key in settings.
  // Get a free key at: https://console.groq.com
  const [groqKey, setGroqKey] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('groq_api_key').then(val => {
      if (val) setGroqKey(val);
    });
  }, []);

  const handleSaveGroqKey = async (val) => {
    setGroqKey(val);
    await AsyncStorage.setItem('groq_api_key', val);
  };


  const handleSelectTimetable = async (useCamera = false) => {
    try {
      const { status } = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Denied', `We need ${useCamera ? 'camera' : 'gallery'} access to scan your timetable!`);
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const base64 = result.assets[0].base64;
        setTimetableImage(uri);
        setLastBase64(base64);
        setScanError(null);
        runTimetableScan(base64);
      }
    } catch (e) {
      console.warn(e);
      // Fallback simulation
      setTimetableImage('simulated_timetable.png');
      setLastBase64(null);
      setScanError(null);
      runTimetableScan(null);
    }
  };

  const runTimetableScan = async (base64Data) => {
    setIsScanningTimetable(true);
    setTimetableScanStep(1);
    setScanError(null);
    
    // Start scan beam looping animation
    scanBarAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanBarAnim, {
          toValue: 150,
          duration: 1000,
          useNativeDriver: true
        }),
        Animated.timing(scanBarAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true
        })
      ])
    ).start();

    // Steps timing helper for UI feedback
    const step2Timer = setTimeout(() => setTimetableScanStep(2), 800);
    const step3Timer = setTimeout(() => setTimetableScanStep(3), 1600);

    const useMockFallback = () => {
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setTimetableScanStep(4);
      setObTimetable({
        Monday: [
          { id: 'm1', subject: 'Mathematics', time: '09:00 AM - 10:30 AM', room: 'Room 101' },
          { id: 'm2', subject: 'Science', time: '11:00 AM - 12:30 PM', room: 'Room 102' }
        ],
        Tuesday: [
          { id: 't1', subject: 'English Literature', time: '01:00 PM - 02:30 PM', room: 'Hall A' }
        ],
        Wednesday: [
          { id: 'w1', subject: 'Computer Science', time: '10:00 AM - 11:30 AM', room: 'Lab 2' }
        ],
        Thursday: [
          { id: 'th1', subject: 'Social Studies', time: '09:00 AM - 11:00 AM', room: 'Room 104' }
        ],
        Friday: [
          { id: 'f1', subject: 'General Knowledge', time: '02:00 PM - 03:30 PM', room: 'Room 105' }
        ],
        Saturday: [],
        Sunday: []
      });
      setIsScanningTimetable(false);
      setShowTimetableReview(true);
    };

    if (!base64Data) {
      setIsScanningTimetable(false);
      setTimetableScanStep(0);
      setScanError('read_failed');
      return;
    }

    if (!groqKey) {
      setTimeout(useMockFallback, 2400);
      return;
    }

    const activeKey = groqKey;

    const makeRequest = async () => {
      return await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.2-11b-vision-preview',
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this timetable image. Extract all classes and lectures for each weekday: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday. For each class/lecture, identify the subject name, the time duration (use format HH:MM AM/PM - HH:MM AM/PM, e.g. 09:00 AM - 10:30 AM), and the room number/classroom (e.g. LHC-101 or Room 101) if visible. Return ONLY a valid JSON object matching this structure (do not include backticks, markdown, or any conversational text, just the raw JSON object):\n{\n  "Monday": [ { "id": "m1", "subject": "Subject Name", "time": "09:00 AM - 10:30 AM", "room": "LHC-101" } ],\n  "Tuesday": [],\n  "Wednesday": [],\n  "Thursday": [],\n  "Friday": [],\n  "Saturday": [],\n  "Sunday": []\n}'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`
                  }
                }
              ]
            }],
            max_tokens: 2048,
            temperature: 0.1
          })
        }
      );
    };

    try {
      let response = await makeRequest();
      if (!response.ok && (response.status === 404 || response.status === 503)) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        response = await makeRequest();
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`Groq API error ${response.status}: ${errJson?.error?.message || 'Unknown error'}`);
      }

      const resJson = await response.json();
      const textResult = resJson.choices?.[0]?.message?.content || '';

      const cleanJsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJsonStr);

      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setTimetableScanStep(4);
      setObTimetable(parsedData);
      setIsScanningTimetable(false);
      setShowTimetableReview(true);
      setScanError(null);
    } catch (e) {
      console.error('Groq AI Timetable Scan failed:', e);
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setIsScanningTimetable(false);
      if (e.message.includes('404') || e.message.includes('503')) {
        setScanError('unavailable');
      } else if (e.message.toLowerCase().includes('network') || e.message.toLowerCase().includes('cert')) {
        setScanError('network_error');
      } else {
        setScanError('read_failed');
      }
    }
  };

  const updateTimetableField = (day, classId, field, value) => {
    const updated = { ...obTimetable };
    updated[day] = updated[day].map(cls => {
      if (cls.id === classId) {
        return { ...cls, [field]: value };
      }
      return cls;
    });
    setObTimetable(updated);
  };

  const deleteTimetableClass = (day, classId) => {
    const updated = { ...obTimetable };
    updated[day] = updated[day].filter(cls => cls.id !== classId);
    setObTimetable(updated);
  };

  const addTimetableClass = (day) => {
    const updated = { ...obTimetable };
    const newClass = {
      id: Date.now().toString(),
      subject: '',
      time: '10:00 AM - 11:30 AM',
      room: ''
    };
    updated[day] = [...updated[day], newClass];
    setObTimetable(updated);
  };

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const slideStepAnim = useRef(new Animated.Value(0)).current;
  const unlockFadeAnim = useRef(new Animated.Value(1)).current;
  const unlockScaleAnim = useRef(new Animated.Value(1)).current;
  const mainAppEntranceAnim = useRef(new Animated.Value(0)).current;

  // Track if login was triggered manually
  const isInteractiveLogin = useRef(false);
  const profileUnsubRef = useRef(null);

  // Trigger Auth Screen Entrance Animations
  const startAuthEntranceAnimations = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    logoScale.setValue(0.9);
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      })
    ]).start();
  };

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (usr) {
        const checkProfileAndProceed = () => {
          const profileRef = doc(db, 'users', usr.uid, 'appData', `${usr.uid}_user_profile`);
          profileUnsubRef.current = onSnapshot(profileRef, (docSnap) => {
            if (docSnap.exists()) {
              const cloudData = docSnap.data();
              try {
                const parsed = typeof cloudData.value === 'string' 
                  ? JSON.parse(cloudData.value) 
                  : cloudData.value;
                if (parsed && parsed.onboarded) {
                  setOnboardingRequired(false);
                } else {
                  setOnboardingRequired(true);
                }
              } catch (e) {
                setOnboardingRequired(true);
              }
            } else {
              setOnboardingRequired(true);
            }
            setOnboardingLoading(false);
          });
        };

        if (isInteractiveLogin.current) {
          // Interactive Login -> Trigger Unlock Progress Screen
          setIsUnlocking(true);
          progressAnim.setValue(0);
          unlockFadeAnim.setValue(1);
          unlockScaleAnim.setValue(1);
          
          let msgIndex = 0;
          const interval = setInterval(() => {
            msgIndex = (msgIndex + 1) % UNLOCK_STATUS_MESSAGES.length;
            setUnlockMessage(UNLOCK_STATUS_MESSAGES[msgIndex]);
          }, 450);

          Animated.timing(progressAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: false,
          }).start(() => {
            clearInterval(interval);
            checkProfileAndProceed();
            setUser(usr);
            setShowMainApp(true);
            
            // Trigger portal zoom-out animation reveal!
            Animated.parallel([
              Animated.timing(unlockFadeAnim, {
                toValue: 0,
                duration: 650,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true
              }),
              Animated.timing(unlockScaleAnim, {
                toValue: 1.4,
                duration: 650,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true
              })
            ]).start(() => {
              setIsUnlocking(false);
              setIsSubmitting(false);
              isInteractiveLogin.current = false;
            });
          });
        } else {
          // Auto login on start
          checkProfileAndProceed();
          setUser(usr);
          setShowMainApp(true);
          setIsAuthLoading(false);
        }
      } else {
        // Logged out
        setUser(null);
        setShowMainApp(false);
        setIsAuthLoading(false);
        setIsSubmitting(false);
        setOnboardingRequired(false);
        setOnboardingLoading(false);
        isInteractiveLogin.current = false;
        
        if (fontsLoaded) {
          setTimeout(startAuthEntranceAnimations, 50);
        }
      }
    });
    return () => {
      unsub();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
      }
    };
  }, [fontsLoaded]);

  // Run entrance animation once fonts are loaded and auth checks finish
  useEffect(() => {
    if (fontsLoaded && !isAuthLoading && !user && !isUnlocking) {
      startAuthEntranceAnimations();
    }
  }, [fontsLoaded, isAuthLoading, user]);

  // Unlocking Pulse Loop Animation
  useEffect(() => {
    if (isUnlocking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseScale.setValue(1);
    }
  }, [isUnlocking]);

  // Main App Entrance Animation Trigger
  useEffect(() => {
    if (showMainApp) {
      mainAppEntranceAnim.setValue(0);
      Animated.timing(mainAppEntranceAnim, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      }).start();
      
      // NOTE: Notification permission is requested contextually in AlarmScreen
      // when the user first tries to set an alarm — not on app startup.
    }
  }, [showMainApp]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Please fill in both fields.');
      return;
    }
    setAuthError('');
    setIsSubmitting(true);
    isInteractiveLogin.current = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      isInteractiveLogin.current = false;
      setIsSubmitting(false);
      let friendlyMessage = 'Something went wrong. Please try again.';
      if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Invalid email address format.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        friendlyMessage = 'Incorrect email or password. Please try again.';
      } else if (err.code === 'auth/too-many-requests') {
        friendlyMessage = 'Too many failed attempts. Try again later or reset your password.';
      } else if (err.code === 'auth/network-request-failed') {
        friendlyMessage = 'No internet connection. Please check your network.';
      }
      setAuthError(friendlyMessage);
    }
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Please fill in both fields.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    setAuthError('');
    setIsSubmitting(true);
    isInteractiveLogin.current = true;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      isInteractiveLogin.current = false;
      setIsSubmitting(false);
      let friendlyMessage = 'Something went wrong. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'This email is already registered. Try logging in instead!';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'Password must be at least 8 characters.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/network-request-failed') {
        friendlyMessage = 'No internet connection. Please check your network.';
      }
      setAuthError(friendlyMessage);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setAuthError('Enter your email above, then tap Forgot Password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setForgotPasswordSent(true);
      setAuthError('');
    } catch (err) {
      let friendlyMessage = 'Could not send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        friendlyMessage = 'No account found with this email.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      }
      setAuthError(friendlyMessage);
    }
  };

  const handleOnboardingNext = (nextStep) => {
    if (obStep === 1) {
      if (!obName.trim() || !obCollege.trim() || !obBranch.trim() || !obSemester.trim()) {
        Alert.alert('Details Missing', 'Please fill in all personal details to proceed.');
        return;
      }
    }
    
    Animated.timing(slideStepAnim, {
      toValue: -15,
      duration: 150,
      useNativeDriver: true
    }).start(() => {
      setObStep(nextStep);
      slideStepAnim.setValue(15);
      Animated.timing(slideStepAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true
      }).start();
    });
  };

  const toggleObHabit = (index) => {
    const updated = [...obHabits];
    updated[index].selected = !updated[index].selected;
    setObHabits(updated);
  };

  const handleCompleteOnboarding = async () => {
    if (!obName.trim() || !obCollege.trim() || !obBranch.trim() || !obSemester.trim()) {
      setObStep(1);
      Alert.alert('Details Missing', 'Please fill in all personal details.');
      return;
    }

    const userId = user.uid;
    setOnboardingLoading(true);

    try {
      // 1. Save User Profile
      const profileRef = doc(db, 'users', userId, 'appData', `${userId}_user_profile`);
      await setDoc(profileRef, {
        id: `${userId}_user_profile`,
        value: JSON.stringify({
          name: obName.trim(),
          college: obCollege.trim(),
          branch: obBranch.trim(),
          semester: obSemester.trim(),
          bio: `Student at ${obCollege.trim()}`,
          onboarded: true
        }),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 2. Save Habits
      const selectedHabitsList = obHabits.filter(h => h.selected).map((h, idx) => ({
        id: (idx + 1).toString(),
        name: h.name,
        icon: h.icon,
        fire: 0,
        logs: []
      }));
      const habitsRef = doc(db, 'users', userId, 'appData', `${userId}_user_habits`);
      await setDoc(habitsRef, {
        id: `${userId}_user_habits`,
        value: JSON.stringify(selectedHabitsList.length > 0 ? selectedHabitsList : [
          { id: '1', name: 'Drink 3L Water', icon: 'water-outline', fire: 0, logs: [] },
          { id: '2', name: 'Read 10 Pages', icon: 'book-outline', fire: 0, logs: [] }
        ]),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 3. Save Hydration
      const hydrationRef = doc(db, 'users', userId, 'appData', `${userId}_hydration`);
      await setDoc(hydrationRef, {
        id: `${userId}_hydration`,
        value: JSON.stringify({ water: 0, target: parseInt(obWaterTarget) || 2000 }),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 4. Save Budget Settings
      const budgetRef = doc(db, 'users', userId, 'appData', `${userId}_budget_settings`);
      await setDoc(budgetRef, {
        id: `${userId}_budget_settings`,
        value: JSON.stringify({
          monthlyLimit: parseInt(obPocketLimit) || 5000,
          savingsGoalName: 'Semester Exam Fees',
          savingsGoalTarget: 1500,
          savingsGoalCurrent: 500
        }),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 5. Initialize Streaks
      const streaksRef = doc(db, 'users', userId, 'appData', `${userId}_streaks`);
      await setDoc(streaksRef, {
        id: `${userId}_streaks`,
        value: JSON.stringify({
          tasks: 0,
          focus: 0,
          hydration: 0,
          habits: 0,
          budget: 0,
          lastUpdated: { tasks: '', focus: '', hydration: '', habits: '', budget: '' },
          shields: 1
        }),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 6. Initialize Gamification State
      const gamificationRef = doc(db, 'users', userId, 'appData', `${userId}_gamification_state`);
      await setDoc(gamificationRef, {
        id: `${userId}_gamification_state`,
        value: JSON.stringify({ level: 1, xp: 0 }),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      // 7. Save repeating weekly timetable
      const timetableRef = doc(db, 'users', userId, 'appData', `${userId}_timetable`);
      await setDoc(timetableRef, {
        id: `${userId}_timetable`,
        value: JSON.stringify(obTimetable),
        updated_at: Date.now(),
        deleted: false
      }, { merge: true });

      setOnboardingRequired(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Setup Failed', 'Failed to configure your desk workspace. Please try again.');
    } finally {
      setOnboardingLoading(false);
    }
  };

  if (!fontsLoaded || (isAuthLoading && !isUnlocking) || (user && showMainApp && onboardingLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#C2A878" size="large" />
      </View>
    );
  }

  // --- Workspace Unlocking Progress Overlay (During progress bar animation) ---
  if (isUnlocking && !showMainApp) {
    const barWidth = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%']
    });

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
        <View style={styles.unlockContainer}>
          <Animated.View style={[styles.pulseContainer, { transform: [{ scale: pulseScale }] }]}>
            <Ionicons name="sync-outline" size={32} color="#C2A878" />
          </Animated.View>
          <Text style={styles.unlockTitle}>Unlocking Planory</Text>
          <Text style={styles.unlockSubtitle}>{unlockMessage}</Text>
          
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressBar, { width: barWidth }]} />
          </View>
          
          <Text style={styles.studentBadge}>STUDENT WORKSPACE SYNC</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Auth UI ---
  if (!showMainApp) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
        
        {/* Soft Background Glow Effects */}
        <View style={styles.glowTopRight} pointerEvents="none" />
        <View style={styles.glowBottomLeft} pointerEvents="none" />

        <View style={styles.authContainer}>
          <Animated.View style={[
            styles.authCard,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: logoScale }
              ]
            }
          ]}>
            <Text style={styles.brandTitle}>Planory</Text>
            <Text style={styles.subtitle}>Ditch distraction, unlock your desk.</Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, emailFocused && styles.labelFocused]}>School / College Email</Text>
              <TextInput 
                style={[styles.input, emailFocused && styles.inputFocused]} 
                value={email} 
                onChangeText={(t) => { setEmail(t); setForgotPasswordSent(false); }}
                placeholder="student@school.edu"
                placeholderTextColor="#5A6070"
                autoCapitalize="none"
                keyboardType="email-address"
                accessibilityLabel="Email address input"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, passwordFocused && styles.labelFocused]}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput 
                  style={[styles.inputPassword, passwordFocused && styles.inputFocused]} 
                  value={password} 
                  onChangeText={setPassword} 
                  placeholder="Min 8 characters"
                  placeholderTextColor="#5A6070"
                  secureTextEntry={!showPassword}
                  accessibilityLabel="Password input"
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#5A6070" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={handleForgotPassword}
              disabled={isSubmitting}
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotBtnText}>Forgot Password?</Text>
            </TouchableOpacity>

            {forgotPasswordSent && (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={14} color="#7C9B7A" style={{ marginRight: 6 }} />
                <Text style={styles.successBannerText}>Reset link sent! Check your inbox.</Text>
              </View>
            )}

            {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

            <TouchableOpacity 
              style={[styles.btnPrimary, isSubmitting && styles.btnDisabled]} 
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityLabel="Sign in to Planory"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#0F1115" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Enter Workspace</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btnGhost, isSubmitting && styles.btnDisabled]} 
              onPress={handleSignup}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityLabel="Create a new Planory account"
            >
              <Text style={styles.btnGhostText}>Create New Desk</Text>
            </TouchableOpacity>

            <Text style={styles.desiFooter}>Made for Indian Students 🇮🇳</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  // --- Onboarding Flow UI ---
  if (showMainApp && onboardingRequired) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
        <View style={styles.obHeader}>
          <Text style={styles.obHeaderBrand}>PLANORY</Text>
          <View style={styles.obProgressDots}>
            <View style={[styles.obDot, obStep >= 1 && styles.obDotActive]} />
            <View style={[styles.obDot, obStep >= 2 && styles.obDotActive]} />
            <View style={[styles.obDot, obStep >= 3 && styles.obDotActive]} />
          </View>
        </View>

        <Animated.View style={{ flex: 1, transform: [{ translateX: slideStepAnim }] }}>
          {obStep === 1 && (
            <ScrollView contentContainerStyle={styles.obContent}>
              <Text style={styles.obTitle}>Welcome to your Workspace</Text>
              <Text style={styles.obSubtitle}>Let us customize your study profile. This will serve as your digital Student ID.</Text>
              
              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Your Full Name</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obName}
                  onChangeText={setObName}
                  placeholder="e.g. Tanmay Sharma"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>School / College Name</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obCollege}
                  onChangeText={setObCollege}
                  placeholder="e.g. School or University Name"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Class / Branch / Stream</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obBranch}
                  onChangeText={setObBranch}
                  placeholder="e.g. Grade 11 or Computer Science"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Grade / Semester / Year</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obSemester}
                  onChangeText={setObSemester}
                  placeholder="e.g. Grade 11 or Semester 4"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <TouchableOpacity style={styles.obPrimaryBtn} onPress={() => handleOnboardingNext(2)}>
                <Text style={styles.obPrimaryBtnText}>Next: Choose Habits →</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {obStep === 2 && (
            <ScrollView contentContainerStyle={styles.obContent}>
              <Text style={styles.obTitle}>Build Your Routine</Text>
              <Text style={styles.obSubtitle}>Select daily habits you want to track. Planory makes building consistency rewarding.</Text>
              
              <View style={styles.obHabitsGrid}>
                {obHabits.map((habit, idx) => (
                  <TouchableOpacity 
                    key={idx}
                    style={[styles.obHabitCard, habit.selected && styles.obHabitCardActive]}
                    onPress={() => toggleObHabit(idx)}
                    activeOpacity={0.8}
                  >
                    <Ionicons 
                      name={habit.icon} 
                      size={24} 
                      color={habit.selected ? '#0F1115' : '#C2A878'} 
                      style={{ marginBottom: 8 }}
                    />
                    <Text style={[styles.obHabitLabel, habit.selected && styles.obHabitLabelActive]}>
                      {habit.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.obButtonRow}>
                <TouchableOpacity style={styles.obSecondaryBtn} onPress={() => handleOnboardingNext(1)}>
                  <Text style={styles.obSecondaryBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.obPrimaryBtn, { flex: 1 }]} onPress={() => handleOnboardingNext(3)}>
                  <Text style={styles.obPrimaryBtnText}>Next: Targets →</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {obStep === 3 && (
            <ScrollView contentContainerStyle={styles.obContent}>
              <Text style={styles.obTitle}>Set Daily Targets</Text>
              <Text style={styles.obSubtitle}>Set focus study hours, hydration objectives, and pocket budget parameters.</Text>



              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Daily Study Goal (Hours)</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obStudyHours}
                  onChangeText={setObStudyHours}
                  keyboardType="numeric"
                  placeholder="4"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Daily Water Target (ml)</Text>
                <View style={styles.waterQuickSelector}>
                  {[1000, 2000, 3000, 4000, 5000].map(val => (
                    <TouchableOpacity 
                      key={val} 
                      style={[styles.waterSelectorPill, obWaterTarget === val.toString() && styles.waterSelectorPillActive]}
                      onPress={() => setObWaterTarget(val.toString())}
                    >
                      <Text style={[styles.waterSelectorPillText, obWaterTarget === val.toString() && { color: '#0F1115' }]}>{val}ml</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.obInputGroup}>
                <Text style={styles.obLabel}>Optional Monthly Pocket Money Limit (₹)</Text>
                <TextInput 
                  style={styles.obInput}
                  value={obPocketLimit}
                  onChangeText={setObPocketLimit}
                  keyboardType="numeric"
                  placeholder="5000"
                  placeholderTextColor="#5A6070"
                />
              </View>

              <View style={styles.obButtonRow}>
                <TouchableOpacity style={styles.obSecondaryBtn} onPress={() => handleOnboardingNext(2)}>
                  <Text style={styles.obSecondaryBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.obPrimaryBtn, { flex: 1, backgroundColor: '#C2A878' }]} onPress={handleCompleteOnboarding}>
                  <Text style={[styles.obPrimaryBtnText, { color: '#0F1115' }]}>Launch Workspace</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>
    );
  }

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const mainAppScale = mainAppEntranceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1]
  });
  const mainAppTranslateY = mainAppEntranceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0]
  });

  // --- Main App Navigation ---
  return (
    <View style={{ flex: 1, backgroundColor: '#0F1115' }}>
      <Animated.View style={{
        flex: 1,
        opacity: mainAppEntranceAnim,
        transform: [{ scale: mainAppScale }, { translateY: mainAppTranslateY }]
      }}>
        <NavigationContainer theme={CustomTheme}>
          <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
          <RootNavigator />
        </NavigationContainer>
      </Animated.View>

      {/* Absolute Portal Zoom-in Unlocking Screen (During reveal animation) */}
      {isUnlocking && (
        <Animated.View style={[
          StyleSheet.absoluteFill, 
          { 
            backgroundColor: '#0F1115', 
            zIndex: 999,
            opacity: unlockFadeAnim,
            transform: [{ scale: unlockScaleAnim }]
          }
        ]}>
          <SafeAreaView style={styles.container}>
            <View style={styles.unlockContainer}>
              <Animated.View style={[styles.pulseContainer, { transform: [{ scale: pulseScale }] }]}>
                <Ionicons name="sync-outline" size={32} color="#C2A878" />
              </Animated.View>
              <Text style={styles.unlockTitle}>Unlocking Planory</Text>
              <Text style={styles.unlockSubtitle}>{unlockMessage}</Text>
              
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, { width: barWidth }]} />
              </View>
              
              <Text style={styles.studentBadge}>STUDENT WORKSPACE SYNC</Text>
            </View>
          </SafeAreaView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { 
    flex: 1, 
    backgroundColor: '#0F1115', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  container: { 
    flex: 1, 
    backgroundColor: '#0F1115' 
  },
  authContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    padding: 20 
  },
  glowTopRight: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#C2A878',
    opacity: 0.08,
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#4B6BFB',
    opacity: 0.06,
  },
  authCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#C2A878',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 8,
  },
  brandTitle: { 
    fontFamily: 'PlusJakartaSans_700Bold', 
    fontSize: 38, 
    color: '#F3F1EC', 
    textAlign: 'center',
    letterSpacing: -0.5
  },
  subtitle: { 
    fontFamily: 'PlusJakartaSans_500Medium', 
    fontSize: 14, 
    color: '#8B92A0', 
    marginBottom: 32, 
    textAlign: 'center',
    opacity: 0.8
  },
  inputGroup: { 
    marginBottom: 20 
  },
  label: { 
    fontFamily: 'PlusJakartaSans_700Bold', 
    fontSize: 11, 
    color: '#5A6070', 
    textTransform: 'uppercase', 
    letterSpacing: 1.2, 
    marginBottom: 8 
  },
  labelFocused: {
    color: '#C2A878'
  },
  input: { 
    backgroundColor: '#0F1115', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.05)', 
    borderRadius: 14, 
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F3F1EC', 
    fontFamily: 'PlusJakartaSans_500Medium', 
    fontSize: 15,
  },
  inputFocused: {
    borderColor: 'rgba(194, 168, 120, 0.4)',
    backgroundColor: '#13161C'
  },
  btnPrimary: { 
    backgroundColor: '#C2A878', 
    borderRadius: 14, 
    padding: 16, 
    alignItems: 'center', 
    marginTop: 10 
  },
  btnPrimaryText: { 
    color: '#0F1115', 
    fontFamily: 'PlusJakartaSans_700Bold', 
    fontSize: 15,
    letterSpacing: 0.5
  },
  btnGhost: { 
    backgroundColor: 'transparent', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.06)', 
    borderRadius: 14, 
    padding: 16, 
    alignItems: 'center', 
    marginTop: 12 
  },
  btnGhostText: { 
    color: '#F3F1EC', 
    fontFamily: 'PlusJakartaSans_600SemiBold', 
    fontSize: 14 
  },
  btnDisabled: {
    opacity: 0.5
  },
  errorText: { 
    color: '#C47070', 
    fontFamily: 'PlusJakartaSans_600SemiBold', 
    fontSize: 13, 
    marginTop: -8,
    marginBottom: 16, 
    textAlign: 'center' 
  },
  desiFooter: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#5A6070',
    textAlign: 'center',
    marginTop: 24,
    opacity: 0.7
  },

  // Unlock sequence styles
  unlockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  pulseContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(194, 168, 120, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  unlockTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: '#F3F1EC',
    marginBottom: 8
  },
  unlockSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: '#8B92A0',
    marginBottom: 40,
    textAlign: 'center',
    minHeight: 20
  },
  progressTrack: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 48
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#C2A878',
    borderRadius: 2
  },
  studentBadge: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },

  // Onboarding styles
  obHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)'
  },
  obHeaderBrand: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#C2A878',
    letterSpacing: 1.5
  },
  obProgressDots: {
    flexDirection: 'row',
    gap: 8
  },
  obDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  obDotActive: {
    backgroundColor: '#C2A878'
  },
  obContent: {
    padding: 24,
    paddingTop: 32
  },
  obTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
    color: '#F3F1EC',
    marginBottom: 8
  },
  obSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#8B92A0',
    lineHeight: 20,
    marginBottom: 32
  },
  obInputGroup: {
    marginBottom: 20
  },
  obLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8
  },
  obInput: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15
  },
  obPrimaryBtn: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(194, 168, 120, 0.4)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 16
  },
  obPrimaryBtnText: {
    color: '#C2A878',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15
  },
  obHabitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24
  },
  obHabitCard: {
    width: '48%',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100
  },
  obHabitCardActive: {
    backgroundColor: '#C2A878',
    borderColor: '#C2A878'
  },
  obHabitLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#8B92A0',
    textAlign: 'center',
    marginTop: 4
  },
  obHabitLabelActive: {
    color: '#0F1115'
  },
  obButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  obSecondaryBtn: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 90
  },
  obSecondaryBtnText: {
    color: '#8B92A0',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14
  },
  
  // Timetable Scanner Styles
  scannerUploadBox: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  scanBtnOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C2A878',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 12
  },
  scanBtnOptionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0F1115'
  },
  scanningProgressContainer: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20
  },
  imageOverlayContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#0F1115',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative'
  },
  scanBeamLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 15,
    height: 4,
    backgroundColor: '#C2A878',
    opacity: 0.8,
    shadowColor: '#C2A878',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5
  },
  scanningStatusTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC',
    marginBottom: 16
  },
  scanningStepLogs: {
    width: '100%',
    gap: 8,
    paddingHorizontal: 12
  },
  scanStepLogText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#5A6070'
  },
  scanStepLogTextActive: {
    color: '#7C9B7A'
  },
  reviewDaySection: {
    marginBottom: 20,
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  reviewDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  reviewDayTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC'
  },
  addSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(194,168,120,0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  addSlotBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#C2A878'
  },
  emptyDayReview: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#5A6070',
    textAlign: 'center',
    paddingVertical: 8
  },
  reviewClassCard: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 8
  },
  reviewClassInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11
  },
  deleteClassBtn: {
    padding: 6
  },
  apiKeyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    width: '100%'
  },
  apiKeyInput: {
    flex: 1,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    padding: 0
  },
  apiKeyTip: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16,
    marginTop: -4
  },
  // Auth — password row with eye toggle
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
  },
  inputPassword: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 12,
    paddingVertical: 4,
  },
  forgotBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#C2A878',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 155, 122, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(124, 155, 122, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  successBannerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#7C9B7A',
  },
  waterQuickSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  waterSelectorPill: {
    flex: 1,
    minWidth: 70,
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterSelectorPillActive: {
    backgroundColor: '#C2A878',
    borderColor: '#C2A878',
  },
  waterSelectorPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC',
  },
});
