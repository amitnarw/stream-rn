import { NativeModules } from 'react-native';
import type {
  PluginProvider,
  MediaItem,
  HomeSection,
  DetailResult,
  LinksResult,
} from '../types/plugin';

const { CloudStreamModule } = NativeModules;

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
  const json = await CloudStreamModule.loadPlugins();
  return parseJson<PluginProvider[]>(json);
}

export async function getProviders(): Promise<PluginProvider[]> {
  const json = await CloudStreamModule.getProviders();
  return parseJson<PluginProvider[]>(json);
}

export async function getMainPage(
  providerName: string,
  page: number = 1
): Promise<HomeSection[]> {
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
  const json = await CloudStreamModule.search(providerName, query);
  const obj = parseJson<{ items: any[] }>(json);
  return (obj.items ?? []).map(mapItem);
}

export async function loadDetail(
  providerName: string,
  url: string
): Promise<DetailResult> {
  const json = await CloudStreamModule.loadDetail(providerName, url);
  const obj = parseJson<any>(json);
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
  };
}

export async function loadLinks(
  providerName: string,
  data: string
): Promise<LinksResult> {
  const json = await CloudStreamModule.loadLinks(providerName, data);
  const obj = parseJson<{ sources: any[]; subtitles: any[] }>(json);
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
) {
  CloudStreamModule.playStream(
    url,
    headers ? JSON.stringify(headers) : '{}',
    title ?? '',
    subtitleUrl ?? '',
    allSources ? JSON.stringify(allSources) : '',
    allSubtitles ? JSON.stringify(allSubtitles) : '',
  );
}
