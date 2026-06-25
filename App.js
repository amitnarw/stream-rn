import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import DetailScreen from './src/screens/DetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { TransitionProvider } from './src/context/TransitionContext';
import HeroOverlay from './src/components/HeroOverlay';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, icon, focused }) {
  return (
    <View style={tabStyles.iconWrap}>
      <Text style={[tabStyles.iconText, focused && tabStyles.iconActive]}>{icon}</Text>
      <Text style={[tabStyles.labelText, focused && tabStyles.labelActive]}>{label}</Text>
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#12093a' } }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} />
    </Stack.Navigator>
  );
}

function DiscoverStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#12093a' } }}
    >
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Detail" component={DetailScreen} />
    </Stack.Navigator>
  );
}

function SavedScreen() {
  return (
    <View style={styles.emptyTab}>
      <Text style={styles.emptyTabText}>No saved items yet</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TransitionProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: tabStyles.tabBar,
              tabBarShowLabel: false,
            }}
          >
            <Tab.Screen
              name="Home"
              component={HomeStack}
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabIcon label="Home" icon="H" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Discover"
              component={DiscoverStack}
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabIcon label="Discover" icon="D" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Saved"
              component={SavedScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabIcon label="Saved" icon="S" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Profile"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabIcon label="Profile" icon="P" focused={focused} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
        <HeroOverlay />
      </TransitionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  emptyTab: {
    flex: 1,
    backgroundColor: '#12093a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
  },
});

const tabStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1a1035',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.35)',
  },
  iconActive: {
    color: '#ffffff',
  },
  labelText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
