export interface PluginProvider {
  id: string;
  name: string;
  hasSearch?: boolean;
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
  runtime?: number;
}

export interface Actor {
  name: string;
  image: string | null;
  role: string | null;
  imdbId?: string | null;
}

export interface Trailer {
  url: string;
  referer: string;
  raw: boolean;
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
  score: string | null;
  tags: string[];
  duration: number | null;
  comingSoon: boolean;
  contentRating: string | null;
  logoUrl: string | null;
  imdbId: string | null;

  cast: Actor[];
  recommendations: MediaItem[];
  trailers: Trailer[];
  director?: string[] | null;
  writer?: string[] | null;
  awards?: string | null;
}

export interface VideoSource {
  quality: string;
  url: string;
  type: string;
  headers: Record<string, string>;
  provider?: string;
  host?: string;
}

export interface LinksResult {
  sources: VideoSource[];
  subtitles: { lang: string; url: string }[];
}
