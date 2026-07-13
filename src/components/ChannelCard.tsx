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
import { Heart } from 'lucide-react-native';
import type { MediaItem } from '../types/plugin';
import { theme } from '../theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

interface Props {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
  isSaved: boolean;
  onToggleSave: (item: MediaItem) => void;
  width?: number;
  style?: any;
}

export default function ChannelCard({ item, onPress, isSaved, onToggleSave, width: propWidth, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const cardWidth = propWidth || CARD_WIDTH;
  const cardHeight = cardWidth; // 1:1 aspect ratio!

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
      style={[styles.card, { width: cardWidth }, style]}
    >
      <Animated.View style={[styles.posterContainer, { width: cardWidth, height: cardHeight, transform: [{ scale }] }]}>
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={[styles.logo, { width: cardWidth - 24, height: cardHeight - 24 }]}
            resizeMode="contain" // Contain fits the logo inside nicely!
          />
        ) : (
          <View style={[styles.logo, styles.placeholder, { width: cardWidth - 24, height: cardHeight - 24 }]}>
            <Text style={styles.placeholderText}>{item.title.substring(0, 2).toUpperCase()}</Text>
          </View>
        )}

        {/* Favorite/Save Toggle Button */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave(item);
          }}
          style={styles.heartBtn}
          hitSlop={8}
        >
          <Heart
            size={14}
            color={isSaved ? theme.colors.rose : 'rgba(255,255,255,0.6)'}
            fill={isSaved ? theme.colors.rose : 'transparent'}
          />
        </Pressable>
      </Animated.View>
      <Text style={[styles.title, { width: cardWidth }]} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    marginHorizontal: 0,
    alignItems: 'center',
  },
  posterContainer: {
    borderRadius: 22,
    backgroundColor: 'rgba(20, 18, 24, 0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logo: {
    borderRadius: 12,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121214',
  },
  placeholderText: {
    color: '#8E8D92',
    fontSize: 20,
    fontWeight: 'bold',
  },
  heartBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(5, 5, 5, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
});
