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

// Silence all verbose link resolution logs in this file
const console = {
  log: () => {},
  warn: (...args: any[]) => global.console.warn(...args),
  error: (...args: any[]) => global.console.error(...args),
} as any;

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

export async function getPlayerMode(): Promise<'inbuilt' | 'external'> {
  try {
    const mode = await AsyncStorage.getItem('@sozo_player_mode');
    return mode === 'external' ? 'external' : 'inbuilt';
  } catch {
    return 'inbuilt';
  }
}

export async function setPlayerMode(mode: 'inbuilt' | 'external'): Promise<void> {
  try {
    await AsyncStorage.setItem('@sozo_player_mode', mode);
  } catch (e) {
    console.warn('Failed to save player mode:', e);
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
    const id = setTimeout(() => controller.abort(), 3000);
    await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(id);
    lastOnlineResult = true;
  } catch {
    // Optimistic fallback: assume online so network operations are attempted
    lastOnlineResult = true;
  }
  lastOnlineCheck = Date.now();
  return lastOnlineResult;
}

async function ensureOnline(): Promise<void> {
  // Always allow request attempts; network layer will handle genuine failures
  await checkOnline();
}

function parseJson<T>(json: string): T {
  return JSON.parse(json);
}

interface M3uEntry {
  name: string;
  logo: string | null;
  group: string;
  url: string;
  headers: Record<string, string>;
  drmScheme: 'clearkey' | 'widevine' | null;
  drmLicenseUrl: string | null;
  drmKey: string | null;
  manifestHeaders: Record<string, string>;
}

interface M3uParsedProps {
  drmScheme: 'clearkey' | 'widevine' | null;
  drmLicenseUrl: string | null;
  drmKey: string | null;
  manifestHeaders: Record<string, string>;
}

// Parses a "#KODIPROP:inputstream.adaptive.manifest_headers="Referer=...;Origin=...;User-Agent=..."" value
// into a key->value record. Splits on `;`, then on the first `=` per pair.
function parseManifestHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs = raw.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

// Reads KODIPROP lines attached to a pending entry. Supports the common Kodi inputstream.adaptive
// properties seen in DishTV d2h / bhoomtv.me / keralive.workers.dev playlists:
//   inputstream.adaptive.license_type=clearkey
//   inputstream.adaptive.license_key={keyIdHex}:{keyHex}
//   inputstream.adaptive.license_url=...    (optional)
//   inputstream.adaptive.mimetype=application/dash+xml
//   inputstream.adaptive.manifest_headers="Referer=...;Origin=...;User-Agent=..."
function readKodiProps(rawLine: string, out: M3uParsedProps): void {
  const body = rawLine.substring('#KODIPROP:'.length).trim();
  const eqIdx = body.indexOf('=');
  if (eqIdx === -1) return;
  const key = body.substring(0, eqIdx).trim();
  let val = body.substring(eqIdx + 1).trim();
  // Strip surrounding quotes (Kodi often uses double quotes)
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1);
  }

  switch (key) {
    case 'inputstream.adaptive.license_type': {
      const norm = val.toLowerCase();
      if (norm === 'clearkey' || norm === 'widevine') {
        out.drmScheme = norm;
      }
      break;
    }
    case 'inputstream.adaptive.license_key': {
      out.drmKey = val;
      break;
    }
    case 'inputstream.adaptive.license_url':
    case 'inputstream.adaptive.license_server': {
      out.drmLicenseUrl = val;
      break;
    }
    case 'inputstream.adaptive.manifest_headers': {
      const parsed = parseManifestHeaders(val);
      out.manifestHeaders = { ...out.manifestHeaders, ...parsed };
      break;
    }
    default:
      // Ignore unrelated KODIPROP keys (streamtype, flags, etc.)
      break;
  }
}

function parseM3u(text: string): M3uEntry[] {
  const entries: M3uEntry[] = [];
  const lines = text.split(/\r?\n/);
  let pending:
    | {
        name: string;
        logo: string | null;
        group: string;
        headers: Record<string, string>;
        drmScheme: 'clearkey' | 'widevine' | null;
        drmLicenseUrl: string | null;
        drmKey: string | null;
        manifestHeaders: Record<string, string>;
      }
    | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTVLCOPT')) {
      if (!pending) continue;
      const opt = line.substring('#EXTVLCOPT:'.length).trim();
      const eqIdx = opt.indexOf('=');
      if (eqIdx === -1) continue;
      const key = opt.substring(0, eqIdx).trim();
      const val = opt.substring(eqIdx + 1).trim();
      pending.headers[key] = val;
      continue;
    }

    if (line.startsWith('#KODIPROP')) {
      if (!pending) continue;
      readKodiProps(line, pending);
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.*)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
      const tvgLogo = line.match(/tvg-logo="([^"]*)"/);
      const group = line.match(/group-title="([^"]*)"/);
      pending = {
        name,
        logo: tvgLogo ? tvgLogo[1] : null,
        group: group ? group[1] : 'General',
        headers: {},
        drmScheme: null,
        drmLicenseUrl: null,
        drmKey: null,
        manifestHeaders: {},
      };
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pending) {
      pending.headers['User-Agent'] = pending.headers['http-user-agent'] ?? pending.headers['User-Agent'] ?? '';
      // Merge any manifest_headers that are not already covered by EXTVLCOPT / User-Agent
      pending.headers = { ...pending.manifestHeaders, ...pending.headers };
      entries.push({
        ...pending,
        url: line,
        drmScheme: pending.drmScheme,
        drmLicenseUrl: pending.drmLicenseUrl,
        drmKey: pending.drmKey,
        manifestHeaders: pending.manifestHeaders,
      });
      pending = null;
    }
  }

  return entries;
}

function parseM3uToSections(text: string, providerName: string): HomeSection[] {
  const entries = parseM3u(text);
  const sectionsMap = new Map<string, any[]>();
  for (const entry of entries) {
    if (!entry.url.startsWith('http')) continue;
    const item = {
      provider: providerName,
      url: JSON.stringify({
        url: entry.url,
        headers: entry.headers,
        title: entry.name,
        drmScheme: entry.drmScheme,
        drmLicenseUrl: entry.drmLicenseUrl,
        drmKey: entry.drmKey,
        manifestHeaders: entry.manifestHeaders,
      }),
      title: entry.name,
      posterUrl: entry.logo,
      type: 'live',
    };
    if (!sectionsMap.has(entry.group)) sectionsMap.set(entry.group, []);
    sectionsMap.get(entry.group)!.push(item);
  }

  const sections: HomeSection[] = [];
  for (const [groupName, items] of sectionsMap.entries()) {
    if (items.length === 0) continue;
    sections.push({ name: groupName, items });
  }

  sections.sort((a, b) => a.name.localeCompare(b.name));
  return sections;
}

