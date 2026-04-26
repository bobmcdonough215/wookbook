// api/check-tours.ts
// Daily Vercel cron — 9am UTC.
//
// Strategy: fixed US regional hubs, not per-user geo queries.
// 10 hubs × ~5 pages × 30 days = ~1,500 JamBase calls/month.
// That number does not grow with user count — only with hub count.
//
// Flow:
//   1. Load all users with home_lat/lng set + their watched artists
//   2. Pre-load existing tour_events and user_event_matches from DB
//   3. Run ALL hub geo queries in PARALLEL (Promise.allSettled)
//   4. Deduplicate events globally across all hubs in memory
//   5. Single bulk UPSERT into tour_events for all new events
//   6. Match events against every user's watched list in memory
//   7. Single bulk UPSERT into user_event_matches for all new matches
//   8. Send Ntfy notifications sequentially (intentional 200ms rate-limit)

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { maxDuration: 300 };

// ---------------------------------------------------------------------------
// Fixed regional hubs — covers the continental US at 350mi radius.
// Add/remove hubs here as your user base grows into new regions.
// Each hub = ~5 JamBase pages/day. Think before adding.
// ---------------------------------------------------------------------------
const HUBS = [
  { name: "New York",      lat: 40.71, lng: -74.01 },
  { name: "Philadelphia",  lat: 39.95, lng: -75.17 },
  { name: "Atlanta",       lat: 33.75, lng: -84.39 },
  { name: "Chicago",       lat: 41.88, lng: -87.63 },
  { name: "Nashville",     lat: 36.17, lng: -86.78 },
  { name: "Dallas",        lat: 32.78, lng: -96.80 },
  { name: "Denver",        lat: 39.74, lng: -104.98 },
  { name: "Los Angeles",   lat: 34.05, lng: -118.24 },
  { name: "Seattle",       lat: 47.61, lng: -122.33 },
  { name: "Miami",         lat: 25.77, lng: -80.19 },
] as const;

const GEO_RADIUS_MI = 350;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const AddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.object({
    alternateName: z.string().optional(),
  }).optional(),
}).optional();

const GeoSchema = z.object({
  latitude:  z.number().optional(),
  longitude: z.number().optional(),
}).optional();

const JambaseEventSchema = z.object({
  identifier:  z.string(),
  url:         z.string().optional(),
  startDate:   z.string(),
  eventStatus: z.string().optional(),
  type:        z.string().optional(),
  performer: z.array(z.object({
    name:            z.string().optional(),
    "x-isHeadliner": z.boolean().optional(),
  })).optional(),
  location: z.object({
    name:    z.string().optional(),
    address: AddressSchema,
    geo:     GeoSchema,
  }).optional(),
  offers: z.array(z.object({
    url:      z.string().optional(),
    category: z.string().optional(),
  })).optional(),
});

type JambaseEvent = z.infer<typeof JambaseEventSchema>;

const HOME_MARKET_RADIUS_MI = 60;

