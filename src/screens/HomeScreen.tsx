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
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView, BlurTargetView } from "expo-blur";
import Reanimated, { FadeInUp, FadeIn, FadeOut, Easing as ReanimatedEasing } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { WifiOff, AlertCircle, RotateCw } from "lucide-react-native";
import type { HomeSection, MediaItem, PluginProvider } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";
import { useTransition, useTransitionActions } from "../context/TransitionContext";
import type { CardLayout } from "../context/TransitionContext";
import { HeroCard } from "../components/HeroCard";
import MediaCard from "../components/MediaCard";
import { ContinueCard } from "../components/ContinueCard";
import ChannelCard from "../components/ChannelCard";

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

// Hero carousel dimensions — active card centers, side cards peek symmetrically
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
  "New",
  "Movies",
  "Series",
  "TV Show",
  "Cartoon",
  "Anime",
  "LiveTV",
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
function HomeSkeletonScreen({ isLive }: { isLive?: boolean }) {
  const insets = useSafeAreaInsets();
  if (isLive) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <View
          style={{
            paddingTop: insets.top + 110,
            paddingHorizontal: 20,
            gap: 16,
          }}
        >
          {[1, 2, 3, 4, 5].map((rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: "row", gap: 8 }}>
              <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
            </View>
          ))}
        </View>
      </View>
    );
  }

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
  onDeleteHistoryItem?: (id: string) => void;
  isLiveTab: boolean;
  savedUrls: Set<string>;
  onToggleSave: (item: MediaItem) => void;
}

