import React from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Play } from "lucide-react-native";
import type { EpisodeItem } from "../types/plugin";

interface HeroEpisodeRowProps {
  ep: EpisodeItem;
  index: number;
  playingEpisode: number | null;
  playEpisode: (ep: EpisodeItem, index: number) => void;
  posterUrl: string | undefined;
  isSerial: boolean;
  title: string;
  fallbackDuration?: number | null;
}

const HeroEpisodeRow = React.memo(
  function HeroEpisodeRow({
    ep,
    index,
    playingEpisode,
    playEpisode,
    posterUrl,
    isSerial,
    title,
    fallbackDuration,
  }: HeroEpisodeRowProps) {
    return (
      <TouchableOpacity
        style={styles.episodeRow}
        disabled={playingEpisode !== null}
        onPress={() => playEpisode(ep, index)}
        activeOpacity={0.8}
      >
        <View style={styles.episodeThumbContainer}>
          <Image
            source={{
              uri: ep.image || posterUrl || undefined,
              cache: "force-cache",
            }}
            style={styles.episodeThumb}
            resizeMode="cover"
          />
          <View style={styles.playIconOverlay}>
            {playingEpisode === index ? (
              <BlurView
                intensity={90}
                tint="dark"
                style={styles.playIconGlassBlur}
              >
                <ActivityIndicator color="#fff" size="small" />
              </BlurView>
            ) : (
              <BlurView
                intensity={90}
                tint="dark"
                style={styles.playIconGlassBlur}
              >
                <Play size={20} color="white" fill="white" />
              </BlurView>
            )}
          </View>
        </View>

        <View style={styles.episodeInfo}>
          {isSerial && (
            <Text style={styles.episodeMeta}>
              Episode {String(ep.episode).padStart(2, "0")}
              {ep.runtime || fallbackDuration
                ? ` • ${ep.runtime || fallbackDuration}m`
                : ""}
            </Text>
          )}
          <Text style={styles.episodeTitle} numberOfLines={2}>
            {ep.label || (isSerial ? `Episode ${ep.episode}` : title)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) => {
    const wasPlaying = prev.playingEpisode === prev.index;
    const isPlaying = next.playingEpisode === next.index;
    return (
      wasPlaying === isPlaying &&
      prev.ep.mediaRef === next.ep.mediaRef &&
      prev.posterUrl === next.posterUrl &&
      prev.isSerial === next.isSerial
    );
  }
);

export default HeroEpisodeRow;

const styles = StyleSheet.create({
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  episodeThumbContainer: {
    width: 160,
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1f1f22",
  },
  episodeThumb: {
    width: "100%",
    height: "100%",
    opacity: 0.8,
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playIconGlassBlur: {
    width: 40,
    height: 40,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  episodeInfo: {
    flex: 1,
    paddingLeft: 16,
    justifyContent: "center",
  },
  episodeMeta: {
    color: "#A0A0A5",
    fontSize: 12,
    marginBottom: 6,
  },
  episodeTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
});
