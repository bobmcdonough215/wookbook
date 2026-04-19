# WookBook Session Changes — April 19, 2026

A full technical account of every bug encountered, diagnosed, and fixed in this session, plus new features added. Written for a developer picking up the codebase.

---

## 1. Relisten Year-Level Prefetch — Wrong API Endpoint

### The Error
Every single Relisten year-level prefetch call was returning HTTP 404. The browser console showed dozens of:
```
Failed to load resource: the server responded with a status of 404
api.relisten.net/api/v2/artists/billy-strings/years/2023/shows
api.relisten.net/api/v2/artists/lotus/years/2014/shows
api.relisten.net/api/v2/artists/umphreys/years/2018/shows
... (every artist, every year)
```

### Why It Was Happening
`useRecordings.ts` was calling:
```
https://api.relisten.net/api/v2/artists/${slug}/years/${year}/shows
```
This endpoint does not exist in the Relisten API. The `/shows` suffix was wrong. Because every call 404'd, the year-level prefetch was completely non-functional — no recording indicators populated on load, and users had to click each card individually to trigger a fetch.

### The Fix
Changed the URL to the correct endpoint:
```
https://api.relisten.net/api/v2/artists/${slug}/years/${year}
```
This endpoint returns a year object with an embedded `shows` array. Updated the response parsing accordingly:

```typescript
// Before
const shows: Array<{ date?: string }> = await res.json();
if (!Array.isArray(shows)) return;

// After
const data = await res.json();
const shows: Array<{ date?: string }> = Array.isArray(data) ? data : (data?.shows ?? []);
if (!Array.isArray(shows)) return;
```

### Why This Works
The Relisten API at `/years/{year}` returns either an array of shows directly or an object with a `.shows` property. The updated parsing handles both shapes defensively. The year-level prefetch now correctly builds a local date index, dramatically reducing per-card API calls.

---

## 2. Archive.org Returning Wrong Recordings (TV News Broadcast)

### The Error
Lotus 1/1/11 fetched a recording called something like "A Beautiful Lotus" — an unrelated archive.org item that happened to share the date. In another case, the player tried to load:
```
dn710708.ca.archive.org/0/items/KRON_20141227_010000_KRON_4_Evening_News/...
```
A local TV news broadcast from KRON 4.

### Why It Was Happening
`searchArchive()` runs three passes with progressively looser queries:
- **Pass 1:** `collection:etree AND creator:"Lotus" AND date:2014-12-27`
- **Pass 2:** `creator:"Lotus" AND date:2014-12-27` ← no collection filter
- **Pass 3:** `subject:"Lotus" AND date:2014-12-27` ← loosest

Pass 3 uses the `subject` field, which contains free-text tags. An archive.org item with "Lotus" mentioned in its subject tags and the same date would match — even if it's a news broadcast, a film, or an unrelated upload. Additionally, Pass 2 had no `mediatype` filter, so non-audio items could match.

### The Fix — Part A: Add `mediatype:audio` to Passes 2 and 3
```typescript
// Pass 2 — before
`creator:"${name}" AND date:${date}`

// Pass 2 — after
`mediatype:audio AND creator:"${name}" AND date:${date}`

// Pass 3 — before
`subject:"${primaryName}" AND date:${date}`

// Pass 3 — after
`mediatype:audio AND subject:"${primaryName}" AND date:${date}`
```

### The Fix — Part B: Post-Filter Results by Creator Field
Added `creator` to the fields fetched from archive.org's search API:
```
&fl[]=creator
```

Added `creator?: string` to the `ArchiveDoc` type.

Added a validation function:
```typescript
function creatorMatchesArtist(doc: ArchiveDoc, artist: string): boolean {
  if (!doc.creator) return true; // no creator field — don't reject
  const docCreator = normalizeForMatch(doc.creator);
  const candidates = creatorCandidates(artist).map(normalizeForMatch);
  return candidates.some(
    (c) => docCreator === c || docCreator.startsWith(c + " ") || c.startsWith(docCreator + " ")
  );
}
```

