import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as bridge from '../api/cloudStreamBridge';
import { theme } from '../theme';
import { useTransitionActions } from '../context/TransitionContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  navigation: any;
}

const homeOptions = [
  { label: 'Always Refresh (No Cache)', value: 0, desc: 'Always load live content from the internet.' },
  { label: '2 Hours (Fast updates)', value: 2 * 60 * 60 * 1000, desc: 'Saves data but updates content frequently.' },
  { label: '6 Hours (Balanced)', value: 6 * 60 * 60 * 1000, desc: 'Good balance of fresh content and speed.' },
  { label: '12 Hours (Recommended)', value: 12 * 60 * 60 * 1000, desc: 'Loads main page instantly, saves data.' },
  { label: '24 Hours (Maximum Speed)', value: 24 * 60 * 60 * 1000, desc: 'Great for slow connections, updates once a day.' },
];

const detailOptions = [
  { label: 'Always Refresh (No Cache)', value: 0, desc: 'Always fetch live movie and show details.' },
  { label: '6 Hours (Fast updates)', value: 6 * 60 * 60 * 1000, desc: 'Updates episode lists four times a day.' },
  { label: '12 Hours (Balanced)', value: 12 * 60 * 60 * 1000, desc: 'Updates episode lists twice a day.' },
  { label: '24 Hours (Recommended)', value: 24 * 60 * 60 * 1000, desc: 'Loads descriptions instantly, updates daily.' },
  { label: '7 Days (Offline Mode)', value: 7 * 24 * 60 * 60 * 1000, desc: 'Best for saving internet data. Updates weekly.' },
];

