import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, StatusBar, Animated, Vibration, Modal, TextInput, Alert, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { awardXP } from '../utils/xpManager';
import XPFlyAnimation from '../components/XPFlyAnimation';

import React, { useEffect, useRef, useState } from 'react';

export default function HabitsScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [hydration, setHydration] = useFirestoreData('hydration', { water: 0, target: 2000 });
  const [gamification, setGamification] = useFirestoreData('gamification', { level: 1, xp: 0 });
  const [habits, setHabits] = useFirestoreData('user_habits', []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Spring scale animations for each habit card
  const scaleAnims = useRef({}).current;
  const checkboxScaleAnims = useRef({}).current;
  const xpFlyRef = useRef(null);
  const { width, height } = Dimensions.get('window');

  // Add Habit Form States
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('star-outline');

  const handleAddHabit = () => {
    if (!newHabitName.trim()) return;
    const newHabit = {
      id: Date.now().toString(),
      name: newHabitName.trim(),
      icon: selectedIcon,
      fire: 0,
      logs: []
    };
    setHabits([...habits, newHabit]);
    setNewHabitName('');
    setSelectedIcon('star-outline');
    setShowAddHabit(false);
    Vibration.vibrate(40);
  };

  const handleDeleteHabit = (habitId) => {
    Alert.alert(
      'Delete Habit',
      'Are you sure you want to delete this habit?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setHabits(habits.filter(h => h.id !== habitId));
            Vibration.vibrate(50);
          }
        }
      ]
    );
  };

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
  }, []);

  const addWater = () => {
    setHydration({ ...hydration, water: hydration.water + 250 });
  };

  const animateToggle = (habitId) => {
    const anim = scaleAnims[habitId] || new Animated.Value(1);
    scaleAnims[habitId] = anim;
    
    anim.setValue(0.88);
    Animated.spring(anim, {
      toValue: 1,
      friction: 4,
      tension: 40,
      useNativeDriver: true
    }).start();
  };

  const toggleHabit = (habitId) => {
    animateToggle(habitId);
    
    // Spring animate checkbox scale
    if (!checkboxScaleAnims[habitId]) {
      checkboxScaleAnims[habitId] = new Animated.Value(1);
    }
    const checkAnim = checkboxScaleAnims[habitId];
    checkAnim.setValue(0.6);
    Animated.spring(checkAnim, {
      toValue: 1,
      friction: 3,
      tension: 45,
      useNativeDriver: true
    }).start();

    const today = new Date().toISOString().split('T')[0];
    setHabits(habits.map(h => {
      if (h.id === habitId) {
        const isCompletedToday = h.logs && h.logs.includes(today);
        if (!isCompletedToday) {
          Vibration.vibrate(40);
          awardXP(userId, gamification, 5, `Completed habit: ${h.name}`).then(setGamification);
          xpFlyRef.current?.trigger(5, width / 2 - 35, height / 2 - 40);
        }
        const newLogs = isCompletedToday 
          ? h.logs.filter(d => d !== today)
          : [...(h.logs || []), today];
        return { ...h, logs: newLogs, fire: isCompletedToday ? Math.max(0, h.fire - 1) : h.fire + 1 };
      }
      return h;
    }));
  };

  const displayTarget = hydration.target || 2000;
  const progress = Math.min((hydration.water / displayTarget) * 100, 100);

  const todayStr = new Date().toISOString().split('T')[0];
  const allCompleted = habits.length > 0 && habits.every(h => h.logs && h.logs.includes(todayStr));
  const shimmerAnim = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    if (allCompleted) {
      Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 400,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      shimmerAnim.setValue(-150);
    }
  }, [allCompleted]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {allCompleted && (
          <Animated.View 
            style={[
              styles.shimmerOverlay, 
              { transform: [{ translateX: shimmerAnim }] }
            ]} 
          />
        )}
        <Text style={styles.headerTitle}>Habits</Text>
      </View>
      
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView 
          contentContainerStyle={{ padding: 24 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#BA7517']} 
              tintColor="#BA7517" 
            />
          }
        >
        
        {/* Daily Habits Progress Bar */}
        {habits.length > 0 && (
          <View style={styles.habitsProgressContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.progressLabel}>HABITS PROGRESS TODAY</Text>
              <Text style={styles.progressValueText}>
                {habits.filter(h => h.logs && h.logs.includes(new Date().toISOString().split('T')[0])).length} of {habits.length} done
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${Math.min(
                      (habits.filter(h => h.logs && h.logs.includes(new Date().toISOString().split('T')[0])).length / habits.length) * 100, 
                      100
                    )}%` 
                  }
                ]} 
              />
            </View>
          </View>
        )}

        {/* Hydration Widget */}
        <TouchableOpacity style={styles.hydrationCard} onPress={addWater} activeOpacity={0.9}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="water-outline" size={20} color="#4B6BFB" style={{ marginRight: 6 }} />
            <Text style={styles.hydrationVal}>{hydration.water} / {displayTarget} ml</Text>
          </View>
          <Text style={styles.hydrationPercent}>{Math.round(progress)}%</Text>
          <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', color: '#5A6070', fontSize: 11, marginTop: 8 }}>Tap card to quick log +250ml</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addWaterBtn} onPress={addWater}>
          <Text style={styles.addWaterText}>HYDRATION    + 250ml</Text>
          <Ionicons name="caret-forward" size={12} color="#5A6070" />
        </TouchableOpacity>

        {/* Daily Habits */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>DAILY HABITS</Text>
            <TouchableOpacity onPress={() => setShowAddHabit(true)} style={{ padding: 4 }}>
              <Ionicons name="add" size={20} color="#BA7517" />
            </TouchableOpacity>
          </View>

          {habits.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="sparkles-outline" size={32} color="#5A6070" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyStateText}>No daily habits set yet. Tap '+' to create one!</Text>
            </View>
          ) : (
            habits.map(h => {
              const today = new Date().toISOString().split('T')[0];
              const isCompleted = h.logs && h.logs.includes(today);
              if (!scaleAnims[h.id]) {
                scaleAnims[h.id] = new Animated.Value(1);
              }
              
              return (
                <Animated.View 
                  key={h.id} 
                  style={{ transform: [{ scale: scaleAnims[h.id] }] }}
                >
                  <TouchableOpacity 
                    style={styles.habitCard} 
                    onPress={() => toggleHabit(h.id)}
                    onLongPress={() => handleDeleteHabit(h.id)}
                    activeOpacity={0.8}
                  >
                    <Animated.View 
                      style={[
                        styles.checkbox, 
                        isCompleted && styles.checkboxChecked, 
                        { 
                          transform: [{ scale: checkboxScaleAnims[h.id] || 1 }],
                          justifyContent: 'center',
                          alignItems: 'center'
                        }
                      ]}
                    >
                      {isCompleted && (
                        <Ionicons name="checkmark" size={12} color="#0F1115" />
                      )}
                    </Animated.View>
                    <View style={styles.habitIconContainer}>
                      <Ionicons name={h.icon || 'star-outline'} size={14} color={isCompleted ? '#BA7517' : '#8B92A0'} />
                    </View>
                    <Text style={[styles.habitTitle, isCompleted && styles.habitTitleCompleted]}>
                      {h.name}
                    </Text>
                    <View style={[styles.fireBadge, (h.fire || 0) === 0 ? styles.fireBadgeInactive : styles.fireBadgeActive]}>
                      <Ionicons 
                        name={(h.fire || 0) === 0 ? "flame-outline" : "flame"} 
                        size={12} 
                        color={(h.fire || 0) === 0 ? "#5A6070" : "#FF8C00"} 
                        style={{ marginRight: 4 }} 
                      />
                      <Text style={[styles.fireCount, (h.fire || 0) === 0 ? styles.fireCountInactive : styles.fireCountActive]}>
                        {h.fire || 0}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* Add Habit Modal */}
      <Modal
        visible={showAddHabit}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddHabit(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Daily Habit</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Habit name (e.g. Work out)..."
              placeholderTextColor="#5A6070"
              value={newHabitName}
              onChangeText={setNewHabitName}
            />
            
            <Text style={styles.iconSelectionLabel}>CHOOSE ICON</Text>
            <View style={styles.iconGrid}>
              {[
                { name: 'water-outline' },
                { name: 'book-outline' },
                { name: 'barbell-outline' },
                { name: 'body-outline' },
                { name: 'cafe-outline' },
                { name: 'flame-outline' },
                { name: 'star-outline' }
              ].map(iconObj => (
                <TouchableOpacity 
                  key={iconObj.name}
                  style={[styles.iconSelectBtn, selectedIcon === iconObj.name && styles.iconSelectBtnActive]}
                  onPress={() => setSelectedIcon(iconObj.name)}
                >
                  <Ionicons name={iconObj.name} size={20} color={selectedIcon === iconObj.name ? '#0F1115' : '#8B92A0'} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => {
                  setShowAddHabit(false);
                  setNewHabitName('');
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#BA7517' }]} 
                onPress={handleAddHabit}
              >
                <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Add Habit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* XP Fly-Up Animation */}
      <XPFlyAnimation ref={xpFlyRef} />
    </Animated.View>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F1115',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, position: 'relative', overflow: 'hidden' },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, color: '#F3F1EC' },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(186, 117, 23, 0.22)',
    transform: [{ skewX: '-25deg' }],
  },
  
  hydrationCard: { 
    backgroundColor: '#171B22', 
    borderRadius: 24, 
    padding: 24, 
    alignItems: 'center', 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#4B6BFB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4
  },
  hydrationVal: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#F3F1EC', marginBottom: 8 },
  hydrationPercent: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 36, color: '#4B6BFB' },

  addWaterBtn: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#171B22', 
    borderRadius: 16, 
    paddingHorizontal: 20, 
    paddingVertical: 16, 
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },
  addWaterText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#5A6070', letterSpacing: 1 },

  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5A6070', letterSpacing: 1.5, textTransform: 'uppercase' },
  
  habitCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#171B22', 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', marginRight: 16, backgroundColor: '#0F1115' },
  checkboxChecked: { backgroundColor: '#BA7517', borderColor: '#BA7517' },
  habitTitle: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#F3F1EC' },
  habitTitleCompleted: { color: '#8B92A0', textDecorationLine: 'line-through' },
  
  fireBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  fireBadgeActive: { backgroundColor: 'rgba(255, 140, 0, 0.1)' },
  fireBadgeInactive: { backgroundColor: 'rgba(90, 96, 112, 0.1)' },
  fireCount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  fireCountActive: { color: '#FF8C00' },
  fireCountInactive: { color: '#5A6070' },
  
  habitsProgressContainer: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  progressLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#8B92A0',
    letterSpacing: 1.2,
  },
  progressValueText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#BA7517',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#0F1115',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#BA7517',
    borderRadius: 3,
  },
  habitIconContainer: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 26, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#171B22',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
    marginBottom: 16
  },
  modalInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    marginBottom: 16
  },
  iconSelectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#5A6070',
    letterSpacing: 1.5,
    marginBottom: 12
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24
  },
  iconSelectBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconSelectBtnActive: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  modalActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.01)'
  },
  emptyStateText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24
  }
});
