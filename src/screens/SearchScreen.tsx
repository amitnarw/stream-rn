import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import MediaCard from '../components/MediaCard';
import { theme } from '../theme';
import { useTransition, useTransitionActions, CardLayout } from '../context/TransitionContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function cleanGeneralError(err: any): string {
  if (!err) return "Something went wrong. Please try again.";
  const msg = err.message || String(err);
  const m = msg.toLowerCase();
  if (m.includes("offline") || m.includes("network") || m.includes("internet")) {
    return "No internet connection. Please check your Wi-Fi or cellular network.";
  }
  if (m.includes("sockettimeoutexception") || m.includes("timeout") || m.includes("connect")) {
    return "The server is taking too long to respond. Tap Retry to try again.";
  }
  if (m.includes("illegalargumentexception") || m.includes("json") || m.includes("nullpointer")) {
    return "We couldn't read the server response. This catalog might be temporarily down.";
  }
  if (m.includes("unresolvedaddress") || m.includes("unknownhost")) {
    return "Access blocked by your network provider. Connecting to a VPN may help.";
  }
  return "Failed to load details. Tap Retry to reload.";
}

interface Props {
  route: any;
  navigation: any;
}

export default function SearchScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { phase } = useTransition();
  const { setGlobalBlurTarget, openFromCard } = useTransitionActions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const unsub = navigation.addListener('focus', () => {
      setGlobalBlurTarget(blurTargetRef.current);
    });
    return unsub;
  }, [navigation, setGlobalBlurTarget]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const items = await bridge.search('Cinemeta', q);
      setResults(items);
      if (items.length === 0) {
        setError('No results found for this search.');
      }
    } catch (e: any) {
      setError(cleanGeneralError(e));
    } finally {
      setLoading(false);
    }
  }

  function onMediaPress(item: MediaItem, layout: CardLayout) {
    openFromCard(item, layout);
  }

  const scrollThreshold = 40;
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, scrollThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Ambient Glow */}
      <LinearGradient
        colors={[theme.colors.accentGlow, 'transparent']}
        style={styles.ambientGlow}
        pointerEvents="none"
      />

      <BlurTargetView ref={setBlurTargetRef as any} style={StyleSheet.absoluteFillObject}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.colors.accentLight} />
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <BlurView intensity={20} tint="dark" style={styles.errorCard}>
              <Ionicons 
                name={error.includes('No results') ? "search-outline" : "wifi-outline"} 
                size={40} 
                color={error.includes('No results') ? "rgba(255,255,255,0.4)" : theme.colors.rose} 
                style={{ marginBottom: 12 }} 
              />
              <Text style={styles.errorTitle}>
                {error.includes('No results') ? "No Results Found" : "Search Error"}
              </Text>
              <Text style={styles.errorText}>{error}</Text>
              {!(error.includes('No results')) && (
                <TouchableOpacity style={styles.retryBtn} onPress={() => doSearch(query)} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              )}
            </BlurView>
          </View>
        ) : (
          <Animated.FlatList
            data={results}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={[
              styles.grid,
              {
                paddingTop: Math.max(insets.top, 16) + 130,
                paddingBottom: 110,
              },
            ]}
            numColumns={3}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <MediaCard item={item} onPress={onMediaPress} />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query ? 'No results' : 'Type at least 3 characters to search'}
              </Text>
            }
          />
        )}
      </BlurTargetView>

      {/* Floating Custom Header Bar (Capsule Blur design matching Settings/Detail) */}
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
            borderRadius: theme.layout.headerRadius || 24,
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
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.overlayTint || 'rgba(15, 15, 20, 0.38)' }]} />
        </Animated.View>
        
        {navigation.canGoBack() ? (
          <TouchableOpacity style={styles.navButton} onPress={() => navigation.goBack()}>
            <BlurView intensity={35} tint="dark" style={styles.navButtonBlur}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </BlurView>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        
        <Text style={styles.headerTitle}>Search</Text>
        
        <View style={styles.headerSpacer} />
      </Animated.View>

      {/* Inset Glass Search Bar (Positioned under header) */}
      <View style={[styles.searchContainer, { top: Math.max(insets.top, 16) + 54 }]}>
        <BlurView intensity={25} tint="dark" style={styles.searchBlur}>
          <TextInput
            style={styles.input}
            placeholder="Search movies & shows..."
            placeholderTextColor="#8e8e93"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setError(null);
              if (text.length > 2) doSearch(text);
            }}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
          />
        </BlurView>
      </View>

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
    backgroundColor: '#050505' 
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    zIndex: 0,
  },
  headerBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 48,
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  searchContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 40,
  },
  searchBlur: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  grid: { 
    paddingHorizontal: 12,
    paddingBottom: 110,
  },
  empty: { 
    color: '#666', 
    textAlign: 'center', 
    marginTop: 180, // Offset so empty text is not covered by search bar
    fontSize: 14 
  },
  centerState: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
    paddingTop: 200, // Offset loader/error from search bar
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 180,
  },
  errorCard: {
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: 'center',
    overflow: 'hidden',
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: { 
    color: '#8E8D92', 
    fontSize: 13, 
    textAlign: 'center', 
    marginBottom: 16, 
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: { 
    color: '#fff', 
    fontSize: 14, 
    fontWeight: 'bold' 
  },
});
