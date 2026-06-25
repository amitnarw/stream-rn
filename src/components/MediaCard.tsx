import React, { useRef } from 'react';
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

interface Props {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
}

export default function MediaCard({ item, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

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

  return (
    <Pressable
      onPress={() => onPress(item)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.card}
    >
      <Animated.View style={[styles.cardContent, { transform: [{ scale }] }]}>
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={styles.poster}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.poster, styles.placeholder]}>
            <Text style={styles.placeholderText}>?</Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </Animated.View>
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
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.5,
    borderRadius: 16,
    backgroundColor: '#1c1b1c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  placeholderText: {
    color: '#8e8e93',
    fontSize: 32,
  },
  title: {
    color: '#e5e2e3',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    paddingHorizontal: 2,
    lineHeight: 16,
  },
});
