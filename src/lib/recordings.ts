import { Track } from "@/types/recording";

const RELISTEN_SLUGS: Record<string, string> = {
  phish: "phish",
  goose: "goose",
  "grateful dead": "grateful-dead",
  "the grateful dead": "grateful-dead",
  "dead & company": "dead-and-co",
  "dead and company": "dead-and-co",
  lotus: "lotus",
  "pigeons playing ping pong": "pigeons-playing-ping-pong",
  "tedeschi trucks band": "tedeschi-trucks",
  "widespread panic": "wsp",
  "moe.": "moe",
  "string cheese incident": "sci",
  "the string cheese incident": "sci",
  "umphrey's mcgee": "umphreys",
  "the disco biscuits": "disco-biscuits",
};

type Source =
  | { type: "relisten"; slug: string }
  | { type: "archive"; creator: string; collection: string }
  | { type: "archive-q"; q: string };

export function getSource(artist: string): Source {
  const a = artist.toLowerCase();
  if (RELISTEN_SLUGS[a]) return { type: "relisten", slug: RELISTEN_SLUGS[a] };
  if (a === "gov't mule" || a === "govt mule")
    return { type: "archive-q", q: "GovtMule AND collection:etree" };
  if (
    a === "king gizzard and the lizard wizard" ||
    a === "king gizzard & the lizard wizard" ||
    a === "kglw"
  )
    return {
      type: "archive-q",
      q: 'creator:"King Gizzard & The Lizard Wizard" AND collection:etree',
    };
  return { type: "archive", collection: "etree", creator: artist };
}

function formatSec(s: number): string {
  s = Math.round(s || 0);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function primaryArtist(name: string): string {
  return name.split(/ & | feat\.| with /i)[0].trim();
}

export async function loadRelistenShow(
  slug: string,
  date: string
): Promise<{ tracks: Track[]; source: string }> {
  const res = await fetch(
    `https://api.relisten.net/api/v2/artists/${slug}/shows/${date}`
  );
  const data = await res.json();
  if (!data || data.success === false || !data.sources?.length)
    throw new Error("No recording on Relisten");

  const sources = [...data.sources].sort((a, b) => {
    const sbdA = a.is_soundboard ? 1 : 0;
    const sbdB = b.is_soundboard ? 1 : 0;
    if (sbdB !== sbdA) return sbdB - sbdA;
    return (b.num_reviews + b.num_ratings || 0) - (a.num_reviews + a.num_ratings || 0);
  });

  for (const s of sources) {
    const tracks: Track[] = [];
    for (const set of s.sets ?? []) {
      for (const track of set.tracks ?? []) {
        if (track.mp3_url) {
          tracks.push({
            title: track.title,
            set: set.name || "",
            src: track.mp3_url,
            duration: formatSec(track.duration),
            position: track.track_position,
          });
        }
      }
    }
    if (tracks.length) {
      let label = "relisten.net";
      if (s.avg_rating) label += ` · ${s.avg_rating.toFixed(1)}★`;
      if (s.num_reviews) label += ` · ${s.num_reviews} reviews`;
      if (s.num_ratings) label += ` · ${s.num_ratings} ratings`;
      return { tracks, source: label };
    }
  }
  throw new Error("No MP3s on Relisten");
}

async function doArchiveSearch(q: string): Promise<{ identifier: string; title: string; downloads: number; avg_rating?: number; num_reviews?: number; description?: string }[]> {
  const url =
    "https://archive.org/advancedsearch.php?q=" +
    encodeURIComponent(q) +
    "&fl[]=identifier&fl[]=title&fl[]=downloads&fl[]=avg_rating&fl[]=num_reviews&fl[]=description&sort[]=downloads+desc&rows=5&output=json";
  const res = await fetch(url);
  const d = await res.json();
  return d.response.docs;
}

export async function searchArchive(
  creator: string,
  date: string,
  collection: string
) {
  const baseQ = (c: string) =>
    `collection:${collection} AND creator:"${c}" AND date:${date}`;

  let docs = await doArchiveSearch(baseQ(creator));
  if (!docs.length) {
    const primary = primaryArtist(creator);
    if (primary !== creator) docs = await doArchiveSearch(baseQ(primary));
  }
  if (!docs.length) {
    const swapped = creator.replace(/ and /gi, " & ").replace(/ & /g, " and ");
    if (swapped !== creator) docs = await doArchiveSearch(baseQ(swapped));
  }
  return docs;
}

export async function searchArchiveQ(q: string, date: string) {
  return doArchiveSearch(`${q} AND date:${date}`);
}

export async function getArchiveMP3s(identifier: string): Promise<Track[]> {
  const res = await fetch(
    `https://archive.org/metadata/${identifier}/files`
  );
  const data = await res.json();
  const files = (data.result ?? []).filter(
    (f: { format: string }) => f.format === "VBR MP3"
  );
  return files
    .map((f: { title?: string; name: string; length?: string; track?: string }) => {
      const rawLen = f.length || "";
      const duration = /^\d+:\d+/.test(rawLen)
        ? rawLen
        : parseFloat(rawLen) > 0
        ? formatSec(parseFloat(rawLen))
        : "";
      return {
        title: f.title || f.name.replace(/\.mp3$/i, ""),
        src:
          "https://archive.org/download/" +
          identifier +
          "/" +
          encodeURIComponent(f.name),
        duration,
        position: parseInt(f.track || "0"),
      };
    })
    .sort((a: Track & { position: number }, b: Track & { position: number }) => (a.position ?? 0) - (b.position ?? 0));
}

export async function findRecording(
  artist: string,
  date: string
): Promise<{ source: string; tracks: Track[] }> {
  const src = getSource(artist);
  if (src.type === "relisten") {
    return loadRelistenShow(src.slug, date);
  }

  const docs =
    src.type === "archive-q"
      ? await searchArchiveQ(src.q, date)
      : await searchArchive(src.creator, date, src.collection);

  if (!docs.length) throw new Error("No recordings found");

  const isSbd = (d: { title?: string; description?: string }) =>
    /\bSBD\b|soundboard/i.test((d.title ?? "") + " " + (d.description ?? ""));
  docs.sort((a, b) => {
    if (isSbd(b) !== isSbd(a)) return isSbd(b) ? 1 : -1;
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });

  const mp3s = await getArchiveMP3s(docs[0].identifier);
  if (!mp3s.length) throw new Error("No MP3s in this recording");

  const doc = docs[0];
  const parts = ["archive.org"];
  if (doc.avg_rating)
    parts.push(
      `★ ${Number(doc.avg_rating).toFixed(1)}` +
        (doc.num_reviews ? ` (${doc.num_reviews} reviews)` : "")
    );
  if (doc.downloads)
    parts.push(`${Number(doc.downloads).toLocaleString()} downloads`);
  const srcMatch = (doc.description ?? "").match(
    /\b(SBD|soundboard|AUD|audience|FM|matrix|MTX|webcast)\b/i
  );
  if (srcMatch)
    parts.push(
      srcMatch[0].toUpperCase().replace("SOUNDBOARD", "SBD").replace("AUDIENCE", "AUD")
    );

  return { source: parts.join(" · "), tracks: mp3s };
}

export async function checkHasRecording(
  artist: string,
  date: string
): Promise<boolean> {
  try {
    const src = getSource(artist);
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
        ? await searchArchiveQ(src.q, date)
        : await searchArchive(src.creator, date, src.collection);
    return docs.length > 0;
  } catch {
    return false;
  }
}
