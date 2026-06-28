import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  PluginProvider,
  MediaItem,
  HomeSection,
  DetailResult,
  LinksResult,
  VideoSource,
  EpisodeItem,
} from '../types/plugin';

const { CloudStreamModule } = NativeModules;

export class OfflineError extends Error {
  constructor() {
    super('No internet connection. Please check your network and try again.');
    this.name = 'OfflineError';
  }
}

let lastOnlineCheck = 0;
let lastOnlineResult = true;
const ONLINE_CACHE_TTL = 15000;

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const DEFAULT_MAIN_PAGE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_DETAILS_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getSettings(): Promise<{ mainPageTtl: number; detailsTtl: number }> {
  try {
    const mainRaw = await AsyncStorage.getItem('@sozo_setting_main_ttl');
    const detailRaw = await AsyncStorage.getItem('@sozo_setting_detail_ttl');
    return {
      mainPageTtl: mainRaw !== null ? Number(mainRaw) : DEFAULT_MAIN_PAGE_TTL,
      detailsTtl: detailRaw !== null ? Number(detailRaw) : DEFAULT_DETAILS_TTL,
    };
  } catch {
    return { mainPageTtl: DEFAULT_MAIN_PAGE_TTL, detailsTtl: DEFAULT_DETAILS_TTL };
  }
}

export async function saveSettings(mainPageTtl: number, detailsTtl: number): Promise<void> {
  try {
    await AsyncStorage.setItem('@sozo_setting_main_ttl', String(mainPageTtl));
    await AsyncStorage.setItem('@sozo_setting_detail_ttl', String(detailsTtl));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith('@sozo_cache_'));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    await CloudStreamModule.clearNativeCache();
  } catch (e) {
    console.warn('Failed to clear cache:', e);
  }
}

function parseNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}

async function getCache<T>(key: string, ttl: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();
    if (now - entry.timestamp < ttl) {
      return entry.data;
    }
    if (ttl !== Infinity) {
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`Cache read error for key ${key}:`, e);
  }
  return null;
}

async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      timestamp: Date.now(),
      data,
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn(`Cache write error for key ${key}:`, e);
  }
}

export async function checkOnline(): Promise<boolean> {
  const now = Date.now();
  if (now - lastOnlineCheck < ONLINE_CACHE_TTL) {
    return lastOnlineResult;
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);
    await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(id);
    lastOnlineResult = true;
  } catch {
    lastOnlineResult = false;
  }
  lastOnlineCheck = Date.now();
  return lastOnlineResult;
}

async function ensureOnline(): Promise<void> {
  const online = await checkOnline();
  if (!online) throw new OfflineError();
}

function parseJson<T>(json: string): T {
  return JSON.parse(json);
}

function mapItem(item: any): MediaItem {
  return {
    provider: item.provider ?? '',
    url: item.url ?? '',
    title: item.title ?? '',
    posterUrl: item.posterUrl ?? null,
    type: item.type ?? null,
  };
}

export async function loadPlugins(): Promise<PluginProvider[]> {
  await ensureOnline();
  const json = await CloudStreamModule.loadPlugins();
  return parseJson<PluginProvider[]>(json);
}

export async function getProviders(): Promise<PluginProvider[]> {
  await ensureOnline();
  const json = await CloudStreamModule.getProviders();
  const providers = parseJson<PluginProvider[]>(json);
  const excludeNames = ['Internet Archive', 'Invidious'];
  const filtered = providers.filter(
    (p) => !excludeNames.some((ex) => p.name.toLowerCase().includes(ex.toLowerCase()))
  );
  const uniqueNames = new Set<string>();
  return filtered.filter((p) => {
    if (uniqueNames.has(p.name)) return false;
    uniqueNames.add(p.name);
    return true;
  });
}

