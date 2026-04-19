# WookBook — Agent Handoff Document

## What This Is

WookBook is a personal concert archive web app for one user (Bob). It is a React + TypeScript + Tailwind (shadcn/ui) single-page application that:

- Displays Bob's full concert history (335 shows, 140 artists, 21 years)
- Integrates live recordings from Relisten.net and archive.org
- Has a built-in audio player
- Lets Bob add personal star ratings and memory notes to any show
- Has upcoming shows and wishlist sections

**Repo:** https://github.com/bobmcdonough215/wookbook  
**Local path:** `~/Desktop/wookbook`  
**Dev server:** `cd ~/Desktop/wookbook && npx vite` (runs on port 8080 or 8081)

---

## Stack

- **React 18** + **TypeScript**
- **Vite** (build tool, dev server)
- **Tailwind CSS** + **shadcn/ui** (Radix UI primitives)
- **TanStack React Query** (installed but not heavily used yet)
- **Sonner** (toast notifications)
- **react-router-dom** (routing, currently just `/` and `*`)
- **No backend** — everything is localStorage + external APIs

---

## Project Structure

```
wookbook/
├── index.html                  ← entry point, SVG favicon linked here
├── public/
│   ├── favicon.ico             ← oxblood W icon (custom generated, NOT Lovable)
│   └── favicon.svg             ← SVG version (preferred by browsers)
├── src/
│   ├── data/
│   │   └── concerts.json       ← 335 seed concerts (DO NOT edit manually)
│   ├── types/
│   │   ├── concert.ts          ← Concert, WishlistItem, UpcomingItem types + date helpers
│   │   └── recording.ts        ← Track, RecordingEntry types
│   ├── lib/
│   │   ├── recordings.ts       ← all API logic (Relisten + archive.org)
│   │   ├── storage.ts          ← useLocalStorage hook + uid()
│   │   └── utils.ts            ← shadcn cn() utility
│   ├── hooks/
│   │   ├── useRecordings.ts    ← recording cache + background prefetch
│   │   └── useRecordingPlayer.ts ← audio playback state
│   ├── components/
│   │   ├── AppSidebar.tsx      ← collapsible sidebar: nav + artist list
│   │   ├── ArchiveView.tsx     ← main archive grid with search/filter/sort
│   │   ├── AudioPlayer.tsx     ← sticky bottom player bar
│   │   ├── RecordingSection.tsx ← tracklist inside StubDetail
│   │   ├── StubCard.tsx        ← ticket stub card (the core visual element)
│   │   ├── StubDetail.tsx      ← dialog: show details + recording + rating + memory
│   │   ├── Stats.tsx           ← "By the Numbers" view
│   │   ├── UpcomingView.tsx    ← upcoming shows section
│   │   └── WishlistView.tsx    ← wishlist section
│   └── pages/
│       └── Index.tsx           ← root page, wires everything together
```

---

## Design System

The visual theme is an **editorial concert ticket stub** aesthetic:
- **Oxblood** (`hsl(354 60% 28%)` ≈ `#721D25`) — primary color, used on card left panel, buttons, player bar
- **Bone** (`hsl(36 30% 96%)`) — background / primary-foreground
- **Brass** (`hsl(38 65% 52%)`) — accent color for ratings, highlights
- **Ink** — near-black for borders and text

CSS classes of note (defined in `src/index.css`):
- `.grain` — subtle paper texture on the page background
- `.stamp` — small uppercase mono tracking label style
- `.ink-rule` — thin horizontal divider
- `.brass-rule` — thicker brass-colored divider
- `.stub-divider-v` — vertical perforated line between ticket counterfoil and body

Fonts:
- **Fraunces** (`font-display`) — headings, artist names, ticket body
- **Inter** — body text
- **JetBrains Mono** (`font-mono`) — labels, metadata, timestamps

---

## Data Model

### Concert (seed data, `src/data/concerts.json`)
```typescript
type Concert = {
  id: string;           // "seed-0000" through "seed-014e" (hex-padded)
  artist: string;
  event?: string;       // e.g. "Farm Aid", "An Evening with..."
  venue: string;
  city: string;
  state: string;        // also used for country (e.g. "UK", "Canada")
  date: string;         // YYYY-MM-DD, YYYY-MM, or YYYY
  special_notes?: string;
  rating?: number;      // 1-5, set by user
  memory?: string;      // personal note, set by user
};
```

