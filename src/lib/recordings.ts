import { Track } from "@/types/recording";

// ─── Constants ────────────────────────────────────────────────────────────────

const RELISTEN_ARTISTS_CACHE_KEY = "wookbook:relisten-artists";
const RELISTEN_ARTISTS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Manual overrides — for artists whose Relisten slug can't be fuzzy-matched.
// Keep this as small as possible; the dynamic list handles most cases.
const SLUG_OVERRIDES: Record<string, string> = {
  "joe russo's almost dead": "jrad",
  "jrad": "jrad",
};

// Artists that use a custom Archive.org query instead of standard creator search.
// These have non-standard indexing on Archive.org.
const ARCHIVE_Q_OVERRIDES: Record<string, string> = {
  "gov't mule": "GovtMule AND collection:etree",
  "govt mule": "GovtMule AND collection:etree",
  "king gizzard and the lizard wizard": 'creator:"King Gizzard & The Lizard Wizard" AND collection:etree',
  "king gizzard & the lizard wizard": 'creator:"King Gizzard & The Lizard Wizard" AND collection:etree',
  "kglw": 'creator:"King Gizzard & The Lizard Wizard" AND collection:etree',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type RelistenArtist = { name: string; slug: string };

type Source =
  | { type: "phishin" }
  | { type: "relisten"; slug: string }
  | { type: "archive"; creator: string; collection: string }
  | { type: "archive-q"; q: string };

// ─── Relisten Artist List ─────────────────────────────────────────────────────

async function getRelistenArtists(): Promise<RelistenArtist[]> {
  try {
    const raw = localStorage.getItem(RELISTEN_ARTISTS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { artists: RelistenArtist[]; fetchedAt: number };
      if (Date.now() - cached.fetchedAt < RELISTEN_ARTISTS_TTL_MS) {
        return cached.artists;
      }
    }
  } catch { /* cache corrupt, fetch fresh */ }

  try {
    const res = await fetch("https://api.relisten.net/api/v2/artists");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const artists: RelistenArtist[] = (Array.isArray(data) ? data : [])
      .filter((a: { name?: unknown; slug?: unknown }) => a?.name && a?.slug)
      .map((a: { name: unknown; slug: unknown }) => ({ name: String(a.name), slug: String(a.slug) }));

    try {
      localStorage.setItem(
        RELISTEN_ARTISTS_CACHE_KEY,
        JSON.stringify({ artists, fetchedAt: Date.now() })
      );
    } catch { /* localStorage full, skip */ }

    return artists;
  } catch {
    // Network failure — return hardcoded minimum so the app still works
    return [
      { name: "Phish", slug: "phish" },
      { name: "Goose", slug: "goose" },
      { name: "Grateful Dead", slug: "grateful-dead" },
      { name: "Dead & Company", slug: "dead-and-co" },
      { name: "Lotus", slug: "lotus" },
      { name: "Pigeons Playing Ping Pong", slug: "pigeons-playing-ping-pong" },
      { name: "Tedeschi Trucks Band", slug: "tedeschi-trucks" },
      { name: "Widespread Panic", slug: "wsp" },
      { name: "moe.", slug: "moe" },
      { name: "String Cheese Incident", slug: "sci" },
      { name: "Umphrey's McGee", slug: "umphreys" },
      { name: "The Disco Biscuits", slug: "disco-biscuits" },
    ];
  }
}

// ─── Name Normalization ───────────────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[''`']/g, "")
    .replace(/\band\b/gi, "&")
    .replace(/[^a-z0-9& ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchRelistenArtist(
  concertArtist: string,
  relistenArtists: RelistenArtist[]
): string | null {
  const needle = normalizeForMatch(concertArtist);
  if (!needle || needle.length < 3) return null;

  // 1. Exact normalized match
  const exact = relistenArtists.find((a) => normalizeForMatch(a.name) === needle);
  if (exact) return exact.slug;

  // 2. Concert name contains the Relisten name as a prefix
  const theirPrefix = relistenArtists.find((a) => {
    const norm = normalizeForMatch(a.name);
    return norm.length > 4 && needle.startsWith(norm);
  });
  if (theirPrefix) return theirPrefix.slug;

  // 3. Relisten name contains the concert name as a prefix
  const ourPrefix = relistenArtists.find((a) => {
    const norm = normalizeForMatch(a.name);
    return needle.length > 4 && norm.startsWith(needle);
  });
  if (ourPrefix) return ourPrefix.slug;

  return null;
}

function stripThe(name: string): string {
  return name.replace(/^The\s+/i, "").trim();
}

function primaryArtist(name: string): string {
  const withoutPossessive = name.replace(/'s\s+\S.*$/i, "").trim();
  return withoutPossessive.split(/ feat\.| with | & | \+ |, /i)[0].trim();
}

function swapAndAmpersand(name: string): string {
  if (/ and /i.test(name)) return name.replace(/ and /gi, " & ");
  if (/ & /.test(name)) return name.replace(/ & /g, " and ");
  return name;
}

function creatorCandidates(creator: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (s: string) => {
    const t = s.trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  };

  const primary = primaryArtist(creator);
  const swapped = swapAndAmpersand(creator);
  const stripped = stripThe(creator);
  const primaryStripped = stripThe(primary);
  const swappedStripped = stripThe(swapped);

  add(creator);
  add(stripped);
  add(swapped);
  add(primary);
  add(primaryStripped);
  add(swappedStripped);

  return out;
}

// ─── Source Resolution ────────────────────────────────────────────────────────

export async function getSource(artist: string): Promise<Source> {
  const a = artist.toLowerCase().trim();

  // 1. Phish.in
  if (a === "phish") return { type: "phishin" };

  // 2. Manual slug overrides (JRAD — slug can't be fuzzy-matched)
  if (SLUG_OVERRIDES[a]) {
    return { type: "relisten", slug: SLUG_OVERRIDES[a] };
  }

  // 3. Archive.org custom query overrides (Gov't Mule, King Gizzard)
  if (ARCHIVE_Q_OVERRIDES[a]) {
    return { type: "archive-q", q: ARCHIVE_Q_OVERRIDES[a] };
  }

  // 4. Dynamic Relisten fuzzy match
  try {
    const relistenArtists = await getRelistenArtists();

    const slug = matchRelistenArtist(artist, relistenArtists);
    if (slug) return { type: "relisten", slug };

    const primary = primaryArtist(artist);
    if (primary !== artist) {
      const primarySlug = matchRelistenArtist(primary, relistenArtists);
      if (primarySlug) return { type: "relisten", slug: primarySlug };
    }
  } catch { /* Relisten artist list unavailable, fall through */ }

  // 5. Archive.org etree fallback
  return { type: "archive", collection: "etree", creator: artist };
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

function formatSec(s: number): string {
  s = Math.round(s || 0);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// ─── Phish.in ─────────────────────────────────────────────────────────────────

export async function loadPhishinShow(
  date: string
): Promise<{ tracks: Track[]; source: string }> {
  const res = await fetch(`https://phish.in/api/v1/shows/${date}.json`);
  if (!res.ok) throw new Error(`Phish.in: ${res.status}`);

  const data = await res.json();
  if (!data?.success || !data?.data?.tracks?.length) {
    throw new Error("Phish.in: no tracks in response");
  }

  const tracks: Track[] = (data.data.tracks as Array<{
    title?: unknown; mp3?: unknown; duration?: unknown; position?: unknown; set_name?: unknown;
  }>).map((t) => ({
    title: String(t.title ?? "Unknown"),
    src: String(t.mp3 ?? ""),
    duration: typeof t.duration === "number" ? formatSec(t.duration) : String(t.duration ?? ""),
    position: Number(t.position ?? 0),
    set: String(t.set_name ?? ""),
  })).filter((t) => t.src);

  if (!tracks.length) throw new Error("Phish.in: no streamable tracks");

  const venueName = (data.data.venue_name ?? data.data.venue ?? "") as string;
  return {
    tracks,
    source: `phish.in · ${venueName}`.replace(/ · $/, ""),
  };
}

// ─── Relisten ─────────────────────────────────────────────────────────────────

export async function loadRelistenShow(
  slug: string,
  date: string
): Promise<{ tracks: Track[]; source: string }> {
  const res = await fetch(
    `https://api.relisten.net/api/v2/artists/${slug}/shows/${date}`
  );
  if (!res.ok) throw new Error(`Relisten: HTTP ${res.status}`);

  const data = await res.json();
  if (!data || data.success === false || !data.sources?.length) {
    throw new Error("No recording on Relisten");
  }

  const sources = [...data.sources].sort((a: { is_soundboard?: boolean; num_reviews?: number; num_ratings?: number }, b: { is_soundboard?: boolean; num_reviews?: number; num_ratings?: number }) => {
    const sbdDiff = (b.is_soundboard ? 1 : 0) - (a.is_soundboard ? 1 : 0);
    if (sbdDiff !== 0) return sbdDiff;
    return ((b.num_reviews ?? 0) + (b.num_ratings ?? 0)) - ((a.num_reviews ?? 0) + (a.num_ratings ?? 0));
  });

  for (const s of sources) {
    const tracks: Track[] = [];
    for (const set of s.sets ?? []) {
      for (const track of set.tracks ?? []) {
        if (track.mp3_url) {
          tracks.push({
            title: String(track.title ?? ""),
            set: String(set.name ?? ""),
            src: String(track.mp3_url),
            duration: typeof track.duration === "number"
              ? formatSec(track.duration)
              : String(track.duration ?? ""),
            position: Number(track.track_position ?? 0),
          });
        }
      }
    }

    if (tracks.length) {
      try {
        const check = await fetch(tracks[0].src, { method: "HEAD" });
        if (!check.ok) continue;
      } catch { continue; }

      const tapeType = s.is_soundboard ? "SBD" : "AUD";
      let label = `${tapeType} · relisten.net`;
      if (s.avg_rating) label += ` · ${s.avg_rating.toFixed(1)}★`;
      if (s.num_reviews) label += ` · ${s.num_reviews} reviews`;
      else if (s.num_ratings) label += ` · ${s.num_ratings} ratings`;
      return { tracks, source: label };
    }
  }

  throw new Error("No streamable MP3s on Relisten");
}

// ─── Archive.org ──────────────────────────────────────────────────────────────

type ArchiveDoc = {
  identifier: string;
  title?: string;
  creator?: string;
  downloads?: number;
  avg_rating?: number;
  num_reviews?: number;
  description?: string;
};

async function doArchiveSearch(q: string): Promise<ArchiveDoc[]> {
  const url =
    "https://archive.org/advancedsearch.php?q=" +
    encodeURIComponent(q) +
    "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads&fl[]=avg_rating" +
    "&fl[]=num_reviews&fl[]=description&sort[]=downloads+desc&rows=10&output=json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive.org search: HTTP ${res.status}`);
  const d = await res.json();
  return d?.response?.docs ?? [];
}

function creatorMatchesArtist(doc: ArchiveDoc, artist: string): boolean {
  if (!doc.creator) return true;
  const docCreator = normalizeForMatch(doc.creator);
  const candidates = creatorCandidates(artist).map(normalizeForMatch);
  return candidates.some(
    (c) => docCreator === c || docCreator.startsWith(c + " ") || c.startsWith(docCreator + " ")
  );
}

export async function searchArchive(
  creator: string,
  date: string,
  collection: string
): Promise<ArchiveDoc[]> {
  const candidates = creatorCandidates(creator);

  // Pass 1 — precise, with collection
  for (const name of candidates) {
    const docs = (await doArchiveSearch(
      `collection:${collection} AND creator:"${name}" AND date:${date}`
    )).filter((d) => creatorMatchesArtist(d, creator));
    if (docs.length) return docs;
  }

  // Pass 2 — broader, without collection, but audio only
  for (const name of candidates) {
    const docs = (await doArchiveSearch(
      `mediatype:audio AND creator:"${name}" AND date:${date}`
    )).filter((d) => creatorMatchesArtist(d, creator));
    if (docs.length) return docs;
  }

  // Pass 3 — subject tag fallback, audio only
  const primaryName = primaryArtist(creator);
  const subjectDocs = (await doArchiveSearch(
    `mediatype:audio AND subject:"${primaryName}" AND date:${date}`
  )).filter((d) => creatorMatchesArtist(d, creator));
  if (subjectDocs.length) return subjectDocs;

  return [];
}

export async function searchArchiveQ(q: string, date: string, artist?: string): Promise<ArchiveDoc[]> {
  const docs = await doArchiveSearch(`${q} AND date:${date}`);
  return artist ? docs.filter((d) => creatorMatchesArtist(d, artist)) : docs;
}

export async function getArchiveMP3s(identifier: string): Promise<Track[]> {
  const res = await fetch(`https://archive.org/metadata/${identifier}/files`);
  if (!res.ok) throw new Error(`Archive.org metadata: HTTP ${res.status}`);

  const data = await res.json();
  const allFiles: Array<{
    format: string;
    title?: string;
    name: string;
    length?: string;
    track?: string;
  }> = data.result ?? [];

  const FORMAT_PRIORITY = ["VBR MP3", "MP3", "128Kbps MP3", "64Kbps MP3", "Flac", "24bit Flac"];
  for (const fmt of FORMAT_PRIORITY) {
    const files = allFiles.filter((f) => f.format === fmt);
    if (!files.length) continue;

    const firstSrc = "https://archive.org/download/" + identifier + "/" + encodeURIComponent(files[0].name);
    try {
      const check = await fetch(firstSrc, { method: "HEAD" });
      if (!check.ok) continue;
    } catch { continue; }

    const tracks = files
      .map((f) => {
        const rawLen = f.length || "";
        const duration = /^\d+:\d+/.test(rawLen)
          ? rawLen
          : parseFloat(rawLen) > 0
          ? formatSec(parseFloat(rawLen))
          : "";
        return {
          title: f.title || f.name.replace(/\.(mp3|flac)$/i, ""),
          src:
            "https://archive.org/download/" +
            identifier +
            "/" +
            encodeURIComponent(f.name),
          duration,
          position: parseInt(f.track || "0"),
        };
      })
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (tracks.length) return tracks;
  }

  return [];
}

function buildArchiveSourceLabel(doc: ArchiveDoc): string {
  const parts = ["archive.org"];
  if (doc.avg_rating) {
    parts.push(
      `★ ${Number(doc.avg_rating).toFixed(1)}` +
      (doc.num_reviews ? ` (${doc.num_reviews} reviews)` : "")
    );
  }
  if (doc.downloads) {
    parts.push(`${Number(doc.downloads).toLocaleString()} downloads`);
  }
  const srcMatch = (doc.description ?? "").match(
    /\b(SBD|soundboard|AUD|audience|FM|matrix|MTX|webcast)\b/i
  );
  if (srcMatch) {
    parts.push(
      srcMatch[0].toUpperCase()
        .replace("SOUNDBOARD", "SBD")
        .replace("AUDIENCE", "AUD")
    );
  }
  return parts.join(" · ");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function findRecording(
  artist: string,
  date: string
): Promise<{ source: string; tracks: Track[] }> {
  const src = await getSource(artist);

  if (src.type === "phishin") {
    try {
      return await loadPhishinShow(date);
    } catch {
      return loadRelistenShow("phish", date);
    }
  }

  if (src.type === "relisten") {
    try {
      return await loadRelistenShow(src.slug, date);
    } catch {
      // Show missing from Relisten — fall through to archive.org (audio only)
      const docs = await searchArchive(artist, date, "etree");
      if (!docs.length) throw new Error("No recordings found");
      docs.sort((a, b) => {
        const isSbd = (d: ArchiveDoc) =>
          /\bSBD\b|soundboard/i.test(`${d.title ?? ""} ${d.description ?? ""}`);
        if (isSbd(b) !== isSbd(a)) return isSbd(b) ? 1 : -1;
        return (b.downloads ?? 0) - (a.downloads ?? 0);
      });
      for (const doc of docs.slice(0, 3)) {
        try {
          const mp3s = await getArchiveMP3s(doc.identifier);
          if (mp3s.length) return { source: buildArchiveSourceLabel(doc), tracks: mp3s };
        } catch { /* try next */ }
      }
      throw new Error("No playable MP3s found in any recording");
    }
  }

  const docs =
    src.type === "archive-q"
      ? await searchArchiveQ(src.q, date, artist)
      : await searchArchive(src.creator, date, src.collection);

  if (!docs.length) throw new Error("No recordings found");

  const isSbd = (d: ArchiveDoc) =>
    /\bSBD\b|soundboard/i.test(`${d.title ?? ""} ${d.description ?? ""}`);
  docs.sort((a, b) => {
    if (isSbd(b) !== isSbd(a)) return isSbd(b) ? 1 : -1;
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });

  // Try top 3 results — docs[0] may have no playable MP3s
  for (const doc of docs.slice(0, 3)) {
    try {
      const mp3s = await getArchiveMP3s(doc.identifier);
      if (mp3s.length) {
        return { source: buildArchiveSourceLabel(doc), tracks: mp3s };
      }
    } catch { /* try next */ }
  }

  throw new Error("No playable MP3s found in any recording");
}

export async function checkHasRecording(
  artist: string,
  date: string
): Promise<boolean> {
  try {
    const src = await getSource(artist);

    if (src.type === "phishin") {
      const res = await fetch(`https://phish.in/api/v1/shows/${date}.json`);
      if (!res.ok) return false;
      const d = await res.json();
      return !!(d?.success && d?.data?.tracks?.length);
    }

    if (src.type === "relisten") {
      const res = await fetch(
        `https://api.relisten.net/api/v2/artists/${src.slug}/shows/${date}`
      );
      if (!res.ok) return false;
      const d = await res.json();
      return !!(d?.sources?.length);
    }

    const docs =
      src.type === "archive-q"
        ? await searchArchiveQ(src.q, date, artist)
        : await searchArchive(src.creator, date, src.collection);
    return docs.length > 0;
  } catch {
    return false;
  }
}

export { getRelistenArtists, matchRelistenArtist, primaryArtist };
