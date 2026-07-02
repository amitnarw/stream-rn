import { NativeModules, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROVIDER_TIMEOUT_MS } from '../config';
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

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Global active callbacks for streaming links
let activeSourceCallback: ((source: VideoSource) => void) | null = null;
let activeSubtitleCallback: ((sub: { lang: string; url: string }) => void) | null = null;

let isResolutionCancelled = false;

export function cancelPlaybackResolution() {
  isResolutionCancelled = true;
  console.log('[ZunoPlugin] Playback resolution cancelled by user');
}

DeviceEventEmitter.addListener('onPlaybackSourceFound', (event) => {
  try {
    if (event.sourceJson && activeSourceCallback) {
      const source = JSON.parse(event.sourceJson);
      activeSourceCallback(source);
    }
  } catch (e) {
    console.warn('[ZunoPlugin][JS] Failed to parse streamed source:', e);
  }
});

DeviceEventEmitter.addListener('onPlaybackSubtitleFound', (event) => {
  try {
    if (event.subtitleJson && activeSubtitleCallback) {
      const sub = JSON.parse(event.subtitleJson);
      activeSubtitleCallback(sub);
    }
  } catch (e) {
    console.warn('[ZunoPlugin][JS] Failed to parse streamed subtitle:', e);
  }
});

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
const LINKS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes in-memory play links cache
const linksCache = new Map<string, { timestamp: number; result: LinksResult }>();
let currentLinksTtl = LINKS_CACHE_TTL;

export async function getSettings(): Promise<{ mainPageTtl: number; detailsTtl: number; linksTtl: number }> {
  try {
    const mainRaw = await AsyncStorage.getItem('@zuno_setting_main_ttl');
    const detailRaw = await AsyncStorage.getItem('@zuno_setting_detail_ttl');
    const linksRaw = await AsyncStorage.getItem('@zuno_setting_links_ttl');
    const linksTtl = linksRaw !== null ? Number(linksRaw) : LINKS_CACHE_TTL;
    currentLinksTtl = linksTtl;
    return {
      mainPageTtl: mainRaw !== null ? Number(mainRaw) : DEFAULT_MAIN_PAGE_TTL,
      detailsTtl: detailRaw !== null ? Number(detailRaw) : DEFAULT_DETAILS_TTL,
      linksTtl,
    };
  } catch {
    return { mainPageTtl: DEFAULT_MAIN_PAGE_TTL, detailsTtl: DEFAULT_DETAILS_TTL, linksTtl: LINKS_CACHE_TTL };
  }
}

export async function saveSettings(mainPageTtl: number, detailsTtl: number, linksTtl: number): Promise<void> {
  try {
    await AsyncStorage.setItem('@zuno_setting_main_ttl', String(mainPageTtl));
    await AsyncStorage.setItem('@zuno_setting_detail_ttl', String(detailsTtl));
    await AsyncStorage.setItem('@zuno_setting_links_ttl', String(linksTtl));
    currentLinksTtl = linksTtl;
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

export function clearLinksCache(): void {
  linksCache.clear();
}

export function hasCachedLinks(providerName: string, data: string): boolean {
  const cacheKey = `${providerName}:${data}`;
  const cached = linksCache.get(cacheKey);
  console.log(`[hasCachedLinks] Key: ${cacheKey}, Found: ${!!cached}, Cache size: ${linksCache.size}, TTL: ${currentLinksTtl}`);
  if (!cached) return false;
  const valid = Date.now() - cached.timestamp < currentLinksTtl;
  console.log(`[hasCachedLinks] Cache age: ${Date.now() - cached.timestamp}ms, Valid: ${valid}`);
  return valid;
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith('@zuno_cache_'));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    clearLinksCache();
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
  })
  .map(p => ({ ...p, hasSearch: p.hasSearch !== false }));
}

