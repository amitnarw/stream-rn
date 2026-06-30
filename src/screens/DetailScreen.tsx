import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
  Animated as RNAnimated,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
  FadeIn,
  FadeOut,
  FadeInUp,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView, BlurTargetView } from "expo-blur";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import * as favoritesApi from "../api/favorites";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";
import type {
  EpisodeItem,
  VideoSource,
  MediaItem,
  Actor,
  PluginProvider,
} from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";
import { useTransition } from "../context/TransitionContext";
import type { CardLayout } from "../context/TransitionContext";

function getHighQualityImageUrl(
  url: string | null | undefined,
): string | undefined {
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
  if (
    url.includes("media-amazon.com/images/") ||
    url.includes("m.media-amazon.com/")
  ) {
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
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;

  React.useEffect(() => {
    const sharedAnimation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    sharedAnimation.start();
    return () => sharedAnimation.stop();
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.28],
  });

  return (
    <View style={[style, { backgroundColor: "#121214" }]}>
      <RNAnimated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "#ffffff",
            opacity,
          },
        ]}
      />
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = SCREEN_HEIGHT * 0.5; // 50% for hero, overlaps with sheet
const EASE_OUT = Easing.bezier(0.25, 1, 0.5, 1);

const actorImageCache = new Map<string, string | null>();

function ActorAvatar({
  name,
  initials,
  style,
}: {
  name: string;
  initials: string;
  style: any;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    actorImageCache.has(name) ? actorImageCache.get(name) || null : null,
  );

  useEffect(() => {
    if (actorImageCache.has(name)) {
      setImageUrl(actorImageCache.get(name) || null);
      return;
    }

    let active = true;
    async function fetchImage() {
      try {
        const cleanName = name.replace(/\s+/g, "_");
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const img = data.thumbnail?.source || null;
          actorImageCache.set(name, img);
          if (active) setImageUrl(img);
        } else {
          actorImageCache.set(name, null);
        }
      } catch (e) {
        actorImageCache.set(name, null);
      }
    }

    fetchImage();
    return () => {
      active = false;
    };
  }, [name]);

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={style} />;
  }

  return (
    <View style={[style, styles.castPlaceholder]}>
      <Text style={styles.castInitials}>{initials}</Text>
    </View>
  );
}

interface HeroEpisodeRowProps {
  ep: EpisodeItem;
  index: number;
  playingEpisode: number | null;
  playEpisode: (ep: EpisodeItem, index: number) => void;
  posterUrl: string | undefined;
  isSerial: boolean;
  title: string;
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
            source={{ uri: ep.image || posterUrl || undefined }}
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
                <FontAwesome6 name="play" size={20} color="white" />
              </BlurView>
            )}
          </View>
        </View>

        <View style={styles.episodeInfo}>
          {isSerial && (
            <Text style={styles.episodeMeta}>
              Episode {String(ep.episode).padStart(2, "0")}
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
  },
);

function getQualityBadgeBg(quality: string) {
  const q = quality.toLowerCase();
  if (q.includes('4k') || q.includes('2160')) return '#ff4a7d';
  if (q.includes('1080')) return '#0047FF';
  if (q.includes('720')) return '#2ecc71';
  if (q.includes('480') || q.includes('360')) return '#f39c12';
  return 'rgba(255, 255, 255, 0.08)';
}

function getDomain(url: string) {
  try {
    const domain = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im);
    return domain ? domain[1] : '';
  } catch {
    return '';
  }
}

function getProtocolLabel(type: string, url: string) {
  const t = type.toLowerCase();
  if (t === 'hls' || url.includes('.m3u8')) return 'M3U8';
  if (t === 'torrent' || url.startsWith('magnet:')) return 'TORRENT';
  if (t === 'dash' || url.includes('.mpd')) return 'DASH';
  return 'DIRECT';
}

