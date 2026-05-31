import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator, Platform, StatusBar, Alert, Vibration, Linking, RefreshControl, Animated, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { calculateXPProgress } from '../utils/gamification';
import { callOcrProxy } from '../config/api';

const SUBJECT_SHORTCUTS = ['CS101', 'Maths-II', 'Physics', 'Exams', 'General'];

const NOTE_COLORS = [
  { value: '#171B22', name: 'Dark Grey' },
  { value: '#1E2430', name: 'Deep Slate' },
  { value: '#1A2E40', name: 'Midnight Blue' },
  { value: '#143026', name: 'Forest Green' },
  { value: '#2D1A3A', name: 'Rich Purple' }
];

const MOCK_OCR_RESULTS = [
  "--- \n[OCR SCAN: Whiteboard Lecture Notes]\n• Array indices start from 0.\n• Space complexity of Merge Sort is O(n).\n• Stack operates on LIFO (Last In First Out).\n---",
  "--- \n[OCR SCAN: Handwritten Formula Sheet]\n• Euler's Formula: e^(i*pi) + 1 = 0\n• Quadratic Formula: x = (-b ± √(b^2 - 4ac)) / 2a\n---",
  "--- \n[OCR SCAN: Textbook Diagram]\n• Figure 4.2: Synaptic transmission diagram.\n• Neurotransmitters cross the synaptic cleft to bind to receptors.\n---"
];

