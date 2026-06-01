import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';

export default function HomeScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [tasks, setTasks] = useFirestoreData('tasks', []);
  const [habits, setHabits] = useFirestoreData('user_habits', []);
  const [newTaskText, setNewTaskText] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [quote, setQuote] = useState({ content: "Loading quote...", author: "" });

  useEffect(() => {
    fetch('https://api.quotable.io/random?tags=technology|education|productivity|inspirational')
      .then(res => res.json())
      .then(data => setQuote({ content: data.content, author: data.author }))
      .catch(() => setQuote({ content: "Focus on the present.", author: "Planory" }));
  }, []);

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      title: newTaskText.trim(),
      completed: false,
      date: new Date().toISOString().split('T')[0]
    };
    setTasks([...tasks, newTask]);
    setNewTaskText('');
  };

  const toggleTask = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  };

  const toggleHabit = (habitId) => {
    const today = new Date().toISOString().split('T')[0];
    setHabits(habits.map(h => {
      if (h.id === habitId) {
        const isCompletedToday = h.logs && h.logs.includes(today);
        const newLogs = isCompletedToday 
          ? h.logs.filter(d => d !== today)
          : [...(h.logs || []), today];
        return { ...h, logs: newLogs };
      }
      return h;
    }));
  };

  const renderTask = ({ item }) => (
    <TouchableOpacity 
      style={[styles.taskCard, item.completed && styles.taskCardCompleted]}
      onPress={() => toggleTask(item.id)}
      activeOpacity={0.8}
    >
      <View style={[styles.checkbox, item.completed && styles.checkboxChecked]} />
      <Text style={[styles.taskTitle, item.completed && styles.taskTitleCompleted]}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );

  const renderHabit = ({ item }) => {
    const today = new Date().toISOString().split('T')[0];
    const isCompleted = item.logs && item.logs.includes(today);
    
    return (
      <TouchableOpacity 
        style={[styles.habitCard, isCompleted && styles.habitCardCompleted]}
        onPress={() => toggleHabit(item.id)}
        activeOpacity={0.8}
      >
        <Ionicons name={item.icon || 'flame-outline'} size={18} color={isCompleted ? '#BA7517' : '#8B92A0'} style={{ marginBottom: 6 }} />
        <Text style={[styles.habitTitle, isCompleted && styles.habitTitleCompleted]}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  // Process tasks into calendar marked dates
  const markedDates = {};
  tasks.forEach(t => {
    if (t.date) {
      markedDates[t.date] = { 
        marked: true, 
        dotColor: t.completed ? '#7C9B7A' : '#BA7517' 
      };
    }
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Workspace</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
        </View>
        <View style={styles.viewToggle}>
          <TouchableOpacity onPress={() => setViewMode('list')} style={[styles.toggleBtn, viewMode === 'list' && styles.toggleActive]}>
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode('calendar')} style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleActive]}>
            <Text style={[styles.toggleText, viewMode === 'calendar' && styles.toggleTextActive]}>Cal</Text>
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'list' ? (
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={() => (
            <>
              {/* Daily Quote */}
              <View style={styles.quoteCard}>
                <Text style={styles.quoteText}>"{quote.content}"</Text>
                <Text style={styles.quoteAuthor}>— {quote.author}</Text>
              </View>

              {habits.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Daily Habits</Text>
                  <FlatList
                    data={habits}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={item => item.id}
                    renderItem={renderHabit}
                    contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
                  />
                </View>
              )}
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
            </>
          )}
          renderItem={renderTask}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Clear schedule. A calm mind starts here.</Text>
            </View>
          )}
        />
      ) : (
        <View style={{ padding: 24 }}>
          <Calendar
            theme={{
              calendarBackground: '#171B22',
              textSectionTitleColor: '#8B92A0',
              dayTextColor: '#F3F1EC',
              todayTextColor: '#BA7517',
              selectedDayTextColor: '#0F1115',
              monthTextColor: '#F3F1EC',
              selectedDayBackgroundColor: '#BA7517',
              arrowColor: '#BA7517',
              textDayFontFamily: 'PlusJakartaSans_500Medium',
              textMonthFontFamily: 'PlusJakartaSans_700Bold',
              textDayHeaderFontFamily: 'PlusJakartaSans_600SemiBold',
            }}
            markedDates={markedDates}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          />
        </View>
      )}

      {viewMode === 'list' && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.taskInput}
            value={newTaskText}
            onChangeText={setNewTaskText}
            placeholder="Add a new task..."
            placeholderTextColor="#5A6070"
            onSubmitEditing={handleAddTask}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddTask}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  header: { flexDirection: 'row', padding: 24, paddingBottom: 16, alignItems: 'center' },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, color: '#F3F1EC' },
  dateText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#8B92A0', marginTop: 4 },
  
  viewToggle: { flexDirection: 'row', backgroundColor: '#171B22', borderRadius: 12, padding: 4 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleActive: { backgroundColor: '#1D2430' },
  toggleText: { color: '#8B92A0', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  toggleTextActive: { color: '#F3F1EC' },

  listContainer: { paddingHorizontal: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#8B92A0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  
  quoteCard: { backgroundColor: '#1D2430', padding: 16, borderRadius: 16, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#BA7517' },
  quoteText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 14, fontStyle: 'italic', lineHeight: 22 },
  quoteAuthor: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#BA7517', fontSize: 12, marginTop: 8, textAlign: 'right' },

  // Habit Card
  habitCard: { backgroundColor: '#171B22', borderRadius: 16, padding: 16, width: 120, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  habitCardCompleted: { backgroundColor: 'rgba(186, 117, 23, 0.1)', borderColor: '#BA7517' },
  habitEmoji: { fontSize: 24, marginBottom: 8, opacity: 0.5 },
  habitTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#F3F1EC', fontSize: 13, textAlign: 'center' },
  habitTitleCompleted: { color: '#BA7517' },

  // Task Card
  taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#171B22', borderRadius: 16, padding: 16, marginBottom: 12 },
  taskCardCompleted: { opacity: 0.6 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', marginRight: 12 },
  checkboxChecked: { backgroundColor: '#BA7517', borderColor: '#BA7517' },
  taskTitle: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 15, flex: 1 },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: '#8B92A0' },
  
  emptyState: { padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed', borderRadius: 16, marginTop: 12 },
  emptyStateText: { fontFamily: 'PlusJakartaSans_400Regular', color: '#8B92A0', fontSize: 14 },
  
  // Input
  inputContainer: { flexDirection: 'row', padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', backgroundColor: '#0F1115' },
  taskInput: { flex: 1, backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#F3F1EC', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, marginRight: 12 },
  addBtn: { width: 48, height: 48, backgroundColor: '#BA7517', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#0F1115', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, lineHeight: 28 }
});
