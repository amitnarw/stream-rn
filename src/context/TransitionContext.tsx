import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackHandler, Dimensions } from 'react-native';
import {
  Easing,
  runOnJS,
  useSharedValue,
  withDelay,
  withTiming,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { DetailResult, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface CardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export type TransitionPhase = 'idle' | 'opening' | 'open' | 'closing';

interface TransitionCtx {
  phase: TransitionPhase;
  item: MediaItem | null;
  detail: DetailResult | null;
  loading: boolean;
  error: string | null;
  origin: CardLayout | null;
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  borderRadius: SharedValue<number>;
  surfaceProgress: SharedValue<number>;
  contentProgress: SharedValue<number>;
  openFromCard: (item: MediaItem, layout: CardLayout) => void;
  closeToCard: () => void;
  reloadDetail: () => void;
  fallbackRecommendations: MediaItem[];
  setFallbackRecommendations: (items: MediaItem[]) => void;
  updateDetailInPlace: (item: MediaItem) => void;
  globalBlurTarget: any;
  setGlobalBlurTarget: (val: any) => void;
}

interface TransitionActionsCtxType {
  openFromCard: (item: MediaItem, layout: CardLayout) => void;
  closeToCard: () => void;
  reloadDetail: () => void;
  setFallbackRecommendations: (items: MediaItem[]) => void;
  updateDetailInPlace: (item: MediaItem) => void;
  setGlobalBlurTarget: (val: any) => void;
}

const Ctx = createContext<TransitionCtx | null>(null);
const ActionsCtx = createContext<TransitionActionsCtxType | null>(null);

const ENTER = {
  duration: 560,
  easing: Easing.bezier(0.2, 0, 0, 1),
};

const EXIT = {
  // Pure ease-in: starts moving on frame 1, no sluggish ramp-up at the beginning.
  // 380ms is perceptibly snappy without feeling abrupt.
  duration: 380,
  easing: Easing.bezier(0.4, 0, 1, 1),
};
const EXIT_SHRINK = {
  duration: 300,
  easing: Easing.bezier(0.25, 1, 0.5, 1),
};

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

export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [item, setItem] = useState<MediaItem | null>(null);
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<CardLayout | null>(null);
  const [fallbackRecommendations, setFallbackRecommendations] = useState<MediaItem[]>([]);
  const [globalBlurTarget, setGlobalBlurTarget] = useState<any>(null);

  const requestIdRef = useRef(0);
  const backSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const activeItemRef = useRef<MediaItem | null>(null);
  const originRef = useRef<CardLayout | null>(null);
  const phaseRef = useRef<TransitionPhase>('idle');

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(SCREEN_WIDTH);
  const height = useSharedValue(SCREEN_HEIGHT);
  const borderRadius = useSharedValue(0);
  const surfaceProgress = useSharedValue(0);
  const contentProgress = useSharedValue(0);

  const loadDetailFor = useCallback(async (nextItem: MediaItem) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await bridge.loadDetail(nextItem.provider || 'Cinemeta', nextItem.url);
      if (requestId === requestIdRef.current) {
        setDetail(result);
        
        // Enrich cast/runtimes from TVmaze/TMDB in the background without blocking the UI
        bridge.enrichDetail(result).then(enriched => {
          if (requestId === requestIdRef.current) {
            setDetail(enriched);
          }
        }).catch(err => {
          console.warn("Background details enrichment failed:", err);
        });
        
        // If provider has no recommendations, fetch tag-based related items on the same provider
        if (!result.recommendations || result.recommendations.length === 0) {
          const firstTag = result.tags?.[0];
          if (firstTag) {
            bridge.search(nextItem.provider || 'Cinemeta', firstTag)
              .then(searchResults => {
                if (requestId === requestIdRef.current) {
                  const related = searchResults
                    .filter(r => r.url !== nextItem.url)
                    .slice(0, 10);
                  setDetail(prev => prev ? { ...prev, recommendations: related } : null);
                }
              })
              .catch(err => {
                console.warn("Failed to fetch tag-based fallback recommendations:", err);
              });
          }
        }
      }
    } catch (e: any) {
      if (requestId === requestIdRef.current) {
        setError(cleanGeneralError(e));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const finishOpen = useCallback(() => {
    phaseRef.current = 'open';
    setPhase('open');
    if (activeItemRef.current) {
      loadDetailFor(activeItemRef.current);
    }
  }, [loadDetailFor]);

  const finishClose = useCallback(() => {
    requestIdRef.current += 1;
    backSubscriptionRef.current?.remove();
    backSubscriptionRef.current = null;
    activeItemRef.current = null;
    originRef.current = null;
    phaseRef.current = 'idle';
    // Reset shared values immediately (UI thread already done)
    contentProgress.value = 0;
    surfaceProgress.value = 0;
    // Batch all React state resets into a single synchronous flush.
    // React 18 batches these automatically in a single re-render, but we
    // explicitly group them to make intent clear and avoid 6 separate commits.
    React.startTransition(() => {
      setPhase('idle');
      setItem(null);
      setDetail(null);
      setError(null);
      setLoading(false);
      setOrigin(null);
    });
  }, [contentProgress, surfaceProgress]);

  const closeToCard = useCallback(() => {
    const currentOrigin = originRef.current;
    if (!currentOrigin || phaseRef.current === 'idle' || phaseRef.current === 'closing') return;

    phaseRef.current = 'closing';
    setPhase('closing');

    // 1. Fade out all details content first over 150ms on UI thread
    contentProgress.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });

    // 2. Delay the container scale/shrink animation by 150ms.
    // This allows the details content in DetailScreen to remain at fixed layout sizes,
    // preventing the layout engine from recalculating elements (Yoga jank) and
    // aligning with the home/search card's 150ms delayed spring animation.
    const SHRINK_DELAY = 150;
    surfaceProgress.value = withDelay(SHRINK_DELAY, withTiming(0, EXIT_SHRINK));
    x.value = withDelay(SHRINK_DELAY, withTiming(currentOrigin.x, EXIT_SHRINK));
    y.value = withDelay(SHRINK_DELAY, withTiming(currentOrigin.y, EXIT_SHRINK));
    width.value = withDelay(SHRINK_DELAY, withTiming(currentOrigin.width, EXIT_SHRINK));
    height.value = withDelay(SHRINK_DELAY, withTiming(currentOrigin.height, EXIT_SHRINK));
    borderRadius.value = withDelay(SHRINK_DELAY, withTiming(currentOrigin.borderRadius ?? 22, EXIT_SHRINK, (finished) => {
      if (finished) runOnJS(finishClose)();
    }));
  }, [borderRadius, contentProgress, finishClose, height, surfaceProgress, width, x, y]);

  const openFromCard = useCallback(
    (nextItem: MediaItem, layout: CardLayout) => {
      requestIdRef.current += 1;
      activeItemRef.current = nextItem;
      originRef.current = layout;
      x.value = layout.x;
      y.value = layout.y;
      width.value = layout.width;
      height.value = layout.height;
      borderRadius.value = layout.borderRadius ?? 22;
      surfaceProgress.value = 0;
      contentProgress.value = 0;

      backSubscriptionRef.current?.remove();
      backSubscriptionRef.current = BackHandler.addEventListener('hardwareBackPress', () => {
        closeToCard();
        return true;
      });

      // Wait a frame so the UI thread updates the shared values to the card size BEFORE mounting
      requestAnimationFrame(() => {
        setOrigin(layout);
        setItem(nextItem);
        setDetail(null);
        setError(null);
        setLoading(true);
        phaseRef.current = 'opening';
        setPhase('opening');
        
        // Give React ~16ms (1 frame) to flush the mount and layout to the native UI thread
        // This ensures the GPU animation doesn't compete with JS bridge traffic
        setTimeout(() => {
          x.value = withTiming(0, ENTER);
          y.value = withTiming(0, ENTER);
          width.value = withTiming(SCREEN_WIDTH, ENTER);
          height.value = withTiming(SCREEN_HEIGHT, ENTER);
          
          borderRadius.value = withDelay(
            200,
            withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) }, (finished) => {
              if (finished) runOnJS(finishOpen)();
            })
          );
          
          surfaceProgress.value = withTiming(1, ENTER);
          contentProgress.value = withDelay(
            250,
            withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })
          );
        }, 16);
      });
    },
    [borderRadius, closeToCard, contentProgress, finishOpen, height, loadDetailFor, surfaceProgress, width, x, y]
  );

  const reloadDetail = useCallback(() => {
    if (activeItemRef.current) {
      loadDetailFor(activeItemRef.current);
    }
  }, [loadDetailFor]);

  const updateDetailInPlace = useCallback(
    (nextItem: MediaItem) => {
      requestIdRef.current += 1;
      activeItemRef.current = nextItem;
      setItem(nextItem);
      setDetail(null);
      setError(null);
      setLoading(true);
      loadDetailFor(nextItem);
    },
    [loadDetailFor]
  );

  const value = useMemo(
    () => ({
      phase,
      item,
      detail,
      loading,
      error,
      origin,
      x,
      y,
      width,
      height,
      borderRadius,
      surfaceProgress,
      contentProgress,
      openFromCard,
      closeToCard,
      reloadDetail,
      fallbackRecommendations,
      setFallbackRecommendations,
      updateDetailInPlace,
      globalBlurTarget,
      setGlobalBlurTarget,
    }),
    [
      phase,
      item,
      detail,
      loading,
      error,
      origin,
      x,
      y,
      width,
      height,
      borderRadius,
      surfaceProgress,
      contentProgress,
      openFromCard,
      closeToCard,
      reloadDetail,
      fallbackRecommendations,
      setFallbackRecommendations,
      updateDetailInPlace,
      globalBlurTarget,
      setGlobalBlurTarget,
    ]
  );

  const actions = useMemo(
    () => ({
      openFromCard,
      closeToCard,
      reloadDetail,
      setFallbackRecommendations,
      updateDetailInPlace,
      setGlobalBlurTarget,
    }),
    [
      openFromCard,
      closeToCard,
      reloadDetail,
      setFallbackRecommendations,
      updateDetailInPlace,
      setGlobalBlurTarget,
    ]
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useTransition(): TransitionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTransition must be used inside TransitionProvider');
  return ctx;
}

export function useTransitionActions(): TransitionActionsCtxType {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error('useTransitionActions must be used inside TransitionProvider');
  return ctx;
}