export const M3U_SOURCE_MAP: Record<string, string> = {
  // Zuno curated playlist (hosted in this repo, edited from data/zuno_tv.m3u)
  'Zuno TV': 'https://raw.githubusercontent.com/amitnarw/stream-rn/main/data/zuno_tv.m3u',
  // Indian DTH / cable (primary)
  'DishTV d2h': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/dishd2h.m3u',
  'Jio TV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/jtv.m3u',
  'Tango TV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/tangotv.m3u',
  'SmartPlay': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/smartplay.m3u',
  'Pishow': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/pishow.m3u',
  'Riptv': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/riptv.m3u',
  'LiveBox': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/livebox.m3u',
  'StreamBridge': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/streambridge.m3u',
  'Akash Go': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/akashgo.m3u',
  'Amigo FX': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/amigofx.m3u',
  'Ashoka Digital': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/ashokadigital.m3u',
  'Max Digital TV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/maxdigitaltv.m3u',
  'Neo TV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/neotv.m3u',
  'Nellai IPTV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/nellaiiptv.m3u',
  'Madurai IPTV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/maduraiiptv.m3u',
  'WebChnl': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/webchnl.m3u',
  'YuppTV Fast': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/yupptvfast.m3u',
  'EK TV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/ektv.m3u',
  'Elekta Media': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/elektamedia.m3u',
  'Roarzone': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/roarzone.m3u',
  'Jayam OTT': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/jayamott.m3u',
  'Joshua OTT': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/joshuaott.m3u',
  // Sony channels via CloudPlay proxy (no login, plain HLS)
  'SonyLIV CloudPlay': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/sliv.m3u',
  // TATA Play channels via third-party Cloudflare Worker (VPN may be required)
  'TATA Play PiratesTV': 'https://tataplay.piratestv.workers.dev/',
  // International / curated
  'IPTV Org Hindi': 'https://iptv-org.github.io/iptv/languages/hin.m3u',
  'IPTV Org India': 'https://iptv-org.github.io/iptv/countries/in.m3u',
  'DistroTV': 'https://raw.githubusercontent.com/amazeyourself/m3u/main/distrotv.m3u',
};

// Ordered provider list for the dedicated LiveTV screen
export const M3U_PROVIDER_ORDER: string[] = [
  'Zuno TV',
  'DishTV d2h',
  'Jio TV',
  'SonyLIV CloudPlay',
  'TATA Play PiratesTV',
  'Tango TV',
  'SmartPlay',
  'Pishow',
  'Riptv',
  'LiveBox',
  'StreamBridge',
  'Akash Go',
  'Amigo FX',
  'Ashoka Digital',
  'Max Digital TV',
  'Neo TV',
  'Nellai IPTV',
  'Madurai IPTV',
  'WebChnl',
  'YuppTV Fast',
  'EK TV',
  'Elekta Media',
  'Roarzone',
  'Jayam OTT',
  'Joshua OTT',
  'IPTV Org Hindi',
  'IPTV Org India',
  'DistroTV',
];

// CloudStream .cs3 plugins that act as live TV providers
export const CS_LIVE_TV_PROVIDERS: string[] = [
  'IPTV Player',
  'PublicSportsIPTV',
  'Sports IPTV',
  'Pirate IPTV',
  'Japan IPTV',
];

const DEFAULT_IPTV_PROVIDER_KEY = '@sozo_default_iptv_provider';

// Returns the union of all currently available IPTV providers, grouped.
export async function getAvailableIPTVProviders(): Promise<{
  m3u: PluginProvider[];
  cs: PluginProvider[];
}> {
  const m3u: PluginProvider[] = M3U_PROVIDER_ORDER.map((name) => ({
    id: name,
    name,
    url: M3U_SOURCE_MAP[name] || '',
    hasMainPage: true,
    hasSearch: false,
  }));

  let csList: PluginProvider[] = [];
  try {
    const all = await getProviders();
    const allowed = new Set(CS_LIVE_TV_PROVIDERS.map((n) => n.toLowerCase()));
    csList = all.filter((p) => allowed.has(p.name.toLowerCase()));
  } catch (_) {
    // fall back to static list
    csList = CS_LIVE_TV_PROVIDERS.map((name) => ({
      id: name,
      name,
      url: '',
      hasMainPage: true,
      hasSearch: false,
    }));
  }

  // If the native plugin list failed, also fall back to static list
  if (csList.length === 0) {
    csList = CS_LIVE_TV_PROVIDERS.map((name) => ({
      id: name,
      name,
      url: '',
      hasMainPage: true,
      hasSearch: false,
    }));
  }

  return { m3u, cs: csList };
}

export async function getDefaultIPTVProvider(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(DEFAULT_IPTV_PROVIDER_KEY);
    return value && value.trim() ? value : null;
  } catch (_) {
    return null;
  }
}

export async function setDefaultIPTVProvider(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEFAULT_IPTV_PROVIDER_KEY, name);
  } catch (_) {
    /* ignore */
  }
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
  const providers = parseJson<PluginProvider[]>(json);
  const uniqueNames = new Set<string>();
  return providers.filter((p) => {
    if (uniqueNames.has(p.name)) return false;
    uniqueNames.add(p.name);
    return true;
  });
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
  return filtered
    .filter((p) => {
      if (uniqueNames.has(p.name)) return false;
      uniqueNames.add(p.name);
      return true;
    })
    .map((p) => ({ ...p, hasSearch: p.hasSearch !== false }));
}

export function getCleanPosterUrl(url: string | null | undefined, id?: string): string | null {
  if (!url && !id) return null;
  let imdbId = id && id.startsWith('tt') ? id : null;
  if (!imdbId && url) {
    const match = url.match(/(tt\d+)/);
    if (match) imdbId = match[1];
  }
  if (url && (url.includes('ratingposterdb.com') || url.includes('rpdb'))) {
    if (imdbId) {
      return `https://images.metahub.space/poster/medium/${imdbId}/img`;
    }
  }
  if (!url && imdbId) {
    return `https://images.metahub.space/poster/medium/${imdbId}/img`;
  }
  return url ?? null;
}

async function fetchNewMoviesHelper(): Promise<any[]> {
  const urls = [
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/movie/nfx.json',
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/movie/dnp.json',
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/movie/hbm.json',
  ];
  const allMetas: any[] = [];
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.metas) allMetas.push(...json.metas);
    } catch (_) {}
  }));
  const map = new Map<string, any>();
  for (const m of allMetas) {
    if (m.id && m.name && (m.poster || m.background) && !map.has(m.id)) {
      map.set(m.id, m);
    }
  }
  const items = Array.from(map.values())
    .map(m => ({
      provider: 'Cinemeta',
      url: `movie/${m.id}`,
      title: m.name ?? '',
      posterUrl: m.poster ?? m.background ?? null,
      type: 'movie',
      genres: m.genres ?? [],
      year: m.year ?? '',
    }))
    .filter(m => (parseInt(m.year) || 0) >= 2024);
  items.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  return items;
}

