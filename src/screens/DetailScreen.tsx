import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
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
  LayoutAnimation,
  Pressable,
  Animated as RNAnimated,
  Modal,
  AppState,
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
  FadeOutDown,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView, BlurTargetView } from "expo-blur";
import {
  Play,
  ArrowLeft,
  Heart,
  AlertCircle,
  RotateCw,
  X,
  Download,
  Users,
  ChevronUp,
  ChevronDown,
  Settings,
  Server,
  Wifi,
  Languages,
  Volume2,
  Check,
  Activity,
  Database,
  Monitor,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as favoritesApi from "../api/favorites";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { theme } from "../theme";
import type { EpisodeItem, VideoSource, PluginProvider } from "../types/plugin";
import * as bridge from "../api/cloudStreamBridge";
import { useTransition } from "../context/TransitionContext";
import { CustomModal } from "../components/CustomModal";
import CustomVideoPlayer from "../components/CustomVideoPlayer";
import SkeletonPlaceholder from "../components/SkeletonPlaceholder";
import ActorAvatar from "../components/ActorAvatar";
import RecommendationCard from "../components/RecommendationCard";
import HeroEpisodeRow from "../components/HeroEpisodeRow";
import {
  parseAudioLanguages,
  extractTorrentSize,
  cleanQualityTag,
  extractResolution,
  normalizeLangCode,
} from "../utils/detailHelpers";
import { styles } from "./DetailScreen.styles";

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

/** Returns true if the raw error string looks like an ISP/network-level block */
function isIspBlock(err: string | undefined): boolean {
  if (!err) return false;
  const e = err.toLowerCase();
  return (
    e.includes("unresolvedaddress") ||
    e.includes("unknownhost") ||
    e.includes("dns blocked") ||
    e.includes("isp block") ||
    e.includes("sockettimeoutexception") ||
    e.includes("connect") ||
    e.includes("timeout")
  );
}

function cleanErrorMessage(err: string | undefined): string {
  if (!err) return "";
  const e = err.toLowerCase();
  if (
    e.includes("sockettimeoutexception") ||
    e.includes("timeout") ||
    e.includes("connect")
  ) {
    return "Blocked or unreachable";
  }
  if (
    e.includes("illegalargumentexception") ||
    e.includes("json") ||
    e.includes("nullpointer")
  ) {
    return "Server responded incorrectly";
  }
  if (
    e.includes("unresolvedaddress") ||
    e.includes("unknownhost") ||
    e.includes("dns")
  ) {
    return "Blocked by your network";
  }
  return "Failed to load links";
}

function cleanTorrentError(err: string | undefined): string {
  if (!err) return "Torrent failed to start.";
  const e = err.toLowerCase();
  if (
    e.includes("metadata resolution timed out") ||
    e.includes("no peers found") ||
    e.includes("bad magnet")
  ) {
    return "No seeders found\u002c this torrent link may be dead. Try a different source.";
  }
  if (e.includes("failed to add torrent handle")) {
    return "Could not start the torrent download. Try again.";
  }
  if (e.includes("no files found")) {
    return "Torrent has no playable video files.";
  }
  if (e.includes("network") || e.includes("connection")) {
    return "Network error while starting torrent. Check your connection.";
  }
  return "Torrent failed to start. Try a different source.";
}

/**
 * Maps a wide range of language names / abbreviations to short display codes.
 * Torrentio / Stremio expose audio languages only inside the release title
 * string — there is no structured API field — so we parse the filename.
 */

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = SCREEN_HEIGHT * 0.5; // 50% for hero, overlaps with sheet
const EASE_OUT = Easing.bezier(0.25, 1, 0.5, 1);

function getQualityBadgeBg(quality: string) {
  const q = quality.toLowerCase();
  if (q.includes("4k") || q.includes("2160")) return "#ff4a7d";
  if (q.includes("1080")) return "#0047FF";
  if (q.includes("720")) return "#2ecc71";
  if (q.includes("480") || q.includes("360")) return "#f39c12";
  return "rgba(255, 255, 255, 0.08)";
}

function getDomain(url: string) {
  try {
    const domain = url.match(
      /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im,
    );
    return domain ? domain[1] : "";
  } catch {
    return "";
  }
}

function getProtocolLabel(type: string, url: string) {
  const t = type.toLowerCase();
  if (t === "hls" || url.includes(".m3u8")) return "M3U8";
  if (t === "torrent" || url.startsWith("magnet:")) return "TORRENT";
  if (t === "dash" || url.includes(".mpd")) return "DASH";
  return "DIRECT";
}

function getCleanHostName(s: VideoSource) {
  const quality = s.quality || "";
  const host = s.host || "";
  let baseName = host || quality || "Direct";

  const separators = [/ • /, / · /, / - /, / \| /];
  for (const sep of separators) {
    if (sep.test(baseName)) {
      const parts = baseName.split(sep);
      const nonResolutionPart = parts.find(
        (p: string) => !/(?:2160|1080|720|480|360|4k|hd|sd)/i.test(p),
      );
      if (nonResolutionPart) {
        baseName = nonResolutionPart.trim();
        break;
      }
    }
  }

  baseName = baseName
    .replace(/\[?\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes)\]?/gi, "")
    .trim();
  baseName = baseName
    .replace(
      /\[(?:bluray|hdr|dv|dolby|hevc|x265|x264|h264|h265|ddp\d|aac|atmos|dts|web-dl|webrip|hdrip|brrip|hdtv|internal)[^\]]*\]/gi,
      "",
    )
    .trim();
  baseName = baseName
    .replace(
      /\b(?:2160p|1080p|720p|480p|360p|4k|2160|1080|720|480|360)\b/gi,
      "",
    )
    .trim();
  baseName = baseName.replace(/\s+/g, " ").trim();

  return baseName || "Direct";
}

function extractResolutionTag(s: VideoSource) {
  const textToSearch = `${s.quality} ${s.host || ""}`.toLowerCase();
  if (textToSearch.includes("4k") || textToSearch.includes("2160"))
    return "2160p";
  if (textToSearch.includes("1080")) return "1080p";
  if (textToSearch.includes("720")) return "720p";
  if (textToSearch.includes("480")) return "480p";
  if (textToSearch.includes("360")) return "360p";
  const match = textToSearch.match(/(\d+)(p|k|fps)/);
  return match ? `${match[1]}p` : "Auto";
}

/**
 * Self-contained torrent/magnet accordion. Owning the expand/collapse state here
 * means toggling it re-renders ONLY this small component — never the parent
 * DetailScreen (which renders the 100+ row source list, provider tabs, hero and
 * background blurs). That is what makes expand/collapse instant, mirroring the
 * player's fast accordion. `key` on the parent usage resets it per episode/detail.
 */