export default function NotesScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [viewMode, setViewMode] = useState('notes'); // 'notes' or 'braindump'
  const [notes, setNotes] = useFirestoreData(`${userId}_notes`, []);
  const [brainDump, setBrainDump] = useFirestoreData(`${userId}_brain_dump`, []);
  const [gamification, setGamification] = useFirestoreData(`${userId}_gamification_state`, { level: 1, xp: 0 });

  // Flashcards state
  const [flashcards, setFlashcards] = useFirestoreData(`${userId}_flashcards`, []);
  
  // Create Card Modal states
  const [showCreateCardModal, setShowCreateCardModal] = useState(false);
  const [selectedNoteForCard, setSelectedNoteForCard] = useState(null);
  const [cardFrontInput, setCardFrontInput] = useState('');
  const [cardBackInput, setCardBackInput] = useState('');

  // Review Deck Modal states
  const [showReviewDeckModal, setShowReviewDeckModal] = useState(false);
  const [reviewList, setReviewList] = useState([]);
  const [currentReviewIdx, setCurrentReviewIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // 3D Card Flip animation value
  const [animatedValue] = useState(new Animated.Value(0));
  let flipValue = 0;
  animatedValue.addListener(({ value: val }) => {
    flipValue = val;
  });

  const frontInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [1, 0]
  });
  const backOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [0, 1]
  });

  const flipCard = () => {
    if (flipValue >= 90) {
      Animated.spring(animatedValue, {
        toValue: 0,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start(() => setIsFlipped(false));
    } else {
      Animated.spring(animatedValue, {
        toValue: 180,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start(() => setIsFlipped(true));
    }
  };

  const frontAnimatedStyle = {
    transform: [{ rotateY: frontInterpolate }],
    opacity: frontOpacity
  };
  const backAnimatedStyle = {
    transform: [{ rotateY: backInterpolate }],
    opacity: backOpacity
  };

  const calculateSM2 = (quality, prevInterval, prevEaseFactor, prevRepetition) => {
    let interval = 1;
    let easeFactor = prevEaseFactor;
    let repetition = prevRepetition;

    if (quality >= 3) {
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 3; // review in 3 days for Hard/Easy
      } else {
        interval = Math.round(prevInterval * prevEaseFactor);
      }
      repetition = repetition + 1;
    } else {
      repetition = 0;
      interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    return { interval, easeFactor, repetition };
  };

  const handleOpenCreateCardModal = (note) => {
    setSelectedNoteForCard(note);
    setCardFrontInput(note.text || '');
    setCardBackInput('');
    setShowCreateCardModal(true);
  };

  const handleCreateFlashcard = () => {
    if (!cardFrontInput.trim() || !cardBackInput.trim()) {
      Alert.alert('Required Fields', 'Please fill in both Question and Answer.');
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const newCard = {
      id: Date.now().toString(),
      noteId: selectedNoteForCard ? selectedNoteForCard.id : null,
      front: cardFrontInput.trim(),
      back: cardBackInput.trim(),
      interval: 1,
      easeFactor: 2.5,
      repetition: 0,
      nextDueDate: todayStr
    };
    setFlashcards([newCard, ...flashcards]);
    setShowCreateCardModal(false);
    setSelectedNoteForCard(null);
    Vibration.vibrate(40);
    Alert.alert('Success', 'Flashcard created successfully!');
  };

  const handleStartReview = (reviewAll = false) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const cardsToReview = reviewAll 
      ? [...flashcards]
      : flashcards.filter(c => !c.nextDueDate || c.nextDueDate <= todayStr);
    
    if (cardsToReview.length === 0) {
      Alert.alert('Empty Deck', 'No flashcards available to review right now.');
      return;
    }
    setReviewList(cardsToReview);
    setCurrentReviewIdx(0);
    setIsFlipped(false);
    animatedValue.setValue(0);
    setShowReviewDeckModal(true);
  };

  const handleAnswerReview = (rating) => {
    const currentCard = reviewList[currentReviewIdx];
    const { interval, easeFactor, repetition } = calculateSM2(
      rating, 
      currentCard.interval || 1, 
      currentCard.easeFactor || 2.5, 
      currentCard.repetition || 0
    );

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    const nextDueDateStr = nextDate.toISOString().split('T')[0];

    const updatedCards = flashcards.map(c => {
      if (c.id === currentCard.id) {
        return {
          ...c,
          interval,
          easeFactor,
          repetition,
          nextDueDate: nextDueDateStr
        };
      }
      return c;
    });
    setFlashcards(updatedCards);
    Vibration.vibrate(30);

    if (currentReviewIdx < reviewList.length - 1) {
      setIsFlipped(false);
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true
      }).start(() => {
        setCurrentReviewIdx(currentReviewIdx + 1);
      });
    } else {
      setShowReviewDeckModal(false);
      Alert.alert('Review Complete!', 'Concept revision done! Check back tomorrow for due reviews.');
    }
  };

  const todayStrForBadge = new Date().toISOString().split('T')[0];
  const dueCardsCount = flashcards.filter(c => !c.nextDueDate || c.nextDueDate <= todayStrForBadge).length;

  // View/Edit Note Modal states
  const [selectedNoteForView, setSelectedNoteForView] = useState(null);
  const [showViewNoteModal, setShowViewNoteModal] = useState(false);
  const [viewNoteTitle, setViewNoteTitle] = useState('');
  const [viewNoteSubject, setViewNoteSubject] = useState('');
  const [viewNoteText, setViewNoteText] = useState('');

  const handleOpenViewNoteModal = (note) => {
    setSelectedNoteForView(note);
    setViewNoteTitle(note.title || '');
    setViewNoteSubject(note.subject || '');
    setViewNoteText(note.text || '');
    setShowViewNoteModal(true);
  };

  const handleSaveViewedNote = () => {
    if (!selectedNoteForView) return;
    if (!viewNoteText.trim()) {
      Alert.alert('Required Field', 'Note content cannot be empty.');
      return;
    }
    const autoTitle = viewNoteText.trim().split('\n')[0].substring(0, 40).trim() || 'Untitled Note';
    const updatedNotes = notes.map(n => 
      n.id === selectedNoteForView.id 
        ? { 
            ...n, 
            title: viewNoteTitle.trim() || autoTitle, 
            subject: viewNoteSubject.trim() || 'General', 
            text: viewNoteText.trim(),
            date: new Date().toISOString()
          }
        : n
    );
    setNotes(updatedNotes);
    setShowViewNoteModal(false);
    setSelectedNoteForView(null);
    Vibration.vibrate(30);
    Alert.alert('Saved', 'Note updated successfully!');
  };

  const handleMakeFlashcardFromViewer = () => {
    const note = selectedNoteForView;
    setShowViewNoteModal(false);
    setTimeout(() => {
      handleOpenCreateCardModal(note);
    }, 300);
  };

  const handleDeleteFromViewer = () => {
    const id = selectedNoteForView.id;
    Alert.alert(
      "Delete Note",
      "Are you sure you want to delete this note permanently?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => {
          deleteNote(id);
          setShowViewNoteModal(false);
          setSelectedNoteForView(null);
        }}
      ]
    );
  };

  // New Note State
  const [newSubject, setNewSubject] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [dumpText, setDumpText] = useState('');

  // OCR Scan State
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0); // 0: idle, 1: scanning, 2: complete
  const [scanError, setScanError] = useState(null);
  const [lastBase64, setLastBase64] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const insertMarkdown = (syntax) => {
    if (syntax === 'list') {
      setNewContent(prev => prev + (prev.endsWith('\n') || prev === '' ? '- ' : '\n- '));
    } else if (syntax === 'bold') {
      setNewContent(prev => prev + '**bold**');
    } else if (syntax === 'italic') {
      setNewContent(prev => prev + '*italic*');
    } else if (syntax === 'code') {
      setNewContent(prev => prev + '`code`');
    }
  };

  const [selectedColor, setSelectedColor] = useState('#171B22');

  const addNote = () => {
    if (!newContent.trim()) return;
    const autoTitle = newContent.trim().split('\n')[0].substring(0, 40).trim() || 'Untitled Note';
    setNotes([
      { 
        id: Date.now().toString(), 
        subject: newSubject.trim() || 'General',
        title: newTitle.trim() || autoTitle,
        text: newContent.trim(), 
        date: new Date().toISOString(),
        color: selectedColor,
        pinned: false
      },
      ...notes
    ]);
    setNewSubject('');
    setNewTitle('');
    setNewContent('');
    setSelectedColor('#171B22');
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const togglePinNote = (id) => {
    setNotes(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
    Vibration.vibrate(30);
  };

  const addBrainDump = () => {
    if (!dumpText.trim()) return;
    setBrainDump([
      { id: Date.now().toString(), text: dumpText.trim(), date: new Date().toISOString() },
      ...brainDump
    ]);
    setDumpText('');
  };

  const handleLaunchWhiteboardOcr = async (useCamera = false) => {
    try {
      const { status } = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Denied', `We need ${useCamera ? 'camera' : 'gallery'} access to scan your notes!`);
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64 = result.assets[0].base64;
        setLastBase64(base64);
        setScanError(null);
        runWhiteboardOcr(base64);
      }
    } catch (e) {
      console.warn(e);
      runWhiteboardOcr(null);
    }
  };

  const runWhiteboardOcr = async (base64Data) => {
    setIsScanning(true);
    setScanStep(1);
    setScanError(null);

    const step2Timer = setTimeout(() => setScanStep(2), 1000);

    if (!base64Data) {
      setIsScanning(false);
      setScanStep(0);
      setScanError('read_failed');
      return;
    }

    const payload = {
      model: 'llama-3.2-11b-vision-preview',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this image of whiteboard notes, textbook pages, or handwritten text. Extract all readable study notes, explanations, and diagrams. Format it cleanly as markdown study notes with bullet points and clear headings. Do not include markdown code block backticks (like ```) in your output, just return the raw text formatting.'
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Data}` }
          }
        ]
      }],
      max_tokens: 2048,
      temperature: 0.1
    };

    // All OCR requests go through the server proxy (cloud or local)
    // Key is stored ONLY on the server — never in the app
    try {
      const response = await callOcrProxy(payload, 'whiteboard');
      const resJson = await response.json();
      const textResult = resJson.choices?.[0]?.message?.content || '';

      clearTimeout(step2Timer);
      setNewContent(prev => (prev ? prev + '\n\n' + textResult : textResult));
      setIsScanning(false);
      setShowScannerModal(false);
      setScanStep(0);
      setScanError(null);
    } catch (e) {
      console.error('Whiteboard OCR failed:', e);
      clearTimeout(step2Timer);
      setIsScanning(false);
      setScanStep(0);
      if (e.message.includes('503') || e.message.includes('key not configured')) {
        setScanError('unavailable');
      } else if (e.message.toLowerCase().includes('network') || e.message.toLowerCase().includes('proxy') || e.message.toLowerCase().includes('unreachable')) {
        setScanError('network_error');
      } else {
        setScanError('read_failed');
      }
    }
  };

  const filteredNotes = notes.filter(n => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (n.subject && n.subject.toLowerCase().includes(q)) || 
           (n.title && n.title.toLowerCase().includes(q)) || 
           (n.text && n.text.toLowerCase().includes(q));
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.date) - new Date(a.date);
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.viewToggle}>
          <TouchableOpacity onPress={() => setViewMode('notes')} style={[styles.toggleBtn, viewMode === 'notes' && styles.toggleActive]}>
            <Text style={[styles.toggleText, viewMode === 'notes' && styles.toggleTextActive]}>Notes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode('braindump')} style={[styles.toggleBtn, viewMode === 'braindump' && styles.toggleActive]}>
            <Text style={[styles.toggleText, viewMode === 'braindump' && styles.toggleTextActive]}>Brain Dump</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {viewMode === 'notes' ? (
        <>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color="#5A6070" style={{ marginRight: 8 }} />
            <TextInput 
              style={styles.searchInput} 
              placeholder="Search subjects, titles, or keywords..." 
              placeholderTextColor="#5A6070"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Flashcards Review Banner */}
          {dueCardsCount > 0 && (
            <TouchableOpacity 
              style={styles.reviewBanner}
              onPress={() => handleStartReview(false)}
              activeOpacity={0.9}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="school" size={18} color="#0F1115" style={{ marginRight: 8 }} />
                <Text style={styles.reviewBannerText}>
                  You have <Text style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>{dueCardsCount}</Text> due flashcards. Tap to revise!
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#0F1115" />
            </TouchableOpacity>
          )}

          {flashcards.length > 0 && dueCardsCount === 0 && (
            <TouchableOpacity 
              style={[styles.reviewBanner, { backgroundColor: '#171B22', borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }]}
              onPress={() => handleStartReview(true)}
              activeOpacity={0.9}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={18} color="#7C9B7A" style={{ marginRight: 8 }} />
                <Text style={[styles.reviewBannerText, { color: '#8B92A0' }]}>
                  All {flashcards.length} cards reviewed! Tap to study anyway.
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#8B92A0" />
            </TouchableOpacity>
          )}

          <FlatList
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
                colors={['#C2A878']} 
                tintColor="#C2A878" 
              />
            }
            data={sortedNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={() => (
              <View style={styles.editorContainer}>
                <Text style={styles.sectionTitle}>RICH TEXT EDITOR</Text>
                
                {/* Subject picker shortcuts */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                  {SUBJECT_SHORTCUTS.map(subj => (
                    <TouchableOpacity 
                      key={subj} 
                      style={[styles.subjectPill, newSubject === subj && styles.subjectPillActive]}
                      onPress={() => setNewSubject(subj)}
                    >
                      <Text style={[styles.subjectPillText, newSubject === subj && { color: '#0F1115' }]}>{subj}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, paddingVertical: 12 }]}
                    placeholder="Subject (e.g. Maths)"
                    placeholderTextColor="#5A6070"
                    value={newSubject}
                    onChangeText={setNewSubject}
                  />
                  <TextInput
                    style={[styles.input, { flex: 2, paddingVertical: 12 }]}
                    placeholder="Note Title"
                    placeholderTextColor="#5A6070"
                    value={newTitle}
                    onChangeText={setNewTitle}
                  />
                </View>

                {/* Markdown helper toolbar */}
                <View style={styles.toolbar}>
                  <TouchableOpacity onPress={() => insertMarkdown('bold')} style={styles.toolbarBtn}>
                    <Text style={styles.toolbarBtnTextBold}>B</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('italic')} style={styles.toolbarBtn}>
                    <Text style={styles.toolbarBtnTextItalic}>I</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('code')} style={styles.toolbarBtn}>
                    <Text style={styles.toolbarBtnTextCode}>Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('list')} style={styles.toolbarBtn}>
                    <Text style={styles.toolbarBtnTextList}>• List</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowScannerModal(true)} style={[styles.toolbarBtn, { marginLeft: 'auto', backgroundColor: 'rgba(194, 168, 120, 0.15)' }]}>
                    <Ionicons name="camera-outline" size={14} color="#C2A878" />
                    <Text style={[styles.toolbarBtnTextCode, { color: '#C2A878', marginLeft: 4 }]}>Scan Whiteboard</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.input, { minHeight: 120, textAlignVertical: 'top', borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}
                  placeholder="Start typing your rich notes..."
                  placeholderTextColor="#5A6070"
                  value={newContent}
                  onChangeText={setNewContent}
                  multiline
                />
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#8B92A0' }}>Note Color:</Text>
                  {NOTE_COLORS.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c.value },
                        selectedColor === c.value && { borderWidth: 2, borderColor: '#C2A878' }
                      ]}
                      onPress={() => setSelectedColor(c.value)}
                    />
                  ))}
                </View>

                <TouchableOpacity style={styles.btn} onPress={addNote}>
                  <Text style={styles.btnText}>Save to Library</Text>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { marginTop: 32 }]}>YOUR LIBRARY (LONG PRESS TO DELETE)</Text>
              </View>
            )}
            renderItem={({ item }) => (
               <TouchableOpacity 
                 style={[styles.card, { backgroundColor: item.color || '#171B22' }]}
                 onPress={() => handleOpenViewNoteModal(item)}
                 onLongPress={() => deleteNote(item.id)}
                 delayLongPress={500}
               >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectPrimaryHeader}>{item.subject || 'GENERAL'}</Text>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <Text style={styles.dateLarge}>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => handleOpenCreateCardModal(item)} style={{ padding: 4 }}>
                      <Ionicons name="card-outline" size={16} color="#C2A878" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => togglePinNote(item.id)} style={{ padding: 4 }}>
                      <Ionicons name={item.pinned ? "pin" : "pin-outline"} size={16} color={item.pinned ? "#C2A878" : "#5A6070"} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.text} numberOfLines={2} ellipsizeMode="tail">{item.text}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={styles.emptyStateContainer}>
                <Ionicons name={searchQuery ? "search-outline" : "document-text-outline"} size={36} color="#5A6070" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyStateText}>
                  {searchQuery 
                    ? "No lecture notes found matching your search query." 
                    : "Your library is empty. Scan whiteboard or type above to add notes!"}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setShowScannerModal(true)}>
                    <Text style={styles.emptyStateBtnText}>📷 Scan Whiteboard</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </>
      ) : (
        <ScrollView 
          contentContainerStyle={{ padding: 24 }}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#C2A878']} 
              tintColor="#C2A878" 
            />
          }
        >
          <Text style={{ color: '#8B92A0', fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 16 }}>
            Free your mind. Dump random thoughts, whiteboard ideas, or exam stress here.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 180, marginBottom: 16 }]}
            placeholder="Type anything..."
            placeholderTextColor="#5A6070"
            value={dumpText}
            onChangeText={setDumpText}
            multiline
          />
          <TouchableOpacity style={styles.btn} onPress={addBrainDump}>
            <Text style={styles.btnText}>Release Thought</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 32 }}>
            <Text style={styles.sectionTitle}>PREVIOUS DUMPS</Text>
            {brainDump.map(item => (
              <View key={item.id} style={[styles.card, { borderLeftColor: '#4B6BFB' }]}>
                <Text style={styles.text}>{item.text}</Text>
                <Text style={styles.date}>{new Date(item.date).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Whiteboard OCR Scanner Modal */}
      <Modal
        visible={showScannerModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowScannerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', padding: 20 }]}>
            <Text style={styles.modalTitle}>Whiteboard OCR Scanner</Text>
            <Text style={styles.modalSubtitle}>Extract text from whiteboard photos, textbooks, or handwritten notes</Text>

             <View style={styles.scannerBox}>
              {isScanning ? (
                <View style={{ alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#C2A878" />
                  <Text style={styles.scannerStepText}>
                    {scanStep === 1 ? 'Reading document margins...' : 'Extracting handwritten text...'}
                  </Text>
                </View>
              ) : scanError ? (
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <Ionicons name="alert-circle-outline" size={48} color="#C47070" />
                   <Text style={[styles.scannerStepText, { color: '#F3F1EC', textAlign: 'center', marginHorizontal: 16 }]}>
                     {scanError === 'unavailable' 
                       ? "Scan unavailable right now — try again later" 
                       : scanError === 'network_error'
                       ? "Groq Connection Failed: SSL/Network certification issue. Please verify internet access."
                       : "Could not read image. Try again?"}
                   </Text>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#C2A878', width: 200 }]}
                    onPress={() => runWhiteboardOcr(lastBase64)}
                  >
                    <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Retry Scan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', width: 200 }]}
                    onPress={() => {
                      setScanError(null);
                      setLastBase64(null);
                    }}
                  >
                    <Text style={styles.modalActionBtnText}>Choose Another</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
                  <Ionicons name="camera-outline" size={48} color="#C2A878" />
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#C2A878', width: 200 }]}
                    onPress={() => handleLaunchWhiteboardOcr(true)}
                  >
                    <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Snap Whiteboard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', width: 200, marginBottom: 4 }]}
                    onPress={() => handleLaunchWhiteboardOcr(false)}
                  >
                    <Text style={styles.modalActionBtnText}>Pick from Gallery</Text>
                  </TouchableOpacity>

                  {/* AI Powered note (no key needed — handled server-side) */}
                  <View style={{ width: '100%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 8, paddingTop: 10 }}>
                    <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, color: '#5A6070', textAlign: 'center' }}>
                      ✦ Powered by Groq AI Vision · No setup needed
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.modalActionBtn, { backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 8 }]}
              onPress={() => setShowScannerModal(false)}
              disabled={isScanning}
            >
              <Text style={[styles.modalActionBtnText, { color: '#5A6070' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

       {/* Create Flashcard Modal */}
       <Modal
         visible={showCreateCardModal}
         animationType="fade"
         transparent={true}
         onRequestClose={() => setShowCreateCardModal(false)}
       >
         <View style={styles.modalOverlay}>
           <KeyboardAvoidingView 
             behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
             style={{ width: '100%', justifyContent: 'center', alignItems: 'center' }}
           >
             <View style={[styles.modalContent, { maxHeight: '90%' }]}>
               <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                 <Text style={styles.modalTitle}>Create Note Flashcard</Text>
                 {selectedNoteForCard && (
                   <View style={styles.refNoteContainer}>
                     <Text style={styles.refNoteLabel}>Reference Note ({selectedNoteForCard.subject}):</Text>
                     <Text style={styles.refNoteText} numberOfLines={3}>{selectedNoteForCard.text}</Text>
                   </View>
                 )}
 
                 <Text style={styles.eventInputLabel}>Front (Question / Concept)</Text>
                 <TextInput
                   style={styles.modalInput}
                   value={cardFrontInput}
                   onChangeText={setCardFrontInput}
                   placeholder="e.g. Space complexity of Merge Sort?"
                   placeholderTextColor="#5A6070"
                   multiline
                 />
 
                 <Text style={styles.eventInputLabel}>Back (Answer / Explanation)</Text>
                 <TextInput
                   style={styles.modalInput}
                   value={cardBackInput}
                   onChangeText={setCardBackInput}
                   placeholder="e.g. O(n)"
                   placeholderTextColor="#5A6070"
                   multiline
                 />
 
                 <View style={styles.modalActions}>
                   <TouchableOpacity 
                     style={[styles.modalActionBtn, { flex: 1, backgroundColor: '#171B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }]} 
                     onPress={() => setShowCreateCardModal(false)}
                   >
                     <Text style={[styles.modalActionBtnText, { color: '#8B92A0' }]}>Cancel</Text>
                   </TouchableOpacity>
                   <TouchableOpacity 
                     style={[styles.modalActionBtn, { flex: 1, backgroundColor: '#C2A878' }]} 
                     onPress={handleCreateFlashcard}
                   >
                     <Text style={[styles.modalActionBtnText, { color: '#0F1115' }]}>Create Card</Text>
                   </TouchableOpacity>
                 </View>
               </ScrollView>
             </View>
           </KeyboardAvoidingView>
         </View>
       </Modal>
 
       {/* View Note Modal */}
       <Modal
         visible={showViewNoteModal}
         animationType="slide"
         transparent={true}
         onRequestClose={() => setShowViewNoteModal(false)}
       >
         <View style={styles.modalOverlay}>
           <KeyboardAvoidingView 
             behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
             style={{ width: '100%', justifyContent: 'center', alignItems: 'center' }}
           >
             <View style={[styles.modalContent, { maxHeight: '90%' }]}>
               <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                   <Text style={styles.modalTitle}>Read & Edit Note</Text>
                   <TouchableOpacity onPress={() => setShowViewNoteModal(false)} style={{ padding: 4 }}>
                     <Ionicons name="close" size={24} color="#8B92A0" />
                   </TouchableOpacity>
                 </View>
 
                 <Text style={styles.eventInputLabel}>Subject</Text>
                 <TextInput
                   style={styles.modalInput}
                   value={viewNoteSubject}
                   onChangeText={setViewNoteSubject}
                   placeholder="e.g. CS101"
                   placeholderTextColor="#5A6070"
                 />
 
                 <Text style={styles.eventInputLabel}>Title</Text>
                 <TextInput
                   style={styles.modalInput}
                   value={viewNoteTitle}
                   onChangeText={setViewNoteTitle}
                   placeholder="e.g. Lecture Notes"
                   placeholderTextColor="#5A6070"
                 />
 
                 <Text style={styles.eventInputLabel}>Note Contents</Text>
                 <TextInput
                   style={[styles.modalInput, { minHeight: 180, maxHeight: 300, textAlignVertical: 'top' }]}
                   value={viewNoteText}
                   onChangeText={setViewNoteText}
                   placeholder="Note body..."
                   placeholderTextColor="#5A6070"
                   multiline
                 />
 
                 <View style={styles.modalActions}>
                   <TouchableOpacity 
                     style={[styles.modalActionBtn, { flex: 1, backgroundColor: 'rgba(196, 112, 112, 0.15)', borderWidth: 1, borderColor: '#C47070', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} 
                     onPress={handleDeleteFromViewer}
                   >
                     <Ionicons name="trash-outline" size={15} color="#C47070" />
                     <Text style={[styles.modalActionBtnText, { color: '#C47070', fontSize: 12 }]}>Delete</Text>
                   </TouchableOpacity>
 
                   <TouchableOpacity 
                     style={[styles.modalActionBtn, { flex: 1.2, backgroundColor: 'rgba(194, 168, 120, 0.15)', borderWidth: 1, borderColor: '#C2A878', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} 
                     onPress={handleMakeFlashcardFromViewer}
                   >
                     <Ionicons name="card-outline" size={15} color="#C2A878" />
                     <Text style={[styles.modalActionBtnText, { color: '#C2A878', fontSize: 12 }]}>Card</Text>
                   </TouchableOpacity>
 
                   <TouchableOpacity 
                     style={[styles.modalActionBtn, { flex: 1.5, backgroundColor: '#C2A878', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} 
                     onPress={handleSaveViewedNote}
                   >
                     <Ionicons name="checkmark" size={15} color="#0F1115" />
                     <Text style={[styles.modalActionBtnText, { color: '#0F1115', fontSize: 12 }]}>Save</Text>
                   </TouchableOpacity>
                 </View>
               </ScrollView>
             </View>
           </KeyboardAvoidingView>
         </View>
       </Modal>

      {/* Review Flashcards Modal */}
      <Modal
        visible={showReviewDeckModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewDeckModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', padding: 24 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={styles.modalTitle}>Flashcards Review</Text>
                <Text style={styles.modalSubtitle}>Card {currentReviewIdx + 1} of {reviewList.length}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReviewDeckModal(false)}>
                <Ionicons name="close" size={24} color="#8B92A0" />
              </TouchableOpacity>
            </View>

            {reviewList.length > 0 && (
              <View style={{ alignItems: 'center', width: '100%' }}>
                {/* 3D Flip Card Container */}
                <TouchableOpacity 
                  style={styles.cardContainer} 
                  onPress={flipCard}
                  activeOpacity={0.95}
                >
                  {/* Front Side */}
                  <Animated.View style={[styles.flipCardFront, frontAnimatedStyle]}>
                    <Ionicons name="help-circle-outline" size={32} color="#C2A878" style={{ marginBottom: 12 }} />
                    <Text style={styles.flipTextFront}>
                      {reviewList[currentReviewIdx].front}
                    </Text>
                    <Text style={styles.tapToFlipHint}>Tap to reveal answer</Text>
                  </Animated.View>

                  {/* Back Side */}
                  <Animated.View style={[styles.flipCardBack, backAnimatedStyle, { position: 'absolute' }]}>
                    <Ionicons name="checkmark-circle-outline" size={32} color="#7C9B7A" style={{ marginBottom: 12 }} />
                    <Text style={styles.flipTextBack}>
                      {reviewList[currentReviewIdx].back}
                    </Text>
                    <Text style={styles.tapToFlipHint}>Tap to view question</Text>
                  </Animated.View>
                </TouchableOpacity>

                {/* SM-2 Spaced Repetition Buttons */}
                <View style={styles.sm2ButtonRow}>
                  <TouchableOpacity 
                    style={[styles.sm2Btn, { backgroundColor: 'rgba(196, 112, 112, 0.15)', borderColor: '#C47070' }]} 
                    onPress={() => handleAnswerReview(0)} // Again
                  >
                    <Text style={[styles.sm2BtnText, { color: '#C47070' }]}>Again (1d)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.sm2Btn, { backgroundColor: 'rgba(75, 107, 251, 0.15)', borderColor: '#4B6BFB' }]} 
                    onPress={() => handleAnswerReview(3)} // Hard
                  >
                    <Text style={[styles.sm2BtnText, { color: '#4B6BFB' }]}>Hard (3d)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.sm2Btn, { backgroundColor: 'rgba(124, 155, 122, 0.15)', borderColor: '#7C9B7A' }]} 
                    onPress={() => handleAnswerReview(5)} // Easy
                  >
                    <Text style={[styles.sm2BtnText, { color: '#7C9B7A' }]}>Easy (7d)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderRadius: 12,
    padding: 4,
    flex: 1,
    maxWidth: 300,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  toggleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#8B92A0',
  },
  toggleTextActive: {
    color: '#F3F1EC',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171B22',
    marginHorizontal: 24,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  searchInput: {
    flex: 1,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    padding: 0,
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  editorContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5A6070',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  subjectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#171B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  subjectPillActive: {
    backgroundColor: '#C2A878',
    borderColor: '#C2A878',
  },
  subjectPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0',
  },
  input: {
    backgroundColor: '#171B22',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#1E232C',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  toolbarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarBtnTextBold: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#F3F1EC',
  },
  toolbarBtnTextItalic: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#F3F1EC',
    fontStyle: 'italic',
  },
  toolbarBtnTextCode: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
  },
  toolbarBtnTextList: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#F3F1EC',
  },
  btn: {
    backgroundColor: '#C2A878',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0F1115',
  },
  card: {
    backgroundColor: '#171B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  subjectBadge: {
    backgroundColor: 'rgba(194, 168, 120, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  subjectPrimaryHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#C2A878',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4
  },
  subjectText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#C2A878',
    letterSpacing: 0.5,
  },
  date: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#5A6070',
  },
  dateLarge: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#5A6070',
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC',
    marginBottom: 6,
  },
  text: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: '#8B92A0',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 26, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#171B22',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#F3F1EC',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: '#5A6070',
    marginBottom: 20,
    lineHeight: 18,
  },
  scannerBox: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1115',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
    padding: 20,
  },
  scannerStepText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#8B92A0',
    marginTop: 12,
  },
  modalActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#F3F1EC',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 2
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
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#C2A878',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
  },
  reviewBannerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#0F1115',
  },
  refNoteContainer: {
    backgroundColor: '#0F1115',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
    width: '100%',
  },
  refNoteLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: '#C2A878',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  refNoteText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    lineHeight: 16,
  },
  cardContainer: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  flipCardFront: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E2430',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C2A878',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  flipCardBack: {
    width: '100%',
    height: '100%',
    backgroundColor: '#171B22',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#7C9B7A',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  flipTextFront: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#F3F1EC',
    textAlign: 'center',
    lineHeight: 22,
  },
  flipTextBack: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#7C9B7A',
    textAlign: 'center',
    lineHeight: 22,
  },
  tapToFlipHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
    color: '#5A6070',
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sm2ButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
    gap: 8,
  },
  sm2Btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sm2BtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  eventInputLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
    color: '#8B92A0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 8,
    alignSelf: 'flex-start'
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#0F1115',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
    width: '100%',
  }
});
