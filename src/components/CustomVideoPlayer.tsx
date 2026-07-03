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
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView, BlurTargetView } from "expo-blur";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  PlayIcon,
  PauseIcon,
  Cancel01Icon,
  LockIcon,
  LockKeyIcon,
  Maximize02Icon,
  FingerPrintIcon,
  VolumeHighIcon,
  Sun01Icon,
  ClosedCaptionIcon,
  DashboardSpeed01Icon,
  DatabaseSettingIcon,
  PreviousIcon,
  NextIcon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  Clock01Icon
} from "@hugeicons/core-free-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { theme } from "../theme";
import * as bridge from "../api/cloudStreamBridge";

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

  // Real-time blur target hooks
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = (val: any) => {
    blurTargetRef.current = val;
    if (val !== blurTarget) {
      setBlurTarget(val);
    }
  };

  // Video source state
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(
    sources.find((s) => s.url === url) || sources[0] || null
  );
  
  // Subtitle state
  const [activeSubtitleUrl, setActiveSubtitleUrl] = useState<string>(
    subtitles[0]?.url || ""
  );
  const [cues, setCues] = useState<Cue[]>([]);
  const [activeCue, setActiveCue] = useState<Cue | null>(null);

  // Player state variables
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<string>("idle");
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

  // Modal Dialogs
  const [activeModal, setActiveModal] = useState<"quality" | "subtitles" | "speed" | null>(null);

  // Playback Rate
  const [playbackRate, setPlaybackRate] = useState(1.0);

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

  // Initializing Expo Video Player with timeUpdateEventInterval & unmute parameters
  const playerSource = useMemo(() => {
    const srcObj: any = {
      uri: selectedSource ? selectedSource.url : url,
    };
    const currentHeaders = selectedSource ? selectedSource.headers : headers;
    if (currentHeaders) {
      srcObj.headers = currentHeaders;
    }
    return srcObj;
  }, [selectedSource, url, headers]);

  const player = useVideoPlayer(playerSource, (p) => {
    p.play();
    p.timeUpdateEventInterval = 0.25; // Trigger timeUpdate 4x a second
    p.muted = false; // Force unmute audio
    p.volume = 1.0; // Default full volume
  });

  // Keep volume in sync with Shared Value changes
  useEffect(() => {
    player.volume = volumeShared.value;
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

  // Lock orientation to Landscape
  useEffect(() => {
    bridge.lockLandscape();
    return () => {
      bridge.unlockOrientation();
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
    volumeShared.value = player.volume;
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
        if (event.status === "readyToPlay" && player.duration > 0) {
          setDuration(player.duration);
        }
      }),
      player.addListener("sourceLoad", (event) => {
        setDuration(event.duration);
      }),
      player.addListener("playToEnd", () => {
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

  // Update active subtitle cue based on currentTime
  useEffect(() => {
    if (cues.length === 0) {
      setActiveCue(null);
      return;
    }
    const current = currentTime;
    const active = cues.find((c) => current >= c.start && current <= c.end);
    setActiveCue(active || null);
  }, [currentTime, cues]);

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
      if (player.playing && activeModal === null && !showResumePrompt) {
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
  }, [isPlaying, activeModal, showResumePrompt]);

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
    bridge.unlockOrientation();
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
    player.seekBy(-10);
    resetHideTimer();
  };

  const handleSeekForward = () => {
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

  const handleVolumeTouchStart = (evt: GestureResponderEvent) => {
    const { pageX, locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / 110));
    volumeShared.value = ratio;
    volumeStartVal.current = ratio;
    volumeStartPageX.current = pageX;
    player.volume = ratio;
    resetHideTimer();
  };

  const handleVolumeTouchMove = (evt: GestureResponderEvent) => {
    const { pageX } = evt.nativeEvent;
    const deltaX = pageX - volumeStartPageX.current;
    const nextVal = Math.max(0, Math.min(1, volumeStartVal.current + deltaX / 110));
    volumeShared.value = nextVal;
    player.volume = nextVal;
    resetHideTimer();
  };

  const brightnessStartPageX = useRef(0);
  const brightnessStartVal = useRef(0.5);

  const handleBrightnessTouchStart = (evt: GestureResponderEvent) => {
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
    const nextVal = Math.max(0, Math.min(1, brightnessStartVal.current + deltaX / 110));
    brightnessShared.value = nextVal;
    bridge.setScreenBrightness(nextVal);
    resetHideTimer();
  };

  const progressStartPageX = useRef(0);
  const progressStartVal = useRef(0);
  const scrubberWidth = SCREEN_WIDTH - 200;

  const handleProgressBarTouchStart = (evt: GestureResponderEvent) => {
    isDraggingProgressRef.current = true;
    const { pageX, locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / scrubberWidth));
    const seekTime = ratio * duration;
    player.currentTime = seekTime;
    progressPercentShared.value = ratio * 100;
    progressStartVal.current = seekTime;
    progressStartPageX.current = pageX;
    resetHideTimer();
  };

  const handleProgressBarTouchMove = (evt: GestureResponderEvent) => {
    const { pageX } = evt.nativeEvent;
    const deltaX = pageX - progressStartPageX.current;
    const deltaRatio = deltaX / scrubberWidth;
    const nextTime = Math.max(0, Math.min(duration, progressStartVal.current + deltaRatio * duration));
    player.currentTime = nextTime;
    progressPercentShared.value = (nextTime / duration) * 100;
    resetHideTimer();
  };

  const handleProgressBarTouchEnd = () => {
    isDraggingProgressRef.current = false;
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

  // Render Locked UI state (minimizes overlays to avoid accidental triggers)
  if (isLocked) {
    return (
      <View style={[StyleSheet.absoluteFillObject, { zIndex: 99999, backgroundColor: "#050505" }]}>
        <StatusBar hidden />
        <View style={styles.container}>
          <BlurTargetView ref={setBlurTargetRef as any} style={StyleSheet.absoluteFillObject}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit={contentFit}
              nativeControls={false}
              surfaceType="textureView"
            />
          </BlurTargetView>

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
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.blurCover}
              >
                <HugeiconsIcon icon={LockIcon} size={24} color={theme.colors.accentLight} />
              </BlurView>
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
        {/* Underlay Video view with BlurTargetView for real native content blur */}
        <BlurTargetView ref={setBlurTargetRef as any} style={StyleSheet.absoluteFillObject}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            nativeControls={false}
            surfaceType="textureView"
          />
        </BlurTargetView>

        {/* Vignette Shading Fades at Top & Bottom */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
        </View>

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
          <View style={styles.subtitleContainer} pointerEvents="none">
            <Text style={styles.subtitleText}>{activeCue.text}</Text>
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
          <BlurView
            intensity={100}
            tint="dark"
            blurTarget={{ current: blurTarget }}
            blurMethod="dimezisBlurView"
            style={styles.hudBlur}
          >
            <HugeiconsIcon
              icon={hudType === "brightness" ? Sun01Icon : VolumeHighIcon}
              size={28}
              color="#fff"
            />
            <View style={styles.hudBarOuter}>
              <Animated.View
                style={[
                  styles.hudBarInner,
                  hudBarInnerStyle,
                ]}
              />
            </View>
          </BlurView>
        </Animated.View>

        {/* Top and Bottom Controls Interface - box-none to pass touches to child views */}
        <Animated.View style={[StyleSheet.absoluteFill, controlsStyle]} pointerEvents="box-none">
          {/* Top Panel Controls - top: 40 to avoid system notification bar interference */}
          <View style={styles.topPanel} pointerEvents="box-none">
            {/* Extreme Left: Back Button & Top Options Capsule */}
            <View style={styles.topPanelLeft} pointerEvents="box-none">
              <TouchableOpacity onPress={handleClose} activeOpacity={0.8} style={styles.circleBlurBtn}>
                <BlurView
                  intensity={100}
                  tint="dark"
                  blurTarget={{ current: blurTarget }}
                  blurMethod="dimezisBlurView"
                  style={styles.blurCover}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={26} color="#fff" />
                </BlurView>
              </TouchableOpacity>

              {/* Top Menu capsule: Controls Lock, Aspect Ratio, and Swipe Gestures Toggle */}
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.topMenuCapsule}
              >
                <TouchableOpacity
                  onPress={() => {
                    setIsLocked(true);
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <HugeiconsIcon icon={LockKeyIcon} size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setContentFit((prev) => (prev === "contain" ? "cover" : prev === "cover" ? "fill" : "contain"));
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <HugeiconsIcon icon={Maximize02Icon} size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setGesturesEnabled(!gesturesEnabled);
                    resetHideTimer();
                  }}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <HugeiconsIcon
                    icon={FingerPrintIcon}
                    size={20}
                    color={gesturesEnabled ? "#fff" : "rgba(255,255,255,0.4)"}
                  />
                </TouchableOpacity>
              </BlurView>
            </View>

            {/* Top Right: Volume and Brightness vertical sliders stack */}
            <View style={styles.topRightSlidersStack} pointerEvents="box-none">
              {/* Volume control slider capsule */}
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.sliderCapsule}
              >
                <View
                  style={styles.sliderTrackContainer}
                  onTouchStart={handleVolumeTouchStart}
                  onTouchMove={handleVolumeTouchMove}
                >
                  <View style={styles.sliderTrack}>
                    <Animated.View style={[styles.sliderFill, volumeFillStyle]} />
                  </View>
                </View>
                <HugeiconsIcon icon={VolumeHighIcon} size={20} color="#fff" />
              </BlurView>

              {/* Brightness control slider capsule */}
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.sliderCapsule}
              >
                <View
                  style={styles.sliderTrackContainer}
                  onTouchStart={handleBrightnessTouchStart}
                  onTouchMove={handleBrightnessTouchMove}
                >
                  <View style={styles.sliderTrack}>
                    <Animated.View style={[styles.sliderFill, brightnessFillStyle]} />
                  </View>
                </View>
                <HugeiconsIcon icon={Sun01Icon} size={20} color="#fff" />
              </BlurView>
            </View>
          </View>

          {/* Center Playback Controls */}
          <View style={styles.centerPanel} pointerEvents="box-none">
            {/* Show Prev Episode Button if Series */}
            {isSerial && onEpisodeChange && currentEpisodeIndex > 0 && (
              <TouchableOpacity
                onPress={() => onEpisodeChange(currentEpisodeIndex - 1)}
                activeOpacity={0.8}
                style={styles.centerNavBtn}
              >
                <BlurView
                  intensity={100}
                  tint="dark"
                  blurTarget={{ current: blurTarget }}
                  blurMethod="dimezisBlurView"
                  style={styles.blurCover}
                >
                  <HugeiconsIcon icon={PreviousIcon} size={24} color="#fff" />
                </BlurView>
              </TouchableOpacity>
            )}

            {/* Seek Back Button with GoBackward10SecIcon */}
            <TouchableOpacity onPress={handleSeekBack} activeOpacity={0.8} style={styles.centerNavBtn}>
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.blurCover}
              >
                <HugeiconsIcon icon={GoBackward10SecIcon} size={30} color="#fff" />
              </BlurView>
            </TouchableOpacity>

            {/* Play/Pause Button - Shows buffering indicator inside when activeControls are visible */}
            <TouchableOpacity
              onPress={() => (isPlaying ? player.pause() : player.play())}
              activeOpacity={0.8}
              style={styles.centerPlayBtn}
            >
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.blurCover}
              >
                {(status === "loading" || status === "idle") ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : (
                  <HugeiconsIcon
                    icon={isPlaying ? PauseIcon : PlayIcon}
                    size={44}
                    color="#fff"
                    style={!isPlaying ? { marginLeft: 6 } : null}
                  />
                )}
              </BlurView>
            </TouchableOpacity>

            {/* Seek Forward Button with GoForward10SecIcon */}
            <TouchableOpacity onPress={handleSeekForward} activeOpacity={0.8} style={styles.centerNavBtn}>
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.blurCover}
              >
                <HugeiconsIcon icon={GoForward10SecIcon} size={30} color="#fff" />
              </BlurView>
            </TouchableOpacity>

            {/* Show Next Episode Button if Series */}
            {isSerial && onEpisodeChange && currentEpisodeIndex < episodes.length - 1 && (
              <TouchableOpacity
                onPress={() => onEpisodeChange(currentEpisodeIndex + 1)}
                activeOpacity={0.8}
                style={styles.centerNavBtn}
              >
                <BlurView
                  intensity={100}
                  tint="dark"
                  blurTarget={{ current: blurTarget }}
                  blurMethod="dimezisBlurView"
                  style={styles.blurCover}
                >
                  <HugeiconsIcon icon={NextIcon} size={24} color="#fff" />
                </BlurView>
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom Panel Controls - Shifted to bottom: 40 to avoid notch/system cutouts */}
          <View style={styles.bottomPanel} pointerEvents="box-none">
            {/* Row 1: Logo & Settings Capsule (Layers icon removed, keeping subtitles & speed dashboard) */}
            <View style={styles.bottomMetaRow} pointerEvents="box-none">
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
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.capsuleBlur}
              >
                <TouchableOpacity
                  onPress={() => setActiveModal("subtitles")}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <HugeiconsIcon icon={ClosedCaptionIcon} size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setActiveModal("speed")}
                  activeOpacity={0.8}
                  style={styles.capsuleIconBtn}
                >
                  <HugeiconsIcon icon={DashboardSpeed01Icon} size={20} color="#fff" />
                </TouchableOpacity>
              </BlurView>
            </View>

            {/* Row 2: Scrubber timeline full-width at the bottom, and time labels placed beside it (Left/Right) */}
            {/* Scrubber fill is white with no thumb, matching volume slider style. Height doubled to 8px! */}
            <View style={styles.scrubberRow} pointerEvents="box-none">
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              
              <View
                style={styles.progressBarContainer}
                onTouchStart={handleProgressBarTouchStart}
                onTouchMove={handleProgressBarTouchMove}
                onTouchEnd={handleProgressBarTouchEnd}
                onTouchCancel={handleProgressBarTouchEnd}
              >
                <View style={styles.progressBarTrack}>
                  <Animated.View style={[styles.progressBarFill, progressFillStyle]} />
                </View>
              </View>

              <TouchableOpacity onPress={() => setShowRemainingTime(!showRemainingTime)}>
                <Text style={styles.timeText}>
                  {showRemainingTime ? `-${formatTime(duration - currentTime)}` : formatTime(duration)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Row 3: Action Pills (Moved below the progress bar as requested) */}
            <View style={styles.actionPillsRow}>
              {/* Show Continue Watching button only if there is valid saved progress */}
              {savedProgress > 5 && duration > 0 && savedProgress < duration - 15 && (
                <BlurView
                  intensity={100}
                  tint="dark"
                  blurTarget={{ current: blurTarget }}
                  blurMethod="dimezisBlurView"
                  style={styles.pillCover}
                >
                  <TouchableOpacity onPress={handleContinueWatching} style={styles.pillBtn}>
                    <HugeiconsIcon icon={Clock01Icon} size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.pillText}>Continue Watching ({formatTime(savedProgress)})</Text>
                  </TouchableOpacity>
                </BlurView>
              )}

              {/* Keep only this Sources button below the progress bar! */}
              <BlurView
                intensity={100}
                tint="dark"
                blurTarget={{ current: blurTarget }}
                blurMethod="dimezisBlurView"
                style={styles.pillCover}
              >
                <TouchableOpacity onPress={() => setActiveModal("quality")} style={styles.pillBtn}>
                  <HugeiconsIcon icon={DatabaseSettingIcon} size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.pillText}>Sources</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          </View>
        </Animated.View>

        {/* Continue Watching Resume Prompt Overlay */}
        {showResumePrompt && (
          <View style={styles.resumePromptOverlay}>
            <BlurView
              intensity={100}
              tint="dark"
              blurTarget={{ current: blurTarget }}
              blurMethod="dimezisBlurView"
              style={styles.resumePromptBlur}
            >
              <HugeiconsIcon icon={Clock01Icon} size={42} color={theme.colors.accentLight} style={{ marginBottom: 12 }} />
              <Text style={styles.resumePromptTitle}>Resume Playback?</Text>
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
            </BlurView>
          </View>
        )}

        {/* Real-time native blurred Modal Dialogs in the center of the screen */}
        {activeModal !== null && (
          <View style={styles.resumePromptOverlay}>
            <BlurView
              intensity={100}
              tint="dark"
              blurTarget={{ current: blurTarget }}
              blurMethod="dimezisBlurView"
              style={styles.resumePromptBlur}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.resumePromptTitle}>
                  {activeModal === "quality"
                    ? "Select Source"
                    : activeModal === "subtitles"
                    ? "Select Subtitles"
                    : "Playback Settings"}
                </Text>
                <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseIconBtn}>
                  <HugeiconsIcon icon={Cancel01Icon} size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {activeModal === "quality" && (
                <View style={styles.modalScrollContainer}>
                  {sources.map((src, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.modalItem,
                        selectedSource?.url === src.url && styles.modalItemActive,
                      ]}
                      onPress={() => selectQuality(src)}
                    >
                      <Text style={styles.modalItemText}>{src.quality}</Text>
                      {selectedSource?.url === src.url && (
                        <HugeiconsIcon icon={Clock01Icon} size={16} color={theme.colors.accentLight} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeModal === "subtitles" && (
                <View style={styles.modalScrollContainer}>
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      activeSubtitleUrl === "" && styles.modalItemActive,
                    ]}
                    onPress={() => selectSubtitle("")}
                  >
                    <Text style={styles.modalItemText}>Subtitles Off</Text>
                    {activeSubtitleUrl === "" && (
                      <HugeiconsIcon icon={Clock01Icon} size={16} color={theme.colors.accentLight} />
                    )}
                  </TouchableOpacity>
                  {subtitles.map((sub, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.modalItem,
                        activeSubtitleUrl === sub.url && styles.modalItemActive,
                      ]}
                      onPress={() => selectSubtitle(sub.url)}
                    >
                      <Text style={styles.modalItemText}>{sub.lang}</Text>
                      {activeSubtitleUrl === sub.url && (
                        <HugeiconsIcon icon={Clock01Icon} size={16} color={theme.colors.accentLight} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeModal === "speed" && (
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
              )}
            </BlurView>
          </View>
        )}
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
    overflow: "hidden",
  },
  topMenuCapsule: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  centerNavBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
  },
  centerPlayBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
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
    bottom: 40,
    left: 40,
    right: 40,
  },
  bottomMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
    marginTop: 10,
  },
  pillCover: {
    borderRadius: 20,
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
    paddingVertical: 8,
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
    height: 24,
    justifyContent: "center",
  },
  progressBarTrack: {
    width: "100%",
    height: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 4,
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
    fontSize: 9,
    fontWeight: "800",
    top: 17,
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
});