export async function getMainPage(
  providerName: string,
  page: number = 1,
  forceRefresh: boolean = false,
  category: string = 'Trending'
): Promise<HomeSection[]> {
  const cacheKey = `@sozo_cache_main_cinemeta_cat_${category}_page_${page}`;

  if (!forceRefresh) {
    const settings = await getSettings();
    const cachedData = await getCache<HomeSection[]>(cacheKey, settings.mainPageTtl);
    if (cachedData) {
      return cachedData;
    }
  }

  try {
    await ensureOnline();
  } catch (err) {
    const expiredCached = await getCache<HomeSection[]>(cacheKey, Infinity);
    if (expiredCached) {
      return expiredCached;
    }
    throw err;
  }

  let urls: { name: string; url: string }[] = [];
  switch (category) {
    case 'Trending':
      urls = [
        { name: 'Trending Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Trending TV Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Action & Adventure', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Action.json' },
        { name: 'Drama TV Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Drama.json' },
      ];
      break;
    case 'New':
      urls = [
        { name: 'Highly Rated Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating.json' },
        { name: 'Highly Rated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/imdbRating.json' },
        { name: 'New Actions', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Action.json' },
        { name: 'New Sci-Fi', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Sci-Fi.json' },
      ];
      break;
    case 'Movies':
      urls = [
        { name: 'Popular Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Action Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Action.json' },
        { name: 'Comedy Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Comedy.json' },
        { name: 'Sci-Fi & Fantasy', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Sci-Fi.json' },
      ];
      break;
    case 'Series':
      urls = [
        { name: 'Popular Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Drama Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Drama.json' },
        { name: 'Action & Adventure Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Action.json' },
        { name: 'Sci-Fi Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Sci-Fi.json' },
      ];
      break;
    case 'TV Show':
      urls = [
        { name: 'Top TV Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Reality & Talk Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Documentary.json' },
        { name: 'Comedy Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Comedy.json' },
      ];
      break;
    case 'Cartoon':
      urls = [
        { name: 'Animated Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Animation.json' },
        { name: 'Animated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Animation.json' },
        { name: 'Kids & Family', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Family.json' },
      ];
      break;
    default:
      urls = [
        { name: 'Trending Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Trending TV Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
      ];
  }

  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const response = await fetch(u.url);
        const json = await response.json();
        const items = (json.metas ?? []).map((m: any) => ({
          provider: 'Cinemeta',
          url: `${m.type}/${m.id}`,
          title: m.name ?? '',
          posterUrl: m.poster ?? null,
          type: m.type ?? null,
        }));
        return { name: u.name, items };
      } catch (e) {
        console.warn(`Failed to fetch catalog for ${u.name}:`, e);
        return { name: u.name, items: [] };
      }
    })
  );

  const data = results.filter((r) => r.items.length > 0);
  await setCache(cacheKey, data);
  return data;
}

export async function search(
  providerName: string,
  query: string
): Promise<MediaItem[]> {
  await ensureOnline();
  const cleanQuery = encodeURIComponent(query);
  const movieUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${cleanQuery}.json`;
  const seriesUrl = `https://v3-cinemeta.strem.io/catalog/series/top/search=${cleanQuery}.json`;

  try {
    const [movieRes, seriesRes] = await Promise.all([
      fetch(movieUrl).then(r => r.json()).catch(() => ({ metas: [] })),
      fetch(seriesUrl).then(r => r.json()).catch(() => ({ metas: [] })),
    ]);

    const movies = (movieRes.metas ?? []).map((m: any) => ({
      provider: 'Cinemeta',
      url: `movie/${m.id}`,
      title: m.name ?? '',
      posterUrl: m.poster ?? null,
      type: 'movie',
    }));

    const series = (seriesRes.metas ?? []).map((m: any) => ({
      provider: 'Cinemeta',
      url: `series/${m.id}`,
      title: m.name ?? '',
      posterUrl: m.poster ?? null,
      type: 'series',
    }));

    return [...movies, ...series];
  } catch (e) {
    console.warn('Cinemeta search failed:', e);
    return [];
  }
}

export async function loadDetail(
  providerName: string,
  url: string,
  forceRefresh: boolean = false
): Promise<DetailResult> {
  const parts = url.split('/');
  const type = parts.length > 1 ? parts[0] : 'movie';
  const id = parts.length > 1 ? parts[1] : url;

  const cacheKey = `@sozo_cache_detail_cinemeta_${type}_${id}`;

  if (!forceRefresh) {
    const settings = await getSettings();
    const cachedData = await getCache<DetailResult>(cacheKey, settings.detailsTtl);
    if (cachedData) {
      return cachedData;
    }
  }

  try {
    await ensureOnline();
  } catch (err) {
    const expiredCached = await getCache<DetailResult>(cacheKey, Infinity);
    if (expiredCached) {
      return expiredCached;
    }
    throw err;
  }

  const metaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`;
  const response = await fetch(metaUrl);
  const resObj = await response.json();
  const obj = resObj.meta;

  if (!obj || !obj.name) throw new Error('Failed to load details from Cinemeta');

  const isSerial = type === 'series';

  const episodesList: EpisodeItem[] = [];
  if (isSerial) {
    (obj.videos ?? []).forEach((v: any) => {
      episodesList.push({
        episode: parseNumber(v.episode) ?? v.number ?? 1,
        label: v.name || v.title || `Episode ${v.episode}`,
        mediaRef: `${id}:${v.season}:${v.episode ?? v.number ?? 1}`,
        image: v.thumbnail || obj.poster,
        season: parseNumber(v.season) ?? 1,
        overview: (v.overview || v.description) ?? '',
      });
    });
  } else {
    episodesList.push({
      episode: 1,
      label: obj.name,
      mediaRef: `${id}:1:1`,
      image: obj.poster,
      season: 1,
      overview: obj.description ?? '',
    });
  }

  const data: DetailResult = {
    provider: 'Cinemeta',
    url: url,
    title: obj.name ?? '',
    description: obj.description ?? null,
    posterUrl: obj.poster ?? null,
    banner: obj.background ?? obj.poster ?? null,
    year: parseNumber(obj.year) ?? null,
    isSerial: isSerial,
    episodes: episodesList,
    score: obj.imdbRating ?? null,
    tags: obj.genres ?? [],
    duration: obj.runtime ? (parseNumber(obj.runtime.replace(' min', '')) ?? null) : null,
    comingSoon: false,
    contentRating: obj.releaseInfo ?? null,
    logoUrl: obj.logo ?? null,
    imdbId: id,
    tmdbId: obj.moviedb_id ? String(obj.moviedb_id) : null,
    cast: (obj.cast ?? []).map((name: string) => ({
      name,
      image: null,
      role: null,
    })),
    recommendations: [],
    trailers: (obj.trailerStreams ?? []).map((t: any) => ({
      url: `https://www.youtube.com/watch?v=${t.ytId}`,
      referer: 'https://youtube.com',
      raw: false,
    })),
  };

  await setCache(cacheKey, data);
  return data;
}

