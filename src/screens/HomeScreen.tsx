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
  Pressable,
  Easing,
  DimensionValue,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView, BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { HomeSection, MediaItem } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";
import { useTransition, useTransitionActions } from "../context/TransitionContext";
import type { CardLayout } from "../context/TransitionContext";
import { HeroCard } from "../components/HeroCard";
import MediaCard from "../components/MediaCard";
import { ContinueCard } from "../components/ContinueCard";

import { theme } from "../theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Hero carousel dimensions — active card centers, side cards peek symmetrically
const HERO_CARD_WIDTH = SCREEN_WIDTH * 0.8;
const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.4;
const HERO_SNAP = SCREEN_WIDTH * 0.77;
const HERO_OFFSET = (SCREEN_WIDTH - HERO_SNAP) / 2;

// Card dimensions for skeletons and styling
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const S_CARD_H = S_CARD_W * 1.5;
const CW_CARD_W = S_CARD_W * 1.2;

const CATEGORY_TABS = [
  "Trending",
  "New",
  "Movies",
  "Series",
  "TV Show",
  "Cartoon",
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
      {/* Category header capsule skeleton */}
      <View
        style={[
          styles.headerContainer,
          {
            top: insets.top + 4,
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 20,
            alignItems: "center",
            gap: 12,
            height: "100%",
          }}
        >
          <SkeletonBox width={70} height={26} borderRadius={13} />
          <SkeletonBox width={50} height={26} borderRadius={13} />
          <SkeletonBox width={65} height={26} borderRadius={13} />
          <SkeletonBox width={55} height={26} borderRadius={13} />
          <SkeletonBox width={80} height={26} borderRadius={13} />
        </View>
      </View>

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

        {/* Hero meta skeleton */}
        <View style={{ alignItems: "center", marginVertical: 20, gap: 10 }}>
          <SkeletonBox width={50} height={12} borderRadius={6} />
          <SkeletonBox width={220} height={22} borderRadius={11} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <SkeletonBox width={60} height={20} borderRadius={10} />
            <SkeletonBox width={80} height={20} borderRadius={10} />
            <SkeletonBox width={55} height={20} borderRadius={10} />
          </View>
          {/* Static dots */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <View
              style={{
                width: 14,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.25)",
              }}
            />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            />
          </View>
        </View>

        {/* Sections skeleton */}
        <View style={{ paddingHorizontal: 20, marginTop: 10, gap: 28 }}>
          <View style={{ gap: 12 }}>
            <SkeletonBox width={130} height={16} borderRadius={8} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <SkeletonBox width={100} height={16} borderRadius={8} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
              <SkeletonBox
                width={S_CARD_W}
                height={S_CARD_H}
                borderRadius={22}
              />
            </View>
          </View>
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
}

const SectionRow = React.memo(function SectionRow({
  section,
  navigation,
  goDetail,
}: SectionRowProps) {
  const { phase } = useTransition();
  const isCW = section.name === "Continue Watching";

  const renderItem = useCallback(
    ({ item }: { item: any }) =>
      isCW ? (
        <ContinueCard item={item} onPress={goDetail} />
      ) : (
        <MediaCard
          item={item as MediaItem}
          onPress={goDetail}
          width={S_CARD_W}
          style={{ marginRight: 8, marginHorizontal: 0, marginBottom: 0 }}
        />
      ),
    [isCW, goDetail],
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSections(true);
    } catch (_) {}
    setRefreshing(false);
  }, [activeTab]);
  const flatListRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
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

  const [initialScrolled, setInitialScrolled] = useState(false);

  // Active Hero Declarations (hoisted for scope safety inside hooks)
  const heroSection = sections.find(
    (s) => s.name !== "Continue Watching" && s.items?.length > 0,
  );
  const heroItems = heroSection?.items?.slice(0, 10) ?? [];
  const loopItems = useMemo(() => {
    return heroItems.length > 1 ? [...heroItems, ...heroItems, ...heroItems] : heroItems;
  }, [heroItems]);

  const hero = heroItems[heroIdx] ?? null;
  const tags = GENRE_SETS[heroIdx % GENRE_SETS.length];
  const heroSectionIdx = sections.indexOf(heroSection as HomeSection);

  // Pre-calculate exact snap offsets to bypass Android padding/snapToInterval bugs
  const snapOffsets = useMemo(() => {
    return loopItems.map((_, i) => i * HERO_SNAP);
  }, [loopItems]);

  // Programmatic scroll alignment to the middle replica on initial load
  const handleContentSizeChange = useCallback(() => {
    if (!initialScrolled && heroItems.length > 1) {
      setInitialScrolled(true);
      scrollX.setValue(heroItems.length * HERO_SNAP);
      flatListRef.current?.scrollToOffset({
        offset: heroItems.length * HERO_SNAP,
        animated: false,
      });
    }
  }, [initialScrolled, heroItems.length]);

  // Synchronize active hero index and process seamless jumps when momentum settles
  const handleScrollEnd = useCallback(
    (event: any) => {
      const N = heroItems.length;
      if (N <= 1) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const indexInLoop = Math.max(
        0,
        Math.min(Math.round(offsetX / HERO_SNAP), N * 3 - 1),
      );
      const indexInOrig = indexInLoop % N;
      if (indexInOrig !== heroIdxRef.current) {
        setHeroIdx(indexInOrig);
      }

      // Seamless boundary jump: reposition the list to the middle replica so
      // the user can continue swiping in either direction. We do NOT call
      // scrollX.setValue() here — the Animated.event on onScroll keeps scrollX
      // in sync automatically. A manual setValue() would create a 1-frame
      // mismatch between the JS Animated.Value and the native scroll offset,
      // causing the first/last cards to flash their wrong scale/opacity.
      if (indexInLoop < N) {
        flatListRef.current?.scrollToOffset({ offset: (indexInLoop + N) * HERO_SNAP, animated: false });
      } else if (indexInLoop >= 2 * N) {
        flatListRef.current?.scrollToOffset({ offset: (indexInLoop - N) * HERO_SNAP, animated: false });
      }
    },
    [heroItems.length],
  );

  // Handle scroll drag end safely without interrupting momentum
  const handleScrollEndDrag = useCallback(
    (event: any) => {
      const N = heroItems.length;
      if (N <= 1) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      
      const indexInLoop = Math.max(
        0,
        Math.min(Math.round(offsetX / HERO_SNAP), N * 3 - 1),
      );
      const indexInOrig = indexInLoop % N;
      if (indexInOrig !== heroIdxRef.current) {
        setHeroIdx(indexInOrig);
      }

      // Only jump when no momentum remains (velocity is 0). Same rule:
      // no scrollX.setValue() — let onScroll's Animated.event handle it.
      if (velocityX === 0) {
        if (indexInLoop < N) {
          flatListRef.current?.scrollToOffset({ offset: (indexInLoop + N) * HERO_SNAP, animated: false });
        } else if (indexInLoop >= 2 * N) {
          flatListRef.current?.scrollToOffset({ offset: (indexInLoop - N) * HERO_SNAP, animated: false });
        }
      }
    },
    [heroItems.length],
  );

  // Reset active hero index when sections/tabs change.
  // We do NOT call scrollX.setValue(0) here — that would synchronously snap
  // the animation source to 0, invalidating every card scale/opacity
  // interpolation and the active dot position for 1+ frames before
  // handleContentSizeChange can re-center the FlatList.
  // setInitialScrolled(false) is sufficient: handleContentSizeChange fires
  // after the data change and scrolls to the correct center position.
  useEffect(() => {
    setHeroIdx(0);
    setInitialScrolled(false);
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

  useEffect(() => {
    init();
    const unsub = navigation.addListener('focus', () => {
      // Restore blur target whenever the screen regains focus
      setGlobalBlurTarget(blurTargetRef.current);
      // Only re-fetch sections when we have no data (e.g. after an error).
      // Re-fetching every time the user comes back from a nested screen
      // (SeeAll, detail, etc.) sets sectionsLoading=true → shows a skeleton
      // flash over the already-rendered carousel. If we already have data,
      // the content is still fresh enough — skip the re-fetch.
      if (!sectionsLoadedRef.current) {
        loadSections(false, CATEGORY_TABS[activeTab]);
      }
    });
    return unsub;
  }, [navigation, activeTab]);

  async function init() {
    setShowSkeleton(true);
    skeletonOpacity.setValue(1);
    setLoading(true);
    setError(null);
    try {
      await bridge.loadPlugins();
      await loadSections();
    } catch (e: any) {
      setError(
        e instanceof bridge.OfflineError
          ? "No internet connection."
          : e.message || "Failed to load.",
      );
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
  ) {
    if (!force) setSectionsLoading(true);
    setSectionError(null);
    try {
      const secs: HomeSection[] = await bridge.getMainPage(
        "",
        1,
        force,
        categoryName,
      );
      try {
        const hist = await bridge.getPlaybackHistory();
        if (hist && hist.length > 0) {
          secs.unshift({
            name: "Continue Watching",
            items: hist.map((h: any) => ({
              provider: "Cinemeta",
              url: h.mediaType + "/" + h.imdbId,
              title: h.videoTitle,
              posterUrl: h.posterUrl,
              type: h.mediaType,
              position: h.position,
              duration: h.duration,
              season: h.season,
              episode: h.episode,
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
      setSectionError(
        e instanceof bridge.OfflineError
          ? "No internet connection."
          : e.message || "Failed to load.",
      );
    } finally {
      setSectionsLoading(false);
    }
  }

  const handleTabPress = (index: number) => {
    setActiveTab(index);
    // Mark sections as stale so the next focus/init will re-fetch for this tab
    sectionsLoadedRef.current = false;
    loadSections(false, CATEGORY_TABS[index]);
  };

  const goDetail = useCallback(
    (item: MediaItem, layout: CardLayout, index?: number) => {
      openFromCard(item, layout);
    },
    [openFromCard],
  );

  const renderedSections = useMemo(() => {
    if (sectionError) {
      return (
        <View style={styles.center}>
          <Text style={styles.errText}>{sectionError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => loadSections()}
          >
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (sectionsLoading) {
      return (
        <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
          <SkeletonBox width={80} height={16} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={22} />
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={22} />
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={22} />
          </View>
        </View>
      );
    }
    return sections
      .filter((_: HomeSection, i: number) => i !== heroSectionIdx)
      .map((section: HomeSection, idx: number) => (
        <SectionRow
          key={section.name + idx}
          section={section}
          navigation={navigation}
          goDetail={goDetail}
        />
      ));
  }, [
    sections,
    sectionsLoading,
    sectionError,
    heroSectionIdx,
    navigation,
    goDetail,
  ]);

  return (
    <View style={styles.root}>
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

        <Animated.View style={{ flex: 1, zIndex: 1 }}>
          {/* ── Category tab row ── */}
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
          </Animated.View>

          {/* ── Content ── */}
          {error ? (
            <View style={styles.center}>
              <Text style={styles.errText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={init}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            sections.length > 0 && (
              <Animated.ScrollView
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={theme.colors.accent}
                    colors={[theme.colors.accent]}
                    progressBackgroundColor="rgba(20, 18, 24, 0.95)"
                  />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingTop: insets.top + 60,
                  paddingBottom: 110,
                }}
                style={{ flex: 1, overflow: "visible" }}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                  { useNativeDriver: true },
                )}
                scrollEventThrottle={16}
              >
                {/* Hero carousel */}
                {sectionsLoading || heroItems.length === 0 ? (
                  <View style={{ alignItems: "center", marginTop: 16 }}>
                    <SkeletonBox
                      width={HERO_CARD_WIDTH}
                      height={HERO_CARD_HEIGHT}
                      borderRadius={18}
                    />
                  </View>
                ) : (
                  <Animated.FlatList
                    ref={flatListRef}
                    // No forced key here. The old key={`hero-list-${activeTab}`}
                    // forced a full FlatList remount on every tab press, tearing
                    // down all items and guaranteed a flash. Data-driven updates
                    // (loopItems changes) + initialScrolled reset are sufficient.
                    data={loopItems}
                    keyExtractor={(_: any, i: number) => String(i)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToOffsets={snapOffsets}
                    decelerationRate="fast"
                    disableIntervalMomentum={true}
                    style={{ overflow: "visible" }}
                    ListHeaderComponent={
                      <View style={{ width: HERO_OFFSET }} />
                    }
                    ListFooterComponent={
                      <View style={{ width: HERO_OFFSET }} />
                    }
                    getItemLayout={(_, index) => ({
                      length: HERO_SNAP,
                      offset: HERO_SNAP * index,
                      index,
                    })}
                    contentContainerStyle={{
                      paddingVertical: 10,
                      overflow: "visible",
                    }}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                      { useNativeDriver: true },
                    )}
                    scrollEventThrottle={16}
                    onContentSizeChange={handleContentSizeChange}
                    onMomentumScrollEnd={handleScrollEnd}
                    onScrollEndDrag={handleScrollEndDrag}
                    renderItem={({
                      item,
                      index,
                    }: {
                      item: MediaItem;
                      index: number;
                    }) => (
                      <HeroCard
                        item={item}
                        index={index}
                        scrollX={scrollX}
                        onPress={goDetail}
                        heroSnap={HERO_SNAP}
                        heroCardWidth={HERO_CARD_WIDTH}
                        heroCardHeight={HERO_CARD_HEIGHT}
                        genreSets={GENRE_SETS}
                      />
                    )}
                  />
                )}

                {/* Premium Fluid-Elastic Dots Pagination */}
                {!sectionsLoading && heroItems.length > 0 && (
                  <View
                    style={[
                      styles.heroMeta,
                      { paddingTop: 16, paddingBottom: 16 },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        position: "relative",
                        height: 4,
                      }}
                    >
                      {/* Static Base Dots - Pill Shaped and Tighter Spacing */}
                      {heroItems.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            width: 8,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                            marginHorizontal: 3, // Spacing reduced from 5 to 3
                          }}
                        />
                      ))}

                      {/* Active Sliding Morphing Dot */}
                      {(() => {
                        const dotTranslateInputRange: number[] = [];
                        const dotTranslateOutputRange: number[] = [];
                        const dotScaleXInputRange: number[] = [];
                        const dotScaleXOutputRange: number[] = [];

                        const N = heroItems.length;
                        const totalItems = loopItems.length;

                        for (let k = 0; k < totalItems; k++) {
                          const origIndex = k % N;

                          // 14 = 8 width + 6 margins (3 left, 3 right)
                          dotTranslateInputRange.push(k * HERO_SNAP);
                          dotTranslateOutputRange.push(origIndex * 14);

                          dotScaleXInputRange.push(k * HERO_SNAP);
                          dotScaleXOutputRange.push(1);
                          if (k < totalItems - 1) {
                            dotScaleXInputRange.push((k + 0.5) * HERO_SNAP);
                            dotScaleXOutputRange.push(2.0); // stretch to double width halfway
                          }
                        }

                        const dotScaleX = scrollX.interpolate({
                          inputRange: dotScaleXInputRange,
                          outputRange: dotScaleXOutputRange,
                          extrapolate: "clamp",
                        });

                        const activeTranslateX = scrollX.interpolate({
                          inputRange: dotTranslateInputRange,
                          outputRange: dotTranslateOutputRange,
                          extrapolate: "clamp",
                        });

                        return (
                          <Animated.View
                            style={{
                              position: "absolute",
                              left: 0, // perfect alignment for wider dots
                              width: 14, // wider base active dot
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: theme.colors.accent,
                              transform: [
                                { translateX: activeTranslateX },
                                { scaleX: dotScaleX },
                              ],
                            }}
                          />
                        );
                      })()}
                    </View>
                  </View>
                )}

                {/* Section rows (skip the hero source section) */}
                {renderedSections}
              </Animated.ScrollView>
            )
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

  // category tabs — floating capsule with animated glass background
  headerContainer: {
    position: "absolute",
    left: 20,
    right: 20,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    zIndex: 50,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  blurBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
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

  // hero card — poster only, scale+opacity animated by parent FlatList
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
  errText: {
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryTxt: { color: "#fff", fontWeight: "700" },
});
