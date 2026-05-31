import React from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Screens
import TabNavigator from './TabNavigator';
import FocusScreen from '../screens/FocusScreen';
import NotesScreen from '../screens/NotesScreen';
import BudgetScreen from '../screens/BudgetScreen';
import HydrationScreen from '../screens/HydrationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationCenterScreen from '../screens/NotificationCenterScreen';
import AlarmScreen from '../screens/AlarmScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';

const Stack = createNativeStackNavigator();

function HeaderOverflowMenu() {
  const navigation = useNavigation();
  
  const handlePress = () => {
    Alert.alert(
      "Workspace Menu",
      "Select an option to navigate or get help:",
      [
        {
          text: "Go to Profile",
          onPress: () => navigation.navigate("ProfileWorkspace")
        },
        {
          text: "Help & Support",
          onPress: () => Alert.alert(
            "About Planory",
            "Planory helps you manage your habits, study schedules, budget, hydration, and wake up alarms with motivational missions.\n\n• Pull-to-refresh any screen to sync with backend.\n• Use the Hub icon on the home tab to toggle between modules quickly."
          )
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} style={{ padding: 6, marginRight: 8 }}>
      <Ionicons name="ellipsis-vertical" size={20} color="#F3F1EC" />
    </TouchableOpacity>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ 
      headerShown: true,
      headerStyle: { backgroundColor: '#0F1115' },
      headerTintColor: '#F3F1EC',
      headerTitleStyle: { fontFamily: 'PlusJakartaSans_700Bold' },
      headerBackTitleVisible: false,
      headerRight: () => <HeaderOverflowMenu />,
      animation: 'slide_from_right'
    }}>
      <Stack.Screen 
        name="MainTabs" 
        component={TabNavigator} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="FocusWorkspace" 
        component={FocusScreen} 
        options={{ title: 'Focus Timer' }} 
      />
      <Stack.Screen 
        name="NotesWorkspace" 
        component={NotesScreen} 
        options={{ title: 'Subject Notes' }} 
      />
      <Stack.Screen 
        name="BudgetWorkspace" 
        component={BudgetScreen} 
        options={{ title: 'Student Budget' }} 
      />
      <Stack.Screen 
        name="HydrationWorkspace" 
        component={HydrationScreen} 
        options={{ title: 'Water Log' }} 
      />
      <Stack.Screen 
        name="ProfileWorkspace" 
        component={ProfileScreen} 
        options={{ title: 'Student Profile' }} 
      />
      <Stack.Screen 
        name="NotificationCenterWorkspace" 
        component={NotificationCenterScreen} 
        options={{ title: 'Quiet Hours & Reminders' }} 
      />
      <Stack.Screen 
        name="AlarmWorkspace" 
        component={AlarmScreen} 
        options={{ title: 'Daily Alarms & Missions' }} 
      />
      <Stack.Screen 
        name="AnalyticsWorkspace" 
        component={AnalyticsScreen} 
        options={{ title: 'Workspace Analytics', headerShown: false }} 
      />
    </Stack.Navigator>
  );
}
