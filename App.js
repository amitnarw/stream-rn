import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity, BackHandler, Modal, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SeeAllScreen from './src/screens/SeeAllScreen';
import LiveTVScreen from './src/screens/LiveTVScreen';
import { TransitionProvider, useTransition } from './src/context/TransitionContext';
import { getFavorites, subscribeFavorites } from './src/api/favorites';
import DetailScreen from './src/screens/DetailScreen';
import { theme } from './src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './src/screens/OnboardingScreen';
import * as Font from 'expo-font';
import { BlurView } from 'expo-blur';
import { Home, Search, Heart, Settings, LogOut } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TAB_BAR_PADDING = 10;
const INNER_WIDTH = SCREEN_WIDTH - 40 - (TAB_BAR_PADDING * 2);
const BUTTON_WIDTH = INNER_WIDTH / 4;
const BADGE_WIDTH = BUTTON_WIDTH * 0.85; // Pill fills 85% of the tab width
const BADGE_HEIGHT = 38;

const RootStack = createNativeStackNavigator();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ Icon, focused, badgeCount, onPress }) {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.08 : 0.92)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1.08 : 0.92,
        useNativeDriver: true,
        friction: 8,
        tension: 120,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.5,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <TouchableOpacity style={tabStyles.tabButton} onPress={onPress} activeOpacity={0.8}>
      <Animated.View style={[tabStyles.iconWrap, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        <Icon
          size={20}
          color="#ffffff"
          fill={focused && (Icon === Heart || Icon === Home) ? '#ffffff' : 'transparent'}
          strokeWidth={focused ? 2.5 : 2}
        />
        {badgeCount !== undefined && badgeCount > 0 && (
          <View style={tabStyles.badge}>
            <Text style={tabStyles.badgeText}>{badgeCount}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function TabNavigator({ navigation }) {
  const { globalBlurTarget } = useTransition();
  const [activeTab, setActiveTab] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  // Separate native opacity animated values for each screen to enable butter-smooth crossfading
  const fadeAnim0 = useRef(new Animated.Value(1)).current;
  const fadeAnim1 = useRef(new Animated.Value(0)).current;
  const fadeAnim2 = useRef(new Animated.Value(0)).current;
  const fadeAnim3 = useRef(new Animated.Value(0)).current;

  const fadeAnims = [fadeAnim0, fadeAnim1, fadeAnim2, fadeAnim3];

  const handleTabPress = (index) => {
    if (index === activeTab) return;
    const prevTab = activeTab;
    setActiveTab(index);

    // Spring slide active tab pill indicator on native thread
    Animated.spring(indicatorAnim, {
      toValue: index,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();

    // Crossfade screen opacity smoothly on native thread
    Animated.parallel([
      Animated.timing(fadeAnims[prevTab], {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnims[index], {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
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
    const unsubscribe = subscribeFavorites((updatedList) => {
      setFavCount(updatedList.length);
    });
    return unsubscribe;
  }, []);

  const badgeTranslateX = indicatorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, BUTTON_WIDTH, BUTTON_WIDTH * 2, BUTTON_WIDTH * 3],
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Screen Views (Butter-smooth native crossfade) */}
      <View style={{ flex: 1 }}>
        <Animated.View 
          style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim0 }]}
          pointerEvents={activeTab === 0 ? 'auto' : 'none'}
        >
          <HomeScreen navigation={navigation} />
        </Animated.View>
        <Animated.View 
          style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim1 }]}
          pointerEvents={activeTab === 1 ? 'auto' : 'none'}
        >
          <SearchScreen navigation={navigation} />
        </Animated.View>
        <Animated.View 
          style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim2 }]}
          pointerEvents={activeTab === 2 ? 'auto' : 'none'}
        >
          <FavoritesScreen navigation={navigation} isFocused={activeTab === 2} />
        </Animated.View>
        <Animated.View 
          style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim3 }]}
          pointerEvents={activeTab === 3 ? 'auto' : 'none'}
        >
          <SettingsScreen navigation={navigation} />
        </Animated.View>
      </View>

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
          <TabIcon Icon={Home} focused={activeTab === 0} onPress={() => handleTabPress(0)} />
          <TabIcon Icon={Search} focused={activeTab === 1} onPress={() => handleTabPress(1)} />
          <TabIcon Icon={Heart} focused={activeTab === 2} badgeCount={favCount} onPress={() => handleTabPress(2)} />
          <TabIcon Icon={Settings} focused={activeTab === 3} onPress={() => handleTabPress(3)} />
        </View>
      </View>
    </View>
  );
}

function ExitConfirmModal({ visible, onCancel, onConfirm }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={exitStyles.backdrop} onPress={onCancel}>
        <Pressable style={[exitStyles.card, { marginBottom: insets.bottom }]} onPress={(e) => e.stopPropagation?.()}>
          <View style={exitStyles.iconWrap}>
            <LogOut size={22} color={theme.colors.rose} />
          </View>
          <Text style={exitStyles.title}>Exit Zuno?</Text>
          <Text style={exitStyles.subtitle}>Are you sure you want to close the app?</Text>
          <View style={exitStyles.btnRow}>
            <TouchableOpacity
              style={[exitStyles.btn, exitStyles.btnCancel]}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={exitStyles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[exitStyles.btn, exitStyles.btnConfirm]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={exitStyles.btnConfirmText}>Exit</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const exitStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#161618',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 74, 125, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 74, 125, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#A0A0A5',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  btnCancelText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnConfirm: {
    backgroundColor: theme.colors.rose,
  },
  btnConfirmText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default function App() {
  const [isFirstTime, setIsFirstTime] = React.useState(null);
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const [showExitModal, setShowExitModal] = React.useState(false);
  const navigationRef = useNavigationContainerRef();
  const canGoBackRef = useRef(false);

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

  // Global hardware back handler: if we can navigate back, do so; otherwise show exit confirm.
  React.useEffect(() => {
    const onBack = () => {
      const canGoBack =
        navigationRef?.isReady?.() && navigationRef.canGoBack();
      canGoBackRef.current = !!canGoBack;
      if (canGoBack) {
        navigationRef.goBack();
        return true;
      }
      setShowExitModal(true);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigationRef]);

  const handleFinishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('@zuno_is_first_time', 'false');
    } catch (e) {
      console.warn(e);
    }
    setIsFirstTime(false);
  };

  const handleConfirmExit = () => {
    setShowExitModal(false);
    BackHandler.exitApp();
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
        <NavigationContainer ref={navigationRef}>
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
                <RootStack.Screen name="LiveTV" component={LiveTVScreen} />
              </>
            )}
          </RootStack.Navigator>
        </NavigationContainer>
        <DetailScreen />
        <ExitConfirmModal
          visible={showExitModal}
          onCancel={() => setShowExitModal(false)}
          onConfirm={handleConfirmExit}
        />
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