async function fetchNewSeriesHelper(): Promise<any[]> {
  const urls = [
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/series/nfx.json',
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/series/amp.json',
    'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/catalog/series/hbm.json',
  ];
  const allMetas: any[] = [];
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.metas) allMetas.push(...json.metas);
    } catch (_) {}
  }));
  const map = new Map<string, any>();
  for (const m of allMetas) {
    if (m.id && m.name && (m.poster || m.background) && !map.has(m.id)) {
      map.set(m.id, m);
    }
  }
  const items = Array.from(map.values())
    .map(m => ({
      provider: 'Cinemeta',
      url: `series/${m.id}`,
      title: m.name ?? '',
      posterUrl: m.poster ?? m.background ?? null,
      type: 'series',
      genres: m.genres ?? [],
      year: m.year ?? '',
    }))
    .filter(m => (parseInt(m.year) || 0) >= 2024);
  items.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  return items;
}

async function fetchHindiMoviesHelper(): Promise<any[]> {
  try {
    const urls = [
      'https://indiastreams.rdata.in/catalog/movie/hstzee.json',
      'https://indiastreams.rdata.in/catalog/movie/nfxprm.json',
      'https://indiastreams.rdata.in/catalog/movie/trendingmovies.json',
    ];
    const allMetas: any[] = [];
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.metas) allMetas.push(...json.metas);
      } catch (_) {}
    }));
    const map = new Map<string, any>();
    for (const m of allMetas) {
      if (m.id && m.name && m.poster && !map.has(m.id)) {
        map.set(m.id, m);
      }
    }
    const itemsList = Array.from(map.values()).slice(0, 35);
    const verified: any[] = [];
    await Promise.all(itemsList.map(async (item) => {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${item.id}.json`);
        const json = await res.json();
        const meta = json.meta;
        if (meta && (meta.country || '').toLowerCase().includes('india')) {
          verified.push({
            provider: 'Cinemeta',
            url: `movie/${item.id}`,
            title: meta.name || item.name || '',
            posterUrl: meta.poster || item.poster || null,
            type: 'movie',
            genres: meta.genres || item.genres || [],
            year: meta.year || item.year || '',
          });
        }
      } catch (_) {
        verified.push({
          provider: 'Cinemeta',
          url: `movie/${item.id}`,
          title: item.name || '',
          posterUrl: item.poster || null,
          type: 'movie',
          genres: item.genres || [],
          year: item.year || '',
        });
      }
    }));
    verified.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    return verified;
  } catch (_) {
    return [];
  }
}

async function fetchHindiSeriesHelper(): Promise<any[]> {
  try {
    const urls = [
      'https://indiastreams.rdata.in/catalog/series/hstzeetv.json',
      'https://indiastreams.rdata.in/catalog/series/nfxprmtv.json',
      'https://indiastreams.rdata.in/catalog/series/trendingtv.json',
    ];
    const allMetas: any[] = [];
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.metas) allMetas.push(...json.metas);
      } catch (_) {}
    }));
    const map = new Map<string, any>();
    for (const m of allMetas) {
      if (m.id && m.name && m.poster && !map.has(m.id)) {
        map.set(m.id, m);
      }
    }
    const itemsList = Array.from(map.values()).slice(0, 35);
    const verified: any[] = [];
    await Promise.all(itemsList.map(async (item) => {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${item.id}.json`);
        const json = await res.json();
        const meta = json.meta;
        if (meta && (meta.country || '').toLowerCase().includes('india')) {
          verified.push({
            provider: 'Cinemeta',
            url: `series/${item.id}`,
            title: meta.name || item.name || '',
            posterUrl: meta.poster || item.poster || null,
            type: 'series',
            genres: meta.genres || item.genres || [],
            year: meta.year || item.year || '',
          });
        }
      } catch (_) {
        verified.push({
          provider: 'Cinemeta',
          url: `series/${item.id}`,
          title: item.name || '',
          posterUrl: item.poster || null,
          type: 'series',
          genres: item.genres || [],
          year: item.year || '',
        });
      }
    }));
    return verified;
  } catch (_) {
    return [];
  }
}

async function fetchPunjabiMoviesHelper(): Promise<any[]> {
  try {
    const urls = [
      'https://v3-cinemeta.strem.io/catalog/movie/top/search=Punjabi.json',
      'https://v3-cinemeta.strem.io/catalog/movie/top/search=Pollywood.json',
      'https://v3-cinemeta.strem.io/catalog/movie/top/search=Jatt.json',
    ];
    const allMetas: any[] = [];
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.metas) allMetas.push(...json.metas);
      } catch (_) {}
    }));
    const map = new Map<string, any>();
    for (const m of allMetas) {
      if (m.id && m.name && m.poster && !map.has(m.id)) {
        map.set(m.id, m);
      }
    }
    const itemsList = Array.from(map.values()).slice(0, 30);
    const verified: any[] = [];
    await Promise.all(itemsList.map(async (item) => {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${item.id}.json`);
        const json = await res.json();
        const meta = json.meta;
        if (meta && (meta.country || '').toLowerCase().includes('india')) {
          verified.push({
            provider: 'Cinemeta',
            url: `movie/${item.id}`,
            title: meta.name || item.name || '',
            posterUrl: meta.poster || item.poster || null,
            type: 'movie',
            genres: meta.genres || item.genres || [],
            year: meta.year || item.year || '',
          });
        }
      } catch (_) {}
    }));
    verified.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    return verified;
  } catch (_) {
    return [];
  }
}

async function fetchPunjabiSeriesHelper(): Promise<any[]> {
  try {
    const urls = [
      'https://v3-cinemeta.strem.io/catalog/series/top/search=Punjabi.json',
      'https://v3-cinemeta.strem.io/catalog/series/top/search=Pollywood.json',
      'https://v3-cinemeta.strem.io/catalog/series/top/search=Jatt.json',
    ];
    const allMetas: any[] = [];
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.metas) allMetas.push(...json.metas);
      } catch (_) {}
    }));
    const map = new Map<string, any>();
    for (const m of allMetas) {
      if (m.id && m.name && m.poster && !map.has(m.id)) {
        map.set(m.id, m);
      }
    }
    const itemsList = Array.from(map.values()).slice(0, 30);
    const verified: any[] = [];
    await Promise.all(itemsList.map(async (item) => {
      try {
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${item.id}.json`);
        const json = await res.json();
        const meta = json.meta;
        if (meta && (meta.country || '').toLowerCase().includes('india')) {
          verified.push({
            provider: 'Cinemeta',
            url: `series/${item.id}`,
            title: meta.name || item.name || '',
            posterUrl: meta.poster || item.poster || null,
            type: 'series',
            genres: meta.genres || item.genres || [],
            year: meta.year || item.year || '',
          });
        }
      } catch (_) {}
    }));
    return verified;
  } catch (_) {
    return [];
  }
}

