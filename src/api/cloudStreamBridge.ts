import { NativeModules } from 'react-native';
import type {
  PluginProvider,
  MediaItem,
  HomeSection,
  DetailResult,
  LinksResult,
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
const CACHE_TTL = 15000;

export async function checkOnline(): Promise<boolean> {
  const now = Date.now();
  if (now - lastOnlineCheck < CACHE_TTL) {
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
  return providers.filter(
    (p) => !excludeNames.some((ex) => p.name.toLowerCase().includes(ex.toLowerCase()))
  );
}

export async function getMainPage(
  providerName: string,
  page: number = 1
): Promise<HomeSection[]> {
  await ensureOnline();
  const json = await CloudStreamModule.getMainPage(providerName, page);
  const obj = parseJson<{ sections: any[] }>(json);
  return (obj.sections ?? []).map((s: any) => ({
    name: s.name ?? '',
    items: (s.items ?? []).map(mapItem),
  }));
}

export async function search(
  providerName: string,
  query: string
): Promise<MediaItem[]> {
  await ensureOnline();
  const json = await CloudStreamModule.search(providerName, query);
  const obj = parseJson<{ items: any[] }>(json);
  return (obj.items ?? []).map(mapItem);
}

export async function loadDetail(
  providerName: string,
  url: string
): Promise<DetailResult> {
  await ensureOnline();
  const json = await CloudStreamModule.loadDetail(providerName, url);
  const obj = parseJson<any>(json);
  if (!obj || !obj.title) throw new Error('Failed to load details from provider');
  return {
    provider: obj.provider ?? '',
    url: obj.url ?? '',
    title: obj.title ?? '',
    description: obj.description ?? null,
    posterUrl: obj.posterUrl ?? null,
    banner: obj.banner ?? null,
    year: obj.year ?? null,
    isSerial: obj.isSerial ?? false,
    episodes: (obj.episodes ?? []).map((e: any) => ({
      episode: e.episode ?? 1,
      label: e.label ?? '',
      mediaRef: e.mediaRef ?? '',
      image: e.image,
      season: e.season,
      overview: e.overview,
    })),
    score: obj.score ?? null,
    tags: obj.tags ?? [],
    duration: obj.duration ?? null,
    comingSoon: obj.comingSoon ?? false,
    contentRating: obj.contentRating ?? null,
    logoUrl: obj.logoUrl ?? null,
    imdbId: obj.imdbId ?? null,
    tmdbId: obj.tmdbId ?? null,
    cast: (obj.cast ?? []).map((a: any) => ({
      name: a.name ?? '',
      image: a.image ?? null,
      role: a.role ?? null,
    })),
    recommendations: (obj.recommendations ?? []).map(mapItem),
    trailers: (obj.trailers ?? []).map((t: any) => ({
      url: t.url ?? '',
      referer: t.referer ?? '',
      raw: t.raw ?? false,
    })),
  };
}

export async function loadLinks(
  providerName: string,
  data: string
): Promise<LinksResult> {
  await ensureOnline();
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
  );
}
