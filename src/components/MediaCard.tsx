import React, { useRef, useEffect } from 'react';
import {
  Pressable,
  Image,
  Text,
  View,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import type { MediaItem } from '../types/plugin';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

import type { CardLayout } from '../context/TransitionContext';
import { useTransition } from '../context/TransitionContext';

interface Props {
  item: MediaItem;
  onPress: (item: MediaItem, layout: CardLayout) => void;
  width?: number;
  style?: any;
}

export default function MediaCard({ item, onPress, width: propWidth, style }: Props) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const cardWidth = propWidth || CARD_WIDTH;
  const cardHeight = cardWidth * 1.5;

  const { phase, item: activeItem } = useTransition();
  const wasTargetRef = useRef(false);
  const isTarget = activeItem !== null && activeItem.url === item.url;

  useEffect(() => {
    if (isTarget) {
      wasTargetRef.current = true;
    }
    if (phase === 'closing' && wasTargetRef.current) {
      wasTargetRef.current = false;
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(scale, {
          toValue: 0.94,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }),
        Animated.spring(scale, {
          toValue: 1.0,
          useNativeDriver: true,
          speed: 35,
          bounciness: 8,
        }),
      ]).start();
    }
  }, [phase, isTarget]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const handlePress = () => {
    viewRef.current?.measure(
      (
        _fx: number,
        _fy: number,
        width: number,
        height: number,
        px: number,
        py: number,
      ) => {
        // Recover exact unscaled resting dimensions to prevent size jump at animation end
        const targetHeight = cardWidth * 1.5;
        const xOffset = (cardWidth - width) / 2;
        const yOffset = (targetHeight - height) / 2;
        onPress(item, {
          x: px - xOffset,
          y: py - yOffset,
          width: cardWidth,
          height: targetHeight,
          borderRadius: 22, // matches styling
        });
      }
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { width: cardWidth }, style]}
    >
      {/* viewRef only wraps the poster so measure() captures poster-only bounds.
          Title is outside the Animated.View so it never participates in the
          scale transform — prevents layout reflow / size-correction flash. */}
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={[styles.poster, { width: cardWidth, height: cardHeight }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.poster, styles.placeholder, { width: cardWidth, height: cardHeight }]}>
              <Text style={styles.placeholderText}>?</Text>
            </View>
          )}
        </Animated.View>
      </View>
      <Text style={[styles.title, { width: cardWidth }]} numberOfLines={2}>
        {item.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginBottom: 16,
    marginHorizontal: 6,
  },
  cardContent: {
    width: '100%',
  },
  poster: {
    borderRadius: 22, // increased to 22
    backgroundColor: '#1c1b1c',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#8e8e93',
    fontSize: 32,
  },
  title: {
    color: 'rgba(229, 226, 227, 0.8)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    paddingHorizontal: 2,
    lineHeight: 15,
    textAlign: 'center',
  },
});