export async function loadLinks(
  providerName: string,
  data: string
): Promise<LinksResult> {
  await ensureOnline();

  if (providerName === 'Cinemeta') {
    const parts = data.split(':');
    const imdbId = parts[0];
    const season = parts.length > 1 ? (Number(parts[1]) || 1) : 1;
    const episode = parts.length > 2 ? (Number(parts[2]) || 1) : 1;

    let type = 'series';
    let metaUrl = `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`;
    let response = await fetch(metaUrl);
    let resObj = await response.json();
    let meta = resObj.meta;

    if (!meta || !meta.name) {
      type = 'movie';
      metaUrl = `https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`;
      response = await fetch(metaUrl);
      resObj = await response.json();
      meta = resObj.meta;
    }

    if (!meta || !meta.name) {
      throw new Error('Failed to resolve metadata for playback');
    }

    const title = meta.name;
    const isSerial = type === 'series';

    return await resolvePlaybackSources(
      title,
      isSerial,
      season,
      episode,
      (progress) => {
        console.log(`Resolving ${title} S${season}E${episode} progress:`, progress);
      }
    );
  }

  const json = await CloudStreamModule.loadLinks(providerName, data);
  const obj = parseJson<{ sources: any[]; subtitles: any[] }>(json);
  if (!obj.sources || obj.sources.length === 0) {
    throw new Error('No playable sources found for this item');
  }
  return {
    sources: (obj.sources ?? []).map((s: any) => ({
      quality: s.quality ?? '',
      url: s.url ?? '',
      type: s.type ?? '',
      headers: s.headers ?? {},
    })),
    subtitles: (obj.subtitles ?? []).map((sub: any) => ({
      lang: sub.lang ?? '',
      url: sub.url ?? '',
    })),
  };
}

export interface PlaybackProgress {
  providerName: string;
  status: 'searching' | 'found' | 'none' | 'error';
  linksCount: number;
}