function TorrentAccordion({
  torrentSources,
  renderRow,
  alwaysExpanded = false,
}: {
  torrentSources: any[];
  renderRow: (source: any, idx: number) => React.ReactNode;
  alwaysExpanded?: boolean;
}) {
  const [accordionHeight, setAccordionHeight] = useState(0);
  const [torrentExpanded, setTorrentExpanded] = useState(alwaysExpanded);
  const accordionExpandShared = useSharedValue(0);

  const [selectedAudio, setSelectedAudio] = useState("All Audios");
  const [selectedSort, setSelectedSort] = useState("Highest Seeders");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [renderLimit, setRenderLimit] = useState(15);

  useEffect(() => {
    setRenderLimit(15);
    const timer = setTimeout(() => {
      setRenderLimit(100);
    }, 120);
    return () => clearTimeout(timer);
  }, [torrentSources, selectedAudio, selectedSort]);

  useEffect(() => {
    if (alwaysExpanded) {
      setTorrentExpanded(true);
    }
  }, [alwaysExpanded]);

  useEffect(() => {
    accordionExpandShared.value = withTiming(torrentExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  }, [torrentExpanded]);

  const accordionAnimatedStyle = useAnimatedStyle(() => ({
    height: accordionExpandShared.value * accordionHeight,
    opacity: accordionExpandShared.value,
    overflow: "hidden",
  }));

  const audioOptions = useMemo(() => {
    const set = new Set<string>();
    torrentSources.forEach((s: any) => {
      parseAudioLanguages(s.host || "")
        .split(",")
        .map((x: string) => x.trim())
        .forEach((l: string) => {
          if (l && l !== "—") set.add(l);
        });
    });
    return ["All Audios", ...Array.from(set).sort()];
  }, [torrentSources]);

  const parseSizeInMB = (host: string): number => {
    const sizeMatch = host.match(/💾\s*([\d.]+)\s*([MGB]+)/i);
    if (!sizeMatch) return 0;
    const val = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (unit.includes("G")) return val * 1024;
    return val;
  };

  const visibleSources = useMemo(() => {
    // 1. Filter by audio language
    let filtered = torrentSources;
    if (selectedAudio !== "All Audios") {
      filtered = torrentSources.filter((s: any) =>
        parseAudioLanguages(s.host || "")
          .split(",")
          .map((x: string) => x.trim())
          .includes(selectedAudio),
      );
    }

    // 2. Sort the filtered sources
    const sorted = [...filtered];
    if (selectedSort === "Highest Seeders") {
      sorted.sort(
        (a, b) => ((b as any).seeders ?? 0) - ((a as any).seeders ?? 0),
      );
    } else if (selectedSort === "Largest Size") {
      sorted.sort(
        (a, b) => parseSizeInMB(b.host || "") - parseSizeInMB(a.host || ""),
      );
    } else if (selectedSort === "Smallest Size") {
      sorted.sort(
        (a, b) => parseSizeInMB(a.host || "") - parseSizeInMB(b.host || ""),
      );
    }

    return sorted;
  }, [torrentSources, selectedAudio, selectedSort]);

  if (torrentSources.length === 0) return null;

  const renderContent = () => {
    return (
      <View style={{ width: "100%" }}>
        {/* Single horizontal row containing scrollable audio filters on left, and sort dropdown on right */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            marginBottom: 10,
            paddingHorizontal: 16,
            zIndex: 9999,
          }}
        >
          {/* Horizontal Audio Filter Pills (takes remaining space on left) */}
          {audioOptions.length > 1 ? (
            <View style={{ flex: 1, marginRight: 8, height: 26 }}>
              <MaskedView
                style={{ width: "100%", height: "100%" }}
                maskElement={
                  <LinearGradient
                    colors={["transparent", "black", "black", "transparent"]}
                    locations={[0, 0.08, 0.92, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                }
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
                >
                  {audioOptions.map((lang) => {
                    const isActive = selectedAudio === lang;
                    return (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.langFilterChip,
                          isActive && styles.langFilterChipActive,
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 12,
                          },
                        ]}
                        onPress={() => setSelectedAudio(lang)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.langFilterText,
                            isActive && styles.langFilterTextActive,
                            { fontSize: 10 },
                          ]}
                        >
                          {lang === "All Audios" ? "All" : lang}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </MaskedView>
            </View>
          ) : null}

          {/* Sort Dropdown on Right */}
          <View style={{ position: "relative", zIndex: 99999 }}>
            <TouchableOpacity
              style={[
                styles.seasonSelector,
                {
                  minWidth: 95,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  height: 28,
                  marginTop: 0,
                },
              ]}
              activeOpacity={0.7}
              onPress={() => setShowSortDropdown((v) => !v)}
            >
              <Text style={[styles.seasonText, { fontSize: 10 }]}>
                {selectedSort === "Highest Seeders"
                  ? "Seeders"
                  : selectedSort === "Largest Size"
                    ? "Size 💾"
                    : "Size 💾 Min"}
              </Text>
              <Text style={[styles.seasonIcon, { fontSize: 8, marginLeft: 4 }]}>
                ▼
              </Text>
            </TouchableOpacity>

            {showSortDropdown && (
              <View
                style={[
                  styles.floatingDropdown,
                  {
                    position: "absolute",
                    top: 32,
                    right: 0,
                    width: 140,
                    zIndex: 999999,
                  },
                ]}
              >
                <LinearGradient
                  colors={["#1c1c22", "#0f0f12"]}
                  style={StyleSheet.absoluteFillObject}
                />
                {[
                  { label: "Seeders", value: "Highest Seeders" },
                  { label: "Size (Max)", value: "Largest Size" },
                  { label: "Size (Min)", value: "Smallest Size" },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.dropdownItem,
                      selectedSort === opt.value && styles.dropdownItemSelected,
                      { paddingVertical: 8, paddingHorizontal: 12 },
                    ]}
                    onPress={() => {
                      setSelectedSort(opt.value);
                      setShowSortDropdown(false);
                    }}
                  >
                    <Text style={[styles.seasonText, { fontSize: 11 }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {visibleSources
          .slice(0, renderLimit)
          .map((source, idx) => renderRow(source, idx))}
        {visibleSources.length > renderLimit && (
          <Text
            style={{
              color: "rgba(255,255,255,0.3)",
              textAlign: "center",
              marginVertical: 14,
              fontSize: 10,
              fontWeight: "600",
              letterSpacing: 0.5,
            }}
          >
            SHOWING TOP {renderLimit} OF {visibleSources.length} LINKS
          </Text>
        )}
      </View>
    );
  };

  if (alwaysExpanded) {
    return renderContent();
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setTorrentExpanded((v) => !v)}
        style={[
          styles.accordionHeader,
          torrentExpanded && styles.accordionHeaderActive,
        ]}
        activeOpacity={0.8}
      >
        <Download
          size={18}
          color={theme.colors.rose}
          strokeWidth={2}
          style={{ marginRight: 10 }}
        />
        <Text style={styles.accordionTitle}>
          Torrent & Magnet Links ({torrentSources.length} found)
        </Text>
        {torrentExpanded ? (
          <ChevronUp size={18} color="#a0a0a5" strokeWidth={2} />
        ) : (
          <ChevronDown size={18} color="#a0a0a5" strokeWidth={2} />
        )}
      </TouchableOpacity>

      <Animated.View style={accordionAnimatedStyle}>
        <View
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            if (height > 0 && height !== accordionHeight) {
              setAccordionHeight(height);
            }
          }}
          style={{ width: "100%", position: "absolute", top: 0 }}
        >
          {renderContent()}
        </View>
      </Animated.View>
    </>
  );
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
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState<number | null>(
    null,
  );
  const [isSheetTransitionDone, setIsSheetTransitionDone] = useState(false);

  // Custom React Native Video Player States
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerConfig, setPlayerConfig] = useState<{
    url: string;
    headers?: Record<string, string>;
    title: string;
    subUrl?: string;
    sources: any[];
    subtitles: any[];
    isSerial: boolean;
    season: number;
    episode: number;
    episodeTitle: string;
    logoUrl?: string;
    currentEpisodeIndex: number;
    episodes: any[];
  } | null>(null);
  const [pendingPlayEpisode, setPendingPlayEpisode] = useState<{
    ep: any;
    season: number;
  } | null>(null);

  const [resolvingProgress, setResolvingProgress] = useState<
    bridge.PlaybackProgress[]
  >([]);
  const [isResolving, setIsResolving] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [textLinesLimit, setTextLinesLimit] = useState<number | undefined>(3);
  const [collapsedDescHeight, setCollapsedDescHeight] = useState(0);
  const [fullDescHeight, setFullDescHeight] = useState(0);
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);

  const [prevDetailTitle, setPrevDetailTitle] = useState<string | null>(null);
  const currentTitle = detail?.title || null;
  if (currentTitle !== prevDetailTitle) {
    setPrevDetailTitle(currentTitle);
    setCollapsedDescHeight(0);
    setFullDescHeight(0);
    setExpandedContentHeight(0);
    setIsDescriptionExpanded(false);
    setTextLinesLimit(3);
  }

  const expandProgress = useSharedValue(0);
  const descExpandShared = useSharedValue(0);

  // Animate expanded metadata details
  useEffect(() => {
    expandProgress.value = withTiming(isDescriptionExpanded ? 1 : 0, {
      duration: 300,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  }, [isDescriptionExpanded]);

  // Animate description text
  useEffect(() => {
    if (isDescriptionExpanded) {
      setTextLinesLimit(undefined);
    }
    descExpandShared.value = withTiming(
      isDescriptionExpanded ? 1 : 0,
      {
        duration: 300,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      },
      (finished) => {
        if (finished && !isDescriptionExpanded) {
          runOnJS(setTextLinesLimit)(3);
        }
      },
    );
  }, [isDescriptionExpanded]);

  // Reset measurements on detail changes
  useEffect(() => {
    setCollapsedDescHeight(0);
    setFullDescHeight(0);
    setExpandedContentHeight(0);
    setIsDescriptionExpanded(false);
    setTextLinesLimit(3);
  }, [detail?.description, detail?.title]);

  const expandedAnimatedStyle = useAnimatedStyle(() => {
    if (expandedContentHeight === 0) {
      return {
        height: 0,
        opacity: 0,
        overflow: "hidden",
      };
    }
    return {
      height: expandProgress.value * expandedContentHeight,
      opacity: expandProgress.value,
      overflow: "hidden",
    };
  });

  const descriptionAnimatedStyle = useAnimatedStyle(() => {
    if (collapsedDescHeight === 0) {
      // Heights not yet measured. Return overflow:hidden so the Text's
      // own numberOfLines={3} prop keeps it at 3 lines — no jerk.
      return { overflow: "hidden" };
    }
    const targetHeight = interpolate(
      descExpandShared.value,
      [0, 1],
      [
        collapsedDescHeight,
        fullDescHeight === 0 ? collapsedDescHeight : fullDescHeight,
      ],
    );
    return {
      height: targetHeight,
      overflow: "hidden",
    };
  });

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>(
    [],
  );
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [isTorrentBuffering, setIsTorrentBuffering] = useState(false);
  const [torrentStatus, setTorrentStatus] =
    useState<bridge.TorrentStatus | null>(null);
  const [selectedTorrentSeeders, setSelectedTorrentSeeders] = useState(0);
  const [selectedSourceQuality, setSelectedSourceQuality] = useState("");
  const [selectedSourceProvider, setSelectedSourceProvider] = useState("");
  const [selectedTorrentTitle, setSelectedTorrentTitle] = useState("");
  const [selectedTorrentHost, setSelectedTorrentHost] = useState("");
  const [torrentErrorModal, setTorrentErrorModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });
  const torrentIntervalRef = useRef<any>(null);
  const torrentSessionIdRef = useRef<number>(0);
  const resolveTimeoutRef = useRef<any>(null);
  const streamedSourcesRef = useRef<VideoSource[]>([]);
  const streamedFlushRef = useRef<any>(null);

  const showSourcePickerRef = useRef(false);
  useEffect(() => {
    showSourcePickerRef.current = showSourcePicker;
  }, [showSourcePicker]);

  const lastProgressUpdateRef = useRef(0);
  const pendingProgressRef = useRef<bridge.PlaybackProgress[] | null>(null);
  const progressTimeoutRef = useRef<any>(null);

  const throttledSetProgress = useCallback(
    (progress: bridge.PlaybackProgress[]) => {
      pendingProgressRef.current = progress;
      const now = Date.now();
      const timeSinceLastUpdate = now - lastProgressUpdateRef.current;

      if (timeSinceLastUpdate >= 600) {
        setResolvingProgress(progress);
        lastProgressUpdateRef.current = now;
        if (progressTimeoutRef.current) {
          clearTimeout(progressTimeoutRef.current);
          progressTimeoutRef.current = null;
        }
      } else {
        if (!progressTimeoutRef.current) {
          progressTimeoutRef.current = setTimeout(() => {
            if (pendingProgressRef.current) {
              setResolvingProgress(pendingProgressRef.current);
              lastProgressUpdateRef.current = Date.now();
            }
            progressTimeoutRef.current = null;
          }, 600 - timeSinceLastUpdate);
        }
      }
    },
    [],
  );

  const [isOpeningPlayer, setIsOpeningPlayer] = useState(false);

  const closeSourcePicker = (keepTorrentActive = false) => {
    setShowSourcePicker(false);
    setPlayingEpisode(null);
    setActiveEpisodeIndex(null);
    setIsSheetTransitionDone(false);
    setIsResolving(false);
    setIsOpeningPlayer(false);
    torrentSessionIdRef.current++; // Invalidate active torrent load session
    if (resolveTimeoutRef.current) {
      clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
    if (streamedFlushRef.current) {
      clearTimeout(streamedFlushRef.current);
      streamedFlushRef.current = null;
    }
    streamedSourcesRef.current = [];
    bridge.cancelPlaybackResolution();
    setIsTorrentBuffering(false);
    if (torrentIntervalRef.current) {
      clearInterval(torrentIntervalRef.current);
    }
    if (!keepTorrentActive) {
      bridge.stopTorrentStream().catch(() => {});
    }
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
      progressTimeoutRef.current = null;
    }
    pendingProgressRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (resolveTimeoutRef.current) {
        clearTimeout(resolveTimeoutRef.current);
      }
      bridge.cancelPlaybackResolution();
      if (torrentIntervalRef.current) {
        clearInterval(torrentIntervalRef.current);
      }
      bridge.stopTorrentStream().catch(() => {});
    };
  }, []);

  // Handle orientation recovery when returning from external player or canceling chooser
  useEffect(() => {
    let timeoutId: any = null;

    if (!playerVisible) {
      // Force orientation back to portrait after 2 seconds to recover from dismissed app selectors
      timeoutId = setTimeout(() => {
        bridge.lockPortrait();
      }, 2000);
    }

    const handleAppStateChange = (nextAppState: any) => {
      if (nextAppState === "active" && !playerVisible) {
        bridge.lockPortrait();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      subscription.remove();
    };
  }, [playerVisible]);

  useEffect(() => {
    if (showSourcePicker) {
      const backAction = () => {
        closeSourcePicker();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction,
      );

      return () => backHandler.remove();
    }
  }, [showSourcePicker]);

  // Dynamic Tab states for source plugins
  const [allProviders, setAllProviders] = useState<PluginProvider[]>(
    [
      "4K HDHUB",
      "Goojara",
      "YTS",
      "CloudPlay",
      "Movies4u",
      "Movierulzhd",
      "HDHub4u",
    ].map((name) => ({
      id: name,
      name,
      url: "",
      hasMainPage: true,
    })),
  );
  const [activeProviderTab, setActiveProviderTab] = useState("All");

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
          withTiming(0.3, { duration: 800, easing: Easing.ease }),
        ),
        -1,
        true,
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
        <Animated.View
          key={key}
          style={[styles.skeletonStreamRow, skeletonAnimatedStyle]}
        >
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
    let list: string[] = ["All"];
    if (providerName === "Cinemeta") {
      if (resolvingProgress.length > 0) {
        // Always show All + all providers, regardless of resolving state.
        // This keeps tabs stable — they don't disappear when resolving ends.
        list.push(...resolvingProgress.map((p) => p.providerName));
      } else {
        // Fallback to allProviders (loaded at mount)
        allProviders.forEach((p) => {
          list.push(p.name);
        });
      }
    } else {
      list.push(providerName);
    }

    // Dynamic addition: ALWAYS ensure any provider that actually has sources in our state
    // is present in the tabs list (helps with cached data loads).
    sources.forEach((s) => {
      if (s.provider) {
        const exists = list.some(
          (p) => p.toLowerCase() === s.provider!.toLowerCase(),
        );
        if (!exists) {
          list.push(s.provider);
        }
      }
    });

    if (!list.includes("VidSrcMe")) list.push("VidSrcMe");
    if (!list.includes("VsEmbed")) list.push("VsEmbed");

    return list;
  }, [allProviders, providerName, resolvingProgress, sources]);

  const filteredSources = useMemo(() => {
    const list =
      activeProviderTab.toLowerCase() === "all"
        ? sources
        : sources.filter(
            (s) =>
              (s.provider ?? "").toLowerCase() ===
              activeProviderTab.toLowerCase(),
          );

    const getGroupBase = (host: string): string => {
      let name = host
        .replace(/\s*\[.*?\]/g, "") // strip [CDN/codec] brackets
        .replace(/\s*[·•]\s*Server\s*\d+(?:\s*[·•]\s*backup)?\b/gi, "") // · Server N [· backup]
        .replace(/\s+Server\s*\d+\b/gi, "") // " Server N" without separator
        .replace(/\s*[·•]\s*backup\b/gi, "") // lone · backup
        .replace(/^\s*\d{3,4}p\s*[·•]\s*/i, "") // leading "1080p · "
        .replace(/\s*[·•]\s*\d{3,4}p\b/g, "") // trailing "· 1080p"
        .trim()
        .replace(/[·•\-\s]+$/, "") // trailing separators
        .trim();
      return name || host;
    };

    const getQualityResolution = (quality: string) => {
      // The resolution suffix is always after " · " e.g. "HD Server · 1080p"
      const parts = quality.split(" · ");
      const res = parts.length > 1 ? parts[parts.length - 1] : quality;
      const q = res.toLowerCase();
      if (q.includes("4k") || q.includes("2160")) return 2160;
      if (q.includes("1080")) return 1080;
      if (q.includes("720")) return 720;
      if (q.includes("480")) return 480;
      if (q.includes("360")) return 360;
      const match = q.match(/(\d+)p/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const getResolutionTag = (quality: string): string => {
      // The resolution is always the last part after " · "
      const parts = quality.split(" · ");
      const res = parts.length > 1 ? parts[parts.length - 1].trim() : null;
      if (!res) return "Auto";
      if (res.toLowerCase().includes("4k") || res.includes("2160"))
        return "2160p";
      if (res.includes("1080")) return "1080p";
      if (res.includes("720")) return "720p";
      if (res.includes("480")) return "480p";
      if (res.includes("360")) return "360p";
      const match = res.match(/(\d+)p/i);
      return match ? match[0] : res;
    };

    const groups: Record<string, any[]> = {};
    list.forEach((s) => {
      const provider = s.provider || "Unknown";
      const isTorrent = s.type === "torrent" || s.url.startsWith("magnet:");
      const host = s.host || s.quality?.split(" · ")[0] || "Direct";
      const groupBase = getGroupBase(host);
      const key = isTorrent
        ? `${provider}|||torrent|||${s.url}`
        : `${provider}|||${groupBase}`;

      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...s, _groupBase: isTorrent ? host : groupBase });
    });

    const groupedList: any[] = [];
    Object.values(groups).forEach((groupSources) => {
      // Sort highest resolution first within the group
      groupSources.sort(
        (a, b) =>
          getQualityResolution(b.quality || "") -
          getQualityResolution(a.quality || ""),
      );

      const primary = { ...groupSources[0] };
      primary.groupSources = groupSources; // keep all for player switching
      primary.groupLength = groupSources.length;
      primary.displayName = groupSources[0]._groupBase;

      // Unique resolution tags for this group, e.g. ["1080p", "720p"]
      const tags = groupSources
        .map((s) => getResolutionTag(s.quality || ""))
        .filter((v, i, arr) => arr.indexOf(v) === i);
      primary.availableQualities = tags;

      groupedList.push(primary);
    });

    // Direct/HLS first, torrents last (by seeders)
    return groupedList.sort((x, y) => {
      const xIsTorrent = x.type === "torrent" || x.url.startsWith("magnet:");
      const yIsTorrent = y.type === "torrent" || y.url.startsWith("magnet:");
      if (xIsTorrent && !yIsTorrent) return 1;
      if (!xIsTorrent && yIsTorrent) return -1;
      if (xIsTorrent && yIsTorrent) {
        return ((y as any).seeders ?? 0) - ((x as any).seeders ?? 0);
      }
      return 0;
    });
  }, [sources, activeProviderTab]);

  // If the active tab disappears from the list (e.g. provider had no sources),
  // fall back to 'All' so the user doesn't see a blank filtered view
  useEffect(() => {
    if (providerTabs.length > 0 && !providerTabs.includes(activeProviderTab)) {
      setActiveProviderTab("All");
    }
  }, [providerTabs, activeProviderTab]);

  const isTabResolving = useMemo(() => {
    // Always use isResolving — while ANY provider is still searching, ALL tabs show the circular loader.
    // Individual provider status is still tracked in resolvingProgress for tab labels.
    return isResolving;
  }, [isResolving]);

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
        "",
        [
          {
            quality: "Trailer",
            url: trailer.url,
            type: "direct",
            headers: trailer.referer ? { Referer: trailer.referer } : {},
          },
        ],
        [],
        "[]",
        -1,
        "",
        "movie",
        detail.posterUrl || "",
        1,
        1,
        "Trailer",
        detail.logoUrl || "",
        "Cinemeta",
        "",
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
      setActiveEpisodeIndex(index);
      setLinksError(null);
      if (!showSourcePicker) {
        setIsSheetTransitionDone(false);
      }

      setSources([]);
      setSubtitles([]);
      setResolvingProgress([]);
      streamedSourcesRef.current = [];
      if (streamedFlushRef.current) {
        clearTimeout(streamedFlushRef.current);
        streamedFlushRef.current = null;
      }
      setIsResolving(true);
      setShowSourcePicker(true);
      setSelectedSourceIndex(0);
      setActiveProviderTab("All");

      if (resolveTimeoutRef.current) {
        clearTimeout(resolveTimeoutRef.current);
      }

      // Delay bridge.loadLinks until the bottom sheet opening animation (300ms) has completed.
      // This ensures a 60fps entry transition for the source picker bottom sheet.
      resolveTimeoutRef.current = setTimeout(async () => {
        setIsSheetTransitionDone(true);
        const mapSourceProvider = (src: VideoSource): VideoSource | null => {
          let mappedProvider = src.provider;
          if (src.url.includes("vidsrcme.su")) {
            mappedProvider = "VidSrcMe";
          } else if (src.url.includes("vsembed.su")) {
            mappedProvider = "VsEmbed";
          } else if (
            src.url.includes("vidsrc") ||
            src.url.includes("vidvault") ||
            src.url.includes("vidrock")
          ) {
            return null;
          }
          return {
            ...src,
            provider: mappedProvider,
          };
        };

        // Flush buffered streamed sources to state on a short throttle instead of
        // one setState per source, to avoid re-running the heavy filteredSources memo
        // on every single incoming source during resolution.
        const flushStreamedSources = () => {
          if (streamedSourcesRef.current.length === 0) return;
          const buffered = streamedSourcesRef.current;
          streamedSourcesRef.current = [];
          setSources((prev) => {
            const merged = new Map(prev.map((s) => [s.url, s]));
            buffered.forEach((s) => {
              if (!merged.has(s.url)) merged.set(s.url, s);
            });
            return [...merged.values()];
          });
        };

        try {
          const result = await bridge.loadLinks(
            providerName,
            ep.mediaRef,
            (progress) => {
              if (showSourcePickerRef.current) {
                throttledSetProgress(progress);
              }
            },
            (newSource) => {
              if (!showSourcePickerRef.current) return;
              if (
                newSource.provider === "Tamilblasters" &&
                !newSource.url.startsWith("magnet:")
              )
                return;
              const mapped = mapSourceProvider(newSource);
              if (!mapped) return;
              if (streamedSourcesRef.current.some((s) => s.url === mapped.url))
                return;
              streamedSourcesRef.current.push(mapped);
              if (!streamedFlushRef.current) {
                streamedFlushRef.current = setTimeout(() => {
                  streamedFlushRef.current = null;
                  flushStreamedSources();
                }, 120);
              }
            },
            () => {
              // onAllDone: ALL providers have completed — flush any remaining and stop loading
              if (showSourcePickerRef.current) {
                if (streamedFlushRef.current) {
                  clearTimeout(streamedFlushRef.current);
                  streamedFlushRef.current = null;
                }
                flushStreamedSources();
                setIsResolving(false);
                setPlayingEpisode(null);
              }
            },
          );

          if (!showSourcePickerRef.current) return;

          setSubtitles(result.subtitles);
          // Flush any still-buffered streamed sources before merging the final snapshot
          flushStreamedSources();
          // Merge snapshot sources into live-streamed ones (never overwrite)
          setSources((prev) => {
            const merged = new Map(prev.map((s) => [s.url, s]));
            (result.sources ?? []).forEach((s) => {
              const mapped = mapSourceProvider(s);
              if (
                mapped &&
                (mapped.provider !== "Tamilblasters" ||
                  mapped.url.startsWith("magnet:")) &&
                !merged.has(mapped.url)
              ) {
                merged.set(mapped.url, mapped);
              }
            });
            return [...merged.values()];
          });
        } catch (e: any) {
          if (!showSourcePickerRef.current) return;
          setLinksError(
            e instanceof bridge.OfflineError
              ? "No internet connection. Please check your network."
              : e.message || "Failed to load playable links.",
          );
          setIsResolving(false);
          setPlayingEpisode(null);
        }
      }, 600);
    },
    [detail, providerName, showSourcePicker],
  );

  const handleRefreshLinks = useCallback(() => {
    if (activeEpisodeIndex === null) return;
    const ep = displayedEpisodes[activeEpisodeIndex];
    if (ep) {
      playEpisode(ep, activeEpisodeIndex);
    }
  }, [activeEpisodeIndex, displayedEpisodes, playEpisode]);

  useEffect(() => {
    if (pendingPlayEpisode && selectedSeason === pendingPlayEpisode.season) {
      const ep = pendingPlayEpisode.ep;
      const dispIdx = displayedEpisodes.findIndex(
        (e) => e.mediaRef === ep.mediaRef,
      );
      if (dispIdx !== -1) {
        setPendingPlayEpisode(null);
        playEpisode(ep, dispIdx);
      }
    }
  }, [selectedSeason, displayedEpisodes, pendingPlayEpisode, playEpisode]);

  if (phase === "idle" || !item) return null;

  function onSourceSelect(source: VideoSource) {
    setTimeout(async () => {
      try {
        const originalIndex = sources.findIndex((s) => s.url === source.url);
        if (originalIndex === -1) {
          setIsOpeningPlayer(false);
          return;
        }

        const currentEp = displayedEpisodes.find(
          (_, i) => activeEpisodeIndex === i,
        );
        const title = detail?.isSerial
          ? `${detail?.title} - ${currentEp?.label ?? `Episode ${currentEp?.episode ?? 1}`}`
          : `${detail?.title ?? ""}`;
        const subUrl = subtitles.length > 0 ? subtitles[0].url : "";

        setSelectedSourceIndex(originalIndex);
        setPlayingEpisode(null);

        const episodesPayload = allEpisodes.map((e) => ({
          episode: e.episode,
          label: e.label,
          mediaRef: e.mediaRef,
          season: e.season,
        }));
        const protocol = getProtocolLabel(source.type, source.url);
        const isTorrent =
          protocol === "TORRENT" ||
          source.url.startsWith("magnet:") ||
          source.type === "torrent";

        if (isTorrent) {
          if (isTorrentBuffering) return; // Prevent re-entry while already buffering
          setIsOpeningPlayer(false); // Torrents don't use the "Opening Player" spinner — show the buffering modal instead
          const sourceSeeders = (source as any).seeders ?? 0;
          try {
            const sessionId = ++torrentSessionIdRef.current;
            setIsTorrentBuffering(true);
            setTorrentStatus({ progress: 0, speed: 0, peers: 0, active: true });
            setSelectedTorrentSeeders(sourceSeeders);
            setSelectedSourceQuality(source.quality);
            setSelectedSourceProvider(source.provider ?? "");
            setSelectedTorrentTitle(title);
            setSelectedTorrentHost((source as any).host || "");

            bridge
              .startTorrentStream(source.url)
              .then((info) => {
                if (sessionId !== torrentSessionIdRef.current) return;

                if (torrentIntervalRef.current) {
                  clearInterval(torrentIntervalRef.current);
                }

                let consecutiveFalseCount = 0;
                const MAX_FALSE_READINGS = 3;
                const POLLING_TIMEOUT_MS = 120_000;
                const pollStartTime = Date.now();

                const intervalId = setInterval(async () => {
                  try {
                    if (sessionId !== torrentSessionIdRef.current) {
                      clearInterval(intervalId);
                      return;
                    }

                    const status = await bridge.getTorrentStatus();

                    if (sessionId !== torrentSessionIdRef.current) {
                      clearInterval(intervalId);
                      return;
                    }

                    setTorrentStatus(status);
                    if (!status.active) {
                      consecutiveFalseCount++;
                      if (consecutiveFalseCount >= MAX_FALSE_READINGS) {
                        clearInterval(intervalId);
                        setIsTorrentBuffering(false);
                        setIsOpeningPlayer(false);
                        bridge.stopTorrentStream().catch(() => {});
                        setTorrentErrorModal({
                          visible: true,
                          message:
                            "Torrent stream connection timed out or went inactive.",
                        });
                      }
                      return;
                    }

                    consecutiveFalseCount = 0;

                    // Check overall polling timeout (120s from first poll)
                    if (Date.now() - pollStartTime > POLLING_TIMEOUT_MS) {
                      clearInterval(intervalId);
                      setIsTorrentBuffering(false);
                      setIsOpeningPlayer(false);
                      bridge.stopTorrentStream().catch(() => {});
                      setTorrentErrorModal({
                        visible: true,
                        message:
                          "Torrent is taking too long to buffer. The torrent may have few active seeders. Try a different source.",
                      });
                      return;
                    }

                    // 1.5% represents full indexing download (moov atom / header container tables)
                    if (status.progress >= 1.5 && status.active) {
                      clearInterval(intervalId);
                      setIsTorrentBuffering(false);

                      // Check if external player mode is enabled
                      try {
                        const mode =
                          await AsyncStorage.getItem("@sozo_player_mode");
                        if (mode === "external") {
                          closeSourcePicker(true); // Keep torrent active for VLC / external players!
                          bridge.playInExternalPlayer(
                            info.streamUrl,
                            null,
                            title,
                            source.headers
                              ? JSON.stringify(source.headers)
                              : null,
                          );
                          return;
                        }
                      } catch (e) {
                        console.warn("Failed to read player mode setting:", e);
                      }

                      // Play local HTTP range server stream URL via Kotlin player!
                      closeSourcePicker(true); // Keep torrent active so Kotlin player can read from local http server!
                      setIsOpeningPlayer(false);
                      const playHeaders = {
                        ...(source.headers || {}),
                        __originalMagnetUrl: source.url,
                      };
                      bridge.playStream(
                        info.streamUrl,
                        playHeaders,
                        detail?.title || "",
                        subUrl,
                        sources.map((s) => ({
                          quality: s.quality,
                          url: s.url,
                          type: s.type,
                          headers: s.headers,
                          provider: s.provider || source.provider,
                          host: s.host,
                        })),
                        subtitles,
                        allEpisodes ? JSON.stringify(allEpisodes) : "[]",
                        activeEpisodeIndex ?? -1,
                        detail?.imdbId || "",
                        detail?.isSerial ? "series" : "movie",
                        detail?.posterUrl || "",
                        currentEp?.season || 1,
                        currentEp?.episode || 1,
                        currentEp?.label || "",
                        detail?.logoUrl || "",
                        providerName,
                        detail?.url || item?.url || "",
                        true,
                      );
                    }
                  } catch (err) {
                    console.warn(
                      "[ZunoPlugin] Error polling torrent status:",
                      err,
                    );
                  }
                }, 500);

                torrentIntervalRef.current = intervalId;
              })
              .catch((err) => {
                if (sessionId !== torrentSessionIdRef.current) return;
                setIsTorrentBuffering(false);
                setIsOpeningPlayer(false);
                setTorrentErrorModal({
                  visible: true,
                  message: cleanTorrentError(err.message),
                });
              });
          } catch (e: any) {
            setIsTorrentBuffering(false);
            setIsOpeningPlayer(false);
            setTorrentErrorModal({
              visible: true,
              message: cleanTorrentError(e.message),
            });
          }
          return;
        }

        try {
          const mode = await AsyncStorage.getItem("@sozo_player_mode");
          if (mode === "external") {
            closeSourcePicker();
            bridge.playInExternalPlayer(
              source.url,
              null,
              title,
              source.headers ? JSON.stringify(source.headers) : null,
            );
            return;
          }
        } catch (e) {
          console.warn("Failed to read player mode setting:", e);
        }

        closeSourcePicker();
        setIsOpeningPlayer(true);
        bridge.playStream(
          source.url,
          source.headers,
          detail?.title || "",
          subUrl,
          sources.map((s) => ({
            quality: s.quality,
            url: s.url,
            type: s.type,
            headers: s.headers,
            provider: s.provider || source.provider,
            host: s.host,
          })),
          subtitles,
          allEpisodes ? JSON.stringify(allEpisodes) : "[]",
          activeEpisodeIndex ?? -1,
          detail?.imdbId || "",
          detail?.isSerial ? "series" : "movie",
          detail?.posterUrl || "",
          currentEp?.season || 1,
          currentEp?.episode || 1,
          currentEp?.label || "",
          detail?.logoUrl || "",
          providerName,
          detail?.url || item?.url || "",
        );
      } catch (e) {
        console.warn("Failed onSourceSelect:", e);
        setIsOpeningPlayer(false);
      }
    }, 0);
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

      {detail.cast && detail.cast.length > 0 && (
        <View style={styles.castSection}>
          <Text style={styles.sectionTitle}>Cast ({detail.cast.length})</Text>
          <View style={styles.castScrollContainer}>
            <MaskedView
              style={styles.castMaskedView}
              maskElement={
                <LinearGradient
                  colors={["transparent", "black", "black", "transparent"]}
                  locations={[0, 0.08, 0.92, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              }
            >
              <ScrollView
                horizontal
                nestedScrollEnabled={true}
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
                  const handleCastPress = () => {
                    if (actor.imdbId) {
                      Linking.openURL(
                        `https://www.imdb.com/name/${actor.imdbId}/`,
                      ).catch(() => {});
                    }
                  };
                  return (
                    <TouchableOpacity
                      key={`actor-${idx}`}
                      style={styles.castCard}
                      onPress={handleCastPress}
                      activeOpacity={actor.imdbId ? 0.7 : 1}
                      disabled={!actor.imdbId}
                    >
                      {actor.image ? (
                        <Image
                          source={{ uri: actor.image, cache: "force-cache" }}
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
                      {actor.imdbId && (
                        <View style={styles.castImdbBadge}>
                          <Text style={styles.castImdbBadgeText}>IMDb</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </MaskedView>
          </View>
        </View>
      )}
    </View>
  ) : null;

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
                    cache: "force-cache",
                  }}
                  style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
                  resizeMode="cover"
                  blurRadius={25}
                />
              ) : null}

              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl, cache: "force-cache" }}
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
                  <ArrowLeft size={18} color="#ffffff" strokeWidth={2} />
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
                  {isFav ? (
                    <Heart
                      size={20}
                      color={theme.colors.accent}
                      fill={theme.colors.accent}
                      strokeWidth={2}
                    />
                  ) : (
                    <Heart size={20} color="#ffffff" strokeWidth={2} />
                  )}
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
                  <Play
                    size={24}
                    color="#fff"
                    fill="#fff"
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
            <View style={{ flexGrow: 1 }}>
              {showSeasonDropdown && (
                <Pressable
                  style={[StyleSheet.absoluteFillObject, { zIndex: 99 }]}
                  onPress={() => setShowSeasonDropdown(false)}
                />
              )}
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
                          source={{ uri: posterUrl, cache: "force-cache" }}
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
                    <View style={styles.errorContainer}>
                      <BlurView
                        intensity={20}
                        tint="dark"
                        style={styles.errorCard}
                      >
                        <AlertCircle
                          size={42}
                          color={theme.colors.rose}
                          strokeWidth={2}
                          style={{ marginBottom: 12 }}
                        />
                        <Text style={styles.errorTitle}>
                          Failed to Load Details
                        </Text>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity
                          style={styles.retryBtn}
                          onPress={reloadDetail}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.retryBtnText}>Try Again</Text>
                        </TouchableOpacity>
                      </BlurView>
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

                      {/* Hidden measurement for collapsed description (3 lines) */}
                      {detail?.description && collapsedDescHeight === 0 && (
                        <Text
                          style={[
                            styles.descriptionText,
                            { position: "absolute", opacity: 0, zIndex: -1 },
                          ]}
                          numberOfLines={3}
                          onLayout={(e) => {
                            const { height } = e.nativeEvent.layout;
                            if (height > 0) setCollapsedDescHeight(height);
                          }}
                        >
                          {detail.description}
                        </Text>
                      )}

                      {/* Hidden measurement for full description */}
                      {detail?.description && fullDescHeight === 0 && (
                        <Text
                          style={[
                            styles.descriptionText,
                            { position: "absolute", opacity: 0, zIndex: -1 },
                          ]}
                          onLayout={(e) => {
                            const { height } = e.nativeEvent.layout;
                            if (height > 0) setFullDescHeight(height);
                          }}
                        >
                          {detail.description}
                        </Text>
                      )}

                      {/* Description */}
                      {detail?.description ? (
                        <Animated.View
                          style={[
                            styles.descriptionContainer,
                            descriptionAnimatedStyle,
                          ]}
                        >
                          <Text
                            style={styles.descriptionText}
                            numberOfLines={
                              // Always constrain to 3 lines until BOTH heights are
                              // measured — this prevents any jerk during initial load.
                              collapsedDescHeight === 0 || fullDescHeight === 0
                                ? 3
                                : textLinesLimit
                            }
                          >
                            {detail.description}
                          </Text>
                        </Animated.View>
                      ) : null}

                      {/* Always Visible: SEE MORE / SEE LESS Toggle in center in capitals */}
                      {detail?.description && (
                        <TouchableOpacity
                          disabled={
                            collapsedDescHeight === 0 ||
                            fullDescHeight <= collapsedDescHeight
                          }
                          onPress={() => {
                            setIsDescriptionExpanded(!isDescriptionExpanded);
                          }}
                          style={[
                            styles.seeMoreBtn,
                            collapsedDescHeight === 0
                              ? { opacity: 0 }
                              : fullDescHeight > collapsedDescHeight
                                ? { opacity: 1 }
                                : {
                                    opacity: 0,
                                    height: 0,
                                    paddingVertical: 0,
                                    marginTop: 0,
                                    marginBottom: 0,
                                    borderWidth: 0,
                                  },
                          ]}
                        >
                          <Text style={styles.seeMoreText}>
                            {isDescriptionExpanded ? "SEE LESS" : "SEE MORE"}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {detail && (
                        <Animated.View
                          style={[
                            styles.expandedDetails,
                            expandedAnimatedStyle,
                          ]}
                        >
                          <View
                            onLayout={(e) => {
                              const { height } = e.nativeEvent.layout;
                              if (
                                height > 0 &&
                                height !== expandedContentHeight
                              ) {
                                setExpandedContentHeight(height);
                              }
                            }}
                            style={{
                              width: "100%",
                              position: "absolute",
                              top: 0,
                            }}
                          >
                            {expandedContent}
                          </View>
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
                            fallbackDuration={detail?.duration}
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
                            nestedScrollEnabled={true}
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
            </View>
          </Animated.ScrollView>
        </Animated.View>
      </Animated.View>

      {/* Torrent Buffering Overlay */}
      <CustomModal
        visible={isTorrentBuffering}
        dismissable={false}
        onClose={() => {
          setIsTorrentBuffering(false);
          setIsOpeningPlayer(false);
          torrentSessionIdRef.current++; // Invalidate active torrent load session
          if (torrentIntervalRef.current) {
            clearInterval(torrentIntervalRef.current);
          }
          bridge.stopTorrentStream().catch(() => {});
        }}
        title="Torrent Engine"
        message=""
        Icon={Activity}
        iconColor="#0047FF"
        iconBgColor="rgba(0, 71, 255, 0.1)"
        glowColors={["rgba(249, 115, 22, 0.16)", "transparent"] as const}
      >
        <Text
          style={[
            styles.torrentStatValue,
            { textAlign: "center", marginBottom: 10 },
          ]}
        >
          {sources[selectedSourceIndex]?.host}
        </Text>

        {/* Linear Progress Card */}
        <View style={styles.torrentProgressCard}>
          <View style={styles.torrentProgressHeader}>
            <Text style={styles.torrentProgressPercent}>
              {Math.min(
                100,
                Math.max(0, ((torrentStatus?.progress ?? 0) / 1.5) * 100),
              ).toFixed(0)}
              %
            </Text>
            <Text style={styles.torrentProgressSpeed}>
              {torrentStatus?.speed
                ? torrentStatus.speed >= 1024 * 1024
                  ? `${(torrentStatus.speed / (1024 * 1024)).toFixed(1)} MB/s`
                  : `${(torrentStatus.speed / 1024).toFixed(0)} kB/s`
                : "0 kB/s"}
            </Text>
          </View>
          <View style={styles.torrentProgressBarTrack}>
            <View
              style={[
                styles.torrentProgressBarFill,
                {
                  width: `${Math.min(100, Math.max(0, ((torrentStatus?.progress ?? 0) / 1.5) * 100))}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* Stats Grid - 2 rows of glass cards */}
        <View style={{ width: "100%", gap: 8, marginTop: 10, marginBottom: 8 }}>
          {/* Row 1: Peers | Size | Status */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Box 1: Peers */}
            <View style={styles.torrentStatBox}>
              <View style={styles.torrentStatLabelRow}>
                <Users size={11} color="#8E8D92" strokeWidth={2} />
                <Text style={styles.torrentStatLabel}>Peers</Text>
              </View>
              <Text style={styles.torrentStatValue}>
                {torrentStatus?.peers && torrentStatus.peers > 0
                  ? `${torrentStatus.peers}`
                  : selectedTorrentSeeders > 0
                    ? `${selectedTorrentSeeders}`
                    : "0"}
              </Text>
            </View>

            {/* Box 2: Size */}
            <View style={styles.torrentStatBox}>
              <View style={styles.torrentStatLabelRow}>
                <Database size={11} color="#8E8D92" strokeWidth={2} />
                <Text style={styles.torrentStatLabel}>Size</Text>
              </View>
              <Text
                style={styles.torrentStatValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {extractTorrentSize(selectedSourceQuality)}
              </Text>
            </View>

            {/* Box 3: Status */}
            <View style={styles.torrentStatBox}>
              <View style={styles.torrentStatLabelRow}>
                <Wifi size={11} color="#8E8D92" strokeWidth={2} />
                <Text style={styles.torrentStatLabel}>Status</Text>
              </View>
              <Text
                style={styles.torrentStatValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {torrentStatus?.peers && torrentStatus.peers > 0
                  ? "Streaming"
                  : "Resolving"}
              </Text>
            </View>
          </View>

          {/* Row 2: Quality | Audio */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Box 4: Quality */}
            <View style={styles.torrentStatBox}>
              <View style={styles.torrentStatLabelRow}>
                <Monitor size={11} color="#8E8D92" strokeWidth={2} />
                <Text style={styles.torrentStatLabel}>Quality</Text>
              </View>
              <Text
                style={styles.torrentStatValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {extractResolution(selectedSourceQuality)}
              </Text>
            </View>

            {/* Box 5: Audio */}
            <View style={styles.torrentStatBox}>
              <View style={styles.torrentStatLabelRow}>
                <Volume2 size={11} color="#8E8D92" strokeWidth={2} />
                <Text style={styles.torrentStatLabel}>Audio</Text>
              </View>
              <Text
                style={styles.torrentStatValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {parseAudioLanguages(selectedTorrentHost)}
              </Text>
            </View>
          </View>
        </View>

        {/* Helpful tooltip caption to prevent user anxiety */}
        <Text style={styles.torrentCaption}>
          First piece download may take a moment to bootstrap DHT peers.
        </Text>

        {/* Cancel Button - Rose themed glass pill */}
        <TouchableOpacity
          style={styles.torrentCancelBtn}
          onPress={() => {
            setIsTorrentBuffering(false);
            setIsOpeningPlayer(false);
            torrentSessionIdRef.current++;
            if (torrentIntervalRef.current) {
              clearInterval(torrentIntervalRef.current);
            }
            bridge.stopTorrentStream().catch(() => {});
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.torrentCancelBtnText}>Cancel Stream</Text>
        </TouchableOpacity>
      </CustomModal>

      {/* Torrent Error Modal */}
      <CustomModal
        visible={torrentErrorModal.visible}
        onClose={() => setTorrentErrorModal({ visible: false, message: "" })}
        title="Playback Error"
        message={torrentErrorModal.message}
        Icon={AlertCircle}
        iconColor="#ff4a7d"
        iconBgColor="rgba(255, 74, 125, 0.1)"
        glowColors={["rgba(255, 74, 125, 0.15)", "transparent"] as const}
        confirmText="Dismiss"
        onConfirm={() => setTorrentErrorModal({ visible: false, message: "" })}
      />

      {/* Source Picker Bottom Sheet Overlay — always mounted, hidden off-screen when closed */}
      <Animated.View
        style={[
          styles.sheetOverlay,
          sheetAnimatedStyle,
          { pointerEvents: showSourcePicker ? "auto" : "none" },
        ]}
      >
        {/* Native frosted blur backdrop (restored) */}
        <BlurView
          intensity={80}
          tint="dark"
          blurMethod="dimezisBlurView"
          blurTarget={{ current: blurTarget }}
          style={StyleSheet.absoluteFillObject}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0,0,0,0.45)" },
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => closeSourcePicker()}
        />

        <Animated.View style={[styles.sheet]}>
          <BlurView
            intensity={100}
            tint="dark"
            blurTarget={{ current: blurTarget }}
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <TouchableOpacity
                style={styles.sheetRefreshButton}
                onPress={handleRefreshLinks}
                activeOpacity={0.8}
                disabled={isResolving}
              >
                <RotateCw size={18} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.sheetTitleRow}>
                {isResolving && (
                  <ActivityIndicator
                    size="small"
                    color="#0047FF"
                    style={{ marginRight: 8 }}
                  />
                )}
                <Text style={styles.sheetTitle}>Select Source</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={() => closeSourcePicker()}
                activeOpacity={0.8}
              >
                <X size={20} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {/* Dynamic Provider Tabs scroll view */}
            {providerTabs.length > 1 && (
              <View style={styles.tabsContainer}>
                <MaskedView
                  style={styles.tabsMaskedView}
                  maskElement={
                    <LinearGradient
                      colors={["transparent", "black", "black", "transparent"]}
                      locations={[0, 0.08, 0.92, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  }
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabsScrollContent}
                  >
                    {providerTabs.map((tab) => {
                      const isActive = activeProviderTab === tab;

                      // Calculate tab status decorations
                      const prog = resolvingProgress.find(
                        (p) => p.providerName === tab,
                      );
                      let tabLabel = tab;
                      const tabSubLabel = cleanErrorMessage(prog?.errorReason);
                      const isSearching =
                        (tab === "All" && isResolving) ||
                        prog?.status === "searching";

                      const tabSourcesCount = sources.filter(
                        (s) =>
                          (s.provider ?? "").toLowerCase() ===
                          tab.toLowerCase(),
                      ).length;
                      if (tab === "All") {
                        tabLabel =
                          sources.length > 0
                            ? `All (${sources.length})`
                            : "All";
                      } else if (prog) {
                        if (prog.status === "searching") {
                          tabLabel =
                            tabSourcesCount > 0
                              ? `${tab} (${tabSourcesCount})`
                              : tab;
                        } else if (prog.status === "found") {
                          tabLabel = `${tab} (${tabSourcesCount})`;
                        } else if (prog.status === "none") {
                          tabLabel = `${tab} (0)`;
                        } else if (prog.status === "error") {
                          tabLabel =
                            tabSourcesCount > 0
                              ? `${tab} (${tabSourcesCount})`
                              : `${tab} ⚠`;
                        }
                      } else {
                        // Static tabs (like VidSrcMe, VsEmbed) or direct/custom provider calls which don't have progress tracking.
                        tabLabel =
                          tabSourcesCount > 0
                            ? `${tab} (${tabSourcesCount})`
                            : isResolving
                              ? tab
                              : `${tab} (0)`;
                      }

                      return (
                        <TouchableOpacity
                          key={tab}
                          style={[
                            styles.tabButton,
                            isActive && styles.tabButtonActive,
                            { flexDirection: "row", alignItems: "center" },
                          ]}
                          onPress={() => setActiveProviderTab(tab)}
                          activeOpacity={0.7}
                        >
                          {isSearching && (
                            <ActivityIndicator
                              size="small"
                              color={isActive ? "#ffffff" : "#0047FF"}
                              style={{ marginRight: 6 }}
                            />
                          )}
                          <Text
                            style={[
                              styles.tabText,
                              isActive && styles.tabTextActive,
                            ]}
                          >
                            {tabLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </MaskedView>
              </View>
            )}

            {/* Always show source list when sources exist, even while still resolving */}
            <View style={{ flex: 1 }}>
              {filteredSources.length > 0 ? (
                <View style={styles.sheetListContainer}>
                  {(() => {
                    const directSources = filteredSources.filter(
                      (s) =>
                        s.type !== "torrent" && !s.url.startsWith("magnet:"),
                    );
                    const torrentSources = filteredSources.filter(
                      (s) =>
                        s.type === "torrent" || s.url.startsWith("magnet:"),
                    );

                    const renderSourceRow = (source: any, idx: number) => {
                      // displayName = normalised group base (e.g. "Movies Plus", "4K HDHUB")
                      const hostName =
                        source.displayName ||
                        source.host ||
                        source.quality?.split(" · ")[0] ||
                        "Direct";
                      const qualityTag =
                        source.availableQualities?.[0] ?? "Auto";
                      const hasHeaders =
                        source.headers &&
                        Object.keys(source.headers).length > 0;
                      const protocolLabel = getProtocolLabel(
                        source.type,
                        source.url,
                      );

                      const showProviderBadge = activeProviderTab === "All";
                      const isTorrentSource =
                        source.type === "torrent" ||
                        source.url.startsWith("magnet:");
                      const torrentSeeders = (source as any).seeders as
                        | number
                        | undefined;

                      return (
                        <View
                          key={`source-${source.type}-${idx}`}
                          style={[
                            styles.sheetRow,
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              paddingRight: 10,
                              gap: 5,
                            },
                          ]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => onSourceSelect(source)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.sheetRowInfo}>
                              <View
                                style={[
                                  styles.sheetQualityRow,
                                  { flexWrap: "wrap", gap: 6 },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.sheetQuality,
                                    { marginRight: 4 },
                                  ]}
                                >
                                  {hostName}
                                </Text>

                                {(
                                  source.availableQualities || [qualityTag]
                                ).map((tag: string, tagIdx: number) => (
                                  <View
                                    key={`tag-${tagIdx}`}
                                    style={[
                                      styles.sheetBadge,
                                      {
                                        backgroundColor: getQualityBadgeBg(tag),
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.sheetBadgeText,
                                        {
                                          color: "#ffffff",
                                          fontWeight: "bold",
                                        },
                                      ]}
                                    >
                                      {tag}
                                    </Text>
                                  </View>
                                ))}

                                <View style={styles.sheetBadge}>
                                  <Text style={styles.sheetBadgeText}>
                                    {protocolLabel}
                                  </Text>
                                </View>

                                {isTorrentSource &&
                                  torrentSeeders !== undefined &&
                                  torrentSeeders > 0 && (
                                    <View
                                      style={[
                                        styles.sheetBadge,
                                        {
                                          flexDirection: "row",
                                          alignItems: "center",
                                          backgroundColor:
                                            torrentSeeders >= 50
                                              ? "rgba(34, 197, 94, 0.12)"
                                              : torrentSeeders >= 10
                                                ? "rgba(234, 179, 8, 0.10)"
                                                : "rgba(255, 255, 255, 0.06)",
                                          borderColor:
                                            torrentSeeders >= 50
                                              ? "rgba(34, 197, 94, 0.3)"
                                              : torrentSeeders >= 10
                                                ? "rgba(234, 179, 8, 0.25)"
                                                : "rgba(255,255,255,0.1)",
                                          borderWidth: 0.5,
                                        },
                                      ]}
                                    >
                                      <Users
                                        strokeWidth={2}
                                        size={10}
                                        color={
                                          torrentSeeders >= 50
                                            ? "#22c55e"
                                            : torrentSeeders >= 10
                                              ? "#eab308"
                                              : "#a0a0a5"
                                        }
                                        style={{ marginRight: 3 }}
                                      />
                                      <Text
                                        style={[
                                          styles.sheetBadgeText,
                                          {
                                            color:
                                              torrentSeeders >= 50
                                                ? "#22c55e"
                                                : torrentSeeders >= 10
                                                  ? "#eab308"
                                                  : "#a0a0a5",
                                            fontWeight: "600",
                                          },
                                        ]}
                                      >
                                        {`${torrentSeeders}`}
                                      </Text>
                                    </View>
                                  )}

                                {showProviderBadge && (
                                  <View
                                    style={[
                                      styles.sheetBadge,
                                      {
                                        backgroundColor: "rgba(85,128,255,0.1)",
                                        borderColor: "rgba(85,128,255,0.2)",
                                        borderWidth: 0.5,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.sheetBadgeText,
                                        {
                                          color: "#5580FF",
                                          fontWeight: "600",
                                        },
                                      ]}
                                    >
                                      {source.provider}
                                    </Text>
                                  </View>
                                )}

                                {hasHeaders && (
                                  <View
                                    style={[
                                      styles.sheetBadge,
                                      {
                                        backgroundColor: "rgba(0,71,255,0.08)",
                                        borderColor: "rgba(0,71,255,0.2)",
                                        borderWidth: 0.5,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.sheetBadgeText,
                                        { color: theme.colors.accentLight },
                                      ]}
                                    >
                                      Headers
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    };

                    return (
                      <MaskedView
                        style={styles.sheetListMaskedView}
                        maskElement={
                          <LinearGradient
                            colors={[
                              "transparent",
                              "black",
                              "black",
                              "transparent",
                            ]}
                            locations={[0, 0.08, 0.92, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                        }
                      >
                        <ScrollView
                          showsVerticalScrollIndicator={false}
                          style={styles.sheetList}
                          contentContainerStyle={{
                            paddingTop: 12,
                            paddingBottom: 24,
                          }}
                        >
                          {/* Direct/HLS Sources rendered first */}
                          {directSources.map((source, idx) =>
                            renderSourceRow(source, idx),
                          )}

                          {/* Collapsible Torrent Accordion — isolated child so toggling
                                it never re-renders the parent (the 100+ row source list,
                                provider tabs, hero and background blurs). */}
                          <TorrentAccordion
                            key={activeEpisodeIndex ?? detail?.url ?? "acc"}
                            torrentSources={torrentSources}
                            renderRow={renderSourceRow}
                            alwaysExpanded={
                              activeProviderTab.toLowerCase() !== "all"
                            }
                          />
                        </ScrollView>
                      </MaskedView>
                    );
                  })()}
                </View>
              ) : (
                // Empty state when there are no sources for this tab
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#8E8D92", fontSize: 14 }}>
                    {isResolving
                      ? "Resolving links..."
                      : "No links found for this provider"}
                  </Text>
                </View>
              )}
            </View>

            {subtitles.length > 0 && (
              <View style={styles.sheetSubRow}>
                <Text style={styles.sheetSubLabel}>Subtitles: </Text>
                <Text style={styles.sheetSubLangs} numberOfLines={1}>
                  {subtitles.map((s) => s.lang).join(", ")}
                </Text>
              </View>
            )}

            {/* VPN Tip Banner at bottom */}
            <View style={styles.sheetVpnTip}>
              <Text style={styles.sheetVpnTipText}>
                Tip: Use a VPN app (e.g. ProtonVPN or WARP) if links fail to
                load.
              </Text>
            </View>
          </View>
          {isOpeningPlayer && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: "rgba(15, 15, 20, 0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 999,
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                },
              ]}
            >
              <ActivityIndicator
                size="large"
                color="#0047FF"
                style={{ marginBottom: 12 }}
              />
              <Text
                style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}
              >
                Opening Player...
              </Text>
              <Text style={{ color: "#A0A0A5", marginTop: 6, fontSize: 12 }}>
                Please wait, initializing stream configuration
              </Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>

      {/* Premium Edge Fades */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, fadeStyle, { zIndex: 96 }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={["#050505", "rgba(5, 5, 5, 0.8)", "transparent"]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 15,
          }}
        />
        <LinearGradient
          colors={["transparent", "rgba(5, 5, 5, 0.85)", "#050505"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
          }}
        />
      </Animated.View>

      {playerConfig && (
        <CustomVideoPlayer
          visible={playerVisible}
          url={playerConfig.url}
          headers={playerConfig.headers}
          title={playerConfig.title}
          logoUrl={playerConfig.logoUrl}
          isSerial={playerConfig.isSerial}
          season={playerConfig.season}
          episode={playerConfig.episode}
          episodeTitle={playerConfig.episodeTitle}
          episodes={playerConfig.episodes}
          currentEpisodeIndex={playerConfig.currentEpisodeIndex}
          onEpisodeChange={(index) => {
            const ep = playerConfig.episodes[index];
            if (ep) {
              setPlayerVisible(false);
              setPlayerConfig(null);
              const dispIdx = displayedEpisodes.findIndex(
                (e) => e.mediaRef === ep.mediaRef,
              );
              if (dispIdx !== -1) {
                playEpisode(ep, dispIdx);
              } else if (ep.season) {
                setSelectedSeason(ep.season);
                setPendingPlayEpisode({ ep, season: ep.season });
              }
            }
          }}
          onClose={() => {
            setPlayerVisible(false);
            setPlayerConfig(null);
            setIsOpeningPlayer(false);
          }}
          subtitles={playerConfig.subtitles}
          sources={playerConfig.sources}
        />
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