const SectionRow = React.memo(function SectionRow({
  section,
  navigation,
  goDetail,
  onDeleteHistoryItem,
  isLiveTab,
  savedUrls,
  onToggleSave,
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
      
      const isLiveItem = item.type === "live" || isLiveTab;
      
      if (isLiveItem) {
        return (
          <ChannelCard
            item={item as MediaItem}
            onPress={(i) =>
              goDetail(i, {
                x: 0,
                y: 0,
                width: S_CARD_W,
                height: S_CARD_W,
                borderRadius: 22,
              })
            }
            isSaved={savedUrls.has(item.url)}
            onToggleSave={onToggleSave}
            width={S_CARD_W}
            style={{ marginRight: 8 }}
          />
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
    [isCW, goDetail, onDeleteHistoryItem, isLiveTab, savedUrls, onToggleSave],
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

  const [allProviders, setAllProviders] = useState<PluginProvider[]>([
    { id: "CloudPlay", name: "CloudPlay", url: "", hasMainPage: true, hasSearch: false },
    { id: "IPTV Player", name: "IPTV Player", url: "", hasMainPage: true, hasSearch: false },
    { id: "PublicSportsIPTV", name: "PublicSportsIPTV", url: "", hasMainPage: true, hasSearch: false },
    { id: "Sports IPTV", name: "Sports IPTV", url: "", hasMainPage: true, hasSearch: false },
    { id: "Pirate IPTV", name: "Pirate IPTV", url: "", hasMainPage: true, hasSearch: false },
    { id: "Sony IPTV", name: "Sony IPTV", url: "", hasMainPage: true, hasSearch: false },
    { id: "Japan IPTV", name: "Japan IPTV", url: "", hasMainPage: true, hasSearch: false },
    { id: "USA TV Next", name: "USA TV Next", url: "", hasMainPage: true, hasSearch: false },
  ]);
  const [activeLiveTVProvider, setActiveLiveTVProvider] = useState<string>("IPTV Player");
  const [savedChannels, setSavedChannels] = useState<MediaItem[]>([]);
  const [resolvingLiveChannel, setResolvingLiveChannel] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState<string>("");
  const [liveTVSearchQuery, setLiveTVSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const liveTVProviders = useMemo(() => {
    return allProviders.filter((p) =>
      ["cloudplay", "iptvplayer", "publicsportsiptv", "usa tv next"].includes(
        p.name.toLowerCase(),
      ) || p.name.toLowerCase().includes("iptv"),
    );
  }, [allProviders]);

  const savedUrls = useMemo(() => {
    return new Set(savedChannels.map((x) => x.url));
  }, [savedChannels]);

  useEffect(() => {
    if (liveTVProviders.length > 0 && !activeLiveTVProvider) {
      setActiveLiveTVProvider(liveTVProviders[0].name);
    }
  }, [liveTVProviders, activeLiveTVProvider]);

  const loadSavedChannelsList = async () => {
    try {
      const list = await bridge.getSavedChannels();
      setSavedChannels(list);
      return list;
    } catch {
      return [];
    }
  };

  const playLiveChannel = useCallback(async (item: MediaItem) => {
    setResolvingLiveChannel(item.title);
    try {
      const result = await bridge.loadLinks(item.provider, item.url);
      if (result.sources && result.sources.length > 0) {
        const source = result.sources[0];
        bridge.playStream(
          source.url,
          source.headers,
          item.title,
          undefined,
          result.sources,
          result.subtitles,
          undefined,
          -1,
          undefined,
          "live",
          item.posterUrl || undefined,
          1,
          1,
          item.title,
          undefined,
          item.provider,
          item.url
        );
      } else {
        Alert.alert("Playback Error", "No playable links found for this channel.");
      }
    } catch (e: any) {
      console.warn("Failed to play live channel:", e);
      Alert.alert("Playback Error", "Failed to load channel: " + (e.message || String(e)));
    } finally {
      setResolvingLiveChannel(null);
    }
  }, []);

  const handleToggleSaveChannel = useCallback(async (item: MediaItem) => {
    try {
      const saved = await bridge.getSavedChannels();
      const isCurrentlySaved = saved.some((x) => x.url === item.url);
      let updated: MediaItem[];
      if (isCurrentlySaved) {
        updated = await bridge.removeSavedChannel(item.url);
      } else {
        const newItem = { ...item, type: "live" };
        updated = await bridge.saveChannel(newItem);
      }
      setSavedChannels(updated);

      if (CATEGORY_TABS[activeTab] === "LiveTV") {
        setSections((prev) => {
          const copy = [...prev];
          const idx = copy.findIndex((x) => x.name === "Saved Channels");
          if (updated.length > 0) {
            if (idx !== -1) {
              copy[idx] = { name: "Saved Channels", items: updated };
            } else {
              copy.unshift({ name: "Saved Channels", items: updated });
            }
          } else {
            if (idx !== -1) {
              copy.splice(idx, 1);
            }
          }
          return copy;
        });
      }
    } catch (e) {
      console.warn("Failed to toggle save channel:", e);
    }
  }, [activeTab]);

  useEffect(() => {
    async function loadProviders() {
      try {
        const provs = await bridge.getProviders();
        if (provs && provs.length > 0) {
          const hasUsaTv = provs.some(p => p.name === "USA TV Next");
          const customProvs = hasUsaTv ? provs : [
            ...provs,
            { id: "USA TV Next", name: "USA TV Next", url: "", hasMainPage: true, hasSearch: false }
          ];
          setAllProviders(customProvs);
        }
      } catch (e) {
        console.warn("Failed to load providers:", e);
      }
    }
    loadProviders();
  }, []);

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

  async function refreshHistoryOnly() {
    try {
      const hist = await bridge.getPlaybackHistory();
      setSections((prevSecs) => {
        const filtered = prevSecs.filter((s) => s.name !== "Continue Watching");
        if (hist && hist.length > 0) {
          const cwSection = {
            name: "Continue Watching",
            items: hist.map((h: any) => ({
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
      loadSavedChannelsList();

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
      const provs = await bridge.loadPlugins();
      let defaultLiveProvider = "";
      if (provs && provs.length > 0) {
        const hasUsaTv = provs.some(p => p.name === "USA TV Next");
        const customProvs = hasUsaTv ? provs : [
          ...provs,
          { id: "USA TV Next", name: "USA TV Next", url: "", hasMainPage: true, hasSearch: false }
        ];
        setAllProviders(customProvs);
        const liveProvs = customProvs.filter((p) =>
          ["cloudplay", "iptvplayer", "publicsportsiptv", "usa tv next"].includes(
            p.name.toLowerCase(),
          ) || p.name.toLowerCase().includes("iptv"),
        );
        if (liveProvs.length > 0) {
          defaultLiveProvider = liveProvs[0].name;
          setActiveLiveTVProvider(defaultLiveProvider);
        }
      }
      await loadSections(false, CATEGORY_TABS[activeTab], defaultLiveProvider);
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
    liveTVProvider: string = activeLiveTVProvider,
    showLoader: boolean = !force,
  ) {
    const currentProviderName = categoryName === "LiveTV"
      ? (liveTVProvider || (liveTVProviders[0]?.name || ""))
      : "";
    lastLoadRequestRef.current = { category: categoryName, provider: currentProviderName };

    if (showLoader) {
      setSectionsLoading(true);
      setLoadingCategory(categoryName);
    }
    setSectionError(null);
    try {
      const targetProvider = currentProviderName;
      const secs: HomeSection[] = await bridge.getMainPage(
        targetProvider,
        1,
        force,
        categoryName,
      );

      // Check if this request is still the most recent active one
      if (
        lastLoadRequestRef.current?.category !== categoryName ||
        (categoryName === "LiveTV" && lastLoadRequestRef.current?.provider !== targetProvider)
      ) {
        return;
      }

      if (categoryName === "LiveTV") {
        const saved = await loadSavedChannelsList();
        if (saved && saved.length > 0) {
          secs.unshift({
            name: "Saved Channels",
            items: saved,
          });
        }
      } else {
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
      }

      setSections(secs);
      sectionsLoadedRef.current = true;

      // Collect some recommended items from general sections as a fallback
      const fallbacks: MediaItem[] = [];
      secs.forEach((s) => {
        if (s.name !== "Continue Watching" && s.name !== "Saved Channels" && s.items) {
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
      if (
        lastLoadRequestRef.current?.category === categoryName &&
        (categoryName !== "LiveTV" || lastLoadRequestRef.current?.provider === currentProviderName)
      ) {
        setSectionError(cleanGeneralError(e));
      }
    } finally {
      if (
        lastLoadRequestRef.current?.category === categoryName &&
        (categoryName !== "LiveTV" || lastLoadRequestRef.current?.provider === currentProviderName)
      ) {
        setSectionsLoading(false);
        setLoadingCategory("");
      }
    }
  }

  const handleTabPress = (index: number) => {
    setActiveTab(index);
    setLiveTVSearchQuery("");
    setSelectedCategory("All");
    sectionsLoadedRef.current = false;
    const category = CATEGORY_TABS[index];
    const targetProvider = category === "LiveTV" ? (activeLiveTVProvider || (liveTVProviders[0]?.name || "")) : "";
    loadSections(false, category, targetProvider);
  };

  const handleLiveTVProviderPress = (providerName: string) => {
    setActiveLiveTVProvider(providerName);
    setLiveTVSearchQuery("");
    setSelectedCategory("All");
    sectionsLoadedRef.current = false;
    loadSections(false, "LiveTV", providerName);
  };

  const goDetail = useCallback(
    (item: MediaItem, layout: CardLayout, index?: number) => {
      const isLiveItem = item.type === "live" || CATEGORY_TABS[activeTab] === "LiveTV";
      if (isLiveItem) {
        playLiveChannel(item);
      } else {
        openFromCard(item, layout);
      }
    },
    [openFromCard, activeTab, playLiveChannel],
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
      const isLive = loadingCategory === "LiveTV" || CATEGORY_TABS[activeTab] === "LiveTV";
      if (isLive) {
        return (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            {[1, 2, 3, 4].map((rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: "row", gap: 8 }}>
                <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
                <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
                <SkeletonBox width={S_CARD_W} height={S_CARD_W} borderRadius={20} />
              </View>
            ))}
          </View>
        );
      }
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
    if (CATEGORY_TABS[activeTab] === "LiveTV") {
      const categoriesList = sections.map((s) => s.name);
      
      let filtered: MediaItem[] = [];
      if (selectedCategory === "All") {
        const seen = new Set<string>();
        sections.forEach((sec) => {
          (sec.items ?? []).forEach((item) => {
            if (!seen.has(item.url)) {
              seen.add(item.url);
              filtered.push(item);
            }
          });
        });
      } else {
        const sec = sections.find((s) => s.name === selectedCategory);
        if (sec) {
          filtered = [...(sec.items ?? [])];
        }
      }

      if (liveTVSearchQuery.trim()) {
        const q = liveTVSearchQuery.toLowerCase();
        filtered = filtered.filter((item) => item.title.toLowerCase().includes(q));
      }

      return (
        <View style={{ paddingBottom: 40, position: "relative", zIndex: 10 }}>
          {showCategoryDropdown && (
            <Pressable
              style={{
                position: "absolute",
                top: -SCREEN_HEIGHT,
                bottom: -SCREEN_HEIGHT,
                left: -SCREEN_HEIGHT,
                right: -SCREEN_HEIGHT,
                zIndex: 90,
              }}
              onPress={() => setShowCategoryDropdown(false)}
            />
          )}

          <View style={styles.liveTVControlRow}>
            <View style={styles.liveTVSearchContainer}>
              <TextInput
                style={styles.liveTVSearchInput}
                placeholder="Search channels..."
                placeholderTextColor="#8E8D92"
                value={liveTVSearchQuery}
                onChangeText={setLiveTVSearchQuery}
              />
            </View>
            
            <TouchableOpacity
              style={styles.liveTVDropdown}
              onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
              activeOpacity={0.8}
            >
              <Text style={styles.liveTVDropdownText} numberOfLines={1}>
                {selectedCategory === "All" ? "All Categories" : selectedCategory}
              </Text>
              <Text style={{ color: "#8E8D92", fontSize: 10, marginLeft: 6 }}>▼</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.liveTVRefreshButton}
              onPress={() => loadSections(true, "LiveTV", activeLiveTVProvider, true)}
              disabled={sectionsLoading}
              activeOpacity={0.75}
            >
              {sectionsLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <RotateCw size={16} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Floating Modern Dropdown */}
          {showCategoryDropdown && (
            <Reanimated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={[styles.floatingDropdown, { top: 60, right: 68, zIndex: 100 }]}
            >
              <LinearGradient
                colors={["#1c1c22", "#0f0f12"]}
                style={StyleSheet.absoluteFillObject}
              />
              <ScrollView
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                style={{ maxHeight: 280 }}
              >
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    selectedCategory === "All" && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCategory("All");
                    setShowCategoryDropdown(false);
                  }}
                >
                  <View style={styles.dropdownItemLeft}>
                    <View
                      style={[
                        styles.seasonNumberBox,
                        selectedCategory === "All" && styles.seasonNumberBoxSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.seasonNumberText,
                          selectedCategory === "All" && styles.seasonNumberTextSelected,
                          { fontSize: 10 }
                        ]}
                      >
                        ALL
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedCategory === "All" && styles.dropdownItemTextSelected,
                      ]}
                    >
                      All Categories
                    </Text>
                  </View>
                  {selectedCategory === "All" && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>

                {categoriesList.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.dropdownItem,
                      selectedCategory === cat && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat);
                      setShowCategoryDropdown(false);
                    }}
                  >
                    <View style={styles.dropdownItemLeft}>
                      <View
                        style={[
                          styles.seasonNumberBox,
                          selectedCategory === cat && styles.seasonNumberBoxSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.seasonNumberText,
                            selectedCategory === cat && styles.seasonNumberTextSelected,
                            { fontSize: 10 }
                          ]}
                        >
                          {cat.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selectedCategory === cat && styles.dropdownItemTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {cat}
                      </Text>
                    </View>
                    {selectedCategory === cat && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Reanimated.View>
          )}

          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40, paddingHorizontal: 20 }}>
              <Text style={{ color: "#8E8D92", fontSize: 13, textAlign: "center" }}>
                No channels match your search or filter.
              </Text>
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {filtered.map((item, idx) => (
                <ChannelCard
                  key={item.url + idx}
                  item={item}
                  onPress={(i) =>
                    goDetail(i, {
                      x: 0,
                      y: 0,
                      width: S_CARD_W,
                      height: S_CARD_W,
                      borderRadius: 22,
                    })
                  }
                  isSaved={savedUrls.has(item.url)}
                  onToggleSave={handleToggleSaveChannel}
                  width={S_CARD_W}
                />
              ))}
            </View>
          )}
        </View>
      );
    }

    const displaySections = sections.filter((_: HomeSection, i: number) => i !== heroSectionIdx);

    return displaySections.map((section: HomeSection, idx: number) => (
      <SectionRow
        key={section.name + idx}
        section={section}
        navigation={navigation}
        goDetail={goDetail}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        isLiveTab={false}
        savedUrls={savedUrls}
        onToggleSave={handleToggleSaveChannel}
      />
    ));
  }, [
    sections,
    sectionsLoading,
    loadingCategory,
    sectionError,
    heroSectionIdx,
    navigation,
    goDetail,
    activeTab,
    savedUrls,
    handleToggleSaveChannel,
    liveTVSearchQuery,
    selectedCategory,
    showCategoryDropdown,
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

        {/* ── LiveTV Provider sub-tab row ── */}
        {CATEGORY_TABS[activeTab] === "LiveTV" && liveTVProviders.length > 0 && (
          <Animated.View
            style={[
              styles.subHeaderContainer,
              {
                top: insets.top + 4 + 48 + 8,
              },
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subTabRow}
              style={styles.tabRowWrap}
            >
              {liveTVProviders.map((provider) => {
                const isActive = provider.name === activeLiveTVProvider;
                return (
                  <TouchableOpacity
                    key={provider.id}
                    onPress={() => handleLiveTVProviderPress(provider.name)}
                    activeOpacity={0.75}
                    style={[styles.subTabItem, isActive && styles.subTabItemActive]}
                  >
                    <Text
                      style={[styles.subTabText, isActive && styles.subTabTextActive]}
                    >
                      {provider.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

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
              scrollEnabled={!showCategoryDropdown}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="transparent"
                  colors={["transparent"]}
                  progressBackgroundColor="transparent"
                  progressViewOffset={insets.top + (CATEGORY_TABS[activeTab] === "LiveTV" ? 115 : 65)}
                />
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingTop: insets.top + (CATEGORY_TABS[activeTab] === "LiveTV" ? 110 : 60),
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
                {CATEGORY_TABS[activeTab] !== "LiveTV" && (
                  <>
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
                  </>
                )}

                {/* Main empty state card removed */}

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
          <HomeSkeletonScreen isLive={CATEGORY_TABS[activeTab] === "LiveTV" || loadingCategory === "LiveTV"} />
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

  // category tabs — floating capsule with animated glass background
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
  subHeaderContainer: {
    position: "absolute",
    left: 20,
    right: 20,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    zIndex: 140,
    backgroundColor: "rgba(20, 18, 24, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  subTabRow: {
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  subTabItem: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  subTabItemActive: {
    backgroundColor: "rgba(0, 71, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 71, 255, 0.3)",
  },
  subTabText: {
    color: "#8E8D92",
    fontSize: 12,
    fontWeight: "600",
  },
  subTabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  liveTVControlRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 8,
    alignItems: "center",
    zIndex: 10,
  },
  liveTVSearchContainer: {
    flex: 1.6,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  liveTVSearchInput: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
  },
  liveTVDropdown: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  liveTVDropdownText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "80%",
  },
  floatingDropdown: {
    position: "absolute",
    top: 44, // Right below the live tv dropdown button (height: 40)
    right: 0,
    width: 220,
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
  liveTVRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 16,
  },
});
