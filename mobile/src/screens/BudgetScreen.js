import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, Share, Platform, StatusBar, Animated } from 'react-native';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { awardXP } from '../utils/xpManager';

const BUDGET_PRESETS = [
  { name: 'Chai & samosa', amount: 20, category: 'Food', icon: 'cafe-outline', color: '#C2A878' },
  { name: 'Tapri maggi', amount: 40, category: 'Food', icon: 'restaurant-outline', color: '#7C9B7A' },
  { name: 'Xerox & prints', amount: 10, category: 'Books', icon: 'document-outline', color: '#4B6BFB' },
  { name: 'Auto / metro', amount: 30, category: 'Transport', icon: 'car-outline', color: '#C47070' }
];

export default function BudgetScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [expenses, setExpenses] = useFirestoreData(`${userId}_expenses`, []);
  const [settings, setSettings] = useFirestoreData(`${userId}_budget_settings`, {
    monthlyLimit: 5000,
    savingsGoalName: 'Study Materials',
    savingsGoalTarget: 1500,
    savingsGoalCurrent: 500
  });
  const [gamification, setGamification] = useFirestoreData(`${userId}_gamification_state`, { level: 1, xp: 0 });

  const [expenseInput, setExpenseInput] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  
  // Settings edit state
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editLimit, setEditLimit] = useState('5000');
  const [editGoalName, setEditGoalName] = useState('Study Materials');
  const [editGoalTarget, setEditGoalTarget] = useState('1500');
  const [editGoalCurrent, setEditGoalCurrent] = useState('500');

  // Split bill modal state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitAmount, setSplitAmount] = useState('');
  const [splitDesc, setSplitDesc] = useState('');
  const [splitPeopleCount, setSplitPeopleCount] = useState('3');
  const [upiId, setUpiId] = useState('payee@upi');
  const [calculatedSplit, setCalculatedSplit] = useState(null);

  // Collapsible Expense Logger state
  const [isLoggerExpanded, setIsLoggerExpanded] = useState(false);

  useEffect(() => {
    setEditLimit(settings.monthlyLimit.toString());
    setEditGoalName(settings.savingsGoalName);
    setEditGoalTarget(settings.savingsGoalTarget.toString());
    setEditGoalCurrent(settings.savingsGoalCurrent.toString());
  }, [settings]);

  const autoCategorize = (desc) => {
    const d = desc.toLowerCase();
    if (d.includes('chai') || d.includes('maggi') || d.includes('samosa') || d.includes('food') || d.includes('swiggy') || d.includes('zomato') || d.includes('lunch') || d.includes('dinner') || d.includes('mess')) {
      return 'Food';
    }
    if (d.includes('auto') || d.includes('metro') || d.includes('bus') || d.includes('cab') || d.includes('uber') || d.includes('ola') || d.includes('train')) {
      return 'Transport';
    }
    if (d.includes('xerox') || d.includes('book') || d.includes('print') || d.includes('exam') || d.includes('college') || d.includes('school') || d.includes('stationery') || d.includes('fees')) {
      return 'Books';
    }
    if (d.includes('movie') || d.includes('netflix') || d.includes('game') || d.includes('fun') || d.includes('party') || d.includes('coke') || d.includes('hangout')) {
      return 'Fun';
    }
    return 'Misc';
  };

  const addExpense = (amountVal, descVal) => {
    const amount = parseFloat(amountVal);
    if (!amount || isNaN(amount)) {
      Alert.alert("Invalid Amount", "Please enter a valid expense amount.");
      return;
    }
    
    const description = descVal.trim() || 'Misc';
    const category = autoCategorize(description);

    const newExpense = {
      id: Date.now().toString(),
      amount,
      desc: description,
      date: new Date().toISOString(),
      category
    };
    
    setExpenses([newExpense, ...expenses]);
    awardXP(userId, gamification, 5, `Logged expense: ${description} (₹${amount})`).then(setGamification);
    setExpenseInput('');
    setExpenseDesc('');
  };

  const deleteExpense = (id) => {
    Alert.alert(
      "Delete Expense",
      "Are you sure you want to delete this expense log?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => setExpenses(expenses.filter(e => e.id !== id)) }
      ]
    );
  };

  const saveSettings = () => {
    setSettings({
      monthlyLimit: parseFloat(editLimit) || 5000,
      savingsGoalName: editGoalName || 'Semester Exam Fees',
      savingsGoalTarget: parseFloat(editGoalTarget) || 1500,
      savingsGoalCurrent: parseFloat(editGoalCurrent) || 500
    });
    setIsEditingSettings(false);
  };

  // Category totals
  const categoryTotals = { Food: 0, Transport: 0, Books: 0, Fun: 0, Misc: 0 };
  expenses.forEach(exp => {
    const cat = exp.category || 'Misc';
    if (categoryTotals[cat] !== undefined) {
      categoryTotals[cat] += exp.amount;
    } else {
      categoryTotals['Misc'] += exp.amount;
    }
  });

  const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const budgetPct = Math.min((totalSpent / settings.monthlyLimit) * 100, 100);
  const savingsPct = Math.min((settings.savingsGoalCurrent / settings.savingsGoalTarget) * 100, 100);
  const remainingBudget = Math.max(0, settings.monthlyLimit - totalSpent);

  // Animated values
  const animatedBudget = useRef(new Animated.Value(0)).current;
  const animatedSavings = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.spring(animatedBudget, {
      toValue: budgetPct,
      friction: 7,
      tension: 35,
      useNativeDriver: false
    }).start();
  }, [budgetPct]);

  useEffect(() => {
    Animated.spring(animatedSavings, {
      toValue: savingsPct,
      friction: 7,
      tension: 35,
      useNativeDriver: false
    }).start();
  }, [savingsPct]);

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

  const budgetWidth = animatedBudget.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%']
  });

  const savingsWidth = animatedSavings.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%']
  });

  // Split calculations
  const calculateSplitShare = () => {
    const total = parseFloat(splitAmount);
    const people = parseInt(splitPeopleCount);
    if (!total || isNaN(total) || !people || isNaN(people) || people <= 1) {
      Alert.alert("Invalid Input", "Please enter valid amount and number of people (> 1).");
      return;
    }
    const share = Math.round((total / people) * 100) / 100;
    setCalculatedSplit({
      total,
      people,
      share,
      upiUrl: `upi://pay?pa=${upiId}&pn=StudentSplit&am=${share}&cu=INR&tn=${encodeURIComponent(splitDesc || 'Split Bill')}`
    });
  };

  const handleShareUPI = async () => {
    if (!calculatedSplit) return;
    try {
      const shareMsg = `Hey, split for "${splitDesc || 'Bill'}" is ₹${calculatedSplit.share} each. Pay me using this UPI link: ${calculatedSplit.upiUrl}`;
      await Share.share({ message: shareMsg });
      addExpense(calculatedSplit.share, `${splitDesc || 'Split'} (My Share)`);
      setShowSplitModal(false);
      setCalculatedSplit(null);
      setSplitAmount('');
      setSplitDesc('');
    } catch (error) {
      Alert.alert("Sharing failed", error.message);
    }
  };

  // Warnings / Insights
  let warningMessage = "";
  if (budgetPct >= 100) {
    warningMessage = "Budget Exhausted! Please stop non-essential spending.";
  } else if (budgetPct >= 80) {
    warningMessage = "Budget Alert! You have used 80% of your pocket money.";
  }

  return (
    <View style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Student budget</Text>
            <TouchableOpacity style={styles.monthBtn} onPress={() => setIsEditingSettings(!isEditingSettings)}>
              <Text style={styles.monthBtnText}>May 2026</Text>
            </TouchableOpacity>
          </View>

          {/* Warning Banner */}
          {warningMessage ? (
            <View style={styles.warningBanner}>
              <Ionicons name="warning-outline" size={16} color="#C47070" style={{ marginRight: 8 }} />
              <Text style={styles.warningBannerText}>{warningMessage}</Text>
            </View>
          ) : null}

          {/* Settings Edit Area */}
          {isEditingSettings && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsBoxTitle}>Edit Budget Limits</Text>
              
              <Text style={styles.settingsLabel}>Monthly Pocket Money Limit (₹)</Text>
              <TextInput style={styles.settingsInput} keyboardType="numeric" value={editLimit} onChangeText={setEditLimit} />
              
              <Text style={styles.settingsLabel}>Savings Goal Name</Text>
              <TextInput style={styles.settingsInput} value={editGoalName} onChangeText={setEditGoalName} />
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsLabel}>Goal Target (₹)</Text>
                  <TextInput style={styles.settingsInput} keyboardType="numeric" value={editGoalTarget} onChangeText={setEditGoalTarget} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsLabel}>Saved Till Now (₹)</Text>
                  <TextInput style={styles.settingsInput} keyboardType="numeric" value={editGoalCurrent} onChangeText={setEditGoalCurrent} />
                </View>
              </View>
              
              <TouchableOpacity style={styles.saveSettingsBtn} onPress={saveSettings}>
                <Text style={styles.saveSettingsBtnText}>Save Settings</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pocket Money Spent Progress Card */}
          <View style={styles.spentCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeaderLabel}>Pocket money spent.</Text>
              <Text style={styles.cardHeaderVal}>₹{totalSpent} <Text style={styles.cardHeaderValMax}>/ ₹{settings.monthlyLimit}</Text></Text>
            </View>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: budgetWidth, backgroundColor: budgetPct >= 90 ? '#C47070' : '#4B6BFB' }]} />
            </View>
            <View style={styles.cardFooterRow}>
              <Text style={styles.cardFooterText}>Daily avg: ₹{Math.round(totalSpent / Math.max(1, new Date().getDate()))} / day</Text>
              <View style={styles.remainingPill}>
                <Text style={styles.remainingPillText}>₹{remainingBudget} remaining</Text>
              </View>
            </View>
          </View>

          {/* Goals Card */}
          <View style={styles.goalCard}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.goalIconCircle}>
                  <Ionicons name="golf-outline" size={14} color="#7C9B7A" />
                </View>
                <Text style={styles.goalTitleText}>Goal: {settings.savingsGoalName}</Text>
              </View>
              <Text style={styles.goalValText}>₹{settings.savingsGoalCurrent} <Text style={styles.goalValTextMax}>/ ₹{settings.savingsGoalTarget}</Text></Text>
            </View>
            <View style={[styles.progressBarBg, { marginTop: 12 }]}>
              <Animated.View style={[styles.progressBarFill, { width: savingsWidth, backgroundColor: '#7C9B7A' }]} />
            </View>
          </View>

          {/* 1-Tap Shortcuts */}
          <Text style={styles.sectionTitle}>1-TAP SHORTCUTS</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.presetsScrollContent} 
            style={styles.presetsScrollView}
          >
            {BUDGET_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.8}
                style={styles.presetButton}
                onPress={() => addExpense(preset.amount, preset.name)}
              >
                <View style={[styles.presetIconContainer, { backgroundColor: `${preset.color}15` }]}>
                  <Ionicons name={preset.icon} size={16} color={preset.color} />
                </View>
                <Text style={styles.presetLabel} numberOfLines={1}>{preset.name}</Text>
                <Text style={styles.presetPriceText}>₹{preset.amount}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Action Row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setShowSplitModal(true)}>
              <Ionicons name="people-outline" size={16} color="#0F1115" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnPrimaryText}>Split bill (UPI)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnSecondary} onPress={() => setIsEditingSettings(!isEditingSettings)}>
              <Ionicons name="create-outline" size={16} color="#C2A878" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnSecondaryText}>Edit limits</Text>
            </TouchableOpacity>
          </View>

          {/* Collapsible Log Expense */}
          <View style={styles.collapsibleCard}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.collapsibleHeader}
              onPress={() => setIsLoggerExpanded(!isLoggerExpanded)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="add-circle-outline" size={18} color="#C2A878" style={{ marginRight: 8 }} />
                <Text style={styles.collapsibleHeaderTitle}>Add new expense</Text>
              </View>
              <Ionicons
                name={isLoggerExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color="#8B92A0"
              />
            </TouchableOpacity>

            {isLoggerExpanded && (
              <View style={styles.collapsibleContent}>
                <TextInput
                  style={styles.amountInput}
                  placeholder="₹ Amount"
                  placeholderTextColor="#5A6070"
                  keyboardType="numeric"
                  value={expenseInput}
                  onChangeText={setExpenseInput}
                />
                <TextInput
                  style={styles.descInput}
                  placeholder="What did you buy? (e.g. Swiggy mess)"
                  placeholderTextColor="#5A6070"
                  value={expenseDesc}
                  onChangeText={setExpenseDesc}
                />
                <TouchableOpacity
                  style={styles.logSubmitBtn}
                  onPress={() => {
                    addExpense(expenseInput, expenseDesc);
                    setIsLoggerExpanded(false);
                  }}
                >
                  <Text style={styles.logSubmitBtnText}>Log expense</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Spending Breakdown */}
          <Text style={styles.sectionTitle}>SPENDING BREAKDOWN</Text>
          <View style={styles.breakdownCard}>
            {(() => {
              const allCategories = Object.keys(categoryTotals);
              const activeCategories = allCategories.filter(cat => categoryTotals[cat] > 0);
              const zeroCategoriesCount = allCategories.length - activeCategories.length;

              return (
                <>
                  {activeCategories.map(cat => {
                    const total = categoryTotals[cat];
                    const pct = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
                    let barColor = '#8B92A0';
                    if (cat === 'Food') barColor = '#C2A878';
                    else if (cat === 'Transport') barColor = '#4B6BFB';
                    else if (cat === 'Books') barColor = '#7C9B7A';
                    else if (cat === 'Fun') barColor = '#C47070';
                    
                    return (
                      <View key={cat} style={styles.breakdownRow}>
                        <View style={styles.breakdownTextRow}>
                          <Text style={styles.breakdownName}>{cat}</Text>
                          <Text style={styles.breakdownVal}>₹{total} <Text style={styles.breakdownValPct}>({Math.round(pct)}%)</Text></Text>
                        </View>
                        <View style={styles.breakdownBarBg}>
                          <View style={[styles.breakdownBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                        </View>
                      </View>
                    );
                  })}
                  {zeroCategoriesCount > 0 && (
                    <Text style={styles.hiddenCategoriesText}>
                      + {zeroCategoriesCount} empty categories
                    </Text>
                  )}
                </>
              );
            })()}
          </View>

          {/* Recent Expenses */}
          <Text style={styles.sectionTitle}>RECENT EXPENSES</Text>
          {expenses.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="card-outline" size={32} color="#5A6070" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyStateText}>No pocket money expenses logged yet this month. Keep tracking to save for your goals!</Text>
              <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setIsLoggerExpanded(true)}>
                <Text style={styles.emptyStateBtnText}>+ Log First Expense</Text>
              </TouchableOpacity>
            </View>
          ) : (
            expenses.slice(0, 8).map(e => {
              let itemIcon = 'receipt-outline';
              let iconColor = '#8B92A0';
              if (e.category === 'Food') { itemIcon = 'cafe-outline'; iconColor = '#C2A878'; }
              else if (e.category === 'Transport') { itemIcon = 'car-outline'; iconColor = '#4B6BFB'; }
              else if (e.category === 'Books') { itemIcon = 'document-outline'; iconColor = '#7C9B7A'; }
              else if (e.category === 'Fun') { itemIcon = 'game-controller-outline'; iconColor = '#C47070'; }

              return (
                <TouchableOpacity
                  key={e.id}
                  activeOpacity={0.8}
                  style={styles.expenseItemRow}
                  onLongPress={() => deleteExpense(e.id)}
                  delayLongPress={500}
                >
                  <View style={[styles.expenseIconCircle, { backgroundColor: `${iconColor}12` }]}>
                    <Ionicons name={itemIcon} size={16} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseItemDesc} numberOfLines={1} ellipsizeMode="tail">{e.desc}</Text>
                    <Text style={styles.expenseItemMeta}>{e.category || 'Misc'} • {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <Text style={styles.expenseItemAmt}>-₹{e.amount}</Text>
                </TouchableOpacity>
              );
            })
          )}

        </ScrollView>
      </Animated.View>

      {/* Bill Splitter Modal */}
      <Modal
        visible={showSplitModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSplitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%' }]}>
            <Text style={styles.modalTitle}>Split Bill & Exporter</Text>
            <Text style={styles.modalSubtitle}>Calculate split and export UPI payment link</Text>
            
            <View style={{ gap: 12, marginBottom: 20 }}>
              <TextInput
                style={styles.modalInputText}
                keyboardType="numeric"
                placeholder="₹ Total Amount (e.g. 300)"
                placeholderTextColor="#5A6070"
                value={splitAmount}
                onChangeText={setSplitAmount}
              />
              <TextInput
                style={styles.modalInputText}
                placeholder="Bill Description (e.g. Mess dinner)"
                placeholderTextColor="#5A6070"
                value={splitDesc}
                onChangeText={setSplitDesc}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TextInput
                  style={[styles.modalInputText, { flex: 1 }]}
                  keyboardType="numeric"
                  placeholder="No. of people"
                  placeholderTextColor="#5A6070"
                  value={splitPeopleCount}
                  onChangeText={setSplitPeopleCount}
                />
                <TextInput
                  style={[styles.modalInputText, { flex: 2 }]}
                  placeholder="Your UPI ID"
                  placeholderTextColor="#5A6070"
                  value={upiId}
                  onChangeText={setUpiId}
                />
              </View>
            </View>

            {calculatedSplit && (
              <View style={styles.splitResultBox}>
                <Text style={styles.splitResultLabel}>Split Share Per Person:</Text>
                <Text style={styles.splitResultVal}>₹{calculatedSplit.share}</Text>
                <Text style={styles.splitResultSub}>UPI Link configured</Text>
              </View>
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                onPress={() => {
                  setShowSplitModal(false);
                  setCalculatedSplit(null);
                  setSplitAmount('');
                  setSplitDesc('');
                }}
              >
                <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
              </TouchableOpacity>
              
              {calculatedSplit ? (
                <TouchableOpacity 
                  style={[styles.modalActionBtn, { backgroundColor: '#7C9B7A' }]} 
                  onPress={handleShareUPI}
                >
                  <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Share UPI Link</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.modalActionBtn, { backgroundColor: '#C2A878' }]} 
                  onPress={calculateSplitShare}
                >
                  <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Calculate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  monthBtn: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  monthBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#C2A878'
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 112, 112, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 112, 0.2)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16
  },
  warningBannerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#C47070',
    flex: 1
  },
  settingsBox: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20
  },
  settingsBoxTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#F3F1EC',
    marginBottom: 12
  },
  settingsLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#8B92A0',
    marginBottom: 6,
    marginTop: 8
  },
  settingsInput: {
    backgroundColor: '#0F1115',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8
  },
  saveSettingsBtn: {
    backgroundColor: '#C2A878',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12
  },
  saveSettingsBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115'
  },
  spentCard: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardHeaderLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#8B92A0'
  },
  cardHeaderVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC'
  },
  cardHeaderValMax: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#5A6070'
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 12
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardFooterText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0'
  },
  remainingPill: {
    backgroundColor: 'rgba(124, 155, 122, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  remainingPillText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#7C9B7A'
  },
  goalCard: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  goalIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 155, 122, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
  },
  goalTitleText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#8B92A0'
  },
  goalValText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC'
  },
  goalValTextMax: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070'
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5A6070',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase'
  },
  presetsScrollView: {
    marginBottom: 16
  },
  presetsScrollContent: {
    gap: 10,
    paddingRight: 16
  },
  presetButton: {
    width: 105,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center'
  },
  presetIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6
  },
  presetLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: '#8B92A0',
    textAlign: 'center'
  },
  presetPriceText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#C2A878',
    marginTop: 2
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#C2A878',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionBtnPrimaryText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115'
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: '#1D2430',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionBtnSecondaryText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#C2A878'
  },
  collapsibleCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden'
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16
  },
  collapsibleHeaderTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC'
  },
  collapsibleContent: {
    padding: 16,
    paddingTop: 0,
    gap: 12
  },
  amountInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14
  },
  descInput: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14
  },
  logSubmitBtn: {
    backgroundColor: '#C2A878',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4
  },
  logSubmitBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115'
  },
  breakdownCard: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    marginBottom: 24
  },
  breakdownRow: {
    marginBottom: 12
  },
  breakdownTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  breakdownName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC'
  },
  breakdownVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#8B92A0'
  },
  breakdownValPct: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070'
  },
  breakdownBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 2
  },
  hiddenCategoriesText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#5A6070',
    textAlign: 'center',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  emptyCard: {
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24
  },
  emptyCardText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0'
  },
  expenseItemRow: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  expenseIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  expenseItemDesc: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#F3F1EC'
  },
  expenseItemMeta: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#5A6070',
    marginTop: 2
  },
  expenseItemAmt: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#C47070'
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
  modalInputText: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14
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
  splitResultBox: {
    backgroundColor: '#0F1115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20
  },
  splitResultLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0'
  },
  splitResultVal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 28,
    color: '#C2A878',
    marginTop: 4
  },
  splitResultSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: '#7C9B7A',
    marginTop: 8
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.01)',
    marginTop: 20
  },
  emptyStateText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#5A6070',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18
  },
  emptyStateBtn: {
    backgroundColor: 'rgba(194, 168, 120, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 12
  },
  emptyStateBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#C2A878'
  }
});
