import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView, BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { HomeSection, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import { useTransitionActions } from '../context/TransitionContext';
import type { CardLayout } from '../context/TransitionContext';

import { theme } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Hero carousel dimensions — center card large, side cards peek ~18%
const HERO_CARD_WIDTH = SCREEN_WIDTH * 0.6;
const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.45;
const HERO_SIDE_PAD = 16;
const HERO_SNAP = HERO_CARD_WIDTH + HERO_SIDE_PAD * 2;
const HERO_OFFSET = (SCREEN_WIDTH - HERO_CARD_WIDTH) / 2 - HERO_SIDE_PAD;

const CATEGORY_TABS = ['Trending', 'New', 'Movies', 'Series', 'TV Show', 'Cartoon'];

// Display genre/duration/rating tags for hero cards (rotated per item index)
const GENRE_SETS = [
  ['Fantasy', '2h 7min', '5.9'],
  ['Action', '1h 58min', '7.2'],
  ['Drama', '2h 14min', '6.8'],
  ['Comedy', '1h 45min', '7.5'],
];function getLowQualityImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes("images.metahub.space")) {
    return url.replace("/medium/", "/small/").replace("/large/", "/small/");
  }
  if (url.includes("image.tmdb.org/t/p/")) {
    return url.replace(/\/t\/p\/[^/]+\//, "/t/p/w185/");
  }
  if (url.includes("media-amazon.com/images/") || url.includes("m.media-amazon.com/")) {
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
  width: number | string;
  height: number;
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
      ])
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
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        opacity,
      }}
    />
  );
}

// ── Hero card (large carousel item) ─────────────────────────────────────────
const HeroCard = React.memo(function HeroCard({
  item,
  index,
  scrollX,
  onPress,
}: {
  item: MediaItem;
  index: number;
  scrollX: Animated.Value;
  onPress: (item: MediaItem, layout: CardLayout) => void;
}) {
  const viewRef = useRef<any>(null);
  const pressScale = useRef(new Animated.Value(1)).current;

  const inputRange = [
    (index - 1) * HERO_SNAP,
    index * HERO_SNAP,
    (index + 1) * HERO_SNAP,
  ];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.9, 1.2, 0.9],
    extrapolate: 'clamp',
  });
  const fadeOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.4, 1.0, 0.4],
    extrapolate: 'clamp',
  });

  const combinedScale = Animated.multiply(scale, pressScale);

  function handlePress() {
    viewRef.current?.measure(
      (_fx: number, _fy: number, width: number, height: number, px: number, py: number) => {
        const isActive = index === heroIdx;
        const S = isActive ? 1.12 : 0.84; // 1.2 * 0.93 or 0.9 * 0.93 combined scale factor
        const sWidth = width * S;
        const sHeight = height * S;
        const sX = px + (width - sWidth) / 2;
        const sY = py + (height - sHeight) / 2;
        onPress(item, { x: sX, y: sY, width: sWidth, height: sHeight, borderRadius: 18 });
      }
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() =>
        Animated.spring(pressScale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      style={{
        width: HERO_CARD_WIDTH + HERO_SIDE_PAD * 2,
        paddingHorizontal: HERO_SIDE_PAD,
        paddingVertical: 6,
      }}
    >
      <View ref={viewRef}>
        <Animated.View
          style={[styles.heroCard, { transform: [{ scale: combinedScale }], opacity: fadeOpacity }]}
        >
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={styles.heroPosterImg}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.heroPosterFallback} />
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
});

// ── Small section card ───────────────────────────────────────────────────────
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const S_CARD_H = S_CARD_W * 1.5;

