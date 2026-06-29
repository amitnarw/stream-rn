import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Image,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MediaItem } from "../types/plugin";
import type { CardLayout } from "../context/TransitionContext";
import { useTransition } from "../context/TransitionContext";
import { theme } from "../theme";

interface HeroCardProps {
  item: MediaItem;
  index: number;
  scrollX: Animated.Value;
  onPress: (item: MediaItem, layout: CardLayout, index: number) => void;
  heroSnap: number;
  heroCardWidth: number;
  heroCardHeight: number;
  genreSets: string[][];
}

export const HeroCard = React.memo(function HeroCard({
  item,
  index,
  scrollX,
  onPress,
  heroSnap,
  heroCardWidth,
  heroCardHeight,
  genreSets,
}: HeroCardProps) {
  const viewRef = useRef<any>(null);
  const pressScale = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const { phase, item: activeItem } = useTransition();
  const isTarget = activeItem !== null && activeItem.url === item.url;

  useEffect(() => {
    if (isTarget) {
      if (phase === 'opening' || phase === 'open') {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      } else if (phase === 'idle') {
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } else {
      overlayOpacity.setValue(1);
    }
  }, [phase, isTarget]);

  const inputRange = [
    (index - 1) * heroSnap,
    index * heroSnap,
    (index + 1) * heroSnap,
  ];

  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.85, 1.0, 0.85],
    extrapolate: "clamp",
  });

  const fadeOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.5, 1.0, 0.5],
    extrapolate: "clamp",
  });

  const combinedScale = Animated.multiply(scale, pressScale);

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
        onPress(item, { x: px, y: py, width, height, borderRadius: 28 }, index);
      },
    );
  }

  const tags = genreSets[index % genreSets.length];

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() =>
        Animated.spring(pressScale, {
          toValue: 0.95,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(pressScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 0,
        }).start()
      }
      style={{
        width: heroSnap,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
      }}
    >
      <View
        ref={viewRef}
        style={{
          overflow: "visible",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale: combinedScale }],
            opacity: fadeOpacity,
            width: heroCardWidth,
            height: heroCardHeight,
            overflow: "visible",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Main Poster Card */}
          <View style={[styles.heroCard, { width: heroCardWidth, height: heroCardHeight }]}>
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={styles.heroPosterImg}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroPosterFallback} />
            )}

            {/* Soft inner bottom shadow for readability and metadata */}
            <Animated.View 
              style={[
                StyleSheet.absoluteFillObject, 
                { opacity: overlayOpacity }
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={["transparent", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 1)"]}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 150,
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingBottom: 24,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={[styles.heroYear, { marginBottom: 6 }]}>2023</Text>
                <Text
                  style={[styles.heroTitle, { fontSize: 20, marginBottom: 12 }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <View style={[styles.chipsRow, { marginBottom: 0 }]}>
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{tags[0]}</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{tags[1]}</Text>
                  </View>
                  <View style={[styles.chip, styles.chipStar]}>
                    <Text style={styles.chipStarTxt}>{"\u2605"} {tags[2]}</Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: theme.colors.placeholder,
  },
  heroPosterImg: { width: "100%", height: "100%" },
  heroPosterFallback: { flex: 1, backgroundColor: theme.colors.placeholder },
  heroYear: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  chipTxt: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  chipStar: { borderColor: "rgba(255,196,0,0.5)" },
  chipStarTxt: { color: "#fbbf24", fontSize: 12, fontWeight: "600" },
});
