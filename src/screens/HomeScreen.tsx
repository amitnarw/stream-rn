import React, { useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeSection, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import { useTransitionActions } from '../context/TransitionContext';
import type { CardLayout } from '../context/TransitionContext';

import { theme } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Hero carousel dimensions — center card large, side cards peek ~18%
const HERO_CARD_WIDTH = SCREEN_WIDTH * 0.64;
const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.48;
const HERO_SIDE_PAD = 14;
const HERO_SNAP = HERO_CARD_WIDTH + HERO_SIDE_PAD * 2;
const HERO_OFFSET = (SCREEN_WIDTH - HERO_CARD_WIDTH) / 2 - HERO_SIDE_PAD;

const CATEGORY_TABS = ['Trending', 'New', 'Movies', 'Series', 'TV Show', 'Cartoon'];

// Display genre/duration/rating tags for hero cards (rotated per item index)
const GENRE_SETS = [
  ['Fantasy', '2h 7min', '5.9'],
  ['Action', '1h 58min', '7.2'],
  ['Drama', '2h 14min', '6.8'],
  ['Comedy', '1h 45min', '7.5'],
];

// ── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonBox({
  width,
  height,
  borderRadius = 6,
}: {
  width: number;
  height: number;
  borderRadius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, []);
  return (
    <Animated.View
      style={{ width, height, borderRadius, backgroundColor: theme.colors.placeholder, opacity }}
    />
  );
}

// ── Hero card (large carousel item) ─────────────────────────────────────────
function HeroCard({
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

  const inputRange = [
    (index - 1) * HERO_SNAP,
    index * HERO_SNAP,
    (index + 1) * HERO_SNAP,
  ];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.9, 1, 0.9],
    extrapolate: 'clamp',
  });
  const fadeOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.5, 1, 0.5],
    extrapolate: 'clamp',
  });

  function handlePress() {
    // Measure the card's absolute screen position, then fire transition
    viewRef.current?.measure(
      (_fx: number, _fy: number, width: number, height: number, px: number, py: number) => {
        onPress(item, { x: px, y: py, width, height, borderRadius: 18 });
      }
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={{
        width: HERO_CARD_WIDTH + HERO_SIDE_PAD * 2,
        paddingHorizontal: HERO_SIDE_PAD,
        paddingVertical: 6,
      }}
    >
      <View ref={viewRef}>
        <Animated.View
          style={[styles.heroCard, { transform: [{ scale }], opacity: fadeOpacity }]}
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
}

// ── Small section card ───────────────────────────────────────────────────────
const S_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3;
const S_CARD_H = S_CARD_W * 1.5;

function SmallCard({
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
        onPress(item, { x: px, y: py, width, height, borderRadius: 12 });
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
}

// ── Continue Watching card ───────────────────────────────────────────────────
const CW_CARD_W = S_CARD_W * 1.2;

function ContinueCard({
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
        onPress(item as MediaItem, { x: px, y: py, width, height, borderRadius: 12 });
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
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { openFromCard, setFallbackRecommendations } = useTransitionActions();

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    init();
    const unsub = navigation.addListener('focus', () => loadSections());
    return unsub;
  }, [navigation]);

  async function init() {
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
      setLoading(false);
    }
  }

  async function loadSections(force: boolean = false) {
    if (!force) setSectionsLoading(true);
    setSectionError(null);
    try {
      const secs: HomeSection[] = await bridge.getMainPage('', 1, force);
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

  function goDetail(item: MediaItem, layout: CardLayout) {
    openFromCard(item, layout);
  }

  const heroSection = sections.find(
    (s) => s.name !== 'Continue Watching' && s.items?.length > 0
  );
  const heroItems = heroSection?.items?.slice(0, 10) ?? [];
  const hero = heroItems[heroIdx] ?? null;
  const tags = GENRE_SETS[heroIdx % GENRE_SETS.length];
  const heroSectionIdx = sections.indexOf(heroSection as HomeSection);

  function onHeroScroll(e: any) {
    const x = e.nativeEvent.contentOffset.x;
    setHeroIdx(Math.max(0, Math.min(Math.round(x / HERO_SNAP), heroItems.length - 1)));
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View style={{ flex: 1 }}>
        {/* ── Category tab row ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
          style={styles.tabRowWrap}
        >
          {CATEGORY_TABS.map((tab, i) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.75}
              style={styles.tabItem}
            >
              <Text style={[styles.tabText, i === activeTab && styles.tabTextActive]}>
                {tab}
              </Text>
              {i === activeTab && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={init}>
              <Text style={styles.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110 }}
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
                data={heroItems}
                keyExtractor={(_: any, i: number) => String(i)}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={HERO_SNAP}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: HERO_OFFSET }}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: true, listener: onHeroScroll }
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
            {sectionError ? (
              <View style={styles.center}>
                <Text style={styles.errText}>{sectionError}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => loadSections()}
                >
                  <Text style={styles.retryTxt}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : sectionsLoading ? (
              <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
                <SkeletonBox width={80} height={16} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
                  <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
                  <SkeletonBox width={S_CARD_W} height={S_CARD_H} borderRadius={12} />
                </View>
              </View>
            ) : (
              sections
                .filter((_: HomeSection, i: number) => i !== heroSectionIdx)
                .map((section: HomeSection, idx: number) => {
                  const isCW = section.name === 'Continue Watching';
                  return (
                    <View key={section.name + idx} style={styles.section}>
                      <View style={styles.sectionHdr}>
                        <Text style={styles.sectionTitle}>{section.name}</Text>
                        <TouchableOpacity activeOpacity={0.7}>
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
                })
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  // category tabs — plain text, active is white + 2px underline
  tabRowWrap: { flexGrow: 0 },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 20,
    alignItems: 'center',
  },
  tabItem: { alignItems: 'center' },
  tabText: { color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: theme.colors.accentLight, fontWeight: '700' },
  tabUnderline: {
    height: 2,
    width: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
    marginTop: 3,
  },

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
