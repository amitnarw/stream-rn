import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import type { MediaItem } from "../types/plugin";

interface RecommendationCardProps {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
}

export default function RecommendationCard({
  item,
  onPress,
}: RecommendationCardProps) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    onPress(item);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withTiming(0.94, { duration: 150 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      style={{ marginRight: 12, width: 100 }}
    >
      <Animated.View style={animatedStyle}>
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl, cache: "force-cache" }}
            style={styles.recPoster}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.recPoster, styles.recPlaceholder]} />
        )}
        <Text style={styles.recTitle} numberOfLines={2}>
          {item.title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recPoster: {
    width: 100,
    height: 150,
    borderRadius: 12,
    backgroundColor: "#1f1f22",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  recPlaceholder: {
    backgroundColor: "#1f1f22",
  },
  recTitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 6,
    lineHeight: 16,
  },
});
