import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import type { MediaItem } from '../types/plugin';
import MediaCard from '../components/MediaCard';
import { useTransition, useTransitionActions } from '../context/TransitionContext';
import type { CardLayout } from '../context/TransitionContext';
import { theme } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 3;

interface Props {
  route: any;
  navigation: any;
}

export default function SeeAllScreen({ route, navigation }: Props) {
  const { title, items } = route.params || { title: 'Collection', items: [] };
  const { phase } = useTransition();
  const { openFromCard } = useTransitionActions();
  const [isReady, setIsReady] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const handle = requestIdleCallback(() => {
      setIsReady(true);
    });
    return () => cancelIdleCallback(handle);
  }, []);

  const handleMediaPress = (item: MediaItem, layout: CardLayout) => {
    openFromCard(item, layout);
  };

  const scrollThreshold = 80;
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

      {/* Floating Custom Header Bar (Oval/Capsule) */}
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
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
        </Animated.View>

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BlurView 
            intensity={40} 
            tint="dark" 
            style={styles.backButtonBlur}
          >
            <Text style={styles.backButtonText}>←</Text>
          </BlurView>
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>

        <View style={{ width: 36, height: 36 }} />
      </Animated.View>

      {/* Grid of items */}
      {!isReady ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      ) : (
        <Animated.FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={[
            styles.grid,
            {
              paddingTop: Math.max(insets.top, 16) + 60,
              paddingBottom: 40,
            }
          ]}
          numColumns={3}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <MediaCard item={item} onPress={handleMediaPress} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No items found in this section.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  backButtonBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginRight: 36, // offset to center title due to back button
  },
  grid: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 16,
  },
});
