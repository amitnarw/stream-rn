import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, {
  FadeIn,
} from "react-native-reanimated";
import {
  ArrowLeft,
  ChevronDown,
  RotateCw,
  Search,
  WifiOff,
} from "lucide-react-native";
import { theme } from "../theme";
import type { MediaItem, PluginProvider } from "../types/plugin";
import {
  getAvailableIPTVProviders,
  getDefaultIPTVProvider,
  getLiveTVChannels,
  loadLinks,
  playStream,
  setDefaultIPTVProvider,
  type LiveChannel,
} from "../api/cloudStreamBridge";
import ChannelCard from "../components/ChannelCard";
import ProviderPickerSheet from "../components/ProviderPickerSheet";
import PickerSheet from "../components/PickerSheet";
import QuickScrollFab from "../components/QuickScrollFab";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const C_CARD_W = (SCREEN_WIDTH - 40 - 16) / 3 - 2;
const PAGE_SIZE = 90;

export default function LiveTVScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();

  const [providers, setProviders] = useState<{
    m3u: PluginProvider[];
    cs: PluginProvider[];
  }>({ m3u: [], cs: [] });
  const [activeProvider, setActiveProvider] = useState<string>("");
  const [savedDefault, setSavedDefault] = useState<string>("");
  const [allChannels, setAllChannels] = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [page, setPage] = useState<number>(1);
  const [showProviderSheet, setShowProviderSheet] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [resolvingChannel, setResolvingChannel] = useState<string | null>(null);

  // Single deterministic init:
  // 1. Read saved default + cached provider list synchronously -> show pill immediately
  // 2. Then fetch live providers + channels in background
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [saved, cachedListJson] = await Promise.all([
          getDefaultIPTVProvider(),
          AsyncStorage.getItem("@zuno_iptv_providers_cache_v1"),
        ]);
        if (!mounted) return;
        setSavedDefault(saved || "");

        const cachedList = cachedListJson
          ? (JSON.parse(cachedListJson) as {
              m3u: PluginProvider[];
              cs: PluginProvider[];
            })
          : null;

        // Always seed an initial activeProvider so the pill never shows blank.
        // Default new installs and stale defaults to "Zuno TV" (the curated Hindi playlist).
        const allCachedNames = cachedList
          ? cachedList.m3u.concat(cachedList.cs).map((p) => p.name)
          : [];
        const isSavedValid = !!(saved && allCachedNames.includes(saved));
        const preliminary =
          (isSavedValid ? saved : null) ||
          (cachedList ? cachedList.m3u[0]?.name || cachedList.cs[0]?.name : null) ||
          "Zuno TV";
        setActiveProvider(preliminary);

        // Migrate stale/missing defaults to "Zuno TV" on first launch after this update.
        if (!isSavedValid && preliminary === "Zuno TV") {
          setDefaultIPTVProvider("Zuno TV").catch(() => {});
        }

        if (cachedList) {
          setProviders(cachedList);
        }

        // Step 2: refresh providers list in the background
        (async () => {
          try {
            const live = await getAvailableIPTVProviders();
            if (!mounted) return;
            setProviders(live);
            AsyncStorage.setItem(
              "@zuno_iptv_providers_cache_v1",
              JSON.stringify(live)
            ).catch(() => {});
            const all = [...live.m3u, ...live.cs];
            if (preliminary && !all.some((p) => p.name === preliminary)) {
              const fallback = live.m3u[0]?.name || live.cs[0]?.name || preliminary;
              setActiveProvider(fallback);
            }
          } catch (_) {}
        })();

        // Step 3: load channels (in-memory cache will make this instant after first run)
        try {
          const { channels, categories: cats } = await getLiveTVChannels(preliminary);
          if (!mounted) return;
          setAllChannels(channels);
          setCategories(cats);
          setLoading(false);
        } catch (e: any) {
          if (mounted) {
            setError(e?.message || "Failed to load channels");
            setLoading(false);
          }
        }
      } catch (_) {
        if (mounted) setLoading(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const allProviders = useMemo(() => {
    return [...providers.m3u, ...providers.cs];
  }, [providers]);

  // Always show a real provider name in the top-bar pill.
  // Falls back to the saved default, then to "Zuno TV".
  const providerDisplayName = useMemo(() => {
    return activeProvider || savedDefault || "Zuno TV";
  }, [activeProvider, savedDefault]);

  const loadChannels = useCallback(
    async (force: boolean = false) => {
      if (!activeProvider) return;
      setError(null);
      setLoading(true);
      try {
        const { channels, categories: cats } = await getLiveTVChannels(activeProvider, force);
        if (!mountedRef.current) return;
        setAllChannels(channels);
        setCategories(cats);
      } catch (e: any) {
        if (mountedRef.current) {
          setError(e?.message || "Failed to load channels");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [activeProvider]
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const flatListRef = useRef<FlatList<LiveChannel>>(null);

  const handleScrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleScrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    setSelectedCategory("All");
    setSearch("");
    setPage(1);
    if (activeProvider) loadChannels(false);
  }, [activeProvider, loadChannels]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChannels(true);
  }, [loadChannels]);

  const categoriesList = categories;

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allChannels.filter((ch) => {
      if (selectedCategory !== "All" && ch.category !== selectedCategory) return false;
      if (q && !ch.item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allChannels, selectedCategory, search]);

  const displayedChannels = useMemo(() => {
    return filteredChannels.slice(0, page * PAGE_SIZE);
  }, [filteredChannels, page]);

  const hasMore = displayedChannels.length < filteredChannels.length;
  const totalFiltered = filteredChannels.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setPage((p) => p + 1);
  }, [hasMore]);

  const bodyContent = useMemo(() => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorCard}>
            <WifiOff size={36} color={theme.colors.rose} />
            <Text style={styles.errorTitle}>Couldn't load channels</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => loadChannels(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (loading && allChannels.length === 0) {
      return (
        <View style={{ padding: 20 }}>
          {[1, 2, 3, 4].map((r) => (
            <View key={r} style={{ marginBottom: 18 }}>
              <View
                style={{
                  width: 120,
                  height: 14,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  marginBottom: 10,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: C_CARD_W,
                      height: C_CARD_W,
                      borderRadius: 20,
                      backgroundColor: "rgba(255,255,255,0.05)",
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    return (
      <FlatList
        ref={flatListRef}
        data={displayedChannels}
        numColumns={3}
        keyExtractor={(item, idx) => item.item.url + "_" + idx}
        columnWrapperStyle={{
          paddingHorizontal: 20,
          gap: 8,
          marginBottom: 8,
        }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item: ch }) => (
          <ChannelCard
            item={ch.item}
            onPress={(it) => playChannel(it)}
            isSaved={false}
            onToggleSave={() => {}}
            width={C_CARD_W}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        ListFooterComponent={
          hasMore ? (
            <View style={{ alignItems: "center", paddingVertical: 18 }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#8E8D92", marginTop: 6, fontSize: 11 }}>
                Loading more channels…
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Text style={{ color: "#8E8D92", fontSize: 13 }}>
              No channels match your search or filter.
            </Text>
          </View>
        }
      />
    );
  }, [error, loading, allChannels.length, displayedChannels, loadMore, onRefresh, refreshing, hasMore, loadChannels]);

  const playChannel = useCallback(async (item: MediaItem) => {
    setResolvingChannel(item.title);
    try {
      const result = await loadLinks(item.provider, item.url);
      if (result.sources && result.sources.length > 0) {
        const source = result.sources[0];
        const channelIndex = filteredChannels.findIndex(
          (ch) => ch.item.url === item.url
        );
        const channelsJson = JSON.stringify(
          filteredChannels.map((ch) => ({
            title: ch.item.title,
            posterUrl: ch.item.posterUrl,
            url: ch.item.url,
            provider: ch.item.provider,
            category: ch.category,
          }))
        );
        playStream(
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
          item.url,
          false,
          channelsJson,
          channelIndex >= 0 ? channelIndex : -1
        );
      }
    } catch (_) {
      /* silent fail */
    } finally {
      setResolvingChannel(null);
    }
  }, [filteredChannels]);

  const handlePickProvider = useCallback((name: string) => {
    setActiveProvider(name);
    setShowProviderSheet(false);
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["rgba(0, 71, 255, 0.10)", "rgba(5, 5, 5, 0)"]}
        style={[styles.topGlow, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation?.goBack?.()}
            activeOpacity={0.75}
          >
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.topTitle} numberOfLines={1}>
              Live TV
            </Text>
            <Text style={styles.topSubtitle} numberOfLines={1}>
              {allChannels.length > 0
                ? `${totalFiltered} channels`
                : loading
                ? "Loading…"
                : "No channels"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.topBarProviderPill}
            onPress={() => setShowProviderSheet(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.topBarProviderPillText} numberOfLines={1}>
              {providerDisplayName}
            </Text>
            <ChevronDown size={12} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search + Category + Refresh */}
        <View style={styles.controlRow}>
          <View style={styles.searchBox}>
            <Search size={14} color="#8E8D92" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search channels..."
              placeholderTextColor="#8E8D92"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowCategoryDropdown(true)}
            activeOpacity={0.8}
            disabled={allChannels.length === 0}
          >
            <Text style={styles.dropdownText} numberOfLines={1}>
              {selectedCategory === "All"
                ? "All Categories"
                : selectedCategory}
            </Text>
            <ChevronDown size={12} color="#8E8D92" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            activeOpacity={0.75}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <RotateCw size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Body */}
      <Reanimated.View
        entering={FadeIn.duration(220)}
        style={{ flex: 1 }}
      >
        {bodyContent}
      </Reanimated.View>

      {resolvingChannel && (
        <View style={styles.resolvingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.resolvingText}>{resolvingChannel}</Text>
        </View>
      )}

      {displayedChannels.length > 0 && (
        <QuickScrollFab
          onScrollToTop={handleScrollToTop}
          onScrollToBottom={handleScrollToBottom}
          bottomOffset={100}
          rightOffset={20}
        />
      )}

      {/* Premium Provider Bottom Sheet */}
      <ProviderPickerSheet
        visible={showProviderSheet}
        onClose={() => setShowProviderSheet(false)}
        m3uProviders={providers.m3u}
        csProviders={providers.cs}
        activeProvider={providerDisplayName}
        onSelect={handlePickProvider}
        onSetDefault={async (name) => {
          await setDefaultIPTVProvider(name);
        }}
      />

      {/* Category dropdown */}
      <PickerSheet
        visible={showCategoryDropdown}
        onClose={() => setShowCategoryDropdown(false)}
        title="Select Category"
        subtitle="Tap a category to filter channels."
        options={["All Categories", ...categoriesList]}
        activeOption={
          selectedCategory === "All" ? "All Categories" : selectedCategory
        }
        onSelect={(option) => {
          setSelectedCategory(option === "All Categories" ? "All" : option);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topGlow: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(15, 15, 20, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  topSubtitle: {
    color: "#8E8D92",
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.4,
  },

  // Compact provider pill (right side of top bar)
  topBarProviderPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    maxWidth: 170,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    gap: 4,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  topBarProviderPillText: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    minWidth: 40,
  },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    paddingVertical: 0,
  },
  dropdown: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sectionCount: {
    color: "#8E8D92",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  errorCard: {
    backgroundColor: "rgba(20, 18, 24, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: "#A0A0A5",
    fontSize: 12,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  resolvingOverlay: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    backgroundColor: "rgba(15, 15, 20, 0.85)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resolvingText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