const SmallCard = React.memo(function SmallCard({
  item,
  onPress,
}: {
  item: MediaItem;
  onPress: (item: MediaItem, layout: CardLayout) => void;
}) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    viewRef.current?.measure(
      (_fx: number, _fy: number, width: number, height: number, px: number, py: number) => {
        const S = 0.93; // Small card press scale
        const sWidth = width * S;
        const sHeight = height * S;
        const sX = px + (width - sWidth) / 2;
        const sY = py + (height - sHeight) / 2;
        onPress(item, { x: sX, y: sY, width: sWidth, height: sHeight, borderRadius: 12 });
      }
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      style={{ marginRight: 8 }}
    >
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {item.posterUrl ? (
            <Image source={{ uri: item.posterUrl }} style={styles.smallCardImg} resizeMode="cover" />
          ) : (
            <View style={[styles.smallCardImg, styles.cardFallback]} />
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
});

// ── Continue Watching card ───────────────────────────────────────────────────
const CW_CARD_W = S_CARD_W * 1.2;

const ContinueCard = React.memo(function ContinueCard({
  item,
  onPress,
}: {
  item: any;
  onPress: (item: MediaItem, layout: CardLayout) => void;
}) {
  const viewRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const pct = Math.min(Math.max((item.position / item.duration) * 100, 0), 100);

  function handlePress() {
    viewRef.current?.measure(
      (_fx: number, _fy: number, width: number, height: number, px: number, py: number) => {
        const S = 0.93; // Continue card press scale
        const sWidth = width * S;
        const sHeight = height * S;
        const sX = px + (width - sWidth) / 2;
        const sY = py + (height - sHeight) / 2;
        onPress(item as MediaItem, { x: sX, y: sY, width: sWidth, height: sHeight, borderRadius: 12 });
      }
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      style={{ marginRight: 8, width: CW_CARD_W }}
    >
      <View ref={viewRef}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {item.posterUrl ? (
            <Image source={{ uri: item.posterUrl }} style={styles.cwCardImg} resizeMode="cover" />
          ) : (
            <View style={[styles.cwCardImg, styles.cardFallback]} />
          )}
          <View style={styles.cwProgressBg}>
            <View style={[styles.cwProgressFill, { width: (pct + '%') as any }]} />
          </View>
          {item.type === 'series' && (
            <View style={styles.cwBadge}>
              <Text style={styles.cwBadgeTxt}>
                S{item.season} E{item.episode}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
      <Text style={styles.cwTitle} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
});

// ── Premium Skeleton Loading Screen ──────────────────────────────────────────
function HomeSkeletonScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Category header capsule skeleton */}
      <View style={[styles.headerContainer, { top: insets.top + 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }]}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, alignItems: 'center', gap: 12, height: '100%' }}>
          <SkeletonBox width={70} height={26} borderRadius={13} />
          <SkeletonBox width={50} height={26} borderRadius={13} />
          <SkeletonBox width={65} height={26} borderRadius={13} />
          <SkeletonBox width={55} height={26} borderRadius={13} />
          <SkeletonBox width={80} height={26} borderRadius={13} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: 110 }}>
        {/* Carousel layout skeleton (matching peak side cards) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 14 }}>
          {/* Left peek card */}
          <View style={{ opacity: 0.35 }}>
            <SkeletonBox width={SCREEN_WIDTH * 0.15} height={HERO_CARD_HEIGHT * 0.9} borderRadius={18} />
          </View>
          {/* Active center card */}
          <SkeletonBox width={HERO_CARD_WIDTH} height={HERO_CARD_HEIGHT} borderRadius={18} />
          {/* Right peek card */}
          <View style={{ opacity: 0.35 }}>
            <SkeletonBox width={SCREEN_WIDTH * 0.15} height={HERO_CARD_HEIGHT * 0.9} borderRadius={18} />
          </View>
        </View>

        {/* Hero meta skeleton */}
        <View style={{ alignItems: 'center', marginVertical: 20, gap: 10 }}>
          <SkeletonBox width={50} height={12} borderRadius={6} />
          <SkeletonBox width={220} height={22} borderRadius={11} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <SkeletonBox width={60} height={20} borderRadius={10} />
            <SkeletonBox width={80} height={20} borderRadius={10} />
            <SkeletonBox width={55} height={20} borderRadius={10} />
          </View>
          {/* Static dots */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <View style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.25)' }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
          </View>
        </View>

        {/* Sections skeleton */}
        <View style={{ paddingHorizontal: 20, marginTop: 10, gap: 28 }}>
          <View style={{ gap: 12 }}>
            <SkeletonBox width={130} height={16} borderRadius={8} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <SkeletonBox width={100} height={16} borderRadius={8} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
              <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { openFromCard, setFallbackRecommendations, setGlobalBlurTarget } = useTransitionActions();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = useCallback((val: any) => {
    if (val !== blurTargetRef.current) {
      blurTargetRef.current = val;
      setBlurTarget(val);
      setGlobalBlurTarget(val);
    }
  }, [setGlobalBlurTarget]);

  const [currentBg, setCurrentBg] = useState<string | null>(null);
  const [prevBg, setPrevBg] = useState<string | null>(null);
  const bgFadeAnim = useRef(new Animated.Value(0)).current;

  // Premium Crossfade Skeleton Loading States
  const [showSkeleton, setShowSkeleton] = useState(true);
  const skeletonOpacity = useRef(new Animated.Value(1)).current;

  // Active Hero Declarations (hoisted for scope safety inside hooks)
  const heroSection = sections.find(
    (s) => s.name !== 'Continue Watching' && s.items?.length > 0
  );
  const heroItems = heroSection?.items?.slice(0, 10) ?? [];
  const hero = heroItems[heroIdx] ?? null;
  const tags = GENRE_SETS[heroIdx % GENRE_SETS.length];
  const heroSectionIdx = sections.indexOf(heroSection as HomeSection);

  // Synchronize active hero index with scroll position in real-time
  useEffect(() => {
    if (heroItems.length === 0) return;
    const listenerId = scrollX.addListener(({ value }) => {
      const index = Math.max(0, Math.min(Math.round(value / HERO_SNAP), heroItems.length - 1));
      if (index !== heroIdx) {
        setHeroIdx(index);
      }
    });
    return () => {
      scrollX.removeListener(listenerId);
    };
  }, [heroIdx, heroItems.length]);

  // Reset active hero index when sections/tabs change
  useEffect(() => {
    setHeroIdx(0);
  }, [sections]);

  useEffect(() => {
    if (hero?.posterUrl) {
      const newUrl = getLowQualityImageUrl(hero.posterUrl) || null;
      if (newUrl !== currentBg) {
        setPrevBg(currentBg);
        setCurrentBg(newUrl);
        bgFadeAnim.setValue(0);
        Animated.timing(bgFadeAnim, {
          toValue: 0.45,
          duration: 350,
          useNativeDriver: true,
        }).start((finished) => {
          if (finished) {
            setPrevBg(null);
          }
        });
      }
    } else if (!hero) {
      setCurrentBg(null);
      setPrevBg(null);
    }
  }, [hero]);

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [40, 180],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    init();
    const unsub = navigation.addListener('focus', () => {
      loadSections(false, CATEGORY_TABS[activeTab]);
      setGlobalBlurTarget(blurTargetRef.current);
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
          ? 'No internet connection.'
          : e.message || 'Failed to load.'
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

  async function loadSections(force: boolean = false, categoryName: string = CATEGORY_TABS[activeTab]) {
    if (!force) setSectionsLoading(true);
    setSectionError(null);
    try {
      const secs: HomeSection[] = await bridge.getMainPage('', 1, force, categoryName);
      try {
        const hist = await bridge.getPlaybackHistory();
        if (hist && hist.length > 0) {
          secs.unshift({
            name: 'Continue Watching',
            items: hist.map((h: any) => ({
              provider: 'Cinemeta',
              url: h.mediaType + '/' + h.imdbId,
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

      // Collect some recommended items from general sections as a fallback
      const fallbacks: MediaItem[] = [];
      secs.forEach((s) => {
        if (s.name !== 'Continue Watching' && s.items) {
          fallbacks.push(...s.items.slice(0, 5));
        }
      });
      if (fallbacks.length > 0) {
        // Shuffle or unique them
        const unique = Array.from(new Set(fallbacks.map(f => f.url)))
          .map(url => fallbacks.find(f => f.url === url))
          .filter(Boolean) as MediaItem[];
        setFallbackRecommendations(unique.slice(0, 10));
      }
    } catch (e: any) {
      setSectionError(
        e instanceof bridge.OfflineError
          ? 'No internet connection.'
          : e.message || 'Failed to load.'
      );
    } finally {
      setSectionsLoading(false);
    }
  }

  const handleTabPress = (index: number) => {
    setActiveTab(index);
    loadSections(false, CATEGORY_TABS[index]);
  };

  const goDetail = useCallback((item: MediaItem, layout: CardLayout) => {
    openFromCard(item, layout);
  }, [openFromCard]);

  const renderedSections = useMemo(() => {
    if (sectionError) {
      return (
        <View style={styles.center}>
          <Text style={styles.errText}>{sectionError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadSections()}>
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (sectionsLoading) {
      return (
        <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
          <SkeletonBox width={80} height={16} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
            <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
          </View>
        </View>
      );
    }
    return sections
      .filter((_: HomeSection, i: number) => i !== heroSectionIdx)
      .map((section: HomeSection, idx: number) => {
        const isCW = section.name === 'Continue Watching';
        return (
          <View key={section.name + idx} style={styles.section}>
            <View style={styles.sectionHdr}>
              <Text style={styles.sectionTitle}>{section.name}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate('SeeAll', { title: section.name, items: section.items })}
              >
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={section.items}
              keyExtractor={(_: any, i: number) => String(i)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              renderItem={({ item }: { item: any }) =>
                isCW ? (
                  <ContinueCard item={item} onPress={goDetail} />
                ) : (
                  <SmallCard item={item as MediaItem} onPress={goDetail} />
                )
              }
            />
          </View>
        );
      });
  }, [sections, sectionsLoading, sectionError, heroSectionIdx, navigation, goDetail]);

  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>
        {/* Background Ambient Poster Glow */}
        <BlurTargetView ref={setBlurTargetRef as any} style={[styles.backgroundContainer, { zIndex: 0 }]} pointerEvents="none">
          {prevBg ? (
            <Image
              source={{ uri: prevBg }}
              style={styles.backgroundImage}
              resizeMode="cover"
              blurRadius={20}
            />
          ) : null}
          {currentBg ? (
            <Animated.Image
              source={{ uri: currentBg }}
              style={[styles.backgroundImage, { opacity: bgFadeAnim }]}
              resizeMode="cover"
              blurRadius={20}
            />
          ) : null}
          <LinearGradient
            colors={['rgba(5, 5, 5, 0.1)', 'rgba(5, 5, 5, 0.5)', '#050505']}
            style={styles.gradientOverlay}
          />
        </BlurTargetView>

        <Animated.View style={{ flex: 1, zIndex: 1 }}>
          {/* ── Category tab row ── */}
          <Animated.View style={[styles.headerContainer, { top: insets.top + 4 }]}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: headerBgOpacity }]}>
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
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20, 18, 24, 0.95)' }]} />
                )}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 20, 0.38)' }]} />
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
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: 110 }}
              style={{ flex: 1, overflow: 'visible' }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
            >
            {/* Hero carousel */}
            {sectionsLoading || heroItems.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <SkeletonBox
                  width={HERO_CARD_WIDTH}
                  height={HERO_CARD_HEIGHT}
                  borderRadius={18}
                />
              </View>
            ) : (
              <Animated.FlatList
                key={`hero-list-${activeTab}`}
                data={heroItems}
                keyExtractor={(_: any, i: number) => String(i)}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={HERO_SNAP}
                snapToAlignment="center"
                decelerationRate="fast"
                disableIntervalMomentum={true}
                style={{ overflow: 'visible' }}
                getItemLayout={(_, index) => ({
                  length: HERO_SNAP,
                  offset: HERO_SNAP * index,
                  index,
                })}
                contentContainerStyle={{ 
                  paddingHorizontal: HERO_OFFSET,
                  paddingVertical: 35, // Safety padding for 1.2x scale overflow
                  overflow: 'visible',
                }}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
                renderItem={({ item, index }: { item: MediaItem; index: number }) => (
                  <HeroCard
                    item={item}
                    index={index}
                    scrollX={scrollX}
                    onPress={goDetail}
                  />
                )}
              />
            )}

            {/* Year · Title · Chips · Dots */}
            {hero && !sectionsLoading && (
              <View style={styles.heroMeta}>
                <Text style={styles.heroYear}>2023</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {hero.title}
                </Text>
                <View style={styles.chipsRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{tags[0]}</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{tags[1]}</Text>
                  </View>
                  <View style={[styles.chip, styles.chipStar]}>
                    <Text style={styles.chipStarTxt}>{'\u2605'} {tags[2]}</Text>
                  </View>
                </View>
                <View style={styles.dots}>
                  {heroItems.slice(0, 6).map((_: any, i: number) => (
                    <View
                      key={i}
                      style={[styles.dot, i === heroIdx && styles.dotActive]}
                    />
                  ))}
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
          style={[StyleSheet.absoluteFillObject, { opacity: skeletonOpacity, zIndex: 100, backgroundColor: theme.colors.background }]} 
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
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: SCREEN_HEIGHT * 0.65,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  // category tabs — floating capsule with animated glass background
  headerContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  blurBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  tabRowWrap: {
    flex: 1,
  },
  tabRow: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
    height: '100%',
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: theme.colors.accent, // Primary color
  },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#ffffff', fontWeight: '700' },

  // hero card — poster only, scale+opacity animated by parent FlatList
  heroCard: {
    width: HERO_CARD_WIDTH,
    height: HERO_CARD_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.placeholder,
  },
  heroPosterImg: { width: '100%', height: '100%' },
  heroPosterFallback: { flex: 1, backgroundColor: theme.colors.placeholder },

  // info below carousel: year → bold title → chips → dots
  heroMeta: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  heroYear: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },

  // outline pill chips
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  chipTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  chipStar: { borderColor: 'rgba(255,196,0,0.5)' },
  chipStarTxt: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },

  // pagination dots: inactive=circle, active=wide pill
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: { width: 18, backgroundColor: '#ffffff' },

  // section rows
  section: { marginTop: 22 },
  sectionHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  cwProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderBottomLeftRadius: 12,
  },
  cwBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255, 74, 125, 0.85)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cwBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },
  cwTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 },

  // utility
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errText: {
    color: '#fca5a5',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryTxt: { color: '#fff', fontWeight: '700' },
});
