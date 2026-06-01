import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, Platform, StatusBar, Animated, Easing, ActivityIndicator, AppState, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { useRoute } from '@react-navigation/native';
import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import * as FileSystem from 'expo-file-system/legacy';
import { schedulePomodoroNotification, cancelReminders } from '../utils/notifications';
import * as DocumentPicker from 'expo-document-picker';

const SOUND_ASSETS = {
  rain: require('../../assets/music/rain.mp3'),
  tapri: require('../../assets/music/tapri.mp3'),
  sitar: require('../../assets/music/sitar.mp3'),
  lofi: require('../../assets/music/lofi.mp3')
};

const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;

const AMBIENT_SOUNDS = [
  { id: 'lofi', name: 'Calm Lofi Beats', icon: 'headset-outline', color: '#BA7517' },
  { id: 'rain', name: 'Soothing Rain', icon: 'rainy-outline', color: '#4B6BFB' },
  { id: 'sitar', name: 'Zen Flute', icon: 'musical-notes-outline', color: '#7C9B7A' },
  { id: 'tapri', name: 'Soft Cafe Ambience', icon: 'cafe-outline', color: '#C47070' }
];

export default function FocusScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';

  // Durations & Settings state stored in Firestore
  const [focusSettings, setFocusSettings] = useFirestoreData('focus_settings', {
    workTime: 25,
    breakTime: 5,
    customSoundtracks: []
  });

  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('work'); // 'work' or 'break'
  
  // Custom timer settings modal & music downloader states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
  const [downloadName, setDownloadName] = useState('Helix Lofi');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // AppState & background timer resilience target time
  const targetTimeRef = useRef(null);
  
  // Tasks & Intention State
  const [tasks, setTasks] = useFirestoreData('tasks', []);
  const [activeTaskId, setActiveTaskId] = useState(null);
  
  const [showIntentionModal, setShowIntentionModal] = useState(false);
  const [selectedFocusSound, setSelectedFocusSound] = useState('lofi');
  const [intentionText, setIntentionText] = useState('');
  const [committedIntention, setCommittedIntention] = useState('');
  const route = useRoute();

  // Handle route param selection from Dashboard
  useEffect(() => {
    if (route.params?.selectTaskId) {
      setActiveTaskId(route.params.selectTaskId);
      const selectedTask = tasks.find(t => t.id === route.params.selectTaskId);
      if (selectedTask) {
        setIntentionText(`Work on task: ${selectedTask.title}`);
      }
    }
  }, [route.params?.selectTaskId, tasks]);

  useEffect(() => {
    if (route.params?.action === 'start_timer' && !isActive) {
      if (!committedIntention) {
        setCommittedIntention('General Study');
      }
      setIsActive(true);
      const duration = (focusSettings.workTime || 25) * 60;
      targetTimeRef.current = Date.now() + duration * 1000;
      scheduleFocusAlert('work', duration);
    }
  }, [route.params?.action]);

  // Sync timeLeft when durations change in settings
  useEffect(() => {
    if (!isActive) {
      const duration = mode === 'work' 
        ? (focusSettings.workTime || 25) * 60 
        : (focusSettings.breakTime || 5) * 60;
      setTimeLeft(duration);
    }
  }, [focusSettings.workTime, focusSettings.breakTime, mode, isActive]);

  // Distraction & Session Tracking
  const [distractionsCount, setDistractionsCount] = useState(0);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [starRating, setStarRating] = useState(5);
  const [summaryNote, setSummaryNote] = useState('');

  // Custom states for XP ticker and sharing
  const [displayedXp, setDisplayedXp] = useState(0);

  useEffect(() => {
    if (showSummaryModal) {
      const targetXp = activeTaskId ? 35 : 20;
      setDisplayedXp(0);
      let current = 0;
      const interval = setInterval(() => {
        if (current < targetXp) {
          current += 1;
          setDisplayedXp(current);
        } else {
          clearInterval(interval);
        }
      }, 40);
      return () => clearInterval(interval);
    }
  }, [showSummaryModal]);

  const handleShareSession = async () => {
    try {
      const taskStr = committedIntention ? `"${committedIntention}"` : "my study goals";
      const msg = `🔥 Just finished a 25-minute Deep Study session on ${taskStr} with only ${distractionsCount} distractions on Planory! 🚀📚`;
      await Share.share({ message: msg });
      Vibration.vibrate(40);
    } catch (e) {
      console.warn(e);
    }
  };

  // Lock Mode / Full Screen
  const [isFullScreenLock, setIsFullScreenLock] = useState(false);
  const [exitPressTimer, setExitPressTimer] = useState(0);
  const [isPressingExit, setIsPressingExit] = useState(false);

  // Sound Mixer state (vol values 0 - 100)
  const [soundVolumes, setSoundVolumes] = useState({
    rain: 50,
    tapri: 20,
    sitar: 0,
    lofi: 40
  });

  // Audio playback object ref
  const soundObjects = useRef({
    rain: null,
    tapri: null,
    sitar: null,
    lofi: null
  });

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  // Mount entrance animations
  useEffect(() => {
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
  }, []);

  // Pulse animation loop when timer is active
  useEffect(() => {
    let loop = null;
    if (isActive) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isActive]);

  // Audio Setup & Unload cleanup
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(err => console.warn('Audio setup error:', err));

    return () => {
      Object.keys(soundObjects.current).forEach((key) => {
        if (soundObjects.current[key]) {
          try {
            soundObjects.current[key].remove();
          } catch (e) {
            // ignore
          }
        }
      });
    };
  }, []);

  const allAmbientSounds = [
    ...AMBIENT_SOUNDS,
    ...(focusSettings.customSoundtracks || []).map(track => ({
      id: track.id,
      name: track.name,
      icon: 'download-outline',
      color: '#BA7517',
      isCustom: true,
      localUri: track.localUri
    }))
  ];

  // Sync sound playback states instantly with timer activity/modal preview and volumes
  useEffect(() => {
    const syncMixerSounds = async () => {
      const soundKeys = allAmbientSounds.map(s => s.id);
      
      await Promise.all(soundKeys.map(async (soundId) => {
        const matchingSoundMeta = allAmbientSounds.find(s => s.id === soundId);
        if (!matchingSoundMeta) return;

        let shouldPlayThis = false;
        let volumeToSet = 0;

        if (showIntentionModal) {
          if (selectedFocusSound === soundId && selectedFocusSound !== 'none') {
            shouldPlayThis = true;
            volumeToSet = 60;
          }
        } else if (isActive) {
          const vol = soundVolumes[soundId] !== undefined ? soundVolumes[soundId] : 0;
          if (vol > 0) {
            shouldPlayThis = true;
            volumeToSet = vol;
          }
        }

        const sound = soundObjects.current[soundId];
        
        try {
          if (shouldPlayThis) {
            if (!sound) {
              const source = matchingSoundMeta.isCustom 
                ? matchingSoundMeta.localUri 
                : SOUND_ASSETS[soundId];
                
              const newSound = createAudioPlayer(source);
              newSound.loop = true;
              newSound.volume = volumeToSet / 100;
              newSound.play();
              soundObjects.current[soundId] = newSound;
            } else {
              if (sound.isLoaded) {
                sound.volume = volumeToSet / 100;
                if (!sound.playing) {
                  sound.play();
                }
              } else {
                const source = matchingSoundMeta.isCustom 
                  ? matchingSoundMeta.localUri 
                  : SOUND_ASSETS[soundId];
                  
                const newSound = createAudioPlayer(source);
                newSound.loop = true;
                newSound.volume = volumeToSet / 100;
                newSound.play();
                soundObjects.current[soundId] = newSound;
              }
            }
          } else {
            if (sound) {
              if (sound.playing) {
                sound.pause();
              }
            }
          }
        } catch (e) {
          console.warn(`Mixer sync error for ${soundId}:`, e);
        }
      }));
    };
    
    syncMixerSounds();
  }, [isActive, showIntentionModal, selectedFocusSound, soundVolumes, focusSettings.customSoundtracks]);

  // Gamification & Tracking
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [pomodoroStats, setPomodoroStats] = useFirestoreData('pomodoro_stats', { roundsToday: 0, date: new Date().toISOString().split('T')[0] });

  // Reset stats if new day
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (pomodoroStats.date !== today) {
      setPomodoroStats({ roundsToday: 0, date: today });
    }
  }, []);

  // Timer Tick Interval
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      clearInterval(interval);
      setIsActive(false);
      setIsFullScreenLock(false);
      
      if (mode === 'work') {
        if (activeTaskId) {
          const updatedTasks = tasks.map(t => t.id === activeTaskId ? { ...t, completed: true } : t);
          setTasks(updatedTasks);
          awardXP(userId, gamification, 35, `Completed task "${tasks.find(x => x.id === activeTaskId)?.title || 'Task'}" in Focus block`).then(setGamification);
        } else {
          awardXP(userId, gamification, 20, 'Completed Pomodoro study round').then(setGamification);
        }
        setPomodoroStats(prev => ({ ...prev, roundsToday: prev.roundsToday + 1 }));
        setShowSummaryModal(true);
      } else {
        setMode('work');
        setTimeLeft(WORK_TIME);
        Alert.alert("Break Over!", "Back to study desk! Commit to a focus target.");
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  // Handle Exit Press Countdown
  useEffect(() => {
    let interval = null;
    if (isPressingExit) {
      interval = setInterval(() => {
        setExitPressTimer(prev => {
          if (prev >= 3) {
            clearInterval(interval);
            setIsFullScreenLock(false);
            setIsActive(false);
            setIsPressingExit(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setExitPressTimer(0);
    }
    return () => clearInterval(interval);
  }, [isPressingExit]);

  const scheduleFocusAlert = async (currentMode, seconds) => {
    try {
      await schedulePomodoroNotification(currentMode, seconds);
    } catch (e) {
      console.warn("Error scheduling focus alert:", e);
    }
  };

  const cancelFocusAlerts = async () => {
    try {
      await cancelReminders('pomodoro');
    } catch (e) {
      console.warn("Error cancelling focus alerts:", e);
    }
  };

  const handleDownloadMusic = async () => {
    if (!downloadUrl.trim() || !downloadName.trim()) {
      Alert.alert("Missing Fields", "Please enter a valid URL and track name.");
      return;
    }
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      const filename = `${Date.now()}_${downloadName.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
      const fileUri = FileSystem.documentDirectory + filename;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl.trim(),
        fileUri,
        {},
        (downloadProgressData) => {
          const progress = downloadProgressData.totalBytesWritten / downloadProgressData.totalBytesExpectedToWrite;
          setDownloadProgress(Math.round(progress * 100));
        }
      );
      
      const result = await downloadResumable.downloadAsync();
      
      if (result && result.uri) {
        // Save to focusSettings custom soundtracks
        const newTrack = {
          id: Date.now().toString(),
          name: downloadName.trim(),
          localUri: result.uri,
          filename
        };
        
        const updatedTracks = [...(focusSettings.customSoundtracks || []), newTrack];
        setFocusSettings({
          ...focusSettings,
          customSoundtracks: updatedTracks
        });
        
        Alert.alert("Success 🎉", `"${downloadName}" downloaded locally and ready for study session!`);
        setDownloadName('');
      }
    } catch (e) {
      console.warn("Download error:", e);
      Alert.alert("Download Failed", "Make sure the URL is active and points directly to an MP3 file.");
    } finally {
      setIsDownloading(false);
    }
  };
  const handleSelectLocalFile = async () => {
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
          const newTrack = {
            id: Date.now().toString(),
            name: file.name || 'Local Audio File',
            localUri: uri,
            isLocalFile: true
          };
          
          const updatedTracks = [...(focusSettings.customSoundtracks || []), newTrack];
          setFocusSettings({
            ...focusSettings,
            customSoundtracks: updatedTracks
          });
          
          Alert.alert("Success 🎉", `"${newTrack.name}" added to focus music selector!`);
        }
      }
    } catch (e) {
      console.warn("Document picker error:", e);
      Alert.alert("Picker Error", "Failed to select file from device.");
    }
  };

  // Correct timer based on AppState changes (when returning from background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active' && isActive && targetTimeRef.current) {
        const remaining = Math.round((targetTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          setTimeLeft(0);
        } else {
          setTimeLeft(remaining);
        }
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isActive]);

  // Timer Tick Interval
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      clearInterval(interval);
      setIsActive(false);
      setIsFullScreenLock(false);
      cancelFocusAlerts();
      
      if (mode === 'work') {
        if (activeTaskId) {
          const updatedTasks = tasks.map(t => t.id === activeTaskId ? { ...t, completed: true } : t);
          setTasks(updatedTasks);
          awardXP(userId, gamification, 35, `Completed task "${tasks.find(x => x.id === activeTaskId)?.title || 'Task'}" in Focus block`).then(setGamification);
        } else {
          awardXP(userId, gamification, 20, 'Completed Pomodoro study round').then(setGamification);
        }
        setPomodoroStats(prev => ({ ...prev, roundsToday: prev.roundsToday + 1 }));
        setShowSummaryModal(true);
      } else {
        setMode('work');
        setTimeLeft((focusSettings.workTime || 25) * 60);
        Alert.alert("Break Over!", "Back to study desk! Commit to a focus target.");
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const handleStartPress = () => {
    if (!isActive && mode === 'work' && !committedIntention) {
      setShowIntentionModal(true);
    } else {
      const nextActive = !isActive;
      setIsActive(nextActive);
      
      if (nextActive) {
        targetTimeRef.current = Date.now() + timeLeft * 1000;
        scheduleFocusAlert(mode, timeLeft);
      } else {
        cancelFocusAlerts();
      }
    }
  };

  const handleCommitIntention = () => {
    if (!intentionText.trim()) {
      Alert.alert("Write Intention", "Please write one study goal before committing.");
      return;
    }
    setCommittedIntention(intentionText.trim());
    
    setSoundVolumes(prev => {
      const newVols = { ...prev };
      if (selectedFocusSound !== 'none') {
        newVols[selectedFocusSound] = 60;
      }
      return newVols;
    });

    setShowIntentionModal(false);
    setIsActive(true);
    
    const duration = (focusSettings.workTime || 25) * 60;
    targetTimeRef.current = Date.now() + duration * 1000;
    scheduleFocusAlert('work', duration);
  };

  const resetTimer = () => {
    setIsActive(false);
    const duration = mode === 'work' ? (focusSettings.workTime || 25) * 60 : (focusSettings.breakTime || 5) * 60;
    setTimeLeft(duration);
    setCommittedIntention('');
    setIntentionText('');
    setDistractionsCount(0);
    cancelFocusAlerts();
  };

  const switchMode = (newMode) => {
    setIsActive(false);
    setMode(newMode);
    const duration = newMode === 'work' ? (focusSettings.workTime || 25) * 60 : (focusSettings.breakTime || 5) * 60;
    setTimeLeft(duration);
    setCommittedIntention('');
    setIntentionText('');
    setDistractionsCount(0);
    cancelFocusAlerts();
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const adjustVolume = (trackId, amount) => {
    setSoundVolumes(prev => ({
      ...prev,
      [trackId]: Math.max(0, Math.min(100, (prev[trackId] !== undefined ? prev[trackId] : 0) + amount))
    }));
  };

  const logDistraction = () => {
    setDistractionsCount(prev => prev + 1);
  };

  const saveSessionSummary = () => {
    setShowSummaryModal(false);
    setMode('break');
    setTimeLeft((focusSettings.breakTime || 5) * 60);
    setCommittedIntention('');
    setIntentionText('');
    setDistractionsCount(0);
    setStarRating(5);
    setSummaryNote('');
  };

  const pendingTasks = tasks.filter(t => !t.completed);

  // Full Screen Lock View
  if (isFullScreenLock) {
    const exitProgress = (exitPressTimer / 3) * 100;
    return (
      <View style={[styles.container, styles.fullScreenContainer]}>
        <StatusBar hidden />
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={styles.fullScreenIntention}>Focusing on: "{committedIntention || 'Active Task'}"</Text>
          <Text style={styles.fullScreenTimer}>{formatTime(timeLeft)}</Text>
          
          <TouchableOpacity 
            style={styles.fullScreenDistractionBtn}
            activeOpacity={0.8}
            onPress={logDistraction}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="alert-circle-outline" size={18} color="#C47070" />
              <Text style={styles.fullScreenDistractionBtnText}>Log Distraction ({distractionsCount})</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hold progress bar */}
        {isPressingExit && (
          <View style={styles.holdProgressTrack}>
            <View style={[styles.holdProgressFill, { width: `${exitProgress}%` }]} />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.exitBtn, isPressingExit && { backgroundColor: '#C47070' }]}
          onPressIn={() => setIsPressingExit(true)}
          onPressOut={() => setIsPressingExit(false)}
          activeOpacity={0.9}
        >
          <Text style={styles.exitBtnText}>
            {isPressingExit ? `Hold ${Math.max(1, 3 - exitPressTimer)}s to Exit` : 'Hold 3s to Exit'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Study desk</Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettingsModal(true)}>
              <Ionicons name="options-outline" size={16} color="#BA7517" style={{ marginRight: 6 }} />
              <Text style={styles.settingsBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Intention Status Banner */}
          {committedIntention ? (
            <View style={styles.intentionBanner}>
              <View style={styles.intentionIconBg}>
                <Ionicons name="bookmark" size={16} color="#BA7517" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.intentionBannerTitle}>Target Intention</Text>
                <Text style={styles.intentionBannerText}>"{committedIntention}"</Text>
              </View>
              <TouchableOpacity onPress={() => setCommittedIntention('')}>
                <Ionicons name="close-circle-sharp" size={18} color="#8B92A0" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Study Target Status Card */}
          <View style={styles.statsCard}>
            <View style={styles.statsIconCircle}>
              <Ionicons name="trophy-sharp" size={20} color="#BA7517" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statsLabel}>STUDY TARGETS TODAY</Text>
              <Text style={styles.statsVal}>{pomodoroStats.roundsToday} Deep Work Rounds Completed</Text>
            </View>
          </View>

          {/* Task Assigner */}
          <Text style={styles.sectionTitle}>SELECT RELEVANT SUBJECT TASK</Text>
          <View style={styles.taskSelectorContainer}>
            {pendingTasks.length === 0 ? (
              <View style={styles.emptyTaskBox}>
                <Text style={styles.emptyTaskText}>No pending exam tasks scheduled.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                <TouchableOpacity 
                  style={[styles.taskPill, activeTaskId === null && styles.taskPillActive]}
                  onPress={() => {
                    setActiveTaskId(null);
                    setIntentionText('');
                  }}
                >
                  <Text style={[styles.taskPillText, activeTaskId === null && { color: '#0F1115' }]}>General study</Text>
                </TouchableOpacity>
                {pendingTasks.map(task => (
                  <TouchableOpacity 
                    key={task.id} 
                    style={[styles.taskPill, activeTaskId === task.id && styles.taskPillActive]}
                    onPress={() => {
                      setActiveTaskId(task.id);
                      setIntentionText(`Work on task: ${task.title}`);
                    }}
                  >
                    <Text style={[styles.taskPillText, activeTaskId === task.id && { color: '#0F1115' }]}>{task.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Timer Card */}
          <View style={styles.timerCard}>
            <View style={styles.modeContainer}>
              <TouchableOpacity onPress={() => switchMode('work')} style={[styles.modeBtn, mode === 'work' && styles.modeBtnActive]}>
                <Text style={[styles.modeText, mode === 'work' && styles.modeTextActive]}>Deep Study</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => switchMode('break')} style={[styles.modeBtn, mode === 'break' && styles.modeBtnActive]}>
                <Text style={[styles.modeText, mode === 'break' && styles.modeTextActive]}>Chai Break</Text>
              </TouchableOpacity>
            </View>

            <Animated.View style={[
              styles.timerRing,
              isActive && { borderColor: mode === 'work' ? '#BA7517' : '#7C9B7A', shadowOpacity: 0.15 },
              { transform: [{ scale: pulseAnim }] }
            ]}>
              <Text style={styles.timeText}>{formatTime(timeLeft)}</Text>
              <Text style={styles.modeLabelText}>{mode === 'work' ? 'FOCUSING' : 'BREAK TIME'}</Text>
            </Animated.View>
            
            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.playBtn} activeOpacity={0.8} onPress={handleStartPress}>
                <Ionicons name={isActive ? "pause" : "play"} size={28} color="#0F1115" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetBtn} activeOpacity={0.8} onPress={resetTimer}>
                <Ionicons name="refresh-sharp" size={20} color="#F3F1EC" />
              </TouchableOpacity>
            </View>

            {isActive && (
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity style={styles.inlineActionBtn} onPress={logDistraction}>
                  <Ionicons name="alert-circle-outline" size={14} color="#C47070" style={{ marginRight: 6 }} />
                  <Text style={styles.inlineActionBtnText}>Distraction ({distractionsCount})</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.inlineActionBtn, { backgroundColor: '#1D2430', borderColor: 'rgba(255,255,255,0.05)' }]} onPress={() => setIsFullScreenLock(true)}>
                  <Ionicons name="lock-closed-outline" size={14} color="#F3F1EC" style={{ marginRight: 6 }} />
                  <Text style={[styles.inlineActionBtnText, { color: '#F3F1EC' }]}>Lock Screen</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Sound Mixer */}
          <Text style={styles.sectionTitle}>STUDY BACKGROUND SOUND MIXER</Text>
          <View style={styles.mixerCard}>
            {allAmbientSounds.map(sound => (
              <View key={sound.id} style={styles.mixerRow}>
                <View style={styles.mixerSoundMeta}>
                  <Ionicons name={sound.icon} size={16} color={sound.color} style={{ marginRight: 8 }} />
                  <Text style={styles.mixerSoundName} numberOfLines={1}>{sound.name}</Text>
                </View>
                
                <View style={styles.mixerControls}>
                  <TouchableOpacity 
                    style={styles.volumeAdjustBtn}
                    onPress={() => adjustVolume(sound.id, -10)}
                  >
                    <Ionicons name="remove" size={12} color="#8B92A0" />
                  </TouchableOpacity>
                  
                  <View style={styles.volumeTrackBg}>
                    <View style={[styles.volumeTrackFill, { width: `${soundVolumes[sound.id] !== undefined ? soundVolumes[sound.id] : 0}%`, backgroundColor: sound.color }]} />
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.volumeAdjustBtn}
                    onPress={() => adjustVolume(sound.id, 10)}
                  >
                    <Ionicons name="add" size={12} color="#8B92A0" />
                  </TouchableOpacity>
                  
                  <Text style={styles.volumePctText}>{soundVolumes[sound.id] !== undefined ? soundVolumes[sound.id] : 0}%</Text>
                </View>
              </View>
            ))}
            
            <TouchableOpacity 
              style={styles.mixerAddBtn}
              onPress={handleSelectLocalFile}
            >
              <Ionicons name="add" size={14} color="#BA7517" style={{ marginRight: 4 }} />
              <Text style={styles.mixerAddBtnText}>Add Custom Audio Track</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </Animated.View>

      {/* Intention Modal */}
      <Modal
        visible={showIntentionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowIntentionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Study Intention</Text>
            <Text style={styles.modalSubtitle}>Commit to one target before starting focus session</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Finish mechanics practice problems"
              placeholderTextColor="#5A6070"
              value={intentionText}
              onChangeText={setIntentionText}
              autoFocus
            />

            <Text style={styles.modalSectionLabel}>Select Focus Music</Text>
            <View style={styles.soundSelectorGrid}>
              {[
                { id: 'lofi', name: 'Calm Lofi', icon: 'headset-outline', color: '#BA7517' },
                { id: 'rain', name: 'Soothing Rain', icon: 'rainy-outline', color: '#4B6BFB' },
                { id: 'sitar', name: 'Zen Flute', icon: 'musical-notes-outline', color: '#7C9B7A' },
                { id: 'tapri', name: 'Cafe Ambient', icon: 'cafe-outline', color: '#C47070' },
                ...((focusSettings.customSoundtracks || []).map(t => ({
                  id: t.id,
                  name: t.name,
                  icon: 'download-outline',
                  color: '#BA7517'
                }))),
                { id: 'pick_file', name: 'Add Local File', icon: 'document-text-outline', color: '#8B92A0', isAction: true },
                { id: 'none', name: 'Silence', icon: 'volume-mute-outline', color: '#8B92A0' }
              ].map(item => {
                const isSelected = selectedFocusSound === item.id;
                return (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[
                      styles.soundSelectBtn,
                      isSelected && { borderColor: item.color, backgroundColor: `${item.color}08` }
                    ]}
                    onPress={() => {
                      if (item.isAction) {
                        handleSelectLocalFile();
                      } else {
                        setSelectedFocusSound(item.id);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons 
                      name={item.icon} 
                      size={14} 
                      color={isSelected ? item.color : '#8B92A0'} 
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.soundSelectBtnText, isSelected && { color: item.color }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => setShowIntentionModal(false)}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
                onPress={handleCommitIntention}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Commit & Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Session Summary Modal */}
      <Modal
        visible={showSummaryModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSummaryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="trophy-outline" size={22} color="#BA7517" />
              <Text style={styles.modalTitle}>Study Round Completed!</Text>
            </View>
            <Text style={styles.modalSubtitle}>Excellent job focusing on your committed study task.</Text>
            
            <View style={styles.summaryBoxRow}>
              <View style={styles.summaryItemCol}>
                <Text style={styles.summaryItemVal}>25m</Text>
                <Text style={styles.summaryItemLabel}>FOCUS TIME</Text>
              </View>
              <View style={styles.summaryItemCol}>
                <Text style={[styles.summaryItemVal, { color: '#C47070' }]}>{distractionsCount}</Text>
                <Text style={styles.summaryItemLabel}>DISTRACTIONS</Text>
              </View>
              <View style={styles.summaryItemCol}>
                <Text style={[styles.summaryItemVal, { color: '#BA7517' }]}>🪙 +{displayedXp} XP</Text>
                <Text style={styles.summaryItemLabel}>BONUS XP</Text>
              </View>
            </View>

            <Text style={styles.modalSectionLabel}>Rate Your Focus Level</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(val => (
                <TouchableOpacity key={val} onPress={() => setStarRating(val)}>
                  <Ionicons 
                    name={val <= starRating ? "star" : "star-outline"} 
                    size={28} 
                    color="#BA7517" 
                    style={{ marginRight: 8 }}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSectionLabel}>Study Log Notes (Optional)</Text>
            <TextInput
              style={styles.summaryNotesInput}
              placeholder="What did you achieve in this study round?"
              placeholderTextColor="#5A6070"
              value={summaryNote}
              onChangeText={setSummaryNote}
              multiline
            />

            {/* Share & Next Actions */}
            <View style={{ gap: 12, marginTop: 12, marginBottom: 12 }}>
              <TouchableOpacity 
                style={styles.shareSessionBtn} 
                onPress={handleShareSession}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#0F1115" style={{ marginRight: 6 }} />
                <Text style={styles.shareSessionBtnText}>Share Status on WhatsApp</Text>
              </TouchableOpacity>

              <Text style={styles.modalSectionLabel}>Next Action Suggestions</Text>
              <View style={styles.suggestionsRow}>
                <TouchableOpacity 
                  style={styles.suggestionPill} 
                  onPress={saveSessionSummary}
                >
                  <Ionicons name="walk-outline" size={14} color="#7C9B7A" style={{ marginRight: 4 }} />
                  <Text style={styles.suggestionPillText}>Stretch & Walk</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.suggestionPill}
                  onPress={saveSessionSummary}
                >
                  <Ionicons name="water-outline" size={14} color="#4B6BFB" style={{ marginRight: 4 }} />
                  <Text style={styles.suggestionPillText}>Drink Water</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.suggestionPill}
                  onPress={saveSessionSummary}
                >
                  <Ionicons name="book-outline" size={14} color="#BA7517" style={{ marginRight: 4 }} />
                  <Text style={styles.suggestionPillText}>Revise Cards</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity style={styles.saveSummaryBtn} onPress={saveSessionSummary}>
              <Text style={styles.saveSummaryBtnText}>Complete & Start Break</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Timer & Soundtrack Settings Modal */}
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', maxHeight: '80%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.modalTitle}>Focus Settings</Text>
                <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                  <Ionicons name="close" size={24} color="#8B92A0" />
                </TouchableOpacity>
              </View>

              <View style={styles.stepperSection}>
                <Text style={styles.modalSectionLabel}>Study Duration (Minutes)</Text>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity 
                    style={styles.stepperBtn} 
                    onPress={() => {
                      const t = Math.max(5, (focusSettings.workTime || 25) - 1);
                      setFocusSettings({ ...focusSettings, workTime: t });
                    }}
                  >
                    <Ionicons name="remove" size={16} color="#F3F1EC" />
                  </TouchableOpacity>
                  <Text style={styles.stepperVal}>{(focusSettings.workTime || 25)} min</Text>
                  <TouchableOpacity 
                    style={styles.stepperBtn} 
                    onPress={() => {
                      const t = Math.min(120, (focusSettings.workTime || 25) + 1);
                      setFocusSettings({ ...focusSettings, workTime: t });
                    }}
                  >
                    <Ionicons name="add" size={16} color="#F3F1EC" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.stepperSection}>
                <Text style={styles.modalSectionLabel}>Chai Break Duration (Minutes)</Text>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity 
                    style={styles.stepperBtn} 
                    onPress={() => {
                      const t = Math.max(1, (focusSettings.breakTime || 5) - 1);
                      setFocusSettings({ ...focusSettings, breakTime: t });
                    }}
                  >
                    <Ionicons name="remove" size={16} color="#F3F1EC" />
                  </TouchableOpacity>
                  <Text style={styles.stepperVal}>{(focusSettings.breakTime || 5)} min</Text>
                  <TouchableOpacity 
                    style={styles.stepperBtn} 
                    onPress={() => {
                      const t = Math.min(60, (focusSettings.breakTime || 5) + 1);
                      setFocusSettings({ ...focusSettings, breakTime: t });
                    }}
                  >
                    <Ionicons name="add" size={16} color="#F3F1EC" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.modalSectionLabel}>Add Custom Audio Track</Text>
              <Text style={styles.modalSubDescription}>Select any music track from your phone's file manager.</Text>
              
              <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: '#1D2430', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 12 }]} onPress={handleSelectLocalFile}>
                <Ionicons name="document-text-outline" size={16} color="#BA7517" style={{ marginRight: 6 }} />
                <Text style={[styles.downloadBtnText, { color: '#BA7517' }]}>Choose from File Manager</Text>
              </TouchableOpacity>

              <Text style={styles.modalSectionLabel}>Download Custom Soundtrack</Text>
              <Text style={styles.modalSubDescription}>Download study beats locally to play offline.</Text>
              
              <TextInput
                style={styles.modalInputText}
                placeholder="Track Name (e.g. Lofi Study)"
                placeholderTextColor="#5A6070"
                value={downloadName}
                onChangeText={setDownloadName}
              />
              
              <TextInput
                style={styles.modalInputText}
                placeholder="Direct MP3 Link URL"
                placeholderTextColor="#5A6070"
                value={downloadUrl}
                onChangeText={setDownloadUrl}
              />

              {isDownloading ? (
                <View style={styles.downloadProgressContainer}>
                  <ActivityIndicator size="small" color="#BA7517" style={{ marginRight: 10 }} />
                  <Text style={styles.downloadProgressText}>Downloading MP3: {downloadProgress}%</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadMusic}>
                  <Ionicons name="cloud-download-outline" size={16} color="#0F1115" style={{ marginRight: 6 }} />
                  <Text style={styles.downloadBtnText}>Download to Device</Text>
                </TouchableOpacity>
              )}

              {focusSettings.customSoundtracks && focusSettings.customSoundtracks.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.modalSectionLabel}>Downloaded Tracks</Text>
                  {focusSettings.customSoundtracks.map(track => (
                    <View key={track.id} style={styles.downloadedTrackRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="musical-note" size={14} color="#BA7517" style={{ marginRight: 6 }} />
                        <Text style={styles.downloadedTrackName}>{track.name}</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={async () => {
                          try {
                            await FileSystem.deleteAsync(track.localUri, { idempotent: true });
                          } catch (e) {}
                          const filtered = focusSettings.customSoundtracks.filter(t => t.id !== track.id);
                          setFocusSettings({ ...focusSettings, customSoundtracks: filtered });
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#C47070" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517', marginTop: 20 }]} 
                onPress={() => setShowSettingsModal(false)}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Close & Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
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
  intentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(186, 117, 23, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    padding: 14,
    borderRadius: 16,
    marginBottom: 16
  },
  intentionIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(186, 117, 23, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  intentionBannerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#BA7517',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  intentionBannerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#F3F1EC',
    marginTop: 2
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  statsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  statsLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#5A6070',
    fontSize: 9,
    letterSpacing: 0.5
  },
  statsVal: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 13,
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
  taskSelectorContainer: {
    marginBottom: 24
  },
  emptyTaskBox: {
    backgroundColor: '#171B22',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center'
  },
  emptyTaskText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0'
  },
  taskPill: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20
  },
  taskPillActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  taskPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#F3F1EC',
    fontSize: 12
  },
  timerCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24
  },
  modeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8
  },
  modeBtnActive: {
    backgroundColor: '#1D2430'
  },
  modeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#5A6070'
  },
  modeTextActive: {
    color: '#F3F1EC'
  },
  timerRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.04)',
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#BA7517',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0,
    shadowRadius: 12,
    elevation: 3
  },
  timeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 40,
    color: '#F3F1EC',
    letterSpacing: 1
  },
  modeLabelText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    letterSpacing: 1.5,
    marginTop: 4,
    textTransform: 'uppercase'
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#BA7517',
    justifyContent: 'center',
    alignItems: 'center'
  },
  resetBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1D2430',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  inlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 112, 112, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 112, 0.15)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  inlineActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#C47070'
  },
  mixerCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20
  },
  mixerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  mixerSoundMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '38%'
  },
  mixerSoundName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC'
  },
  mixerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '60%',
    justifyContent: 'flex-end'
  },
  volumeAdjustBtn: {
    backgroundColor: '#1D2430',
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  volumeTrackBg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 2,
    marginHorizontal: 8,
    overflow: 'hidden'
  },
  volumeTrackFill: {
    height: '100%',
    borderRadius: 2
  },
  volumePctText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#8B92A0',
    width: 30,
    textAlign: 'right'
  },
  fullScreenContainer: {
    backgroundColor: '#05070B',
    justifyContent: 'space-between',
    padding: 32
  },
  fullScreenIntention: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 16,
    color: '#8B92A0',
    textAlign: 'center',
    marginBottom: 16
  },
  fullScreenTimer: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 72,
    color: '#F3F1EC',
    textAlign: 'center',
    marginBottom: 32
  },
  fullScreenDistractionBtn: {
    backgroundColor: 'rgba(196, 112, 112, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(196, 112, 112, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  fullScreenDistractionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#C47070'
  },
  holdProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    width: '100%',
    marginBottom: 12,
    overflow: 'hidden'
  },
  holdProgressFill: {
    height: '100%',
    backgroundColor: '#BA7517'
  },
  exitBtn: {
    backgroundColor: '#1D2430',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center'
  },
  exitBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC'
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
    padding: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    marginBottom: 16
  },
  modalSectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 10
  },
  soundSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20
  },
  soundSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  soundSelectBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0'
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
  summaryBoxRow: {
    flexDirection: 'row',
    backgroundColor: '#0F1115',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    marginBottom: 16
  },
  summaryItemCol: {
    flex: 1,
    alignItems: 'center'
  },
  summaryItemVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#BA7517'
  },
  summaryItemLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#5A6070',
    marginTop: 2
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 16
  },
  summaryNotesInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    height: 70,
    textAlignVertical: 'top',
    marginBottom: 20
  },
  saveSummaryBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  saveSummaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0F1115'
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
  stepperSection: {
    marginBottom: 16
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    marginTop: 6
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#171B22',
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepperVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC'
  },
  modalInputText: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginBottom: 10
  },
  modalSubDescription: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginBottom: 8
  },
  downloadBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6
  },
  downloadBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115'
  },
  downloadProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    justifyContent: 'center'
  },
  downloadProgressText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#BA7517'
  },
  downloadedTrackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)'
  },
  downloadedTrackName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC'
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 16
  },
  mixerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#0F1115',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginTop: 10
  },
  mixerAddBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#BA7517'
  },
  shareSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366', // WhatsApp Green
    borderRadius: 12,
    paddingVertical: 12,
    width: '100%',
  },
  shareSessionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115',
  },
  suggestionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
    width: '100%',
  },
  suggestionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 8,
  },
  suggestionPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#F3F1EC',
  },
});
