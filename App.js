import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SeeAllScreen from './src/screens/SeeAllScreen';
import { TransitionProvider, useTransition } from './src/context/TransitionContext';
import { getFavorites } from './src/api/favorites';
import DetailScreen from './src/screens/DetailScreen';
import { theme } from './src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import * as Font from 'expo-font';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TAB_BAR_PADDING = 10;
const INNER_WIDTH = SCREEN_WIDTH - 40 - (TAB_BAR_PADDING * 2);
const BUTTON_WIDTH = INNER_WIDTH / 4;
const BADGE_WIDTH = BUTTON_WIDTH * 0.85; // Pill fills 85% of the tab width
const BADGE_HEIGHT = 38;

const RootStack = createNativeStackNavigator();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, badgeCount }) {
  return (
    <View style={tabStyles.iconWrap}>
      <Ionicons
        name={focused ? name : `${name}-outline`}
        size={focused ? 20 : 22}
        color={focused ? '#ffffff' : 'rgba(255, 255, 255, 0.4)'}
      />
      {badgeCount !== undefined && badgeCount > 0 && (
        <View style={tabStyles.badge}>
          <Text style={tabStyles.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </View>
  );
}



function TabNavigator({ navigation }) {
  const { globalBlurTarget } = useTransition();
  const [activeTab, setActiveTab] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef(null);

  // Sync scroll position to active tab index
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (event) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / SCREEN_WIDTH);
        if (index !== activeTab && index >= 0 && index < 4) {
          setActiveTab(index);
        }
      }
    }
  );

  const handleTabPress = (index) => {
    setActiveTab(index);
    pagerRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  useEffect(() => {
    async function updateFavCount() {
      try {
        const list = await getFavorites();
        if (list) {
          setFavCount(list.length);
        }
      } catch (_) {}
    }
    updateFavCount();
    const interval = setInterval(updateFavCount, 1500);
    return () => clearInterval(interval);
  }, []);

  const badgeTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH * 3],
    outputRange: [0, BUTTON_WIDTH * 3],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: SCREEN_WIDTH * 4 }}
      >
        <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
          <HomeScreen navigation={navigation} />
        </View>
        <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
          <SearchScreen navigation={navigation} />
        </View>
        <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
          <FavoritesScreen navigation={navigation} />
        </View>
        <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
          <SettingsScreen navigation={navigation} />
        </View>
      </Animated.ScrollView>

      {/* Floating Bottom Navigation Bar */}
      <View style={tabStyles.tabBarContainer}>
        {/* Glass background */}
        <View style={[StyleSheet.absoluteFillObject, { 
          borderRadius: 29, 
          overflow: 'hidden', 
          borderWidth: 1, 
          borderColor: 'rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(20, 18, 24, 0.65)'
        }]}>
          {globalBlurTarget ? (
            <BlurView 
              intensity={100} 
              tint="dark" 
              style={StyleSheet.absoluteFillObject} 
              blurTarget={{ current: globalBlurTarget }}
              blurMethod="dimezisBlurView"
            />
          ) : (
            <BlurView 
              intensity={100} 
              tint="dark" 
              style={StyleSheet.absoluteFillObject} 
            />
          )}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
        </View>

        {/* Sliding active indicator badge */}
        <Animated.View style={[
          tabStyles.activeIndicator,
          { transform: [{ translateX: badgeTranslateX }] }
        ]} />

        {/* Tab Items */}
        <View style={tabStyles.tabBarInner}>
          <TouchableOpacity style={tabStyles.tabButton} onPress={() => handleTabPress(0)} activeOpacity={0.7}>
            <TabIcon name="home" focused={activeTab === 0} />
          </TouchableOpacity>
          <TouchableOpacity style={tabStyles.tabButton} onPress={() => handleTabPress(1)} activeOpacity={0.7}>
            <TabIcon name="search" focused={activeTab === 1} />
          </TouchableOpacity>
          <TouchableOpacity style={tabStyles.tabButton} onPress={() => handleTabPress(2)} activeOpacity={0.7}>
            <TabIcon name="heart" focused={activeTab === 2} />
          </TouchableOpacity>
          <TouchableOpacity style={tabStyles.tabButton} onPress={() => handleTabPress(3)} activeOpacity={0.7}>
            <TabIcon name="settings" focused={activeTab === 3} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [isFirstTime, setIsFirstTime] = React.useState(null);
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  React.useEffect(() => {
    async function checkFirstTimeAndLoadFonts() {
      const checkStoragePromise = AsyncStorage.getItem('@zuno_is_first_time');
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
      await AsyncStorage.setItem('@zuno_is_first_time', 'false');
    } catch (e) {
      console.warn(e);
    }
    setIsFirstTime(false);
  };

  if (isFirstTime === null || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TransitionProvider>
        <NavigationContainer>
          <StatusBar style="light" translucent backgroundColor="transparent" />
          <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
            {isFirstTime ? (
              <RootStack.Screen name="Onboarding">
                {props => <OnboardingScreen {...props} onFinish={handleFinishOnboarding} />}
              </RootStack.Screen>
            ) : (
              <>
                <RootStack.Screen name="Main" component={TabNavigator} />
                <RootStack.Screen name="SeeAll" component={SeeAllScreen} />
              </>
            )}
          </RootStack.Navigator>
        </NavigationContainer>
        <DetailScreen />
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
  tabBarContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    height: 58,
    borderRadius: 29,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 100,
  },
  activeIndicator: {
    position: 'absolute',
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    borderRadius: BADGE_HEIGHT / 2,
    backgroundColor: theme.colors.accent,
    left: TAB_BAR_PADDING + (BUTTON_WIDTH - BADGE_WIDTH) / 2,
    top: (58 - BADGE_HEIGHT) / 2,
  },
  tabBarInner: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: TAB_BAR_PADDING,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    width: BADGE_WIDTH,
    flexDirection: 'row',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: theme.colors.rose,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#050505',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '700',
  },
});