### localStorage Keys
All keys are prefixed `wookbook:` — never use `stubarchive:` (old name, fully replaced).

| Key | Contents |
|-----|----------|
| `wookbook:archive-extras` | `Concert[]` — user edits/additions that override or extend seed data |
| `wookbook:upcoming` | `UpcomingItem[]` — upcoming shows |
| `wookbook:wishlist` | `WishlistItem[]` — wishlist |
| `wookbook:rec-known` | `string[]` — array of concert IDs known to have recordings (persisted across sessions) |

### Merge Pattern (Index.tsx)
Seed concerts load from JSON. User edits are stored in `wookbook:archive-extras`. At runtime these are merged: extras override seeds by ID, or append if new. Seed concerts cannot be deleted (only edited — edits create an extras entry with the same ID).

---

## Recording Integration

This is the most complex part of the app. Here's a complete explanation.

### How It Works (Overview)

1. On page load, `useRecordings` hook runs `prefetchAll()` in the background — it quietly checks every concert with a full `YYYY-MM-DD` date to see if a recording exists, and marks known ones in localStorage.
2. When a user opens a `StubDetail` (by clicking a StubCard), `fetchRecording()` is called — this does the full fetch including tracklist.
3. If a recording is found, `🎧` appears on the StubCard, and tracks are playable in the StubDetail dialog.
4. Clicking a track starts the `AudioPlayer` (sticky bar at bottom of page, oxblood red).

### Source Routing (`src/lib/recordings.ts` → `getSource()`)

Each artist routes to one of three source types:

| Source type | How it works |
|-------------|--------------|
| `relisten` | Uses Relisten.net API. Has a known slug mapping. |
| `archive` | Uses archive.org `advancedsearch.php` with `creator:"Artist Name"` + `collection:etree` |
| `archive-q` | Custom archive.org query for artists with tricky names |

**Relisten slug map** (artists with dedicated Relisten support):
- Phish, Goose, Grateful Dead, Dead & Company, Lotus, Pigeons Playing Ping Pong, Tedeschi Trucks Band, Widespread Panic, moe., String Cheese Incident, Umphrey's McGee, The Disco Biscuits

**Special archive-q cases:**
- Gov't Mule → `GovtMule AND collection:etree`
- King Gizzard and the Lizard Wizard → `creator:"King Gizzard & The Lizard Wizard" AND collection:etree`

**Default fallback:** `collection:etree AND creator:"<artist name>"`

### Compound Artist Name Handling

`primaryArtist(name)` splits on ` & `, ` feat.`, ` with ` (case-insensitive) to get the primary artist for archive searches. Example: "Bob Weir & Bruce Hornsby feat. Branford Marsalis" → "Bob Weir".

`searchArchive()` has a 3-level fallback:
1. Try full artist name
2. Try `primaryArtist(name)` if different
3. Try swapping "and" ↔ "&" if different

### Relisten API

**Existence check:** `GET https://api.relisten.net/api/v2/artists/{slug}/shows/{date}`
- Returns show data with `sources[]` if a recording exists
- Returns 404 or `{success: false}` if not

**Track fetch (same endpoint):** Parses `data.sources[].sets[].tracks[]` for `mp3_url`.  
Sources are sorted: SBD (soundboard) first, then by `num_reviews + num_ratings`.  
Duration comes from `track.duration` (raw seconds) → `formatSec()`.

### Archive.org API

**Search:** `https://archive.org/advancedsearch.php?q={query}&fl[]=identifier&...&output=json`  
Returns `response.docs[]` with `identifier`, `title`, `downloads`, `avg_rating`, `description`.

Results are sorted: SBD first (regex `/\bSBD\b|soundboard/i` on title+description), then by downloads.

**MP3 fetch:** `https://archive.org/metadata/{identifier}/files`  
Filters to `format === "VBR MP3"`. Duration field is normalized:
- If `length` looks like `MM:SS` → use as-is
- If `length` is raw seconds (float) → convert via `formatSec()`

**Important:** archive.org `advancedsearch.php` will fail with `ERR_CONNECTION_REFUSED` from `file://` origins. Always serve on localhost.

### Background Prefetch (`useRecordings.ts`)

Runs once on mount. Skips concerts already in `wookbook:rec-known`.

- Relisten concerts: batches of 8, 100ms gap between batches
- Archive concerts: batches of 5, 300ms gap between batches

