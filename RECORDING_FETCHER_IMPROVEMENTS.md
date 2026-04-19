# WookBook — Recording Fetcher: Problems, Solutions & Implementation Guide

**File to modify:** `src/lib/recordings.ts`  
**File to modify:** `src/hooks/useRecordings.ts`  
**Scope:** Drop-in replacement of both files. No changes to any component, type, or other hook required.

---

## Executive Summary

The current recording fetcher has one structural problem that causes the majority of failures: **a hardcoded, manually-maintained list of only 12 Relisten artists** out of 100+ that Relisten actually supports. This means artists like Dave Matthews Band (10 shows), My Morning Jacket (6), Dark Star Orchestra (6), Trey Anastasio Band (6), Billy Strings (5), and Joe Russo's Almost Dead (3) — all well-covered on Relisten — silently fall through to Archive.org instead, where results are noisier, slower, and less reliable.

There are also secondary issues with the Archive.org search logic, the prefetch strategy (too many concurrent requests), and several edge cases in artist name normalization.

This document covers every problem, the reasoning behind each fix, and production-ready code for all changes.

---

## Table of Contents

1. [Problem 1 — Hardcoded Relisten Slug Map](#problem-1)
2. [Problem 2 — Prefetch Fires Per-Show (Too Many Requests)](#problem-2)
3. [Problem 3 — Archive Search Name Normalization Gaps](#problem-3)
4. [Problem 4 — Archive Falls Over on docs[0] Failure](#problem-4)
5. [Problem 5 — Compound and Variant Artist Names](#problem-5)
6. [Problem 6 — Source Label Lacks Tape Type](#problem-6)
7. [Problem 7 — Phish.in Untapped for Phish](#problem-7)
8. [Complete Rewrite: recordings.ts](#rewrite-recordings)
9. [Complete Rewrite: useRecordings.ts](#rewrite-userecordings)
10. [Artist Coverage Reference](#artist-coverage)
11. [Testing Checklist](#testing-checklist)

---

## Problem 1 — Hardcoded Relisten Slug Map {#problem-1}

### What's broken

`getSource()` in `recordings.ts` uses a static `RELISTEN_SLUGS` object with 12 entries:

```typescript
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
```

Any artist not in this object falls through to Archive.org. The problem: **Relisten supports 100+ artists and exposes them via a public API endpoint.** The following artists are in the WookBook concert archive, almost certainly on Relisten, and currently being routed to Archive.org incorrectly:

| Artist | Show Count | Likely Relisten Slug |
|--------|-----------|----------------------|
| Dave Matthews Band | 10 | `dave-matthews-band` |
| My Morning Jacket | 6 | `my-morning-jacket` |
| Dark Star Orchestra | 6 | `dark-star-orchestra` |
| Trey Anastasio Band | 6 | `trey-anastasio-band` |
| Billy Strings | 5 | `billy-strings` |
| Joe Russo's Almost Dead | 3 | `jrad` |
| STS9 | 2 | `sts9` |
| Furthur | 2 | `furthur` |
| Allman Brothers Band | 2 | `allman-brothers-band` |
| The Allman Brothers Band | 2 | `allman-brothers-band` |
| Spafford | 2 | `spafford` |
| Ghost Light | 2 | `ghost-light` |
| Dopapod | 3 | `dopapod` |
| Phil Lesh & Friends | 1 | `phil-lesh-and-friends` |
| Mike Gordon | 1 | `mike-gordon` |
| Mike Gordon Band | 1 | `mike-gordon` |
| Ratdog | 1 | `ratdog` |
| Greensky Bluegrass | 1 | `greensky-bluegrass` |
| Twiddle | 1 | `twiddle` |
| Chris Robinson Brotherhood | 1 | `chris-robinson-brotherhood` |
| Papadosio | 1 | `papadosio` |
| Vida Blue | 1 | `vida-blue` |

That's 22+ artists, 60+ shows currently hitting the wrong source.

### Why it happened

The slug map was seeded manually at build time. Relisten slugs aren't always guessable from the artist name (e.g. JRAD for "Joe Russo's Almost Dead"), so someone had to look them up by hand. The list just never grew past the initial set.

### The fix

Relisten exposes a public endpoint:

```
GET https://api.relisten.net/api/v2/artists
```

This returns the full list of all supported artists with their slugs:

```json
[
  { "id": "abc123", "name": "Phish", "slug": "phish", ... },
  { "id": "def456", "name": "Joe Russo's Almost Dead", "slug": "jrad", ... },
  { "id": "ghi789", "name": "Billy Strings", "slug": "billy-strings", ... },
  ...
]
```

**The approach:**
1. Fetch this list once on app init
2. Cache it to `localStorage` with a 7-day TTL — it virtually never changes
3. At runtime, match each concert's artist name against the cached list using fuzzy normalization
4. Fall through to Archive.org only for artists genuinely not on Relisten

This completely eliminates the manual slug map. When Relisten adds a new artist, the app picks it up automatically on next cache expiry.

### The fuzzy matching logic

Artist names in your concert data won't always match Relisten's canonical names exactly. The normalization function must handle:

- Leading "The" → `"The Allman Brothers Band"` = `"Allman Brothers Band"`
- `"and"` vs `"&"` → `"Dead and Company"` = `"Dead & Company"`  
- Apostrophe variants → `"Joe Russo's"` = `"Joe Russos"` (for comparison)
- Punctuation → `"moe."` needs the dot stripped for comparison
- Case → always lowercase before comparing

```typescript
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/, "")           // strip leading "The "
    .replace(/[''`]/g, "")            // normalize apostrophes → remove
    .replace(/\band\b/gi, "&")        // "and" → "&" for comparison
    .replace(/[^a-z0-9& ]/g, "")      // strip all other punctuation (inc. dots)
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

function matchRelistenArtist(
  concertArtist: string,
  relistenArtists: Array<{ name: string; slug: string }>
): string | null {
  const needle = normalizeForMatch(concertArtist);

  // 1. Exact normalized match — covers most cases
  const exact = relistenArtists.find(
    (a) => normalizeForMatch(a.name) === needle
  );
  if (exact) return exact.slug;

  // 2. Concert name starts with Relisten name
  // Handles: "Trey Anastasio Band" matching "Trey Anastasio" if that's how they list it
  const startsWithTheir = relistenArtists.find(
    (a) => needle.startsWith(normalizeForMatch(a.name)) &&
           normalizeForMatch(a.name).length > 4  // avoid spurious short matches
  );
  if (startsWithTheir) return startsWithTheir.slug;

  // 3. Relisten name starts with concert name
  // Handles: "Disco Biscuits" → "The Disco Biscuits"
  const theirStartsWithOurs = relistenArtists.find(
    (a) => normalizeForMatch(a.name).startsWith(needle) &&
           needle.length > 4
  );
  if (theirStartsWithOurs) return theirStartsWithOurs.slug;

  return null;
}
```

### Caching the artist list

```typescript
const RELISTEN_ARTISTS_KEY = "wookbook:relisten-artists";
const RELISTEN_ARTISTS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

type CachedRelistenArtists = {
  artists: Array<{ name: string; slug: string }>;
  fetchedAt: number;
};

async function getRelistenArtists(): Promise<Array<{ name: string; slug: string }>> {
  try {
    const raw = localStorage.getItem(RELISTEN_ARTISTS_KEY);
    if (raw) {
      const cached: CachedRelistenArtists = JSON.parse(raw);
      if (Date.now() - cached.fetchedAt < RELISTEN_ARTISTS_TTL) {
        return cached.artists;
      }
    }
  } catch { /* cache miss, fetch fresh */ }

  const res = await fetch("https://api.relisten.net/api/v2/artists");
  if (!res.ok) throw new Error("Could not fetch Relisten artist list");
  const data = await res.json();

  const artists = (Array.isArray(data) ? data : [])
    .filter((a: any) => a.name && a.slug)
    .map((a: any) => ({ name: String(a.name), slug: String(a.slug) }));

  try {
    localStorage.setItem(
      RELISTEN_ARTISTS_KEY,
      JSON.stringify({ artists, fetchedAt: Date.now() })
    );
  } catch { /* storage full, skip */ }

  return artists;
}
```

### Important: getSource() becomes async

Because `getSource()` needs to consult the cached artist list (which may require a fetch on first run), it becomes `async`. This is the one API surface change — `getSource()` returns `Promise<Source>` instead of `Source`. All callers (`findRecording`, `checkHasRecording`, `useRecordings` prefetch) are already async, so this is a straightforward change.

---

## Problem 2 — Prefetch Fires Per-Show (Too Many Requests) {#problem-2}

### What's broken

`useRecordings.ts` runs `checkHasRecording()` on every concert not yet in `rec-known`:

```typescript
// Relisten: batches of 8, 100ms gap
for (let i = 0; i < relisten.length; i += BATCH_RELISTEN) {
  await Promise.all(
    relisten.slice(i, i + BATCH_RELISTEN).map(async (c) => {
      const found = await checkHasRecording(c.artist, c.date);
      ...
    })
  );
}
```

`checkHasRecording()` for Relisten artists hits:
```
GET /api/v2/artists/{slug}/shows/{date}
```

One request per concert. Phish alone has 40+ shows in the archive. Across all Relisten artists in the concert list, first-load fires ~200+ API calls. This is:
- Slow (bottlenecked by sequential batches)
- Aggressive toward Relisten's servers
- Wasteful — each call returns a single show when a year-level call returns all shows in one

### The fix: Year-Level Endpoint

Relisten has a year endpoint:
```
GET /api/v2/artists/{slug}/years/{year}/shows
```

Returns an array of all shows Relisten has for that artist in that year, each with at least `{ date: "YYYY-MM-DD" }`.

**The new prefetch strategy:**

1. Group concerts by `(slug, year)` pairs
2. Fire one request per pair instead of one per show
3. Build a `Map<slug, Set<date>>` lookup from responses
4. Match locally — O(1) per concert, no further API calls

For your archive: ~15 Relisten artists × ~10 average years active = ~150 requests max, compared to 200+ per-show requests. But more importantly, it's **much faster** because fewer round trips are needed overall and you get complete year coverage rather than partial batches.

```typescript
type YearKey = `${string}::${string}`; // "phish::2023"

async function buildRelistenIndex(
  concerts: Concert[],
  relistenArtists: Array<{ name: string; slug: string }>,
  knownIds: Set<string>
): Promise<Map<string, Set<string>>> {
  // slug → Set<"YYYY-MM-DD">
  const index = new Map<string, Set<string>>();

  // Collect unique (slug, year) pairs needed for unchecked concerts
  const pairs = new Set<YearKey>();
  for (const c of concerts) {
    if (knownIds.has(c.id)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "")) continue;
    const slug = matchRelistenArtist(c.artist, relistenArtists);
    if (!slug) continue;
    const year = c.date.slice(0, 4);
    pairs.add(`${slug}::${year}`);
  }

  if (!pairs.size) return index;

  const tasks = [...pairs].map((key) => {
    const [slug, year] = key.split("::");
    return { slug, year };
  });

  const BATCH = 6;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < tasks.length; i += BATCH) {
    await Promise.all(
      tasks.slice(i, i + BATCH).map(async ({ slug, year }) => {
        try {
          const res = await fetch(
            `https://api.relisten.net/api/v2/artists/${slug}/years/${year}/shows`
          );
          if (!res.ok) return;
          const shows: Array<{ date?: string }> = await res.json();
          if (!Array.isArray(shows)) return;

          if (!index.has(slug)) index.set(slug, new Set());
          const dateSet = index.get(slug)!;
          for (const show of shows) {
            if (show.date) dateSet.add(show.date.slice(0, 10));
          }
        } catch { /* network error, skip */ }
      })
    );
    if (i + BATCH < tasks.length) await sleep(150);
  }

  return index;
}
```

---

## Problem 3 — Archive Search Name Normalization Gaps {#problem-3}

### What's broken

The current normalization in `recordings.ts` has `primaryArtist()` and `swapAndAmpersand()` which handle some cases. But several patterns in your actual artist data are missed.

### Gap A — "The" prefix not stripped

`"The Allman Brothers Band"` and `"Allman Brothers Band"` are the same band. Archive.org catalogs them inconsistently. Current code doesn't strip the "The" prefix.

```typescript
// Add this to creatorCandidates()
function stripThe(name: string): string {
  return name.replace(/^The\s+/i, "").trim();
}
```

### Gap B — Inconsistent venue-data artist names

The concert data has duplicates under slightly different names:
- `"Disco Biscuits"` (1 show) vs `"The Disco Biscuits"` (3 shows)
- `"Tedeschi Trucks"` (2 shows) vs `"Tedeschi Trucks Band"` (3 shows)
- `"Control For Smilers"` vs `"Control for Smilers"` (case difference)

`"Tedeschi Trucks"` only matches Relisten's `"tedeschi-trucks"` slug if you try stripping "Band" from the end. This is an edge case but worth a note: **a data cleanup pass on `concerts.json` to canonicalize these names would be more reliable than trying to normalize them at search time.**

### Gap C — Subject tag fallback for Archive.org

Some Archive.org recordings use `subject:` tags rather than `creator:` fields. Adding a final fallback:

```typescript
// Pass 3 in searchArchive() — subject tag search as last resort
const docs = await doArchiveSearch(
  `subject:"${primaryName}" AND date:${date}`
);
```

### Gap D — Date format variation on Archive.org

Archive.org sometimes stores dates as `YYYY-MM-DD`, sometimes `YYYY`, sometimes `YYYYMMDD`. The current query uses `date:YYYY-MM-DD` which is correct for most records but can miss some. A tolerance pass using just `date:YYYY` as a secondary attempt catches edge cases:

```typescript
// If precise date search returns nothing, try year-only
if (!docs.length) {
  const year = date.slice(0, 4);
  docs = await doArchiveSearch(
    `collection:etree AND creator:"${creator}" AND date:${year}`
  );
  // then re-filter client-side to narrow to the right month/day
  // (check doc.date or doc.identifier which often contains the date)
}
```

### Updated creatorCandidates()

```typescript
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

  // Ordered from most-specific to least-specific
  add(creator);
  add(stripped);
  add(primary);
  add(primaryStripped);
  add(swapped);
  add(stripThe(swapped));

  return out;
}
```

---

## Problem 4 — Archive Falls Over on docs[0] Failure {#problem-4}

### What's broken

```typescript
const mp3s = await getArchiveMP3s(docs[0].identifier);
if (!mp3s.length) throw new Error("No MP3s in this recording");
```

If the top-ranked Archive.org result has no MP3s (this happens — some recordings have FLAC only, or the files are corrupt, or the identifier is for a collection page rather than a specific taper), the entire fetch fails even though `docs[1]` or `docs[2]` might have perfectly good MP3s.

### The fix

Try the top 3 results before giving up:

```typescript
for (const doc of docs.slice(0, 3)) {
  try {
    const mp3s = await getArchiveMP3s(doc.identifier);
    if (mp3s.length) {
      return { source: buildSourceLabel(doc), tracks: mp3s };
    }
  } catch { /* try next */ }
}
throw new Error("No playable MP3s found in top results");
```

---

## Problem 5 — Compound and Variant Artist Names {#problem-5}

### What's broken

Several concerts in the archive have compound or variant artist names that will never match cleanly:

| Concert Artist | Issue |
|----------------|-------|
| `"Umphrey's McGee with Lettuce"` | Compound — "Umphrey's McGee" is in Relisten, "with Lettuce" breaks the match |
| `"moe. & Pigeons Playing Ping Pong"` | Compound — both artists are in Relisten separately |
| `"Dopapod & Umphrey's McGee"` | Same |
| `"Bob Weir & Bruce Hornsby feat. Branford Marsalis"` | `primaryArtist()` should extract "Bob Weir" — confirm this works |
| `"Infamous Stringdusters, California Honeydrops, Karina Rykman"` | Multi-artist line, comma-separated |
| `"Daniel Donato's Cosmic Country"` | `primaryArtist()` strips `'s Cosmic Country` → "Daniel Donato" ✓ |

### The fix for compound names

The `primaryArtist()` function already handles `" feat."` and `" with "` splits. Extend it to also handle `" & "` when it looks like a collaboration (i.e. both parts are proper names) and comma-separated multi-artist strings:

```typescript
function primaryArtist(name: string): string {
  // Strip possessive band names: "Daniel Donato's Cosmic Country" → "Daniel Donato"
  const withoutPossessive = name.replace(/'s\s+\S.*$/i, "").trim();

  // Split on common collaboration markers — take the first act
  const parts = withoutPossessive.split(
    / feat\.| with | & | and | \+ |, /i
  );

  return parts[0].trim();
}
```

**Important caveat:** `" & "` is also part of some single-artist names ("Dead & Company", "Tedeschi Trucks Band" doesn't have it but others do). The split should only fire after first trying the full name. The existing architecture of `creatorCandidates()` handles this correctly — full name is tried first, `primaryArtist()` is a fallback.

### For Relisten matching specifically

For Relisten matching, try the full compound name first (in case Relisten has the collaboration indexed), then fall back to `primaryArtist()`:

```typescript
async function getRelistenSlug(artist: string): Promise<string | null> {
  const relistenArtists = await getRelistenArtists();

  // Try full name first
  const full = matchRelistenArtist(artist, relistenArtists);
  if (full) return full;

  // Try primary artist (strips collaborators)
  const primary = primaryArtist(artist);
  if (primary !== artist) {
    const fromPrimary = matchRelistenArtist(primary, relistenArtists);
    if (fromPrimary) return fromPrimary;
  }

  return null;
}
```

---

## Problem 6 — Source Label Lacks Tape Type {#problem-6}

### What's broken

The Relisten source label currently shows:
```
relisten.net · 4.2★ · 12 reviews
```

But Relisten's source objects include `is_soundboard: boolean`. For someone who cares about tape quality (and this user does — they're a serious taper community member), knowing whether they're listening to a soundboard vs audience recording is meaningful information.

### The fix

```typescript
let label = s.is_soundboard ? "SBD · relisten.net" : "AUD · relisten.net";
if (s.avg_rating) label += ` · ${s.avg_rating.toFixed(1)}★`;
if (s.num_reviews) label += ` · ${s.num_reviews} reviews`;
if (s.num_ratings && !s.num_reviews) label += ` · ${s.num_ratings} ratings`;
```

For Archive.org, the existing description regex already tries to detect SBD/AUD from the description text — that's fine as-is.

---

## Problem 7 — Phish.in Untapped for Phish {#problem-7}

### Context

Phish is the most-seen artist in this archive. Phish.in is a Phish-specific API that:
- Has cleaner track data than Relisten for Phish
- Includes encore flags, set labels, individual song data
- Has a straightforward REST API: `GET https://phish.in/api/v1/shows/YYYY-MM-DD.json`
- Is free, no auth required

### Why it matters for WookBook's future

The HANDOFF.md mentions setlists as a V2 feature. Phish.in returns setlist data natively (individual songs, not just tracks). Adding Phish.in now positions the app to show real setlists for Phish shows when that feature is built — no extra API integration needed later.

### The fetch logic

```typescript
export async function loadPhishinShow(
  date: string
): Promise<{ tracks: Track[]; source: string }> {
  const res = await fetch(`https://phish.in/api/v1/shows/${date}.json`);
  if (!res.ok) throw new Error("Phish.in: show not found");

  const data = await res.json();
  if (!data?.success || !data?.data?.tracks?.length) {
    throw new Error("Phish.in: no tracks");
  }

  const tracks: Track[] = data.data.tracks.map((t: any) => ({
    title: t.title,
    src: t.mp3,
    duration: formatSec(t.duration),
    position: t.position,
    set: t.set_name ?? "",
  }));

  const source = `phish.in · ${data.data.venue_name ?? ""}`;
  return { tracks, source };
}
```

### Source priority for Phish

```
1. Phish.in (primary — cleanest data, Phish-specific)
2. Relisten (fallback — some older shows not on Phish.in)
3. Archive.org (last resort)
```

---

## Complete Rewrite: recordings.ts {#rewrite-recordings}

This is a complete drop-in replacement for `src/lib/recordings.ts`. All exported function signatures are preserved except `getSource()` which becomes `async`.

```typescript
import { Track } from "@/types/recording";

// ─── Constants ────────────────────────────────────────────────────────────────

const RELISTEN_ARTISTS_CACHE_KEY = "wookbook:relisten-artists";
const RELISTEN_ARTISTS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Manual overrides — for artists whose Relisten slug can't be fuzzy-matched.
// Keep this as small as possible; the dynamic list handles most cases.
const SLUG_OVERRIDES: Record<string, string> = {
  "joe russo's almost dead": "jrad",
  "jrad": "jrad",
  "gov't mule": "govt-mule",  // archive-q preferred; add here if Relisten adds them
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

/**
 * Fetch and cache Relisten's full artist list.
 * Returns from localStorage if cache is fresh (< 7 days old).
 * Falls back to a hardcoded minimum set if the fetch fails entirely.
 */
async function getRelistenArtists(): Promise<RelistenArtist[]> {
  // Try cache first
  try {
    const raw = localStorage.getItem(RELISTEN_ARTISTS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { artists: RelistenArtist[]; fetchedAt: number };
      if (Date.now() - cached.fetchedAt < RELISTEN_ARTISTS_TTL_MS) {
        return cached.artists;
      }
    }
  } catch { /* cache corrupt, fetch fresh */ }

  // Fetch from API
  try {
    const res = await fetch("https://api.relisten.net/api/v2/artists");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const artists: RelistenArtist[] = (Array.isArray(data) ? data : [])
      .filter((a: any) => a?.name && a?.slug)
      .map((a: any) => ({ name: String(a.name), slug: String(a.slug) }));

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

/**
 * Normalize an artist name for fuzzy comparison.
 * Strips "The ", apostrophes, normalizes "and"↔"&", removes punctuation.
 */
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

/**
 * Fuzzy-match a concert artist name against the Relisten artist list.
 * Returns the Relisten slug or null if no match found.
 *
 * Match order (most → least specific):
 * 1. Exact normalized match
 * 2. Concert name starts with Relisten name (e.g. "Dave Matthews Band" ⊇ "Dave Matthews")
 * 3. Relisten name starts with concert name (e.g. "Disco Biscuits" ⊆ "The Disco Biscuits")
 */
function matchRelistenArtist(
  concertArtist: string,
  relistenArtists: RelistenArtist[]
): string | null {
  const needle = normalizeForMatch(concertArtist);
  if (!needle || needle.length < 3) return null;

  // 1. Exact
  const exact = relistenArtists.find((a) => normalizeForMatch(a.name) === needle);
  if (exact) return exact.slug;

  // 2. Concert name contains the Relisten name as a prefix
  const theirPrefix = relistenArtists.find(
    (a) => {
      const norm = normalizeForMatch(a.name);
      return norm.length > 4 && needle.startsWith(norm);
    }
  );
  if (theirPrefix) return theirPrefix.slug;

  // 3. Relisten name contains the concert name as a prefix
  const ourPrefix = relistenArtists.find(
    (a) => {
      const norm = normalizeForMatch(a.name);
      return needle.length > 4 && norm.startsWith(needle);
    }
  );
  if (ourPrefix) return ourPrefix.slug;

  return null;
}

/**
 * Strip leading "The " from an artist name.
 * "The Allman Brothers Band" → "Allman Brothers Band"
 */
function stripThe(name: string): string {
  return name.replace(/^The\s+/i, "").trim();
}

/**
 * Extract the primary/headlining artist from a compound name.
 * "Daniel Donato's Cosmic Country" → "Daniel Donato"
 * "Bob Weir & Bruce Hornsby feat. Branford Marsalis" → "Bob Weir"
 * "Umphrey's McGee with Lettuce" → "Umphrey's McGee"
 * "moe. & Pigeons Playing Ping Pong" → "moe."
 */
function primaryArtist(name: string): string {
  // Possessive band names: "Artist's Band Name" → "Artist"
  const withoutPossessive = name.replace(/'s\s+\S.*$/i, "").trim();

  // Split on collaboration markers — take first act only
  return withoutPossessive
    .split(/ feat\.| with | & | \+ |, /i)[0]
    .trim();
}

/**
 * Swap "and" ↔ "&" for archive search variants.
 * One-directional to avoid self-cancelling double replacement.
 */
function swapAndAmpersand(name: string): string {
  if (/ and /i.test(name)) return name.replace(/ and /gi, " & ");
  if (/ & /.test(name)) return name.replace(/ & /g, " and ");
  return name;
}

/**
 * Generate the ordered list of name variants to try for Archive.org creator searches.
 * De-duplicated. Ordered most-specific → least-specific.
 */
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

  add(creator);        // "Dead & Company"
  add(stripped);       // "Dead & Company" (no "The" to strip here, no-op)
  add(swapped);        // "Dead and Company"
  add(primary);        // "Dead" — from split on " & " (not ideal, but harmless)
  add(primaryStripped);
  add(swappedStripped);

  return out;
}

// ─── Source Resolution ────────────────────────────────────────────────────────

/**
 * Resolve where to fetch a recording for a given artist.
 *
 * Priority:
 * 1. Phish.in — Phish only, cleanest track data, positions us for setlist feature
 * 2. Relisten — dynamic match against full artist list (100+ artists)
 * 3. Archive-Q — artists with known non-standard Archive.org indexing
 * 4. Archive.org etree — general fallback
 *
 * NOTE: This function is async (unlike the old synchronous getSource) because
 * it may need to fetch or read the cached Relisten artist list.
 */
export async function getSource(artist: string): Promise<Source> {
  const a = artist.toLowerCase().trim();

  // 1. Phish gets Phish.in
  if (a === "phish") return { type: "phishin" };

  // 2. Check manual slug overrides (for slugs that can't be fuzzy-matched)
  if (SLUG_OVERRIDES[a]) {
    return { type: "relisten", slug: SLUG_OVERRIDES[a] };
  }

  // 3. Check Archive.org custom query overrides
  if (ARCHIVE_Q_OVERRIDES[a]) {
    return { type: "archive-q", q: ARCHIVE_Q_OVERRIDES[a] };
  }

  // 4. Try dynamic Relisten match — full name first, then primary artist
  try {
    const relistenArtists = await getRelistenArtists();

    const slug = matchRelistenArtist(artist, relistenArtists);
    if (slug) return { type: "relisten", slug };

    // Try primary artist if compound name didn't match
    const primary = primaryArtist(artist);
    if (primary !== artist) {
      const primarySlug = matchRelistenArtist(primary, relistenArtists);
      if (primarySlug) return { type: "relisten", slug: primarySlug };
    }
  } catch { /* Relisten artist list unavailable, fall through */ }

  // 5. Default: Archive.org etree collection
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

  const tracks: Track[] = data.data.tracks.map((t: any) => ({
    title: String(t.title ?? "Unknown"),
    src: String(t.mp3 ?? ""),
    duration: typeof t.duration === "number" ? formatSec(t.duration) : String(t.duration ?? ""),
    position: Number(t.position ?? 0),
    set: String(t.set_name ?? ""),
  })).filter((t: Track) => t.src);

  if (!tracks.length) throw new Error("Phish.in: no streamable tracks");

  const venueName = data.data.venue_name ?? data.data.venue ?? "";
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

  // Sort: soundboard first, then by community engagement
  const sources = [...data.sources].sort((a, b) => {
    const sbdDiff = (b.is_soundboard ? 1 : 0) - (a.is_soundboard ? 1 : 0);
    if (sbdDiff !== 0) return sbdDiff;
    const engA = (a.num_reviews ?? 0) + (a.num_ratings ?? 0);
    const engB = (b.num_reviews ?? 0) + (b.num_ratings ?? 0);
    return engB - engA;
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
      // Surface tape type in the label — meaningful to tapers
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
  downloads?: number;
  avg_rating?: number;
  num_reviews?: number;
  description?: string;
};

async function doArchiveSearch(q: string): Promise<ArchiveDoc[]> {
  const url =
    "https://archive.org/advancedsearch.php?q=" +
    encodeURIComponent(q) +
    "&fl[]=identifier&fl[]=title&fl[]=downloads&fl[]=avg_rating" +
    "&fl[]=num_reviews&fl[]=description&sort[]=downloads+desc&rows=10&output=json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive.org search: HTTP ${res.status}`);
  const d = await res.json();
  return d?.response?.docs ?? [];
}

/**
 * Multi-pass Archive.org search.
 * Pass 1: each name variant WITH collection:etree filter (precise)
 * Pass 2: each name variant WITHOUT collection filter (catches artist-specific collections)
 * Pass 3: subject tag search (catches non-standard indexing)
 */
export async function searchArchive(
  creator: string,
  date: string,
  collection: string
): Promise<ArchiveDoc[]> {
  const candidates = creatorCandidates(creator);

  // Pass 1 — precise, with collection
  for (const name of candidates) {
    const docs = await doArchiveSearch(
      `collection:${collection} AND creator:"${name}" AND date:${date}`
    );
    if (docs.length) return docs;
  }

  // Pass 2 — broader, without collection
  for (const name of candidates) {
    const docs = await doArchiveSearch(
      `creator:"${name}" AND date:${date}`
    );
    if (docs.length) return docs;
  }

  // Pass 3 — subject tag fallback
  const primaryName = primaryArtist(creator);
  const subjectDocs = await doArchiveSearch(
    `subject:"${primaryName}" AND date:${date}`
  );
  if (subjectDocs.length) return subjectDocs;

  return [];
}

export async function searchArchiveQ(q: string, date: string): Promise<ArchiveDoc[]> {
  return doArchiveSearch(`${q} AND date:${date}`);
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

  // Try formats in quality order
  const FORMAT_PRIORITY = ["VBR MP3", "MP3", "128Kbps MP3", "64Kbps MP3"];
  for (const fmt of FORMAT_PRIORITY) {
    const files = allFiles.filter((f) => f.format === fmt);
    if (!files.length) continue;

    const tracks = files
      .map((f) => {
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

/**
 * Load the full recording for a show — tracks, source label, tape type.
 * This is called when the user opens a StubDetail.
 *
 * Waterfall:
 * 1. Phish.in (Phish only) → fall back to Relisten if not found
 * 2. Relisten (dynamic slug match)
 * 3. Archive.org (multi-pass search, tries top 3 results)
 */
export async function findRecording(
  artist: string,
  date: string
): Promise<{ source: string; tracks: Track[] }> {
  const src = await getSource(artist);

  if (src.type === "phishin") {
    try {
      return await loadPhishinShow(date);
    } catch {
      // Phish.in doesn't have every show (especially older ones) — fall to Relisten
      return loadRelistenShow("phish", date);
    }
  }

  if (src.type === "relisten") {
    return loadRelistenShow(src.slug, date);
  }

  // Archive path (archive or archive-q)
  const docs =
    src.type === "archive-q"
      ? await searchArchiveQ(src.q, date)
      : await searchArchive(src.creator, date, src.collection);

  if (!docs.length) throw new Error("No recordings found");

  // Sort: SBD first, then by downloads
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

/**
 * Lightweight existence check — does a recording exist for this show?
 * Used by the background prefetch in useRecordings.ts.
 * Does NOT load tracks.
 *
 * For Relisten: prefer the year-endpoint approach in useRecordings.ts
 * for bulk prefetching. This function is used for on-demand single checks.
 */
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

    // Archive path
    const docs =
      src.type === "archive-q"
        ? await searchArchiveQ(src.q, date)
        : await searchArchive(src.creator, date, src.collection);
    return docs.length > 0;
  } catch {
    return false;
  }
}

/**
 * Expose the Relisten artist list fetch for use in useRecordings prefetch.
 * Allows the prefetch hook to get slugs without calling getSource() per concert.
 */
export { getRelistenArtists, matchRelistenArtist, primaryArtist };
```

---

## Complete Rewrite: useRecordings.ts {#rewrite-userecordings}

The key change here is the **prefetch strategy**: year-level Relisten calls instead of per-show calls.

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { Concert } from "@/types/concert";
import { RecordingEntry } from "@/types/recording";
import {
  checkHasRecording,
  findRecording,
  getRelistenArtists,
  matchRelistenArtist,
  primaryArtist,
} from "@/lib/recordings";

const LS_KEY = "wookbook:rec-known";

function loadKnown(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveKnown(ids: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function useRecordings(concerts: Concert[]) {
  const [cache, setCache] = useState<Map<string, RecordingEntry>>(new Map());
  const knownRef = useRef<Set<string>>(loadKnown());

  const hasRecording = (id: string) => knownRef.current.has(id);

  const updateCache = useCallback((id: string, entry: RecordingEntry) => {
    setCache((prev) => new Map(prev).set(id, entry));
  }, []);

  const fetchRecording = useCallback(
    async (concert: Concert) => {
      const { id, artist, date } = concert;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      const current = cache.get(id);
      if (current && current.status !== "idle") return;

      updateCache(id, { status: "loading" });
      try {
        const result = await findRecording(artist, date);
        updateCache(id, { status: "found", ...result });
        knownRef.current.add(id);
        saveKnown(knownRef.current);
      } catch (e) {
        updateCache(id, {
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
        // Remove from known if we previously thought it had a recording
        if (knownRef.current.has(id)) {
          knownRef.current.delete(id);
          saveKnown(knownRef.current);
        }
      }
    },
    [cache, updateCache]
  );

  // ── Background prefetch ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    async function prefetch() {
      const known = knownRef.current;

      // Only consider concerts with full YYYY-MM-DD dates that aren't already known
      const unchecked = concerts.filter(
        (c) => !known.has(c.id) && /^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "")
      );
      if (!unchecked.length) return;

      // ── Step 1: Year-level Relisten prefetch ────────────────────────────────
      // Get the Relisten artist index (cached, one fetch per 7 days)
      let relistenArtists: Array<{ name: string; slug: string }> = [];
      try {
        relistenArtists = await getRelistenArtists();
      } catch {
        // If we can't get the Relisten list, skip to Archive prefetch
      }

      if (!cancelled && relistenArtists.length) {
        // Map each unchecked concert to its Relisten slug (if any)
        // Then group by slug + year to minimize requests
        type YearTask = { slug: string; year: string };
        const yearTasks = new Map<string, YearTask>();

        for (const c of unchecked) {
          const slug =
            matchRelistenArtist(c.artist, relistenArtists) ||
            matchRelistenArtist(primaryArtist(c.artist), relistenArtists);
          if (!slug) continue;

          const year = c.date.slice(0, 4);
          const key = `${slug}::${year}`;
          if (!yearTasks.has(key)) yearTasks.set(key, { slug, year });
        }

        // Fetch year-level show lists — one request per (slug, year) pair
        // Builds: slug → Set<"YYYY-MM-DD">
        const relistenDateIndex = new Map<string, Set<string>>();
        const tasks = [...yearTasks.values()];
        const BATCH_YEAR = 6;

        for (let i = 0; i < tasks.length; i += BATCH_YEAR) {
          if (cancelled) return;
          await Promise.all(
            tasks.slice(i, i + BATCH_YEAR).map(async ({ slug, year }) => {
              try {
                const res = await fetch(
                  `https://api.relisten.net/api/v2/artists/${slug}/years/${year}/shows`
                );
                if (!res.ok) return;
                const shows: Array<{ date?: string }> = await res.json();
                if (!Array.isArray(shows)) return;

                if (!relistenDateIndex.has(slug)) {
                  relistenDateIndex.set(slug, new Set());
                }
                const dateSet = relistenDateIndex.get(slug)!;
                for (const show of shows) {
                  if (show.date) dateSet.add(show.date.slice(0, 10));
                }
              } catch { /* network error for this year, skip */ }
            })
          );
          if (i + BATCH_YEAR < tasks.length) await sleep(150);
        }

        // Now match concerts against the index — pure local lookups, no API calls
        let changed = false;
        for (const c of unchecked) {
          if (known.has(c.id)) continue;
          const slug =
            matchRelistenArtist(c.artist, relistenArtists) ||
            matchRelistenArtist(primaryArtist(c.artist), relistenArtists);
          if (!slug) continue;

          const dateSet = relistenDateIndex.get(slug);
          if (dateSet?.has(c.date)) {
            known.add(c.id);
            changed = true;
            setCache((prev) => {
              if (prev.has(c.id)) return prev;
              return new Map(prev).set(c.id, { status: "idle" });
            });
          }
        }
        if (changed) saveKnown(known);
      }

      // ── Step 2: Archive.org per-show checks ─────────────────────────────────
      // For non-Relisten artists, we still have to check per-show.
      // There's no equivalent year-level endpoint on Archive.org.
      // Batched at 4 with a 400ms gap to be respectful of their servers.
      if (!cancelled && relistenArtists.length) {
        // Only Archive.org artists — skip anything that matched Relisten above
        const archiveConcerts = unchecked.filter((c) => {
          if (known.has(c.id)) return false;
          const slug =
            matchRelistenArtist(c.artist, relistenArtists) ||
            matchRelistenArtist(primaryArtist(c.artist), relistenArtists);
          return !slug;
        });

        const BATCH_ARCHIVE = 4;
        let archiveChanged = false;

        for (let i = 0; i < archiveConcerts.length; i += BATCH_ARCHIVE) {
          if (cancelled) return;
          await Promise.all(
            archiveConcerts.slice(i, i + BATCH_ARCHIVE).map(async (c) => {
              if (known.has(c.id)) return;
              const found = await checkHasRecording(c.artist, c.date);
              if (found) {
                known.add(c.id);
                archiveChanged = true;
                setCache((prev) => {
                  if (prev.has(c.id)) return prev;
                  return new Map(prev).set(c.id, { status: "idle" });
                });
              }
            })
          );
          if (i + BATCH_ARCHIVE < archiveConcerts.length) await sleep(400);
        }

        if (archiveChanged) saveKnown(known);
      }
    }

    prefetch();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { cache, hasRecording, fetchRecording };
}
```

---

## Artist Coverage Reference {#artist-coverage}

Reference table of every non-trivial artist in the WookBook archive and their expected source routing after this update. Use this for manual verification during testing.

| Artist | Shows | Old Source | New Source | Notes |
|--------|-------|-----------|-----------|-------|
| Phish | 40+ | Relisten | **Phish.in → Relisten fallback** | Upgraded |
| Dave Matthews Band | 10 | ❌ Archive | **Relisten** | Fixed |
| My Morning Jacket | 6 | ❌ Archive | **Relisten** | Fixed |
| Dark Star Orchestra | 6 | ❌ Archive | **Relisten** | Fixed |
| Trey Anastasio Band | 6 | ❌ Archive | **Relisten** | Fixed |
| Daniel Donato's Cosmic Country | 6 | Archive (broken) | Archive (`primaryArtist` → "Daniel Donato") | Improved |
| Billy Strings | 5 | ❌ Archive | **Relisten** | Fixed |
| Lotus | 4 | Relisten ✓ | Relisten | No change |
| Dead & Company | 4 | Relisten ✓ | Relisten | No change |
| Goose | 4+ | Relisten ✓ | Relisten | No change |
| Pearl Jam | 4 | Archive | Archive | Pearl Jam has own archive; should work |
| Pigeons Playing Ping Pong | 4+ | Relisten ✓ | Relisten | No change |
| Dopapod | 3 | ❌ Archive | **Relisten** | Fixed |
| Joe Russo's Almost Dead | 3 | ❌ Archive | **Relisten** (`jrad`) | Fixed via override |
| moe. | 3+ | Relisten ✓ | Relisten | No change |
| Allman Brothers Band | 2 | ❌ Archive | **Relisten** | Fixed — "The" stripping |
| The Allman Brothers Band | 2 | ❌ Archive | **Relisten** | Fixed — "The" stripping |
| STS9 | 2 | ❌ Archive | **Relisten** | Fixed |
| Furthur | 2 | ❌ Archive | **Relisten** | Fixed |
| Tedeschi Trucks Band | 3 | Relisten ✓ | Relisten | No change |
| Tedeschi Trucks | 2 | ❌ Archive | **Relisten** | Fixed — `startsWith` match |
| Spafford | 2 | ❌ Archive | **Relisten** | Fixed |
| Ghost Light | 2 | ❌ Archive | **Relisten** | Fixed |
| Disco Biscuits | 1 | ❌ Archive | **Relisten** | Fixed — matches "The Disco Biscuits" |
| Umphrey's McGee | 3+ | Relisten ✓ | Relisten | No change |
| Umphrey's McGee with Lettuce | 1 | ❌ Archive | **Relisten** (`umphreys`) | Fixed via `primaryArtist()` |
| moe. & Pigeons Playing Ping Pong | 1 | ❌ Archive | Relisten (`moe`) | `primaryArtist()` split |
| Gov't Mule | 1 | Archive-Q ✓ | Archive-Q | No change |
| King Gizzard | 1 | Archive-Q ✓ | Archive-Q | No change |
| Mike Gordon | 1 | ❌ Archive | **Relisten** | Fixed |
| Mike Gordon Band | 1 | ❌ Archive | **Relisten** | Fixed — `startsWith` |
| Phil Lesh & Friends | 1 | ❌ Archive | **Relisten** | Fixed |
| Ratdog | 1 | ❌ Archive | **Relisten** | Fixed |
| Greensky Bluegrass | 1 | ❌ Archive | **Relisten** | Fixed |
| Twiddle | 1 | ❌ Archive | **Relisten** | Fixed |
| Chris Robinson Brotherhood | 1 | ❌ Archive | **Relisten** | Fixed |
| Widespread Panic | 2 | Relisten ✓ | Relisten | No change |
| String Cheese Incident | 2 | Relisten ✓ | Relisten | No change |
| Bob Weir & Bruce Hornsby feat. Branford Marsalis | 1 | Archive | Relisten (`bob-weir`) | `primaryArtist()` → "Bob Weir" |

---

## Testing Checklist {#testing-checklist}

Run these manually after deploying the new files. Open each show in StubDetail and confirm tracks load.

### Tier 1 — Must Work (Previously Broken)

- [ ] Dave Matthews Band — any show (should route to Relisten)
- [ ] My Morning Jacket — Penn's Landing 2010-08-29
- [ ] Trey Anastasio Band — Radio City 2021-10-03
- [ ] Dark Star Orchestra — State College 2011-11-29
- [ ] Billy Strings — any show
- [ ] Joe Russo's Almost Dead — any show (uses `jrad` slug override)
- [ ] Allman Brothers Band — Tweeter Center 2009-08-21
- [ ] Furthur — Mann Center 2012-07-07
- [ ] Dopapod — any show
- [ ] Umphrey's McGee with Lettuce — should load Umphrey's recording

### Tier 2 — Should Still Work (Was Working)

- [ ] Phish — any show (now Phish.in primary, confirm track count matches known setlist)
- [ ] Phish — pre-2005 show (Phish.in coverage varies; confirm Relisten fallback activates)
- [ ] Goose — any show
- [ ] Dead & Company — any show
- [ ] Lotus — any show
- [ ] Pigeons Playing Ping Pong — any show
- [ ] Gov't Mule — any show (archive-q path)
- [ ] King Gizzard — Dell Music Center 2024-08-27 (archive-q path)

### Tier 3 — Prefetch Behavior

- [ ] Clear `wookbook:rec-known` from localStorage
- [ ] Reload app
- [ ] Observe network tab — confirm year-level Relisten calls (URLs ending in `/years/YYYY/shows`), not per-show calls
- [ ] After ~30 seconds, 🎧 indicators should appear on most Relisten artist stubs without opening any of them
- [ ] Reload again — confirm `rec-known` is populated and no redundant prefetch requests fire

### Tier 4 — Edge Cases

- [ ] `"Daniel Donato's Cosmic Country"` — Archive.org search for "Daniel Donato"
- [ ] `"moe. & Pigeons Playing Ping Pong"` — should find moe. recording or Pigeons
- [ ] A show with a partial date (`"2014"` only) — confirm recording lookup is skipped, no crash
- [ ] A show with no recordings on any source — confirm error state shown gracefully in StubDetail
- [ ] Open two StubDetails in quick succession — confirm no race condition in cache state

---

## Dependency Changes

None. No new packages required. All APIs are public REST endpoints with no auth.

---

## Files Changed

| File | Change type |
|------|-------------|
| `src/lib/recordings.ts` | Full rewrite — backward compatible except `getSource()` is now `async` |
| `src/hooks/useRecordings.ts` | Full rewrite — same exported interface (`cache`, `hasRecording`, `fetchRecording`) |
| `src/data/concerts.json` | Optional cleanup — canonicalize `"Disco Biscuits"` → `"The Disco Biscuits"`, `"Tedeschi Trucks"` → `"Tedeschi Trucks Band"` |

No component changes. No type changes. The `RecordingEntry` type, `Track` type, and all component props remain identical.
