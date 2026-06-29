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
  duration: 420,
  easing: Easing.bezier(0.4, 0, 0.2, 1),
};

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
        setError(
          e instanceof bridge.OfflineError
            ? 'No internet connection. Please check your network.'
            : e.message || 'Failed to load details.'
        );
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
    setPhase('idle');
    setItem(null);
    setDetail(null);
    setError(null);
    setLoading(false);
    setOrigin(null);
    contentProgress.value = 0;
    surfaceProgress.value = 0;
  }, [contentProgress, surfaceProgress]);

  const closeToCard = useCallback(() => {
    // The "timeout thingy": delay the heavy animation by 150ms to allow native 
    // interactions (touch ripples, OS back gestures) to finish, preventing lag.
    setTimeout(() => {
      const currentOrigin = originRef.current;
      if (!currentOrigin || phaseRef.current === 'idle' || phaseRef.current === 'closing') return;

      phaseRef.current = 'closing';
      setPhase('closing');
      
      contentProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
      surfaceProgress.value = withTiming(0, EXIT);
      x.value = withTiming(currentOrigin.x, EXIT);
      y.value = withTiming(currentOrigin.y, EXIT);
      width.value = withTiming(currentOrigin.width, EXIT);
      height.value = withTiming(currentOrigin.height, EXIT);
      borderRadius.value = withTiming(currentOrigin.borderRadius ?? 18, EXIT, (finished) => {
        if (finished) runOnJS(finishClose)();
      });
    }, 150);
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
      borderRadius.value = layout.borderRadius ?? 18;
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