export default function DetailScreen() {
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = (val: any) => {
    blurTargetRef.current = val;
    if (val !== blurTarget) {
      setBlurTarget(val);
    }
  };
  const insets = useSafeAreaInsets();
  const {
    phase,
    item,
    detail,
    loading,
    error,
    x,
    y,
    width,
    height,
    borderRadius,
    surfaceProgress,
    contentProgress,
    closeToCard,
    reloadDetail,
    openFromCard,
    fallbackRecommendations,
    updateDetailInPlace,
  } = useTransition();



  const [playingEpisode, setPlayingEpisode] = useState<number | null>(null);
  const [resolvingProgress, setResolvingProgress] = useState<bridge.PlaybackProgress[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const expandProgress = useSharedValue(0);

  useEffect(() => {
    expandProgress.value = withTiming(isDescriptionExpanded ? 1 : 0, {
      duration: 350,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  }, [isDescriptionExpanded]);

  // Use maxHeight animation instead of exact height to avoid needing a hidden off-screen
  // measurement render pass (which was doubling mount cost of cast + ActorAvatar network calls)
  const expandedAnimatedStyle = useAnimatedStyle(() => {
    return {
      maxHeight: expandProgress.value * 2000,
      opacity: expandProgress.value,
      overflow: "hidden",
    };
  });

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>(
    [],
  );
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);

  // Dynamic Tab states for source plugins
  const [allProviders, setAllProviders] = useState<PluginProvider[]>(
    ['4K HDHUB', 'Goojara', 'YTS', 'CloudPlay', 'Movies4u', 'Movierulzhd', 'HDHub4u'].map(name => ({
      id: name,
      name,
      url: '',
      hasMainPage: true
    }))
  );
  const [activeProviderTab, setActiveProviderTab] = useState('All');

  useEffect(() => {
    async function loadProviders() {
      try {
        const provs = await bridge.getProviders();
        if (provs && provs.length > 0) {
          setAllProviders(provs);
        }
      } catch (e) {
        console.warn("Failed to load providers for tabs:", e);
      }
    }
    loadProviders();
  }, []);

  const skeletonOpacity = useSharedValue(0.3);
  useEffect(() => {
    if (isResolving) {
      skeletonOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 800, easing: Easing.ease }),
          withTiming(0.3, { duration: 800, easing: Easing.ease })
        ),
        -1,
        true
      );
    } else {
      skeletonOpacity.value = 0.3;
    }
  }, [isResolving]);

  const skeletonAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: skeletonOpacity.value,
    };
  });

  const renderSkeleton = () => (
    <ScrollView style={styles.sheetList} scrollEnabled={false}>
      {[1, 2, 3, 4].map((key) => (
        <Animated.View key={key} style={[styles.skeletonStreamRow, skeletonAnimatedStyle]}>
          <View style={styles.skeletonRowInfo}>
            <View style={styles.skeletonQualityRow}>
              <View style={styles.skeletonBadgeLarge} />
              <View style={styles.skeletonBadgeSmall} />
              <View style={styles.skeletonBadgeMedium} />
            </View>
          </View>
        </Animated.View>
      ))}
    </ScrollView>
  );

  // Favorite state
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    async function checkFav() {
      if (detail) {
        const fav = await favoritesApi.isFavorite(detail.url);
        setIsFav(fav);
      } else if (item) {
        const fav = await favoritesApi.isFavorite(item.url);
        setIsFav(fav);
      }
    }
    checkFav();
  }, [detail, item]);

  async function toggleFavorite() {
    const currentMediaItem = detail || item;
    if (!currentMediaItem) return;
    try {
      if (isFav) {
        await favoritesApi.removeFavorite(currentMediaItem.url);
        setIsFav(false);
      } else {
        const mediaItem = {
          provider: currentMediaItem.provider || "Cinemeta",
          url: currentMediaItem.url,
          title: currentMediaItem.title,
          posterUrl: currentMediaItem.posterUrl,
          type: (currentMediaItem as any).isSerial
            ? "series"
            : (currentMediaItem as any).type || "movie",
        };
        await favoritesApi.addFavorite(mediaItem);
        setIsFav(true);
      }
    } catch (e) {
      console.warn("Failed to toggle favorite:", e);
    }
  }

  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (showSourcePicker) {
      sheetTranslateY.value = withTiming(0, { duration: 300 });
    } else {
      sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
    }
  }, [showSourcePicker]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: x.value }, { translateY: y.value }],
      width: width.value,
      height: height.value,
      borderRadius: borderRadius.value,
      shadowOpacity: interpolate(surfaceProgress.value, [0, 1], [0, 0.55]),
      shadowRadius: interpolate(surfaceProgress.value, [0, 1], [0, 28]),
      elevation: interpolate(surfaceProgress.value, [0, 1], [0, 18]),
    };
  });

  const imageOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: surfaceProgress.value,
    };
  });

  const surfaceStyle = useAnimatedStyle(() => {
    return {
      width: "100%",
      height: "100%",
      borderRadius: borderRadius.value,
      backgroundColor: interpolateColor(
        surfaceProgress.value,
        [0, 0.05, 1],
        ["rgba(28,27,28,0)", "rgba(28,27,28,1)", "rgba(0,0,0,1)"],
      ),
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [
      {
        translateY: interpolate(contentProgress.value, [0, 1], [150, 0]),
      },
    ],
  }));

  const headerControlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      surfaceProgress.value,
      [0.55, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          surfaceProgress.value,
          [0.55, 1],
          [-20, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
  }));

  const posterUrl = getHighQualityImageUrl(
    detail?.posterUrl || item?.posterUrl,
  );
  const title = detail?.title || item?.title || "";
  const providerName = detail?.provider || item?.provider || "Cinemeta";

  const providerTabs = useMemo(() => {
    if (providerName === 'Cinemeta') {
      const list = ['All'];
      allProviders.forEach(p => {
        list.push(p.name);
      });
      return list;
    } else {
      return ['All', providerName];
    }
  }, [allProviders, providerName]);

  const filteredSources = useMemo(() => {
    if (activeProviderTab === 'All') return sources;
    return sources.filter(s => s.provider === activeProviderTab);
  }, [sources, activeProviderTab]);

  const showSkeleton = useMemo(() => {
    if (filteredSources.length > 0) return false;
    if (activeProviderTab === 'All') {
      return isResolving;
    }
    return resolvingProgress.some(p => p.providerName === activeProviderTab && p.status === 'searching');
  }, [filteredSources.length, activeProviderTab, isResolving, resolvingProgress]);

  const allEpisodes = useMemo(() => detail?.episodes ?? [], [detail?.episodes]);

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    allEpisodes.forEach((e) => {
      if (e.season) seasons.add(e.season);
    });
    return Array.from(seasons).sort((a, b) => a - b);
  }, [allEpisodes]);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

  // Auto-select first available season when episodes load
  useEffect(() => {
    if (availableSeasons.length > 0 && selectedSeason === null) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [availableSeasons, selectedSeason]);

  const displayedEpisodes = useMemo(() => {
    if (availableSeasons.length === 0) return allEpisodes;
    return allEpisodes.filter((e) => e.season === selectedSeason);
  }, [allEpisodes, availableSeasons, selectedSeason]);

  const scrollY = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const [trailerDisabled, setTrailerDisabled] = useState(false);

  // Pure worklet — no JS-thread bridge on every scroll frame
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Only cross the bridge when the boolean flips (2× total), not 60×/sec
  useAnimatedReaction(
    () => scrollY.value > 100,
    (isOver, wasOver) => {
      if (isOver !== wasOver) {
        runOnJS(setTrailerDisabled)(isOver);
      }
    },
  );

  // Reset scroll Y smoothly and reset season state when item changes (i.e. loading recommended card)
  useEffect(() => {
    if (item) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      scrollY.value = 0;
      setSelectedSeason(null);
      setShowSeasonDropdown(false);
      setIsDescriptionExpanded(false);
    }
  }, [item]);

  const playTrailer = () => {
    if (!detail?.trailers || detail.trailers.length === 0) return;
    const trailer = detail.trailers[0];
    if (
      trailer.url.includes("youtube.com") ||
      trailer.url.includes("youtu.be")
    ) {
      Linking.openURL(trailer.url).catch((err) =>
        console.warn("Failed to open trailer URL", err),
      );
    } else {
      bridge.playStream(
        trailer.url,
        trailer.referer ? { Referer: trailer.referer } : undefined,
        `${detail.title} - Trailer`,
      );
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            gestureState.dy > 10 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 60) {
            closeToCard();
          }
        },
      }),
    [closeToCard],
  );

  const recommendations = useMemo(() => {
    if (detail?.recommendations && detail.recommendations.length > 0) {
      return detail.recommendations;
    }
    return fallbackRecommendations.filter((f) => f.url !== item?.url);
  }, [detail?.recommendations, fallbackRecommendations, item?.url]);

  const fixedHeaderAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 150],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      scrollY.value,
      [0, 150],
      [0, -80],
      Extrapolation.CLAMP,
    );
    return {
      opacity: opacity * contentProgress.value, // Fade out instantly when details close
      transform: [{ translateY }],
    };
  });

  const scrollThreshold = SCREEN_HEIGHT * 0.45 - 90;

  const headerBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, scrollThreshold],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
    };
  });

  const touchCatcherAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, SCREEN_HEIGHT * 0.45],
      [0, -SCREEN_HEIGHT * 0.45],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateY }],
    };
  });

  // playEpisode MUST be above the early return — hooks cannot appear after conditional returns
  const playEpisode = useCallback(
    async (ep: EpisodeItem, index: number) => {
      if (!detail) return;
      setPlayingEpisode(index);
      setLinksError(null);

      const hasCache = bridge.hasCachedLinks(providerName, ep.mediaRef);

      setSources([]);
      setSubtitles([]);
      setResolvingProgress([]);
      setIsResolving(!hasCache);
      setShowSourcePicker(true);
      setSelectedSourceIndex(0);
      setActiveProviderTab('All');

      try {
        const result = await bridge.loadLinks(
          providerName,
          ep.mediaRef,
          (progress) => {
            setResolvingProgress(progress);
          },
          (newSource) => {
            setSources(prev => {
              if (prev.some(s => s.url === newSource.url)) return prev;
              return [...prev, newSource];
            });
          }
        );
        
        setSubtitles(result.subtitles);
        if (!result.sources || result.sources.length === 0) {
          throw new Error("No playable sources found for this item");
        }
      } catch (e: any) {
        setLinksError(
          e instanceof bridge.OfflineError
            ? "No internet connection. Please check your network."
            : e.message || "Failed to load playable links.",
        );
      } finally {
        setIsResolving(false);
        setPlayingEpisode(null);
      }
    },
    [detail, providerName],
  );

  if (phase === "idle" || !item) return null;

  function onSourceSelect(source: VideoSource) {
    const originalIndex = sources.findIndex(s => s.url === source.url);
    if (originalIndex === -1) return;

    setSelectedSourceIndex(originalIndex);
    setShowSourcePicker(false);
    setPlayingEpisode(null);
    const subUrl = subtitles.length > 0 ? subtitles[0].url : "";
    const currentEp = displayedEpisodes.find((_, i) => playingEpisode === i);
    const title = `${detail?.title} - ${currentEp?.label ?? ""}`;

    const episodesPayload = allEpisodes.map((e) => ({
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
      sources.map((s) => ({
        quality: s.quality,
        url: s.url,
        type: s.type,
        headers: s.headers,
      })),
      subtitles,
      JSON.stringify(episodesPayload),
      playingEpisode ?? -1,
      detail?.imdbId || "",
      detail?.isSerial ? "series" : "movie",
      detail?.posterUrl || "",
      currentEp?.season || 1,
      currentEp?.episode || 1,
      currentEp?.label || "",
      detail?.logoUrl || "",
    );
  }

  const expandedContent = detail ? (
    <View style={{ width: "100%" }}>
      {/* Metadata Grid */}
      <View style={styles.metaGrid}>
        {detail.contentRating && (
          <View style={styles.metaGridItem}>
            <Text style={styles.metaGridLabel}>Rating</Text>
            <Text style={styles.metaGridValue}>{detail.contentRating}</Text>
          </View>
        )}
        {detail.duration && (
          <View style={styles.metaGridItem}>
            <Text style={styles.metaGridLabel}>Duration</Text>
            <Text style={styles.metaGridValue}>
              {detail.duration > 60
                ? `${Math.floor(detail.duration / 60)}h ${detail.duration % 60}m`
                : `${detail.duration}m`}
            </Text>
          </View>
        )}
        {detail.score && (
          <View style={styles.metaGridItem}>
            <Text style={styles.metaGridLabel}>IMDb Rating</Text>
            <Text style={styles.metaGridValue}>★ {detail.score}</Text>
          </View>
        )}
        {detail.tags && detail.tags.length > 0 && (
          <View style={styles.metaGridItemFull}>
            <Text style={styles.metaGridLabel}>Genres</Text>
            <Text style={styles.metaGridValue}>{detail.tags.join(", ")}</Text>
          </View>
        )}
        {detail.director && detail.director.length > 0 && (
          <View style={styles.metaGridItemFull}>
            <Text style={styles.metaGridLabel}>Director</Text>
            <Text style={styles.metaGridValue}>
              {detail.director.join(", ")}
            </Text>
          </View>
        )}
        {detail.writer && detail.writer.length > 0 && (
          <View style={styles.metaGridItemFull}>
            <Text style={styles.metaGridLabel}>Writer</Text>
            <Text style={styles.metaGridValue}>{detail.writer.join(", ")}</Text>
          </View>
        )}
        {detail.awards && (
          <View style={styles.metaGridItemFull}>
            <Text style={styles.metaGridLabel}>Awards</Text>
            <Text style={styles.metaGridValue}>{detail.awards}</Text>
          </View>
        )}
      </View>

      {/* Cast Section */}
      {detail.cast && detail.cast.length > 0 && (
        <View style={styles.castSection}>
          <Text style={styles.sectionTitle}>Cast</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.castList}
          >
            {detail.cast.map((actor, idx) => {
              const initials = actor.name
                .split(" ")
                .map((s) => s[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              return (
                <View key={`actor-${idx}`} style={styles.castCard}>
                  {actor.image ? (
                    <Image
                      source={{ uri: actor.image }}
                      style={styles.castImage}
                    />
                  ) : (
                    <ActorAvatar
                      name={actor.name}
                      initials={initials}
                      style={styles.castImage}
                    />
                  )}
                  <Text style={styles.castName} numberOfLines={1}>
                    {actor.name}
                  </Text>
                  {actor.role ? (
                    <Text style={styles.castRole} numberOfLines={1}>
                      {actor.role}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  ) : null;

  const closeSourcePicker = () => {
    setShowSourcePicker(false);
    setPlayingEpisode(null);
  };

  return (
    <View
      style={styles.root}
      pointerEvents={phase === "closing" ? "none" : "box-none"}
    >
      <Animated.View style={[styles.shadowWrap, shadowStyle]}>
        <Animated.View style={[styles.surface, surfaceStyle]}>
          <BlurTargetView
            ref={setBlurTargetRef as any}
            style={StyleSheet.absoluteFillObject}
          >
            <Animated.View
              style={[styles.imageWrap, { bottom: 0 }, imageOpacityStyle]}
            >
              {/* Skeleton placeholder base (Breathing shimmer) */}
              <SkeletonPlaceholder style={StyleSheet.absoluteFillObject} />

              {/* Blurred poster progressive placeholder */}
              {(phase === "open" || phase === "closing") &&
              (item?.posterUrl || detail?.posterUrl) ? (
                <Image
                  source={{
                    uri: item?.posterUrl || detail?.posterUrl || undefined,
                  }}
                  style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
                  resizeMode="cover"
                  blurRadius={25}
                />
              ) : null}

              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.imageFallback} />
              )}

              {/* Blend Overlay (Cinematic Shading) */}
              <Animated.View
                style={[StyleSheet.absoluteFillObject, fadeStyle]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={[
                    "rgba(0,0,0,0.5)",
                    "rgba(0,0,0,0.15)",
                    "rgba(0,0,0,0.85)",
                  ]}
                  style={StyleSheet.absoluteFillObject}
                  locations={[0, 0.4, 1]}
                  pointerEvents="none"
                />
              </Animated.View>
            </Animated.View>
          </BlurTargetView>

          {/* Top Navigation Bar (Oval/Capsule) */}
          <View
            style={[
              styles.headerControls,
              { top: Math.max(insets.top - 4, 8) },
            ]}
            pointerEvents="box-none"
          >
            {/* Animated Background blur capsule */}
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                headerBgStyle,
                {
                  borderRadius: 24,
                  overflow: "hidden",
                },
              ]}
            >
              {phase === "open" || phase === "closing" ? (
                <BlurView
                  intensity={100}
                  tint="dark"
                  style={StyleSheet.absoluteFillObject}
                  blurTarget={{ current: blurTarget }}
                  blurMethod="dimezisBlurView"
                />
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: "rgba(20, 18, 24, 0.95)" },
                  ]}
                />
              )}
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: "rgba(15, 15, 20, 0.38)" },
                ]}
              />
            </Animated.View>

            {/* Header controls content (fades in with zoom transition) */}
            <Animated.View
              style={[styles.headerControlsContent, headerControlsStyle]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeToCard}
                activeOpacity={0.8}
              >
                <View style={styles.closeButtonInner}>
                  <Text style={styles.closeButtonText}>←</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.headerTitle}>
                {detail?.isSerial ? "TV Series Details" : "Movie Details"}
              </Text>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={toggleFavorite}
                activeOpacity={0.8}
              >
                <View style={styles.closeButtonInner}>
                  <Ionicons
                    name={isFav ? "heart" : "heart-outline"}
                    size={20}
                    color={isFav ? "#ff4a7d" : "#ffffff"}
                  />
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

              {/* Fixed Header Content (Rendered OUTSIDE ScrollView to prevent jitter/glitching) */}
              <Animated.View
                style={[styles.fixedHeaderContainer, fixedHeaderAnimatedStyle]}
                pointerEvents="box-none"
              >
                {/* Watch Trailer Button in Center */}
                {detail?.trailers && detail.trailers.length > 0 && (
                  <TouchableOpacity
                    style={styles.trailerButton}
                    activeOpacity={0.8}
                    onPress={playTrailer}
                    disabled={trailerDisabled}
                  >
                    <View style={styles.trailerCircle}>
                      {phase === "open" || phase === "closing" ? (
                        <BlurView
                          intensity={90}
                          tint="dark"
                          style={StyleSheet.absoluteFillObject}
                          blurTarget={{ current: blurTarget }}
                          blurMethod="dimezisBlurView"
                        />
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            { backgroundColor: "rgba(15, 15, 20, 0.85)" },
                          ]}
                        />
                      )}
                      <Ionicons
                        name="play"
                        size={24}
                        color="#fff"
                        style={{ marginLeft: 3 }}
                      />
                    </View>
                    <Text style={styles.trailerLabel}>TRAILER</Text>
                  </TouchableOpacity>
                )}

                {/* Video Metadata Pill at Bottom */}
                <View style={styles.pillBottom} pointerEvents="none">
                  <View style={styles.pillBackground}>
                    {phase === "open" || phase === "closing" ? (
                      <BlurView
                        intensity={90}
                        tint="dark"
                        style={StyleSheet.absoluteFillObject}
                        blurTarget={{ current: blurTarget }}
                        blurMethod="dimezisBlurView"
                      />
                    ) : (
                      <View
                        style={[
                          StyleSheet.absoluteFillObject,
                          { backgroundColor: "rgba(15, 15, 20, 0.85)" },
                        ]}
                      />
                    )}
                    {detail?.year ? (
                      <>
                        <Text style={styles.pillText}>{detail.year}</Text>
                        <View style={styles.pillDot} />
                      </>
                    ) : null}
                    <Text style={styles.pillText}>
                      {detail?.isSerial
                        ? `${availableSeasons.length} Season${availableSeasons.length !== 1 ? "s" : ""} • ${allEpisodes.length} Episode${allEpisodes.length !== 1 ? "s" : ""}`
                        : "Movie"}
                    </Text>
                    <View style={styles.pillDot} />
                    <Text style={styles.pillText}>HD</Text>
                  </View>
                </View>
              </Animated.View>

              {/* Swipe Touch Catcher (covers top 45%, outside ScrollView, animated) */}
              <Animated.View
                style={[styles.touchCatcher, touchCatcherAnimatedStyle]}
                {...panResponder.panHandlers}
                pointerEvents={showSeasonDropdown ? "none" : "auto"}
              />

              {/* Scrollable Details */}
              <Animated.ScrollView
                ref={scrollViewRef as any}
                style={[styles.fullScreenScroll, contentStyle]}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
              >
                <Pressable
                  style={{ flexGrow: 1 }}
                  onPress={() => {
                    if (showSeasonDropdown) {
                      setShowSeasonDropdown(false);
                    }
                  }}
                >
                  {/* Spacer for Fixed Header Content */}
                  <View
                    style={{ height: SCREEN_HEIGHT * 0.45 }}
                    pointerEvents="none"
                  />

                  {/* Bottom Sheet Content */}
                  {(phase === "opening" ||
                    phase === "open" ||
                    phase === "closing") && (
                    <Animated.View style={styles.sheetContentWrap}>
                      <View style={styles.bottomSheetBackground}>
                        <View style={styles.blurContainer}>
                          {posterUrl ? (
                            <Image
                              source={{ uri: posterUrl }}
                              style={StyleSheet.absoluteFillObject}
                              blurRadius={35}
                              resizeMode="cover"
                            />
                          ) : null}
                          <LinearGradient
                            colors={["rgba(15,15,20,0.55)", "rgba(5,5,10,0.9)"]}
                            style={StyleSheet.absoluteFillObject}
                          />
                        </View>
                      </View>

                      {loading ? (
                        phase === "open" ? (
                          <DetailsSkeleton />
                        ) : null
                      ) : error ? (
                        <View style={styles.centerState}>
                          <Text style={styles.errorText}>{error}</Text>
                          <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={reloadDetail}
                          >
                            <Text style={styles.primaryButtonText}>Retry</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Animated.View
                          entering={FadeInUp.duration(450)}
                          style={[
                            styles.scrollContent,
                            { paddingBottom: insets.bottom + 100 },
                          ]}
                        >
                          {/* Title & Season */}
                          <View style={[styles.titleContainer, { zIndex: 100 }]}>
                            <Text style={styles.mainTitle} numberOfLines={2}>
                              {title}
                            </Text>
                            {detail?.isSerial && availableSeasons.length > 0 ? (
                              <View
                                style={{
                                  position: "relative",
                                  alignItems: "center",
                                }}
                              >
                                <TouchableOpacity
                                  style={styles.seasonSelector}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    setShowSeasonDropdown(!showSeasonDropdown)
                                  }
                                >
                                  <Text style={styles.seasonText}>
                                    {selectedSeason
                                      ? `Season ${selectedSeason}`
                                      : "Episodes"}
                                  </Text>
                                  <Text style={styles.seasonIcon}>▼</Text>
                                </TouchableOpacity>

                                {/* Floating Modern Dropdown */}
                                {showSeasonDropdown && (
                                  <Animated.View
                                    entering={FadeIn.duration(200)}
                                    exiting={FadeOut.duration(150)}
                                    style={styles.floatingDropdown}
                                  >
                                    <LinearGradient
                                      colors={["#1c1c22", "#0f0f12"]}
                                      style={StyleSheet.absoluteFillObject}
                                    />
                                    <ScrollView
                                      showsVerticalScrollIndicator={false}
                                      style={{ maxHeight: 220 }}
                                    >
                                      {availableSeasons.map((season) => (
                                        <TouchableOpacity
                                          key={`season-${season}`}
                                          style={[
                                            styles.dropdownItem,
                                            selectedSeason === season &&
                                              styles.dropdownItemSelected,
                                          ]}
                                          onPress={() => {
                                            setSelectedSeason(season);
                                            setShowSeasonDropdown(false);
                                          }}
                                        >
                                          <View style={styles.dropdownItemLeft}>
                                            <View
                                              style={[
                                                styles.seasonNumberBox,
                                                selectedSeason === season &&
                                                  styles.seasonNumberBoxSelected,
                                              ]}
                                            >
                                              <Text
                                                style={[
                                                  styles.seasonNumberText,
                                                  selectedSeason === season &&
                                                    styles.seasonNumberTextSelected,
                                                ]}
                                              >
                                                {String(season).padStart(2, "0")}
                                              </Text>
                                            </View>
                                            <Text
                                              style={[
                                                styles.dropdownItemText,
                                                selectedSeason === season &&
                                                  styles.dropdownItemTextSelected,
                                              ]}
                                            >
                                              Season {season}
                                            </Text>
                                          </View>
                                          {selectedSeason === season && (
                                            <Text style={styles.checkmark}>✓</Text>
                                          )}
                                        </TouchableOpacity>
                                      ))}
                                    </ScrollView>
                                  </Animated.View>
                                )}
                              </View>
                            ) : null}
                          </View>

                          {/* Description */}
                          {detail?.description ? (
                            <View style={styles.descriptionContainer}>
                              <Text
                                style={styles.descriptionText}
                                numberOfLines={
                                  isDescriptionExpanded ? undefined : 3
                                }
                              >
                                {detail.description}
                              </Text>
                            </View>
                          ) : null}

                          {/* Always Visible: SEE MORE / SEE LESS Toggle in center in capitals */}
                          <TouchableOpacity
                            onPress={() => {
                              setIsDescriptionExpanded(!isDescriptionExpanded);
                            }}
                            style={styles.seeMoreBtn}
                          >
                            <Text style={styles.seeMoreText}>
                              {isDescriptionExpanded ? "SEE LESS" : "SEE MORE"}
                            </Text>
                          </TouchableOpacity>

                          {detail && (
                            <Animated.View
                              style={[
                                styles.expandedDetails,
                                expandedAnimatedStyle,
                              ]}
                            >
                              {expandedContent}
                            </Animated.View>
                          )}

                          {linksError ? (
                            <Text style={styles.linksError}>{linksError}</Text>
                          ) : null}

                          {/* Episodes List Title */}
                          <Text style={styles.sectionTitle}>
                            {detail?.isSerial ? "Episodes List" : "Play Video"}
                          </Text>

                          {/* Episodes — FlatList with scrollEnabled=false so outer ScrollView drives scrolling */}
                          <FlatList
                            data={displayedEpisodes}
                            keyExtractor={(ep, index) => `${ep.mediaRef}-${index}`}
                            renderItem={({ item: ep, index }) => (
                              <HeroEpisodeRow
                                ep={ep}
                                index={index}
                                playingEpisode={playingEpisode}
                                playEpisode={playEpisode}
                                posterUrl={
                                  detail?.posterUrl || item.posterUrl || undefined
                                }
                                isSerial={!!detail?.isSerial}
                                title={title}
                              />
                            )}
                            scrollEnabled={false}
                            nestedScrollEnabled={false}
                            ListEmptyComponent={
                              <Text style={styles.empty}>
                                No episodes available
                              </Text>
                            }
                            initialNumToRender={10}
                            maxToRenderPerBatch={5}
                            style={styles.episodesList}
                          />

                          {/* Recommendations Row */}
                          {recommendations.length > 0 && (
                            <View style={styles.recommendationsSection}>
                              <Text style={styles.recommendationsTitle}>
                                More Like This
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.recommendationsList}
                              >
                                {recommendations.map((recItem, idx) => (
                                  <RecommendationCard
                                    key={`rec-${idx}-${recItem.url}`}
                                    item={recItem}
                                    onPress={(clickedItem) =>
                                      updateDetailInPlace(clickedItem)
                                    }
                                  />
                                ))}
                              </ScrollView>
                            </View>
                          )}
                        </Animated.View>
                      )}
                    </Animated.View>
                  )}
                </Pressable>
              </Animated.ScrollView>
        </Animated.View>
      </Animated.View>

      {/* Source Picker Bottom Sheet Overlay */}
      {showSourcePicker && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.sheetOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeSourcePicker}
          />

          <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
            <View style={styles.sheetContent}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Select Source</Text>

              {/* Dynamic Provider Tabs scroll view */}
              {providerTabs.length > 1 && (
                <View style={styles.tabsContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabsScrollContent}
                  >
                    {providerTabs.map((tab) => {
                      const isActive = activeProviderTab === tab;
                      return (
                        <TouchableOpacity
                          key={tab}
                          style={[styles.tabButton, isActive && styles.tabButtonActive]}
                          onPress={() => setActiveProviderTab(tab)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                            {tab}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {showSkeleton ? (
                renderSkeleton()
              ) : filteredSources.length === 0 ? (
                <View style={styles.noSourcesContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color={theme.colors.rose} style={{ opacity: 0.8 }} />
                  <Text style={styles.noSourcesText}>No links found for this provider</Text>
                  <Text style={styles.noSourcesSubtext}>Try another provider or clear the Playback Links cache in settings.</Text>
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.sheetList}
                >
                  {filteredSources.map((source, idx) => {
                    const isSplitted = source.quality.includes(' · ');
                    const hostName = source.host || (isSplitted ? source.quality.split(' · ')[0] : source.quality) || 'Direct';
                    const qualityTag = (isSplitted ? source.quality.split(' · ')[1] : 'Auto');
                    const hasHeaders = source.headers && Object.keys(source.headers).length > 0;
                    const protocolLabel = getProtocolLabel(source.type, source.url);

                    // Extract size dynamically from the quality or title string if present
                    const sizeMatch = source.quality.match(/\[?(\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes))\]?/i);
                    const sizeTag = sizeMatch ? sizeMatch[1] : null;
                    const showProviderBadge = activeProviderTab === 'All';

                    return (
                      <TouchableOpacity
                        key={`source-${idx}`}
                        style={styles.sheetRow}
                        onPress={() => onSourceSelect(source)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.sheetRowInfo}>
                          <View style={[styles.sheetQualityRow, { flexWrap: 'wrap', gap: 6 }]}>
                            {/* Host Name - Normal Text (No Background Badge) */}
                            <Text style={[styles.sheetQuality, { marginRight: 4 }]}>
                              {hostName}
                            </Text>

                            {/* Quality Badge */}
                            <View style={[styles.sheetBadge, { backgroundColor: getQualityBadgeBg(qualityTag) }]}>
                              <Text style={[styles.sheetBadgeText, { color: '#ffffff', fontWeight: 'bold' }]}>
                                {qualityTag}
                              </Text>
                            </View>

                            {/* Protocol Badge */}
                            <View style={styles.sheetBadge}>
                              <Text style={styles.sheetBadgeText}>
                                {protocolLabel}
                              </Text>
                            </View>

                            {/* Size Badge */}
                            {sizeTag ? (
                              <View style={[styles.sheetBadge, { backgroundColor: '#f39c12' }]}>
                                <Text style={[styles.sheetBadgeText, { color: '#ffffff', fontWeight: 'bold' }]}>
                                  {sizeTag}
                                </Text>
                              </View>
                            ) : null}

                            {/* Provider Badge (only in "All" tab) */}
                            {showProviderBadge && source.provider ? (
                              <View style={[styles.sheetBadge, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1 }]}>
                                <Text style={[styles.sheetBadgeText, { color: '#ffffff', opacity: 0.8 }]}>
                                  {source.provider.toUpperCase()}
                                </Text>
                              </View>
                            ) : null}

                            {/* Custom Headers Badge */}
                            {hasHeaders ? (
                              <View style={[styles.sheetBadge, { borderColor: 'rgba(85, 128, 255, 0.35)', borderWidth: 1, backgroundColor: 'rgba(85, 128, 255, 0.05)' }]}>
                                <Text style={[styles.sheetBadgeText, { color: '#5580FF' }]}>
                                  HEADERS REQUIRED
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {subtitles.length > 0 && (
                <View style={styles.sheetSubRow}>
                  <Text style={styles.sheetSubLabel}>Subtitles: </Text>
                  <Text style={styles.sheetSubLangs} numberOfLines={1}>
                    {subtitles.map((s) => s.lang).join(", ")}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Details Skeleton Loading Component ──────────────────────────────────────────
function DetailsSkeleton() {
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

// ── Recommendation Card Sub-component ──────────────────────────────────────────
function RecommendationCard({
  item,
  onPress,
}: {
  item: MediaItem;
  onPress: (item: MediaItem) => void;
}) {
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
            source={{ uri: item.posterUrl }}
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
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  shadowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
  },
  surface: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  imageWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  headerControls: {
    position: "absolute",
    left: 20,
    width: SCREEN_WIDTH - 40,
    height: 48,
    zIndex: 50,
  },
  headerControlsContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  headerSpacer: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  closeButtonInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "600",
    marginTop: -2,
  },
  fullScreenScroll: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 10,
  },
  fixedHeaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.45,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 25,
  },
  touchCatcher: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.45,
    zIndex: 20,
  },
  pillBottom: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sheetContentWrap: {
    flex: 1,
    minHeight: SCREEN_HEIGHT * 0.6,
    zIndex: 20,
    elevation: 20,
  },
  pillBackground: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 15, 20, 0.45)", // matching trailer button background
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden", // clips the BlurView properly
    gap: 10,
  },
  trailerButton: {
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  trailerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(15, 15, 20, 0.45)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  trailerLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 8,
    textTransform: "uppercase",
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pillText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  pillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  bottomSheetBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  scrollContent: {
    paddingTop: 32,
    paddingHorizontal: 24,
    zIndex: 95,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  mutedText: {
    color: "#A0A0A5",
    marginTop: 16,
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    color: "#ffb4ab",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  mainTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  seasonSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 6,
  },
  seasonText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    fontWeight: "500",
  },
  seasonIcon: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    marginTop: 2,
  },
  descriptionText: {
    color: "#A0A0A5",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  genreRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 32,
  },
  genreText: {
    color: "#A0A0A5",
    fontSize: 14,
  },
  imdbBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  imdbBadge: {
    backgroundColor: "#F5C518",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  imdbText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  ratingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  linksError: {
    color: "#ffb4ab",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  episodesList: {
    flex: 1,
  },
  empty: {
    color: "#666",
    textAlign: "center",
    paddingVertical: 40,
  },
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
  playIconGlass: {
    width: 40,
    height: 40,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
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
  playIconText: {
    color: "#fff",
    fontSize: 14,
    marginLeft: 3,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: -0.2,
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
  floatingDropdown: {
    position: "absolute",
    top: 42, // Right below the season selector button
    width: 200,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dropdownItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  seasonNumberBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  seasonNumberBoxSelected: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  seasonNumberText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
  },
  seasonNumberTextSelected: {
    color: "#fff",
  },
  dropdownItemText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownItemTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  recommendationsSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 24,
  },
  recommendationsTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  recommendationsList: {
    paddingBottom: 8,
  },
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
  seeMoreBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  seeMoreText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  descriptionContainer: {
    marginBottom: 4,
  },
  expandedDetails: {
    marginTop: 8,
    marginBottom: 8,
    width: "100%",
  },
  detailLogo: {
    width: 140,
    height: 48,
    alignSelf: "center",
    marginBottom: 16,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  metaGridItem: {
    flex: 1,
    minWidth: "28%",
  },
  metaGridItemFull: {
    width: "100%",
  },
  metaGridLabel: {
    color: "#8E8D92",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaGridValue: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
  },
  castSection: {
    marginBottom: 24,
  },
  castList: {
    paddingRight: 12,
  },
  castCard: {
    width: 80,
    alignItems: "center",
    marginRight: 12,
  },
  castImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 6,
    backgroundColor: "#1c1b1c",
  },
  castPlaceholder: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  castInitials: {
    color: "#E5E2E3",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  castName: {
    color: "#fff",
    fontSize: 11,
    textAlign: "center",
  },
  castRole: {
    color: "#888",
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  skeletonContainer: {
    paddingTop: 32,
    paddingHorizontal: 24,
    width: "100%",
  },
  skeletonTitle: {
    height: 36,
    borderRadius: 10,
    width: "75%",
    marginBottom: 12,
  },
  skeletonSeason: {
    height: 32,
    borderRadius: 16,
    width: 110,
    marginBottom: 20,
  },
  skeletonTagsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  skeletonTag: {
    height: 18,
    borderRadius: 9,
    width: 70,
  },
  skeletonText: {
    height: 14,
    borderRadius: 4,
    marginBottom: 10,
  },
  skeletonHeader: {
    height: 22,
    borderRadius: 6,
    width: 90,
    marginBottom: 16,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },
  skeletonThumb: {
    width: 140,
    height: 84,
    borderRadius: 10,
  },
  skeletonMetaWrap: {
    flex: 1,
    paddingLeft: 16,
    gap: 8,
  },
  skeletonMeta: {
    height: 10,
    width: 60,
    borderRadius: 3,
  },
  skeletonLine: {
    height: 14,
    width: "80%",
    borderRadius: 4,
  },
  skeletonDescLine: {
    height: 10,
    width: "95%",
    borderRadius: 3,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
    zIndex: 10000,
    elevation: 10000,
  },
  sheet: {
    width: "100%",
    height: SCREEN_HEIGHT * 0.7,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#141417",
  },
  sheetContent: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  sheetList: {
    flex: 1,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.02)",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  sheetRowActive: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  sheetRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  sheetRadioActive: {
    borderColor: "#fff",
  },
  sheetRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  sheetRowInfo: {
    flex: 1,
  },
  sheetQualityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sheetQuality: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "600",
  },
  sheetQualityActive: {
    color: "#fff",
  },
  sheetBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sheetBadgeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sheetHost: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "500",
  },
  sheetSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sheetSubLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
  },
  sheetSubLangs: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  progressChipsList: {
    gap: 8,
    paddingRight: 20,
  },
  progressChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSearching: {
    borderColor: 'rgba(85, 128, 255, 0.35)',
    backgroundColor: 'rgba(85, 128, 255, 0.08)',
  },
  chipFound: {
    borderColor: 'rgba(46, 204, 113, 0.45)',
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
  },
  chipNone: {
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  chipError: {
    borderColor: 'rgba(255, 74, 125, 0.35)',
    backgroundColor: 'rgba(255, 74, 125, 0.08)',
  },
  chipText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextNone: {
    color: 'rgba(255, 255, 255, 0.35)',
  },
  chipTextFound: {
    color: '#2ecc71',
  },
  chipTextError: {
    color: '#ff4a7d',
  },
  noSourcesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  noSourcesText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  noSourcesSubtext: {
    color: '#8e8d92',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tabsScrollContent: {
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabButtonActive: {
    backgroundColor: "rgba(0, 71, 255, 0.15)",
    borderColor: "#0047FF",
  },
  tabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  skeletonStreamRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
  skeletonRowInfo: {
    flex: 1,
  },
  skeletonQualityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  skeletonBadgeLarge: {
    width: 90,
    height: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  skeletonBadgeSmall: {
    width: 45,
    height: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  skeletonBadgeMedium: {
    width: 60,
    height: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
