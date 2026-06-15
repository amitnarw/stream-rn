export interface PluginProvider {
  id: string;
  name: string;
}

export interface MediaItem {
  provider: string;
  url: string;
  title: string;
  posterUrl: string | null;
  type: string | null;
}

export interface HomeSection {
  name: string;
  items: MediaItem[];
}

export interface EpisodeItem {
  episode: number;
  label: string;
  mediaRef: string;
  image?: string;
  season?: number;
  overview?: string;
}

export interface DetailResult {
  provider: string;
  url: string;
  title: string;
  description: string | null;
  posterUrl: string | null;
  banner: string | null;
  year: number | null;
  isSerial: boolean;
  episodes: EpisodeItem[];
}

export interface VideoSource {
  quality: string;
  url: string;
  type: string;
  headers: Record<string, string>;
}

export interface LinksResult {
  sources: VideoSource[];
  subtitles: { lang: string; url: string }[];
}
