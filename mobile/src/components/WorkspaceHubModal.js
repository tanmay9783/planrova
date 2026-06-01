import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';

const { width } = Dimensions.get('window');
const TILE_WIDTH = (width - 64) / 2; // 24px padding on left/right + 16px gap

const MODULES = [
  {
    id: 'notes',
    screenName: 'NotesWorkspace',
    title: 'Notes',
    desc: 'Access your day-linked drafts',
    icon: 'document-text',
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.15)'
  },
  {
    id: 'water',
    screenName: 'HydrationWorkspace',
    title: 'Water Log',
    desc: 'Log daily drinks and stats',
    icon: 'water',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.15)'
  },
  {
    id: 'budget',
    screenName: 'BudgetWorkspace',
    title: 'Budget',
    desc: 'Track expenses and savings',
    icon: 'cash',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.15)'
  },
  {
    id: 'timer',
    screenName: 'FocusWorkspace',
    title: 'Timer',
    desc: 'Study with focus timers',
    icon: 'timer',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.15)'
  },
  {
    id: 'alarm',
    screenName: 'AlarmWorkspace',
    title: 'Alarms',
    desc: 'Wake up and track sleep',
    icon: 'alarm',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.15)'
  },
  {
    id: 'profile',
    screenName: 'ProfileWorkspace',
    title: 'Profile',
    desc: 'Manage bio and goals',
    icon: 'person',
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.15)'
  },
  {
    id: 'notifications',
    screenName: 'NotificationCenterWorkspace',
    title: 'Quiet Hours',
    desc: 'Configure quiet hours',
    icon: 'notifications',
    color: '#6366F1',
    bgColor: 'rgba(99, 102, 241, 0.15)'
  },
  {
    id: 'calculator',
    screenName: 'CalculatorWorkspace',
    title: 'Calculator',
    desc: 'GPA and target exam calculator',
    icon: 'calculator',
    color: '#BA7517',
    bgColor: 'rgba(186, 117, 23, 0.15)'
  }
];

export default function WorkspaceHubModal({ visible, onClose }) {
  const navigation = useNavigation();
  const emailPrefix = auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Student';
  const [sortedModules, setSortedModules] = useState(MODULES);

  useEffect(() => {
    if (visible) {
      loadAccessHistory();
    }
  }, [visible]);

  const loadAccessHistory = async () => {
    try {
      const historyStr = await AsyncStorage.getItem('hub_recently_accessed');
      if (historyStr) {
        const history = JSON.parse(historyStr);
        const sorted = [...MODULES].sort((a, b) => {
          const idxA = history.indexOf(a.id);
          const idxB = history.indexOf(b.id);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        });
        setSortedModules(sorted);
      } else {
        setSortedModules(MODULES);
      }
    } catch (e) {
      console.warn('Failed to load hub access history', e);
      setSortedModules(MODULES);
    }
  };

  const handleNavigate = async (module, action = null) => {
    try {
      const historyStr = await AsyncStorage.getItem('hub_recently_accessed');
      let history = historyStr ? JSON.parse(historyStr) : [];
      history = history.filter(id => id !== module.id);
      history.unshift(module.id);
      history = history.slice(0, 10);
      await AsyncStorage.setItem('hub_recently_accessed', JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to update hub access history', e);
    }
    onClose();
    if (action) {
      navigation.navigate(module.screenName, { action });
    } else {
      navigation.navigate(module.screenName);
    }
  };

  const handleLongPress = (item) => {
    if (item.id === 'notes') {
      Alert.alert(
        'Quick Action',
        'Do you want to create a new note directly?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Note', onPress: () => handleNavigate(item, 'new_note') }
        ]
      );
    } else if (item.id === 'budget') {
      Alert.alert(
        'Quick Action',
        'Do you want to log an expense directly?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Expense', onPress: () => handleNavigate(item, 'log_expense') }
        ]
      );
    } else if (item.id === 'timer') {
      Alert.alert(
        'Quick Action',
        'Do you want to start focus timer directly?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start Timer', onPress: () => handleNavigate(item, 'start_timer') }
        ]
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="flash" size={24} color="#F3F1EC" />
            <Text style={styles.headerTitle}>{emailPrefix}'s Hub</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#8B92A0" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Select a productivity module to expand</Text>

        <ScrollView contentContainerStyle={styles.gridContainer}>
          <View style={styles.grid}>
            {sortedModules.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.tile}
                onPress={() => handleNavigate(item)}
                onLongPress={() => handleLongPress(item)}
                activeOpacity={0.8}
              >
                <View style={styles.tileHeader}>
                  <View style={[styles.tileIconBg, { backgroundColor: item.bgColor }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <Text style={styles.tileTitle} numberOfLines={1}>{item.title}</Text>
                </View>
                <Text style={styles.tileDesc} numberOfLines={1}>{item.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#F3F1EC' },
  closeBtn: { padding: 4 },
  subtitle: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', fontSize: 14, paddingHorizontal: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  gridContainer: { padding: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 14,
    width: TILE_WIDTH,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 16,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  tileIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
    flex: 1,
  },
  tileDesc: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: '#8B92A0',
    lineHeight: 15,
  }
});