export async function fetchM3uSections(providerName: string, force: boolean = false): Promise<HomeSection[]> {
  const cacheKey = `@zuno_cache_v13_cinemeta_cat_LiveTV_prov_${providerName}_page_1`;
  if (!force) {
    const settings = await getSettings();
    const cachedData = await getCache<HomeSection[]>(cacheKey, settings.mainPageTtl);
    if (cachedData) {
      return cachedData;
    }
  }

  const m3uUrl = M3U_SOURCE_MAP[providerName];
  if (!m3uUrl) {
    return [];
  }
  try {
    await ensureOnline();
  } catch (e) {
    const expired = await getCache<HomeSection[]>(cacheKey, Infinity);
    if (expired && expired.length > 0) return expired;
    throw e;
  }
  try {
    const resp = await fetch(m3uUrl);
    const text = await resp.text();
    const sections = parseM3uToSections(text, providerName);
    await setCache(cacheKey, sections);
    return sections;
  } catch (err) {
    console.warn(`Failed to fetch ${providerName} M3U:`, err);
    return [];
  }
}

export interface QualityOption {
  quality: string;
  url: string;
  bandwidth?: number;
  width?: number;
  height?: number;
}

export function guessQualityFromUrl(url: string): QualityOption[] {
  const lc = url.toLowerCase();
  const label = (() => {
    if (/_4k_|4k\.|_4k\/|\/4k\//.test(lc) || /res=4k|quality=4k|2160p?/.test(lc)) return '4K';
    if (/_1080|_fhd|1080p?/.test(lc)) return '1080p';
    if (/_720|_hd|720p?/.test(lc)) return '720p';
    if (/_480|480p?/.test(lc)) return '480p';
    if (/_360|360p?/.test(lc)) return '360p';
    if (/_240|240p?/.test(lc)) return '240p';
    if (/_hd[^a-z]/.test(lc)) return 'HD';
    if (/_sd[^a-z]/.test(lc)) return 'SD';
    return '';
  })();
  return label ? [{ quality: label, url }] : [];
}

export async function fetchM3u8Variants(url: string, headers: Record<string, string> = {}): Promise<QualityOption[]> {
  try {
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    if (!text.includes('#EXT-X-STREAM-INF')) return [];
    const lines = text.split(/\r?\n/);
    const variants: QualityOption[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      let streamUrl = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next.startsWith('#')) break;
        streamUrl = next;
        break;
      }
      if (!streamUrl) continue;
      const height = resMatch ? Number(resMatch[2]) : 0;
      let quality = 'Auto';
      if (height >= 2160) quality = '4K';
      else if (height >= 1080) quality = '1080p';
      else if (height >= 720) quality = '720p';
      else if (height >= 480) quality = '480p';
      else if (height >= 360) quality = '360p';
      else if (height > 0) quality = `${height}p`;
      variants.push({
        quality,
        url: new URL(streamUrl, url).toString(),
        bandwidth: bwMatch ? Number(bwMatch[1]) : undefined,
        width: resMatch ? Number(resMatch[1]) : undefined,
        height: resMatch ? Number(resMatch[2]) : undefined,
      });
    }
    return variants;
  } catch {
    return [];
  }
}

export async function getStreamQualityOptions(
  url: string,
  headers: Record<string, string> = {}
): Promise<QualityOption[]> {
  // Fast path: URL hints
  const hinted = guessQualityFromUrl(url);
  if (hinted.length > 0) return hinted;
  // Async fallback: parse master M3U8
  if (/\.m3u8(\?|$)/i.test(url)) {
    const variants = await fetchM3u8Variants(url, headers);
    if (variants.length > 0) return variants;
  }
  return [{ quality: 'HD', url }];
}

export async function loadNativeLiveTV(
  providerName: string,
  page: number = 1
): Promise<HomeSection[]> {
  const json = await CloudStreamModule.getMainPage(providerName, page);
  const obj = parseJson<{ provider: string; sections: any[] }>(json);
  return (obj.sections ?? []).map((sec: any) => ({
    name: sec.name,
    items: (sec.items ?? []).map((item: any) => ({
      provider: providerName,
      url: item.url ?? '',
      title: item.title ?? '',
      posterUrl: item.posterUrl ?? item.poster ?? null,
      type: 'live',
    })),
  }));
}

// ── In-memory LiveTV cache (instant provider switching) ────────────────────────
export interface LiveChannel {
  item: MediaItem;
  category: string;
}

const liveTvMemoryCache = new Map<
  string,
  { timestamp: number; channels: LiveChannel[]; categories: string[] }
>();
const LIVE_TV_MEMORY_TTL = 5 * 60 * 1000; // 5 minutes

function flattenSectionsToChannels(
  sections: HomeSection[]
): { channels: LiveChannel[]; categories: string[] } {
  const seen = new Set<string>();
  const channels: LiveChannel[] = [];
  const categorySet = new Set<string>();
  for (const sec of sections) {
    if (!sec.items) continue;
    if (sec.name) categorySet.add(sec.name);
    for (const item of sec.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      channels.push({ item, category: sec.name || 'General' });
    }
  }
  return { channels, categories: Array.from(categorySet).sort() };
}

export function clearLiveTVMemoryCache(): void {
  liveTvMemoryCache.clear();
}

/**
 * Returns the full LiveTV channel list for a provider.
 * Uses an in-memory cache for instant switching, falls back to AsyncStorage,
 * and finally fetches from network when needed.
 */
export async function getLiveTVChannels(
  providerName: string,
  force: boolean = false
): Promise<{ channels: LiveChannel[]; categories: string[] }> {
  const cacheKey = `@zuno_cache_v13_cinemeta_cat_LiveTV_prov_${providerName}_page_1`;
  const now = Date.now();

  // 1) In-memory hit
  if (!force) {
    const mem = liveTvMemoryCache.get(providerName);
    if (mem && now - mem.timestamp < LIVE_TV_MEMORY_TTL) {
      return { channels: mem.channels, categories: mem.categories };
    }
  }

  // 2) AsyncStorage hit (try fresh first, then expired as fallback)
  let sections: HomeSection[] | null = null;
  try {
    const settings = await getSettings();
    sections = await getCache<HomeSection[]>(cacheKey, settings.mainPageTtl);
  } catch (_) {}
  if (!sections) {
    sections = await getCache<HomeSection[]>(cacheKey, Infinity);
  }

  // 3) Network fetch
  if (!sections || sections.length === 0) {
    const m3uUrl = M3U_SOURCE_MAP[providerName];
    try {
      if (m3uUrl) {
        const resp = await fetch(m3uUrl);
        const text = await resp.text();
        sections = parseM3uToSections(text, providerName);
      } else {
        sections = await loadNativeLiveTV(providerName, 1);
      }
      // Persist for next cold start (background)
      if (sections && sections.length > 0) {
        setCache(cacheKey, sections).catch(() => {});
      }
    } catch (e) {
      // Last resort: return whatever AsyncStorage had, even empty
      sections = sections || [];
    }
  }

  const { channels, categories } = flattenSectionsToChannels(sections);

  // Save in memory for next switch
  liveTvMemoryCache.set(providerName, {
    timestamp: now,
    channels,
    categories,
  });

  return { channels, categories };
}

