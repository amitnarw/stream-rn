import React, { useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MediaItem } from "../types/plugin";
import type { CardLayout } from "../context/TransitionContext";
import { theme } from "../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const CW_CARD_W = S_CARD_W * 1.2;

interface ContinueCardProps {
  item: any;
  onPress: (item: MediaItem, layout: CardLayout) => void;
  onDelete?: (id: string) => void;
  width?: number;
}

export const ContinueCard = React.memo(function ContinueCard({
  item,
  onPress,
  onDelete,
  width,
}: ContinueCardProps) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const pct = Math.min(Math.max((item.position / item.duration) * 100, 0), 100);
  const cardWidth = width ?? CW_CARD_W;

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
      style={{ marginRight: 8, width: cardWidth }}
    >
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {/* Overflow hidden container to wrap image + progress bar together */}
          <View style={[styles.cardInnerContainer, { width: cardWidth, height: cardWidth * 1.5 }]}>
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={styles.cwCardImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.cwCardImg, styles.cardFallback]} />
            )}

            {/* Custom delete from history button */}
            {onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete(item.imdbId);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={13} color="#ffffff" />
              </TouchableOpacity>
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
  deleteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15, 15, 20, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
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
    top: 8,
    left: 8,
    backgroundColor: "rgba(15, 15, 20, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  cwBadgeTxt: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cwTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 },
});
