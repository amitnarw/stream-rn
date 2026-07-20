import { VideoSource } from "../types/plugin";

export function getHighQualityImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;

  // 1. Metahub images - upgrade medium/small to large
  if (url.includes("images.metahub.space")) {
    return url.replace("/medium/", "/large/").replace("/small/", "/large/");
  }

  // 2. TMDB images - upgrade any size (e.g. w500, w300_and_h450_bestv2) to w1280
  if (url.includes("image.tmdb.org/t/p/")) {
    return url.replace(/\/t\/p\/[^/]+\//, "/t/p/w1280/");
  }

  // 3. IMDb / Amazon images - remove cropping and upgrade size
  if (
    url.includes("media-amazon.com/images/") ||
    url.includes("m.media-amazon.com/")
  ) {
    const index = url.indexOf("._V1_");
    if (index !== -1) {
      return url.substring(0, index) + "._V1_SX1080_.jpg";
    }
  }

  // 4. YTS images - upgrade from medium to large cover
  if (url.includes("yts.mx/assets/images/movies/")) {
    return url.replace("medium-cover.jpg", "large-cover.jpg");
  }

  return url;
}

/** Returns true if the raw error string looks like an ISP/network-level block */
export function isIspBlock(err: string | undefined): boolean {
  if (!err) return false;
  const e = err.toLowerCase();
  return (
    e.includes("unresolvedaddress") ||
    e.includes("unknownhost") ||
    e.includes("dns blocked") ||
    e.includes("isp block") ||
    e.includes("sockettimeoutexception") ||
    e.includes("connect") ||
    e.includes("timeout")
  );
}

export function cleanErrorMessage(err: string | undefined): string {
  if (!err) return "";
  const e = err.toLowerCase();
  if (
    e.includes("sockettimeoutexception") ||
    e.includes("timeout") ||
    e.includes("connect")
  ) {
    return "Blocked or unreachable";
  }
  if (
    e.includes("illegalargumentexception") ||
    e.includes("json") ||
    e.includes("nullpointer")
  ) {
    return "Server responded incorrectly";
  }
  if (
    e.includes("unresolvedaddress") ||
    e.includes("unknownhost") ||
    e.includes("dns")
  ) {
    return "Blocked by your network";
  }
  return "Failed to load links";
}

export function cleanTorrentError(err: string | undefined): string {
  if (!err) return "Torrent failed to start.";
  const e = err.toLowerCase();
  if (
    e.includes("metadata resolution timed out") ||
    e.includes("no peers found") ||
    e.includes("bad magnet")
  ) {
    return "No seeders found\u002c this torrent link may be dead. Try a different source.";
  }
  if (e.includes("failed to add torrent handle")) {
    return "Could not start the torrent download. Try again.";
  }
  if (e.includes("no files found")) {
    return "Torrent has no playable video files.";
  }
  if (e.includes("network") || e.includes("connection")) {
    return "Network error while starting torrent. Check your connection.";
  }
  return "Torrent failed to start. Try a different source.";
}

export function getQualityBadgeBg(quality: string) {
  const q = quality.toLowerCase();
  if (q.includes("4k") || q.includes("2160")) return "#ff4a7d";
  if (q.includes("1080")) return "#0047FF";
  if (q.includes("720")) return "#2ecc71";
  if (q.includes("480") || q.includes("360")) return "#f39c12";
  return "rgba(255, 255, 255, 0.08)";
}

export function getDomain(url: string) {
  try {
    const domain = url.match(
      /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im,
    );
    return domain ? domain[1] : "";
  } catch {
    return "";
  }
}

export function getProtocolLabel(type: string, url: string) {
  const t = type.toLowerCase();
  if (t === "hls" || url.includes(".m3u8")) return "M3U8";
  if (t === "torrent" || url.startsWith("magnet:")) return "TORRENT";
  if (t === "dash" || url.includes(".mpd")) return "DASH";
  return "DIRECT";
}

export function getCleanHostName(s: VideoSource) {
  const quality = s.quality || "";
  const host = s.host || "";
  let baseName = host || quality || "Direct";

  const separators = [/ • /, / · /, / - /, / \| /];
  for (const sep of separators) {
    if (sep.test(baseName)) {
      const parts = baseName.split(sep);
      const nonResolutionPart = parts.find(
        (p: string) => !/(?:2160|1080|720|480|360|4k|hd|sd)/i.test(p),
      );
      if (nonResolutionPart) {
        baseName = nonResolutionPart.trim();
        break;
      }
    }
  }

  baseName = baseName
    .replace(/\[?\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes)\]?/gi, "")
    .trim();
  baseName = baseName
    .replace(
      /\[(?:bluray|hdr|dv|dolby|hevc|x265|x264|h264|h265|ddp\d|aac|atmos|dts|web-dl|webrip|hdrip|brrip|hdtv|internal)[^\]]*\]/gi,
      "",
    )
    .trim();
  baseName = baseName
    .replace(
      /\b(?:2160p|1080p|720p|480p|360p|4k|2160|1080|720|480|360)\b/gi,
      "",
    )
    .trim();
  baseName = baseName.replace(/\s+/g, " ").trim();

  return baseName || "Direct";
}

export function extractResolutionTag(s: VideoSource) {
  const textToSearch = `${s.quality} ${s.host || ""}`.toLowerCase();
  if (textToSearch.includes("4k") || textToSearch.includes("2160"))
    return "2160p";
  if (textToSearch.includes("1080")) return "1080p";
  if (textToSearch.includes("720")) return "720p";
  if (textToSearch.includes("480")) return "480p";
  if (textToSearch.includes("360")) return "360p";
  const match = textToSearch.match(/(\d+)(p|k|fps)/);
  return match ? `${match[1]}p` : "Auto";
}
