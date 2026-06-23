import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, FlatList,
  Modal, Alert, Animated, Dimensions, Pressable, Linking,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import YoutubeIframe from 'react-native-youtube-iframe';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

  // Season state
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

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
      if (d.episodes && d.episodes.length > 0) {
        // Find first available season or default to 1
        const firstSeason = d.episodes[0].season || 1;
        setSelectedSeason(firstSeason);
      }
    } catch (e: any) {
      const msg = e instanceof bridge.OfflineError
        ? 'No internet connection. Please check your network.'
        : e.message || 'Failed to load details. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
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
          <YoutubeIframe
            videoId={youtubeId}
            height={SCREEN_HEIGHT * 0.46}
            play={trailerPlaying}
          />
          <TouchableOpacity style={styles.closeTrailerBtn} onPress={onCloseTrailer}>
            <BlurView intensity={50} tint="dark" style={styles.closeTrailerBlur}>
              <Text style={styles.closeTrailerText}>✕</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.bannerContainer}>
        {/* Ambient Gradient Glow */}
        <LinearGradient
          colors={['rgba(189, 92, 255, 0.25)', 'transparent']}
          style={styles.ambientGlow}
          pointerEvents="none"
        />

        <Image
          source={{ uri: detail?.banner || detail?.posterUrl || undefined }}
          style={styles.banner}
          resizeMode="cover"
        />
        
        {/* Dark overlay gradients */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', '#050505']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Custom Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
              <Text style={styles.backButtonText}>←</Text>
            </BlurView>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TV Series Details</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Video Play Trailer Button overlay */}
        {detail?.trailers && detail.trailers.length > 0 && (
          <TouchableOpacity style={styles.playTrailerBtn} onPress={onTrailerPress}>
            <BlurView intensity={30} tint="light" style={styles.playTrailerBlur}>
              <Text style={styles.playTrailerBtnText}>▶ Play Trailer</Text>
            </BlurView>
          </TouchableOpacity>
        )}

        {/* Metadata Pill */}
        <View style={styles.metadataPillContainer}>
          <BlurView intensity={50} tint="dark" style={styles.metadataPill}>
            <Text style={styles.metadataText}>{detail?.year || '2026'}</Text>
            <View style={styles.pillDot} />
            <Text style={styles.metadataText}>
              {detail?.duration 
                ? `${Math.floor(detail.duration / 60)}h ${detail.duration % 60}m` 
                : detail?.isSerial ? 'Series' : '2h'}
            </Text>
            <View style={styles.pillDot} />
            <Text style={styles.metadataText}>CC</Text>
            <View style={styles.pillDot} />
            <Text style={styles.metadataText}>4K</Text>
          </BlurView>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#e3b5ff" />
          <Text style={styles.loadingText}>Loading Details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error || 'Failed to load details'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDetail}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Get unique seasons in episodes list
  const seasons = Array.from(new Set(episodes.map(ep => ep.season || 1))).sort((a, b) => a - b);
  // Filter episodes based on selected season
  const filteredEpisodes = detail.isSerial 
    ? episodes.filter(ep => (ep.season || 1) === selectedSeason)
    : episodes;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top Section: Hero Banner / Trailer */}
      {renderTopArea()}

      {/* Details Bottom Sheet (Frosted Glassmorphic) */}
      <View style={styles.bottomSheet}>
        <BlurView intensity={90} tint="dark" style={styles.blurSheet}>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
          >
            {/* Title & Season Trigger */}
            <Text style={styles.detailTitle}>{detail.title}</Text>
            
            {detail.isSerial && seasons.length > 1 && (
              <TouchableOpacity style={styles.seasonSelector} onPress={() => setShowSeasonPicker(true)}>
                <Text style={styles.seasonText}>Season {selectedSeason}</Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>
            )}

            {/* Description */}
            {detail.description ? (
              <Text style={styles.description}>{detail.description}</Text>
            ) : null}

            {/* Genre & Rating Metadata */}
            <View style={styles.genreRow}>
              <Text style={styles.genres}>
                {detail.tags && detail.tags.length > 0 ? detail.tags.join(', ') : 'Sci-Fi, Drama'}
              </Text>
              {detail.score ? (
                <View style={styles.imdbRow}>
                  <View style={styles.imdbBadge}>
                    <Text style={styles.imdbText}>IMDb</Text>
                  </View>
                  <Text style={styles.scoreText}>{detail.score}</Text>
                </View>
              ) : null}
            </View>

            {/* Cast Section */}
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

            {/* Links Error */}
            {linksError && (
              <View style={styles.linksErrorContainer}>
                <Text style={styles.linksErrorText}>{linksError}</Text>
              </View>
            )}

            {/* Episodes List Section */}
            <Text style={styles.sectionTitle}>
              {detail.isSerial ? 'Episodes' : 'Play Video'}
            </Text>

            {filteredEpisodes.length === 0 ? (
              <Text style={styles.empty}>No episodes available</Text>
            ) : (
              <View style={styles.episodesContainer}>
                {filteredEpisodes.map((ep, index) => {
                  const originalIndex = episodes.findIndex(e => e.mediaRef === ep.mediaRef);
                  return (
                    <TouchableOpacity
                      key={ep.mediaRef + '-' + index}
                      style={[
                        styles.episodeRow,
                        playingEpisode === originalIndex && styles.episodePlaying
                      ]}
                      onPress={() => onEpisodePress(ep, originalIndex)}
                      disabled={playingEpisode !== null}
                    >
                      {/* Left: Thumbnail Layout */}
                      <View style={styles.episodeThumbnailContainer}>
                        <Image
                          source={{ uri: ep.image || detail.posterUrl || undefined }}
                          style={styles.episodeThumbnail}
                          resizeMode="cover"
                        />
                        {/* Play overlay badge */}
                        <View style={styles.episodePlayOverlay}>
                          <BlurView intensity={30} tint="light" style={styles.episodePlayCircle}>
                            <Text style={styles.playArrow}>▶</Text>
                          </BlurView>
                        </View>
                      </View>

                      {/* Middle: Title, synopsis and metadata */}
                      <View style={styles.episodeInfo}>
                        <Text style={styles.episodeMeta}>Episode {ep.episode}</Text>
                        <Text style={styles.episodeTitle} numberOfLines={1}>{ep.label}</Text>
                        {ep.overview ? (
                          <Text style={styles.episodeDesc} numberOfLines={2}>{ep.overview}</Text>
                        ) : null}
                      </View>

                      {/* Right: Action Button */}
                      <View style={styles.episodeActionCol}>
                        {playingEpisode === originalIndex ? (
                          <ActivityIndicator size="small" color="#e3b5ff" />
                        ) : (
                          <View style={styles.downloadIconCircle}>
                            <Text style={styles.downloadIcon}>↓</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Recommendations Section */}
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
        </BlurView>
      </View>

      {/* Source Picker Modal (Glassmorphic) */}
      <Modal 
        visible={showSourcePicker} 
        transparent 
        animationType="none" 
        onRequestClose={() => { setShowSourcePicker(false); setPlayingEpisode(null); }}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => { setShowSourcePicker(false); setPlayingEpisode(null); }}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
            <BlurView intensity={95} tint="dark" style={styles.sheetBlur}>
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
                  <ActivityIndicator size="large" color="#e3b5ff" style={{ marginVertical: 40 }} />
                )}
                {subtitles.length > 0 && (
                  <View style={styles.sheetSubRow}>
                    <Text style={styles.sheetSubLabel}>Subtitles available: </Text>
                    <Text style={styles.sheetSubLangs}>{subtitles.map(s => s.lang).join(", ")}</Text>
                  </View>
                )}
              </Pressable>
            </BlurView>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Season Picker Modal */}
      <Modal
        visible={showSeasonPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeasonPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSeasonPicker(false)}>
          <View style={styles.seasonPickerContainer}>
            <BlurView intensity={90} tint="dark" style={styles.seasonPickerBlur}>
              <Text style={styles.seasonPickerTitle}>Select Season</Text>
              <ScrollView style={styles.seasonScroll}>
                {seasons.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.seasonRowButton,
                      selectedSeason === s && styles.seasonRowButtonActive
                    ]}
                    onPress={() => {
                      setSelectedSeason(s);
                      setShowSeasonPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.seasonRowText,
                      selectedSeason === s && styles.seasonRowTextActive
                    ]}>
                      Season {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </BlurView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#050505" 
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#050505',
  },
  centerState: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    padding: 24 
  },
  loadingText: {
    color: '#e5e2e3',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  errorText: { 
    color: "#ffb4ab", 
    fontSize: 15, 
    textAlign: "center", 
    marginBottom: 16, 
    lineHeight: 22 
  },
  retryBtn: { 
    backgroundColor: "#bd5cff", 
    paddingHorizontal: 32, 
    paddingVertical: 12, 
    borderRadius: 24 
  },
  retryBtnText: { 
    color: "#fff", 
    fontSize: 15, 
    fontWeight: "bold" 
  },

  // Ambient Glow
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    zIndex: 1,
  },

  // Hero Area
  bannerContainer: { 
    position: "relative", 
    width: "100%", 
    height: SCREEN_HEIGHT * 0.46 
  },
  banner: { 
    width: "100%", 
    height: "100%" 
  },
  headerBar: {
    position: 'absolute',
    top: 36,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  backButtonBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playTrailerBtn: {
    position: "absolute", 
    top: "35%", 
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  playTrailerBlur: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playTrailerBtnText: { 
    color: "#fff", 
    fontSize: 14, 
    fontWeight: '600'
  },

  // Metadata Pill
  metadataPillContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.05,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  metadataPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metadataText: {
    color: '#e5e2e3',
    fontSize: 12,
    fontWeight: '600',
  },
  pillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 8,
  },

  // Trailer Player
  trailerContainer: { 
    position: "relative", 
    width: "100%", 
    height: SCREEN_HEIGHT * 0.46,
    backgroundColor: '#000'
  },
  closeTrailerBtn: {
    position: "absolute", 
    top: 36, 
    right: 20, 
    zIndex: 20,
    width: 32, 
    height: 32, 
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeTrailerBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTrailerText: { 
    color: "#fff", 
    fontSize: 14, 
    fontWeight: "bold" 
  },

  // Details Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.43,
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0,
  },
  blurSheet: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  detailTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  seasonSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  seasonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    marginLeft: 6,
  },
  description: {
    color: '#A0A0A5',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  genreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  genres: {
    color: '#A0A0A5',
    fontSize: 13,
    marginRight: 10,
  },
  imdbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imdbBadge: {
    backgroundColor: '#F5C518',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 4,
  },
  imdbText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
  scoreText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Cast List
  section: { 
    marginBottom: 24 
  },
  sectionTitle: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "800", 
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  castList: { 
    paddingRight: 12 
  },
  castCard: { 
    width: 80, 
    alignItems: "center", 
    marginRight: 12 
  },
  castImage: { 
    width: 52, 
    height: 52, 
    borderRadius: 26, 
    marginBottom: 6,
    backgroundColor: '#1c1b1c',
  },
  castPlaceholder: { 
    backgroundColor: "#201f20", 
    alignItems: "center", 
    justifyContent: "center",
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  castInitials: { 
    color: "#e3b5ff", 
    fontSize: 14, 
    fontWeight: "bold" 
  },
  castName: { 
    color: "#fff", 
    fontSize: 11, 
    textAlign: "center" 
  },
  castRole: { 
    color: "#888", 
    fontSize: 10, 
    textAlign: "center", 
    marginTop: 1 
  },

  // Episode List
  episodesContainer: {
    marginBottom: 24,
  },
  empty: { 
    color: "#666", 
    textAlign: "center", 
    padding: 24,
    fontSize: 14 
  },
  episodeRow: { 
    flexDirection: "row", 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: "rgba(255,255,255,0.05)",
    alignItems: "center"
  },
  episodePlaying: { 
    backgroundColor: "rgba(189, 92, 255, 0.08)" 
  },
  episodeThumbnailContainer: {
    width: 120,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#201f20',
  },
  episodeThumbnail: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  episodePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePlayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playArrow: {
    color: '#fff',
    fontSize: 10,
    marginLeft: 2,
  },
  episodeInfo: { 
    flex: 1,
    paddingHorizontal: 12,
  },
  episodeMeta: {
    color: '#A0A0A5',
    fontSize: 11,
    marginBottom: 2,
  },
  episodeTitle: { 
    color: "#fff", 
    fontSize: 14,
    fontWeight: '600',
  },
  episodeDesc: { 
    color: "#888", 
    fontSize: 11, 
    marginTop: 4,
    lineHeight: 14 
  },
  episodeActionCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIcon: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  linksErrorContainer: { 
    paddingHorizontal: 16, 
    marginBottom: 8 
  },
  linksErrorText: { 
    color: "#ffb4ab", 
    fontSize: 13, 
    textAlign: "center" 
  },

  // Source Picker Bottom Sheet
  sheetOverlay: { 
    flex: 1, 
    justifyContent: "flex-end", 
    backgroundColor: "rgba(0,0,0,0.6)" 
  },
  sheet: { 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    maxHeight: SCREEN_HEIGHT * 0.6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 0,
  },
  sheetBlur: {
    paddingBottom: 36,
  },
  sheetHandle: { 
    width: 40, 
    height: 4, 
    backgroundColor: "rgba(255,255,255,0.2)", 
    borderRadius: 2, 
    alignSelf: "center", 
    marginTop: 12, 
    marginBottom: 8 
  },
  sheetTitle: { 
    color: "#fff", 
    fontSize: 20, 
    fontWeight: "800", 
    paddingHorizontal: 20, 
    paddingVertical: 12 
  },
  sheetList: { 
    maxHeight: SCREEN_HEIGHT * 0.35 
  },
  sheetRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 20, 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: "rgba(255,255,255,0.04)" 
  },
  sheetRadio: { 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    borderWidth: 2, 
    borderColor: "#bd5cff", 
    alignItems: "center", 
    justifyContent: "center", 
    marginRight: 14 
  },
  sheetRadioDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: "#bd5cff" 
  },
  sheetRowInfo: { 
    flex: 1 
  },
  sheetQualityRow: { 
    flexDirection: "row", 
    alignItems: "center" 
  },
  sheetQuality: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "600", 
    marginRight: 8 
  },
  sheetBadge: { 
    backgroundColor: "#bd5cff", 
    borderRadius: 4, 
    paddingHorizontal: 6, 
    paddingVertical: 1 
  },
  sheetBadgeText: { 
    color: "#fff", 
    fontSize: 10, 
    fontWeight: "bold" 
  },
  sheetHost: { 
    color: "#888", 
    fontSize: 12, 
    marginTop: 2 
  },
  sheetSubRow: { 
    flexDirection: "row", 
    paddingHorizontal: 20, 
    paddingTop: 16 
  },
  sheetSubLabel: { 
    color: "#888", 
    fontSize: 13 
  },
  sheetSubLangs: { 
    color: "#bd5cff", 
    fontSize: 13, 
    fontWeight: "600" 
  },

  // Season Picker Modal Layout
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonPickerContainer: {
    width: SCREEN_WIDTH * 0.8,
    maxHeight: SCREEN_HEIGHT * 0.5,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  seasonPickerBlur: {
    padding: 24,
  },
  seasonPickerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  seasonScroll: {
    maxHeight: SCREEN_HEIGHT * 0.35,
  },
  seasonRowButton: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  seasonRowButtonActive: {
    backgroundColor: 'rgba(189, 92, 255, 0.1)',
    borderRadius: 8,
  },
  seasonRowText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
  seasonRowTextActive: {
    color: '#e3b5ff',
    fontWeight: '700',
  },

  // Recommendations
  recList: { 
    paddingRight: 12 
  },
  recCard: { 
    width: (SCREEN_WIDTH - 64) / 3, 
    marginRight: 12 
  },
  recPoster: { 
    width: "100%", 
    height: ((SCREEN_WIDTH - 64) / 3) * 1.5, 
    borderRadius: 12, 
    backgroundColor: "#1c1b1c",
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  recPlaceholder: { 
    alignItems: "center", 
    justifyContent: "center" 
  },
  recPlaceholderText: { 
    color: "#666", 
    fontSize: 24 
  },
  recTitle: { 
    color: "#e5e2e3", 
    fontSize: 11, 
    fontWeight: '500',
    marginTop: 6,
    lineHeight: 14,
  },
});
