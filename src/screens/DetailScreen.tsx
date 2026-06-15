import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, SafeAreaView, FlatList,
  Modal, Alert, Animated, Dimensions, Pressable,
} from "react-native";
import type { DetailResult, EpisodeItem, VideoSource } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props { route: any }

export default function DetailScreen({ route }: Props) {
  const { providerName, url } = route.params;
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingEpisode, setPlayingEpisode] = useState<number | null>(null);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => { loadDetail(); }, []);

  useEffect(() => {
    if (showSourcePicker) {
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      sheetAnim.setValue(SCREEN_HEIGHT);
    }
  }, [showSourcePicker]);

  async function loadDetail() {
    try {
      const d = await bridge.loadDetail(providerName, url);
      setDetail(d);
      setEpisodes(d.episodes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function getResolution(q: string): number {
    const match = q.match(/(\d{3,4})p?/);
    return match ? parseInt(match[1]) : 0;
  }

  async function onEpisodePress(ep: EpisodeItem, index: number) {
    setPlayingEpisode(index);
    try {
      const result = await bridge.loadLinks(providerName, ep.mediaRef);
      setSources(result.sources);
      setSubtitles(result.subtitles);
      setSelectedSourceIndex(0);
      if (result.sources.length === 0) {
        Alert.alert("No sources found", "No playable sources available for this episode.");
        setPlayingEpisode(null);
        return;
      }
      setShowSourcePicker(true);
    } catch (e) {
      console.error(e);
      setPlayingEpisode(null);
    }
  }

  function onSourceSelect(index: number) {
    setSelectedSourceIndex(index);
    setShowSourcePicker(false);
    setPlayingEpisode(null);
    const source = sources[index];
    const subUrl = subtitles.length > 0 ? subtitles[0].url : "";
    const title = `${detail?.title} - ${episodes.find((_, i) => playingEpisode === i)?.label ?? ""}`;
    bridge.playStream(
      source.url, source.headers, title, subUrl,
      sources.map(s => ({ quality: s.quality, url: s.url, type: s.type, headers: s.headers })),
      subtitles,
    );
  }

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color="#fff" /></SafeAreaView>;
  }
  if (!detail) {
    return <SafeAreaView style={styles.container}><Text style={styles.error}>Failed to load details</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Image source={{ uri: detail.banner || detail.posterUrl || undefined }} style={styles.banner} resizeMode="cover" />
        <View style={styles.info}>
          <Text style={styles.title}>{detail.title}</Text>
          {detail.year ? <Text style={styles.year}>{detail.year}</Text> : null}
          {detail.description ? <Text style={styles.desc}>{detail.description}</Text> : null}
        </View>
        <Text style={styles.sectionTitle}>Episodes</Text>
        {episodes.length === 0 ? (
          <Text style={styles.empty}>No episodes</Text>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(_, i) => String(i)}
            scrollEnabled={false}
            renderItem={({ item: ep, index }) => (
              <TouchableOpacity style={[styles.episodeRow, playingEpisode === index && styles.episodePlaying]} onPress={() => onEpisodePress(ep, index)} disabled={playingEpisode !== null}>
                <Text style={styles.episodeNum}>{ep.episode}</Text>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle} numberOfLines={2}>{ep.label}</Text>
                  {ep.overview ? <Text style={styles.episodeDesc} numberOfLines={2}>{ep.overview}</Text> : null}
                </View>
                {playingEpisode === index && <ActivityIndicator size="small" color="#E50914" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            )}
          />
        )}
      </ScrollView>

      <Modal visible={showSourcePicker} transparent animationType="none" onRequestClose={() => { setShowSourcePicker(false); setPlayingEpisode(null); }}>
        <Pressable style={styles.sheetOverlay} onPress={() => { setShowSourcePicker(false); setPlayingEpisode(null); }}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Select Source</Text>
              {sources.length > 0 ? (
                <FlatList
                  data={sources}
                  keyExtractor={(_, i) => String(i)}
                  style={styles.sheetList}
                  renderItem={({ item: source, index }) => (
                    <TouchableOpacity style={styles.sheetRow} onPress={() => onSourceSelect(index)}>
                      <View style={styles.sheetRadio}>
                        {selectedSourceIndex === index ? <View style={styles.sheetRadioDot} /> : null}
                      </View>
                      <View style={styles.sheetRowInfo}>
                        <View style={styles.sheetQualityRow}>
                          <Text style={styles.sheetQuality}>{source.quality}</Text>
                          <View style={styles.sheetBadge}>
                            <Text style={styles.sheetBadgeText}>{source.type?.toUpperCase() ?? "DIRECT"}</Text>
                          </View>
                        </View>
                        <Text style={styles.sheetHost}>{source.type ?? "Unknown"}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <ActivityIndicator size="large" color="#E50914" style={{ marginVertical: 40 }} />
              )}
              {subtitles.length > 0 && (
                <View style={styles.sheetSubRow}>
                  <Text style={styles.sheetSubLabel}>Subtitles available: </Text>
                  <Text style={styles.sheetSubLangs}>{subtitles.map(s => s.lang).join(", ")}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  banner: { width: "100%", height: 240 },
  info: { padding: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  year: { color: "#888", fontSize: 14, marginBottom: 8 },
  desc: { color: "#ccc", fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", paddingHorizontal: 16, marginBottom: 8 },
  empty: { color: "#666", textAlign: "center", padding: 24 },
  episodeRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#333" },
  episodePlaying: { backgroundColor: "#1a1a2e" },
  episodeNum: { color: "#e50914", fontSize: 14, fontWeight: "bold", width: 32 },
  episodeInfo: { flex: 1 },
  episodeTitle: { color: "#fff", fontSize: 14 },
  episodeDesc: { color: "#888", fontSize: 12, marginTop: 2 },
  error: { color: "#e50914", textAlign: "center", marginTop: 48, fontSize: 16 },
  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: "#1a1a1a", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#555", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8 },
  sheetTitle: { color: "#fff", fontSize: 20, fontWeight: "bold", paddingHorizontal: 20, paddingVertical: 12 },
  sheetList: { maxHeight: SCREEN_HEIGHT * 0.35 },
  sheetRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#222" },
  sheetRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#E50914", alignItems: "center", justifyContent: "center", marginRight: 14 },
  sheetRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#E50914" },
  sheetRowInfo: { flex: 1 },
  sheetQualityRow: { flexDirection: "row", alignItems: "center" },
  sheetQuality: { color: "#fff", fontSize: 16, fontWeight: "600", marginRight: 8 },
  sheetBadge: { backgroundColor: "#E50914", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  sheetBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  sheetHost: { color: "#888", fontSize: 12, marginTop: 2 },
  sheetSubRow: { flexDirection: "row", paddingHorizontal: 20, paddingTop: 16 },
  sheetSubLabel: { color: "#888", fontSize: 13 },
  sheetSubLangs: { color: "#E50914", fontSize: 13, fontWeight: "600" },
});
