import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as bridge from '../api/cloudStreamBridge';
import { theme } from '../theme';
import { useTransitionActions } from '../context/TransitionContext';
import { CustomModal } from '../components/CustomModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  navigation: any;
}

interface SliderOption {
  label: string;
  shortLabel: string;
  value: number;
  desc: string;
}

const homeOptions: SliderOption[] = [
  { label: 'Off (Always Live)', shortLabel: 'Off', value: 0, desc: 'Always load the latest recommendations from the web.' },
  { label: '2 Hours (Binge Session)', shortLabel: '2h', value: 2 * 60 * 60 * 1000, desc: 'Checks for new recommendation updates every 2 hours.' },
  { label: '6 Hours (Frequent Updates)', shortLabel: '6h', value: 6 * 60 * 60 * 1000, desc: 'Checks for new recommendation updates every 6 hours.' },
  { label: '12 Hours (Balanced Speed)', shortLabel: '12h', value: 12 * 60 * 60 * 1000, desc: 'Checks for new recommendation updates twice a day. Loads app fast.' },
  { label: '24 Hours (Maximum Speed)', shortLabel: '24h', value: 24 * 60 * 60 * 1000, desc: 'Loads the Home Screen instantly. Updates feed once a day.' },
];

const detailOptions: SliderOption[] = [
  { label: 'Off (Always Live)', shortLabel: 'Off', value: 0, desc: 'Always load fresh movie details and episode lists from the web.' },
  { label: '6 Hours (Frequent Updates)', shortLabel: '6h', value: 6 * 60 * 60 * 1000, desc: 'Checks for new episodes and show updates four times a day.' },
  { label: '12 Hours (Balanced Speed)', shortLabel: '12h', value: 12 * 60 * 60 * 1000, desc: 'Checks for new episodes and show updates twice a day.' },
  { label: '24 Hours (Recommended)', shortLabel: '24h', value: 24 * 60 * 60 * 1000, desc: 'Updates movie descriptions and episode lists once a day.' },
  { label: '7 Days (Save Data Mode)', shortLabel: '7d', value: 7 * 24 * 60 * 60 * 1000, desc: 'Loads descriptions instantly. Best for limited internet.' },
];

const linksOptions: SliderOption[] = [
  { label: 'Off (Always Search)', shortLabel: 'Off', value: 0, desc: 'Always search for new video server links from all providers.' },
  { label: '10 Minutes (Quick Watch)', shortLabel: '10m', value: 10 * 60 * 1000, desc: 'Remembers working video servers for 10 minutes.' },
  { label: '30 Minutes (Recommended)', shortLabel: '30m', value: 30 * 60 * 1000, desc: 'Best balance. Remembers working video servers for half an hour.' },
  { label: '2 Hours (Long Session)', shortLabel: '2h', value: 2 * 60 * 60 * 1000, desc: 'Great for binge-watching. Remembers video servers for 2 hours.' },
  { label: '12 Hours (Instant Play)', shortLabel: '12h', value: 12 * 60 * 60 * 1000, desc: 'Plays video links instantly if loaded within 12 hours.' },
];

