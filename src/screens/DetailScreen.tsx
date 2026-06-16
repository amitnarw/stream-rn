import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, FlatList,
  Modal, Alert, Animated, Dimensions, Pressable, Linking,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import YoutubeIframe from 'react-native-youtube-iframe';
import type { DetailResult, EpisodeItem, VideoSource, Trailer, Actor } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

interface Props { route: any; navigation: any }

export default function DetailScreen({ route, navigation }: Props) {
  const { providerName, url } = route.params;
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<number | null>(null);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [linksError, setLinksError] = useState<string | null>(null);
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Trailer state
  const [activeTrailer, setActiveTrailer] = useState<Trailer | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      const d = await bridge.loadDetail(providerName, url);
      setDetail(d);
      setEpisodes(d.episodes);
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Failed to load details. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function getResolution(q: string): number {
    const match = q.match(/(\d{3,4})p?/);
    return match ? parseInt(match[1]) : 0;
  }

  async function onEpisodePress(ep: EpisodeItem, index: number) {
    setPlayingEpisode(index);
    setLinksError(null);
    try {
      const result = await bridge.loadLinks(providerName, ep.mediaRef);
      setSources(result.sources);
      setSubtitles(result.subtitles);
      setSelectedSourceIndex(0);
      setShowSourcePicker(true);
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Failed to load playable links.';
      setLinksError(msg);
      setPlayingEpisode(null);
    }
  }

  function onSourceSelect(index: number) {
    setSelectedSourceIndex(index);
    setShowSourcePicker(false);
    setPlayingEpisode(null);
    const source = sources[index];
    const subUrl = subtitles.length > 0 ? subtitles[0].url : "";
    const currentEp = episodes.find((_, i) => playingEpisode === i);
    const title = `${detail?.title} - ${currentEp?.label ?? ""}`;
    const episodesPayload = episodes.map(e => ({
      episode: e.episode,
      label: e.label,
      mediaRef: e.mediaRef,
      season: e.season,
    }));
    bridge.playStream(
      source.url, source.headers, title, subUrl,
      sources.map(s => ({ quality: s.quality, url: s.url, type: s.type, headers: s.headers })),
      subtitles,
      JSON.stringify(episodesPayload),
      playingEpisode ?? -1,
    );
  }

  // === Trailer handlers ===
  function onTrailerPress() {
    if (!detail?.trailers || detail.trailers.length === 0) return;
    if (detail.trailers.length === 1) {
      playTrailer(detail.trailers[0]);
    } else {
      const buttons = detail.trailers.map((t, i) => ({
        text: `Trailer ${i + 1}${extractYoutubeId(t.url) ? ' • YouTube' : ''}`,
        onPress: () => playTrailer(t),
      }));
      Alert.alert('Choose Trailer', undefined, [...buttons, { text: 'Cancel', style: 'cancel' }]);
    }
  }

  function playTrailer(trailer: Trailer) {
    const youtubeId = extractYoutubeId(trailer.url);
    if (youtubeId) {
      setActiveTrailer(trailer);
      setTrailerPlaying(true);
    } else if (trailer.raw) {
      bridge.playStream(trailer.url, {}, detail?.title ?? '');
    } else {
      Linking.openURL(trailer.url);
    }
  }

  function onCloseTrailer() {
    setTrailerPlaying(false);
    setActiveTrailer(null);
  }

  // === Cast render helper ===
  function renderCastItem({ item }: { item: Actor }) {
    const initials = item.name.split(' ').map((s: string) => s[0]).join('').toUpperCase().slice(0, 2);
    return (
      <View style={styles.castCard}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.castImage} />
        ) : (
          <View style={[styles.castImage, styles.castPlaceholder]}>
            <Text style={styles.castInitials}>{initials}</Text>
          </View>
        )}
        <Text style={styles.castName} numberOfLines={1}>{item.name}</Text>
        {item.role ? <Text style={styles.castRole} numberOfLines={1}>{item.role}</Text> : null}
      </View>
    );
  }

  // === Top area: banner or trailer player ===
  function renderTopArea() {
    const youtubeId = activeTrailer ? extractYoutubeId(activeTrailer.url) : null;

    if (youtubeId && activeTrailer) {
      return (
        <View style={styles.trailerContainer}>
          <TouchableOpacity style={styles.closeTrailerBtn} onPress={onCloseTrailer}>
            <Text style={styles.closeTrailerText}>✕</Text>
          </TouchableOpacity>
          <YoutubeIframe
            videoId={youtubeId}
            height={240}
            play={trailerPlaying}
          />
        </View>
      );
    }

    return (
      <View style={styles.bannerContainer}>
        <Image
          source={{ uri: detail?.banner || detail?.posterUrl || undefined }}
          style={styles.banner}
          resizeMode="cover"
        />
        {detail?.trailers && detail.trailers.length > 0 && (
          <TouchableOpacity style={styles.playTrailerBtn} onPress={onTrailerPress}>
            <Text style={styles.playTrailerBtnText}>▶</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDetail}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>Failed to load details</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDetail}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Top: Banner or Trailer Player */}
        {renderTopArea()}

        {/* Title & Metadata */}
        <View style={styles.info}>
          <Text style={styles.title}>{detail.title}</Text>
          <View style={styles.metaRow}>
            {detail.year ? <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{detail.year}</Text></View> : null}
            {detail.score ? <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>★ {detail.score}</Text></View> : null}
            {detail.duration ? (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{Math.floor(detail.duration / 60)}h {detail.duration % 60}m</Text>
              </View>
            ) : null}
            {detail.contentRating ? <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{detail.contentRating}</Text></View> : null}
          </View>
        </View>

        {/* Tags / Genres */}
        {detail.tags && detail.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {detail.tags.map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {detail.description ? <Text style={styles.desc}>{detail.description}</Text> : null}

        {/* Cast */}
        {detail.cast && detail.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <FlatList
              data={detail.cast}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.castList}
              renderItem={renderCastItem}
            />
          </View>
        )}

        {/* Episodes / Play */}
        <Text style={styles.sectionTitle}>
          {detail.isSerial ? 'Episodes' : 'Play'}
        </Text>
        {linksError && (
          <View style={styles.linksErrorContainer}>
            <Text style={styles.linksErrorText}>{linksError}</Text>
          </View>
        )}
        {episodes.length === 0 ? (
          <Text style={styles.empty}>No content available</Text>
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(_, i) => String(i)}
            scrollEnabled={false}
            renderItem={({ item: ep, index }) => (
              <TouchableOpacity
                style={[styles.episodeRow, playingEpisode === index && styles.episodePlaying]}
                onPress={() => onEpisodePress(ep, index)}
                disabled={playingEpisode !== null}
              >
                <View style={styles.episodeNumCol}>
                  <Text style={styles.episodeNum}>{ep.episode}</Text>
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle} numberOfLines={2}>{ep.label}</Text>
                  {ep.overview ? <Text style={styles.episodeDesc} numberOfLines={2}>{ep.overview}</Text> : null}
                </View>
                {playingEpisode === index && <ActivityIndicator size="small" color="#E50914" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            )}
          />
        )}

        {/* Recommendations */}
        {detail.recommendations && detail.recommendations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More Like This</Text>
            <FlatList
              data={detail.recommendations}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.recList}
              renderItem={({ item }) => (
                <View style={styles.recCard}>
                  <TouchableOpacity
                    onPress={() => navigation.push('Detail', {
                      providerName: item.provider,
                      url: item.url,
                    })}
                  >
                    {item.posterUrl ? (
                      <Image source={{ uri: item.posterUrl }} style={styles.recPoster} resizeMode="cover" />
                    ) : (
                      <View style={[styles.recPoster, styles.recPlaceholder]}>
                        <Text style={styles.recPlaceholderText}>?</Text>
                      </View>
                    )}
                    <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
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

  // Banner
  bannerContainer: { position: "relative", width: "100%", height: 240 },
  banner: { width: "100%", height: 240 },
  playTrailerBtn: {
    position: "absolute", top: "50%", left: "50%",
    marginLeft: -32, marginTop: -32,
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center", justifyContent: "center",
  },
  playTrailerBtnText: { color: "#fff", fontSize: 24, marginLeft: 4 },

  // Trailer Player
  trailerContainer: { position: "relative", width: "100%", height: 240 },
  closeTrailerBtn: {
    position: "absolute", top: 8, right: 8, zIndex: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  closeTrailerText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  // Info
  info: { padding: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  metaBadge: {
    backgroundColor: "#333", borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 2,
    marginRight: 6, marginBottom: 4,
  },
  metaBadgeText: { color: "#ccc", fontSize: 12 },

  // Tags
  tagsRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginBottom: 12 },
  tag: {
    backgroundColor: "#2a2a2a", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    marginRight: 6, marginBottom: 4,
  },
  tagText: { color: "#aaa", fontSize: 12 },

  // Description
  desc: { color: "#ccc", fontSize: 14, lineHeight: 20, paddingHorizontal: 16, marginBottom: 16 },

  // Section
  section: { marginBottom: 16 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", paddingHorizontal: 16, marginBottom: 8 },

  // Cast
  castList: { paddingHorizontal: 12 },
  castCard: { width: 90, alignItems: "center", marginHorizontal: 4 },
  castImage: { width: 56, height: 56, borderRadius: 28, marginBottom: 4 },
  castPlaceholder: { backgroundColor: "#444", alignItems: "center", justifyContent: "center" },
  castInitials: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  castName: { color: "#fff", fontSize: 11, textAlign: "center" },
  castRole: { color: "#888", fontSize: 10, textAlign: "center", marginTop: 1 },

  // Episodes
  empty: { color: "#666", textAlign: "center", padding: 24 },
  episodeRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#333" },
  episodePlaying: { backgroundColor: "#1a1a2e" },
  episodeNumCol: { width: 32, justifyContent: "center" },
  episodeNum: { color: "#e50914", fontSize: 14, fontWeight: "bold" },
  episodeInfo: { flex: 1 },
  episodeTitle: { color: "#fff", fontSize: 14 },
  episodeDesc: { color: "#888", fontSize: 12, marginTop: 2 },

  // Error & Retry
  errorText: { color: "#e50914", fontSize: 15, textAlign: "center", marginBottom: 16, lineHeight: 22 },
  centerState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  retryBtn: { backgroundColor: "#e50914", paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  retryBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  linksErrorContainer: { paddingHorizontal: 16, marginBottom: 8 },
  linksErrorText: { color: "#e50914", fontSize: 13, textAlign: "center" },

  // Source Picker Modal
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

  // Recommendations
  recList: { paddingHorizontal: 12 },
  recCard: { width: (SCREEN_WIDTH - 64) / 3, marginRight: 8 },
  recPoster: { width: "100%", height: ((SCREEN_WIDTH - 64) / 3) * 1.5, borderRadius: 6, backgroundColor: "#222" },
  recPlaceholder: { alignItems: "center", justifyContent: "center" },
  recPlaceholderText: { color: "#666", fontSize: 24 },
  recTitle: { color: "#fff", fontSize: 11, marginTop: 4 },
});