Applied to every pass in `searchArchive()`:
```typescript
const docs = (await doArchiveSearch(...)).filter((d) => creatorMatchesArtist(d, artist));
```

### Why Exact/Prefix Matching Instead of Substring
An initial implementation used `.includes()`, which caused "a beautiful lotus".includes("lotus") to return `true` — the same false positive we were trying to fix. The correct logic uses exact match or prefix match only:
- `docCreator === c` — the creator IS the artist
- `docCreator.startsWith(c + " ")` — creator starts with the artist name ("Lotus feat. X")
- `c.startsWith(docCreator + " ")` — our candidate starts with the creator ("Daniel Donato" is a prefix of "Daniel Donato's Cosmic Country")

This also correctly handles "Daniel Donato's Cosmic Country" — `creatorCandidates()` includes `"Daniel Donato"` via `primaryArtist()`, so archive.org items with `creator:"Daniel Donato"` still match.

---

## 3. Broken MP3 Derivatives on Archive.org (500 Errors)

### The Error
Some archive.org items list MP3 files in their metadata, but those files return HTTP 500 when actually requested. The app would find the item, extract the track list, display it in the UI, and then fail silently when the user hit play. Console showed:
```
Failed to load resource: the server responded with a status of 500
dn720308.ca.archive.org/0/items/goose2022-11-19.NeumannKMR82ishotgun.Pasternak.Flac24/Goose2022-11-19-Neum-KMR82i01.mp3
```

### Why It Was Happening
Archive.org auto-generates MP3 derivatives from uploaded FLAC sources. For some items, this derivative generation fails or the files are not accessible via the CDN. The metadata endpoint (`/metadata/{id}/files`) still lists these files with format "VBR MP3", but the actual download URLs return 500.

`getArchiveMP3s()` trusted the metadata and returned those tracks as playable without verifying accessibility. The player then tried to stream a broken URL.

### The Fix — Part A: HEAD Check Before Committing to a Format
```typescript
const FORMAT_PRIORITY = ["VBR MP3", "MP3", "128Kbps MP3", "64Kbps MP3", "Flac", "24bit Flac"];
for (const fmt of FORMAT_PRIORITY) {
  const files = allFiles.filter((f) => f.format === fmt);
  if (!files.length) continue;

  const firstSrc = "https://archive.org/download/" + identifier + "/" + encodeURIComponent(files[0].name);
  try {
    const check = await fetch(firstSrc, { method: "HEAD" });
    if (!check.ok) continue; // skip this format, try next
  } catch { continue; }

  // build and return tracks from this format
}
```

### The Fix — Part B: Add FLAC to Format Priority
Before this session, only MP3 formats were checked. FLAC was added as a fallback:
```typescript
["VBR MP3", "MP3", "128Kbps MP3", "64Kbps MP3", "Flac", "24bit Flac"]
```

Also updated the title cleanup regex:
```typescript
// Before
f.title || f.name.replace(/\.mp3$/i, "")

// After
f.title || f.name.replace(/\.(mp3|flac)$/i, "")
```

Modern browsers (Chrome, Firefox, Safari) all support FLAC natively, so this is safe to stream directly.

### Why This Works
The HEAD request is lightweight (no body transfer) and verifies the file is actually accessible on the CDN before we commit to that format. If VBR MP3 returns 500, the loop continues to `MP3`, then `128Kbps MP3`, then `64Kbps MP3`, then `Flac`, then `24bit Flac`. The Goose 2022-11-19 show at Santander Arena is a FLAC24 upload — the MP3 derivatives were broken, but the FLAC files served correctly.

---

## 4. Relisten `mp3_url` Fields Pointing to Broken Archive.org CDN URLs

### The Error
The Goose Santander Arena show (2022-11-19) is in Relisten's database. `loadRelistenShow("goose", "2022-11-19")` returned sources with tracks that had `mp3_url` fields set. But clicking play returned:
```
NotSupportedError: Failed to load because no supported source was found
```

