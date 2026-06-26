import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, FlatList,
  Alert, Animated, Dimensions, Pressable, Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubeIframe from 'react-native-youtube-iframe';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as favoritesApi from '../api/favorites';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import type { DetailResult, EpisodeItem, VideoSource, Trailer, Actor } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function getHighQualityImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  
  // 1. Metahub images - upgrade medium/small to large
  if (url.includes("images.metahub.space")) {
    return url.replace("/medium/", "/large/").replace("/small/", "/large/");
  }
  
  // 2. TMDB images - upgrade any size (e.g. w500, w300_and_h450_bestv2) to w1280
  if (url.includes("image.tmdb.org/t/p/")) {
    return url.replace(/\/t\/p\/[^/]+\//, "/t/p/w1280/");
  }
  
  // 3. IMDb / Amazon images - remove cropping and upgrade size
  if (url.includes("media-amazon.com/images/") || url.includes("m.media-amazon.com/")) {
    const index = url.indexOf("._V1_");
    if (index !== -1) {
      return url.substring(0, index) + "._V1_SX1080_.jpg";
    }
  }

  // 4. YTS images - upgrade from medium to large cover
  if (url.includes("yts.mx/assets/images/movies/")) {
    return url.replace("medium-cover.jpg", "large-cover.jpg");
  }

  return url;
}

function SkeletonPlaceholder({ style }: { style: any }) {
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const sharedAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    sharedAnimation.start();
    return () => sharedAnimation.stop();
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.28],
  });

  return (
    <View style={[style, { backgroundColor: '#121214' }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: '#ffffff',
            opacity,
          },
        ]}
      />
    </View>
  );
}

interface Props { route: any; navigation: any }

interface EpisodeRowProps {
  ep: EpisodeItem;
  index: number;
  originalIndex: number;
  playingEpisode: number | null;
  onEpisodePress: (ep: EpisodeItem, index: number) => void;
  posterUrl: string | undefined;
}