// ---------------------------------------------------------------------------
// User shape loaded from DB
// ---------------------------------------------------------------------------
type UserRecord = {
  id:         string;
  home_lat:   number;
  home_lng:   number;
  ntfy_topic: string | null;
  watchedMap: Map<string, string>; // lowercase artist name → original casing
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).end("Unauthorized");
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // -------------------------------------------------------------------------
  // 1. Load all users who have geocoded home coordinates
  // -------------------------------------------------------------------------
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, home_lat, home_lng, ntfy_topic")
    .not("home_lat", "is", null)
    .not("home_lng", "is", null);

  if (!profiles?.length) {
    res.json({ message: "No users with home coordinates set.", newEvents: 0, matches: 0 });
    return;
  }

  // -------------------------------------------------------------------------
  // 2. Load watched artists for all users in one query, group by user
  // -------------------------------------------------------------------------
  const { data: allWatched } = await supabase
    .from("watched_artists")
    .select("user_id, artist_name")
    .eq("muted", false)
    .in("user_id", profiles.map((p) => p.id));

  const watchedByUser = new Map<string, Map<string, string>>();
  for (const row of allWatched ?? []) {
    if (!watchedByUser.has(row.user_id)) {
      watchedByUser.set(row.user_id, new Map());
    }
    watchedByUser.get(row.user_id)!.set(row.artist_name.toLowerCase(), row.artist_name);
  }

  // Skip users with no watched artists
  const users: UserRecord[] = profiles
    .filter((p) => watchedByUser.has(p.id))
    .map((p) => ({
      id:         p.id,
      home_lat:   p.home_lat!,
      home_lng:   p.home_lng!,
      ntfy_topic: p.ntfy_topic ?? null,
      watchedMap: watchedByUser.get(p.id)!,
    }));

  if (!users.length) {
    res.json({ message: "No users with watched artists.", newEvents: 0, matches: 0 });
    return;
  }

  // -------------------------------------------------------------------------
  // 3. Pre-load existing DB state to avoid redundant round-trips later
  // -------------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);

  // external_id → tour_events.id for all future events already in DB
  const eventIdByExternalId = new Map<string, string>();
  const { data: existingEvents } = await supabase
    .from("tour_events")
    .select("id, external_id")
    .gte("date", today);

  for (const e of existingEvents ?? []) {
    eventIdByExternalId.set(e.external_id, e.id);
  }

  // "userId:tourEventId" set — checked in memory instead of per-match DB lookups
  const existingMatchKeys = new Set<string>();
  const { data: existingMatches } = await supabase
    .from("user_event_matches")
    .select("user_id, tour_event_id")
    .in("user_id", users.map((u) => u.id));

  for (const m of existingMatches ?? []) {
    existingMatchKeys.add(`${m.user_id}:${m.tour_event_id}`);
  }

  const knownExternalIds = new Set(eventIdByExternalId.keys());
  const errors: string[] = [];

  // -------------------------------------------------------------------------
  // PHASE 1 — Fire all hub fetches in PARALLEL
  //
  // Previously: sequential for...of — up to 45s of serial HTTP on first run.
  // Now: all 10 hubs run concurrently. Wall-clock time = slowest single hub.
  // Promise.allSettled so one failed hub never aborts the others.
  // -------------------------------------------------------------------------
  const hubResults = await Promise.allSettled(
    HUBS.map((hub) =>
      fetchJambaseGeo(hub.lat, hub.lng, GEO_RADIUS_MI, knownExternalIds)
        .then((events) => ({ hub: hub.name, events }))
    )
  );

  for (const result of hubResults) {
    if (result.status === "rejected") {
      const err = result.reason;
      errors.push(`hub fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 2 — Deduplicate events globally across all hubs (in memory)
  //
  // Philly and NYC hubs both cover overlapping territory. First-seen wins.
  // -------------------------------------------------------------------------
  const parsedByExternalId = new Map<string, JambaseEvent>();

  for (const result of hubResults) {
    if (result.status !== "fulfilled") continue;
    for (const rawEvent of result.value.events) {
      const parsed = JambaseEventSchema.safeParse(rawEvent);
      if (!parsed.success) continue;
      const ev = parsed.data;
      if (ev.eventStatus === "cancelled") continue;
      if (ev.startDate.slice(0, 10) < today) continue;
      if (!parsedByExternalId.has(ev.identifier)) {
        parsedByExternalId.set(ev.identifier, ev);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 3 — Single bulk UPSERT for all new tour_events
  //
  // Previously: one await supabase.insert() per event inside the loop.
  // ~1,000 events × ~80ms = up to 80s of serial DB writes.
  // Now: one upsert call for everything. ~500ms regardless of count.
  //
  // onConflict: "external_id" makes this idempotent — safe to re-run anytime.
  // fetched_at is omitted — Postgres default now() handles it automatically.
  // -------------------------------------------------------------------------
  const newEventsList = [...parsedByExternalId.values()].filter(
    (ev) => !eventIdByExternalId.has(ev.identifier)
  );

  if (newEventsList.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("tour_events")
      .upsert(
        newEventsList.map((ev) => ({
          external_id: ev.identifier,
          source:      "jambase",
          artist_name: primaryPerformerName(ev),
          date:        ev.startDate.slice(0, 10),
          venue_name:  ev.location?.name ?? null,
          venue_city:  ev.location?.address?.addressLocality ?? null,
          venue_state: ev.location?.address?.addressRegion?.alternateName ?? null,
          venue_lat:   ev.location?.geo?.latitude ?? null,
          venue_lng:   ev.location?.geo?.longitude ?? null,
          ticket_url:  (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary")?.url
                         ?? ev.url
                         ?? null,
          is_festival: ev.type === "Festival",
        })),
        { onConflict: "external_id" }
      )
      .select("id, external_id");

    if (insertError) {
      errors.push(`bulk_insert_tour_events: ${insertError.message}`);
    }

    // Populate map so the match phase can resolve DB ids for newly inserted rows
    for (const row of inserted ?? []) {
      eventIdByExternalId.set(row.external_id, row.id);
    }
  }

  const totalNewEvents = newEventsList.length;

  // -------------------------------------------------------------------------
  // PHASE 4 — Collect all user→event matches in memory
  //
  // Previously: one await supabase.upsert() per match inside nested loops.
  // ~500 matches × ~80ms = up to 40s of serial DB writes.
  // Now: collect all matches first, fire one bulk upsert after.
  //
  // Notification candidates are also collected here for Phase 5.
  // -------------------------------------------------------------------------
  type MatchRow = {
    user_id:        string;
    tour_event_id:  string;
    drive_hours:    number | null;
    is_home_market: boolean;
    notified_at:    null;
  };

  type NotifyCandidate = {
    ntfy_topic:  string;
    artistName:  string;
    isHome:      boolean;
    driveHours:  number | null;
    date:        string;
    venueName:   string | null;
    venueCity:   string | null;
    ticketUrl:   string;
    tourEventId: string;
    userId:      string;
  };

  const matchesToUpsert: MatchRow[]         = [];
  const notifyCandidates: NotifyCandidate[] = [];

  for (const [extId, ev] of parsedByExternalId) {
    const tourEventId = eventIdByExternalId.get(extId);
    if (!tourEventId) continue; // insert failed for this event — skip silently

    const venueLat  = ev.location?.geo?.latitude ?? null;
    const venueLng  = ev.location?.geo?.longitude ?? null;
    const date      = ev.startDate.slice(0, 10);
    const ticketUrl = (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary")?.url
                        ?? ev.url
                        ?? "";

    for (const user of users) {
      const matchedArtist = matchWatchedArtist(ev, user.watchedMap);
      if (!matchedArtist) continue;

      const matchKey = `${user.id}:${tourEventId}`;
      if (existingMatchKeys.has(matchKey)) continue; // already in DB

      const driveHours = await getDriveHours(user.home_lat, user.home_lng, venueLat, venueLng);
      const isHome     = isHomeMarket(user.home_lat, user.home_lng, venueLat, venueLng);

      matchesToUpsert.push({
        user_id:        user.id,
        tour_event_id:  tourEventId,
        drive_hours:    driveHours,
        is_home_market: isHome,
        notified_at:    null,
      });

      existingMatchKeys.add(matchKey); // prevent duplicates within this run

      // Queue notification candidates — sent after bulk upsert commits
      if (user.ntfy_topic && (isHome || (driveHours != null && driveHours <= 4))) {
        notifyCandidates.push({
          ntfy_topic:  user.ntfy_topic,
          artistName:  matchedArtist,
          isHome,
          driveHours,
          date,
          venueName:   ev.location?.name ?? null,
          venueCity:   ev.location?.address?.addressLocality ?? null,
          ticketUrl,
          tourEventId,
          userId:      user.id,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 4b — Single bulk UPSERT for user_event_matches
  //
  // ignoreDuplicates: true so that if a match row already exists (shouldn't
  // happen given the existingMatchKeys check above, but belt-and-suspenders),
  // we never overwrite a real notified_at timestamp with null.
  // -------------------------------------------------------------------------
  if (matchesToUpsert.length > 0) {
    const { error: matchError } = await supabase
      .from("user_event_matches")
      .upsert(matchesToUpsert, {
        onConflict:       "user_id,tour_event_id",
        ignoreDuplicates: true,
      });

    if (matchError) {
      errors.push(`bulk_upsert_matches: ${matchError.message}`);
    }
  }

  const totalNewMatches = matchesToUpsert.length;

  // -------------------------------------------------------------------------
  // PHASE 5 — Notifications (sequential, intentional 200ms rate-limit for Ntfy)
  //
  // Runs after all DB writes are committed — if the function times out here,
  // data is already safe. notified_at is written per-notification so partial
  // progress is preserved across retries.
  // -------------------------------------------------------------------------
  for (const candidate of notifyCandidates) {
    const locationParts = [candidate.venueName, candidate.venueCity].filter(Boolean);

    await sendNotification(candidate.ntfy_topic, {
      title:    `${candidate.artistName} — ${candidate.isHome ? "Home market!" : `${candidate.driveHours}h away`}`,
      body:     `${fmtDate(candidate.date)}${locationParts.length ? " · " + locationParts.join(", ") : ""}`,
      url:      candidate.ticketUrl,
      priority: "high",
    });

    await supabase
      .from("user_event_matches")
      .update({ notified_at: new Date().toISOString() })
      .eq("user_id", candidate.userId)
      .eq("tour_event_id", candidate.tourEventId);

    await sleep(200);
  }

  res.json({
    hubs:          HUBS.length,
    users:         users.length,
    newEvents:     totalNewEvents,
    matches:       totalNewMatches,
    notifications: notifyCandidates.length,
    errors:        errors.length ? errors : undefined,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the venue is within HOME_MARKET_RADIUS_MI of the user's home.
 * Uses the equirectangular approximation — accurate enough at these distances.
 * Falls back to false if venue coordinates are unavailable.
 */
function isHomeMarket(
  homeLat: number,
  homeLng: number,
  venueLat: number | null,
  venueLng: number | null
): boolean {
  if (venueLat == null || venueLng == null) return false;
  const dLat = (venueLat - homeLat) * 69;
  const dLng = (venueLng - homeLng) * Math.cos(homeLat * Math.PI / 180) * 69;
  return Math.sqrt(dLat * dLat + dLng * dLng) <= HOME_MARKET_RADIUS_MI;
}

/**
 * Match an event's performers against a user's watched artist map.
 * Checks headliners first, then support acts.
 * Returns the original-casing artist name on match, null otherwise.
 */
function matchWatchedArtist(
  ev: JambaseEvent,
  watchedMap: Map<string, string>
): string | null {
  const performers = ev.performer ?? [];
  const headliners = performers.filter((p) => p["x-isHeadliner"]);
  const ordered    = headliners.length
    ? [...headliners, ...performers.filter((p) => !p["x-isHeadliner"])]
    : performers;

  for (const p of ordered) {
    if (!p.name) continue;
    const match = watchedMap.get(p.name.toLowerCase());
    if (match) return match;
  }
  return null;
}

/**
 * Returns the headliner name (or first performer) for the canonical
 * artist_name stored on tour_events. Per-user matched artist name
 * comes from matchWatchedArtist at match time.
 */
function primaryPerformerName(ev: JambaseEvent): string {
  const performers = ev.performer ?? [];
  const headliner  = performers.find((p) => p["x-isHeadliner"]);
  return headliner?.name ?? performers[0]?.name ?? "Unknown Artist";
}

const STALE_THRESHOLD   = 15;
const MAX_PAGES_PER_HUB = 15;

/**
 * Paginated JamBase geo query for one hub. Returns raw event objects.
 * Bails early when STALE_THRESHOLD consecutive known events are seen —
 * avoids fetching deep pages that are almost entirely already in the DB.
 * In steady state (day 2+) this typically exits after page 1.
 */
async function fetchJambaseGeo(
  lat: number,
  lng: number,
  radiusMi: number,
  knownExternalIds: Set<string>
): Promise<unknown[]> {
  if (!process.env.JAMBASE_KEY) return [];

  const today = new Date().toISOString().slice(0, 10);
  const all: unknown[] = [];
  let page       = 1;
  let totalPages = 1;

  do {
    const url = new URL("https://api.data.jambase.com/v3/events");
    url.searchParams.set("geoLatitude",     String(lat));
    url.searchParams.set("geoLongitude",    String(lng));
    url.searchParams.set("geoRadiusAmount", String(radiusMi));
    url.searchParams.set("geoRadiusUnits",  "mi");
    url.searchParams.set("eventDateFrom",   today);
    url.searchParams.set("perPage",         "100");
    if (page > 1) url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${process.env.JAMBASE_KEY}`,
        "User-Agent":    "WookBook/1.0",
        "Accept":        "application/json",
      },
    });

    if (!res.ok) break;
    const data = await res.json();
    const events: unknown[] = Array.isArray(data.events) ? data.events : [];

    let consecutiveKnown = 0;
    let bailed           = false;

    for (const ev of events) {
      const id = (ev as any)?.identifier;
      if (id && knownExternalIds.has(id)) {
        consecutiveKnown++;
        if (consecutiveKnown >= STALE_THRESHOLD) {
          bailed = true;
          break;
        }
      } else {
        consecutiveKnown = 0;
      }
      all.push(ev);
    }

    if (bailed) break;

    totalPages = data.pagination?.totalPages ?? 1;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES_PER_HUB);

  return all;
}

/**
 * Drive time estimate via OpenRouteService.
 * Returns hours (1 decimal) or null if ORS_KEY not set or call fails.
 * AbortController enforces a 5s timeout — ORS is the flakiest dependency.
 */
async function getDriveHours(
  fromLat: number,
  fromLng: number,
  toLat:   number | null,
  toLng:   number | null
): Promise<number | null> {
  if (!toLat || !toLng || !process.env.ORS_KEY) return null;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_KEY}&start=${fromLng},${fromLat}&end=${toLng},${toLat}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data    = await res.json();
    const seconds = data.features?.[0]?.properties?.segments?.[0]?.duration;
    return seconds ? Math.round((seconds / 3600) * 10) / 10 : null;
  } catch {
    return null;
  }
}

async function sendNotification(
  topic: string,
  { title, body, url = "", priority = "default" }: {
    title: string; body: string; url?: string; priority?: string;
  }
) {
  await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      "Title":        title,
      "Priority":     priority,
      "Click":        url,
      "Content-Type": "text/plain",
    },
    body,
  });
}

const fmtDate = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