export async function resolvePlaybackSources(
  title: string,
  isSerial: boolean,
  season: number,
  episode: number,
  onProgress: (progress: PlaybackProgress[]) => void
): Promise<LinksResult> {
  const providers = await getProviders();
  const progressList: PlaybackProgress[] = providers.map(p => ({
    providerName: p.name,
    status: 'searching',
    linksCount: 0,
  }));

  onProgress([...progressList]);

  const cleanTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const searchAndResolve = async (provider: PluginProvider, idx: number): Promise<LinksResult | null> => {
    try {
      const items = await CloudStreamModule.search(provider.name, title);
      const searchResults = parseJson<{ items: any[] }>(items).items ?? [];
      
      const targetClean = cleanTitle(title);
      const match = searchResults.find(item => {
        const itemClean = cleanTitle(item.title ?? '');
        return itemClean === targetClean || itemClean.includes(targetClean) || targetClean.includes(itemClean);
      });

      if (!match) {
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      const detailJson = await CloudStreamModule.loadDetail(provider.name, match.url);
      const detailObj = parseJson<any>(detailJson);

      if (!detailObj || !detailObj.episodes || detailObj.episodes.length === 0) {
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      let matchingEpisode: any = null;
      if (isSerial) {
        matchingEpisode = detailObj.episodes.find((ep: any) => {
          const epSeason = parseNumber(ep.season) ?? 1;
          const epEpisode = parseNumber(ep.episode) ?? 1;
          return epSeason === season && epEpisode === episode;
        });
      } else {
        matchingEpisode = detailObj.episodes[0];
      }

      if (!matchingEpisode || !matchingEpisode.mediaRef) {
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      const linksJson = await CloudStreamModule.loadLinks(provider.name, matchingEpisode.mediaRef);
      const linksObj = parseJson<any>(linksJson);

      const sources = (linksObj.sources ?? []).map((s: any) => ({
        quality: s.quality ?? '',
        url: s.url ?? '',
        type: s.type ?? '',
        headers: s.headers ?? {},
        provider: provider.name,
      }));

      const subtitles = (linksObj.subtitles ?? []).map((sub: any) => ({
        lang: sub.lang ?? '',
        url: sub.url ?? '',
      }));

      if (sources.length > 0) {
        progressList[idx].status = 'found';
        progressList[idx].linksCount = sources.length;
        onProgress([...progressList]);
        return { sources, subtitles };
      } else {
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }
    } catch (err) {
      console.warn(`Error resolving links for provider ${provider.name}:`, err);
      progressList[idx].status = 'error';
      onProgress([...progressList]);
      return null;
    }
  };

  const TIMEOUT = 10000;
  const promises = providers.map((p, i) => {
    return Promise.race([
      searchAndResolve(p, i),
      new Promise<null>((resolve) => setTimeout(() => {
        if (progressList[i].status === 'searching') {
          progressList[i].status = 'none';
          onProgress([...progressList]);
        }
        resolve(null);
      }, TIMEOUT))
    ]);
  });

  const resolvedResults = await Promise.all(promises);

  const finalSources: VideoSource[] = [];
  const finalSubtitles: { lang: string; url: string }[] = [];

  resolvedResults.forEach(res => {
    if (res) {
      finalSources.push(...res.sources);
      finalSubtitles.push(...res.subtitles);
    }
  });

  const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());

  return {
    sources: finalSources,
    subtitles: uniqueSubs,
  };
}

export function playWithMediaRef(
  providerName: string,
  data: string,
  title?: string,
) {
  CloudStreamModule.playWithMediaRef(providerName, data, title ?? '');
}

export function playStream(
  url: string,
  headers?: Record<string, string>,
  title?: string,
  subtitleUrl?: string,
  allSources?: { quality: string; url: string; type: string; headers: Record<string, string> }[],
  allSubtitles?: { lang: string; url: string }[],
  episodesJson?: string,
  currentEpisodeIndex?: number,
  imdbId?: string,
  mediaType?: string,
  posterUrl?: string,
  season?: number,
  episode?: number,
  episodeTitle?: string,
) {
  CloudStreamModule.playStream(
    url,
    headers ? JSON.stringify(headers) : '{}',
    title ?? '',
    subtitleUrl ?? '',
    allSources ? JSON.stringify(allSources) : '',
    allSubtitles ? JSON.stringify(allSubtitles) : '',
    episodesJson ?? '',
    currentEpisodeIndex ?? -1,
    imdbId ?? '',
    mediaType ?? '',
    posterUrl ?? '',
    season ?? 1,
    episode ?? 1,
    episodeTitle ?? '',
  );
}

export interface PlaybackHistoryItem {
  imdbId: string;
  mediaType: 'movie' | 'series';
  posterUrl: string;
  season: number;
  episode: number;
  episodeTitle: string;
  videoTitle: string;
  position: number;
  duration: number;
  lastWatched: number;
}

export async function getPlaybackHistory(): Promise<PlaybackHistoryItem[]> {
  try {
    const json = await CloudStreamModule.getPlaybackHistory();
    return JSON.parse(json);
  } catch (e) {
    console.warn('Failed to fetch playback history:', e);
    return [];
  }
}

export async function clearPlaybackHistory(): Promise<boolean> {
  try {
    return await CloudStreamModule.clearPlaybackHistory();
  } catch (e) {
    console.warn('Failed to clear playback history:', e);
    return false;
  }
}