### Why It Was Happening
Relisten's API exposes `mp3_url` fields in track objects, but for many recordings, these URLs point directly to archive.org CDN download links. The same archive.org item (`goose2022-11-19.NeumannKMR82ishotgun.Pasternak.Flac24`) whose MP3 derivatives were broken was also what Relisten's `mp3_url` pointed to. So the Relisten path returned "valid" tracks that were actually unplayable.

### The Fix — HEAD Check in `loadRelistenShow`
Added a HEAD check on the first track of each source before committing to it:

```typescript
if (tracks.length) {
  try {
    const check = await fetch(tracks[0].src, { method: "HEAD" });
    if (!check.ok) continue; // skip this source, try next
  } catch { continue; }

  // proceed to return this source's tracks
}
```

When all Relisten sources fail the HEAD check, `loadRelistenShow` throws, which triggers the existing fallback to `searchArchive()`. The archive.org fallback then finds the same item but, thanks to the format-level HEAD checks, skips the broken MP3s and uses the FLAC files instead.

---

## 5. Relisten Fallback to Archive.org When Show Is Missing

### The Error
Lotus 12/27/2014 returned:
```
No recording found — Relisten: HTTP 404
```
The show is not in Relisten's catalog for Lotus, but a recording may exist on archive.org.

### Why It Was Happening
`findRecording()` for a Relisten-matched artist would call `loadRelistenShow()` and if that threw (404 or no playable tracks), it would propagate the error with no fallback:

```typescript
// Before — no fallback
if (src.type === "relisten") {
  return loadRelistenShow(src.slug, date);
}
```

### The Fix
Wrapped the Relisten call in a try/catch that falls through to `searchArchive()`:

```typescript
if (src.type === "relisten") {
  try {
    return await loadRelistenShow(src.slug, date);
  } catch {
    // Show missing from Relisten — fall through to archive.org (audio only)
    const docs = await searchArchive(artist, date, "etree");
    if (!docs.length) throw new Error("No recordings found");
    // sort and try top 3 docs...
  }
}
```

### Why This Works
Relisten doesn't have every show for every artist it covers. For shows that exist on archive.org but not Relisten, this fallback finds and plays them. The `searchArchive()` call uses the same three-pass search with `mediatype:audio` and creator validation, so it won't pull in junk results.

---

## 6. Audio Playback Failures — Silent Errors

### The Error
When a track URL failed to load (500, 401, unsupported format), the browser audio element fired an error event but nothing happened in the UI. The user saw no feedback — the play button just stopped responding.

### Why It Was Happening
`useRecordingPlayer.ts` set up event listeners for `play`, `pause`, `ended`, `timeupdate`, and `durationchange` — but not `error`. The HTML `<audio>` element fires an `error` event when the source URL fails, but without a listener, it was silently swallowed.

### The Fix
Added an error event listener in `useRecordingPlayer.ts`:

```typescript
const [audioError, setAudioError] = useState<string | null>(null);

const onError = () => {
  setIsPlaying(false);
  setAudioError("This recording couldn't be played — the audio file may be unavailable.");
};

audio.addEventListener("error", onError);
```

Cleared the error when a new track starts:
```typescript
setAudioError(null);
audio.src = track.src;
audio.play();
```

Returned `audioError` from the hook. In `Index.tsx`, wired it to a toast:
```typescript
useEffect(() => {
  if (audioError) toast.error(audioError);
}, [audioError]);
```

---

## 7. Audio Player — Prev/Next and Tracklist Panel

### What Was Missing
The player only showed play/pause, a scrubber, and a dismiss button. No way to skip tracks or see the full show tracklist without going back to the stub card.

### Implementation

**State change in `Index.tsx`:**
Added `currentTracks: Track[]` alongside `currentConcert`. Populated from the recording cache when a track is played:

```typescript
const handlePlay = (track: Track, concert?: Concert) => {
  play(track);
  if (concert) {
    setCurrentConcert(concert);
    const entry = recordingCache.get(concert.id);
    if (entry?.status === "found") setCurrentTracks(entry.tracks);
  }
};
```