function PremiumSlider({ options, selectedValue, onValueChange }: {
  options: SliderOption[];
  selectedValue: number;
  onValueChange: (val: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = options.findIndex((opt) => opt.value === selectedValue);
  const activeIndex = selectedIndex !== -1 ? selectedIndex : 0;
  
  // Animated value tracking the fractional index position (0.0 to 4.0)
  const animIndex = useRef(new Animated.Value(activeIndex)).current;

  // Animate the thumb smoothly whenever activeIndex changes from props
  useEffect(() => {
    Animated.spring(animIndex, {
      toValue: activeIndex,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [activeIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // Stop scroll container interception
      },
      onPanResponderMove: (evt, gestureState) => {
        if (trackWidth > 0) {
          const deltaIndex = (gestureState.dx / trackWidth) * 4;
          const targetIndex = Math.max(0, Math.min(activeIndex + deltaIndex, 4));
          animIndex.setValue(targetIndex);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (trackWidth > 0) {
          const deltaIndex = (gestureState.dx / trackWidth) * 4;
          const rawIndex = activeIndex + deltaIndex;
          const targetIndex = Math.round(Math.max(0, Math.min(rawIndex, 4)));
          
          Animated.spring(animIndex, {
            toValue: targetIndex,
            useNativeDriver: false,
            bounciness: 8,
          }).start();
          
          onValueChange(options[targetIndex].value);
        }
      },
    })
  ).current;

  const widthPercent = animIndex.interpolate({
    inputRange: [0, 4],
    outputRange: ['0%', '100%'],
  });

  const leftPercent = animIndex.interpolate({
    inputRange: [0, 4],
    outputRange: ['0%', '100%'],
  });

  const currentOpt = options[activeIndex];

  return (
    <View style={styles.sliderContainer}>
      <View 
        style={styles.sliderTrackWrapper} 
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.sliderInactiveTrack} />
        <Animated.View style={[styles.sliderActiveTrack, { width: widthPercent }]} />
        
        {/* Checkpoint Dots with generous Touchable touch targets */}
        {options.map((opt, i) => {
          const isPassed = i <= activeIndex;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.sliderCheckpointTouchTarget,
                { left: `${i * 25}%` },
              ]}
              onPress={() => onValueChange(opt.value)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.sliderCheckpoint,
                  isPassed && styles.sliderCheckpointPassed,
                ]}
              />
            </TouchableOpacity>
          );
        })}
        
        {/* Draggable Slider Thumb */}
        <Animated.View 
          style={[styles.sliderThumb, { left: leftPercent }]} 
          {...panResponder.panHandlers}
        />
      </View>

      <View style={styles.sliderLabelsRow}>
        {options.map((opt, i) => {
          const isSelected = i === activeIndex;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.sliderLabelBtn,
                { left: `${i * 25}%` },
              ]}
              onPress={() => onValueChange(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sliderShortLabel, isSelected && styles.sliderShortLabelActive]}>
                {opt.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.sliderDescBox}>
        <View style={styles.sliderDescHeader}>
          <Text style={styles.sliderDescTitle}>{currentOpt.label}</Text>
          <View style={styles.sliderDescBadge}>
            <Text style={styles.sliderDescBadgeText}>Active</Text>
          </View>
        </View>
        <Text style={styles.sliderDescText}>{currentOpt.desc}</Text>
      </View>
    </View>
  );
}

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

  // Premium Modal States
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmBtnText, setConfirmBtnText] = useState('');
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmGlowColors, setConfirmGlowColors] = useState<string[]>([]);
  const [confirmIconName, setConfirmIconName] = useState<any>('trash-outline');
  const [confirmIconColor, setConfirmIconColor] = useState<string>('#ffffff');
  const [confirmIconBg, setConfirmIconBg] = useState<string>('rgba(255,255,255,0.1)');

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [successGlowColors, setSuccessGlowColors] = useState<string[]>([]);
  const [successIconName, setSuccessIconName] = useState<any>('checkmark-circle-outline');
  const [successIconColor, setSuccessIconColor] = useState<string>('#2ecc71');
  const [successIconBg, setSuccessIconBg] = useState<string>('rgba(46, 204, 113, 0.1)');

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

  const triggerConfirmModal = (
    title: string,
    message: string,
    btnText: string,
    glowColors: string[],
    iconName: any,
    iconColor: string,
    iconBgColor: string,
    action: () => void
  ) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmBtnText(btnText);
    setConfirmGlowColors(glowColors);
    setConfirmIconName(iconName);
    setConfirmIconColor(iconColor);
    setConfirmIconBg(iconBgColor);
    setConfirmAction(() => action);
    setConfirmVisible(true);
  };

  const triggerSuccessModal = (
    title: string,
    message: string,
    isError: boolean = false
  ) => {
    setSuccessTitle(title);
    setSuccessMessage(message);
    if (isError) {
      setSuccessGlowColors(['rgba(255, 74, 125, 0.15)', 'transparent']);
      setSuccessIconName('close-circle-outline');
      setSuccessIconColor(theme.colors.rose);
      setSuccessIconBg('rgba(255, 74, 125, 0.1)');
    } else {
      setSuccessGlowColors(['rgba(46, 204, 113, 0.15)', 'transparent']);
      setSuccessIconName('checkmark-circle-outline');
      setSuccessIconColor('#2ecc71');
      setSuccessIconBg('rgba(46, 204, 113, 0.1)');
    }
    setSuccessVisible(true);
  };

  function handleClearCache() {
    triggerConfirmModal(
      'Refresh Movie Info & Posters',
      'Are you sure you want to refresh all cached movie lists and posters? This will reload all names and images fresh from the internet next time you browse, without deleting your favorites.',
      'Refresh Info',
      ['rgba(255, 74, 125, 0.15)', 'transparent'], // Rose glow
      'refresh-circle-outline',
      theme.colors.rose,
      'rgba(255, 74, 125, 0.1)',
      async () => {
        setClearing(true);
        try {
          await bridge.clearCache();
          triggerSuccessModal('Success', 'Movie info and posters refreshed successfully.');
        } catch (e) {
          triggerSuccessModal('Error', 'Failed to refresh movie info.', true);
        } finally {
          setClearing(false);
        }
      }
    );
  }

  function handleClearLinksCache() {
    triggerConfirmModal(
      'Refresh Video Servers',
      'Are you sure you want to refresh all video stream links? This will force the app to search for new working links next time you play a video, resolving any broken player screens.',
      'Refresh Links',
      ['rgba(255, 255, 255, 0.12)', 'transparent'], // Faint white glow
      'link-outline',
      '#ffffff',
      'rgba(255, 255, 255, 0.1)',
      async () => {
        setClearingLinks(true);
        try {
          await bridge.clearLinksCache();
          triggerSuccessModal('Success', 'Video links refreshed successfully.');
        } catch (e) {
          triggerSuccessModal('Error', 'Failed to refresh video links.', true);
        } finally {
          setClearingLinks(false);
        }
      }
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
            <Text style={styles.cardTitle}>Home Feed Updates</Text>
            <Text style={styles.cardDescription}>
              Select how often the app refreshes recommendations on your Home tab. Longer times load lists instantly, while shorter times show new lists sooner.
            </Text>
            <PremiumSlider
              options={homeOptions}
              selectedValue={selectedHomeTtl}
              onValueChange={handleHomeTtlChange}
            />
          </View>

          {/* Details Screen Cache Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Episode & Info Updates</Text>
            <Text style={styles.cardDescription}>
              Select how often the app checks for new episodes and show updates. Longer times speed up navigation and save data, while shorter times show new episodes faster.
            </Text>
            <PremiumSlider
              options={detailOptions}
              selectedValue={selectedDetailTtl}
              onValueChange={handleDetailTtlChange}
            />
          </View>

          {/* Playback Links Cache Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Video Stream Memory</Text>
            <Text style={styles.cardDescription}>
              Select how long the app remembers playable video links to skip search screens. Longer memory starts videos instantly, while shorter memory searches for new servers.
            </Text>
            <PremiumSlider
              options={linksOptions}
              selectedValue={selectedLinksTtl}
              onValueChange={handleLinksTtlChange}
            />
          </View>

          {/* Storage Management Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Storage & Cleanup</Text>
            <Text style={styles.cardDescription}>
              Clean up accumulated files. Refreshing movie data or video links helps fix loading delays or playback crashes without affecting your bookmarks.
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
                  <Text style={styles.clearBtnText}>Refresh Movie Info & Posters</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.clearBtn, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1 }]}
                onPress={handleClearLinksCache}
                disabled={clearingLinks}
                activeOpacity={0.8}
              >
                {clearingLinks ? (
                  <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                ) : (
                  <Text style={[styles.clearBtnText, { color: theme.colors.textPrimary }]}>Refresh Video Links</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>
      </BlurTargetView>

      {/* Floating Custom Header Bar */}
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
        
        {/* Left Action Button */}
        {canGoBack ? (
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => navigation.goBack()}
          >
            <BlurView 
              intensity={40} 
              tint="dark" 
              style={styles.navButtonBlur}
            >
              <Ionicons 
                name="arrow-back" 
                size={20} 
                color={theme.colors.textPrimary} 
              />
            </BlurView>
          </TouchableOpacity>
        ) : (
          <View style={styles.navButton} />
        )}
        
        <Text style={styles.headerTitle}>Settings</Text>
        
        {/* Right Spacer for visual balance */}
        <View style={styles.headerSpacer} />
      </Animated.View>

      {/* Custom Reusable Confirmation Modal */}
      <CustomModal
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmBtnText}
        onConfirm={confirmAction}
        glowColors={confirmGlowColors}
        iconName={confirmIconName}
        iconColor={confirmIconColor}
        iconBgColor={confirmIconBg}
        confirmDestructive={confirmTitle.includes('Info') || confirmTitle.includes('Posters') || confirmTitle.includes('Cache')}
      />

      {/* Custom Reusable Success/Error Modal */}
      <CustomModal
        visible={successVisible}
        onClose={() => setSuccessVisible(false)}
        title={successTitle}
        message={successMessage}
        glowColors={successGlowColors}
        iconName={successIconName}
        iconColor={successIconColor}
        iconBgColor={successIconBg}
      />

      {/* Premium Edge Fades */}
      <LinearGradient
        colors={["#050505", "rgba(5, 5, 5, 0.8)", "transparent"]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 15,
          zIndex: 45,
        }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["transparent", "rgba(5, 5, 5, 0.85)", "#050505"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 100,
          zIndex: 45,
        }}
        pointerEvents="none"
      />
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
  clearBtn: {
    backgroundColor: theme.colors.roseBorder,
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
  sliderContainer: {
    marginVertical: 8,
  },
  sliderTrackWrapper: {
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 10,
  },
  sliderInactiveTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sliderActiveTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
    position: 'absolute',
  },
  sliderCheckpointTouchTarget: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -18,
    zIndex: 10,
  },
  sliderCheckpoint: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  sliderCheckpointPassed: {
    backgroundColor: theme.colors.accent,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: theme.colors.accent,
    marginLeft: -12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    zIndex: 20,
  },
  sliderLabelsRow: {
    height: 24,
    position: 'relative',
    marginTop: 6,
    marginHorizontal: 10,
  },
  sliderLabelBtn: {
    position: 'absolute',
    width: 60,
    marginLeft: -30,
    alignItems: 'center',
  },
  sliderShortLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sliderShortLabelActive: {
    color: theme.colors.accentLight,
    fontWeight: '800',
  },
  sliderDescBox: {
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  sliderDescHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sliderDescTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sliderDescBadge: {
    backgroundColor: 'rgba(0, 71, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 71, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sliderDescBadgeText: {
    color: theme.colors.accentLight,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sliderDescText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
