/**
 * Maps a wide range of language names / abbreviations to short display codes.
 * Torrentio / Stremio expose audio languages only inside the release title
 * string ,  there is no structured API field ,  so we parse the filename.
 */
export const LANG_CODES: Record<string, string> = {
  en: "EN", eng: "EN", english: "EN",
  hi: "HI", hin: "HI", hindi: "HI",
  ta: "TA", tam: "TA", tamil: "TA",
  te: "TE", tel: "TE", telugu: "TE",
  ml: "ML", mal: "ML", malayalam: "ML",
  kn: "KN", kan: "KN", kannada: "KN",
  pa: "PA", pan: "PA", punjabi: "PA",
  bn: "BN", ben: "BN", bengali: "BN", bangla: "BN",
  it: "IT", ita: "IT", ital: "IT", italian: "IT",
  fr: "FR", fre: "FR", french: "FR",
  de: "DE", ger: "DE", german: "DE",
  es: "ES", spa: "ES", spanish: "ES",
  pt: "PT", por: "PT", portuguese: "PT",
  ru: "RU", rus: "RU", russian: "RU",
  ja: "JA", jpn: "JA", japanese: "JA",
  ko: "KO", kor: "KO", korean: "KO",
  zh: "ZH", chi: "ZH", chn: "ZH", chinese: "ZH",
  ar: "AR", ara: "AR", arabic: "AR",
  tr: "TR", tur: "TR", turkish: "TR",
  nl: "NL", dut: "NL", dutch: "NL",
  pl: "PL", pol: "PL", polish: "PL",
  cs: "CS", cze: "CS", czech: "CS",
  sv: "SV", swe: "SV", swedish: "SV",
  da: "DA", dan: "DA", danish: "DA",
  no: "NO", nor: "NO", norwegian: "NO",
  fi: "FI", fin: "FI", finnish: "FI",
  el: "EL", ell: "EL", gre: "GR", greek: "GR",
  he: "HE", heb: "HE", hebrew: "HE",
  th: "TH", tha: "TH", thai: "TH",
  vi: "VI", vie: "VI", vietnamese: "VI",
  uk: "UK", ukr: "UK", ukrainian: "UK",
  fa: "FA", per: "FA", persian: "FA",
  ur: "UR", urd: "UR", urdu: "UR",
};

/** Normalize a single language label (e.g. from subtitles) to a short code. */
export function normalizeLangCode(lang: string): string {
  if (!lang) return "";
  const code = LANG_CODES[lang.trim().toLowerCase()];
  return code ?? lang.trim().toUpperCase().slice(0, 3);
}

/**
 * Parse a torrent filename / title for embedded audio-language tags.
 * Handles slash/dot/space/plus separated codes (EN/ITA/FR/ES, Eng.Fre.Ger,
 * Hindi English, Ita Eng), full language names, and Dual/Multi labels.
 * Returns ", " when no language info can be detected (discovered at playback).
 */
export function parseAudioLanguages(fileName: string): string {
  if (!fileName) return ", ";
  const lower = fileName.toLowerCase();
  const found: string[] = [];

  // Tokenize on whitespace, dots, slashes and plus signs
  const tokens = lower.split(/[\s.+/]+/).filter(Boolean);
  tokens.forEach((tok) => {
    const code = LANG_CODES[tok];
    if (code && !found.includes(code)) found.push(code);
  });

  if (/\bdual\s*audio\b|\bdual\b/i.test(fileName)) {
    if (!found.includes("DUAL")) found.push("DUAL");
  }
  if (/\bmulti\s*audio\b|\bmultilang\b|\bmulti\s*lang\b|\bmulti\b/i.test(fileName)) {
    if (!found.includes("MULTI")) found.push("MULTI");
  }

  return found.length > 0 ? found.join(", ") : ", ";
}

export function extractTorrentSize(qualityStr: string): string {
  if (!qualityStr) return ", ";
  const match = qualityStr.match(/(?:💾|size:?)\s*([\d.]+\s*(?:GB|MB|KB|B))/i) || qualityStr.match(/\b([\d.]+\s*(?:GB|MB|KB|B))\b/i);
  return match ? match[1] : ", ";
}

export function cleanQualityTag(qualityStr: string): string {
  if (!qualityStr) return "";
  return qualityStr.replace(/\s*\(.*\)/, "").trim();
}

export function extractResolution(qualityStr: string): string {
  if (!qualityStr) return ", ";
  const match = qualityStr.match(/\b(2160p|1080p|720p|480p|360p|4k|8k|hd|sd|cam|hdtv)\b/i);
  return match ? match[1].toUpperCase() : "HD";
}