When a new recording is found, the concert ID is added to `knownRef` (in-memory Set) and eventually persisted. The `hasRecording(id)` function checks this Set — it's what drives the `🎧` indicator on StubCards.

### RecordingEntry States

```typescript
type RecordingEntry =
  | { status: "idle" }      // known to have recording but tracks not loaded yet
  | { status: "loading" }   // fetch in progress
  | { status: "found"; source: string; tracks: Track[] }  // ready to play
  | { status: "error"; message: string };  // no recording or fetch failed
```

`"idle"` means the prefetch confirmed a recording exists but the user hasn't opened the detail yet. `fetchRecording()` upgrades it to `"loading"` then `"found"` or `"error"`.

### Audio Player

`useRecordingPlayer` manages a single `HTMLAudioElement` (created once on mount via `useRef`). Provides: `play(track)`, `pause()`, `toggle(track)`, `seek(time)`, `dismiss()`.

`AudioPlayer` component renders as a fixed bottom bar (oxblood red, bone text) with:
- Play/pause button
- Track title (uppercase mono)
- Artist · Date · Venue, City (from the concert context)
- Seek slider with current/total time

The `currentConcert` state in `Index.tsx` tracks which concert the player is associated with. It's set when `handlePlay(track, concert)` is called from `StubDetail`.

---

## Component Responsibilities

### `Index.tsx`
The root. Owns all top-level state: `extras`, `view`, `selectedArtist`, `search`, `currentConcert`. Instantiates `useRecordings` and `useRecordingPlayer`. Wires play/toggle handlers that set both the audio state and `currentConcert`. Renders the header (with stats strip: Shows / Artists / Venues / Years), sidebar, main content area, footer, and the conditional `AudioPlayer`.

### `StubCard.tsx`
The ticket stub card. Left panel (oxblood) shows: "Adm." / MON / DD / YYYY (stacked). No serial number. If `hasRecording` is true, renders `🎧` next to the artist name. Clicking the card opens `StubDetail`.

### `StubDetail.tsx`
Modal dialog. Shows concert metadata, then `RecordingSection`, then rating (1-5 stars) and memory textarea. On open, calls `onFetchRecording(concert)` to trigger the full track load. Injects the concert into play/toggle callbacks so `AudioPlayer` gets the context. Save stores rating/memory in `extras` (upgrading seed concerts to extras on first edit).

### `ArchiveView.tsx`
Search, year filter, sort, export/import controls. Renders the `StubCard` grid. Opens `StubDetail` by ID. Passes all recording props through. Export filename is `wookbook-{date}.json`.

### `AppSidebar.tsx`
Collapsible sidebar. Header shows "WookBook / WB". Artist list sorted by show count, filterable by search. Clicking an artist filters the archive view.

---

## What Doesn't Exist Yet (Future Work)

The user has mentioned these as future goals — nothing has been built yet:

- **User authentication / login** — each user would have their own concert library
- **User profiles** — public-facing profile pages
- **Multi-user support** — right now everything is hardcoded to Bob's 335 shows

The design should be built with this future in mind but don't over-engineer it now. The user is direct and prefers working features over abstractions.

---

## User Preferences & Working Style

- **Direct communicator** — brief responses preferred, no fluff
- **Jam band / live music fan** — Phish, Dead & Company, Goose, etc. are core artists
- **Autonomous work preferred** — user grants full permission to complete tasks without check-ins, as long as you stay inside the project folder
- **No Co-Authored-By lines** on git commits
- **No Lovable traces** — this project originated from a Lovable export. Any remaining Lovable references (branding, URLs, comments) are unwanted. The cleanup is considered complete as of this handoff.
- **No setlist URL field** — recording integration replaces it
- **No "mark as attended" flow** — user didn't want it

---

## Known Issues / Things to Watch

- The `useRecordings` prefetch fires on every fresh page load for concerts not yet in `rec-known`. After the first full run, the Set is cached in localStorage and subsequent loads are instant.
- Some concerts have incomplete dates (YYYY or YYYY-MM only) — recording lookup is skipped for these since APIs require full YYYY-MM-DD.
- The `StubDetail` `canDelete` prop only allows deletion of user-added `extras`, not the 335 seed concerts. Seed concerts can still have rating/memory saved (they get promoted to extras on first save).
- Import via the "Import" button in ArchiveView merges concerts into extras — IDs are preserved if present, generated if missing.
