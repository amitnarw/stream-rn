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
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  RotateCw,
  CheckCircle,
  XCircle,
  Link,
  Trash2,
  Terminal,
  Copy,
  Search,
  X,
  FileText,
  Tv,
  ChevronDown
} from 'lucide-react-native';
import { Clipboard } from 'react-native';
import * as bridge from '../api/cloudStreamBridge';
import {
  getAvailableIPTVProviders,
  getDefaultIPTVProvider,
  setDefaultIPTVProvider
} from '../api/cloudStreamBridge';
import type { PluginProvider } from '../types/plugin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme';
import { useTransitionActions } from '../context/TransitionContext';
import { CustomModal } from '../components/CustomModal';
import ProviderPickerSheet from '../components/ProviderPickerSheet';
import { subscribeLogs, clearLogs, exportLogsAsString, LogEntry } from '../utils/logger';

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
  const [playerMode, setPlayerMode] = useState<'inbuilt' | 'external'>('inbuilt');
  const [clearing, setClearing] = useState(false);
  const [clearingLinks, setClearingLinks] = useState(false);

  // Default IPTV provider state
  const [iptvProviders, setIptvProviders] = useState<{
    m3u: PluginProvider[];
    cs: PluginProvider[];
  }>({ m3u: [], cs: [] });
  const [defaultIptvProvider, setDefaultIptvProviderState] = useState<string>('First Available');
  const [showIptvSheet, setShowIptvSheet] = useState(false);

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
  const [confirmGlowColors, setConfirmGlowColors] = useState<readonly [string, string, ...string[]]>(['transparent', 'transparent']);
  const [confirmIcon, setConfirmIcon] = useState<React.ComponentType<any>>(() => Trash2);
  const [confirmIconColor, setConfirmIconColor] = useState<string>('#ffffff');
  const [confirmIconBg, setConfirmIconBg] = useState<string>('rgba(255,255,255,0.1)');

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [successGlowColors, setSuccessGlowColors] = useState<readonly [string, string, ...string[]]>(['transparent', 'transparent']);
  const [successIcon, setSuccessIcon] = useState<React.ComponentType<any>>(() => CheckCircle);
  const [successIconColor, setSuccessIconColor] = useState<string>('#2ecc71');
  const [successIconBg, setSuccessIconBg] = useState<string>('rgba(46, 204, 113, 0.1)');

  // Developer Logs Modal State
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'plugin' | 'error' | 'network'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCurrentSettings();
    loadIptvSettings();
    const unsub = navigation.addListener('focus', () => {
      setGlobalBlurTarget(blurTargetRef.current);
    });
    const unsubLogs = subscribeLogs((logs) => {
      setLogsList(logs);
    });
    return () => {
      unsub();
      unsubLogs();
    };
  }, [navigation, setGlobalBlurTarget]);

  async function loadIptvSettings() {
    try {
      const list = await getAvailableIPTVProviders();
      setIptvProviders(list);
      const saved = await getDefaultIPTVProvider();
      setDefaultIptvProviderState(saved || 'First Available');
    } catch (_) {
      // ignore
    }
  }

  async function handleSetDefaultProvider(name: string) {
    await setDefaultIPTVProvider(name);
    setDefaultIptvProviderState(name);
  }

  const handleCopyLogs = () => {
    const text = exportLogsAsString();
    try {
      Clipboard.setString(text);
    } catch (_) {}
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleClearLogs = () => {
    clearLogs();
  };

  const filteredLogs = logsList.filter(item => {
    if (logFilter === 'plugin') {
      if (!item.tag.toLowerCase().includes('plugin') && !item.message.toLowerCase().includes('plugin')) return false;
    } else if (logFilter === 'error') {
      if (item.level !== 'error' && !item.message.toLowerCase().includes('error')) return false;
    } else if (logFilter === 'network') {
      if (!item.tag.toLowerCase().includes('addon') && !item.message.toLowerCase().includes('fetch') && !item.message.toLowerCase().includes('http')) return false;
    }
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      return (
        item.message.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q) ||
        item.timestamp.includes(q)
      );
    }
    return true;
  });

  async function loadCurrentSettings() {
    try {
      const settings = await bridge.getSettings();
      setSelectedHomeTtl(settings.mainPageTtl);
      setSelectedDetailTtl(settings.detailsTtl);
      setSelectedLinksTtl(settings.linksTtl);
      
      const savedMode = await AsyncStorage.getItem('@sozo_player_mode');
      if (savedMode === 'external') {
        setPlayerMode('external');
      } else {
        setPlayerMode('inbuilt');
      }
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

  async function handlePlayerModeChange(mode: 'inbuilt' | 'external') {
    setPlayerMode(mode);
    try {
      await AsyncStorage.setItem('@sozo_player_mode', mode);
    } catch (e) {
      console.warn('Failed to save player mode:', e);
    }
  }

  const triggerConfirmModal = (
    title: string,
    message: string,
    btnText: string,
    glowColors: readonly [string, string, ...string[]],
    iconComponent: React.ComponentType<any>,
    iconColor: string,
    iconBgColor: string,
    action: () => void
  ) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmBtnText(btnText);
    setConfirmGlowColors(glowColors);
    setConfirmIcon(() => iconComponent);
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
      setSuccessIcon(() => XCircle);
      setSuccessIconColor(theme.colors.rose);
      setSuccessIconBg('rgba(255, 74, 125, 0.1)');
    } else {
      setSuccessGlowColors(['rgba(46, 204, 113, 0.15)', 'transparent']);
      setSuccessIcon(() => CheckCircle);
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
      RotateCw,
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
      Link,
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

          {/* Video Player Mode Settings Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Video Player Mode</Text>
            <Text style={styles.cardDescription}>
              Choose whether to play video streams using the app's inbuilt premium media player or launch them in an external third-party video player (like VLC or MX Player).
            </Text>
            <View style={styles.playerModeOptions}>
              <TouchableOpacity
                style={[
                  styles.modeOptionBtn,
                  playerMode === 'inbuilt' && styles.modeOptionBtnActive,
                ]}
                onPress={() => handlePlayerModeChange('inbuilt')}
                activeOpacity={0.8}
              >
                {playerMode === 'inbuilt' ? (
                  <CheckCircle size={18} color={theme.colors.accentLight} style={{ marginRight: 8 }} />
                ) : (
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', marginRight: 8 }} />
                )}
                <Text style={[styles.modeOptionText, playerMode === 'inbuilt' && styles.modeOptionTextActive]}>
                  Inbuilt Player
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeOptionBtn,
                  playerMode === 'external' && styles.modeOptionBtnActive,
                ]}
                onPress={() => handlePlayerModeChange('external')}
                activeOpacity={0.8}
              >
                {playerMode === 'external' ? (
                  <CheckCircle size={18} color={theme.colors.accentLight} style={{ marginRight: 8 }} />
                ) : (
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', marginRight: 8 }} />
                )}
                <Text style={[styles.modeOptionText, playerMode === 'external' && styles.modeOptionTextActive]}>
                  External Player
                </Text>
              </TouchableOpacity>
            </View>
           </View>

           {/* Default IPTV Provider Card */}
           <View style={styles.card}>
             <View style={styles.cardHeaderRow}>
               <Text style={styles.cardTitle}>Default IPTV Provider</Text>
               <View style={styles.iptvBadge}>
                 <Text style={styles.iptvBadgeText}>LIVE TV</Text>
               </View>
             </View>
             <Text style={styles.cardDescription}>
               Choose which IPTV source loads automatically when you open the Live TV screen. You can still switch providers anytime from the bottom sheet picker.
             </Text>
             <TouchableOpacity
               style={styles.iptvSelector}
               onPress={() => setShowIptvSheet(true)}
               activeOpacity={0.8}
             >
               <View style={styles.iptvSelectorLeft}>
                 <View style={styles.iptvSelectorIcon}>
                   <Tv size={16} color={theme.colors.accentLight} />
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.iptvSelectorLabel}>CURRENT PROVIDER</Text>
                   <Text style={styles.iptvSelectorName} numberOfLines={1}>
                     {defaultIptvProvider}
                   </Text>
                 </View>
               </View>
               <ChevronDown size={18} color="#fff" />
             </TouchableOpacity>
             {defaultIptvProvider === 'First Available' && (
               <Text style={styles.iptvHint}>
                 No default saved yet ,  Live TV opens the first available source.
               </Text>
             )}
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

          {/* Developer Diagnostics Card (Dev Only) */}
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.cardTitle}>Developer Diagnostics</Text>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>DEV ONLY</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Inspect live application execution logs, plugin search traces, network responses, and background errors directly inside the app.
            </Text>
            <TouchableOpacity
              style={styles.devLogsBtn}
              onPress={() => setShowLogsModal(true)}
              activeOpacity={0.8}
            >
              <Terminal size={18} color="#5580FF" style={{ marginRight: 8 }} />
              <Text style={styles.devLogsBtnText}>View Real-Time Logs ({logsList.length})</Text>
            </TouchableOpacity>
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
              <ArrowLeft 
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
        Icon={confirmIcon}
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
        Icon={successIcon}
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
      {/* Developer Logs Modal (Dev Only) */}
      <Modal
        visible={showLogsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLogsModal(false)}
      >
        <View style={styles.logsModalBackdrop}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.logsModalContainer}>
              {/* Header */}
              <View style={styles.logsModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.logsTerminalIconBadge}>
                    <Terminal size={18} color="#5580FF" />
                  </View>
                  <View>
                    <Text style={styles.logsModalTitle}>Developer Logs</Text>
                    <Text style={styles.logsModalSubtitle}>{filteredLogs.length} entries</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.logsHeaderBtn}
                    onPress={handleCopyLogs}
                    activeOpacity={0.7}
                  >
                    {copiedLogs ? (
                      <CheckCircle size={16} color="#4ADE80" />
                    ) : (
                      <Copy size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.logsHeaderBtn}
                    onPress={handleClearLogs}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={16} color={theme.colors.rose} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.logsHeaderBtn}
                    onPress={() => setShowLogsModal(false)}
                    activeOpacity={0.7}
                  >
                    <X size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Filter Tabs Bar */}
              <View style={styles.logsFilterRow}>
                {(['all', 'plugin', 'error', 'network'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.logsFilterChip, logFilter === tab && styles.logsFilterChipActive]}
                    onPress={() => setLogFilter(tab)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.logsFilterText, logFilter === tab && styles.logsFilterTextActive]}>
                      {tab.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Search Bar */}
              <View style={styles.logsSearchBox}>
                <Search size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.logsSearchInput}
                  placeholder="Filter logs by keyword, provider, error..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={logSearchQuery}
                  onChangeText={setLogSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {logSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setLogSearchQuery('')}>
                    <XCircle size={16} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Terminal Container */}
              <View style={styles.terminalContainer}>
                <Animated.ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ padding: 12 }}>
                  {filteredLogs.length === 0 ? (
                    <Text style={styles.emptyLogsText}>No logs match current filter.</Text>
                  ) : (
                    filteredLogs.map(item => (
                      <View key={item.id} style={styles.logLineRow}>
                        <Text style={styles.logTimestamp}>{item.timestamp}</Text>
                        <Text style={[
                          styles.logLevelBadge,
                          item.level === 'error' && styles.logLevelError,
                          item.level === 'warn' && styles.logLevelWarn,
                        ]}>
                          [{item.level.toUpperCase()}]
                        </Text>
                        <Text style={styles.logTag}>[{item.tag}]</Text>
                        <Text style={[
                          styles.logMessageText,
                          item.level === 'error' && { color: '#FF7B9C' },
                          item.level === 'warn' && { color: '#FFE066' },
                        ]}>
                          {item.message}
                        </Text>
                      </View>
                    ))
                  )}
                </Animated.ScrollView>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Default IPTV Provider picker */}
      <ProviderPickerSheet
        visible={showIptvSheet}
        onClose={() => setShowIptvSheet(false)}
        m3uProviders={iptvProviders.m3u}
        csProviders={iptvProviders.cs}
        activeProvider={
          defaultIptvProvider === 'First Available' ? null : defaultIptvProvider
        }
        onSelect={(name) => handleSetDefaultProvider(name)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
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
  playerModeOptions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modeOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeOptionBtnActive: {
    backgroundColor: 'rgba(0, 71, 255, 0.08)',
    borderColor: 'rgba(0, 71, 255, 0.25)',
  },
  modeOptionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  modeOptionTextActive: {
    color: '#ffffff',
  },
  devBadge: {
    backgroundColor: 'rgba(85, 128, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85, 128, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  devBadgeText: {
    color: '#5580FF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  devLogsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(85, 128, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85, 128, 255, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  devLogsBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  logsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 8, 0.85)',
  },
  logsModalContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  logsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  logsTerminalIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(85, 128, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(85, 128, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logsModalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logsModalSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  logsHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logsFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logsFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  logsFilterChipActive: {
    backgroundColor: 'rgba(85, 128, 255, 0.2)',
    borderColor: '#5580FF',
  },
  logsFilterText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  logsFilterTextActive: {
    color: '#ffffff',
  },
  logsSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 38,
  },
  logsSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 0,
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#050508',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  emptyLogsText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  logLineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 4,
    alignItems: 'flex-start',
  },
  logTimestamp: {
    color: '#666670',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 10,
  },
  logLevelBadge: {
    color: '#5580FF',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 10,
    fontWeight: '700',
  },
  logLevelWarn: {
    color: '#FFE066',
  },
  logLevelError: {
    color: '#FF7B9C',
  },
  logTag: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 10,
    fontWeight: '700',
  },
  logMessageText: {
    color: '#D0D0D5',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  // Default IPTV Provider card
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iptvBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 71, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 71, 255, 0.3)',
  },
  iptvBadgeText: {
    color: theme.colors.accentLight,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  iptvSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 8,
  },
  iptvSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iptvSelectorIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 71, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0, 71, 255, 0.4)',
  },
  iptvSelectorLabel: {
    color: '#8E8D92',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
    marginBottom: 2,
  },
  iptvSelectorName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  iptvHint: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
  },
});
