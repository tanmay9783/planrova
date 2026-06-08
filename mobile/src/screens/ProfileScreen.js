import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  Alert,
  Vibration,
  Animated,
  Platform,
  StatusBar,
  Image,
  Share,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { getLevelTitle } from '../utils/gamification';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
export default function ProfileScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const emailPrefix = auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Student';

  // Firestore States
  const [profile, setProfile] = useFirestoreData('user_profile', { 
    name: emailPrefix, 
    bio: 'Student', 
    college: 'Your School / College', 
    branch: 'Class / Branch', 
    semester: 'Grade / Semester',
    onboarded: true 
  });
  const [gamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [tasks] = useFirestoreData('tasks', []);
  const [hydration] = useFirestoreData('hydration', { water: 0, target: 2000 });
  const [hydrationLogs] = useFirestoreData('hydration_logs', []);
  const [streaks] = useFirestoreData('streaks', { tasks: 0, focus: 0, hydration: 0, habits: 0, budget: 0 });
  const [pomodoroStats] = useFirestoreData('pomodoro_stats', { roundsToday: 0 });
  const [xpHistory] = useFirestoreData('xp_history', []);

  const getGroupedXpHistory = () => {
    if (!xpHistory) return [];
    const groups = {};
    xpHistory.forEach(log => {
      if (!log.reason) return;
      const dateStr = new Date(log.timestamp).toDateString();
      let type = 'other';
      let baseReason = log.reason;

      if (log.reason.startsWith('Daily login streak reward')) {
        type = 'login';
        const match = log.reason.match(/Day \d+/);
        baseReason = `Daily login reward: ${match ? match[0] : 'Day 1'}`;
      } else if (log.reason.startsWith('Logged expense')) {
        type = 'expense';
        baseReason = 'Logged expenses';
      } else if (log.reason.startsWith('Logged hydration')) {
        type = 'hydration';
        baseReason = 'Logged hydration';
      } else if (log.reason.startsWith('Completed habit')) {
        type = 'habit';
        baseReason = 'Completed habits';
      } else if (log.reason.includes('Pomodoro') || log.reason.includes('Focus block') || log.reason.includes('focused')) {
        type = 'focus';
        baseReason = 'Focus sessions';
      } else if (log.reason.startsWith('Completed task')) {
        type = 'task';
        baseReason = 'Completed tasks';
      } else if (log.reason.startsWith('Attended class')) {
        type = 'class';
        baseReason = 'Attended classes';
      } else if (log.reason.startsWith('Completed all daily quests')) {
        type = 'quests';
        baseReason = 'Completed daily quests';
      } else if (log.reason.startsWith('Silenced wake-up alarm')) {
        type = 'alarm';
        baseReason = 'Silenced wake-up alarms';
      } else if (log.reason.startsWith('Logged sleep session')) {
        type = 'sleep';
        baseReason = 'Logged sleep sessions';
      }

      const key = `${dateStr}_${type}_${baseReason}`;
      if (!groups[key]) {
        groups[key] = {
          type,
          baseReason,
          count: 0,
          totalXp: 0,
          latestTimestamp: log.timestamp,
          log: log
        };
      }
      groups[key].count += 1;
      groups[key].totalXp += log.amount;
      if (log.timestamp > groups[key].latestTimestamp) {
        groups[key].latestTimestamp = log.timestamp;
      }
    });

    return Object.values(groups).map(g => {
      let finalReason = g.baseReason;
      if (g.count > 1) {
        finalReason = `${g.baseReason} — ${g.count} times today (+${g.totalXp} XP total)`;
      }
      return {
        id: g.log.id,
        timestamp: g.latestTimestamp,
        reason: finalReason,
        amount: g.totalXp,
        originalAmount: g.log.amount,
        type: g.type,
        count: g.count
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
  };

  // OTA Updates
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleCheckForUpdate = async () => {
    try {
      setIsCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          'Update Available',
          'A new version is available. Would you like to download it now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Download & Install', 
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  Alert.alert('Update Downloaded', 'The app will now restart to apply the update.', [
                    { text: 'OK', onPress: () => Updates.reloadAsync() }
                  ]);
                } catch (e) {
                  Alert.alert('Error', 'Failed to download the update.');
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Up to Date', 'You are already on the latest version.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to check for updates. Make sure you are testing a published build.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Custom ID Card state additions
  const [showQRModal, setShowQRModal] = useState(false);
  const [idCardTheme, setIdCardTheme] = useState('gold'); // 'gold' or 'white'
  const [idCardLogo, setIdCardLogo] = useState('school'); // 'school', 'star', 'flash', 'shield'

  const handleShareIDCard = async () => {
    try {
      const text = `🪪 Planrova Student ID\nName: ${profile.name}\nCollege: ${profile.college}\nBranch: ${profile.branch}\nSemester: ${profile.semester}\nLevel: ${gamification.level}`;
      await Share.share({ message: text });
      Vibration.vibrate(40);
    } catch (e) {
      console.warn(e);
    }
  };

  const getLogoIcon = () => {
    switch (idCardLogo) {
      case 'star': return 'star';
      case 'flash': return 'flash';
      case 'shield': return 'shield-checkmark';
      case 'school':
      default:
        return 'school';
    }
  };

  // Local editing states
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [editName, setEditName] = useState(profile.name || emailPrefix);
  const [editCollege, setEditCollege] = useState(profile.college || 'School / College');
  const [editBranch, setEditBranch] = useState(profile.branch || 'Class / Branch');
  const [editSemester, setEditSemester] = useState(profile.semester || 'Grade / Semester');

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

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

  useEffect(() => {
    if (profile) {
      setEditName(profile.name || emailPrefix);
      setEditCollege(profile.college || '');
      setEditBranch(profile.branch || '');
      setEditSemester(profile.semester || '');
    }
  }, [profile]);

  const saveIDCard = async () => {
    if (!editName.trim() || !editCollege.trim() || !editBranch.trim() || !editSemester.trim()) {
      Alert.alert('Required Fields', 'All ID Card details are required.');
      return;
    }
    
    try {
      await setProfile({
        ...profile,
        name: editName.trim(),
        college: editCollege.trim(),
        branch: editBranch.trim(),
        semester: editSemester.trim(),
        bio: `Student at ${editCollege.trim()}`
      });
      setIsEditingCard(false);
      Vibration.vibrate(40);
    } catch (e) {
      Alert.alert('Save Failed', 'Could not update your student profile.');
    }
  };

  const handlePickProfilePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Allow photo access to set your profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const avatarUri = `data:image/jpeg;base64,${asset.base64}`;
        await setProfile({ ...profile, avatar: avatarUri });
        Vibration.vibrate(40);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not load photo. Please try again.');
    }
  };

  const xpProgress = Math.min((gamification.xp / (gamification.level * 100)) * 100, 100);

  // Badge unlock checks
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const chaiCount = hydrationLogs.filter(log => log.name === 'Cutting Chai').length;

  const isHydrationHero = hydration.water >= hydration.target;
  const isFocusBeast = pomodoroStats.roundsToday >= 2;
  const isChaiAddict = chaiCount >= 3;
  const isSyllabusShredder = completedTasksCount >= 5;
  const isWeeklyWarrior = (streaks.tasks || 0) >= 3 || (streaks.focus || 0) >= 3;

  const badges = [
    { id: 'water', name: 'Hydration Hero', icon: 'water', unlocked: isHydrationHero, desc: 'Met daily water target' },
    { id: 'focus', name: 'Focus Beast', icon: 'timer', unlocked: isFocusBeast, desc: 'Finished 2+ focus rounds today' },
    { id: 'chai', name: 'Chai Addict', icon: 'cafe', unlocked: isChaiAddict, desc: 'Logged 3+ cutting chais' },
    { id: 'tasks', name: 'Syllabus Shredder', icon: 'checkbox', unlocked: isSyllabusShredder, desc: 'Completed 5+ total tasks' },
    { id: 'streak', name: 'Weekly Warrior', icon: 'flame', unlocked: isWeeklyWarrior, desc: 'Built a 3-day study streak' }
  ];

  // Git Heatmap calculations (last 28 days, 4 columns of 7 days)
  const renderHeatmap = () => {
    const today = new Date();
    const cells = [];
    
    // We want to generate columns. Standard Git heatmap has 7 rows (Sun-Sat) and 4 columns.
    // Sunday = index 0, Saturday = index 6.
    for (let row = 0; row < 7; row++) {
      const rowCells = [];
      for (let col = 0; col < 4; col++) {
        // Calculate date offset
        const daysAgo = (3 - col) * 7 + (6 - row);
        const cellDate = new Date();
        cellDate.setDate(today.getDate() - daysAgo);
        const dateStr = cellDate.toLocaleDateString('en-CA'); // local YYYY-MM-DD, not UTC

        // Tasks completed count on this date
        const dayCompletedCount = tasks.filter(t => t.date === dateStr && t.completed).length;
        
        let cellColor = '#1D2430'; // Empty
        if (dayCompletedCount >= 3) cellColor = '#7C9B7A'; // High
        else if (dayCompletedCount >= 1) cellColor = 'rgba(186, 117, 23, 0.4)'; // Low/Mid

        rowCells.push(
          <View 
            key={`${row}-${col}`} 
            style={[styles.heatmapCell, { backgroundColor: cellColor }]} 
            title={dateStr}
          />
        );
      }
      cells.push(
        <View key={row} style={styles.heatmapRow}>
          {rowCells}
        </View>
      );
    }
    return cells;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        
        {/* College Smart ID Card */}
        <Text style={styles.sectionTitle}>Digital Student ID Card (HOLD TO SHARE)</Text>
        
        {(() => {
          const isGold = idCardTheme === 'gold';
          const cardBg = isGold ? '#171B22' : '#FFFFFF';
          const cardBorder = isGold ? '#C2A878' : '#D1D5DB';
          const cardTextPrimary = isGold ? '#C2A878' : '#0F1115';
          const cardTextSecondary = isGold ? '#F3F1EC' : '#374151';
          const cardTextMuted = isGold ? '#5A6070' : '#6B7280';

          return (
            <View style={{ marginBottom: 24 }}>
              <TouchableOpacity 
                style={[styles.idCardContainer, { backgroundColor: cardBg, borderColor: cardBorder }]}
                onLongPress={handleShareIDCard}
                activeOpacity={0.95}
                delayLongPress={600}
              >
                {isGold && <View style={styles.idCardGlow} />}
                
                <View style={[styles.idCardHeader, { borderBottomColor: isGold ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={getLogoIcon()} size={20} color={cardTextPrimary} style={{ marginRight: 8 }} />
                    <Text style={[styles.idCardHeaderTitle, { color: cardTextSecondary }]} numberOfLines={1}>{editCollege || 'School / College'}</Text>
                  </View>
                  <View style={styles.chipLayout} />
                </View>

                {isEditingCard ? (
                  <View style={styles.editForm}>
                    <TextInput 
                      style={styles.editInput} 
                      value={editName} 
                      onChangeText={setEditName} 
                      placeholder="Full Name" 
                      placeholderTextColor="#5A6070" 
                    />
                    <TextInput 
                      style={styles.editInput} 
                      value={editCollege} 
                      onChangeText={setEditCollege} 
                      placeholder="School / College Name" 
                      placeholderTextColor="#5A6070" 
                    />
                    <TextInput 
                      style={styles.editInput} 
                      value={editBranch} 
                      onChangeText={setEditBranch} 
                      placeholder="Class / Branch" 
                      placeholderTextColor="#5A6070" 
                    />
                    <TextInput 
                      style={styles.editInput} 
                      value={editSemester} 
                      onChangeText={setEditSemester} 
                      placeholder="Grade / Semester" 
                      placeholderTextColor="#5A6070" 
                    />
                    <View style={styles.editButtons}>
                      <TouchableOpacity style={styles.btnCancel} onPress={() => setIsEditingCard(false)}>
                        <Text style={styles.btnCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnSave} onPress={saveIDCard}>
                        <Text style={styles.btnSaveText}>Save ID</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.idCardBody}>
                    <View style={styles.idCardLeft}>
                      <TouchableOpacity
                        style={styles.photoPlaceholder}
                        onPress={handlePickProfilePhoto}
                        accessibilityLabel="Change profile photo"
                      >
                        {profile.avatar ? (
                          <Image
                            source={{ uri: profile.avatar }}
                            style={styles.photoImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <>
                            <Ionicons name="person" size={36} color="rgba(186, 117, 23, 0.4)" />
                            <View style={styles.photoOverlay}>
                              <Ionicons name="camera-outline" size={12} color="#C2A878" />
                            </View>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.editCardBtn} onPress={() => setIsEditingCard(true)}>
                        <Ionicons name="create-outline" size={14} color="#C2A878" style={{ marginRight: 4 }} />
                        <Text style={styles.editCardBtnText}>Edit ID</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View style={styles.idCardRight}>
                      <Text style={[styles.idCardName, { color: cardTextPrimary }]} numberOfLines={1}>{profile.name}</Text>
                      <Text style={[styles.idCardLabel, { color: cardTextMuted }]}>CLASS / BRANCH</Text>
                      <Text style={[styles.idCardValue, { color: cardTextSecondary }]} numberOfLines={1}>{profile.branch || 'Not Set'}</Text>
                      <Text style={[styles.idCardLabel, { color: cardTextMuted }]}>GRADE / SEMESTER</Text>
                      <Text style={[styles.idCardValue, { color: cardTextSecondary }]} numberOfLines={1}>{profile.semester || 'Not Set'}</Text>
                      
                      {/* Simulated Barcode (Tappable) */}
                      <TouchableOpacity onPress={() => setShowQRModal(true)} style={styles.barcodeRow}>
                        <View style={[styles.barcodeLine, { width: 2, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 1, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 4, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 2, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 1, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 3, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 1, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 2, backgroundColor: cardTextMuted }]} />
                        <View style={[styles.barcodeLine, { width: 4, backgroundColor: cardTextMuted }]} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* Customization Actions Row */}
              <View style={styles.customizationRow}>
                <TouchableOpacity 
                  style={[styles.customizationPill, { borderColor: cardBorder }]} 
                  onPress={() => {
                    setIdCardTheme(isGold ? 'white' : 'gold');
                    Vibration.vibrate(30);
                  }}
                >
                  <Ionicons name="color-palette-outline" size={13} color={cardTextPrimary} style={{ marginRight: 4 }} />
                  <Text style={[styles.customizationText, { color: cardTextSecondary }]}>
                    Theme: {isGold ? 'Gold' : 'White'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.customizationPill, { borderColor: cardBorder }]} 
                  onPress={() => {
                    const logos = ['school', 'star', 'flash', 'shield'];
                    const nextIdx = (logos.indexOf(idCardLogo) + 1) % logos.length;
                    setIdCardLogo(logos[nextIdx]);
                    Vibration.vibrate(30);
                  }}
                >
                  <Ionicons name="sparkles-outline" size={13} color={cardTextPrimary} style={{ marginRight: 4 }} />
                  <Text style={[styles.customizationText, { color: cardTextSecondary }]}>
                    Logo: {idCardLogo}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Student ID QR Modal */}
        <Modal
          visible={showQRModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowQRModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { alignItems: 'center' }]}>
              <Text style={styles.qrModalTitle}>Verified Student ID</Text>
              <Text style={styles.qrModalSubtitle}>Scan code below to verify status</Text>
              
              {/* Beautiful Mock QR Code using Views */}
              <View style={styles.qrContainer}>
                {[1, 2, 3, 4, 5, 6].map(row => (
                  <View key={row} style={styles.qrRow}>
                    {[1, 2, 3, 4, 5, 6].map(col => {
                      const isSquare = (row === 1 && col === 1) || (row === 1 && col === 2) || (row === 2 && col === 1) ||
                                      (row === 5 && col === 5) || (row === 6 && col === 6) || (row === 6 && col === 5) ||
                                      (row === 1 && col === 6) || (row === 2 && col === 5) || (row === 5 && col === 1) ||
                                      ((row + col) % 3 === 0);
                      return (
                        <View 
                          key={col} 
                          style={[styles.qrBlock, isSquare && styles.qrBlockFilled]} 
                        />
                      );
                    })}
                  </View>
                ))}
              </View>

              <View style={styles.qrDetails}>
                <Text style={styles.qrDetailsText}><Text style={{ fontWeight: 'bold', color: '#C2A878' }}>Name:</Text> {profile.name}</Text>
                <Text style={styles.qrDetailsText}><Text style={{ fontWeight: 'bold', color: '#C2A878' }}>College:</Text> {profile.college}</Text>
                <Text style={styles.qrDetailsText}><Text style={{ fontWeight: 'bold', color: '#C2A878' }}>Branch:</Text> {profile.branch}</Text>
                <Text style={styles.qrDetailsText}><Text style={{ fontWeight: 'bold', color: '#C2A878' }}>Level:</Text> LVL {gamification.level}</Text>
              </View>

              <TouchableOpacity 
                style={styles.qrCloseBtn} 
                onPress={() => setShowQRModal(false)}
              >
                <Text style={styles.qrCloseBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{(pomodoroStats.roundsToday || 0) * 0.4}</Text>
            <Text style={styles.statLabel}>Focus Hours</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{completedTasksCount}</Text>
            <Text style={styles.statLabel}>Tasks Done</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{streaks.tasks || 0}</Text>
            <Text style={styles.statLabel}>Daily Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{gamification.xp}</Text>
            <Text style={styles.statLabel}>Current XP</Text>
          </View>
        </View>

        {/* Achievements Shelf */}
        <Text style={styles.sectionTitle}>Achievements Shelf</Text>
        <View style={styles.badgesCard}>
          {badges.map(badge => (
            <View 
              key={badge.id} 
              style={[styles.badgeItem, !badge.unlocked && styles.badgeItemLocked]}
            >
              <View style={[styles.badgeIconBg, badge.unlocked && styles.badgeIconBgUnlocked]}>
                <Ionicons 
                  name={badge.icon} 
                  size={24} 
                  color={badge.unlocked ? '#0F1115' : 'rgba(255,255,255,0.1)'} 
                />
              </View>
              <View style={styles.badgeTextCol}>
                <Text style={[styles.badgeName, badge.unlocked && styles.badgeNameUnlocked]}>{badge.name}</Text>
                <Text style={styles.badgeDesc}>{badge.desc}</Text>
              </View>
              {badge.unlocked ? (
                <Ionicons name="checkmark-circle" size={18} color="#7C9B7A" />
              ) : (
                <Ionicons name="lock-closed" size={16} color="#5A6070" />
              )}
            </View>
          ))}
        </View>

        {/* Git-Style Heatmap consistency Grid */}
        <View style={styles.heatmapSection}>
          <Text style={styles.sectionTitle}>Study Consistency Grid</Text>
          <View style={styles.heatmapCard}>
            <View style={{ flexDirection: 'row' }}>
              <View style={styles.heatmapDaysLabels}>
                <Text style={styles.dayLabelText}>S</Text>
                <Text style={styles.dayLabelText}>M</Text>
                <Text style={styles.dayLabelText}>T</Text>
                <Text style={styles.dayLabelText}>W</Text>
                <Text style={styles.dayLabelText}>T</Text>
                <Text style={styles.dayLabelText}>F</Text>
                <Text style={styles.dayLabelText}>S</Text>
              </View>
              <View style={styles.heatmapGrid}>
                {renderHeatmap()}
              </View>
            </View>
            <View style={styles.heatmapLegend}>
              <Text style={styles.legendText}>Missed</Text>
              <View style={[styles.legendBox, { backgroundColor: '#1D2430' }]} />
              <View style={[styles.legendBox, { backgroundColor: 'rgba(186, 117, 23, 0.4)' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#7C9B7A' }]} />
              <Text style={styles.legendText}>Productive</Text>
            </View>
          </View>
        </View>

        {/* XP Activity History Section */}
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.sectionTitle}>Activity & XP History</Text>
          {xpHistory.length === 0 ? (
            <View style={styles.emptyHistoryCard}>
              <Ionicons name="receipt-outline" size={24} color="#5A6070" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyHistoryText}>No XP activity logged yet. Complete tasks and focus to earn XP!</Text>
            </View>
          ) : (
            <View style={styles.historyContainer}>
              {getGroupedXpHistory().slice(0, 10).map((log, idx) => (
                <View key={log.id || idx} style={styles.historyRow}>
                  <View style={[styles.historyDot, { backgroundColor: log.amount > 15 ? '#C2A878' : log.amount > 9 ? '#4B6BFB' : '#7C9B7A' }]} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.historyReason}>{log.reason}</Text>
                    <Text style={styles.historyTime}>{new Date(log.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={styles.historyXp}>+{log.amount} XP</Text>
                </View>
              ))}
            </View>
          )}
        </View>




        {/* Update Button */}
        <TouchableOpacity style={styles.updateBtn} onPress={handleCheckForUpdate} disabled={isCheckingUpdate}>
          <Ionicons name="cloud-download-outline" size={18} color="#C2A878" style={{ marginRight: 8 }} />
          <Text style={styles.updateText}>{isCheckingUpdate ? 'Checking for updates...' : 'Check for Updates'}</Text>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => auth.signOut()}>
          <Ionicons name="log-out-outline" size={18} color="#C47070" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Sign Out Student Workspace</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5A6070', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, marginTop: 12 },
  
  // ID Card Styling
  idCardContainer: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C2A878',
    padding: 20,
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#C2A878',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  idCardGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    filter: 'blur(20px)'
  },
  idCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 12,
    marginBottom: 16
  },
  idCardHeaderTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
    width: '75%'
  },
  chipLayout: {
    width: 28,
    height: 20,
    backgroundColor: 'rgba(186, 117, 23, 0.25)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.4)'
  },
  idCardBody: {
    flexDirection: 'row'
  },
  idCardLeft: {
    alignItems: 'center',
    marginRight: 20
  },
  photoPlaceholder: {
    width: 80,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(15, 17, 21, 0.85)',
    borderRadius: 10,
    padding: 2,
  },
  editCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  editCardBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#C2A878'
  },
  idCardRight: {
    flex: 1,
    justifyContent: 'center'
  },
  idCardName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: '#C2A878',
    marginBottom: 8
  },
  idCardLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 8,
    color: '#5A6070',
    letterSpacing: 0.5,
    marginTop: 4
  },
  idCardValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC'
  },
  barcodeRow: {
    flexDirection: 'row',
    height: 16,
    alignItems: 'center',
    gap: 2,
    marginTop: 12
  },
  barcodeLine: {
    height: '100%',
    backgroundColor: '#8B92A0',
    opacity: 0.4
  },
  
  // ID Card Edit Mode
  editForm: {
    width: '100%'
  },
  editInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginBottom: 10
  },
  editButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  btnCancel: {
    flex: 1,
    backgroundColor: '#1C2029',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  btnCancelText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8B92A0',
    fontSize: 13
  },
  btnSave: {
    flex: 1,
    backgroundColor: '#C2A878',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  btnSaveText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 13
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8
  },
  statCard: {
    flex: 1,
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  statVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#C2A878'
  },
  statLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: '#8B92A0',
    marginTop: 4,
    textAlign: 'center'
  },

  // Badges Card
  badgesCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)'
  },
  badgeItemLocked: {
    opacity: 0.4
  },
  badgeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  badgeIconBgUnlocked: {
    backgroundColor: '#C2A878'
  },
  badgeTextCol: {
    flex: 1
  },
  badgeName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#8B92A0'
  },
  badgeNameUnlocked: {
    color: '#F3F1EC'
  },
  badgeDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#8B92A0',
    marginTop: 2
  },

  // Heatmap Section
  heatmapSection: {
    marginBottom: 24
  },
  heatmapCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  heatmapDaysLabels: {
    marginRight: 12,
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  dayLabelText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#5A6070',
    fontSize: 10,
    height: 14,
    lineHeight: 14
  },
  heatmapGrid: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heatmapRow: {
    flexDirection: 'column',
    justifyContent: 'space-between'
  },
  heatmapCell: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginBottom: 4
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 4
  },
  legendText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#5A6070'
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginHorizontal: 1
  },

  emptyHistoryCard: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  emptyHistoryText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4
  },
  historyContainer: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)'
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  historyReason: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#F3F1EC',
    fontSize: 13
  },
  historyTime: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 10,
    marginTop: 2
  },
  historyXp: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 13
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 112, 0.2)',
    backgroundColor: 'rgba(196, 112, 112, 0.05)',
    borderRadius: 12,
    marginTop: 16,
    width: '100%'
  },
  logoutText: {
    color: '#C47070',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13
  },
  // Custom smart id card upgrades
  customizationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  customizationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
  },
  customizationText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  qrModalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
    textAlign: 'center',
  },
  qrModalSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 180,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  qrRow: {
    flexDirection: 'row',
    gap: 4,
  },
  qrBlock: {
    width: 22,
    height: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  qrBlockFilled: {
    backgroundColor: '#0F1115',
  },
  qrDetails: {
    marginTop: 20,
    width: '100%',
    backgroundColor: '#0F1115',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  qrDetailsText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC',
  },
  qrCloseBtn: {
    backgroundColor: '#C2A878',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  qrCloseBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0F1115',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#171B22',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  modalActionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.2)',
  },
  updateText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C2A878',
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 112, 112, 0.08)',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 112, 0.2)',
  },
  logoutText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#C47070',
    fontSize: 14,
  },
});
