import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
  FadeIn,
  FadeOut,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { EpisodeItem, VideoSource, MediaItem } from '../types/plugin';
import * as bridge from '../api/cloudStreamBridge';
import { useTransition } from '../context/TransitionContext';
import type { CardLayout } from '../context/TransitionContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.50; // 50% for hero, overlaps with sheet

export default function HeroOverlay() {
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
  const [linksError, setLinksError] = useState<string | null>(null);

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);

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

  const shadowStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: width.value,
    height: height.value,
    borderRadius: borderRadius.value,
    shadowOpacity: interpolate(surfaceProgress.value, [0, 1], [0.25, 0.55]),
    shadowRadius: interpolate(surfaceProgress.value, [0, 1], [12, 28]),
    elevation: interpolate(surfaceProgress.value, [0, 1], [8, 18]),
  }));

  const surfaceStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.value,
    backgroundColor: interpolateColor(
      surfaceProgress.value,
      [0, 0.05, 1],
      ['rgba(28,27,28,0)', 'rgba(28,27,28,1)', 'rgba(0,0,0,1)']
    ),
  }));

  const imageStyle = useAnimatedStyle(() => ({
    height: interpolate(
      surfaceProgress.value,
      [0, 1],
      [height.value, SCREEN_HEIGHT],
      Extrapolation.CLAMP
    ),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
    transform: [
      {
        translateY: interpolate(contentProgress.value, [0, 1], [60, 0]),
      },
    ],
  }));

  const headerControlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(surfaceProgress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: contentProgress.value,
  }));

  const posterUrl = item?.posterUrl || detail?.posterUrl || detail?.banner || undefined;
  const title = detail?.title || item?.title || '';
  const providerName = detail?.provider || item?.provider || 'Cinemeta';
  const allEpisodes = useMemo(() => detail?.episodes ?? [], [detail?.episodes]);

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    allEpisodes.forEach(e => {
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
    return allEpisodes.filter(e => e.season === selectedSeason);
  }, [allEpisodes, availableSeasons, selectedSeason]);

  const scrollY = useSharedValue(0);
  const scrollYRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const updateScrollY = (y: number) => {
    scrollYRef.current = y;
  };

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    runOnJS(updateScrollY)(e.contentOffset.y);
  });

  // Reset scroll Y smoothly and reset season state when item changes (i.e. loading recommended card)
  useEffect(() => {
    if (item) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      scrollY.value = 0;
      scrollYRef.current = 0;
      setSelectedSeason(null);
      setShowSeasonDropdown(false);
    }
  }, [item]);

  const playTrailer = () => {
    if (!detail?.trailers || detail.trailers.length === 0) return;
    const trailer = detail.trailers[0];
    if (trailer.url.includes('youtube.com') || trailer.url.includes('youtu.be')) {
      Linking.openURL(trailer.url).catch(err => console.warn("Failed to open trailer URL", err));
    } else {
      bridge.playStream(
        trailer.url,
        trailer.referer ? { Referer: trailer.referer } : undefined,
        `${detail.title} - Trailer`
      );
    }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 60) {
        closeToCard();
      }
    }
  }), [closeToCard]);

  const recommendations = useMemo(() => {
    if (detail?.recommendations && detail.recommendations.length > 0) {
      return detail.recommendations;
    }
    return fallbackRecommendations.filter(f => f.url !== item?.url);
  }, [detail?.recommendations, fallbackRecommendations, item?.url]);

  const fixedHeaderAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 150], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 150], [0, -80], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const touchCatcherAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, SCREEN_HEIGHT * 0.45], [0, -SCREEN_HEIGHT * 0.45], Extrapolation.CLAMP);
    return {
      transform: [{ translateY }],
    };
  });

  if (phase === 'idle' || !item) return null;

  async function playEpisode(ep: EpisodeItem, index: number) {
    if (!detail) return;
    setPlayingEpisode(index);
    setLinksError(null);
    try {
      const result = await bridge.loadLinks(providerName, ep.mediaRef);
      if (!result.sources || result.sources.length === 0) {
        throw new Error('No playable sources found for this item');
      }
      setSources(result.sources);
      setSubtitles(result.subtitles);
      setSelectedSourceIndex(0);
      setShowSourcePicker(true);
    } catch (e: any) {
      setLinksError(
        e instanceof bridge.OfflineError
          ? 'No internet connection. Please check your network.'
          : e.message || 'Failed to load playable links.'
      );
      setPlayingEpisode(null);
    }
  }

  function onSourceSelect(index: number) {
    setSelectedSourceIndex(index);
    setShowSourcePicker(false);
    setPlayingEpisode(null);
    const source = sources[index];
    const subUrl = subtitles.length > 0 ? subtitles[0].url : '';
    const currentEp = displayedEpisodes.find((_, i) => playingEpisode === i);
    const title = `${detail?.title} - ${currentEp?.label ?? ''}`;

    const episodesPayload = allEpisodes.map((e) => ({
      episode: e.episode,
      label: e.label,
      mediaRef: e.mediaRef,
      season: e.season,
    }));

    bridge.playStream(
      source.url,
      source.headers,
      title,
      subUrl,
      sources.map((s) => ({
        quality: s.quality,
        url: s.url,
        type: s.type,
        headers: s.headers,
      })),
      subtitles,
      JSON.stringify(episodesPayload),
      playingEpisode ?? -1,
      detail?.imdbId || '',
      detail?.isSerial ? 'series' : 'movie',
      detail?.posterUrl || '',
      currentEp?.season || 1,
      currentEp?.episode || 1,
      currentEp?.label || ''
    );
  }

  const closeSourcePicker = () => {
    setShowSourcePicker(false);
    setPlayingEpisode(null);
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.shadowWrap, shadowStyle]}>
        <Animated.View style={[styles.surface, surfaceStyle]}>
          
          {/* Background Hero Image */}
          <Animated.View style={[styles.imageWrap, imageStyle]}>
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imageFallback} />
            )}
            
            {/* Blend Overlay (Cinematic Shading) */}
            <Animated.View style={[StyleSheet.absoluteFillObject, fadeStyle]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.85)']}
                style={StyleSheet.absoluteFillObject}
                locations={[0, 0.4, 1]}
                pointerEvents="none"
              />
            </Animated.View>
          </Animated.View>

          {/* Top Navigation Bar */}
          <Animated.View style={[styles.headerControls, { paddingTop: insets.top + 10 }, headerControlsStyle]} pointerEvents="box-none">
            <View style={styles.headerSpacer} />
            <Text style={styles.headerTitle}>TV Series Details</Text>
            <TouchableOpacity style={styles.closeButton} onPress={closeToCard} activeOpacity={0.8}>
              <View style={styles.closeButtonInner}>
                <Text style={styles.closeButtonText}>✕</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Fixed Header Content (Rendered OUTSIDE ScrollView to prevent jitter/glitching) */}
          <Animated.View style={[styles.fixedHeaderContainer, fixedHeaderAnimatedStyle]} pointerEvents="box-none">
            {/* Watch Trailer Button in Center */}
            {detail?.trailers && detail.trailers.length > 0 && (
              <TouchableOpacity 
                style={styles.trailerButton} 
                activeOpacity={0.8} 
                onPress={playTrailer}
                disabled={scrollYRef.current > 100}
              >
                <View style={styles.trailerBlur}>
                  <Text style={styles.trailerIcon}>▶</Text>
                  <Text style={styles.trailerText}>Watch Trailer</Text>
                </View>
              </TouchableOpacity>
            )}
            
            {/* Video Metadata Pill at Bottom */}
            <View style={styles.pillBottom} pointerEvents="none">
              <View style={styles.pillBackground}>
                {detail?.year ? (
                  <>
                    <Text style={styles.pillText}>{detail.year}</Text>
                    <View style={styles.pillDot} />
                  </>
                ) : null}
                <Text style={styles.pillText}>{detail?.isSerial ? `${allEpisodes.length} Episodes` : 'Movie'}</Text>
                <View style={styles.pillDot} />
                <Text style={styles.pillText}>HD</Text>
              </View>
            </View>
          </Animated.View>

          {/* Swipe Touch Catcher (covers top 45%, outside ScrollView, animated) */}
          <Animated.View 
            style={[styles.touchCatcher, touchCatcherAnimatedStyle]} 
            {...panResponder.panHandlers}
            pointerEvents={showSeasonDropdown ? 'none' : 'auto'}
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
            <Pressable
              style={{ flexGrow: 1 }}
              onPress={() => {
                if (showSeasonDropdown) {
                  setShowSeasonDropdown(false);
                }
              }}
            >
              {/* Spacer for Fixed Header Content */}
              <View 
                style={{ height: SCREEN_HEIGHT * 0.45 }} 
                pointerEvents="none"
              />

              {/* Bottom Sheet Content */}
              <View style={styles.sheetContentWrap}>
                <View style={styles.bottomSheetBackground}>
                <View style={styles.blurContainer}>
                  {posterUrl ? (
                    <Image 
                      source={{ uri: posterUrl }} 
                      style={StyleSheet.absoluteFillObject}
                      blurRadius={35}
                      resizeMode="cover"
                    />
                  ) : null}
                  <LinearGradient 
                    colors={['rgba(15,15,20,0.55)', 'rgba(5,5,10,0.9)']} 
                    style={StyleSheet.absoluteFillObject} 
                  />
                </View>
              </View>
              
              {loading ? (
                <DetailsSkeleton />
              ) : error ? (
                <View style={styles.centerState}>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity style={styles.primaryButton} onPress={reloadDetail}>
                    <Text style={styles.primaryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Animated.View 
                  entering={FadeIn.duration(350)}
                  style={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                >
                  {/* Title & Season */}
                  <View style={[styles.titleContainer, { zIndex: 100 }]}>
                    <Text style={styles.mainTitle} numberOfLines={2}>{title}</Text>
                    {detail?.isSerial && availableSeasons.length > 0 ? (
                      <View style={{ position: 'relative', alignItems: 'center' }}>
                        <TouchableOpacity 
                          style={styles.seasonSelector} 
                          activeOpacity={0.7}
                          onPress={() => setShowSeasonDropdown(!showSeasonDropdown)}
                        >
                          <Text style={styles.seasonText}>
                            {selectedSeason ? `Season ${selectedSeason}` : 'Episodes'}
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
                              colors={['#1c1c22', '#0f0f12']}
                              style={StyleSheet.absoluteFillObject}
                            />
                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
                              {availableSeasons.map((season) => (
                                <TouchableOpacity
                                  key={`season-${season}`}
                                  style={[styles.dropdownItem, selectedSeason === season && styles.dropdownItemSelected]}
                                  onPress={() => {
                                    setSelectedSeason(season);
                                    setShowSeasonDropdown(false);
                                  }}
                                >
                                  <View style={styles.dropdownItemLeft}>
                                    <View style={[
                                      styles.seasonNumberBox,
                                      selectedSeason === season && styles.seasonNumberBoxSelected
                                    ]}>
                                      <Text style={[
                                        styles.seasonNumberText,
                                        selectedSeason === season && styles.seasonNumberTextSelected
                                      ]}>
                                        {String(season).padStart(2, '0')}
                                      </Text>
                                    </View>
                                    <Text style={[
                                      styles.dropdownItemText,
                                      selectedSeason === season && styles.dropdownItemTextSelected
                                    ]}>
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

                  {/* Description */}
                  {detail?.description ? (
                    <Text style={styles.descriptionText}>{detail.description}</Text>
                  ) : null}

                  {/* Genre & Rating */}
                  <View style={styles.genreRatingRow}>
                    {detail?.tags && detail.tags.length > 0 ? (
                      <Text style={styles.genreText}>{detail.tags.slice(0, 3).join(', ')}</Text>
                    ) : null}
                    {detail?.score ? (
                      <View style={styles.imdbBadgeContainer}>
                        <View style={styles.imdbBadge}>
                          <Text style={styles.imdbText}>IMDb</Text>
                        </View>
                        <Text style={styles.ratingText}>{detail.score}</Text>
                      </View>
                    ) : null}
                  </View>

                  {linksError ? <Text style={styles.linksError}>{linksError}</Text> : null}

                  {/* Episodes */}
                  <View style={styles.episodesList}>
                    {displayedEpisodes.length === 0 ? (
                      <Text style={styles.empty}>No episodes available</Text>
                    ) : (
                      displayedEpisodes.map((ep, index) => (
                        <View key={`${ep.mediaRef}-${index}`} style={styles.episodeRow}>
                          <TouchableOpacity
                            style={styles.episodeThumbContainer}
                            disabled={playingEpisode !== null}
                            onPress={() => playEpisode(ep, index)}
                            activeOpacity={0.8}
                          >
                            <Image
                              source={{ uri: ep.image || detail?.posterUrl || item.posterUrl || undefined }}
                              style={styles.episodeThumb}
                              resizeMode="cover"
                            />
                            <View style={styles.playIconOverlay}>
                              {playingEpisode === index ? (
                                <View style={styles.playIconGlass}>
                                  <ActivityIndicator color="#fff" size="small" />
                                </View>
                              ) : (
                                <View style={styles.playIconGlass}>
                                  <Text style={styles.playIconText}>▶</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>

                          <View style={styles.episodeInfo}>
                            {detail?.isSerial && (
                              <Text style={styles.episodeMeta}>Episode {String(ep.episode).padStart(2, '0')}</Text>
                            )}
                            <Text style={styles.episodeTitle} numberOfLines={2}>
                              {ep.label || (detail?.isSerial ? `Episode ${ep.episode}` : title)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Recommendations Row */}
                  {recommendations.length > 0 && (
                    <View style={styles.recommendationsSection}>
                      <Text style={styles.recommendationsTitle}>More Like This</Text>
                      <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recommendationsList}
                      >
                        {recommendations.map((recItem, idx) => (
                          <RecommendationCard 
                            key={`rec-${idx}-${recItem.url}`} 
                            item={recItem} 
                            onPress={(clickedItem) => updateDetailInPlace(clickedItem)}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  )}

                </Animated.View>
              )}
            </View>
            </Pressable>
          </Animated.ScrollView>
        </Animated.View>
      </Animated.View>

      {/* Source Picker Bottom Sheet Overlay */}
      {showSourcePicker && (
        <Animated.View 
          entering={FadeIn.duration(200)} 
          exiting={FadeOut.duration(150)} 
          style={styles.sheetOverlay}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSourcePicker} />
          
          <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
            <View style={styles.sheetContent}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Select Source</Text>
              
              <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetList}>
                {sources.map((source, idx) => (
                  <TouchableOpacity 
                    key={`source-${idx}`}
                    style={[styles.sheetRow, selectedSourceIndex === idx && styles.sheetRowActive]} 
                    onPress={() => onSourceSelect(idx)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.sheetRadio, selectedSourceIndex === idx && styles.sheetRadioActive]}>
                      {selectedSourceIndex === idx && <View style={styles.sheetRadioDot} />}
                    </View>
                    <View style={styles.sheetRowInfo}>
                      <View style={styles.sheetQualityRow}>
                        <Text style={[styles.sheetQuality, selectedSourceIndex === idx && styles.sheetQualityActive]}>
                          {source.quality || 'Auto / Direct'}
                        </Text>
                        <View style={styles.sheetBadge}>
                          <Text style={styles.sheetBadgeText}>
                            {source.provider || 'RESOLVER'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.sheetHost}>
                        Source {idx + 1} ({source.type?.toUpperCase() || 'DIRECT'})
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {subtitles.length > 0 && (
                <View style={styles.sheetSubRow}>
                  <Text style={styles.sheetSubLabel}>Subtitles: </Text>
                  <Text style={styles.sheetSubLangs} numberOfLines={1}>
                    {subtitles.map(s => s.lang).join(', ')}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        </Animated.View>
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
        withTiming(0, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      pulseValue.value,
      [0, 1],
      ['rgba(255,255,255,0.035)', 'rgba(255,255,255,0.095)']
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
        <Animated.View style={[styles.skeletonTag, { width: 60 }, animatedStyle]} />
        <Animated.View style={[styles.skeletonTag, { width: 50 }, animatedStyle]} />
      </View>
      
      {/* Description lines skeleton */}
      <Animated.View style={[styles.skeletonText, { width: '100%' }, animatedStyle]} />
      <Animated.View style={[styles.skeletonText, { width: '90%' }, animatedStyle]} />
      <Animated.View style={[styles.skeletonText, { width: '55%', marginBottom: 32 }, animatedStyle]} />
      
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

// ── Recommendation Card Sub-component ──────────────────────────────────────────
function RecommendationCard({ 
  item, 
  onPress 
}: { 
  item: MediaItem; 
  onPress: (item: MediaItem) => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    onPress(item);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => { scale.value = withTiming(0.94, { duration: 150 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      style={{ marginRight: 12, width: 100 }}
    >
      <Animated.View style={animatedStyle}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.recPoster} resizeMode="cover" />
        ) : (
          <View style={[styles.recPoster, styles.recPlaceholder]} />
        )}
        <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  shadowWrap: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
  },
  surface: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  imageWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  headerControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: -2,
  },
  fullScreenScroll: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  fixedHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.45,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  touchCatcher: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.45,
    zIndex: 20,
  },
  pillBottom: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  sheetContentWrap: {
    flex: 1,
    minHeight: SCREEN_HEIGHT * 0.6,
    zIndex: 20,
    elevation: 20,
  },
  pillBackground: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 10,
  },
  trailerButton: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  trailerBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 6,
  },
  trailerIcon: {
    color: '#fff',
    fontSize: 10,
  },
  trailerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  pillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  pillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  bottomSheetBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: 32,
    paddingHorizontal: 24,
    zIndex: 95,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  mutedText: {
    color: '#A0A0A5',
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mainTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  seasonSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  seasonText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
  },
  seasonIcon: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    marginTop: 2,
  },
  descriptionText: {
    color: '#A0A0A5',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  genreRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
  },
  genreText: {
    color: '#A0A0A5',
    fontSize: 14,
  },
  imdbBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  imdbBadge: {
    backgroundColor: '#F5C518',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  imdbText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  linksError: {
    color: '#ffb4ab',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  episodesList: {
    flex: 1,
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 40,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  episodeThumbContainer: {
    width: 160,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1f1f22',
  },
  episodeThumb: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconGlass: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playIconText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 2,
  },
  episodeInfo: {
    flex: 1,
    paddingLeft: 16,
    justifyContent: 'center',
  },
  episodeMeta: {
    color: '#A0A0A5',
    fontSize: 12,
    marginBottom: 6,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  floatingDropdown: {
    position: 'absolute',
    top: 42, // Right below the season selector button
    width: 200,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  seasonNumberBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seasonNumberBoxSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  seasonNumberText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
  },
  seasonNumberTextSelected: {
    color: '#fff',
  },
  dropdownItemText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownItemTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recommendationsSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 24,
  },
  recommendationsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  recommendationsList: {
    paddingBottom: 8,
  },
  recPoster: {
    width: 100,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#1f1f22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  recPlaceholder: {
    backgroundColor: '#1f1f22',
  },
  recTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    lineHeight: 16,
  },
  skeletonContainer: {
    paddingTop: 32,
    paddingHorizontal: 24,
    width: '100%',
  },
  skeletonTitle: {
    height: 36,
    borderRadius: 10,
    width: '75%',
    marginBottom: 12,
  },
  skeletonSeason: {
    height: 32,
    borderRadius: 16,
    width: 110,
    marginBottom: 20,
  },
  skeletonTagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  skeletonTag: {
    height: 18,
    borderRadius: 9,
    width: 70,
  },
  skeletonText: {
    height: 14,
    borderRadius: 4,
    marginBottom: 10,
  },
  skeletonHeader: {
    height: 22,
    borderRadius: 6,
    width: 90,
    marginBottom: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  skeletonThumb: {
    width: 140,
    height: 84,
    borderRadius: 10,
  },
  skeletonMetaWrap: {
    flex: 1,
    paddingLeft: 16,
    gap: 8,
  },
  skeletonMeta: {
    height: 10,
    width: 60,
    borderRadius: 3,
  },
  skeletonLine: {
    height: 14,
    width: '80%',
    borderRadius: 4,
  },
  skeletonDescLine: {
    height: 10,
    width: '95%',
    borderRadius: 3,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    zIndex: 10000,
    elevation: 10000,
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#141417',
  },
  sheetContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  sheetList: {
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  sheetRowActive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sheetRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  sheetRadioActive: {
    borderColor: '#fff',
  },
  sheetRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  sheetRowInfo: {
    flex: 1,
  },
  sheetQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sheetQuality: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetQualityActive: {
    color: '#fff',
  },
  sheetBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sheetBadgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sheetHost: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
  },
  sheetSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sheetSubLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
  sheetSubLangs: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});