**`AudioPlayer.tsx` changes:**
- Added `tracks: Track[]` and `onPlayTrack: (track: Track) => void` props
- Added internal `showTracklist: boolean` state
- Computed `currentIndex`, `hasPrev`, `hasNext` from `tracks` and current `track.src`
- Added `SkipBack` and `SkipForward` buttons — disabled at the ends of the tracklist
- Added `ListMusic` icon button that toggles a right-anchored floating tracklist panel

**Tracklist panel:**
- Positioned `absolute bottom-full right-0` — floats above the player bar on the right side
- 30% width with `min-w-[280px]`
- Scrollable up to `max-h-64`
- Has its own X button in the header to close
- Highlights the currently playing track in oxblood
- Clicking any track calls `onPlayTrack(t)` to jump to it

---

## 8. Artist Filter — No Way to Clear It

### What Was Missing
The "Filtering by artist: Goose" banner in `ArchiveView` had no dismiss button. Users had to navigate to a different view or reload to clear the filter.

### Implementation
Added `onClearArtist: () => void` to `ArchiveView` props. Added an X button to the banner:

```tsx
{selectedArtist && (
  <div className="flex items-center justify-between rounded-sm border-2 border-ink bg-primary/10 p-3 font-mono text-xs uppercase tracking-widest">
    <span>Filtering by artist: <span className="text-primary">{selectedArtist}</span></span>
    <button onClick={onClearArtist} aria-label="Clear artist filter">
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
)}
```

Wired in `Index.tsx`:
```tsx
onClearArtist={() => setSelectedArtist(null)}
```

---

## 9. "Various Artists" Hidden from Sidebar

### The Problem
Festival shows catalogued under "Various Artists" appeared in the artist sidebar list, making it look like "Various Artists" was a band the user had seen. It's a catch-all tag, not a real artist entry.

### The Fix
Filtered out during the `artists` memo computation in `AppSidebar.tsx`:

```typescript
.filter(([name]) => name !== "Various Artists" && (!needle || name.toLowerCase().includes(needle)))
```

The stubs still exist in the archive and are visible in the grid. They're only hidden from the artist filter list.

---

## 10. Concerts Added / Data Corrections

| ID | Change |
|---|---|
| `seed-0155` | Added: MJ Lenderman + Waxahatchee, The Met Philadelphia, 2026-04-18 |
| Multiple MMJ entries | Corrected dates from `2025-10-27/28` to `2023-10-27/28`; added correct 2025 show date `2025-10-11` |
| `seed-0002` (The Who) | Moved date from `special_notes` field to `date` field: `2006-09-12` |
| `seed-0003` (Farm Aid) | Added venue: Tweeter Center, Camden, NJ |
| `seed-00d9` (Goose, Santander) | Added `special_notes`: "Co-headline show, Goose and TAB" |
| `seed-0154` | Added: Trey Anastasio Band, Santander Arena, Reading PA, 2022-11-19 |
| `seed-014f–0153` | Added: Five Billy Strings shows (Atlantic City Hard Rock, Met Philadelphia, Fillmore) |

---

## Files Changed

| File | Nature of Change |
|---|---|
| `src/lib/recordings.ts` | HEAD checks, FLAC support, creator validation, archive.org multi-pass fixes, Relisten→archive fallback |
| `src/hooks/useRecordings.ts` | Fixed `/years/{year}` endpoint, fixed response parsing |
| `src/hooks/useRecordingPlayer.ts` | Added audio error event listener and `audioError` state |
| `src/components/AudioPlayer.tsx` | Prev/Next buttons, tracklist panel, new props |
| `src/components/ArchiveView.tsx` | Year separators in grid, `onClearArtist` X button |
| `src/components/AppSidebar.tsx` | Filter "Various Artists" from artist list |
| `src/pages/Index.tsx` | `currentTracks` state, `audioError` toast, `onClearArtist` wiring |
| `src/data/concerts.json` | Concert additions and date corrections (see above) |
| `src/pages/NotFound.tsx` | Redesigned to match WookBook design system |
| `src/components/ui/sonner.tsx` | Removed `next-themes` dependency, hardcoded `theme="light"` |
| `package.json` | Removed ~26 unused dependencies, renamed from template name |
| `tailwind.config.ts` | Fixed content array to correct paths |
