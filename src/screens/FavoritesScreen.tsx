import React, { useState, useCallback, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { MediaItem } from '../types/plugin';
import { getFavorites } from '../api/favorites';
import MediaCard from '../components/MediaCard';
import { theme } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  navigation: any;
}

export default function FavoritesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = (val: any) => {
    blurTargetRef.current = val;
    if (val !== blurTarget) {
      setBlurTarget(val);
    }
  };
  
  const scrollY = useRef(new Animated.Value(0)).current;

  // Reload favorites whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      async function loadFavorites() {
        const list = await getFavorites();
        setFavorites(list);
      }
      loadFavorites();
    }, [])
  );

  function onMediaPress(item: MediaItem) {
    navigation.navigate('Detail', {
      providerName: item.provider || 'Cinemeta',
      url: item.url,
    });
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
        {/* We use FlatList inside the BlurTargetView so it can be blurred by the header bar */}
        <Animated.FlatList
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
            <MediaCard item={item} onPress={onMediaPress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="heart-dislike-outline" size={48} color="rgba(255, 74, 125, 0.6)" />
              </View>
              <Text style={styles.emptyTitle}>Your Favorites is Empty</Text>
              <Text style={styles.emptyText}>
                Tap the heart icon in the top right corner of any movie or show detail page to add it to your favorites.
              </Text>
            </View>
          }
        />
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
            borderRadius: 24,
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
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
        </Animated.View>
        
        {/* Balanced spacer on left (matches settings back button shape/width) */}
        <View style={styles.headerSpacer} />
        
        <Text style={styles.headerTitle}>Favorites</Text>
        
        <View style={styles.headerSpacer} />
      </Animated.View>
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
