import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
  Easing,
  DimensionValue,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView, BlurTargetView } from "expo-blur";
import Reanimated, { FadeInUp, FadeIn, FadeOut, Easing as ReanimatedEasing } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { WifiOff, AlertCircle } from "lucide-react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { HomeSection, MediaItem } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";
import { useTransition, useTransitionActions } from "../context/TransitionContext";
import type { CardLayout } from "../context/TransitionContext";
import { HeroCard } from "../components/HeroCard";
import { BlurCarousel } from "../components/BlurCarousel";
import MediaCard from "../components/MediaCard";
import { ContinueCard } from "../components/ContinueCard";

import { theme } from "../theme";

function cleanGeneralError(err: any): string {
  if (!err) return "Something went wrong. Please try again.";
  const msg = err.message || String(err);
  const m = msg.toLowerCase();
  if (m.includes("offline") || m.includes("network") || m.includes("internet")) {
    return "No internet connection. Please check your Wi-Fi or cellular network.";
  }
  if (m.includes("sockettimeoutexception") || m.includes("timeout") || m.includes("connect")) {
    return "The server is taking too long to respond. Tap Retry to try again.";
  }
  if (m.includes("illegalargumentexception") || m.includes("json") || m.includes("nullpointer")) {
    return "We couldn't read the server response. This catalog might be temporarily down.";
  }
  if (m.includes("unresolvedaddress") || m.includes("unknownhost")) {
    return "Access blocked by your network provider. Connecting to a VPN may help.";
  }
  return "Failed to load details. Tap Retry to reload.";
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Hero carousel dimensions ,  active card centers, side cards peek symmetrically
const HERO_CARD_WIDTH = SCREEN_WIDTH * 0.8;
const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.4;
const HERO_SNAP = SCREEN_WIDTH * 0.77;
const HERO_OFFSET = (SCREEN_WIDTH - HERO_SNAP) / 2;

// Card dimensions for skeletons and styling
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3 - 2;
const S_CARD_H = S_CARD_W * 1.5;
const CW_CARD_W = S_CARD_W * 1.2;

const CATEGORY_TABS = [
  "Trending",
  "Movies",
  "Series",
  "Cartoon",
  "Anime",
  "English",
  "Hindi",
  "Punjabi",
];

// Display genre/duration/rating tags for hero cards (rotated per item index)
const GENRE_SETS = [
  ["Fantasy", "2h 7min", "5.9"],
  ["Action", "1h 58min", "7.2"],
  ["Drama", "2h 14min", "6.8"],
  ["Comedy", "1h 45min", "7.5"],
];
function getLowQualityImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.includes("images.metahub.space")) {
    return url.replace("/medium/", "/small/").replace("/large/", "/small/");
  }
  if (url.includes("image.tmdb.org/t/p/")) {
    return url.replace(/\/t\/p\/[^/]+\//, "/t/p/w185/");
  }
  if (
    url.includes("media-amazon.com/images/") ||
    url.includes("m.media-amazon.com/")
  ) {
    const index = url.indexOf("._V1_");
    if (index !== -1) {
      return url.substring(0, index) + "._V1_SX100_.jpg";
    }
  }
  if (url.includes("yts.mx/assets/images/movies/")) {
    return url.replace("large-cover.jpg", "medium-cover.jpg");
  }
  return url;
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonBox({
  width,
  height,
  borderRadius = 6,
}: {
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, []);

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "rgba(255, 255, 255, 0.12)",
        opacity,
      }}
    />
  );
}

// Components extracted to separate files in src/components/ to keep file clean and structured.

