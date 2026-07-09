import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  PanResponder,
  Image,
  StatusBar,
  GestureResponderEvent,
  ActivityIndicator,
  BackHandler,
  ScrollView,
  Modal,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import {
  PlayIcon,
  PauseIcon,
  XMarkIcon,
  LockClosedIcon,
  LockOpenIcon,
  ArrowsPointingOutIcon,
  FingerPrintIcon,
  SpeakerWaveIcon,
  SunIcon,
  LanguageIcon,
  BoltIcon,
  Square3Stack3DIcon,
  BackwardIcon,
  ForwardIcon,
  ClockIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from "react-native-heroicons/solid";
import * as bridge from "../api/cloudStreamBridge";
import { CustomModal } from "./CustomModal";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  Easing,
} from "react-native-reanimated";
import { theme } from "../theme";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

const SCREEN_WIDTH = Math.max(WINDOW_WIDTH, WINDOW_HEIGHT);
const SCREEN_HEIGHT = Math.min(WINDOW_WIDTH, WINDOW_HEIGHT);

interface Cue {
  start: number;
  end: number;
  text: string;
}

interface VideoSource {
  quality: string;
  url: string;
  type: string;
  headers?: Record<string, string>;
  provider?: string;
  host?: string;
}

interface CustomVideoPlayerProps {
  visible: boolean;
  url: string;
  headers?: Record<string, string>;
  title: string;
  logoUrl?: string;
  posterUrl?: string;
  isSerial: boolean;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  episodes?: any[];
  currentEpisodeIndex?: number;
  onEpisodeChange?: (index: number) => void;
  onClose: () => void;
  subtitles?: { lang: string; url: string }[];
  sources?: VideoSource[];
}

function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\n+/);

  const parseTime = (t: string): number => {
    const clean = t.trim().replace(",", ".");
    const parts = clean.split(":");
    let secs = 0;
    if (parts.length === 3) {
      secs =
        parseFloat(parts[0]) * 3600 +
        parseFloat(parts[1]) * 60 +
        parseFloat(parts[2]);
    } else if (parts.length === 2) {
      secs = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    } else {
      secs = parseFloat(clean);
    }
    return isNaN(secs) ? 0 : secs;
  };

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let timeLine = "";
    let textStartIndex = 1;

    if (lines[0] && lines[0].includes("-->")) {
      timeLine = lines[0];
      textStartIndex = 1;
    } else if (lines[1] && lines[1].includes("-->")) {
      timeLine = lines[1];
      textStartIndex = 2;
    }

    if (timeLine) {
      const parts = timeLine.split("-->");
      if (parts.length === 2) {
        const start = parseTime(parts[0]);
        const end = parseTime(parts[1]);
        const cueText = lines
          .slice(textStartIndex)
          .join("\n")
          .replace(/<[^>]*>/g, "")
          .trim();
        if (cueText) {
          cues.push({ start, end, text: cueText });
        }
      }
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

const isDolbyAudio = (source: VideoSource | null, url: string) => {
  const text = `${source?.quality || ""} ${source?.host || ""} ${url}`.toLowerCase();
  return (
    text.includes("dd5.1") ||
    text.includes("dd 5.1") ||
    text.includes("ac3") ||
    text.includes("ac-3") ||
    text.includes("eac3") ||
    text.includes("e-ac-3") ||
    text.includes("dts") ||
    text.includes("dolby") ||
    text.includes("atmos") ||
    text.includes("5.1ch") ||
    text.includes("5.1")
  );
};

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

interface PlayerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  hideCloseButton?: boolean;
}

