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
import FavoritesScreen from './src/screens/FavoritesScreen';
import { TransitionProvider } from './src/context/TransitionContext';
import HeroOverlay from './src/components/HeroOverlay';
import { theme } from './src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import * as Font from 'expo-font';
import { BlurView } from 'expo-blur';

const RootStack = createNativeStackNavigator();
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
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} />
    </Stack.Navigator>
  );
}

function DiscoverStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
    >
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Detail" component={DetailScreen} />
    </Stack.Navigator>
  );
}

function SavedStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
    >
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="Detail" component={DetailScreen} />
    </Stack.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabStyles.tabBar,
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFillObject}>
            <BlurView 
              intensity={100} 
              tint="dark" 
              style={StyleSheet.absoluteFillObject} 
            />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
          </View>
        ),
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
        component={SavedStack}
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
  );
}

export default function App() {
  const [isFirstTime, setIsFirstTime] = React.useState(null);
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  React.useEffect(() => {
    async function checkFirstTimeAndLoadFonts() {
      const checkStoragePromise = AsyncStorage.getItem('@sozo_is_first_time');
      const loadFontsPromise = Font.loadAsync({
        'PlusJakartaSans-Regular': 'https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-Regular.ttf',
        'PlusJakartaSans-Bold': 'https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-Bold.ttf',
        'PlusJakartaSans-ExtraBold': 'https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-ExtraBold.ttf',
        'PlusJakartaSans-Black': 'https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-ExtraBold.ttf',
      });

      try {
        const val = await checkStoragePromise;
        if (val === null) {
          setIsFirstTime(true);
        } else {
          setIsFirstTime(false);
        }
      } catch (e) {
        setIsFirstTime(false);
      }

      try {
        await loadFontsPromise;
        setFontsLoaded(true);
      } catch (e) {
        console.warn('Failed to load Plus Jakarta Sans remote fonts, falling back to system:', e);
        setFontsLoaded(true);
      }
    }

    checkFirstTimeAndLoadFonts();
  }, []);

  const handleFinishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('@sozo_is_first_time', 'false');
    } catch (e) {
      console.warn(e);
    }
    setIsFirstTime(false);
  };

  if (isFirstTime === null || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TransitionProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
            {isFirstTime ? (
              <RootStack.Screen name="Onboarding">
                {props => <OnboardingScreen {...props} onFinish={handleFinishOnboarding} />}
              </RootStack.Screen>
            ) : (
              <RootStack.Screen name="Main" component={TabNavigator} />
            )}
          </RootStack.Navigator>
        </NavigationContainer>
        <HeroOverlay />
      </TransitionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  emptyTab: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    height: 58,
    borderRadius: 29,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    overflow: 'hidden',
    paddingBottom: 0,
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