export async function getMainPage(
  providerName: string,
  page: number = 1,
  forceRefresh: boolean = false,
  category: string = 'Trending'
): Promise<HomeSection[]> {
  const cacheKey = `@zuno_cache_main_cinemeta_cat_${category}_page_${page}`;

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
        { name: 'Sci-Fi & Fantasy TV', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Sci-Fi%20%26%20Fantasy.json' },
        { name: 'Drama TV Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Drama.json' },
        { name: 'Thriller Blockbusters', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Thriller.json' },
        { name: 'Comedy Hits', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Comedy.json' },
        { name: 'Mystery & Crime Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Crime.json' },
      ];
      break;
    case 'New':
      urls = [
        { name: 'Highly Rated Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating.json' },
        { name: 'Highly Rated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/imdbRating.json' },
        { name: 'New Actions', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Action.json' },
        { name: 'New Sci-Fi', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Sci-Fi.json' },
        { name: 'New Crime Thrillers', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Thriller.json' },
        { name: 'New Comedies', url: 'https://v3-cinemeta.strem.io/catalog/movie/imdbRating/genre=Comedy.json' },
        { name: 'New Drama Series', url: 'https://v3-cinemeta.strem.io/catalog/series/imdbRating/genre=Drama.json' },
        { name: 'New Animated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/imdbRating/genre=Animation.json' },
      ];
      break;
    case 'Movies':
      urls = [
        { name: 'Popular Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Action Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Action.json' },
        { name: 'Comedy Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Comedy.json' },
        { name: 'Sci-Fi & Fantasy', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Sci-Fi.json' },
        { name: 'Thriller & Mystery', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Thriller.json' },
        { name: 'Horror & Suspense', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Horror.json' },
        { name: 'Romance & Drama', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Romance.json' },
        { name: 'Family Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Family.json' },
      ];
      break;
    case 'Series':
      urls = [
        { name: 'Popular Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Drama Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Drama.json' },
        { name: 'Action & Adventure Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Action.json' },
        { name: 'Sci-Fi & Fantasy Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Sci-Fi%20%26%20Fantasy.json' },
        { name: 'Comedy Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Comedy.json' },
        { name: 'Crime & Mystery Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Crime.json' },
        { name: 'Thriller Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Thriller.json' },
        { name: 'Animated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Animation.json' },
      ];
      break;
    case 'TV Show':
      urls = [
        { name: 'Top TV Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Reality & Talk Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Documentary.json' },
        { name: 'Comedy Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Comedy.json' },
        { name: 'Documentary Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Documentary.json' },
        { name: 'Mystery Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Mystery.json' },
        { name: 'Family Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Family.json' },
      ];
      break;
    case 'Cartoon':
      urls = [
        { name: 'Animated Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Animation.json' },
        { name: 'Animated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Animation.json' },
        { name: 'Kids & Family', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Family.json' },
        { name: 'Fantasy Cartoons', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Fantasy.json' },
        { name: 'Adventure Cartoons', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Adventure.json' },
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

  const cacheKey = `@zuno_cache_detail_cinemeta_${type}_${id}`;

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

    cast: (obj.credits_cast && obj.credits_cast.length > 0)
      ? obj.credits_cast.map((c: any) => ({
          name: c.name ?? '',
          image: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
          role: c.character ?? null,
        }))
      : (obj.cast ?? []).map((name: string) => ({
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
    director: obj.director ?? null,
    writer: obj.writer ?? null,
    awards: obj.awards ?? null,
  };

  await setCache(cacheKey, data);
  return data;
}

export async function enrichDetail(data: DetailResult): Promise<DetailResult> {
  const isSerial = data.isSerial;
  const id = data.imdbId;
  if (!id) return data;

  const cacheKey = `@zuno_cache_detail_cinemeta_${isSerial ? 'series' : 'movie'}_${id}`;

  if (isSerial) {
    try {
      // TVmaze lookup by IMDb ID
      const tvmazeShowRes = await fetchWithTimeout(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, {}, 3000);
      if (tvmazeShowRes.ok) {
        const tvmazeShow = await tvmazeShowRes.json();
        if (tvmazeShow?.id) {
          // Fetch cast
          const castRes = await fetchWithTimeout(`https://api.tvmaze.com/shows/${tvmazeShow.id}/cast`, {}, 3000);
          if (castRes.ok) {
            const castData = await castRes.json();
            const tvmazeCast = (castData as any[]).slice(0, 20);
            if (tvmazeCast.length > 0) {
              data.cast = tvmazeCast.map((c: any) => ({
                name: c.person?.name ?? '',
                image: c.person?.image?.medium ?? null,
                role: c.character?.name ?? null,
                imdbId: null, // populated below
              }));

              // Fetch external IDs for the first 10 actors in parallel to resolve IMDB IDs
              const enrichPromises = tvmazeCast.slice(0, 10).map(async (c: any, idx: number) => {
                try {
                  if (c.person?.id) {
                    const personRes = await fetchWithTimeout(`https://api.tvmaze.com/people/${c.person.id}`, {}, 2000);
                    if (personRes.ok) {
                      const personData = await personRes.json();
                      if (personData?.externals?.imdb && data.cast[idx]) {
                        data.cast[idx].imdbId = personData.externals.imdb;
                      }
                    }
                  }
                } catch (_) {}
              });
              await Promise.allSettled(enrichPromises);
            }
          }

          // Fetch episodes to get runtimes
          const episodesRes = await fetchWithTimeout(`https://api.tvmaze.com/shows/${tvmazeShow.id}/episodes`, {}, 3000);
          if (episodesRes.ok) {
            const episodesData = await episodesRes.json();
            const runtimesMap = new Map<string, number>();
            (episodesData as any[]).forEach((ep: any) => {
              const key = `${ep.season}:${ep.number}`;
              if (ep.runtime) {
                runtimesMap.set(key, ep.runtime);
              }
            });

            // Map runtimes to our episodes list
            data.episodes.forEach((ep) => {
              const key = `${ep.season ?? 1}:${ep.episode}`;
              const runtime = runtimesMap.get(key);
              if (runtime) {
                ep.runtime = runtime;
              }
            });
          }
        }
      }
    } catch (e) {
      // TVmaze not reachable — keep Cinemeta's 3 names as fallback
    }
  } else {
    // Enrich movie cast from TMDB via the /find endpoint (same DB Cinemeta uses, no API key needed)
    try {
      const tmdbFindRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id&api_key=c9a3df4e3bc49ffe6c553f0bea05e99b`,
        {},
        3000
      );
      if (tmdbFindRes.ok) {
        const tmdbFindData = await tmdbFindRes.json();
        const tmdbMovie = (tmdbFindData.movie_results ?? [])[0];
        if (tmdbMovie?.id) {
          const creditsRes = await fetchWithTimeout(
            `https://api.themoviedb.org/3/movie/${tmdbMovie.id}/credits?api_key=c9a3df4e3bc49ffe6c553f0bea05e99b`,
            {},
            3000
          );
          if (creditsRes.ok) {
            const creditsData = await creditsRes.json();
            const tmdbCast = (creditsData.cast ?? []).slice(0, 20);
            if (tmdbCast.length > 0) {
              data.cast = tmdbCast.map((c: any) => ({
                name: c.name ?? '',
                image: c.profile_path
                  ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
                  : null,
                role: c.character ?? null,
                imdbId: null, // populated below
              }));

              // Fetch IMDB IDs for each actor (TMDB external IDs endpoint)
              // We do this in parallel, capped at 10 actors to avoid flooding
              const enrichPromises = tmdbCast.slice(0, 10).map(async (c: any, idx: number) => {
                try {
                  const extRes = await fetchWithTimeout(
                    `https://api.themoviedb.org/3/person/${c.id}/external_ids?api_key=c9a3df4e3bc49ffe6c553f0bea05e99b`,
                    {},
                    2000
                  );
                  if (extRes.ok) {
                    const extData = await extRes.json();
                    if (extData.imdb_id && data.cast[idx]) {
                      data.cast[idx].imdbId = extData.imdb_id;
                    }
                  }
                } catch (_) {}
              });
              await Promise.allSettled(enrichPromises);
            }
          }
        }
      }
    } catch (e) {
      // TMDB not reachable — keep Cinemeta cast as fallback
    }
  }

  await setCache(cacheKey, data);
  return data;
}

export async function loadLinks(
  providerName: string,
  data: string,
  onProgress?: (progress: PlaybackProgress[]) => void,
  onSourceFound?: (source: VideoSource) => void,
  onAllDone?: () => void
): Promise<LinksResult> {
  const cacheKey = `${providerName}:${data}`;
  const now = Date.now();
  const cached = linksCache.get(cacheKey);

  if (cached && now - cached.timestamp < currentLinksTtl) {
    console.log(`[Cache Hit - Synced] Returning cached playback links for ${cacheKey}`);
    if (onSourceFound) {
      cached.result.sources.forEach(src => onSourceFound(src));
    }
    onAllDone?.(); // Signal that we're done so loading indicator clears
    return cached.result;
  }

  await ensureOnline();
  const settings = await getSettings();
  if (cached && now - cached.timestamp < settings.linksTtl) {
    console.log(`[Cache Hit] Returning cached playback links for ${cacheKey}`);
    if (onSourceFound) {
      cached.result.sources.forEach(src => onSourceFound(src));
    }
    onAllDone?.(); // Signal that we're done so loading indicator clears
    return cached.result;
  }

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

    const result = await resolvePlaybackSources(
      title,
      isSerial,
      season,
      episode,
      (progress) => {
        console.log(`Resolving ${title} S${season}E${episode} progress:`, progress);
        if (onProgress) onProgress(progress);
      },
      onSourceFound,
      () => {
        // onAllDone: cache the complete source list (not just the snapshot from promise resolution)
        if (onAllDone) onAllDone();
      },
      (completeResult) => {
        if (completeResult.sources && completeResult.sources.length > 0) {
          console.log(`[linksCache.set] Cinemeta Key: ${cacheKey}, sources count: ${completeResult.sources.length}`);
          linksCache.set(cacheKey, { timestamp: now, result: completeResult });
        }
      },
      imdbId
    );

    return result;
  }

  const json = await CloudStreamModule.loadLinks(providerName, data);
  const obj = parseJson<{ sources: any[]; subtitles: any[] }>(json);
  if (!obj.sources || obj.sources.length === 0) {
    throw new Error('No playable sources found for this item');
  }

  const result: LinksResult = {
    sources: (obj.sources ?? []).map((s: any) => ({
      quality: s.quality ?? '',
      url: s.url ?? '',
      type: s.type ?? '',
      headers: s.headers ?? {},
      provider: providerName,
      host: s.host ?? '',
    })),
    subtitles: (obj.subtitles ?? []).map((sub: any) => ({
      lang: sub.lang ?? '',
      url: sub.url ?? '',
    })),
  };

  if (onSourceFound) {
    result.sources.forEach(src => onSourceFound(src));
  }

  if (result.sources && result.sources.length > 0) {
    console.log(`[linksCache.set] Direct Key: ${cacheKey}, sources count: ${result.sources.length}`);
    linksCache.set(cacheKey, { timestamp: now, result });
  }

  onAllDone?.(); // Signal that we're done so loading indicator clears
  return result;
}

export interface PlaybackProgress {
  providerName: string;
  status: 'searching' | 'found' | 'none' | 'error';
  linksCount: number;
  errorReason?: string;
  /** True when the Kotlin layer detected ISP DNS blocking and auto-retried via Cloudflare DoH */
  isDohRetry?: boolean;
}

async function fetchStremioAddonStreams(
  addonName: string,
  baseUrl: string,
  imdbId: string,
  isSerial: boolean,
  season: number,
  episode: number
): Promise<VideoSource[]> {
  const type = isSerial ? 'series' : 'movie';
  const queryId = isSerial ? `${imdbId}:${season}:${episode}` : imdbId;
  const url = `${baseUrl}/stream/${type}/${queryId}.json`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[ZunoPlugin] ${addonName} fetch failed with HTTP status ${res.status}`);
      return [];
    }
    const text = await res.text();
    if (!text.trim().startsWith('{')) {
      console.warn(`[ZunoPlugin] ${addonName} returned non-JSON/invalid response: ${text.slice(0, 100)}`);
      return [];
    }
    const json = JSON.parse(text);
    if (!json.streams) return [];
    
    return json.streams.map((stream: any) => {
      let magnetUrl = '';
      if (stream.infoHash) {
        magnetUrl = `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(stream.title?.split('\n')[0] || 'Torrent')}` +
          `&tr=udp://tracker.coppersurfer.tk:6969/announce` +
          `&tr=udp://tracker.openbittorrent.com:6969/announce` +
          `&tr=udp://tracker.opentrackr.org:1337` +
          `&tr=udp://explodie.org:6969/announce` +
          `&tr=udp://open.demonii.com:1337/announce`;
      } else if (stream.url && stream.url.startsWith('magnet:')) {
        magnetUrl = stream.url;
      }

      if (!magnetUrl) return null;

      const titleText = stream.title || '';
      // Extract seeders count
      let seeders = 0;
      const emojiMatch = titleText.match(/👤\s*(\d+)/);
      if (emojiMatch) {
        seeders = parseInt(emojiMatch[1], 10);
      } else {
        const textMatch = titleText.match(/(?:seeders|seeds|seed):\s*(\d+)/i);
        if (textMatch) {
          seeders = parseInt(textMatch[1], 10);
        } else {
          const sMatch = titleText.match(/\bS:\s*(\d+)/i);
          if (sMatch) seeders = parseInt(sMatch[1], 10);
        }
      }

      // Filter out dead links (0 seeders parsed)
      const hasSeedersInfo = titleText.includes('👤') || /seeders|seeds|seed/i.test(titleText) || /\bS:\s*\d+/i.test(titleText);
      if (hasSeedersInfo && seeders === 0) {
        return null; // Dead link, discard
      }

      const qualityMatch = stream.name?.match(/(1080p|720p|2160p|480p)/i);
      const quality = qualityMatch ? qualityMatch[0] : '720p';
      
      const parts = titleText.split('\n') || [];
      const fileName = parts[0] || 'Torrent Source';
      const stats = parts[1] || '';

      return {
        quality: `${quality} (${stats.trim() || 'Torrent'})`,
        url: magnetUrl,
        type: 'torrent',
        headers: {},
        provider: addonName,
        host: fileName,
        seeders: seeders
      };
    }).filter((s: any) => s !== null);
  } catch (err) {
    console.warn(`[ZunoPlugin] ${addonName} fetch failed:`, err);
    return [];
  }
}

export async function resolvePlaybackSources(
  title: string,
  isSerial: boolean,
  season: number,
  episode: number,
  onProgress: (progress: PlaybackProgress[]) => void,
  onSourceFound?: (source: VideoSource) => void,
  onAllDone?: () => void,
  onCacheUpdate?: (result: LinksResult) => void,
  imdbId?: string
): Promise<LinksResult> {
  isResolutionCancelled = false; // Reset cancellation flag
  const allProviders = await getProviders();
  const providers = allProviders.filter(p => p.hasSearch !== false);
  
  const addons = [
    { name: 'Torrentio', url: 'https://torrentio.strem.fun' },
    { name: 'Comet', url: 'https://comet.elfhosted.com' }
  ];

  const progressList: PlaybackProgress[] = [];
  if (imdbId) {
    addons.forEach(add => {
      progressList.push({ providerName: add.name, status: 'searching', linksCount: 0 });
    });
  }
  allProviders.forEach(p => {
    progressList.push({
      providerName: p.name,
      status: p.hasSearch === false ? 'none' : 'searching',
      linksCount: 0,
    });
  });

  onProgress([...progressList]);

  /**
   * Strips noise added by Indian streaming sites before comparing titles.
   * Input:  "Dune Part Two (2024) {Hindi} 1080p BluRay"
   * Output: "dune part two"
   */
  const cleanForMatch = (t: string): string => {
    return t
      .toLowerCase()
      // Remove year in any bracket: (2024), [2024], {2024}
      .replace(/[\(\[\{]\s*\d{4}\s*[\)\]\}]/g, ' ')
      // Remove quality/format tags (standalone words)
      .replace(/\b(1080p|720p|480p|360p|4k|uhd|hdrip|bluray|blu-ray|webrip|web-dl|dvdrip|dvdscr|hdcam|cam|ts|bdrip|hdtv|pdvd|hd|sd)\b/gi, ' ')
      // Remove audio/language tags in any bracket type: {Hindi}, [Dual Audio], (Tamil)
      .replace(/[\(\[\{][^\)\]\}]*(hindi|english|tamil|telugu|malayalam|kannada|punjabi|bengali|dual|dubbed|multi|org)[^\)\]\}]*[\)\]\}]/gi, ' ')
      // Remove standalone language words not in brackets
      .replace(/\b(hindi|english|tamil|telugu|malayalam|kannada|punjabi|bengali|dual|dubbed|multi)\b/gi, ' ')
      // Remove season/episode markers: S01E01, Season 1, Ep 2
      .replace(/\b(s\d{1,2}e\d{1,2}|season\s*\d+|episode\s*\d+|ep\s*\d+)\b/gi, ' ')
      // Remove non-alphanumeric except spaces
      .replace(/[^a-z0-9 ]/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  /**
   * Word-overlap score between two cleaned titles (Jaccard-like).
   * Returns 0.0–1.0 where 1.0 = perfect match.
   * Also returns 1.0 if either title's words are a complete subset of the other
   * (handles cases like site title "Dhurandhar" matching query "Dhurandhar The Revenge").
   */
  const titleSimilarity = (a: string, b: string): number => {
    const wordsA = new Set(a.split(' ').filter(w => w.length > 1));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 1));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
    // Subset match: if all words of the shorter title appear in the longer, treat as strong match
    const smaller = wordsA.size <= wordsB.size ? wordsA : wordsB;
    const larger  = wordsA.size <= wordsB.size ? wordsB : wordsA;
    if (overlap === smaller.size && smaller.size >= 1) {
      // Full subset — score based on how much of the larger title is covered
      return 0.6 + (0.4 * smaller.size / larger.size);
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return overlap / union;
  };

  const SIMILARITY_THRESHOLD = 0.55; // at least 55% word overlap required

  const finalSources: VideoSource[] = [];
  const finalSubtitles: { lang: string; url: string }[] = [];

  let resolvePromise: ((result: LinksResult) => void) | null = null;
  let promiseResolved = false;

  // Register active callbacks so DeviceEventEmitter can stream new results directly to the UI
  activeSourceCallback = (s) => {
    // No cross-provider dedup — each provider keeps all its sources.
    // Within the same provider, dedup by URL to avoid streaming the same link twice.
    if (!finalSources.some(fs => fs.url === s.url && fs.provider === s.provider)) {
      finalSources.push(s);
      
      // Direct links first, torrents last (sorted by seeders)
      finalSources.sort((x, y) => {
        const xIsTorrent = x.type === 'torrent' || x.url.startsWith('magnet:');
        const yIsTorrent = y.type === 'torrent' || y.url.startsWith('magnet:');
        if (xIsTorrent && !yIsTorrent) return 1;
        if (!xIsTorrent && yIsTorrent) return -1;
        if (xIsTorrent && yIsTorrent) {
          const xSeed = (x as any).seeders ?? 0;
          const ySeed = (y as any).seeders ?? 0;
          return ySeed - xSeed;
        }
        return 0;
      });

      if (onSourceFound) onSourceFound(s);
      // Resolve promise immediately on first source so UI shows it right away
      if (!promiseResolved && resolvePromise) {
        promiseResolved = true;
        const uniqueSubs = Array.from(new Map(finalSubtitles.map(sub => [sub.url, sub])).values());
        console.log(`[ZunoPlugin][RESOLVED_SOURCES] First source arrived. Sources: ${finalSources.length}`);
        resolvePromise({ sources: [...finalSources], subtitles: uniqueSubs });
      }
    }
  };

  activeSubtitleCallback = (sub) => {
    if (!finalSubtitles.some(fs => fs.url === sub.url)) {
      finalSubtitles.push(sub);
    }
  };

  const searchAndResolve = async (provider: PluginProvider, idx: number, onEnterLoadLinks?: () => void): Promise<LinksResult | null> => {
    try {
      if (isResolutionCancelled) return null;
      console.log(`[ZunoPlugin][SEARCH] ${provider.name} searching for '${title}'`);
      const items = await CloudStreamModule.search(provider.name, title);
      const parsed = parseJson<{ items: any[]; error?: string }>(items);
      const searchResults = parsed.items ?? [];
      const searchError = parsed.error;

      if (searchError) {
        console.log(`[ZunoPlugin][SEARCH] ${provider.name}: error - ${searchError}`);
        progressList[idx].status = 'error';
        progressList[idx].errorReason = searchError;
        onProgress([...progressList]);
        return null;
      }

      console.log(`[ZunoPlugin][SEARCH] ${provider.name}: ${searchResults.length} results -`, searchResults.slice(0,5).map((r: any) => r.title));

      if (searchResults.length === 0) {
        console.log(`[ZunoPlugin][SEARCH] ${provider.name}: no results returned`);
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      const targetClean = cleanForMatch(title);
      // Score each result and pick best
      let bestMatch: any = null;
      let bestScore = 0;
      for (const item of searchResults) {
        const itemClean = cleanForMatch(item.title ?? '');
        const score = titleSimilarity(targetClean, itemClean);
        console.log(`[ZunoPlugin][MATCH] ${provider.name}: '${item.title}' -> cleaned='${itemClean}' score=${score.toFixed(2)}`);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      if (!bestMatch || bestScore < SIMILARITY_THRESHOLD) {
        console.log(`[ZunoPlugin][MATCH] ${provider.name}: best score ${bestScore.toFixed(2)} below threshold ${SIMILARITY_THRESHOLD} for '${title}'`);
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      console.log(`[ZunoPlugin][MATCH] ${provider.name}: matched '${bestMatch.title}' (score=${bestScore.toFixed(2)}) -> loading detail url='${bestMatch.url}'`);

      if (isResolutionCancelled) return null;
      const detailJson = await CloudStreamModule.loadDetail(provider.name, bestMatch.url);
      const detailObj = parseJson<any>(detailJson);

      if (detailObj?.error) {
        console.log(`[ZunoPlugin][DETAIL] ${provider.name}: error - ${detailObj.error}`);
        progressList[idx].status = 'error';
        progressList[idx].errorReason = detailObj.error;
        onProgress([...progressList]);
        return null;
      }

      if (!detailObj || !detailObj.episodes || detailObj.episodes.length === 0) {
        console.log(`[ZunoPlugin][DETAIL] ${provider.name}: no episodes in detail response`);
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      console.log(`[ZunoPlugin][DETAIL] ${provider.name}: found ${detailObj.episodes.length} episodes, isSerial=${isSerial}, want S${season}E${episode}`);

      let matchingEpisode: any = null;
      if (isSerial) {
        matchingEpisode = detailObj.episodes.find((ep: any) => {
          const epSeason = parseNumber(ep.season) ?? 1;
          const epEpisode = parseNumber(ep.episode) ?? 1;
          return epSeason === season && epEpisode === episode;
        });
        if (!matchingEpisode) {
          console.log(`[ZunoPlugin][DETAIL] ${provider.name}: S${season}E${episode} not found in episode list`);
        }
      } else {
        matchingEpisode = detailObj.episodes[0];
      }

      if (!matchingEpisode || !matchingEpisode.mediaRef) {
        console.log(`[ZunoPlugin][DETAIL] ${provider.name}: no matching episode or missing mediaRef`);
        progressList[idx].status = 'none';
        onProgress([...progressList]);
        return null;
      }

      if (isResolutionCancelled) return null;
      console.log(`[ZunoPlugin][LINKS] ${provider.name}: loading links for mediaRef='${matchingEpisode.mediaRef}'`);
      onEnterLoadLinks?.();
      const linksJson = await CloudStreamModule.loadLinks(provider.name, matchingEpisode.mediaRef);
      const linksObj = parseJson<any>(linksJson);

      if (linksObj?.error) {
        console.log(`[ZunoPlugin][LINKS] ${provider.name}: error - ${linksObj.error}`);
        progressList[idx].status = 'error';
        progressList[idx].errorReason = linksObj.error;
        onProgress([...progressList]);
        return null;
      }

      const sources = (linksObj.sources ?? []).map((s: any) => ({
        quality: s.quality ?? '',
        url: s.url ?? '',
        type: s.type ?? '',
        headers: s.headers ?? {},
        provider: provider.name,
        host: s.host ?? '',
      }));

      const subtitles = (linksObj.subtitles ?? []).map((sub: any) => ({
        lang: sub.lang ?? '',
        url: sub.url ?? '',
      }));

      console.log(`[ZunoPlugin][LINKS] ${provider.name}: ${sources.length} sources, ${subtitles.length} subtitles`);

      if (sources.length > 0) {
        progressList[idx].status = 'found';
        progressList[idx].linksCount = sources.length; // No cross-provider dedup — each provider keeps all its sources
        onProgress([...progressList]);

        // Push all sources without cross-provider dedup — same URL from different providers are kept separate
        sources.forEach((s: any) => {
          if (!finalSources.some(fs => fs.url === s.url && fs.provider === s.provider)) {
            finalSources.push(s);
            if (onSourceFound) onSourceFound(s);
          }
        });

        subtitles.forEach((sub: any) => {
          if (!finalSubtitles.some(fs => fs.url === sub.url)) {
            finalSubtitles.push(sub);
          }
        });

        return { sources, subtitles };
      } else {
        const reason = linksObj?.error ? ` (${linksObj.error})` : '';
        console.log(`[ZunoPlugin][LINKS] ${provider.name}: loadLinks returned 0 sources${reason}`);
        progressList[idx].status = 'none';
        if (linksObj?.error) progressList[idx].errorReason = linksObj.error;
        onProgress([...progressList]);
        return null;
      }
    } catch (err: any) {
      console.warn(`[ZunoPlugin][ERROR] ${provider.name}:`, err);
      progressList[idx].status = 'error';
      const rawMsg: string = err?.message || String(err);
      // Detect whether Kotlin's DoH fallback was triggered (indicated in error message)
      const isDoh = rawMsg.toLowerCase().includes('doh') ||
                    rawMsg.toLowerCase().includes('dns blocked') ||
                    rawMsg.toLowerCase().includes('retrying via') ||
                    rawMsg.toLowerCase().includes('isp block');
      progressList[idx].isDohRetry = isDoh || false;
      progressList[idx].errorReason = rawMsg;
      onProgress([...progressList]);
      return null;
    }
  };

  const TIMEOUT = PROVIDER_TIMEOUT_MS; // 60 seconds per provider (increased from 30s for slow resolvers like 4K HDHUB)
  // Track if any provider found a match and is loading links (even if timed out)
  // This prevents resolving empty while a loadLinks call is still in-flight
  let anyProviderMatchedAndLoadingLinks = false;
  
  return new Promise<LinksResult>((resolve) => {
    resolvePromise = resolve;
    let completedCount = 0;
    const totalTasksCount = providers.length + (imdbId ? addons.length : 0);

    const checkResolve = (allDone = false) => {
      if (promiseResolved) return;
      if (finalSources.length > 0) {
        // We have sources — resolve immediately to show them
        promiseResolved = true;
        console.log(`[ZunoPlugin][RESOLVED_SOURCES] Resolving links promise. Sources found: ${finalSources.length}`);
        const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());
        resolve({
          sources: [...finalSources],
          subtitles: uniqueSubs,
        });
        // Don't null out activeSourceCallback here — keep feeding any
        // in-flight streamed events (e.g. remaining links from 4K HDHUB)
        // into onSourceFound so the UI list keeps updating live.
        // Callbacks are cleaned up only when all providers finish.
      } else if (allDone && completedCount >= totalTasksCount) {
        // All providers done, no sources found
        promiseResolved = true;
        console.log(`[ZunoPlugin][RESOLVED_EMPTY] All providers done, no sources found.`);
        const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());
        resolve({ sources: [], subtitles: uniqueSubs });
      }
    };

    // 1. Run Stremio Addons in parallel
    if (imdbId) {
      addons.forEach((add) => {
        const addonIdx = progressList.findIndex(p => p.providerName === add.name);
        fetchStremioAddonStreams(add.name, add.url, imdbId, isSerial, season, episode).then((streams) => {
          if (isResolutionCancelled) return;
          if (streams.length > 0) {
            if (addonIdx !== -1) {
              progressList[addonIdx].status = 'found';
              progressList[addonIdx].linksCount = streams.length;
              onProgress([...progressList]);
            }

            streams.forEach((s) => {
              if (!finalSources.some(fs => fs.url === s.url && fs.provider === s.provider)) {
                finalSources.push(s);
              }
            });

            // Direct links first, torrents last (sorted by seeders)
            finalSources.sort((x, y) => {
              const xIsTorrent = x.type === 'torrent' || x.url.startsWith('magnet:');
              const yIsTorrent = y.type === 'torrent' || y.url.startsWith('magnet:');
              if (xIsTorrent && !yIsTorrent) return 1;
              if (!xIsTorrent && yIsTorrent) return -1;
              if (xIsTorrent && yIsTorrent) {
                const xSeed = (x as any).seeders ?? 0;
                const ySeed = (y as any).seeders ?? 0;
                return ySeed - xSeed;
              }
              return 0;
            });

            // Fire onSourceFound callback to stream to UI
            streams.forEach((s) => {
              if (onSourceFound) onSourceFound(s);
            });

          } else {
            if (addonIdx !== -1) {
              progressList[addonIdx].status = 'none';
              onProgress([...progressList]);
            }
          }
        }).catch((e) => {
          if (addonIdx !== -1) {
            progressList[addonIdx].status = 'error';
            progressList[addonIdx].errorReason = e.message || String(e);
            onProgress([...progressList]);
          }
        }).finally(() => {
          completedCount++;
          checkResolve(completedCount >= totalTasksCount);
          if (completedCount >= totalTasksCount) {
            activeSourceCallback = null;
            activeSubtitleCallback = null;
            onAllDone?.();
            const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());
            onCacheUpdate?.({ sources: [...finalSources], subtitles: uniqueSubs });
          }
        });
      });
    }

    // 2. Run searches for standard providers in parallel
    providers.forEach((p) => {
      const idx = progressList.findIndex(pr => pr.providerName === p.name);
      if (idx === -1) return;

      Promise.race([
        searchAndResolve(p, idx, () => { anyProviderMatchedAndLoadingLinks = true; }),
        new Promise<null>((res) => setTimeout(() => {
          if (progressList[idx].status === 'searching') {
            console.log(`[ZunoPlugin][TIMEOUT] ${p.name} timed out after ${TIMEOUT}ms`);
            progressList[idx].status = 'none';
            progressList[idx].errorReason = 'Timed out';
            onProgress([...progressList]);
          }
          res(null);
        }, TIMEOUT))
      ]).then(() => {
        completedCount++;
        checkResolve(completedCount >= totalTasksCount);
        // Once truly all done, clean up callbacks, fire onAllDone, and update cache with complete list
        if (completedCount >= totalTasksCount) {
          activeSourceCallback = null;
          activeSubtitleCallback = null;
          onAllDone?.();
          const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());
          onCacheUpdate?.({ sources: [...finalSources], subtitles: uniqueSubs });
        }
      });
    });
  });
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
  logoUrl?: string,
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
    logoUrl ?? '',
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

export async function deletePlaybackHistoryItem(id: string): Promise<boolean> {
  try {
    return await CloudStreamModule.deletePlaybackHistoryItem(id);
  } catch (e) {
    console.warn('Failed to delete history item:', e);
    return false;
  }
}

export interface TorrentStreamInfo {
  streamUrl: string;
  fileName: string;
  fileSize: number;
}

export interface TorrentStatus {
  progress: number;
  speed: number;
  peers: number;
  active: boolean;
}

export async function startTorrentStream(magnetUrl: string): Promise<TorrentStreamInfo> {
  return await CloudStreamModule.startTorrentStream(magnetUrl);
}

export async function stopTorrentStream(): Promise<boolean> {
  return await CloudStreamModule.stopTorrentStream();
}

export async function getTorrentStatus(): Promise<TorrentStatus> {
  return await CloudStreamModule.getTorrentStatus();
}