export async function peekMainPageCache(
  category: string,
  providerName: string = '',
  page: number = 1
): Promise<HomeSection[] | null> {
  const cacheKey = category === 'LiveTV'
    ? `@zuno_cache_v13_cinemeta_cat_${category}_prov_${providerName || 'Jio TV'}_page_${page}`
    : `@zuno_cache_v13_cinemeta_cat_${category}_page_${page}`;
  try {
    const settings = await getSettings();
    return await getCache<HomeSection[]>(cacheKey, settings.mainPageTtl);
  } catch {
    return null;
  }
}

export async function getMainPage(
  providerName: string,
  page: number = 1,
  forceRefresh: boolean = false,
  category: string = 'Trending'
): Promise<HomeSection[]> {
  const cacheKey = category === 'LiveTV'
    ? `@zuno_cache_v13_cinemeta_cat_${category}_prov_${providerName || 'Jio TV'}_page_${page}`
    : `@zuno_cache_v13_cinemeta_cat_${category}_page_${page}`;

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
    if (expiredCached && expiredCached.length > 0) {
      return expiredCached;
    }
    throw err;
  }

  if (category === 'LiveTV') {
    if (providerName === 'USA TV Next') {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/yowmamasita/usa-tv-next/main/catalog/tv/all.json');
        const catalog = await resp.json();

        // Group by genre
        const sectionsMap = new Map<string, any[]>();
        (catalog.metas ?? []).forEach((meta: any) => {
          const mainGenre = meta.genre || 'Local';
          if (!sectionsMap.has(mainGenre)) {
            sectionsMap.set(mainGenre, []);
          }
          sectionsMap.get(mainGenre)!.push({
            provider: 'USA TV Next',
            url: JSON.stringify({ id: meta.id, streams: meta.streams }),
            title: meta.name ?? 'Unknown Channel',
            posterUrl: meta.logo ?? null,
            type: 'live'
          });
        });

        const resultSections = Array.from(sectionsMap.entries()).map(([name, items]) => ({
          name,
          items
        }));

        await setCache(cacheKey, resultSections);
        return resultSections;
      } catch (err) {
        console.warn(`Failed to fetch USA TV Next catalog:`, err);
        return [];
      }
    }

    const m3uUrl = M3U_SOURCE_MAP[providerName];
    if (m3uUrl) {
      try {
        const resp = await fetch(m3uUrl);
        const text = await resp.text();
        const sections = parseM3uToSections(text, providerName);
        await setCache(cacheKey, sections);
        return sections;
      } catch (err) {
        console.warn(`Failed to fetch ${providerName} M3U:`, err);
        return [];
      }
    }

    try {
      const targetProvider = providerName || 'Jio TV';
      const resultSections = await loadNativeLiveTV(targetProvider, page);

      // Log the list of loaded channels to the console
      console.log(`[LiveTV Debug] Loaded ${resultSections.length} sections from plugin "${targetProvider}":`);
      resultSections.forEach((sec, idx) => {
        console.log(`  Section [${idx}]: "${sec.name}" (${sec.items?.length ?? 0} channels)`);
        sec.items?.forEach((item: any, itemIdx: number) => {
          if (itemIdx < 5) {
            console.log(`    - Channel [${itemIdx}]: "${item.title}" | URL: ${item.url}`);
          }
        });
        if (sec.items && sec.items.length > 5) {
          console.log(`    - ... and ${sec.items.length - 5} more channels`);
        }
      });

      await setCache(cacheKey, resultSections);
      return resultSections;
    } catch (err) {
      console.warn(`Failed to load LiveTV sections for ${providerName}:`, err);
      return [];
    }
  }

  let urls: { name: string; url: string }[] = [];
  switch (category) {
    case 'Trending':
      urls = [
        { name: 'New & Latest Releases', url: 'NEW_MOVIES' },
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
    case 'Movies':
      urls = [
        { name: 'New Movies', url: 'NEW_MOVIES' },
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
        { name: 'New Series', url: 'NEW_SERIES' },
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
    case 'Cartoon':
      urls = [
        { name: 'New Cartoons', url: 'NEW_MOVIES' },
        { name: 'Animated Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Animation.json' },
        { name: 'Animated Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Animation.json' },
        { name: 'Kids & Family', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Family.json' },
        { name: 'Fantasy Cartoons', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Fantasy.json' },
        { name: 'Adventure Cartoons', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Adventure.json' },
      ];
      break;
    case 'Anime':
      urls = [
        { name: 'New Anime Releases', url: 'NEW_SERIES' },
        { name: 'Popular Anime Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top/genre=Anime.json' },
        { name: 'Trending Anime Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Anime.json' },
        { name: 'Highly Rated Anime', url: 'https://v3-cinemeta.strem.io/catalog/series/imdbRating/genre=Anime.json' },
      ];
      break;
    case 'English':
      urls = [
        { name: 'New English Movies', url: 'NEW_MOVIES' },
        { name: 'New English TV Series', url: 'NEW_SERIES' },
        { name: 'Popular English Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Popular English Series', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
        { name: 'Hollywood Action Hits', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Action.json' },
        { name: 'Hollywood Thrillers', url: 'https://v3-cinemeta.strem.io/catalog/movie/top/genre=Thriller.json' },
      ];
      break;
    case 'Hindi':
      urls = [
        { name: 'New Movies', url: 'https://indian-regional-catalog.vercel.app/catalog/movie/hi.json' },
        { name: 'New Series', url: 'https://indian-regional-catalog.vercel.app/catalog/series/hi_series.json' },
      ];
      break;
    case 'Punjabi':
      urls = [
        { name: 'New Movies', url: 'https://indian-regional-catalog.vercel.app/catalog/movie/pa.json' },
        { name: 'New Series', url: 'https://indian-regional-catalog.vercel.app/catalog/series/pa_series.json' },
      ];
      break;
    default:
      urls = [
        { name: 'Trending Movies', url: 'https://v3-cinemeta.strem.io/catalog/movie/top.json' },
        { name: 'Trending TV Shows', url: 'https://v3-cinemeta.strem.io/catalog/series/top.json' },
      ];
  }

  const animeIds = await getAnimeImdbIds();

  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        let items: any[] = [];
        if (u.url === 'NEW_MOVIES') {
          items = await fetchNewMoviesHelper();
        } else if (u.url === 'NEW_SERIES') {
          items = await fetchNewSeriesHelper();
        } else if (u.url === 'HINDI_MOVIES' || u.url === 'NEW_HINDI') {
          items = await fetchHindiMoviesHelper();
        } else if (u.url === 'HINDI_SERIES') {
          items = await fetchHindiSeriesHelper();
        } else if (u.url === 'PUNJABI_MOVIES' || u.url === 'NEW_PUNJABI') {
          items = await fetchPunjabiMoviesHelper();
        } else if (u.url === 'PUNJABI_SERIES') {
          items = await fetchPunjabiSeriesHelper();
        } else {
          const response = await fetch(u.url);
          const json = await response.json();
          items = (json.metas ?? []).map((m: any) => {
            const rawId = m.id || '';
            const cleanId = rawId.includes('||') ? rawId.split('||')[0] : rawId;
            const itemType = m.type || (u.url.includes('/series/') ? 'series' : 'movie');
            return {
              provider: 'Cinemeta',
              url: `${itemType}/${cleanId}`,
              title: m.name ?? '',
              posterUrl: getCleanPosterUrl(m.poster, cleanId),
              type: itemType,
              genres: m.genres ?? [],
            };
          });
        }

        if (category === 'Cartoon') {
          items = items.filter((item: any) => {
            const hasAnimationGenre = item.genres.includes('Animation');
            const imdbId = item.url.split('/')[1];
            const isAnimeItem = animeIds.has(imdbId);
            return hasAnimationGenre && !isAnimeItem;
          });
        }

        if (category === 'Anime') {
          items = items.filter((item: any) => {
            const imdbId = item.url.split('/')[1];
            return animeIds.has(imdbId);
          });
        }

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

export async function peekDetailCache(
  providerName: string,
  url: string
): Promise<DetailResult | null> {
  const parts = url.split('/');
  const type = parts.length > 1 ? parts[0] : 'movie';
  const id = parts.length > 1 ? parts[1] : url;
  const isCinemeta = providerName === 'Cinemeta';
  const cacheKey = isCinemeta
    ? `@zuno_cache_detail_cinemeta_${type}_${id}`
    : `@zuno_cache_detail_${providerName}_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  try {
    const settings = await getSettings();
    return await getCache<DetailResult>(cacheKey, settings.detailsTtl);
  } catch {
    return null;
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

  const isCinemeta = providerName === 'Cinemeta';
  const cacheKey = isCinemeta
    ? `@zuno_cache_detail_cinemeta_${type}_${id}`
    : `@zuno_cache_detail_${providerName}_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;

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

  if (!isCinemeta) {
    const json = await CloudStreamModule.loadDetail(providerName, url);
    const obj = parseJson<any>(json);
    if (!obj || (!obj.title && !obj.name)) {
      throw new Error(`Failed to load details from provider ${providerName}`);
    }

    const episodesList: EpisodeItem[] = [];
    if (obj.episodes && obj.episodes.length > 0) {
      obj.episodes.forEach((e: any, idx: number) => {
        episodesList.push({
          episode: e.episode ?? (idx + 1),
          label: e.name || e.title || `Episode ${e.episode ?? (idx + 1)}`,
          mediaRef: e.mediaRef ?? e.url ?? url,
          image: e.image || obj.posterUrl || obj.poster || null,
          season: e.season ?? 1,
          overview: e.description ?? '',
        });
      });
    } else {
      episodesList.push({
        episode: 1,
        label: obj.title || obj.name,
        mediaRef: url,
        image: obj.posterUrl || obj.poster || null,
        season: 1,
        overview: obj.description ?? '',
      });
    }

    const data: DetailResult = {
      provider: providerName,
      url: url,
      title: obj.title || obj.name || '',
      description: obj.description ?? null,
      posterUrl: obj.posterUrl || obj.poster || null,
      banner: obj.banner ?? obj.posterUrl ?? obj.poster ?? null,
      year: obj.year ? (Number(obj.year) || null) : null,
      isSerial: obj.isSerial === true,
      episodes: episodesList,
      score: obj.score ?? null,
      tags: obj.tags ?? [],
      duration: obj.duration ?? null,
      comingSoon: obj.comingSoon === true,
      contentRating: obj.contentRating ?? null,
      logoUrl: obj.logoUrl ?? null,
      imdbId: obj.imdbId || id || null,
      cast: (obj.cast ?? []).map((c: any) => ({
        name: c.name ?? '',
        image: c.image ?? null,
        role: c.role ?? null,
      })),
      recommendations: [],
      trailers: [],
    };

    await setCache(cacheKey, data);
    return data;
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
      // TVmaze not reachable ,  keep Cinemeta's 3 names as fallback
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
      // TMDB not reachable ,  keep Cinemeta cast as fallback
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
  onAllDone?: () => void,
  force: boolean = false
): Promise<LinksResult> {
  const cacheKey = `${providerName}:${data}`;
  const now = Date.now();
  const cached = linksCache.get(cacheKey);

  if (!force && cached && now - cached.timestamp < currentLinksTtl) {
    console.log(`[Cache Hit - Synced] Returning cached playback links for ${cacheKey}`);
    onAllDone?.(); // Signal that we're done so loading indicator clears
    return cached.result;
  }

  await ensureOnline();
  const settings = await getSettings();
  if (!force && cached && now - cached.timestamp < settings.linksTtl) {
    console.log(`[Cache Hit] Returning cached playback links for ${cacheKey}`);
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

  if (providerName === 'USA TV Next') {
    try {
      const parsed = JSON.parse(data);
      const streams = parsed.streams ?? [];
      const sources = streams.map((s: any) => ({
        quality: s.name || "HD",
        url: s.url,
        type: "hls",
        headers: {},
        provider: "USA TV Next",
        host: s.description || "USA TV Next"
      }));
      const result: LinksResult = {
        sources,
        subtitles: []
      };

      linksCache.set(cacheKey, { timestamp: now, result });
      onAllDone?.();
      return result;
    } catch (err) {
      console.warn("Failed to parse USA TV Next streams:", err);
      throw new Error("No playable sources found");
    }
  }

  if (M3U_SOURCE_MAP[providerName]) {
    try {
      const parsed = JSON.parse(data);
      const url: string = parsed.url;
      const title: string = parsed.title ?? 'Channel';
      const headers: Record<string, string> = parsed.headers ?? {};
      if (!url) throw new Error('Missing stream URL');

      const sources = [
        {
          quality: 'HD',
          url,
          type: 'hls',
          headers,
          provider: providerName,
          host: providerName,
        },
      ];

      const result: LinksResult = { sources, subtitles: [] };
      linksCache.set(cacheKey, { timestamp: now, result });
      onAllDone?.();
      return result;
    } catch (err) {
      console.warn(`Failed to parse ${providerName} stream:`, err);
      throw new Error('No playable sources found');
    }
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

/**
 * Cache-first link loader: returns any cached links immediately, then fires a
 * background refresh using `force = true` so the user sees links instantly
 * while still checking for newer ones. Callbacks (progress / source found /
 * onAllDone) are wired to the background refresh only — the cached snapshot
 * is delivered synchronously through the returned Promise.
 */
export async function loadLinksCacheThenRefresh(
  providerName: string,
  data: string,
  onProgress?: (progress: PlaybackProgress[]) => void,
  onSourceFound?: (source: VideoSource) => void,
  onAllDone?: () => void,
): Promise<LinksResult> {
  const cacheKey = `${providerName}:${data}`;
  const hadCache = hasCachedLinks(providerName, data);

  // Always return cached result first (may be empty array if no cache exists)
  const initial = await loadLinks(providerName, data, undefined, undefined, undefined, false);

  if (hadCache) {
    // Fire a background refresh with the same callbacks. The refresh will write
    // to the same cache key so the next call sees the updated snapshot.
    setTimeout(() => {
      loadLinks(providerName, data, onProgress, onSourceFound, onAllDone, true).catch((e) => {
        console.warn(`[loadLinksCacheThenRefresh] Background refresh failed for ${cacheKey}:`, e?.message || e);
        onAllDone?.();
      });
    }, 350);
  } else {
    // No cache → behave like a normal loadLinks (forward callbacks)
    return loadLinks(providerName, data, onProgress, onSourceFound, onAllDone, false);
  }

  return initial;
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
    console.log(`[ZunoPlugin][ADDON_FETCH] Fetching ${addonName} stream URL: '${url}'`);
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Stremio/4.4.168' } }, 12000);
    if (!res.ok) {
      console.warn(`[ZunoPlugin] ${addonName} fetch failed with HTTP status ${res.status} for URL: '${url}'`);
      return [];
    }
    const text = await res.text();
    if (!text.trim().startsWith('{')) {
      console.warn(`[ZunoPlugin] ${addonName} returned non-JSON response for URL: '${url}': ${text.slice(0, 100)}`);
      return [];
    }
    const json = JSON.parse(text);
    if (!json.streams) {
      console.log(`[ZunoPlugin] ${addonName} returned 0 streams array for URL: '${url}'`);
      return [];
    }
    console.log(`[ZunoPlugin] ${addonName} returned ${json.streams.length} streams for URL: '${url}'`);
    
    return json.streams.map((stream: any) => {
      let isTorrent = false;
      let streamUrl = '';
      let type = 'direct';
      let seeders = 0;

      const activeTrackers = [
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://tracker.cyberia.is:6969/announce",
        "udp://ipv4.tracker.harry.lu:80/announce",
        "udp://valukas.io:6969/announce",
        "udp://tracker.tiny-vps.com:6969/announce",
        "udp://tracker.moeking.me:6969/announce",
        "udp://opentracker.i2p.rocks:6969/announce",
        "http://tracker.gbitt.info:80/announce",
        "udp://9.rarbg.com:2710/announce",
        "udp://explodie.org:6969/announce"
      ];

      const appendTrackers = (magnetUrl: string): string => {
        let cleanUrl = magnetUrl;
        activeTrackers.forEach(tr => {
          if (!cleanUrl.includes(encodeURIComponent(tr)) && !cleanUrl.includes(tr)) {
            cleanUrl += `&tr=${encodeURIComponent(tr)}`;
          }
        });
        return cleanUrl;
      };

      if (stream.infoHash) {
        streamUrl = `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(stream.title?.split('\n')[0] || 'Torrent')}`;
        streamUrl = appendTrackers(streamUrl);
        isTorrent = true;
        type = 'torrent';
      } else if (stream.url && stream.url.startsWith('magnet:')) {
        streamUrl = appendTrackers(stream.url);
        isTorrent = true;
        type = 'torrent';
      } else if (stream.url && (stream.url.startsWith('http://') || stream.url.startsWith('https://'))) {
        streamUrl = stream.url;
        isTorrent = false;
        type = stream.url.includes('.m3u8') ? 'hls' : 'direct';
      }

      if (!streamUrl) return null;

      const titleText = stream.title || '';
      
      if (isTorrent) {
        // Extract seeders count
        const emojiMatch = titleText.match(/👤\s*(\d+)/);
        if (emojiMatch) {
          seeders = parseInt(emojiMatch[1], 10);
        } else {
          const numberBeforeMatch = titleText.match(/(\d+)\s*(?:seeders|seeds|seed)\b/i);
          if (numberBeforeMatch) {
            seeders = parseInt(numberBeforeMatch[1], 10);
          } else {
            const labelBeforeMatch = titleText.match(/(?:seeders|seeds|seed|s):\s*(\d+)/i);
            if (labelBeforeMatch) {
              seeders = parseInt(labelBeforeMatch[1], 10);
            } else {
              const sMatch = titleText.match(/\bS\s*:\s*(\d+)/i);
              if (sMatch) {
                seeders = parseInt(sMatch[1], 10);
              }
            }
          }
        }

        // Filter out weak/dead links (fewer than 3 seeders)
        const hasSeedersInfo = titleText.includes('👤') || /seeders|seeds|seed/i.test(titleText) || /\bS:\s*\d+/i.test(titleText);
        if (hasSeedersInfo && seeders < 3) {
          return null; // Too few seeders ,  likely dead, discard
        }
      }

      const qualityMatch = stream.name?.match(/(1080p|720p|2160p|480p)/i);
      const quality = qualityMatch ? qualityMatch[0] : '720p';
      
      const parts = titleText.split('\n') || [];
      const behaviorFilename = stream.behaviorHints?.filename || '';
      let fileName = '';
      if (behaviorFilename && behaviorFilename.trim()) {
        fileName = behaviorFilename.trim();
      } else {
        fileName = parts[0]?.trim() || stream.name || 'Direct Link';
      }
      const stats = parts[1] || '';

      return {
        quality: isTorrent ? `${quality} (${stats.trim() || 'Torrent'})` : `${quality} (Direct Link)`,
        url: streamUrl,
        type: type,
        headers: stream.behaviorHints?.proxyHeaders?.request ?? {},
        provider: addonName,
        host: fileName,
        seeders: isTorrent ? seeders : 99999 // Put direct links first in sorting
      };
    }).filter((s: any) => s !== null);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.log(`[ZunoPlugin][ADDON_FETCH_ERROR] ${addonName} (${url}): ${msg}`);
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
  
  const isLiveTv = (pName: string, types?: string[]): boolean => {
    if (!pName) return false;
    const n = pName.toLowerCase();
    if (
      n.includes('iptv') ||
      n.includes('cloudplay') ||
      n.includes('livetv') ||
      n === 'quickiptv' ||
      n === 'publicsportsiptv'
    ) return true;
    if (types && types.length > 0) {
      const t = types.map(x => x.toLowerCase());
      const isLive = t.includes('live') || t.includes('livetv');
      const hasMedia = t.some(x => ['movie', 'tvseries', 'series', 'anime', 'asiandrama', 'cartoon'].includes(x));
      if (isLive && !hasMedia) return true;
    }
    return false;
  };

  const providers = allProviders.filter(p => p.hasSearch !== false && !isLiveTv(p.name, p.types));
  
  let rawTorrentioUrl = 'https://torrentio.strem.fun';
  let rawCometUrl = 'https://comet.feels.legal';
  try {
    const savedTorrentio = await AsyncStorage.getItem('@torrentio_url');
    if (savedTorrentio && savedTorrentio.trim()) {
      rawTorrentioUrl = savedTorrentio;
    }
    const savedComet = await AsyncStorage.getItem('@comet_url');
    if (savedComet && savedComet.trim()) {
      rawCometUrl = savedComet;
    }
  } catch (e) {
    console.warn('Failed to load custom addon URLs from storage:', e);
  }

  const normalizeAddonUrl = (url: string, defaultUrl: string): string => {
    if (!url || !url.trim()) return defaultUrl;
    let clean = url.trim().replace(/^stremio:\/\//i, 'https://');
    if (clean.endsWith('/manifest.json')) {
      clean = clean.substring(0, clean.length - '/manifest.json'.length);
    }
    if (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    return clean;
  };

  const torrentioUrl = normalizeAddonUrl(rawTorrentioUrl, 'https://torrentio.strem.fun');
  const cometUrl = normalizeAddonUrl(rawCometUrl, 'https://comet.feels.legal');

  const addons = [
    { name: 'Torrentio', url: torrentioUrl },
    { name: 'Comet', url: cometUrl },
    { name: 'KnightCrawler', url: 'https://main.knightcrawler.elfhosted.com' },
    { name: 'MediaFusion', url: 'https://mediafusion.elfhosted.com' }
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
      // Full subset ,  score based on how much of the larger title is covered
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
    // No cross-provider dedup ,  each provider keeps all its sources.
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
        progressList[idx].linksCount = sources.length; // No cross-provider dedup ,  each provider keeps all its sources
        onProgress([...progressList]);

        // Push all sources without cross-provider dedup ,  same URL from different providers are kept separate
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
        // We have sources ,  resolve immediately to show them
        promiseResolved = true;
        console.log(`[ZunoPlugin][RESOLVED_SOURCES] Resolving links promise. Sources found: ${finalSources.length}`);
        const uniqueSubs = Array.from(new Map(finalSubtitles.map(s => [s.url, s])).values());
        resolve({
          sources: [...finalSources],
          subtitles: uniqueSubs,
        });
        // Don't null out activeSourceCallback here ,  keep feeding any
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
  allSources?: VideoSource[],
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
  provider?: string,
  detailUrl?: string,
  isTorrentStream?: boolean,
  channelsJson?: string,
  currentChannelIndex?: number,
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
    provider ?? 'Cinemeta',
    detailUrl ?? '',
    isTorrentStream ?? false,
    channelsJson ?? '',
    currentChannelIndex ?? -1,
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
  const res = await CloudStreamModule.startTorrentStream(magnetUrl);
  return typeof res === "string" ? JSON.parse(res) : res;
}

export async function stopTorrentStream(): Promise<boolean> {
  return await CloudStreamModule.stopTorrentStream();
}

export async function getTorrentStatus(): Promise<TorrentStatus> {
  const res = await CloudStreamModule.getTorrentStatus();
  return typeof res === "string" ? JSON.parse(res) : res;
}

export function lockLandscape() {
  if (CloudStreamModule?.lockLandscape) {
    CloudStreamModule.lockLandscape();
  }
}

export function lockPortrait() {
  if (CloudStreamModule?.lockPortrait) {
    CloudStreamModule.lockPortrait();
  }
}

export function unlockOrientation() {
  if (CloudStreamModule?.unlockOrientation) {
    CloudStreamModule.unlockOrientation();
  }
}

export function setScreenBrightness(brightness: number) {
  if (CloudStreamModule?.setScreenBrightness) {
    CloudStreamModule.setScreenBrightness(brightness);
  }
}

export function enterImmersiveMode() {
  if (CloudStreamModule?.enterImmersiveMode) {
    CloudStreamModule.enterImmersiveMode();
  }
}

export function exitImmersiveMode() {
  if (CloudStreamModule?.exitImmersiveMode) {
    CloudStreamModule.exitImmersiveMode();
  }
}

export async function getSystemVolume(): Promise<number> {
  if (CloudStreamModule?.getSystemVolume) {
    return await CloudStreamModule.getSystemVolume();
  }
  return 1.0;
}

export function setSystemVolume(volume: number) {
  if (CloudStreamModule?.setSystemVolume) {
    CloudStreamModule.setSystemVolume(volume);
  }
}

export function playInExternalPlayer(url: string, mimeType: string | null, title: string | null, headersJson: string | null = null) {
  if (CloudStreamModule?.playInExternalPlayer) {
    CloudStreamModule.playInExternalPlayer(url, mimeType, title, headersJson);
  }
}

let cachedAnimeIds = new Set<string>();

export async function getAnimeImdbIds(): Promise<Set<string>> {
  if (cachedAnimeIds.size > 0) {
    return cachedAnimeIds;
  }
  try {
    const [seriesRes, moviesRes] = await Promise.all([
      fetch('https://v3-cinemeta.strem.io/catalog/series/top/genre=Anime.json').then(r => r.json()).catch(() => ({ metas: [] })),
      fetch('https://v3-cinemeta.strem.io/catalog/movie/top/genre=Anime.json').then(r => r.json()).catch(() => ({ metas: [] })),
    ]);
    (seriesRes?.metas || []).forEach((m: any) => {
      const id = m.imdb_id || m.id;
      if (id) cachedAnimeIds.add(id);
    });
    (moviesRes?.metas || []).forEach((m: any) => {
      const id = m.imdb_id || m.id;
      if (id) cachedAnimeIds.add(id);
    });
  } catch (_) {}
  return cachedAnimeIds;
}

export async function getSavedChannels(): Promise<MediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem('@zuno_saved_channels');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveChannel(item: MediaItem): Promise<MediaItem[]> {
  try {
    const list = await getSavedChannels();
    if (!list.some(x => x.url === item.url)) {
      list.push(item);
      await AsyncStorage.setItem('@zuno_saved_channels', JSON.stringify(list));
    }
    return list;
  } catch {
    return [];
  }
}

export async function removeSavedChannel(url: string): Promise<MediaItem[]> {
  try {
    const list = await getSavedChannels();
    const filtered = list.filter(x => x.url !== url);
    await AsyncStorage.setItem('@zuno_saved_channels', JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}
