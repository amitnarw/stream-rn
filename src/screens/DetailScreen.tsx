import React, { useEffect, useState } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, SafeAreaView, FlatList,
} from "react-native";
import type { DetailResult, EpisodeItem, VideoSource } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";

interface Props { route: any }

export default function DetailScreen({ route }: Props) {
  const { providerName, url } = route.params;
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDetail(); }, []);

  async function loadDetail() {
    try {
      const d = await bridge.loadDetail(providerName, url);
      setDetail(d);
      setEpisodes(d.episodes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function onEpisodePress(ep: EpisodeItem) {
    try {
      const links = await bridge.loadLinks(providerName, ep.mediaRef);
      if (links.sources.length > 0) {
      const best = links.sources.reduce((a: VideoSource, b: VideoSource) =>
          parseInt(a.quality) > parseInt(b.quality) ? a : b
        );
        const subUrl = links.subtitles.length > 0 ? links.subtitles[0].url : undefined;
        bridge.playStream(best.url, best.headers, `${detail?.title} - ${ep.label}`, subUrl);
      }
    } catch (e) { console.error(e); }
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
            renderItem={({ item: ep }) => (
              <TouchableOpacity style={styles.episodeRow} onPress={() => onEpisodePress(ep)}>
                <Text style={styles.episodeNum}>{ep.episode}</Text>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle} numberOfLines={2}>{ep.label}</Text>
                  {ep.overview ? <Text style={styles.episodeDesc} numberOfLines={2}>{ep.overview}</Text> : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </ScrollView>
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
  episodeNum: { color: "#e50914", fontSize: 14, fontWeight: "bold", width: 32 },
  episodeInfo: { flex: 1 },
  episodeTitle: { color: "#fff", fontSize: 14 },
  episodeDesc: { color: "#888", fontSize: 12, marginTop: 2 },
  error: { color: "#e50914", textAlign: "center", marginTop: 48, fontSize: 16 },
});