const PlayerModal = ({ visible, onClose, title, children, hideCloseButton = false }: PlayerModalProps) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      supportedOrientations={["landscape"]}
      onRequestClose={onClose}
    >
      <View style={styles.resumePromptOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />
        <Animated.View
          entering={ZoomIn.duration(250)}
          exiting={ZoomOut.duration(200)}
          style={styles.playerModalContainer}
        >
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(15, 15, 20, 0.95)" }
            ]}
          />
          <View style={styles.modalHeader}>
            <Text style={styles.resumePromptTitle}>{title}</Text>
            {!hideCloseButton && (
              <TouchableOpacity onPress={onClose} style={styles.modalCloseIconBtn}>
                <XMarkIcon size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={true}
            style={styles.modalScrollBody}
            contentContainerStyle={styles.modalScrollBodyContent}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function CustomVideoPlayer({
  visible,
  url,
  headers,
  title,
  logoUrl,
  posterUrl,
  isSerial,
  season,
  episode,
  episodeTitle,
  episodes = [],
  currentEpisodeIndex = -1,
  onEpisodeChange,
  onClose,
  subtitles = [],
  sources = [],
}: CustomVideoPlayerProps) {
  if (!visible) return null;

  // Playback Error and watchdog states
  const [playerError, setPlayerError] = useState<string | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitiallyLoadedRef = useRef(false);

  // Video source state
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(
    sources.find((s) => s.url === url) || sources[0] || null
  );

  // Player state variables
  const [status, setStatus] = useState<string>("idle");

  useEffect(() => {
    // Reset player error, watchdog, and initial load tracker when loading a new source
    setPlayerError(null);
    hasInitiallyLoadedRef.current = false;
    lastSourceChangeTimeRef.current = Date.now();
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, [selectedSource, url]);

  useEffect(() => {
    // Only run watchdog timer if this stream has never loaded successfully yet.
    // This prevents seeking/buffering pauses from triggering a playback failure error.
    if (!hasInitiallyLoadedRef.current && (status === "loading" || status === "idle")) {
      if (!loadingTimeoutRef.current) {
        loadingTimeoutRef.current = setTimeout(() => {
          setPlayerError(
            "The video stream is taking too long to load. The server might be overloaded or blocked by your network. Please try a different source."
          );
          player.pause();
        }, 30000); // 30 seconds watchdog
      }
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (status === "ready" || status === "playing") {
        hasInitiallyLoadedRef.current = true;
      }
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [status]);

  
  // Subtitle state
  const [activeSubtitleUrl, setActiveSubtitleUrl] = useState<string>(
    subtitles[0]?.url || ""
  );
  const [cues, setCues] = useState<Cue[]>([]);
  const [activeCue, setActiveCue] = useState<Cue | null>(null);
  const [subDelay, setSubDelay] = useState(0);
  const [subPosition, setSubPosition] = useState<"top" | "middle" | "bottom">("bottom");
  const [subBackground, setSubBackground] = useState<"none" | "translucent" | "solid">("translucent");

  // Player state variables
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);

  // Controls Lock State
  const [isLocked, setIsLocked] = useState(false);
  // Aspect Ratio State
  const [contentFit, setContentFit] = useState<"contain" | "cover" | "fill">("contain");
  // Swipe Gestures Toggle Option (Defaults to false!)
  const [gesturesEnabled, setGesturesEnabled] = useState(false);

  // Controls Visibility
  const [showControls, setShowControls] = useState(true);
  const controlsOpacity = useSharedValue(1);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reanimated Shared Values for Butter-Smooth Sliders
  const volumeShared = useSharedValue(1.0);
  const brightnessShared = useSharedValue(0.5);
  const progressPercentShared = useSharedValue(0);
  const hudValueShared = useSharedValue(0.5);

  // Gesture HUD overlays state
  const [hudType, setHudType] = useState<"volume" | "brightness" | null>(null);
  const hudOpacity = useSharedValue(0);

  // Mute state to avoid reading volumeShared.value in render
  const [isMuted, setIsMuted] = useState(false);

  // Modal Dialogs
  const [activeModal, setActiveModal] = useState<"quality" | "subtitles" | "speed" | null>(null);

  // Accordion state for source select
  const [torrentExpanded, setTorrentExpanded] = useState(false);
  const [accordionHeight, setAccordionHeight] = useState(0);
  const accordionExpandShared = useSharedValue(0);

  useEffect(() => {
    accordionExpandShared.value = withTiming(torrentExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  }, [torrentExpanded]);

  const accordionAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: accordionExpandShared.value * accordionHeight,
      opacity: accordionExpandShared.value,
      overflow: "hidden",
    };
  });

  // Playback Rate
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Active slider tracker for fullscreen slider expand feature
  const [activeSlider, setActiveSlider] = useState<"progress" | "volume" | "brightness" | null>(null);

  const [showDolbyToast, setShowDolbyToast] = useState(false);
  const [dolbyCountdown, setDolbyCountdown] = useState(8);
  const dolbyIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (dolbyIntervalRef.current) {
        clearInterval(dolbyIntervalRef.current);
      }
    };
  }, []);

  const lastSeekTimeRef = useRef(0);
  const lastSourceChangeTimeRef = useRef(0);

  // Load initial system volume on mount
  useEffect(() => {
    bridge.getSystemVolume().then((vol) => {
      volumeShared.value = vol;
      setIsMuted(vol === 0);
    }).catch(() => {});
  }, []);

  // Sleep Timer state
  const [sleepTimer, setSleepTimer] = useState<"off" | 15 | 30 | 60 | "episode">("off");
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Continue Watching Progress Storage & Resume Dialog Prompt state
  const [savedProgress, setSavedProgress] = useState(0);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const hasPromptedRef = useRef(false);

  // Time format toggle (Remaining vs. Duration)
  const [showRemainingTime, setShowRemainingTime] = useState(false);

  const progressKey = useMemo(() => {
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
    return `@sozo_progress_${cleanTitle}_${isSerial ? `S${season}E${episode}` : "movie"}`;
  }, [title, isSerial, season, episode]);

  // Load progress on mount / track changes
  useEffect(() => {
    AsyncStorage.getItem(progressKey)
      .then((val) => {
        if (val) {
          const secs = parseFloat(val);
          setSavedProgress(isNaN(secs) ? 0 : secs);
        } else {
          setSavedProgress(0);
        }
      })
      .catch(() => setSavedProgress(0));
  }, [progressKey]);

  // Initializing Expo Video Player with null source for instant layout mounting
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25; // Trigger timeUpdate 4x a second
    p.muted = false; // Force unmute audio
    p.volume = 1.0; // Default full volume
  });

  const hasLoadedInitialSourceRef = useRef(false);

  // Load or replace source dynamically
  useEffect(() => {
    if (!hasLoadedInitialSourceRef.current) {
      // Delay initial source load to let the player UI render instantly
      const timer = setTimeout(() => {
        const currentUrl = selectedSource ? selectedSource.url : url;
        player.replaceAsync({
          uri: currentUrl,
          headers: selectedSource ? selectedSource.headers : headers,
        })
        .then(() => {
          player.play();
        })
        .catch((err) => {
          console.warn("[CustomPlayer] Failed to load source asynchronously on mount:", err);
        });
        hasLoadedInitialSourceRef.current = true;
      }, 400);
      return () => clearTimeout(timer);
    } else {
      // Immediate load for quality changes
      const currentUrl = selectedSource ? selectedSource.url : url;
      player.replaceAsync({
        uri: currentUrl,
        headers: selectedSource ? selectedSource.headers : headers,
      })
      .then(() => {
        player.play();
      })
      .catch((err) => {
        console.warn("[CustomPlayer] Failed to replace source dynamically:", err);
      });
    }
  }, [selectedSource, url, headers]);

  // Keep relative player volume at max, control actual loudness via system volume
  useEffect(() => {
    player.volume = 1.0;
  }, [player]);

  // Hide system status bar & bottom navigation bar globally on mount, show on unmount
  useEffect(() => {
    StatusBar.setHidden(true, "fade");
    bridge.enterImmersiveMode();
    return () => {
      StatusBar.setHidden(false, "fade");
      bridge.exitImmersiveMode();
    };
  }, []);

  // Handle hardware back button on Android
  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => {
      subscription.remove();
    };
  }, []);

  const shouldUnlockOnUnmountRef = useRef(true);

  // Lock orientation to Landscape
  useEffect(() => {
    bridge.lockLandscape();
    return () => {
      if (shouldUnlockOnUnmountRef.current) {
        bridge.lockPortrait();
      }
    };
  }, []);

  // Track if progress bar is currently being dragged to prevent timeUpdate snaps
  const latestTimeRef = useRef(0);
  const isDraggingProgressRef = useRef(false);

  // Event listeners for expo-video player
  useEffect(() => {
    setIsPlaying(player.playing);
    setDuration(player.duration);
    setStatus(player.status);
    setCurrentTime(player.currentTime);
    latestTimeRef.current = player.currentTime;

    const subs = [
      player.addListener("playingChange", (event) => {
        setIsPlaying(event.isPlaying);
      }),
      player.addListener("timeUpdate", (event) => {
        setCurrentTime(event.currentTime);
        latestTimeRef.current = event.currentTime;
        if (!isDraggingProgressRef.current) {
          progressPercentShared.value = player.duration > 0 ? (event.currentTime / player.duration) * 100 : 0;
        }
      }),
      player.addListener("statusChange", (event) => {
        setStatus(event.status);
        if (event.status === "readyToPlay") {
          if (player.duration > 0) {
            setDuration(player.duration);
          }
          if (!hasInitiallyLoadedRef.current) {
            hasInitiallyLoadedRef.current = true;
            const currentUrl = selectedSource ? selectedSource.url : url;
            if (isDolbyAudio(selectedSource, currentUrl)) {
              setShowDolbyToast(true);
              setDolbyCountdown(8);
              if (dolbyIntervalRef.current) clearInterval(dolbyIntervalRef.current);
              dolbyIntervalRef.current = setInterval(() => {
                setDolbyCountdown((prev) => {
                  if (prev <= 1) {
                    if (dolbyIntervalRef.current) clearInterval(dolbyIntervalRef.current);
                    setShowDolbyToast(false);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
          }
        } else if (event.status === "error") {
          // If seeking occurred within the last 10 seconds, ignore transient canceled requests errors!
          const timeSinceLastSeek = Date.now() - lastSeekTimeRef.current;
          if (timeSinceLastSeek < 10000) {
            console.log("[CustomPlayer] Ignoring transient error immediately after seek:", event.error?.message);
            return;
          }
          // If source changed within the last 5 seconds, ignore transient old-source cancelled request errors!
          const timeSinceLastSourceChange = Date.now() - lastSourceChangeTimeRef.current;
          if (timeSinceLastSourceChange < 5000) {
            console.log("[CustomPlayer] Ignoring transient error immediately after source swap:", event.error?.message);
            return;
          }
          const errMsg = event.error?.message || "Source connection failed";
          let userFriendlyMsg = "This stream source is currently unreachable or invalid. Please try another quality or different provider source.";
          if (errMsg.toLowerCase().includes("timeout") || errMsg.toLowerCase().includes("connect")) {
            userFriendlyMsg = "Connection timed out. The host server might be offline or blocked by your network. Try a different source.";
          }
          setPlayerError(userFriendlyMsg);
        }
      }),
      player.addListener("sourceLoad", (event) => {
        setDuration(event.duration);
      }),
      player.addListener("playToEnd", () => {
        if (!hasLoadedInitialSourceRef.current) return; // Ignore playToEnd before the initial source has even loaded!
        if (sleepTimer === "episode") {
          handleClose();
        } else if (isSerial && onEpisodeChange && currentEpisodeIndex < episodes.length - 1) {
          onEpisodeChange(currentEpisodeIndex + 1);
        } else {
          handleClose();
        }
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [player, sleepTimer, isSerial, currentEpisodeIndex, episodes]);

  // Save progress on time changes and pauses
  const lastSavedTimeRef = useRef(0);

  const saveProgress = async (time: number) => {
    if (time <= 0) return;
    try {
      await AsyncStorage.setItem(progressKey, time.toString());
      lastSavedTimeRef.current = time;
      setSavedProgress(time);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (Math.abs(currentTime - lastSavedTimeRef.current) > 5) {
      saveProgress(currentTime);
    }
  }, [currentTime]);

  useEffect(() => {
    if (!isPlaying && currentTime > 0) {
      saveProgress(currentTime);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (latestTimeRef.current > 0) {
        AsyncStorage.setItem(progressKey, latestTimeRef.current.toString()).catch(() => {});
      }
    };
  }, [progressKey]);

  // Show Resume Prompt dialog when player status is ready and saved progress is found
  useEffect(() => {
    if (status === "readyToPlay" && savedProgress > 10 && !hasPromptedRef.current) {
      hasPromptedRef.current = true;
      player.pause();
      setShowResumePrompt(true);
    }
  }, [status, savedProgress]);

  // Handle resume position on source change (Quality change)
  useEffect(() => {
    if (status === "readyToPlay" && pendingSeek !== null) {
      player.currentTime = pendingSeek;
      setPendingSeek(null);
    }
  }, [status, pendingSeek]);

  // Subtitle fetching & parsing
  useEffect(() => {
    if (!activeSubtitleUrl) {
      setCues([]);
      setActiveCue(null);
      return;
    }
    fetch(activeSubtitleUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = parseSubtitles(text);
        setCues(parsed);
      })
      .catch((err) => {
        console.warn("[CustomPlayer] Failed to load subtitles:", err);
        setCues([]);
      });
  }, [activeSubtitleUrl]);

  // Update active subtitle cue based on currentTime & subDelay
  useEffect(() => {
    if (cues.length === 0) {
      setActiveCue(null);
      return;
    }
    const current = currentTime + subDelay;
    const active = cues.find((c) => current >= c.start && current <= c.end);
    setActiveCue(active || null);
  }, [currentTime, cues, subDelay]);

  // Sleep Timer countdown implementation
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (typeof sleepTimer === "number") {
      let secondsLeft = sleepTimer * 60;
      sleepTimerRef.current = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(sleepTimerRef.current!);
          handleClose();
        }
      }, 1000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimer]);

  // Controls Visibility Auto-Hide handler
  const resetHideTimer = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      const isPreparing = status === "loading" || status === "idle";
      if ((isPlaying || isPreparing) && activeModal === null && !showResumePrompt) {
        setShowControls(false);
        controlsOpacity.value = withTiming(0, { duration: 300 });
      }
    }, 4000);
  };

  const toggleControls = () => {
    if (showResumePrompt) return;
    if (activeModal !== null) {
      setActiveModal(null);
      return;
    }
    const nextVal = !showControls;
    setShowControls(nextVal);
    controlsOpacity.value = withTiming(nextVal ? 1 : 0, { duration: 300 });
    if (nextVal) {
      resetHideTimer();
    }
  };

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, status, activeModal, showResumePrompt]);

  // Gestures Touch tracking using start references to guarantee linear sliding math
  const startVolumeRef = useRef(1.0);
  const startBrightnessRef = useRef(0.5);

  // PanResponder now only triggers when controls are HIDDEN to prevent intercepting on-screen button touches
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isLocked && gesturesEnabled && !showControls,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return !isLocked && gesturesEnabled && !showControls && (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10);
        },
        onPanResponderGrant: (evt, gestureState) => {
          if (isLocked || !gesturesEnabled || showControls) return;
          const { x0 } = gestureState;
          startVolumeRef.current = volumeShared.value;
          startBrightnessRef.current = brightnessShared.value;
          if (x0 < SCREEN_WIDTH / 2) {
            setHudType("brightness");
            hudValueShared.value = startBrightnessRef.current;
          } else {
            setHudType("volume");
            hudValueShared.value = startVolumeRef.current;
          }
          hudOpacity.value = withTiming(1, { duration: 150 });
        },
        onPanResponderMove: (evt, gestureState) => {
          if (isLocked || !gesturesEnabled || showControls) return;
          const delta = -gestureState.dy / (SCREEN_HEIGHT * 0.4);
          if (gestureState.x0 < SCREEN_WIDTH / 2) {
            const nextBrightness = Math.max(0, Math.min(1, startBrightnessRef.current + delta));
            hudValueShared.value = nextBrightness;
            brightnessShared.value = nextBrightness;
            bridge.setScreenBrightness(nextBrightness);
          } else {
            const nextVolume = Math.max(0, Math.min(1, startVolumeRef.current + delta));
            hudValueShared.value = nextVolume;
            volumeShared.value = nextVolume;
            player.volume = nextVolume;
            setIsMuted(nextVolume === 0);
          }
        },
        onPanResponderRelease: () => {
          hudOpacity.value = withTiming(0, { duration: 250 });
          setTimeout(() => {
            setHudType(null);
          }, 250);
          resetHideTimer();
        },
        onPanResponderTerminate: () => {
          hudOpacity.value = withTiming(0, { duration: 250 });
          setTimeout(() => {
            setHudType(null);
          }, 250);
          resetHideTimer();
        },
      }),
    [player, isLocked, gesturesEnabled, showControls]
  );

  const handleClose = () => {
    player.pause();
    bridge.lockPortrait();
    onClose();
  };

  const handlePlayExternal = () => {
    player.pause();
    shouldUnlockOnUnmountRef.current = false;
    const currentUrl = selectedSource ? selectedSource.url : url;
    const currentHeaders = selectedSource ? selectedSource.headers : headers;
    bridge.playInExternalPlayer(currentUrl, null, title, currentHeaders ? JSON.stringify(currentHeaders) : null);
    onClose();
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const sStr = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  };

  const selectQuality = (src: VideoSource) => {
    setSelectedSource(src);
    setPendingSeek(player.currentTime);
    setActiveModal(null);
  };

  const selectSubtitle = (url: string) => {
    setActiveSubtitleUrl(url);
    setActiveModal(null);
  };

  const selectSpeed = (rate: number) => {
    setPlaybackRate(rate);
    player.playbackRate = rate;
    setActiveModal(null);
  };

  const handleSeekBack = () => {
    lastSeekTimeRef.current = Date.now();
    player.seekBy(-10);
    resetHideTimer();
  };

  const handleSeekForward = () => {
    lastSeekTimeRef.current = Date.now();
    player.seekBy(10);
    resetHideTimer();
  };

  // Seek to saved progress on Continue Watching pressed
  const handleContinueWatching = () => {
    if (savedProgress > 5) {
      player.currentTime = savedProgress;
      resetHideTimer();
    }
  };

  // Butter-Smooth On-Screen Slider Touch Handlers using pageX offsets & Shared Values
  const volumeStartPageX = useRef(0);
  const volumeStartVal = useRef(1.0);
  const lastVolumeRef = useRef(1.0);

  const handleMuteToggle = () => {
    if (volumeShared.value > 0) {
      lastVolumeRef.current = volumeShared.value;
      volumeShared.value = 0;
      bridge.setSystemVolume(0);
      setIsMuted(true);
    } else {
      const target = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1.0;
      volumeShared.value = target;
      bridge.setSystemVolume(target);
      setIsMuted(false);
    }
    resetHideTimer();
  };

  const handleVolumeTouchStart = (evt: GestureResponderEvent) => {
    setActiveSlider("volume");
    const { pageX, locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / 110));
    volumeShared.value = ratio;
    setIsMuted(ratio === 0);
    volumeStartVal.current = ratio;
    volumeStartPageX.current = pageX;
    bridge.setSystemVolume(ratio);
    resetHideTimer();
  };

  const handleVolumeTouchMove = (evt: GestureResponderEvent) => {
    const { pageX } = evt.nativeEvent;
    const deltaX = pageX - volumeStartPageX.current;
    const nextVal = Math.max(0, Math.min(1, volumeStartVal.current + deltaX / 550));
    volumeShared.value = nextVal;
    setIsMuted(nextVal === 0);
    bridge.setSystemVolume(nextVal);
    resetHideTimer();
  };

  const handleVolumeTouchEnd = () => {
    setActiveSlider(null);
  };

  const brightnessStartPageX = useRef(0);
  const brightnessStartVal = useRef(0.5);

  const handleBrightnessTouchStart = (evt: GestureResponderEvent) => {
    setActiveSlider("brightness");
    const { pageX, locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / 110));
    brightnessShared.value = ratio;
    brightnessStartVal.current = ratio;
    brightnessStartPageX.current = pageX;
    bridge.setScreenBrightness(ratio);
    resetHideTimer();
  };

  const handleBrightnessTouchMove = (evt: GestureResponderEvent) => {
    const { pageX } = evt.nativeEvent;
    const deltaX = pageX - brightnessStartPageX.current;
    const nextVal = Math.max(0, Math.min(1, brightnessStartVal.current + deltaX / 550));
    brightnessShared.value = nextVal;
    bridge.setScreenBrightness(nextVal);
    resetHideTimer();
  };

  const handleBrightnessTouchEnd = () => {
    setActiveSlider(null);
  };

  const progressStartPageX = useRef(0);
  const progressStartVal = useRef(0);

  const handleProgressBarTouchStart = (evt: GestureResponderEvent) => {
    isDraggingProgressRef.current = true;
    lastSeekTimeRef.current = Date.now();
    setActiveSlider("progress");
    const { pageX, locationX } = evt.nativeEvent;
    const normWidth = SCREEN_WIDTH - 200;
    const ratio = Math.max(0, Math.min(1, locationX / normWidth));
    const seekTime = ratio * duration;
    player.currentTime = seekTime;
    progressPercentShared.value = ratio * 100;
    progressStartVal.current = seekTime;
    progressStartPageX.current = pageX;
    resetHideTimer();
  };

  const handleProgressBarTouchMove = (evt: GestureResponderEvent) => {
    const { pageX } = evt.nativeEvent;
    lastSeekTimeRef.current = Date.now();
    const deltaX = pageX - progressStartPageX.current;
    const deltaRatio = deltaX / SCREEN_WIDTH;
    const nextTime = Math.max(0, Math.min(duration, progressStartVal.current + deltaRatio * duration));
    player.currentTime = nextTime;
    progressPercentShared.value = (nextTime / duration) * 100;
    resetHideTimer();
  };

  const handleProgressBarTouchEnd = () => {
    isDraggingProgressRef.current = false;
    lastSeekTimeRef.current = Date.now();
    setActiveSlider(null);
  };

  // Reanimated Animated styles for Butter-Smooth 60fps slider fills!
  const volumeFillStyle = useAnimatedStyle(() => {
    return {
      width: `${volumeShared.value * 100}%`,
    };
  });

  const brightnessFillStyle = useAnimatedStyle(() => {
    return {
      width: `${brightnessShared.value * 100}%`,
    };
  });

  const progressFillStyle = useAnimatedStyle(() => {
    return {
      width: `${progressPercentShared.value}%`,
    };
  });

  const hudBarInnerStyle = useAnimatedStyle(() => {
    return {
      height: `${hudValueShared.value * 100}%`,
    };
  });

  // Controls overlay styles
  const controlsStyle = useAnimatedStyle(() => {
    return {
      opacity: controlsOpacity.value,
      display: controlsOpacity.value === 0 ? "none" : "flex",
    };
  });

  const hudStyle = useAnimatedStyle(() => {
    return {
      opacity: hudOpacity.value,
    };
  });

  // Slider Expansion and UI Fading Styles
  const otherUIStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(activeSlider === null ? 1 : 0, { duration: 150 }),
    };
  });

  const volumeTrackStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(activeSlider === "volume" ? 550 : 110, { duration: 150 }),
    };
  });

  const brightnessTrackStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(activeSlider === "brightness" ? 550 : 110, { duration: 150 }),
    };
  });

  const volumeCapsuleStyle = useAnimatedStyle(() => {
    const isVisible = activeSlider === null || activeSlider === "volume";
    return {
      opacity: withTiming(isVisible ? 1 : 0, { duration: 150 }),
      width: withTiming(isVisible ? (activeSlider === "volume" ? 590 : 160) : 0, { duration: 150 }),
      paddingHorizontal: withTiming(isVisible ? 16 : 0, { duration: 150 }),
      borderWidth: withTiming(isVisible ? 1 : 0, { duration: 150 }),
    };
  });

  const brightnessCapsuleStyle = useAnimatedStyle(() => {
    const isVisible = activeSlider === null || activeSlider === "brightness";
    return {
      opacity: withTiming(isVisible ? 1 : 0, { duration: 150 }),
      width: withTiming(isVisible ? (activeSlider === "brightness" ? 590 : 160) : 0, { duration: 150 }),
      paddingHorizontal: withTiming(isVisible ? 16 : 0, { duration: 150 }),
      borderWidth: withTiming(isVisible ? 1 : 0, { duration: 150 }),
    };
  });

  const progressContainerStyle = useAnimatedStyle(() => {
    const isActive = activeSlider === "progress";
    return {
      marginHorizontal: withTiming(isActive ? 0 : 16, { duration: 150 }),
      height: withTiming(isActive ? 60 : 40, { duration: 150 }),
    };
  });

  const progressTrackStyle = useAnimatedStyle(() => {
    const isActive = activeSlider === "progress";
    return {
      height: withTiming(isActive ? 40 : 20, { duration: 150 }),
      borderRadius: withTiming(isActive ? 20 : 10, { duration: 150 }),
    };
  });

  // Render Locked UI state (minimizes overlays to avoid accidental triggers)
  if (isLocked) {
    return (
      <View style={[StyleSheet.absoluteFillObject, { zIndex: 99999, backgroundColor: "#050505" }]}>
        <StatusBar hidden />
        <View style={styles.container}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            nativeControls={false}
            surfaceType="textureView"
          />

          {/* Vignette Shading Fades at Top & Bottom */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LinearGradient
              colors={["rgba(5, 5, 5, 0.85)", "rgba(5, 5, 5, 0.3)", "transparent"]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120 }}
            />
            <LinearGradient
              colors={["transparent", "rgba(5, 5, 5, 0.3)", "rgba(5, 5, 5, 0.9)"]}
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 160 }}
            />
          </View>

          {/* Locked Floating Unlock Controls Button */}
          <View style={styles.lockOverlay} pointerEvents="box-none">
            <TouchableOpacity onPress={() => setIsLocked(false)} activeOpacity={0.8} style={styles.lockBtn}>
              <View style={styles.blurCover}>
                <LockOpenIcon size={24} color={theme.colors.accentLight} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 99999, backgroundColor: "#050505" }]}>
      <StatusBar hidden />
      <View style={styles.container}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          nativeControls={false}
          surfaceType="textureView"
        />

        {/* Dolby Audio Warning Modal */}
        {showDolbyToast && (
          <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            style={styles.dolbyWarningOverlay}
          >
            <View style={styles.dolbyWarningCard}>
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(15, 15, 20, 0.95)", borderRadius: 16 }]} />
              <View style={styles.dolbyWarningHeader}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <SpeakerWaveIcon size={20} color={theme.colors.rose} style={{ marginRight: 10 }} />
                  <Text style={styles.dolbyWarningTitle}>Dolby Audio Detected</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowDolbyToast(false);
                    if (dolbyIntervalRef.current) clearInterval(dolbyIntervalRef.current);
                  }}
                  style={styles.dolbyWarningCloseBtn}
                  activeOpacity={0.8}
                >
                  <XMarkIcon size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.dolbyWarningMessage}>
                This stream contains a Dolby 5.1 / AC3 audio track. If you do not hear any sound, please use the "Open in External Player" option at the top-left to play with VLC or MX Player (HW+).
              </Text>
              <Text style={styles.dolbyWarningCountdown}>
                Auto-closing in {dolbyCountdown} seconds...
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Double-tap / Gestures area */}
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={toggleControls}
          />
        </View>

        {/* Subtitles Overlay */}
        {activeCue && (
          <View
            style={[
              styles.subtitleContainer,
              subPosition === "top"
                ? { top: 100, bottom: undefined }
                : subPosition === "middle"
                ? { top: SCREEN_HEIGHT / 2 - 20, bottom: undefined }
                : { bottom: 120, top: undefined },
            ]}
            pointerEvents="none"
          >
            <Text
              style={[
                styles.subtitleText,
                subBackground === "none"
                  ? { backgroundColor: "transparent" }
                  : subBackground === "solid"
                  ? { backgroundColor: "rgba(0,0,0,0.95)" }
                  : { backgroundColor: "rgba(0,0,0,0.65)" }, // translucent default
              ]}
            >
              {activeCue.text}
            </Text>
          </View>
        )}

        {/* Loading buffering indicator - only when controls are hidden */}
        {(status === "loading" || status === "idle") && !showControls && (
          <View style={styles.bufferingContainer} pointerEvents="none">
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        )}

        {/* Volume / Brightness HUD Overlay */}
        <Animated.View style={[styles.hudContainer, hudStyle]} pointerEvents="none">
          <View style={styles.hudBlur}>
            {hudType === "brightness" ? (
              <SunIcon size={28} color="#fff" />
            ) : (
              <SpeakerWaveIcon size={28} color="#fff" />
            )}
            <View style={styles.hudBarOuter}>
              <Animated.View
                style={[
                  styles.hudBarInner,
                  hudBarInnerStyle,
                ]}
              />
            </View>
          </View>
        </Animated.View>

        {/* Top and Bottom Controls Interface - box-none to pass touches to child views */}
        <Animated.View style={[StyleSheet.absoluteFill, controlsStyle]} pointerEvents="box-none">
          {/* Vignette Shading Fades at Top & Bottom */}
          <Animated.View style={[StyleSheet.absoluteFill, otherUIStyle]} pointerEvents="none">
            <LinearGradient
              colors={["rgba(5, 5, 5, 0.85)", "rgba(5, 5, 5, 0.3)", "transparent"]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 120,
              }}
            />
            <LinearGradient
              colors={["transparent", "rgba(5, 5, 5, 0.3)", "rgba(5, 5, 5, 0.9)"]}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 160,
              }}
            />
          </Animated.View>
          {/* Top Panel Controls - top: 40 to avoid system notification bar interference */}
          <View style={styles.topPanel} pointerEvents="box-none">
            {/* Extreme Left: Back Button & Top Options Capsule */}
            <Animated.View style={[styles.topPanelLeft, otherUIStyle]} pointerEvents={activeSlider === null ? "box-none" : "none"}>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.8} style={styles.circleBlurBtn}>
                <View style={[styles.blurCover, { borderRadius: 25 }]}>
                  <XMarkIcon size={26} color="#fff" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePlayExternal} activeOpacity={0.8} style={styles.circleBlurBtn}>
                <View style={[styles.blurCover, { borderRadius: 25 }]}>
                  <ArrowUpRightIcon size={20} color="#fff" />
                </View>
              </TouchableOpacity>

              {/* Top Menu capsule: Controls Lock, Aspect Ratio, and Swipe Gestures Toggle */}
              <View style={styles.topMenuCapsule}>
                <TouchableOpacity
                  onPress={() => {
                    setIsLocked(true);
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <LockClosedIcon size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setContentFit((prev) => (prev === "contain" ? "cover" : prev === "cover" ? "fill" : "contain"));
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <ArrowsPointingOutIcon size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setGesturesEnabled(!gesturesEnabled);
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <FingerPrintIcon
                    size={20}
                    color={gesturesEnabled ? "#fff" : "rgba(255,255,255,0.4)"}
                  />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Top Right: Volume and Brightness vertical sliders stack */}
            <View style={styles.topRightSlidersStack} pointerEvents="box-none">
              {/* Volume control slider capsule */}
              <Animated.View style={[styles.sliderCapsule, volumeCapsuleStyle]}>
                <View style={{ flexDirection: "row", alignItems: "center", width: "100%", height: "100%" }}>
                  <Animated.View
                    style={[styles.sliderTrackContainer, volumeTrackStyle]}
                    onTouchStart={handleVolumeTouchStart}
                    onTouchMove={handleVolumeTouchMove}
                    onTouchEnd={handleVolumeTouchEnd}
                    onTouchCancel={handleVolumeTouchEnd}
                  >
                    <View style={styles.sliderTrack}>
                      <Animated.View style={[styles.sliderFill, volumeFillStyle]} />
                    </View>
                  </Animated.View>
                  <TouchableOpacity onPress={handleMuteToggle} activeOpacity={0.8}>
                    <SpeakerWaveIcon
                      size={20}
                      color={isMuted ? theme.colors.rose : "#fff"}
                    />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              {/* Brightness control slider capsule */}
              <Animated.View style={[styles.sliderCapsule, brightnessCapsuleStyle]}>
                <View style={{ flexDirection: "row", alignItems: "center", width: "100%", height: "100%" }}>
                  <Animated.View
                    style={[styles.sliderTrackContainer, brightnessTrackStyle]}
                    onTouchStart={handleBrightnessTouchStart}
                    onTouchMove={handleBrightnessTouchMove}
                    onTouchEnd={handleBrightnessTouchEnd}
                    onTouchCancel={handleBrightnessTouchEnd}
                  >
                    <View style={styles.sliderTrack}>
                      <Animated.View style={[styles.sliderFill, brightnessFillStyle]} />
                    </View>
                  </Animated.View>
                  <SunIcon size={20} color="#fff" />
                </View>
              </Animated.View>
            </View>
          </View>

          {/* Center Playback Controls */}
          <Animated.View style={[styles.centerPanel, otherUIStyle]} pointerEvents={activeSlider === null ? "box-none" : "none"}>
            {/* Show Prev Episode Button if Series */}
            {isSerial && onEpisodeChange && currentEpisodeIndex > 0 && (
              <TouchableOpacity
                onPress={() => onEpisodeChange(currentEpisodeIndex - 1)}
                activeOpacity={0.8}
                style={[styles.centerEpBtn, { marginRight: 16 }]}
              >
                <View style={[styles.blurCover, { borderRadius: 21 }]}>
                  <BackwardIcon size={20} color="#fff" />
                </View>
              </TouchableOpacity>
            )}

            {/* Seek Back Button with ArrowPathIcon flipped + "10" inside */}
            <TouchableOpacity onPress={handleSeekBack} activeOpacity={0.8} style={styles.centerNavBtn}>
              <View style={[styles.blurCover, { borderRadius: 27 }]}>
                <ArrowPathIcon size={28} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
                <Text style={styles.seekIconText}>10</Text>
              </View>
            </TouchableOpacity>

            {/* Play/Pause Button - Shows buffering indicator inside when activeControls are visible */}
            <TouchableOpacity
              onPress={() => (isPlaying ? player.pause() : player.play())}
              activeOpacity={0.8}
              style={styles.centerPlayBtn}
            >
              <View style={[styles.blurCover, { borderRadius: 44 }]}>
                {(status === "loading" || status === "idle") ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : isPlaying ? (
                  <PauseIcon size={44} color="#fff" />
                ) : (
                  <PlayIcon size={44} color="#fff" style={{ marginLeft: 6 }} />
                )}
              </View>
            </TouchableOpacity>

            {/* Seek Forward Button with ArrowPathIcon + "10" inside */}
            <TouchableOpacity onPress={handleSeekForward} activeOpacity={0.8} style={styles.centerNavBtn}>
              <View style={[styles.blurCover, { borderRadius: 27 }]}>
                <ArrowPathIcon size={28} color="#fff" />
                <Text style={styles.seekIconText}>10</Text>
              </View>
            </TouchableOpacity>

            {/* Show Next Episode Button if Series */}
            {isSerial && onEpisodeChange && currentEpisodeIndex < episodes.length - 1 && (
              <TouchableOpacity
                onPress={() => onEpisodeChange(currentEpisodeIndex + 1)}
                activeOpacity={0.8}
                style={[styles.centerEpBtn, { marginLeft: 16 }]}
              >
                <View style={[styles.blurCover, { borderRadius: 21 }]}>
                  <ForwardIcon size={20} color="#fff" />
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Bottom Panel Controls - Shifted to bottom: 40 to avoid notch/system cutouts */}
          <View style={styles.bottomPanel} pointerEvents="box-none">
            {/* Row 1: Logo & Settings Capsule (Layers icon removed, keeping subtitles & speed dashboard) */}
            <Animated.View style={[styles.bottomMetaRow, otherUIStyle]} pointerEvents={activeSlider === null ? "box-none" : "none"}>
              <View style={styles.titleLogoRow}>
                {logoUrl ? (
                  <View style={styles.logoShadowContainer}>
                    <Image
                      source={{ uri: logoUrl }}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <Text style={styles.titleText}>{title}</Text>
                )}
                {isSerial && (
                  <Text style={styles.episodeText}>
                    S{season}E{episode}: {episodeTitle}
                  </Text>
                )}
              </View>

              {/* Bottom Right: Video/Subtitle settings capsule */}
              <View style={styles.capsuleBlur}>
                <TouchableOpacity
                  onPress={() => setActiveModal("subtitles")}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <LanguageIcon size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setActiveModal("speed")}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <BoltIcon size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Row 2: Scrubber timeline full-width at the bottom, and time labels placed beside it (Left/Right) */}
            {/* Scrubber fill is white with no thumb, matching volume slider style. Height doubled to 8px! */}
            <View style={styles.scrubberRow} pointerEvents="box-none">
              <Animated.Text style={[styles.timeText, otherUIStyle]}>{formatTime(currentTime)}</Animated.Text>
              
              <Animated.View
                style={[styles.progressBarContainer, progressContainerStyle]}
                onTouchStart={handleProgressBarTouchStart}
                onTouchMove={handleProgressBarTouchMove}
                onTouchEnd={handleProgressBarTouchEnd}
                onTouchCancel={handleProgressBarTouchEnd}
              >
                <Animated.View style={[styles.progressBarTrack, progressTrackStyle]}>
                  <Animated.View style={[styles.progressBarFill, progressFillStyle]} />
                </Animated.View>
              </Animated.View>

              <TouchableOpacity onPress={() => setShowRemainingTime(!showRemainingTime)} activeOpacity={0.8}>
                <Animated.Text style={[styles.timeText, otherUIStyle]}>
                  {showRemainingTime ? `-${formatTime(duration - currentTime)}` : formatTime(duration)}
                </Animated.Text>
              </TouchableOpacity>
            </View>

            {/* Row 3: Action Pills (Moved below the progress bar as requested) */}
            <Animated.View style={[styles.actionPillsRow, otherUIStyle]} pointerEvents={activeSlider === null ? "auto" : "none"}>
              {/* Show Continue Watching button only if there is valid saved progress */}
              {savedProgress > 5 && duration > 0 && savedProgress < duration - 15 && (
                <View style={styles.pillCover}>
                  <TouchableOpacity onPress={handleContinueWatching} style={styles.pillBtn}>
                    <ClockIcon size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.pillText}>Continue Watching ({formatTime(savedProgress)})</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Keep only this Sources button below the progress bar! */}
              <View style={styles.pillCover}>
                <TouchableOpacity onPress={() => setActiveModal("quality")} style={styles.pillBtn}>
                  <Square3Stack3DIcon size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.pillText}>Sources</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Continue Watching Resume Prompt Overlay */}
        <PlayerModal
          visible={showResumePrompt}
          onClose={() => {
            player.currentTime = 0;
            player.play();
            setShowResumePrompt(false);
          }}
          title="Resume Playback?"
          hideCloseButton={true}
        >
          <View style={{ alignItems: "center", width: "100%" }}>
            <ClockIcon size={42} color={theme.colors.accentLight} style={{ marginBottom: 12 }} />
            <Text style={styles.resumePromptSubtitle}>
              You watched up to {formatTime(savedProgress)}. Would you like to continue from where you left?
            </Text>
            <View style={styles.resumePromptButtons}>
              <TouchableOpacity
                onPress={() => {
                  player.currentTime = savedProgress;
                  player.play();
                  setShowResumePrompt(false);
                }}
                activeOpacity={0.8}
                style={[styles.resumeBtn, { marginRight: 16 }]}
              >
                <Text style={styles.resumeBtnText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  player.currentTime = 0;
                  player.play();
                  setShowResumePrompt(false);
                }}
                activeOpacity={0.8}
                style={styles.startOverBtn}
              >
                <Text style={styles.startOverBtnText}>Start Fresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        </PlayerModal>

        {/* Sources/Quality select modal */}
        <PlayerModal
          visible={activeModal === "quality"}
          onClose={() => setActiveModal(null)}
          title="Select Source"
        >
          {(() => {
            const directSources = sources.filter(
              (s) =>
                s.type !== "torrent" &&
                !s.url.startsWith("magnet:"),
            );
            const torrentSources = sources.filter(
              (s) =>
                s.type === "torrent" || s.url.startsWith("magnet:"),
            );

            const renderSourceRow = (source: any, idx: number) => {
              const isSplitted = source.quality.includes(" · ");
              const hostName =
                source.host ||
                (isSplitted
                  ? source.quality.split(" · ")[0]
                  : source.quality) ||
                "Direct";
              const qualityTag = isSplitted
                ? source.quality.split(" · ")[1]
                : "Auto";
              const hasHeaders =
                source.headers &&
                Object.keys(source.headers).length > 0;
              const protocolLabel = getProtocolLabel(
                source.type,
                source.url,
              );

              const sizeMatch = source.quality.match(
                /\[?(\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes))\]?/i,
              );
              const sizeTag = sizeMatch ? sizeMatch[1] : null;
              const isTorrentSource =
                source.type === "torrent" ||
                source.url.startsWith("magnet:");
              const torrentSeeders = source.seeders as
                | number
                | undefined;

              const isSelected = selectedSource?.url === source.url;

              return (
                <TouchableOpacity
                  key={`source-${source.type}-${idx}`}
                  style={[styles.sheetRow, isSelected && styles.sheetRowActive]}
                  onPress={() => selectQuality(source)}
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
                          isSelected && styles.sheetQualityActive,
                          { marginRight: 4 },
                        ]}
                      >
                        {hostName}
                      </Text>

                      <View
                        style={[
                          styles.sheetBadge,
                          {
                            backgroundColor:
                              getQualityBadgeBg(qualityTag),
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
                          {qualityTag}
                        </Text>
                      </View>

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
                              {`👤 ${torrentSeeders}`}
                            </Text>
                          </View>
                        )}

                      {source.provider && (
                        <View
                          style={[
                            styles.sheetBadge,
                            {
                              backgroundColor:
                                "rgba(85,128,255,0.1)",
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
                              backgroundColor:
                                "rgba(0,71,255,0.08)",
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

                      {sizeTag && (
                        <View
                          style={[
                            styles.sheetBadge,
                            {
                              backgroundColor: "rgba(85, 128, 255, 0.12)",
                              borderColor: "rgba(85, 128, 255, 0.25)",
                              borderWidth: 0.5,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sheetBadgeText,
                              {
                                color: "#5580FF",
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {sizeTag}
                          </Text>
                        </View>
                      )}

                      {subtitles.length > 0 && idx === 0 ? (
                        <View
                          style={[
                            styles.sheetBadge,
                            {
                              backgroundColor:
                                "rgba(255,255,255,0.05)",
                            },
                          ]}
                        >
                          <Text style={styles.sheetBadgeText}>
                            Subs
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {isSelected && (
                    <CheckIcon size={16} color={theme.colors.accentLight} />
                  )}
                </TouchableOpacity>
              );
            };

            return (
              <View style={{ width: "100%" }}>
                {/* Direct/HLS Sources rendered first */}
                {directSources.map((source, idx) =>
                  renderSourceRow(source, idx),
                )}

                {/* Collapsible Torrent Accordion row */}
                {torrentSources.length > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        setTorrentExpanded(!torrentExpanded);
                      }}
                      style={[
                        styles.accordionHeader,
                        torrentExpanded &&
                          styles.accordionHeaderActive,
                      ]}
                      activeOpacity={0.8}
                    >
                      <ArrowDownTrayIcon
                        size={18}
                        color={theme.colors.rose}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.accordionTitle}>
                        Torrent & Magnet Links ({torrentSources.length} found)
                      </Text>
                      {torrentExpanded ? (
                        <ChevronUpIcon size={18} color="#a0a0a5" />
                      ) : (
                        <ChevronDownIcon size={18} color="#a0a0a5" />
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
                        style={{
                          width: "100%",
                          position: "absolute",
                          top: 0,
                        }}
                      >
                        {torrentSources.map((source, idx) =>
                          renderSourceRow(source, idx),
                        )}
                      </View>
                    </Animated.View>
                  </>
                )}
              </View>
            );
          })()}
        </PlayerModal>

        {/* Subtitles modal */}
        <PlayerModal
          visible={activeModal === "subtitles"}
          onClose={() => setActiveModal(null)}
          title="Select Subtitles"
        >
          <View style={styles.settingsModalBody}>
            {/* Select Subtitle Track */}
            <Text style={styles.settingsLabel}>Subtitle Track</Text>
            <View style={{ width: "100%", maxHeight: 60, marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingVertical: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.speedOption,
                    activeSubtitleUrl === "" && styles.speedOptionActive,
                  ]}
                  onPress={() => selectSubtitle("")}
                >
                  <Text style={styles.speedOptionText}>Off</Text>
                </TouchableOpacity>
                {subtitles.map((sub, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.speedOption,
                      activeSubtitleUrl === sub.url && styles.speedOptionActive,
                    ]}
                    onPress={() => selectSubtitle(sub.url)}
                  >
                    <Text style={styles.speedOptionText}>{sub.lang}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Subtitle Delay (Sync) */}
            <Text style={[styles.settingsLabel, { marginTop: 12 }]}>
              Subtitle Sync (Delay: {subDelay > 0 ? `+${subDelay.toFixed(1)}` : subDelay.toFixed(1)}s)
            </Text>
            <View style={styles.speedRow}>
              <TouchableOpacity
                style={styles.speedOption}
                onPress={() => {
                  setSubDelay((prev) => prev - 0.5);
                  resetHideTimer();
                }}
              >
                <Text style={styles.speedOptionText}>-0.5s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.speedOption}
                onPress={() => {
                  setSubDelay((prev) => prev - 0.1);
                  resetHideTimer();
                }}
              >
                <Text style={styles.speedOptionText}>-0.1s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.speedOption, subDelay === 0 && styles.speedOptionActive]}
                onPress={() => {
                  setSubDelay(0);
                  resetHideTimer();
                }}
              >
                <Text style={styles.speedOptionText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.speedOption}
                onPress={() => {
                  setSubDelay((prev) => prev + 0.1);
                  resetHideTimer();
                }}
              >
                <Text style={styles.speedOptionText}>+0.1s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.speedOption}
                onPress={() => {
                  setSubDelay((prev) => prev + 0.5);
                  resetHideTimer();
                }}
              >
                <Text style={styles.speedOptionText}>+0.5s</Text>
              </TouchableOpacity>
            </View>

            {/* Subtitle Vertical Position */}
            <Text style={[styles.settingsLabel, { marginTop: 12 }]}>Vertical Position</Text>
            <View style={styles.speedRow}>
              {(["top", "middle", "bottom"] as const).map((pos) => (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.speedOption,
                    subPosition === pos && styles.speedOptionActive,
                  ]}
                  onPress={() => {
                    setSubPosition(pos);
                    resetHideTimer();
                  }}
                >
                  <Text style={styles.speedOptionText}>
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subtitle Background Toggle */}
            <Text style={[styles.settingsLabel, { marginTop: 12 }]}>Background Block</Text>
            <View style={styles.speedRow}>
              {(["none", "translucent", "solid"] as const).map((bg) => (
                <TouchableOpacity
                  key={bg}
                  style={[
                    styles.speedOption,
                    subBackground === bg && styles.speedOptionActive,
                  ]}
                  onPress={() => {
                    setSubBackground(bg);
                    resetHideTimer();
                  }}
                >
                  <Text style={styles.speedOptionText}>
                    {bg === "none" ? "No BG" : bg === "translucent" ? "Translucent" : "Solid Black"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </PlayerModal>

        {/* Settings/Speed Modal */}
        <PlayerModal
          visible={activeModal === "speed"}
          onClose={() => setActiveModal(null)}
          title="Playback Settings"
        >
          <View style={styles.settingsModalBody}>
            <Text style={styles.settingsLabel}>Playback Speed</Text>
            <View style={styles.speedRow}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.speedOption,
                    playbackRate === rate && styles.speedOptionActive,
                  ]}
                  onPress={() => selectSpeed(rate)}
                >
                  <Text style={styles.speedOptionText}>{rate}x</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.settingsLabel, { marginTop: 12 }]}>Swipe Gestures</Text>
            <View style={styles.speedRow}>
              {[
                { label: "On", value: true },
                { label: "Off", value: false },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.speedOption,
                    gesturesEnabled === opt.value && styles.speedOptionActive,
                  ]}
                  onPress={() => {
                    setGesturesEnabled(opt.value);
                    setActiveModal(null);
                  }}
                >
                  <Text style={styles.speedOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.settingsLabel, { marginTop: 12 }]}>Sleep Timer</Text>
            <View style={styles.speedRow}>
              {["off", 15, 30, 60, "episode"].map((timer) => (
                <TouchableOpacity
                  key={timer.toString()}
                  style={[
                    styles.speedOption,
                    sleepTimer === timer && styles.speedOptionActive,
                  ]}
                  onPress={() => {
                    setSleepTimer(timer as any);
                    setActiveModal(null);
                  }}
                >
                  <Text style={styles.speedOptionText}>
                    {timer === "off"
                       ? "Off"
                      : timer === "episode"
                      ? "End of Ep"
                      : `${timer}m`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </PlayerModal>

        {/* Playback Error Modal */}
        <CustomModal
          visible={playerError !== null}
          onClose={() => {
            setPlayerError(null);
            handleClose();
          }}
          title="Playback Failed"
          message={playerError || ""}
          glowColors={["rgba(255, 74, 125, 0.15)", "transparent"]}
          Icon={ExclamationCircleIcon}
          iconColor="#ff4a7d"
          iconBgColor="rgba(255, 74, 125, 0.1)"
        >
          <View style={{ width: "100%", alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, textAlign: "center", paddingHorizontal: 24, lineHeight: 16, marginBottom: 12 }}>
              Tip: If the stream has no audio (e.g. Dolby AC3 codec) or fails to play, use the "Open in External Player" option at the top left to play with VLC or MX Player.
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "center", width: "100%", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setPlayerError(null);
                  const currentUrl = selectedSource ? selectedSource.url : url;
                  player.replaceAsync({ uri: currentUrl, headers: selectedSource?.headers })
                  .then(() => {
                    player.play();
                  })
                  .catch((err) => {
                    console.warn("[CustomPlayer] Retry replace failed:", err);
                  });
                }}
                activeOpacity={0.8}
                style={[styles.resumeBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]}
              >
                <Text style={styles.resumeBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPlayerError(null);
                  setActiveModal("quality");
                }}
                activeOpacity={0.8}
                style={[styles.startOverBtn, { flex: 1, paddingVertical: 12, alignItems: "center", borderColor: "rgba(85, 128, 255, 0.45)", backgroundColor: "rgba(85, 128, 255, 0.08)" }]}
              >
                <Text style={[styles.startOverBtnText, { color: theme.colors.accentLight }]}>Change Source</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPlayerError(null);
                  handleClose();
                }}
                activeOpacity={0.8}
                style={[styles.startOverBtn, { flex: 1, paddingVertical: 12, alignItems: "center" }]}
              >
                <Text style={styles.startOverBtnText}>Close Player</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CustomModal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
  },
  subtitleContainer: {
    position: "absolute",
    bottom: 150,
    left: 40,
    right: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitleText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: "hidden",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bufferingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  hudContainer: {
    position: "absolute",
    top: SCREEN_HEIGHT / 2 - 80,
    alignSelf: "center",
    width: 70,
    height: 160,
    borderRadius: 16,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  hudBlur: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  hudBarOuter: {
    width: 6,
    height: 90,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    marginTop: 10,
    justifyContent: "flex-end",
  },
  hudBarInner: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 3,
  },
  topPanel: {
    position: "absolute",
    top: 40,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  topPanelLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  circleBlurBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  topMenuCapsule: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  centerNavBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  centerEpBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  centerPlayBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    marginHorizontal: 24,
  },
  blurCover: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topRightSlidersStack: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  },
  sliderCapsule: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  sliderTrackContainer: {
    width: 110,
    height: 24,
    justifyContent: "center",
    marginRight: 10,
  },
  sliderTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
  },
  sliderFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  capsuleBlur: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  capsuleIconBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  centerPanel: {
    position: "absolute",
    top: SCREEN_HEIGHT / 2 - 44,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  bottomPanel: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
  },
  bottomMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  bottomLeftMeta: {
    flex: 1,
    marginRight: 24,
  },
  titleLogoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    width: 108,
    height: 30,
  },
  logoShadowContainer: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  titleText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
    marginRight: 12,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  episodeText: {
    color: "#A0A0A5",
    fontSize: 16,
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actionPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  pillCover: {
    borderRadius: 20,
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    marginRight: 8,
  },
  pillBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  pillText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  scrubberRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 0,
  },
  timeText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    width: 60,
    textAlign: "center",
  },
  progressBarContainer: {
    flex: 1,
    height: 60,
    justifyContent: "center",
  },
  progressBarTrack: {
    width: "100%",
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 32,
  },
  lockBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "rgba(20, 18, 24, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#0047FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  resumePromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999999,
  },
  resumePromptBlur: {
    width: 440,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  playerModalContainer: {
    width: 460,
    maxHeight: SCREEN_HEIGHT * 0.9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    padding: 24,
    justifyContent: "flex-start",
  },
  modalScrollBody: {
    width: "100%",
  },
  modalScrollBodyContent: {
    width: "100%",
    paddingVertical: 10,
  },
  resumePromptTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  resumePromptSubtitle: {
    color: "#A0A0A5",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  resumePromptButtons: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
  },
  resumeBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  resumeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  startOverBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  startOverBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  seekIconContainer: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  seekIconText: {
    position: "absolute",
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollContainer: {
    width: "100%",
    maxHeight: SCREEN_HEIGHT - 120,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    width: "100%",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  modalItemActive: {
    opacity: 0.9,
  },
  modalItemText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  settingsModalBody: {
    width: "100%",
    alignItems: "flex-start",
  },
  settingsLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  speedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    marginBottom: 12,
  },
  speedOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginRight: 8,
    marginBottom: 8,
  },
  speedOptionActive: {
    backgroundColor: theme.colors.accent,
  },
  speedOptionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  bottomSheetContainer: {
    display: "none",
  },
  sheetContent: {
    display: "none",
  },
  dolbyWarningOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999999,
  },
  dolbyWarningCard: {
    width: 450,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 74, 125, 0.25)",
    overflow: "hidden",
    elevation: 5,
  },
  dolbyWarningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dolbyWarningTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dolbyWarningCloseBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dolbyWarningMessage: {
    color: "#E5E2E3",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  dolbyWarningCountdown: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textAlign: "right",
    fontWeight: "500",
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
    width: "100%",
  },
  sheetRowActive: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.15)",
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
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
    width: "100%",
  },
  accordionHeaderActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  accordionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
});