const linksOptions = [
  { label: 'Always Scrape (No Cache)', value: 0, desc: 'Always search for live playback links from all providers.' },
  { label: '10 Minutes (Quick sessions)', value: 10 * 60 * 1000, desc: 'Saves links for short player sessions.' },
  { label: '30 Minutes (Recommended)', value: 30 * 60 * 1000, desc: 'Best balance of link freshness and speed.' },
  { label: '2 Hours (Long watching)', value: 2 * 60 * 60 * 1000, desc: 'Great for binge watching multiple episodes.' },
  { label: '12 Hours (Maximum Speed)', value: 12 * 60 * 60 * 1000, desc: 'Loads playing links instantly if previously loaded.' },
];

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { setGlobalBlurTarget } = useTransitionActions();
  const [loading, setLoading] = useState(true);
  const [selectedHomeTtl, setSelectedHomeTtl] = useState(12 * 60 * 60 * 1000);
  const [selectedDetailTtl, setSelectedDetailTtl] = useState(24 * 60 * 60 * 1000);
  const [selectedLinksTtl, setSelectedLinksTtl] = useState(30 * 60 * 1000);
  const [clearing, setClearing] = useState(false);
  const [clearingLinks, setClearingLinks] = useState(false);

  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = useCallback((val: any) => {
    if (val !== blurTargetRef.current) {
      blurTargetRef.current = val;
      setBlurTarget(val);
      setGlobalBlurTarget(val);
    }
  }, [setGlobalBlurTarget]);

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCurrentSettings();
    const unsub = navigation.addListener('focus', () => {
      setGlobalBlurTarget(blurTargetRef.current);
    });
    return unsub;
  }, [navigation, setGlobalBlurTarget]);

  async function loadCurrentSettings() {
    try {
      const settings = await bridge.getSettings();
      setSelectedHomeTtl(settings.mainPageTtl);
      setSelectedDetailTtl(settings.detailsTtl);
      setSelectedLinksTtl(settings.linksTtl);
    } catch (e) {
      console.warn('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleHomeTtlChange(value: number) {
    setSelectedHomeTtl(value);
    try {
      await bridge.saveSettings(value, selectedDetailTtl, selectedLinksTtl);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  async function handleDetailTtlChange(value: number) {
    setSelectedDetailTtl(value);
    try {
      await bridge.saveSettings(selectedHomeTtl, value, selectedLinksTtl);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  async function handleLinksTtlChange(value: number) {
    setSelectedLinksTtl(value);
    try {
      await bridge.saveSettings(selectedHomeTtl, selectedDetailTtl, value);
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function handleClearCache() {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached listings and details? This will free up storage space and force the app to reload fresh data from the internet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await bridge.clearCache();
              Alert.alert('Success', 'Cache has been cleared successfully.');
            } catch (e) {
              Alert.alert('Error', 'Failed to clear cache.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  }

  function handleClearLinksCache() {
    Alert.alert(
      'Clear Playback Links Cache',
      'Are you sure you want to clear all cached play links? This will force the app to scrape all providers fresh next time you click play.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Links',
          style: 'destructive',
          onPress: async () => {
            setClearingLinks(true);
            try {
              bridge.clearLinksCache();
              Alert.alert('Success', 'Playback links cache has been cleared successfully.');
            } catch (e) {
              Alert.alert('Error', 'Failed to clear playback links cache.');
            } finally {
              setClearingLinks(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.accentLight} />
          <Text style={styles.loadingText}>Loading Settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const scrollThreshold = 40;
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, scrollThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const canGoBack = navigation.canGoBack && navigation.canGoBack();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Ambient Glow */}
      <LinearGradient
        colors={[theme.colors.accentGlow, 'transparent']}
        style={styles.ambientGlow}
        pointerEvents="none"
      />

      <BlurTargetView ref={setBlurTargetRef as any} style={StyleSheet.absoluteFillObject}>
        <Animated.ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 16) + 70,
              paddingBottom: 110,
            },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {/* Home Screen Cache Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Home Screen Cache</Text>
            <Text style={styles.cardDescription}>
              Controls how long the app remembers the Home Screen content. A longer time makes the home tab load instantly, while a shorter time shows new updates sooner.
            </Text>
            <View style={styles.optionsList}>
              {homeOptions.map((opt) => {
                const isSelected = selectedHomeTtl === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionRow, isSelected && styles.optionRowActive]}
                    onPress={() => handleHomeTtlChange(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Details Screen Cache Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Show Details Cache</Text>
            <Text style={styles.cardDescription}>
              Controls how long the app remembers details, descriptions, and episode lists. A longer time saves internet data and loads screens instantly, while a shorter time updates episode lists faster.
            </Text>
            <View style={styles.optionsList}>
              {detailOptions.map((opt) => {
                const isSelected = selectedDetailTtl === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionRow, isSelected && styles.optionRowActive]}
                    onPress={() => handleDetailTtlChange(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Playback Links Cache Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Playback Links Cache</Text>
            <Text style={styles.cardDescription}>
              Controls how long the app remembers resolved streaming sources and play links. A longer cache skips scraping and plays videos instantly, while a shorter cache refreshes expiring source links.
            </Text>
            <View style={styles.optionsList}>
              {linksOptions.map((opt) => {
                const isSelected = selectedLinksTtl === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.optionRow, isSelected && styles.optionRowActive]}
                    onPress={() => handleLinksTtlChange(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Storage Management Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Storage & Cleanup</Text>
            <Text style={styles.cardDescription}>
              Free up storage space on your device. Clearing cached data will force the app to fetch fresh listings and show details next time you browse, without deleting your preferences.
            </Text>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearCache}
                disabled={clearing}
                activeOpacity={0.8}
              >
                {clearing ? (
                  <ActivityIndicator size="small" color={theme.colors.rose} />
                ) : (
                  <Text style={styles.clearBtnText}>Clear Cached Metadata</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.clearBtn, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.12)' }]}
                onPress={handleClearLinksCache}
                disabled={clearingLinks}
                activeOpacity={0.8}
              >
                {clearingLinks ? (
                  <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                ) : (
                  <Text style={[styles.clearBtnText, { color: theme.colors.textPrimary }]}>Clear Cached Playback Links</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>
      </BlurTargetView>

      {/* Floating Custom Header Bar (Capsule Blur design matching DetailScreen) */}
      <Animated.View style={[
        styles.headerBar,
        {
          top: Math.max(insets.top - 4, 8),
          shadowOpacity: headerBgOpacity,
          elevation: scrollY.interpolate({
            inputRange: [0, scrollThreshold],
            outputRange: [0, 4],
            extrapolate: 'clamp',
          }),
        }
      ]}>
        {/* Animated Background blur capsule */}
        <Animated.View style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: headerBgOpacity,
            borderRadius: theme.layout.headerRadius,
            overflow: 'hidden',
          }
        ]}>
          <BlurView 
            intensity={100} 
            tint="dark" 
            style={StyleSheet.absoluteFillObject}
            blurTarget={{ current: blurTarget }}
            blurMethod="dimezisBlurView"
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.overlayTint }]} />
        </Animated.View>
        
        {/* Left Action Button (Back arrow if can go back, else settings-outline icon) */}
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => canGoBack && navigation.goBack()}
          disabled={!canGoBack}
        >
          <BlurView 
            intensity={40} 
            tint="dark" 
            style={styles.navButtonBlur}
          >
            <Ionicons 
              name={canGoBack ? "arrow-back" : "settings-outline"} 
              size={20} 
              color={theme.colors.textPrimary} 
            />
          </BlurView>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Settings</Text>
        
        {/* Right Spacer for visual balance */}
        <View style={styles.headerSpacer} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  headerBar: {
    position: 'absolute',
    left: theme.layout.headerMarginHorizontal,
    right: theme.layout.headerMarginHorizontal,
    height: theme.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  navButtonBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  card: {
    ...theme.glass.card,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  optionsList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  optionRowActive: {
    borderBottomColor: theme.colors.accentGlow,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleActive: {
    borderColor: theme.colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionLabelActive: {
    color: theme.colors.accentLight,
  },
  optionDesc: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  clearBtn: {
    backgroundColor: theme.colors.roseBg,
    borderWidth: 1.5,
    borderColor: theme.colors.roseBorder,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  clearBtnText: {
    color: theme.colors.rose,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
