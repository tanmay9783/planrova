import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Animated, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function CalculatorScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('standard'); // 'standard', 'gpa', 'target'

  // Standard Calculator States
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  // GPA Calculator States
  const [courses, setCourses] = useState([
    { id: '1', name: 'CS101', credits: 4, gradePoint: 9 },
    { id: '2', name: 'Maths-II', credits: 4, gradePoint: 8 },
  ]);
  const [courseName, setCourseName] = useState('');
  const [courseCredits, setCourseCredits] = useState('');
  const [courseGradePoint, setCourseGradePoint] = useState('');
  const [calculatedGPA, setCalculatedGPA] = useState(null);

  // Exam Target Estimator States
  const [internalMarks, setInternalMarks] = useState(''); // e.g. 24
  const [internalMax, setInternalMax] = useState('30'); // e.g. 30
  const [overallTarget, setOverallTarget] = useState('80'); // e.g. 80%
  const [finalWeight, setFinalWeight] = useState('70'); // e.g. 70% weight of final exam
  const [requiredFinalScore, setRequiredFinalScore] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;
  const buttonScales = useRef({}).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab]);

  // Standard Calc button press scaling helper
  const getButtonScale = (key) => {
    if (!buttonScales[key]) {
      buttonScales[key] = new Animated.Value(1);
    }
    return buttonScales[key];
  };

  const handlePressIn = (key) => {
    Animated.spring(getButtonScale(key), {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = (key) => {
    Animated.spring(getButtonScale(key), {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  // Standard Calculator Logic
  const handleCalcPress = (value) => {
    if (value === 'C') {
      setDisplay('0');
      setEquation('');
    } else if (value === 'del') {
      if (display.length > 1) {
        setDisplay(display.slice(0, -1));
      } else {
        setDisplay('0');
      }
    } else if (value === '=') {
      try {
        const result = eval(equation + display);
        setDisplay(Number(result.toFixed(4)).toString());
        setEquation('');
      } catch (err) {
        setDisplay('Error');
      }
    } else if (['+', '-', '*', '/', '%'].includes(value)) {
      setEquation(display + ' ' + value + ' ');
      setDisplay('0');
    } else {
      if (display === '0' || display === 'Error') {
        setDisplay(value);
      } else {
        setDisplay(display + value);
      }
    }
  };

  // GPA Calculations
  const handleAddCourse = () => {
    const credits = parseFloat(courseCredits);
    const grade = parseFloat(courseGradePoint);

    if (!courseName.trim()) {
      Alert.alert('Required Info', 'Please enter a course code/name.');
      return;
    }
    if (isNaN(credits) || credits <= 0) {
      Alert.alert('Invalid Credits', 'Please enter valid positive credit hours.');
      return;
    }
    if (isNaN(grade) || grade < 0 || grade > 10) {
      Alert.alert('Invalid Grade', 'Grade point must be between 0 and 10.');
      return;
    }

    const newCourse = {
      id: Date.now().toString(),
      name: courseName.trim(),
      credits,
      gradePoint: grade,
    };
    setCourses([...courses, newCourse]);
    setCourseName('');
    setCourseCredits('');
    setCourseGradePoint('');
    setCalculatedGPA(null);
  };

  const handleDeleteCourse = (id) => {
    setCourses(courses.filter(c => c.id !== id));
    setCalculatedGPA(null);
  };

  const calculateGPAValue = () => {
    if (courses.length === 0) {
      Alert.alert('No Courses', 'Please add at least one course first.');
      return;
    }
    let totalCredits = 0;
    let totalQualityPoints = 0;
    courses.forEach(c => {
      totalCredits += c.credits;
      totalQualityPoints += c.credits * c.gradePoint;
    });

    const gpa = totalQualityPoints / totalCredits;
    setCalculatedGPA(gpa.toFixed(2));
  };

  // Target Score Calculator Logic
  const calculateRequiredScore = () => {
    const internal = parseFloat(internalMarks);
    const intMax = parseFloat(internalMax);
    const target = parseFloat(overallTarget);
    const weight = parseFloat(finalWeight) / 100;

    if (isNaN(internal) || isNaN(intMax) || isNaN(target) || isNaN(weight)) {
      Alert.alert('Error', 'Please fill in all inputs with valid numbers.');
      return;
    }
    if (internal > intMax) {
      Alert.alert('Error', 'Internal marks cannot exceed maximum internal score.');
      return;
    }
    if (target < 0 || target > 100) {
      Alert.alert('Error', 'Target percentage must be between 0% and 100%.');
      return;
    }
    if (weight <= 0 || weight >= 1) {
      Alert.alert('Error', 'Weight must be between 1% and 99%.');
      return;
    }

    // internal Pct contribution to final = (internal / intMax) * (1 - weight) * 100
    const internalPctContribution = (internal / intMax) * (1 - weight) * 100;
    // required final pct of exam marks = (target - internalPctContribution) / weight
    const reqFinalPct = (target - internalPctContribution) / weight;

    if (reqFinalPct < 0) {
      setRequiredFinalScore('0.00% (Already Achieved! 🎉)');
    } else if (reqFinalPct > 100) {
      setRequiredFinalScore(`${reqFinalPct.toFixed(2)}% (Requires Extra Credit/Impossible)`);
    } else {
      setRequiredFinalScore(`${reqFinalPct.toFixed(2)}%`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#F3F1EC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Study Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Segment Controls */}
      <View style={styles.segmentedContainer}>
        {[
          { id: 'standard', label: 'Standard' },
          { id: 'gpa', label: 'GPA Cal' },
          { id: 'target', label: 'Exam Target' }
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.segmentBtn, activeTab === tab.id && styles.segmentBtnActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.segmentBtnText, activeTab === tab.id && styles.segmentBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Display Area */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {activeTab === 'standard' && (
          <View style={styles.standardContainer}>
            {/* Screen */}
            <View style={styles.calcScreen}>
              <Text style={styles.equationText} numberOfLines={1}>{equation}</Text>
              <Text style={styles.displayText} numberOfLines={1}>{display}</Text>
            </View>

            {/* Buttons Grid */}
            <View style={styles.keypad}>
              {[
                ['C', 'del', '%', '/'],
                ['7', '8', '9', '*'],
                ['4', '5', '6', '-'],
                ['1', '2', '3', '+'],
                ['0', '.', '=']
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map(char => {
                    const isOperator = ['/', '*', '-', '+', '=', '%'].includes(char);
                    const isClearDel = ['C', 'del'].includes(char);
                    const buttonScale = getButtonScale(char);
                    
                    return (
                      <Animated.View
                        key={char}
                        style={{
                          transform: [{ scale: buttonScale }],
                          flex: char === '0' ? 2 : 1,
                        }}
                      >
                        <TouchableOpacity
                          style={[
                            styles.calcBtn,
                            isOperator && styles.operatorBtn,
                            isClearDel && styles.clearDelBtn,
                            char === '=' && styles.equalsBtn
                          ]}
                          onPressIn={() => handlePressIn(char)}
                          onPressOut={() => handlePressOut(char)}
                          onPress={() => handleCalcPress(char)}
                          activeOpacity={0.9}
                        >
                          <Text style={[
                            styles.calcBtnText,
                            isOperator && { color: '#0F1115' },
                            isClearDel && { color: '#C47070' }
                          ]}>
                            {char === 'del' ? '⌫' : char}
                          </Text>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'gpa' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Course Adder */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add Course details</Text>
              
              <Text style={styles.inputLabel}>Course Code / Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. CS101"
                placeholderTextColor="#5A6070"
                value={courseName}
                onChangeText={setCourseName}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Credits</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 4"
                    keyboardType="numeric"
                    placeholderTextColor="#5A6070"
                    value={courseCredits}
                    onChangeText={setCourseCredits}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Grade Point (0-10)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 9"
                    keyboardType="numeric"
                    placeholderTextColor="#5A6070"
                    value={courseGradePoint}
                    onChangeText={setCourseGradePoint}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.actionBtn} onPress={handleAddCourse}>
                <Ionicons name="add-outline" size={18} color="#0F1115" style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>Add Course</Text>
              </TouchableOpacity>
            </View>

            {/* Courses List */}
            <Text style={styles.sectionLabel}>Added Courses</Text>
            <View style={styles.coursesList}>
              {courses.map(course => (
                <View key={course.id} style={styles.courseItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseNameText}>{course.name}</Text>
                    <Text style={styles.courseMetaText}>Credits: {course.credits} • Grade Point: {course.gradePoint}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteCourse(course.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color="#C47070" />
                  </TouchableOpacity>
                </View>
              ))}
              {courses.length === 0 && (
                <Text style={styles.emptyText}>No courses added yet. Fill form above to add.</Text>
              )}
            </View>

            {/* Calculate Button and Output */}
            <TouchableOpacity style={styles.calculateBtn} onPress={calculateGPAValue}>
              <Text style={styles.calculateBtnText}>Calculate GPA</Text>
            </TouchableOpacity>

            {calculatedGPA !== null && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>YOUR GPA</Text>
                <Text style={styles.resultValue}>{calculatedGPA}</Text>
                <Text style={styles.resultSub}>Scale: 10.00 Max</Text>
              </View>
            )}
          </ScrollView>
        )}

        {activeTab === 'target' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Final Exam Marks Estimator</Text>
              <Text style={styles.cardSubtitle}>Find out the required score percentage in your final semester exams to hit your target GPA percentage.</Text>

              <Text style={styles.inputLabel}>Current Internal Marks</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 24"
                keyboardType="numeric"
                placeholderTextColor="#5A6070"
                value={internalMarks}
                onChangeText={setInternalMarks}
              />

              <Text style={styles.inputLabel}>Max Internal Marks</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 30"
                keyboardType="numeric"
                placeholderTextColor="#5A6070"
                value={internalMax}
                onChangeText={setInternalMax}
              />

              <Text style={styles.inputLabel}>Target Semester Overall Percentage (%)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 80"
                keyboardType="numeric"
                placeholderTextColor="#5A6070"
                value={overallTarget}
                onChangeText={setOverallTarget}
              />

              <Text style={styles.inputLabel}>Weight of Final Exam in Overall Marks (%)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 70 (Fires 70% of total score)"
                keyboardType="numeric"
                placeholderTextColor="#5A6070"
                value={finalWeight}
                onChangeText={setFinalWeight}
              />

              <TouchableOpacity style={styles.calculateBtn} onPress={calculateRequiredScore}>
                <Text style={styles.calculateBtnText}>Estimate Target Score</Text>
              </TouchableOpacity>
            </View>

            {requiredFinalScore !== null && (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>REQUIRED FINAL EXAM SCORE</Text>
                <Text style={styles.resultValue}>{requiredFinalScore}</Text>
                <Text style={styles.resultSub}>Based on overall target of {overallTarget}%</Text>
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#F3F1EC',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#1D2430',
  },
  segmentBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#8B92A0',
  },
  segmentBtnTextActive: {
    color: '#BA7517',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  standardContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  calcScreen: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  equationText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 18,
    color: '#5A6070',
    marginBottom: 6,
  },
  displayText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 48,
    color: '#F3F1EC',
  },
  keypad: {
    width: '100%',
    gap: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 12,
  },
  calcBtn: {
    height: 72,
    borderRadius: 36,
    backgroundColor: '#171B22',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  calcBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: '#F3F1EC',
  },
  operatorBtn: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517',
  },
  clearDelBtn: {
    backgroundColor: 'rgba(196, 112, 112, 0.08)',
    borderColor: 'rgba(196, 112, 112, 0.15)',
  },
  equalsBtn: {
    backgroundColor: '#BA7517',
    borderColor: '#BA7517',
  },
  scrollContent: {
    padding: 20,
    gap: 20,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: '#171B22',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#F3F1EC',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#8B92A0',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#8B92A0',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#0F1115',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    color: '#F3F1EC',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BA7517',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  actionBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#0F1115',
  },
  sectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5A6070',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  coursesList: {
    gap: 8,
  },
  courseItem: {
    flexDirection: 'row',
    backgroundColor: '#171B22',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  courseNameText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#F3F1EC',
  },
  courseMetaText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
  },
  calculateBtn: {
    backgroundColor: '#BA7517',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  calculateBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0F1115',
  },
  resultBox: {
    backgroundColor: 'rgba(186, 117, 23, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 117, 23, 0.15)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  resultLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#BA7517',
    letterSpacing: 0.5,
  },
  resultValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 32,
    color: '#BA7517',
    marginTop: 6,
  },
  resultSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#8B92A0',
    marginTop: 4,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#5A6070',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