// ── Premium Skeleton Loading Screen ──────────────────────────────────────────
function HomeSkeletonScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: 110,
        }}
      >
        {/* Carousel layout skeleton (matching peak side cards) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
            gap: 12,
          }}
        >
          {/* Left peek card */}
          <View style={{ opacity: 0.25 }}>
            <SkeletonBox
              width={SCREEN_WIDTH * 0.07}
              height={HERO_CARD_HEIGHT * 0.85}
              borderRadius={28}
            />
          </View>
          {/* Active center card */}
          <SkeletonBox
            width={HERO_CARD_WIDTH}
            height={HERO_CARD_HEIGHT}
            borderRadius={28}
          />
          {/* Right peek card */}
          <View style={{ opacity: 0.25 }}>
            <SkeletonBox
              width={SCREEN_WIDTH * 0.07}
              height={HERO_CARD_HEIGHT * 0.85}
              borderRadius={28}
            />
          </View>
        </View>

        {/* Carousel dots skeleton */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
            marginBottom: 16,
            height: 6,
          }}
        >
          <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.25)", marginHorizontal: 3 }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.08)", marginHorizontal: 3 }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.08)", marginHorizontal: 3 }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.08)", marginHorizontal: 3 }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.08)", marginHorizontal: 3 }} />
        </View>

        {/* Sections skeleton */}
        <View style={{ paddingHorizontal: 20, marginTop: 10, gap: 28 }}>
          {[1, 2, 3].map((sectionIdx) => (
            <View key={sectionIdx} style={{ gap: 12 }}>
              {/* Section Header Title */}
              <SkeletonBox width={sectionIdx === 1 ? 130 : 100} height={16} borderRadius={8} />
              
              {/* Horizontal Row of Cards */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3].map((cardIdx) => (
                  <View key={cardIdx} style={{ gap: 6 }}>
                    <SkeletonBox
                      width={S_CARD_W}
                      height={S_CARD_H}
                      borderRadius={22}
                    />
                    <View style={{ alignSelf: "center", marginTop: 2 }}>
                      <SkeletonBox
                        width={S_CARD_W * 0.75}
                        height={10}
                        borderRadius={5}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Memoized Section Row for 60fps Scrolling Performance ──────────────────────
interface SectionRowProps {
  section: HomeSection;
  navigation: any;
  goDetail: (item: MediaItem, layout: CardLayout) => void;
  onDeleteHistoryItem?: (id: string) => void;
}

const SectionRow = React.memo(function SectionRow({
  section,
  navigation,
  goDetail,
  onDeleteHistoryItem,
}: SectionRowProps) {
  const { phase } = useTransition();
  const isCW = section.name === "Continue Watching";

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (isCW) {
        return (
          <ContinueCard item={item} onPress={goDetail} onDelete={onDeleteHistoryItem} />
        );
      }

      return (
        <MediaCard
          item={item as MediaItem}
          onPress={goDetail}
          width={S_CARD_W}
          style={{ marginRight: 8, marginHorizontal: 0, marginBottom: 0 }}
        />
      );
    },
    [isCW, goDetail, onDeleteHistoryItem],
  );

  const handleSeeAll = useCallback(() => {
    navigation.navigate("SeeAll", {
      title: section.name,
      items: section.items,
    });
  }, [navigation, section.name, section.items]);

  const keyExtractor = useCallback((_: any, i: number) => String(i), []);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHdr}>
        <Text style={styles.sectionTitle}>{section.name}</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={handleSeeAll}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={section.items}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        renderItem={renderItem}
      />
    </View>
  );
});

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { phase } = useTransition();
  const { openFromCard, setFallbackRecommendations, setGlobalBlurTarget } =
    useTransitionActions();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const heroIdxRef = useRef(0);
  heroIdxRef.current = heroIdx;

  const lastLoadRequestRef = useRef<{ category: string; provider: string } | null>(null);
  const [loadingCategory, setLoadingCategory] = useState<string>("");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await bridge.loadPlugins();
      await Promise.all([
        refreshHistoryOnly(),
        loadSections(true)
      ]);
    } catch (_) {}
    setRefreshing(false);
  }, [activeTab]);
  const scrollY = useRef(new Animated.Value(0)).current;
  // Track whether we have live section data so the focus listener can skip
  // re-fetching when the user returns from a nested screen (SeeAll, etc.).
  // Using a ref avoids stale closures and keeps the effect deps stable.
  const sectionsLoadedRef = useRef(false);

  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = useCallback(
    (val: any) => {
      if (val !== blurTargetRef.current) {
        blurTargetRef.current = val;
        setBlurTarget(val);
        setGlobalBlurTarget(val);
      }
    },
    [setGlobalBlurTarget],
  );

  // Double buffered background states to prevent source-change flashes
  const [uriA, setUriA] = useState<string | null>(null);
  const [uriB, setUriB] = useState<string | null>(null);
  const opacityA = useRef(new Animated.Value(0)).current;
  const opacityB = useRef(new Animated.Value(0)).current;
  const activeBuffer = useRef<"A" | "B">("A");

  // Premium Crossfade Skeleton Loading States
  const [showSkeleton, setShowSkeleton] = useState(true);
  const skeletonOpacity = useRef(new Animated.Value(1)).current;

  // Active Hero Declarations (hoisted for scope safety inside hooks)
  const heroSection = sections.find(
    (s) => s.name !== "Continue Watching" && s.items?.length > 0,
  );
  const heroItems = useMemo(() => {
    return heroSection?.items?.slice(0, 10) ?? [];
  }, [heroSection]);

  const hero = heroItems[heroIdx] ?? null;
  const tags = GENRE_SETS[heroIdx % GENRE_SETS.length];
  const heroSectionIdx = sections.indexOf(heroSection as HomeSection);

  useEffect(() => {
    setHeroIdx(0);
  }, [sections, activeTab]);

  // Double buffering swap triggers
  const handleLoadA = useCallback(() => {
    if (activeBuffer.current === "B") {
      activeBuffer.current = "A";
      Animated.parallel([
        Animated.timing(opacityA, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(opacityB, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    } else if (activeBuffer.current === "A") {
      opacityA.setValue(1);
    }
  }, [opacityA, opacityB]);

  const handleLoadB = useCallback(() => {
    if (activeBuffer.current === "A") {
      activeBuffer.current = "B";
      Animated.parallel([
        Animated.timing(opacityB, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(opacityA, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    } else if (activeBuffer.current === "B") {
      opacityB.setValue(1);
    }
  }, [opacityA, opacityB]);

  useEffect(() => {
    if (hero?.posterUrl) {
      const newUrl = getLowQualityImageUrl(hero.posterUrl) || null;
      if (!newUrl) return;

      if (activeBuffer.current === "A") {
        // Buffer A is currently visible. We load the new image into Buffer B.
        if (uriB !== newUrl) {
          setUriB(newUrl);
        }
      } else {
        // Buffer B is currently visible. We load the new image into Buffer A.
        if (uriA !== newUrl) {
          setUriA(newUrl);
        }
      }
    } else if (!hero) {
      setUriA(null);
      setUriB(null);
      opacityA.setValue(0);
      opacityB.setValue(0);
      activeBuffer.current = "A";
    }
  }, [hero, uriA, uriB, opacityA, opacityB]);

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [40, 180],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  async function refreshHistoryOnly() {
    try {
      const hist = await bridge.getPlaybackHistory();
      const filteredHist = (hist || []).filter((h: any) => {
        const isLive = h.mediaType === "live" || 
                       h.type === "live" || 
                       ["cloudplay", "iptv player", "publicsportsiptv", "sports iptv", "pirate iptv", "sony iptv", "japan iptv"].includes(
                         (h.provider || "").toLowerCase()
                       );
        return !isLive;
      });
      setSections((prevSecs) => {
        const filtered = prevSecs.filter((s) => s.name !== "Continue Watching");
        if (filteredHist && filteredHist.length > 0) {
          const cwSection = {
            name: "Continue Watching",
            items: filteredHist.map((h: any) => ({
              provider: h.provider || "Cinemeta",
              url: h.detailUrl || (h.mediaType + "/" + h.imdbId),
              title: h.videoTitle,
              posterUrl: h.posterUrl,
              type: h.mediaType,
              position: h.position,
              duration: h.duration,
              season: h.season,
              episode: h.episode,
              imdbId: h.imdbId,
            })) as any,
          };
          return [cwSection, ...filtered];
        }
        return filtered;
      });
    } catch (_) {}
  }

  // Load plugins exactly once on mount
  useEffect(() => {
    init();
  }, []);

  // Update history & focus listener
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      // Restore blur target whenever the screen regains focus
      setGlobalBlurTarget(blurTargetRef.current);

      // Update Continue Watching in background on screen focus
      refreshHistoryOnly();

      // Only re-fetch sections when we have no data (e.g. after an error).
      // Re-fetching every time the user comes back from a nested screen
      // (SeeAll, detail, etc.) sets sectionsLoading=true → shows a skeleton
      // flash over the already-rendered carousel. If we already have data,
      // the content is still fresh enough ,  skip the re-fetch.
      if (!sectionsLoadedRef.current) {
        loadSections(false, CATEGORY_TABS[activeTab]);
      }
    });
    return unsub;
  }, [navigation, activeTab]);

  async function init() {
    setError(null);
    // Cache-first: try cache synchronously and render instantly if available
    try {
      const cached = await bridge.peekMainPageCache(
        CATEGORY_TABS[activeTab],
        "",
        1
      );
      if (cached && cached.length > 0) {
        setSections(cached);
        sectionsLoadedRef.current = true;
        // Instantly hide skeleton — no fade animation needed
        skeletonOpacity.setValue(0);
        setShowSkeleton(false);
        setLoading(false);
        // Background: load plugins for next refresh
        bridge.loadPlugins().catch(() => {});
        return;
      }
    } catch (_) {}

    // No cache: show skeleton and fetch fresh
    setShowSkeleton(true);
    skeletonOpacity.setValue(1);
    setLoading(true);
    try {
      await bridge.loadPlugins();
      await loadSections(false, CATEGORY_TABS[activeTab]);
    } catch (e: any) {
      setError(cleanGeneralError(e));
    } finally {
      // Premium Fade out of skeleton loading overlay
      Animated.timing(skeletonOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowSkeleton(false);
      });
      setLoading(false);
    }
  }

  async function loadSections(
    force: boolean = false,
    categoryName: string = CATEGORY_TABS[activeTab],
    showLoader: boolean = !force,
  ) {
    lastLoadRequestRef.current = { category: categoryName, provider: "" };

    // Cache-first: render instantly without skeleton if a cached entry exists
    if (!force) {
      const cached = await bridge.peekMainPageCache(categoryName, "", 1);
      if (cached && cached.length > 0) {
        // Decorative injected rows (history) are not in cache; skip for instant render
        setSections(cached);
        sectionsLoadedRef.current = true;
      } else if (showLoader) {
        setSectionsLoading(true);
        setLoadingCategory(categoryName);
      }
    } else if (showLoader) {
      setSectionsLoading(true);
      setLoadingCategory(categoryName);
    }
    setSectionError(null);
    try {
      const secs: HomeSection[] = await bridge.getMainPage(
        "",
        1,
        force,
        categoryName,
      );

      // Check if this request is still the most recent active one
      if (lastLoadRequestRef.current?.category !== categoryName) {
        return;
      }

      try {
        const hist = await bridge.getPlaybackHistory();
        const filteredHist = (hist || []).filter((h: any) => {
          const isLive = h.mediaType === "live" ||
                         h.type === "live" ||
                         ["cloudplay", "iptv player", "publicsportsiptv", "sports iptv", "pirate iptv", "sony iptv", "japan iptv"].includes(
                           (h.provider || "").toLowerCase()
                         );
          return !isLive;
        });
        if (filteredHist && filteredHist.length > 0) {
          secs.unshift({
            name: "Continue Watching",
            items: filteredHist.map((h: any) => ({
              provider: h.provider || "Cinemeta",
              url: h.detailUrl || (h.mediaType + "/" + h.imdbId),
              title: h.videoTitle,
              posterUrl: h.posterUrl,
              type: h.mediaType,
              position: h.position,
              duration: h.duration,
              season: h.season,
              episode: h.episode,
                imdbId: h.imdbId,
              })) as any,
            });
          }
      } catch (_) {}

      setSections(secs);
      sectionsLoadedRef.current = true;

      // Collect some recommended items from general sections as a fallback
      const fallbacks: MediaItem[] = [];
      secs.forEach((s) => {
        if (s.name !== "Continue Watching" && s.items) {
          fallbacks.push(...s.items.slice(0, 5));
        }
      });
      if (fallbacks.length > 0) {
        // Shuffle or unique them
        const unique = Array.from(new Set(fallbacks.map((f) => f.url)))
          .map((url) => fallbacks.find((f) => f.url === url))
          .filter(Boolean) as MediaItem[];
        setFallbackRecommendations(unique.slice(0, 10));
      }
    } catch (e: any) {
      if (lastLoadRequestRef.current?.category === categoryName) {
        setSectionError(cleanGeneralError(e));
      }
    } finally {
      if (lastLoadRequestRef.current?.category === categoryName) {
        setSectionsLoading(false);
        setLoadingCategory("");
      }
    }
  }

  const handleTabPress = (index: number) => {
    const category = CATEGORY_TABS[index];
    setActiveTab(index);
    sectionsLoadedRef.current = false;
    loadSections(false, category);
  };

  const goDetail = useCallback(
    (item: MediaItem, layout: CardLayout, index?: number) => {
      openFromCard(item, layout);
    },
    [openFromCard],
  );

  const handleDeleteHistoryItem = useCallback(async (id: string) => {
    try {
      const success = await bridge.deletePlaybackHistoryItem(id);
      if (success) {
        refreshHistoryOnly();
      }
    } catch (_) {}
  }, []);

  const renderedSections = useMemo(() => {
    if (sectionError) {
      return (
        <View style={styles.errorContainer}>
          <BlurView intensity={20} tint="dark" style={styles.errorCard}>
            <WifiOff size={40} color={theme.colors.rose} style={{ marginBottom: 12 }} />
            <Text style={styles.errorTitle}>Connection Interrupted</Text>
            <Text style={styles.errText}>{sectionError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => loadSections()}
              activeOpacity={0.8}
            >
              <Text style={styles.retryTxt}>Try Again</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      );
    }
    if (sectionsLoading) {
      return (
        <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
          <View style={{ gap: 10 }}>
            <SkeletonBox width={100} height={16} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <SkeletonBox width={120} height={16} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={20} />
            </View>
          </View>
        </View>
      );
    }

    const displaySections = sections;

    return (
      <Reanimated.View entering={FadeIn.duration(400)}>
        {displaySections.map((section: HomeSection, idx: number) => (
          <SectionRow
            key={section.name + idx}
            section={section}
            navigation={navigation}
            goDetail={goDetail}
            onDeleteHistoryItem={handleDeleteHistoryItem}
          />
        ))}
      </Reanimated.View>
    );
  }, [
    sections,
    sectionsLoading,
    loadingCategory,
    sectionError,
    heroSectionIdx,
    navigation,
    goDetail,
    activeTab,
  ]);

  return (
    <View style={styles.root}>
      {/* Custom Glassmorphic Pull-to-Refresh Indicator */}
      {refreshing && (
        <Reanimated.View
          entering={FadeInUp.duration(300).easing(ReanimatedEasing.out(ReanimatedEasing.quad))}
          exiting={FadeOut.duration(200)}
          style={[styles.customRefreshIndicator, { top: insets.top + 65 }]}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <ActivityIndicator size="small" color="#0047FF" style={{ marginRight: 8 }} />
          <Text style={styles.customRefreshText}>REFRESHING FEED</Text>
        </Reanimated.View>
      )}

      <View style={{ flex: 1 }}>
        {/* Background Ambient Poster Glow */}
        <BlurTargetView
          ref={setBlurTargetRef as any}
          style={[styles.backgroundContainer, { zIndex: 0 }]}
          pointerEvents="none"
        >
          {uriA ? (
            <Animated.Image
              source={{ uri: uriA }}
              onLoad={handleLoadA}
              style={[
                styles.backgroundImage,
                {
                  opacity: opacityA.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.45],
                  }),
                },
              ]}
              resizeMode="cover"
              blurRadius={20}
            />
          ) : null}
          {uriB ? (
            <Animated.Image
              source={{ uri: uriB }}
              onLoad={handleLoadB}
              style={[
                styles.backgroundImage,
                {
                  opacity: opacityB.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.45],
                  }),
                },
              ]}
              resizeMode="cover"
              blurRadius={20}
            />
          ) : null}
          <LinearGradient
            colors={["rgba(5, 5, 5, 0.1)", "rgba(5, 5, 5, 0.5)", "#050505"]}
            style={styles.gradientOverlay}
          />
        </BlurTargetView>

        {/* ── Header: tabs (flex row, no absolute positioning) + compact TV chip ── */}
        <Animated.View
          style={[styles.headerContainer, { top: insets.top + 4 }]}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: headerBgOpacity },
            ]}
          >
            <View style={styles.blurBackdrop}>
              {blurTarget && !showSkeleton ? (
                <BlurView
                  intensity={100}
                  tint="dark"
                  style={StyleSheet.absoluteFillObject}
                  blurMethod="dimezisBlurView"
                  blurTarget={{ current: blurTarget }}
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
            </View>
          </Animated.View>

          <View style={styles.tabsFlexArea}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabRow}
              style={styles.tabRowWrap}
            >
              {CATEGORY_TABS.map((tab, i) => {
                const isActive = i === activeTab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => handleTabPress(i)}
                    activeOpacity={0.75}
                    style={[styles.tabItem, isActive && styles.tabItemActive]}
                  >
                    <Text
                      style={[styles.tabText, isActive && styles.tabTextActive]}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Compact TV chip — flex sibling, never overlaps tabs */}
          <TouchableOpacity
            style={styles.tvCompactChip}
            onPress={() => navigation?.navigate?.("LiveTV")}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={["#8B5CF6", "#6366F1", "#4338CA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tvCompactChipGradient}
            >
              <MaterialIcons name="tv" size={16} color="#FFFFFF" />
              <Text style={styles.tvCompactChipText}>TV</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ flex: 1, zIndex: 1 }}>
          {/* ── Content ── */}
          {error ? (
            <ScrollView
              contentContainerStyle={{
                paddingTop: insets.top + 80,
                paddingHorizontal: 28,
                paddingBottom: 40,
                alignItems: "center",
                justifyContent: "center",
                flexGrow: 1,
              }}
              style={{ flex: 1 }}
            >
              <BlurView intensity={20} tint="dark" style={styles.errorCard}>
                <AlertCircle size={42} color={theme.colors.rose} style={{ marginBottom: 12 }} />
                <Text style={styles.errorTitle}>Unable to Load Feed</Text>
                <Text style={styles.errText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={init} activeOpacity={0.8}>
                  <Text style={styles.retryTxt}>Try Again</Text>
                </TouchableOpacity>
              </BlurView>
            </ScrollView>
          ) : (
            <Animated.ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="transparent"
                  colors={["transparent"]}
                  progressBackgroundColor="transparent"
                  progressViewOffset={insets.top + 65}
                />
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingTop: insets.top + 60,
                paddingBottom: 110,
                flexGrow: 1,
              }}
              style={{ flex: 1, overflow: "visible" }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
              scrollEventThrottle={16}
            >
              {sectionsLoading || heroItems.length === 0 ? (
                <View style={{ alignItems: "center", marginTop: 16 }}>
                  <SkeletonBox
                    width={HERO_CARD_WIDTH}
                    height={HERO_CARD_HEIGHT}
                    borderRadius={18}
                  />
                </View>
              ) : (
                <Reanimated.View entering={FadeIn.duration(400)}>
                  <BlurCarousel
                    data={heroItems}
                    itemWidth={HERO_SNAP}
                    cardWidth={HERO_CARD_WIDTH}
                    cardHeight={HERO_CARD_HEIGHT}
                    borderRadius={28}
                    spacing={10}
                    horizontalSpacing={HERO_OFFSET}
                    onIndexChange={setHeroIdx}
                    renderItem={({ item, index }) => (
                      <HeroCard
                        item={item}
                        index={index}
                        onPress={goDetail}
                        heroSnap={HERO_SNAP}
                        heroCardWidth={HERO_CARD_WIDTH}
                        heroCardHeight={HERO_CARD_HEIGHT}
                        genreSets={GENRE_SETS}
                      />
                    )}
                  />
                </Reanimated.View>
              )}

              {/* Section rows (skip the hero source section) */}
              {renderedSections}
            </Animated.ScrollView>
          )}
        </Animated.View>
      </View>

      {/* Premium Fade-Out Skeleton Loader Overlay */}
      {showSkeleton && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: skeletonOpacity,
              zIndex: 100,
              backgroundColor: theme.colors.background,
            },
          ]}
          pointerEvents={loading ? "auto" : "none"}
        >
          <HomeSkeletonScreen />
        </Animated.View>
      )}

      {/* Premium Edge Fades */}
      <LinearGradient
        colors={["#050505", "rgba(5, 5, 5, 0.8)", "transparent"]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 15,
          zIndex: 45,
        }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["transparent", "rgba(5, 5, 5, 0.85)", "#050505"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 100,
          zIndex: 45,
        }}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  backgroundContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: SCREEN_HEIGHT * 0.65,
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },

  // category tabs ,  floating capsule with animated glass background
  headerContainer: {
    position: "absolute",
    left: SCREEN_WIDTH * 0.025,
    right: SCREEN_WIDTH * 0.025,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    zIndex: 150,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blurBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: "hidden",
  },
  tabsFlexArea: {
    flex: 1,
    height: "100%",
    overflow: "hidden",
  },
  tabRowWrap: {
    flex: 1,
  },
  tabRow: {
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 8,
    height: "100%",
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  tabItemActive: {
    backgroundColor: theme.colors.accent, // Primary color
  },
  tabText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#ffffff", fontWeight: "700" },

  // hero card ,  poster only, scale+opacity animated by parent FlatList
  heroCard: {
    width: HERO_CARD_WIDTH,
    height: HERO_CARD_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: theme.colors.placeholder,
  },
  heroPosterImg: { width: "100%", height: "100%" },
  heroPosterFallback: { flex: 1, backgroundColor: theme.colors.placeholder },

  // info below carousel: year → bold title → chips → dots
  heroMeta: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
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

  // outline pill chips
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

  // pagination dots: inactive=circle, active=wide pill
  dots: { flexDirection: "row", gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: { width: 18, backgroundColor: "#ffffff" },

  // section rows
  section: { marginTop: 22 },
  sectionHdr: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  seeAll: { color: theme.colors.accentLight, fontSize: 13 },

  // small card
  smallCardImg: {
    width: S_CARD_W,
    height: S_CARD_H,
    borderRadius: 12,
    backgroundColor: theme.colors.placeholder,
  },
  cardFallback: { backgroundColor: theme.colors.placeholder },

  // continue watching card
  cwCardImg: {
    width: CW_CARD_W,
    height: CW_CARD_W * 1.5,
    borderRadius: 12,
    backgroundColor: theme.colors.placeholder,
  },
  cwProgressBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  cwProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.accent,
    borderBottomLeftRadius: 12,
  },
  cwBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(255, 74, 125, 0.85)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cwBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },
  cwTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 },

  // utility
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  errorCard: {
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
  },
  errorTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errText: {
    color: "#8E8D92",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryTxt: { color: "#fff", fontWeight: "700" },
  customRefreshIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 18, 24, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 100,
    elevation: 6,
    shadowColor: '#0047FF',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  customRefreshText: {
    color: '#E5E2E3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tvCompactChip: {
    height: "100%",
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: "hidden",
    shadowColor: "#6366F1",
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tvCompactChipGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 6,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  tvCompactChipText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
