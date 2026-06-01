import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  Animated, 
  Platform, 
  StatusBar,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { 
  requestNotificationPermission, 
  scheduleWaterReminders, 
  scheduleHabitNudges, 
  scheduleFocusReminders, 
  scheduleDailyTaskReminders,
  scheduleWindDownNudges,
  cancelReminders 
} from '../utils/notifications';
import * as Notifications from 'expo-notifications';

const NOTIFICATION_STYLES = [
  { id: 'gentle', name: 'Gentle & Soft', preview: 'Hey buddy, it is time to study! Grab a tea and open CS101.' },
  { id: 'firm', name: 'Firm & Strict', preview: 'Get to your desk! Your study slot is starting. No excuses.' },
  { id: 'funny', name: 'Funny & Desi', preview: 'Chai thandi ho rahi hai aur syllabus abhi bhi garam hai. Padhan baith!' },
  { id: 'challenge', name: 'Challenge Mode', preview: 'Bet you cannot finish 2 focus rounds in a row today. Ready to prove me wrong?' }
];

export default function NotificationCenterScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  
  const [settings, setSettings] = useFirestoreData('notification_settings', {
    waterReminders: true,
    taskDeadlines: true,
    habitNudges: true,
    focusReminders: true,
    winddownReminders: true,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    style: 'gentle'
  });

  const [previewText, setPreviewText] = useState(NOTIFICATION_STYLES[0].preview);

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Verify and ensure active toggled notifications are scheduled on mount
    const checkAndSchedule = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          if (settings.waterReminders) await scheduleWaterReminders();
          if (settings.habitNudges) await scheduleHabitNudges();
          if (settings.focusReminders) await scheduleFocusReminders();
          if (settings.taskDeadlines) await scheduleDailyTaskReminders();
          if (settings.winddownReminders) await scheduleWindDownNudges();
        }
      } catch (e) {
        console.warn("Init scheduler error:", e);
      }
    };
    checkAndSchedule();
  }, []);

  useEffect(() => {
    const activeStyle = NOTIFICATION_STYLES.find(s => s.id === settings.style);
    if (activeStyle) {
      setPreviewText(activeStyle.preview);
    }
  }, [settings.style]);

  const toggleSetting = async (key) => {
    const newVal = !settings[key];
    const newSettings = {
      ...settings,
      [key]: newVal
    };

    if (newVal && ['waterReminders', 'habitNudges', 'focusReminders', 'taskDeadlines', 'winddownReminders'].includes(key)) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'Please enable notifications in your device Settings to receive study alerts.');
        return;
      }
    }

    try {
      if (key === 'waterReminders') {
        if (newVal) await scheduleWaterReminders();
        else await cancelReminders('water');
      } else if (key === 'habitNudges') {
        if (newVal) await scheduleHabitNudges();
        else await cancelReminders('habits');
      } else if (key === 'focusReminders') {
        if (newVal) await scheduleFocusReminders();
        else await cancelReminders('focus');
      } else if (key === 'taskDeadlines') {
        if (newVal) await scheduleDailyTaskReminders();
        else await cancelReminders('tasks');
      } else if (key === 'winddownReminders') {
        if (newVal) await scheduleWindDownNudges();
        else await cancelReminders('winddown');
      }
    } catch (err) {
      console.warn("Scheduler error:", err);
    }

    setSettings(newSettings);
  };

  const setStyle = (styleId) => {
    setSettings({
      ...settings,
      style: styleId
    });
  };

  const navigation = useNavigation();

  // Helper to adjust quiet hour values
  const adjustQuietTime = (type, direction) => {
    const currentVal = type === 'quietStart' ? settings.quietStart : settings.quietEnd;
    const [hourStr, minStr] = currentVal.split(':');
    let hour = parseInt(hourStr);
    
    if (direction === 'up') {
      hour = (hour + 1) % 24;
    } else {
      hour = (hour - 1 + 24) % 24;
    }
    
    const newVal = `${hour.toString().padStart(2, '0')}:${minStr}`;
    setSettings({
      ...settings,
      [type]: newVal
    });
  };

  // Helper to calculate visual width of quiet hours band
  const getQuietHoursWidth = () => {
    const startHour = parseInt(settings.quietStart.split(':')[0]);
    const endHour = parseInt(settings.quietEnd.split(':')[0]);
    
    if (startHour > endHour) {
      // Overlap midnight (e.g. 22:00 to 07:00 = 9 hours)
      return ((24 - startHour + endHour) / 24) * 100;
    } else {
      return ((endHour - startHour) / 24) * 100;
    }
  };

  const getQuietHoursLeftOffset = () => {
    const startHour = parseInt(settings.quietStart.split(':')[0]);
    return (startHour / 24) * 100;
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          
          <Text style={styles.sectionTitle}>Reminders & Alerts</Text>
          <View style={styles.card}>
            {/* Water Alerts */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="water-outline" size={20} color="#7B93B0" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Water Alerts</Text>
                  <Text style={styles.rowDesc}>Reminders to stay hydrated hourly</Text>
                  {settings.waterReminders && (
                    <Text style={styles.previewText}>Preview: "Drink water now! You have 1500ml left to reach target."</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.waterReminders} 
                onValueChange={() => toggleSetting('waterReminders')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.waterReminders ? '#BA7517' : '#8B92A0'}
              />
            </View>

            <View style={styles.divider} />

            {/* Task Deadlines */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="alarm-outline" size={20} color="#C47070" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Task Deadlines</Text>
                  <Text style={styles.rowDesc}>Alerts before tasks & exams are due</Text>
                  {settings.taskDeadlines && (
                    <Text style={styles.previewText}>Preview: "Grinder Alert: Mid-term Exam is due tomorrow at 9 AM!"</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.taskDeadlines} 
                onValueChange={() => toggleSetting('taskDeadlines')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.taskDeadlines ? '#BA7517' : '#8B92A0'}
              />
            </View>

            <View style={styles.divider} />

            {/* Habit Nudges */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#7C9B7A" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Habit Nudges</Text>
                  <Text style={styles.rowDesc}>Gentle taps to complete daily habits</Text>
                  {settings.habitNudges && (
                    <Text style={styles.previewText}>Preview: "Streak Alert: Read 10 pages to save your 5-day habit streak!"</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.habitNudges} 
                onValueChange={() => toggleSetting('habitNudges')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.habitNudges ? '#BA7517' : '#8B92A0'}
              />
            </View>

            <View style={styles.divider} />

            {/* Focus Reminders */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="timer-outline" size={20} color="#BA7517" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Focus Nudges</Text>
                  <Text style={styles.rowDesc}>Nudges when study target starts</Text>
                  {settings.focusReminders && (
                    <Text style={styles.previewText}>Preview: "Pomodoro Intention: Set a 25-minute timer and begin."</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.focusReminders} 
                onValueChange={() => toggleSetting('focusReminders')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.focusReminders ? '#BA7517' : '#8B92A0'}
              />
            </View>

            <View style={styles.divider} />

            {/* Wind-down reminders */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="moon-outline" size={20} color="#8F7BB0" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Night Wind-Down</Text>
                  <Text style={styles.rowDesc}>Reminders at 9 PM to review day & sleep</Text>
                  {settings.winddownReminders && (
                    <Text style={styles.previewText}>Preview: "Cosmic Wind-Down: Screen time ends at 10 PM. Rate your day."</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.winddownReminders} 
                onValueChange={() => toggleSetting('winddownReminders')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.winddownReminders ? '#BA7517' : '#8B92A0'}
              />
            </View>

            <View style={styles.divider} />

            {/* 9 PM Digest summary */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="mail-open-outline" size={20} color="#BA7517" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Smart 9 PM Digest Summary</Text>
                  <Text style={styles.rowDesc}>Combine all daily alarms into one tap review</Text>
                  {settings.digestEnabled && (
                    <Text style={styles.previewText}>Preview: "Tomorrow's summary: 3 tasks due, next class Physics at 9 AM."</Text>
                  )}
                </View>
              </View>
              <Switch 
                value={settings.digestEnabled} 
                onValueChange={() => setSettings({ ...settings, digestEnabled: !settings.digestEnabled })}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.digestEnabled ? '#BA7517' : '#8B92A0'}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Quiet Study Hours</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="moon-outline" size={20} color="#4B6BFB" style={styles.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Mute Workspace Alarms</Text>
                  <Text style={styles.rowDesc}>Automatically silent all reminders</Text>
                </View>
              </View>
              <Switch 
                value={settings.quietHoursEnabled} 
                onValueChange={() => toggleSetting('quietHoursEnabled')}
                trackColor={{ false: '#0F1115', true: 'rgba(186, 117, 23, 0.4)' }}
                thumbColor={settings.quietHoursEnabled ? '#BA7517' : '#8B92A0'}
              />
            </View>
            
            {settings.quietHoursEnabled && (
              <View style={styles.quietHoursSelection}>
                
                {/* Visual Quiet Hours Band Timeline */}
                <Text style={styles.timelineLabelTitle}>Visual Quiet Hours Zone Timeline</Text>
                <View style={styles.timelineContainer}>
                  <Text style={styles.timelineHourLabel}>12am</Text>
                  <View style={styles.timelineTrack}>
                    <View 
                      style={[
                        styles.timelineActiveBand, 
                        { 
                          left: `${getQuietHoursLeftOffset()}%`, 
                          width: `${getQuietHoursWidth()}%` 
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.timelineHourLabel}>12am</Text>
                </View>

                {/* Adjustments endpoint buttons */}
                <View style={styles.timePickerRow}>
                  <View>
                    <Text style={styles.timeLabel}>Start time:</Text>
                    <Text style={styles.timeTextDisplay}>{settings.quietStart}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustQuietTime('quietStart', 'down')}>
                      <Ionicons name="remove" size={16} color="#BA7517" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustQuietTime('quietStart', 'up')}>
                      <Ionicons name="add" size={16} color="#BA7517" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View style={styles.timePickerRow}>
                  <View>
                    <Text style={styles.timeLabel}>End time:</Text>
                    <Text style={styles.timeTextDisplay}>{settings.quietEnd}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustQuietTime('quietEnd', 'down')}>
                      <Ionicons name="remove" size={16} color="#BA7517" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustQuietTime('quietEnd', 'up')}>
                      <Ionicons name="add" size={16} color="#BA7517" />
                    </TouchableOpacity>
                  </View>
                </View>

              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Nudge Style & Tone</Text>
          <View style={styles.styleSelector}>
            {NOTIFICATION_STYLES.map(style => (
              <TouchableOpacity 
                key={style.id}
                style={[styles.styleBtn, settings.style === style.id && styles.styleBtnActive]}
                onPress={() => setStyle(style.id)}
              >
                <Text style={[styles.styleBtnText, settings.style === style.id && styles.styleBtnTextActive]}>
                  {style.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>LIVE NUDGE PREVIEW</Text>
            <View style={styles.nudgeBubble}>
              <Ionicons name="chatbubble-ellipses" size={22} color="#BA7517" style={{ marginRight: 12 }} />
              <Text style={styles.nudgeText}>"{previewText}"</Text>
            </View>
          </View>

        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  scroll: { padding: 24, paddingBottom: 60 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5A6070', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, marginTop: 12 },
  card: { backgroundColor: '#171B22', borderRadius: 20, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon: { marginRight: 16 },
  rowTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#F3F1EC' },
  rowDesc: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: '#8B92A0', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginVertical: 4 },
  
  quietHoursSelection: {
    marginTop: 16,
    backgroundColor: '#0F1115',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  timePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  timeLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#8B92A0'
  },
  timeBtn: {
    backgroundColor: '#171B22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  timeBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
    fontSize: 13
  },

  styleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24
  },
  styleBtn: {
    backgroundColor: '#171B22',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  styleBtnActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  styleBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8B92A0',
    fontSize: 12
  },
  styleBtnTextActive: {
    color: '#0F1115'
  },

  previewCard: {
    backgroundColor: 'rgba(186, 117, 23, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.12)',
    borderRadius: 20,
    padding: 20,
    marginTop: 8
  },
  previewLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#BA7517',
    letterSpacing: 1.5,
    marginBottom: 12
  },
  nudgeBubble: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  nudgeText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#F3F1EC',
    flex: 1,
    lineHeight: 18,
    fontStyle: 'italic'
  },
  
  // Alarms settings link card
  alarmsLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B24',
    borderWidth: 1.5,
    borderColor: 'rgba(186, 117, 23, 0.25)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20
  },
  alarmsLinkTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#BA7517'
  },
  alarmsLinkDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2
  },

  // Preview text for nudges
  previewText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    fontStyle: 'italic',
    marginTop: 6
  },

  // Quiet Hours Timeline Styles
  timelineLabelTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10
  },
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4
  },
  timelineHourLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    width: 32,
    textAlign: 'center'
  },
  timelineTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#171B22',
    borderRadius: 3,
    position: 'relative',
    marginHorizontal: 8
  },
  timelineActiveBand: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#4B6BFB',
    borderRadius: 3
  },
  timeTextDisplay: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#BA7517',
    fontSize: 15,
    marginTop: 2
  },
  adjustBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center'
  }
});