function EpisodeRow({ ep, index, originalIndex, playingEpisode, onEpisodePress, posterUrl }: EpisodeRowProps) {
  return (
    <TouchableOpacity
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
          source={{ uri: ep.image || posterUrl || undefined }}
          style={styles.episodeThumbnail}
          resizeMode="cover"
        />
        {/* Play overlay badge */}
        <View style={styles.episodePlayOverlay}>
          <View style={styles.episodePlayCircle}>
            <FontAwesome name="play-circle" size={24} color="black" />
          </View>
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
          <ActivityIndicator size="small" color={theme.colors.accentLight} />
        ) : (
          <View style={styles.downloadIconCircle}>
            <Ionicons name="play" size={14} color="rgba(255,255,255,0.85)" style={{ marginLeft: 1.5 }} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = (val: any) => {
    blurTargetRef.current = val;
    if (val !== blurTarget) {
      setBlurTarget(val);
    }
  };
  const scrollY = useRef(new Animated.Value(0)).current;
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

  // Favorite state
  const [isFav, setIsFav] = useState(false);

  // Trailer state
  const [activeTrailer, setActiveTrailer] = useState<Trailer | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);

  // Season state
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  // Get unique seasons in episodes list
  const seasons = Array.from(new Set(episodes.map(ep => ep.season || 1))).sort((a, b) => a - b);

  useEffect(() => { loadDetail(); }, []);

  useEffect(() => {
    async function checkFav() {
      if (detail) {
        const fav = await favoritesApi.isFavorite(detail.url);
        setIsFav(fav);
      }
    }
    checkFav();
  }, [detail]);

  async function toggleFavorite() {
    if (!detail) return;
    try {
      if (isFav) {
        await favoritesApi.removeFavorite(detail.url);
        setIsFav(false);
      } else {
        const mediaItem = {
          provider: detail.provider || providerName || 'Cinemeta',
          url: detail.url,
          title: detail.title,
          posterUrl: detail.posterUrl,
          type: detail.isSerial ? 'series' : 'movie',
        };
        await favoritesApi.addFavorite(mediaItem);
        setIsFav(true);
      }
    } catch (e) {
      console.warn('Failed to toggle favorite:', e);
    }
  }

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
      source.url,
      source.headers,
      title,
      subUrl,
      sources.map(s => ({ quality: s.quality, url: s.url, type: s.type, headers: s.headers })),
      subtitles,
      JSON.stringify(episodesPayload),
      playingEpisode ?? -1,
      detail?.imdbId || '',
      detail?.isSerial ? 'series' : 'movie',
      detail?.posterUrl || '',
      currentEp?.season || 1,
      currentEp?.episode || 1,
      currentEp?.label || '',
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
            <BlurView 
              intensity={50} 
              tint="dark" 
              style={styles.closeTrailerBlur}
              blurTarget={{ current: blurTarget }}
              blurMethod="dimezisBlurView"
            >
              <Text style={styles.closeTrailerText}>✕</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.bannerContainer}>
        {/* Skeleton placeholder base (Breathing shimmer) */}
        <SkeletonPlaceholder style={StyleSheet.absoluteFillObject} />
        
        {/* Blurred poster progressive placeholder */}
        {detail?.posterUrl ? (
          <Image
            source={{ uri: detail.posterUrl }}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
            resizeMode="cover"
            blurRadius={25}
          />
        ) : null}

        {/* Ambient Gradient Glow */}
        <LinearGradient
          colors={[theme.colors.accentGlow, 'transparent']}
          style={styles.ambientGlow}
          pointerEvents="none"
        />

        <Image
          source={{ uri: getHighQualityImageUrl(detail?.posterUrl) }}
          style={styles.banner}
          resizeMode="cover"
        />
        
        {/* Dark overlay gradients */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', '#050505']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Video Play Trailer Button overlay */}
        {detail?.trailers && detail.trailers.length > 0 && (
          <TouchableOpacity style={styles.playTrailerBtn} onPress={onTrailerPress} activeOpacity={0.8}>
            <View style={styles.playTrailerCircle}>
              <BlurView 
                intensity={90} 
                tint="dark" 
                style={StyleSheet.absoluteFillObject}
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
              />
              <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
            </View>
            <Text style={styles.playTrailerLabel}>TRAILER</Text>
          </TouchableOpacity>
        )}

        {/* Metadata Pill */}
        <View style={styles.metadataPillContainer}>
          <BlurView 
            intensity={50} 
            tint="dark" 
            style={styles.metadataPill}
            blurTarget={{ current: blurTarget }}
            blurMethod="dimezisBlurView"
          >
            {/* Year */}
            {detail?.year && <Text style={styles.metadataText}>{detail.year}</Text>}
            
            {/* Dot Separator */}
            {detail?.year && (detail?.score || detail?.contentRating || detail?.isSerial || detail?.duration) && <View style={styles.pillDot} />}

            {/* Score */}
            {detail?.score && <Text style={styles.metadataText}>⭐ {detail.score}</Text>}
            {detail?.score && (detail?.contentRating || detail?.isSerial || detail?.duration) && <View style={styles.pillDot} />}

            {/* Rating */}
            {detail?.contentRating && <Text style={styles.metadataText}>{detail.contentRating}</Text>}
            {detail?.contentRating && (detail?.isSerial || detail?.duration) && <View style={styles.pillDot} />}

            {/* Format/Length */}
            <Text style={styles.metadataText}>
              {detail?.isSerial 
                ? `${seasons.length} Season${seasons.length !== 1 ? 's' : ''} • ${episodes.length} Episode${episodes.length !== 1 ? 's' : ''}` 
                : detail?.duration 
                  ? `${Math.floor(detail.duration / 60)}h ${detail.duration % 60}m` 
                  : 'Movie'}
            </Text>
          </BlurView>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.accentLight} />
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

  // Filter episodes based on selected season
  const filteredEpisodes = detail.isSerial 
    ? episodes.filter(ep => (ep.season || 1) === selectedSeason)
    : episodes;

  const scrollThreshold = SCREEN_HEIGHT * 0.43 - 90;
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, scrollThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <BlurTargetView ref={setBlurTargetRef as any} style={styles.blurTarget}>
        {/* Top Section: Hero Banner / Trailer */}
        {renderTopArea()}
      </BlurTargetView>
  
      {/* Details Bottom Sheet (Frosted Glassmorphic) */}
        <View style={styles.bottomSheet} pointerEvents="box-none">
          <Animated.ScrollView 
            pointerEvents="box-none"
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ paddingTop: SCREEN_HEIGHT * 0.43 }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
          >
            <View style={styles.contentCard}>
              <BlurView 
                intensity={90} 
                tint="dark" 
                style={styles.blurSheetContent}
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
              >
                <View style={styles.scrollContent}>
                  {/* Title & Season Trigger */}
                  <Text style={styles.detailTitle}>{detail.title}</Text>
                  
                  {detail.isSerial && seasons.length > 1 && (
                    <View style={{ zIndex: 100, position: 'relative', alignSelf: 'center' }}>
                      <TouchableOpacity style={styles.seasonSelector} onPress={() => setShowSeasonPicker(!showSeasonPicker)}>
                        <Text style={styles.seasonText}>Season {selectedSeason}</Text>
                        <Text style={styles.chevron}>{showSeasonPicker ? '▲' : '▼'}</Text>
                      </TouchableOpacity>
                      {showSeasonPicker && (
                        <View style={styles.seasonDropdown}>
                          <BlurView 
                            intensity={95} 
                            tint="dark" 
                            style={styles.seasonDropdownBlur}
                            blurTarget={blurTargetRef}
                            blurMethod="dimezisBlurView"
                          >
                            <ScrollView style={styles.seasonDropdownScroll} nestedScrollEnabled={true}>
                              {seasons.map((s) => (
                                <TouchableOpacity
                                  key={s}
                                  style={[
                                    styles.seasonDropdownRow,
                                    selectedSeason === s && styles.seasonDropdownRowActive
                                  ]}
                                  onPress={() => {
                                    setSelectedSeason(s);
                                    setShowSeasonPicker(false);
                                  }}
                                >
                                  <Text style={[
                                    styles.seasonDropdownRowText,
                                    selectedSeason === s && styles.seasonDropdownRowTextActive
                                  ]}>
                                    Season {s}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </BlurView>
                        </View>
                      )}
                    </View>
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
                    {detail.isSerial ? 'Episodes List' : 'Play Video'}
                  </Text>
                  {filteredEpisodes.length === 0 ? (
                    <Text style={styles.empty}>No episodes available</Text>
                  ) : (
                    <View style={styles.episodesContainer}>
                      {filteredEpisodes.map((ep, index) => {
                        const originalIndex = episodes.findIndex(e => e.mediaRef === ep.mediaRef);
                        return (
                          <EpisodeRow
                            key={ep.mediaRef + '-' + index}
                            ep={ep}
                            index={index}
                            originalIndex={originalIndex}
                            playingEpisode={playingEpisode}
                            onEpisodePress={onEpisodePress}
                            posterUrl={detail?.posterUrl || undefined}
                          />
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
                </View>
              </BlurView>
            </View>
          </Animated.ScrollView>
        </View>

        {/* Floating Custom Header Bar (Oval/Capsule) */}
        <Animated.View style={[
          styles.headerBar,
          {
            top: Math.max(insets.top - 4, 8),
            shadowOpacity: headerBgOpacity,
            elevation: scrollY.interpolate({
              inputRange: [0, scrollThreshold],
              outputRange: [0, 4],
              extrapolate: 'clamp',
            }),
          }
        ]}>
          {/* Animated Background blur capsule */}
          <Animated.View style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: headerBgOpacity,
              borderRadius: 24,
              overflow: 'hidden',
            }
          ]}>
            <BlurView 
              intensity={100} 
              tint="dark" 
              style={StyleSheet.absoluteFillObject}
              blurTarget={{ current: blurTarget }}
              blurMethod="dimezisBlurView"
            />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
          </Animated.View>
          
          
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BlurView 
              intensity={40} 
              tint="dark" 
              style={styles.backButtonBlur}
            >
              <Text style={styles.backButtonText}>←</Text>
            </BlurView>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>
            {detail?.isSerial ? 'TV Series Details' : 'Movie Details'}
          </Text>
          
          <TouchableOpacity style={styles.backButton} onPress={toggleFavorite}>
            <BlurView 
              intensity={40} 
              tint="dark" 
              style={styles.backButtonBlur}
            >
              <Ionicons 
                name={isFav ? "heart" : "heart-outline"} 
                size={20} 
                color={isFav ? "#ff4a7d" : "#ffffff"} 
              />
            </BlurView>
          </TouchableOpacity>
        </Animated.View>

      {/* Source Picker Overlay (Glassmorphic) */}
      {showSourcePicker && (
        <Pressable style={styles.sheetOverlay} onPress={() => { setShowSourcePicker(false); setPlayingEpisode(null); }}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
            <BlurView 
              intensity={95} 
              tint="dark" 
              style={styles.sheetBlur}
              blurTarget={{ current: blurTarget }}
              blurMethod="dimezisBlurView"
            >
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
                  <ActivityIndicator size="large" color={theme.colors.accentLight} style={{ marginVertical: 40 }} />
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
      )}

      {/* Season Picker Modal removed */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#050505" 
  },
  blurTarget: {
    flex: 1,
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
    backgroundColor: theme.colors.accent, 
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
    left: 20,
    right: 20,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  headerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    top: "30%", 
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTrailerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(15, 15, 20, 0.45)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playTrailerLabel: { 
    color: "#ffffff", 
    fontSize: 12, 
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  contentCard: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
    minHeight: SCREEN_HEIGHT * 0.57,
  },
  blurSheetContent: {
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.colors.accent, 
    backgroundColor: 'rgba(25, 25, 30, 0.5)',
    gap: 6,
  },
  seasonSelectorActive: {
    backgroundColor: theme.colors.accent 
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
    color: theme.colors.accentLight, 
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
    backgroundColor: theme.colors.roseBg 
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  playArrow: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 3,
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
  episodeLabelActive: { 
    color: theme.colors.accentLight, 
    fontWeight: "700" 
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
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadIcon: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 2,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end", 
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 100,
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
    borderColor: theme.colors.accent, 
    alignItems: "center", 
    justifyContent: "center", 
    marginRight: 14 
  },
  sheetRadioDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: theme.colors.accent 
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
    backgroundColor: theme.colors.accent, 
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
    color: theme.colors.accentLight, 
    fontSize: 13, 
    fontWeight: "600" 
  },

  // Season Dropdown Layout
  seasonDropdown: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    width: 140,
    maxHeight: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  seasonDropdownBlur: {
    paddingVertical: 6,
  },
  seasonDropdownScroll: {
    maxHeight: 188,
  },
  seasonDropdownRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  seasonDropdownRowActive: {
    backgroundColor: theme.colors.accent,
  },
  seasonDropdownRowText: {
    color: '#A0A0A5',
    fontSize: 14,
    fontWeight: '500',
  },
  seasonDropdownRowTextActive: {
    color: '#fff',
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
