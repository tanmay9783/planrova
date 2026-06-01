import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFirestoreData } from '../hooks/useFirestoreData';
import { auth } from '../firebase';

export default function CaptureScreen() {
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const [brainDump, setBrainDump] = useFirestoreData('brain_dump', []);
  const [dumpText, setDumpText] = useState('');

  const addBrainDump = () => {
    if (!dumpText.trim()) return;
    setBrainDump([
      { id: Date.now().toString(), text: dumpText.trim(), date: new Date().toISOString() },
      ...brainDump
    ]);
    setDumpText('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Capture</Text>
      </View>
      
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>QUICK CAPTURE</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{brainDump.length}</Text></View>
            </View>
            <Ionicons name="caret-down" size={14} color="#5A6070" />
          </View>

          <View style={styles.captureBox}>
            <TextInput
              style={styles.input}
              placeholder="Quick thought? Dump here..."
              placeholderTextColor="#5A6070"
              value={dumpText}
              onChangeText={setDumpText}
              multiline
            />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.iconBtn}>
                <Ionicons name="apps" size={20} color="#8B92A0" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={addBrainDump}>
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.helperText}>Capture ideas before they disappear.</Text>

          <TouchableOpacity style={styles.settingsBtn}>
            <Text style={styles.settingsText}>Settings</Text>
          </TouchableOpacity>
        </View>

        {brainDump.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>RECENT DUMPS</Text>
            {brainDump.slice(0, 5).map(item => (
              <View key={item.id} style={styles.dumpCard}>
                <Text style={styles.dumpText}>{item.text}</Text>
                <Text style={styles.dumpDate}>{new Date(item.date).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1115' },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, color: '#F3F1EC' },
  
  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#5A6070', letterSpacing: 1 },
  badge: { backgroundColor: '#1D2430', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  badgeText: { color: '#8B92A0', fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold' },

  captureBox: { backgroundColor: 'transparent', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 16 },
  input: { fontFamily: 'PlusJakartaSans_500Medium', color: '#F3F1EC', fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  iconBtn: { backgroundColor: '#1D2430', padding: 10, borderRadius: 10 },
  addBtn: { backgroundColor: '#BA7517', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#0F1115', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },

  helperText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#8B92A0', fontSize: 13, textAlign: 'center', marginTop: 24, marginBottom: 32 },

  settingsBtn: { backgroundColor: '#171B22', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  settingsText: { color: '#8B92A0', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15 },

  dumpCard: { backgroundColor: '#1D2430', padding: 16, borderRadius: 16, marginBottom: 12 },
  dumpText: { color: '#F3F1EC', fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 20 },
  dumpDate: { color: '#5A6070', fontSize: 11, marginTop: 12, fontFamily: 'PlusJakartaSans_500Medium' }
});
