import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, ArrowLeft } from 'lucide-react-native';
import type { MediaItem } from '../types/plugin';
import { getFavorites, subscribeFavorites, removeFavorite } from '../api/favorites';
import MediaCard from '../components/MediaCard';
import QuickScrollFab from '../components/QuickScrollFab';
import { theme } from '../theme';
import { useTransition, useTransitionActions, CardLayout } from '../context/TransitionContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  navigation: any;
  isFocused?: boolean;
}

export default function FavoritesScreen({ navigation, isFocused }: Props) {
  const insets = useSafeAreaInsets();
  const { phase } = useTransition();
  const { setGlobalBlurTarget, openFromCard } = useTransitionActions();
  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const flatListRef = useRef<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = useCallback((val: any) => {
    if (val !== blurTargetRef.current) {
      blurTargetRef.current = val;
      setBlurTarget(val);
      setGlobalBlurTarget(val);
    }
  }, [setGlobalBlurTarget]);
  
  const scrollY = useRef(new Animated.Value(0)).current;

  const loadFavorites = useCallback(async () => {
    const list = await getFavorites();
    setFavorites(list);
  }, []);

  // Reload when tab focus changes (isFocused prop) or on mount
  useEffect(() => {
    if (isFocused !== false) {
      loadFavorites();
    }
  }, [isFocused, loadFavorites]);

  // Reload favorites whenever screen comes into focus via navigation stack
  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      setGlobalBlurTarget(blurTargetRef.current);
    }, [loadFavorites, setGlobalBlurTarget])
  );

  // Subscribe to real-time favorites updates across the app
  useEffect(() => {
    const unsubscribe = subscribeFavorites((updatedList) => {
      setFavorites(updatedList);
    });
    return unsubscribe;
  }, []);

  function onMediaPress(item: MediaItem, layout: CardLayout) {
    openFromCard(item, layout);
  }

  const handleDeleteFavorite = useCallback(async (item: MediaItem) => {
    await removeFavorite(item.url);
  }, []);

  const handleScrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleScrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

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
        {/* We use FlatList inside the BlurTargetView so it can be blurred by the header bar */}
        <Animated.FlatList
          ref={flatListRef}
          data={favorites}
          keyExtractor={(item) => item.url}
          contentContainerStyle={[
            styles.grid,
            {
              paddingTop: Math.max(insets.top, 16) + 70,
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
            <MediaCard
              item={item}
              onPress={onMediaPress}
              onDelete={handleDeleteFavorite}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Heart size={48} color="rgba(255, 74, 125, 0.6)" strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>Your Favorites is Empty</Text>
              <Text style={styles.emptyText}>
                Tap the heart icon on any movie or show detail page to add it to your collection.
              </Text>
            </View>
          }
        />
      </BlurTargetView>

      {/* Floating Capsule Header */}
      <Animated.View style={[
        styles.headerBar,
        {
          top: Math.max(insets.top - 4, 8),
          shadowOpacity: headerBgOpacity,
        }
      ]}>
        {/* Animated Background blur capsule */}
        <Animated.View style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: headerBgOpacity,
            borderRadius: 24,
            overflow: 'hidden',
          }
        ]}>
          <BlurView 
            intensity={100} 
            tint="dark" 
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
        </Animated.View>
        
        <View style={styles.headerSpacer} />

        <Text style={styles.headerTitle}>Favorites</Text>

        <View style={styles.headerSpacer} />
      </Animated.View>

      {/* Quick Scroll To Top / Bottom FAB */}
      {favorites.length > 0 && (
        <QuickScrollFab
          onScrollToTop={handleScrollToTop}
          onScrollToBottom={handleScrollToBottom}
          bottomOffset={100}
          rightOffset={20}
        />
      )}

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
    backgroundColor: '#050505',
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  grid: {
    paddingHorizontal: 12,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: SCREEN_HEIGHT * 0.15,
  },
  emptyIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 74, 125, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 74, 125, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    color: '#8E8D92',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
