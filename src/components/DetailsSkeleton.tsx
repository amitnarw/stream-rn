import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolateColor,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { styles } from "../screens/DetailScreen.styles";

export function DetailsSkeleton() {
  const pulseValue = useSharedValue(0);

  useEffect(() => {
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 800 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      pulseValue.value,
      [0, 1],
      ["rgba(255,255,255,0.035)", "rgba(255,255,255,0.095)"],
    );
    return {
      backgroundColor,
    };
  });

  return (
    <View style={styles.skeletonContainer}>
      {/* Title skeleton */}
      <Animated.View style={[styles.skeletonTitle, animatedStyle]} />

      {/* Season Pill skeleton */}
      <Animated.View style={[styles.skeletonSeason, animatedStyle]} />

      {/* Tags row skeleton */}
      <View style={styles.skeletonTagsRow}>
        <Animated.View style={[styles.skeletonTag, animatedStyle]} />
        <Animated.View
          style={[styles.skeletonTag, { width: 60 }, animatedStyle]}
        />
        <Animated.View
          style={[styles.skeletonTag, { width: 50 }, animatedStyle]}
        />
      </View>

      {/* Description lines skeleton */}
      <Animated.View
        style={[styles.skeletonText, { width: "100%" }, animatedStyle]}
      />
      <Animated.View
        style={[styles.skeletonText, { width: "90%" }, animatedStyle]}
      />
      <Animated.View
        style={[
          styles.skeletonText,
          { width: "55%", marginBottom: 32 },
          animatedStyle,
        ]}
      />

      {/* Episode Header skeleton */}
      <Animated.View style={[styles.skeletonHeader, animatedStyle]} />

      {/* Episode rows skeleton */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Animated.View style={[styles.skeletonThumb, animatedStyle]} />
          <View style={styles.skeletonMetaWrap}>
            <Animated.View style={[styles.skeletonMeta, animatedStyle]} />
            <Animated.View style={[styles.skeletonLine, animatedStyle]} />
            <Animated.View style={[styles.skeletonDescLine, animatedStyle]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default DetailsSkeleton;
