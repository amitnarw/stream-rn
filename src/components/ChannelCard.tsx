import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Image,
  Text,
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Heart } from 'lucide-react-native';
import type { MediaItem } from '../types/plugin';
import { theme } from '../theme';
import AppIconPlaceholder from './AppIconPlaceholder';

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

const ChannelCard = React.memo(function ChannelCard({ item, onPress, isSaved, onToggleSave, width: propWidth, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const cardWidth = propWidth || CARD_WIDTH;
  const cardHeight = cardWidth; // 1:1 aspect ratio!
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    // Reset state when item changes
    setImageError(false);
    setImageLoaded(false);
    imageOpacity.setValue(0);
  }, [item.url]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const showImage = !!item.posterUrl && !imageError;
  const showSkeleton = showImage && !imageLoaded;

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth, cardWidth],
  });

  const logoBoxStyle = {
    width: cardWidth - 24,
    height: cardHeight - 24,
  };

  return (
    <Pressable
      onPress={() => onPress(item)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { width: cardWidth }, style]}
    >
      <Animated.View style={[styles.posterContainer, { width: cardWidth, height: cardHeight, transform: [{ scale }] }]}>
        {showImage ? (
          <Animated.Image
            source={{ uri: item.posterUrl ?? undefined }}
            style={[styles.logo, { ...logoBoxStyle, opacity: imageOpacity }]}
            resizeMode="contain"
            onLoad={() => {
              setImageLoaded(true);
              Animated.timing(imageOpacity, {
                toValue: 1,
                duration: 320,
                useNativeDriver: true,
              }).start();
            }}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.logo, styles.placeholder, logoBoxStyle]}>
            <AppIconPlaceholder size={Math.min(cardWidth, cardHeight) * 0.4} />
          </View>
        )}

        {showSkeleton ? (
          <View style={[styles.skeletonBase, logoBoxStyle]}>
            <Animated.View
              style={[
                styles.skeletonShimmer,
                {
                  width: cardWidth,
                  transform: [{ translateX: shimmerTranslate }],
                },
              ]}
            />
          </View>
        ) : null}

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
});

export default ChannelCard;

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
  skeletonBase: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  skeletonShimmer: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    opacity: 0.55,
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
