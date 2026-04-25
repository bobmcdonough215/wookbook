// api/check-tours.ts
// Daily Vercel cron — 9am UTC.
//
// Strategy: fixed US regional hubs, not per-user geo queries.
// 10 hubs × ~5 pages × 30 days = ~1,500 JamBase calls/month.
// That number does not grow with user count — only with hub count.
//
// Flow:
//   1. Load all users with home_lat/lng set + their watched artists
//   2. Run one geo query per hub (deduplicated globally)
//   3. For each event returned, insert into tour_events if new
//   4. Match event performers against every user's watched list
//   5. Upsert user_event_matches — drive_hours computed per user
//   6. Notify each user via their own ntfy_topic

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { runtime: "edge" };

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
// Zod schemas — unchanged from original, kept here for self-containment
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
  // lowercase artist name → original casing
  watchedMap: Map<string, string>;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
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
    return Response.json({ message: "No users with home coordinates set.", newEvents: 0, matches: 0 });
  }

  // -------------------------------------------------------------------------
  // 2. Load watched artists for all users in one query, then group by user
  // -------------------------------------------------------------------------
  const { data: allWatched } = await supabase
    .from("watched_artists")
    .select("user_id, artist_name")
    .eq("muted", false)
    .in("user_id", profiles.map((p) => p.id));

  // Build per-user watched maps
  const watchedByUser = new Map<string, Map<string, string>>();
  for (const row of allWatched ?? []) {
    if (!watchedByUser.has(row.user_id)) {
      watchedByUser.set(row.user_id, new Map());
    }
    watchedByUser.get(row.user_id)!.set(row.artist_name.toLowerCase(), row.artist_name);
  }

  // Assemble full user records — skip users with no watched artists
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
    return Response.json({ message: "No users with watched artists.", newEvents: 0, matches: 0 });
  }

  // -------------------------------------------------------------------------
  // 3. Sweep all hubs — deduplicate events globally across hubs
  // -------------------------------------------------------------------------
  // external_id → tour_events DB id (populated as we insert)
  const eventIdByExternalId = new Map<string, string>();

  // Pre-load existing external_ids to avoid redundant DB round-trips
  // (only load future events — past ones don't matter)
  const today = new Date().toISOString().slice(0, 10);
  const { data: existingEvents } = await supabase
    .from("tour_events")
    .select("id, external_id")
    .gte("date", today);

  for (const e of existingEvents ?? []) {
    eventIdByExternalId.set(e.external_id, e.id);
  }

  // Pre-load all existing user_event_matches for future events into a Set.
  // Key format: "userId:tourEventId" — checked locally inside the hub loop,
  // avoiding up to 50,000 DB round-trips (10 hubs × 500 events × 10 users).
  const existingMatchKeys = new Set<string>();
  const { data: existingMatches } = await supabase
    .from("user_event_matches")
    .select("user_id, tour_event_id")
    .in("user_id", users.map((u) => u.id));

  for (const m of existingMatches ?? []) {
    existingMatchKeys.add(`${m.user_id}:${m.tour_event_id}`);
  }

  const knownExternalIds = new Set(eventIdByExternalId.keys());

  let totalNewEvents = 0;
  let totalNewMatches = 0;

  for (const hub of HUBS) {
    const rawEvents = await fetchJambaseGeo(hub.lat, hub.lng, GEO_RADIUS_MI, knownExternalIds);

    for (const rawEvent of rawEvents) {
      const parsed = JambaseEventSchema.safeParse(rawEvent);
      if (!parsed.success) continue;

      const ev = parsed.data;
      if (ev.eventStatus === "cancelled") continue;

      const date = ev.startDate.slice(0, 10);
      if (date < today) continue;

      // -----------------------------------------------------------------------
      // 3a. Insert into tour_events if not already seen (globally deduplicated)
      // -----------------------------------------------------------------------
      let tourEventId = eventIdByExternalId.get(ev.identifier);

      if (!tourEventId) {
        const lat = ev.location?.geo?.latitude ?? null;
        const lng = ev.location?.geo?.longitude ?? null;
        const primaryOffer = (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary");
        const ticketUrl = primaryOffer?.url ?? ev.url ?? null;

        const { data: inserted } = await supabase
          .from("tour_events")
          .insert({
            external_id:    ev.identifier,
            source:         "jambase",
            // Store primary performer name — matchWatchedArtist resolves this per-user below
            artist_name:    primaryPerformerName(ev),
            date,
            venue_name:     ev.location?.name ?? null,
            venue_city:     ev.location?.address?.addressLocality ?? null,
            venue_state:    ev.location?.address?.addressRegion?.alternateName ?? null,
            venue_lat:      lat,
            venue_lng:      lng,
            ticket_url:     ticketUrl,
            is_festival:    ev.type === "Festival",
            // Legacy columns — kept for now, no longer used by UI after RPC migration
            is_home_market: false,
            drive_hours:    null,
          })
          .select("id")
          .single();

        if (!inserted) continue;

        tourEventId = inserted.id as string;
        eventIdByExternalId.set(ev.identifier, tourEventId);
        totalNewEvents++;
      }

      // -----------------------------------------------------------------------
      // 3b. Match this event against every user's watched list
      // -----------------------------------------------------------------------
      for (const user of users) {
        const matchedArtist = matchWatchedArtist(ev, user.watchedMap);
        if (!matchedArtist) continue;

        // Skip if match already exists — local Set check, zero DB round-trips
        const matchKey = `${user.id}:${tourEventId}`;
        if (existingMatchKeys.has(matchKey)) continue;

        const venueLat = ev.location?.geo?.latitude ?? null;
        const venueLng = ev.location?.geo?.longitude ?? null;
        const driveHours = await getDriveHours(user.home_lat, user.home_lng, venueLat, venueLng);

        const isHome = isHomeMarket(user.home_lat, user.home_lng, venueLat, venueLng);

        const { error: matchError } = await supabase
          .from("user_event_matches")
          .upsert({
            user_id:        user.id,
            tour_event_id:  tourEventId,
            drive_hours:    driveHours,
            is_home_market: isHome,
            notified_at:    null,
          }, { onConflict: "user_id,tour_event_id" });

        if (matchError) continue;

        // Register in the Set so subsequent hubs don't re-process this match
        existingMatchKeys.add(matchKey);
        totalNewMatches++;

        // -------------------------------------------------------------------
        // 3c. Send immediate notification for close/home shows
        // -------------------------------------------------------------------
        if (user.ntfy_topic && (isHome || (driveHours != null && driveHours <= 4))) {
          await sendNotification(user.ntfy_topic, {
            title: `${matchedArtist} — ${isHome ? "Home market!" : `${driveHours}h away`}`,
            body:  `${fmtDate(date)} · ${[ev.location?.name, ev.location?.address?.addressLocality].filter(Boolean).join(", ")}`,
            url:   (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary")?.url ?? ev.url ?? "",
            priority: "high",
          });

          // Mark notified_at so we don't re-notify for the same event
          await supabase
            .from("user_event_matches")
            .update({ notified_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("tour_event_id", tourEventId);

          await sleep(200); // ntfy rate limit
        }
      }
    }
  }

  return Response.json({
    hubs:      HUBS.length,
    users:     users.length,
    newEvents: totalNewEvents,
    matches:   totalNewMatches,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the venue is within HOME_MARKET_RADIUS_MI of the user's home.
 * Uses the equirectangular approximation — accurate enough at the distances involved.
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
  const ordered = headliners.length
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
 * Returns the headliner name (or first performer) for use as the canonical
 * artist_name stored in tour_events. This is the global label for the event —
 * per-user matched artist name comes from matchWatchedArtist at match time.
 */
function primaryPerformerName(ev: JambaseEvent): string {
  const performers = ev.performer ?? [];
  const headliner = performers.find((p) => p["x-isHeadliner"]);
  return headliner?.name ?? performers[0]?.name ?? "Unknown Artist";
}

const STALE_THRESHOLD = 15;

/**
 * Paginated JamBase geo query. Returns raw event objects.
 * Bails early when STALE_THRESHOLD consecutive known events are seen —
 * avoids fetching deep pages that are almost entirely already in our DB.
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
  let page = 1;
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
    let bailed = false;

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
  } while (page <= totalPages);

  return all;
}

/**
 * Drive time estimate via OpenRouteService.
 * Returns hours (1 decimal) or null if ORS unavailable / call fails.
 */
async function getDriveHours(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null
): Promise<number | null> {
  if (!toLat || !toLng || !process.env.ORS_KEY) return null;
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_KEY}&start=${fromLng},${fromLat}&end=${toLng},${toLat}`
    );
    if (!res.ok) return null;
    const data = await res.json();
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
