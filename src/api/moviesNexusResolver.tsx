import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { VideoSource } from '../types/plugin';

const TMDB_API_KEY = 'c9a3df4e3bc49ffe6c553f0bea05e99b';
const MOVIES_NEXUS_BASE = 'https://www.moviesnexus.fun';

interface MoviesNexusServer {
  id: string;
  name: string;
  url: string;
  audioTracks?: { label: string; url: string }[];
  type?: 'direct' | 'hls';
}

const tmdbIdCache = new Map<string, { id: number; type: 'movie' | 'tv'; timestamp: number }>();
const TMDB_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getTmdbIdFromImdb(
  imdbId: string,
  type: 'movie' | 'tv'
): Promise<number | null> {
  if (!imdbId || !imdbId.startsWith('tt')) return null;
  const cached = tmdbIdCache.get(imdbId);
  if (cached && Date.now() - cached.timestamp < TMDB_CACHE_TTL && cached.type === type) {
    return cached.id;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const list = type === 'movie' ? data.movie_results : data.tv_results;
    const match = list?.[0];
    if (match?.id) {
      tmdbIdCache.set(imdbId, { id: match.id, type, timestamp: Date.now() });
      return match.id;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildPageUrl(
  tmdbId: number,
  isSerial: boolean,
  season: number,
  episode: number
): string {
  if (isSerial) {
    return `${MOVIES_NEXUS_BASE}/tv/${tmdbId}/${season}/${episode}`;
  }
  return `${MOVIES_NEXUS_BASE}/movie/${tmdbId}`;
}

export function parseNexusServer(server: MoviesNexusServer): VideoSource[] {
  const results: VideoSource[] = [];
  const qualityLabel = server.name || 'MoviesNexus';
  const isM3u8 = server.type === 'hls' || /\.m3u8(\?|$)/i.test(server.url);

  results.push({
    quality: qualityLabel,
    url: server.url,
    type: isM3u8 ? 'hls' : 'http',
    headers: { Referer: `${MOVIES_NEXUS_BASE}/`, Origin: MOVIES_NEXUS_BASE },
    provider: 'MoviesNexus',
    host: 'MoviesNexus',
  });

  if (server.audioTracks && server.audioTracks.length > 0) {
    for (const track of server.audioTracks) {
      if (!track.url) continue;
      results.push({
        quality: `${qualityLabel} · ${track.label}`,
        url: track.url,
        type: 'http',
        headers: { Referer: `${MOVIES_NEXUS_BASE}/`, Origin: MOVIES_NEXUS_BASE },
        provider: 'MoviesNexus',
        host: 'MoviesNexus Audio',
      });
    }
  }

  return results;
}

const INJECT_JS = `
(function() {
  function post(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }

  function handleServers(parsed) {
    if (parsed && parsed.servers) {
      post({ type: 'servers', data: parsed });
      return true;
    }
    return false;
  }

  function tryExtract() {
    try {
      if (window.__rawExtractBody) {
        try {
          var parsed = JSON.parse(window.__rawExtractBody);
          if (handleServers(parsed)) return true;
        } catch (e) {}
      }
    } catch (err) {
      post({ type: 'error', error: String(err) });
    }
    return false;
  }

  (function() {
    var origFetch = window.fetch;
    if (!origFetch) return;
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url && url.indexOf && url.indexOf('/api/extract') !== -1) {
        return origFetch.apply(this, arguments).then(function(resp) {
          try {
            var cloned = resp.clone();
            cloned.text().then(function(txt) {
              window.__rawExtractBody = txt;
              tryExtract();
            }).catch(function(){});
          } catch (e) {}
          return resp;
        });
      }
      return origFetch.apply(this, arguments);
    };

    if (window.XMLHttpRequest) {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__url = url;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        var url = this.__url;
        if (url && url.indexOf && url.indexOf('/api/extract') !== -1) {
          this.addEventListener('load', function() {
            try {
              window.__rawExtractBody = this.responseText;
              tryExtract();
            } catch (e) {}
          });
        }
        return origSend.apply(this, arguments);
      };
    }
  })();

  // MoviesNexus player broadcasts server lists via window.postMessage.
  // Re-broadcast them to the React Native side so we can pick them up
  // even if /api/extract traffic is hidden behind their Next.js server action.
  window.addEventListener('message', function(event) {
    try {
      var d = event && event.data;
      if (!d) return;
      if (d.type === 'MOVIE_NEXUS_SERVERS' && d.servers) {
        handleServers({ servers: d.servers });
        return;
      }
      // Sometimes the player embeds the server list under a different key
      if (d.servers && Array.isArray(d.servers)) {
        handleServers({ servers: d.servers });
      }
    } catch (e) {}
  });

  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    if (tryExtract() || attempts > 30) {
      clearInterval(interval);
    }
  }, 1000);
})();
true;
`;

export interface MoviesNexusResolverHandle {
  sources: VideoSource[];
  failed: boolean;
  done: boolean;
}

interface MoviesNexusWebViewProps {
  pageUrl: string;
  enabled: boolean;
  onSources: (sources: VideoSource[]) => void;
  onDone: () => void;
  timeoutMs?: number;
}

export const MoviesNexusWebView: React.FC<MoviesNexusWebViewProps> = ({
  pageUrl,
  enabled,
  onSources,
  onDone,
  timeoutMs = 30000,
}) => {
  const webViewRef = useRef<WebView | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    }, timeoutMs);
    return () => clearTimeout(t);
  }, [enabled, onDone, timeoutMs]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (doneRef.current) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      let servers: MoviesNexusServer[] | null = null;

      if (data?.type === 'servers' && data.data?.servers) {
        servers = data.data.servers;
      } else if (data?.type === 'MOVIE_NEXUS_SERVERS' && Array.isArray(data.servers)) {
        servers = data.servers;
      } else if (Array.isArray(data?.servers)) {
        servers = data.servers;
      }

      if (servers && servers.length > 0) {
        const allSources: VideoSource[] = [];
        for (const s of servers) {
          allSources.push(...parseNexusServer(s));
        }
        onSources(allSources);
        doneRef.current = true;
        onDone();
      } else if (data?.type === 'error') {
        doneRef.current = true;
        onDone();
      }
    } catch {
      // ignore malformed
    }
  };

  if (!enabled || !pageUrl) return null;

  return (
    <View style={{ height: 1, width: 1, opacity: 0, position: 'absolute', top: -9999, left: -9999 }}>
      <WebView
        ref={webViewRef}
        source={{ uri: pageUrl }}
        injectedJavaScript={INJECT_JS}
        onMessage={handleMessage}
        style={{ height: 1, width: 1, opacity: 0 }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        thirdPartyCookiesEnabled
        userAgent="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
      />
    </View>
  );
};

export async function probeMoviesNexus(
  imdbId: string,
  isSerial: boolean,
  season: number,
  episode: number
): Promise<{ tmdbId: number | null; pageUrl: string | null }> {
  const tmdbId = await getTmdbIdFromImdb(imdbId, isSerial ? 'tv' : 'movie');
  if (!tmdbId) return { tmdbId: null, pageUrl: null };
  return { tmdbId, pageUrl: buildPageUrl(tmdbId, isSerial, season, episode) };
}