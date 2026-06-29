import React, { useRef } from "react";
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
import { theme } from "../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const CW_CARD_W = S_CARD_W * 1.2;

interface ContinueCardProps {
  item: any;
  onPress: (item: MediaItem, layout: CardLayout) => void;
}

export const ContinueCard = React.memo(function ContinueCard({
  item,
  onPress,
}: ContinueCardProps) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const pct = Math.min(Math.max((item.position / item.duration) * 100, 0), 100);

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
        const S = 0.93; // Continue card press scale
        const sWidth = width * S;
        const sHeight = height * S;
        const sX = px + (width - sWidth) / 2;
        const sY = py + (height - sHeight) / 2;
        onPress(item as MediaItem, {
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
      style={{ marginRight: 8, width: CW_CARD_W }}
    >
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {/* Overflow hidden container to wrap image + progress bar together */}
          <View style={styles.cardInnerContainer}>
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={styles.cwCardImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.cwCardImg, styles.cardFallback]} />
            )}
            <View style={styles.cwProgressBg}>
              <View
                style={[styles.cwProgressFill, { width: (pct + "%") as any }]}
              />
            </View>
          </View>
          {item.type === "series" && (
            <View style={styles.cwBadge}>
              <Text style={styles.cwBadgeTxt}>
                S{item.season} E{item.episode}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
      <Text style={styles.cwTitle} numberOfLines={1}>
        {item.title || item.videoTitle}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cardInnerContainer: {
    borderRadius: 18, // increased to 18
    overflow: "hidden",
    backgroundColor: theme.colors.placeholder,
    width: CW_CARD_W,
    height: CW_CARD_W * 1.5,
  },
  cwCardImg: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.placeholder,
  },
  cardFallback: { flex: 1, backgroundColor: theme.colors.placeholder },
  cwProgressBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4, // slightly thicker progress bar
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  cwProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.accent, // Primary color
  },
  cwBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(255, 74, 125, 0.85)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cwBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },
  cwTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 },
});
