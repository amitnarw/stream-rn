import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Image,
  StyleSheet,
  Dimensions,
} from "react-native";
import type { MediaItem } from "../types/plugin";
import type { CardLayout } from "../context/TransitionContext";
import { useTransition } from "../context/TransitionContext";
import { theme } from "../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const S_CARD_H = S_CARD_W * 1.5;

interface SmallCardProps {
  item: MediaItem;
  onPress: (item: MediaItem, layout: CardLayout) => void;
}

export const SmallCard = React.memo(function SmallCard({
  item,
  onPress,
}: SmallCardProps) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;

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
        Animated.delay(200),
        Animated.spring(scale, {
          toValue: 0.93,
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

  function handlePress() {
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
        const xOffset = (S_CARD_W - width) / 2;
        const yOffset = (S_CARD_H - height) / 2;
        onPress(item, {
          x: px - xOffset,
          y: py - yOffset,
          width: S_CARD_W,
          height: S_CARD_H,
          borderRadius: 18, // matches styling
        });
      },
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.93,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }).start()
      }
      style={{ marginRight: 8 }}
    >
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={styles.smallCardImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.smallCardImg, styles.cardFallback]} />
          )}
        </Animated.View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  smallCardImg: {
    width: S_CARD_W,
    height: S_CARD_H,
    borderRadius: 18, // increased to 18
    backgroundColor: theme.colors.placeholder,
  },
  cardFallback: { backgroundColor: theme.colors.placeholder },
  cardTitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginTop: 4,
    width: S_CARD_W,
    paddingHorizontal: 2,
  },
});
