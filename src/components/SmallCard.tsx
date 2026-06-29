import React, { useRef } from "react";
import {
  View,
  Pressable,
  Animated,
  Image,
  StyleSheet,
  Dimensions,
} from "react-native";
import type { MediaItem } from "../types/plugin";
import type { CardLayout } from "../context/TransitionContext";
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
        const S = 0.93; // Small card press scale
        const sWidth = width * S;
        const sHeight = height * S;
        const sX = px + (width - sWidth) / 2;
        const sY = py + (height - sHeight) / 2;
        onPress(item, {
          x: sX,
          y: sY,
          width: sWidth,
          height: sHeight,
          borderRadius: 12,
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
});
