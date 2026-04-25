// api/check-tours.ts
// Daily Vercel cron — 9am UTC. Fetches upcoming tour dates from JamBase for all
// unmuted watched artists, inserts new tour_events, and fires Ntfy alerts.
// Vercel automatically sends Authorization: Bearer <CRON_SECRET> on cron invocations.

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { runtime: "edge" };

const HOME = { lat: 39.9526, lng: -75.1652 }; // Philadelphia, PA

const HOME_MARKETS = [
  { city: "philadelphia",    state: "pa" },
  { city: "camden",          state: "nj" },
  { city: "new york",        state: "ny" },
  { city: "holmdel",         state: "nj" },
  { city: "saratoga springs",state: "ny" },
  { city: "bethel",          state: "ny" },
];

const AddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.object({
    alternateName: z.string().optional(), // "PA", "NY", etc.
  }).optional(),
}).optional();

const GeoSchema = z.object({
  latitude:  z.number().optional(),
  longitude: z.number().optional(),
}).optional();

const JambaseEventSchema = z.object({
  identifier:  z.string(),                    // "jambase:194164"
  url:         z.string().optional(),         // JamBase event page
  startDate:   z.string(),                    // ISO 8601 local, no offset
  eventStatus: z.string().optional(),
  type:        z.string().optional(),         // "Concert" | "Festival"
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

export default async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: watched } = await supabase
    .from("watched_artists")
    .select("artist_name")
    .eq("muted", false);

  if (!watched?.length) {
    return Response.json({ checked: 0, newEvents: 0 });
  }

  const artists = [...new Set(watched.map((w) => w.artist_name))];
  const newEvents: any[] = [];

  for (const artist of artists) {
    try {
      const events = await fetchJambase(artist);

      for (const rawEvent of events) {
        const parsed = JambaseEventSchema.safeParse(rawEvent);
        if (!parsed.success) continue;

        const ev = parsed.data;

        // Skip cancelled events
        if (ev.eventStatus === "cancelled") continue;

        const date = ev.startDate.slice(0, 10);
        if (new Date(date + "T00:00:00") < new Date()) continue;

        // Skip if we already have this event
        const { data: existing } = await supabase
          .from("tour_events")
          .select("id")
          .eq("external_id", ev.identifier)
          .maybeSingle();
        if (existing) continue;

        const city  = ev.location?.address?.addressLocality?.toLowerCase() ?? "";
        const state = ev.location?.address?.addressRegion?.alternateName?.toLowerCase() ?? "";
        const isHome = HOME_MARKETS.some((m) => city.includes(m.city) && state === m.state);

        const lat = ev.location?.geo?.latitude ?? 0;
        const lng = ev.location?.geo?.longitude ?? 0;
        const driveHours = await getDriveHours(lat, lng);

        // Primary ticket link first, fall back to JamBase event page
        const primaryOffer = (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary");
        const ticketUrl = primaryOffer?.url ?? ev.url ?? null;

        const { data: inserted } = await supabase
          .from("tour_events")
          .insert({
            external_id:    ev.identifier,
            source:         "jambase",
            artist_name:    artist,
            date,
            venue_name:     ev.location?.name ?? null,
            venue_city:     ev.location?.address?.addressLocality ?? null,
            venue_state:    ev.location?.address?.addressRegion?.alternateName ?? null,
            venue_lat:      lat || null,
            venue_lng:      lng || null,
            ticket_url:     ticketUrl,
            is_festival:    ev.type === "Festival",
            is_home_market: isHome,
            drive_hours:    driveHours,
            raw:            ev,
          })
          .select()
          .single();

        if (inserted) newEvents.push({ ...inserted, artistName: artist });
      }
    } catch (e) {
      console.error(`check-tours: failed for ${artist}`, e);
    }
  }

  await sendNotifications(newEvents);
  return Response.json({ checked: artists.length, newEvents: newEvents.length });
}

async function fetchJambase(artist: string): Promise<unknown[]> {
  if (!process.env.JAMBASE_KEY) return [];

  const today = new Date().toISOString().slice(0, 10);
  const url = new URL("https://api.data.jambase.com/v3/events");
  url.searchParams.set("artistName", artist);
  url.searchParams.set("eventDateFrom", today);
  url.searchParams.set("perPage", "100");

  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${process.env.JAMBASE_KEY}`,
      "User-Agent":    "WookBook/1.0",
      "Accept":        "application/json",
    },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

async function getDriveHours(lat: number, lng: number): Promise<number | null> {
  if (!lat || !lng || !process.env.ORS_KEY) return null;
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_KEY}&start=${HOME.lng},${HOME.lat}&end=${lng},${lat}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const seconds = data.features?.[0]?.properties?.segments?.[0]?.duration;
    return seconds ? Math.round((seconds / 3600) * 10) / 10 : null;
  } catch {
    return null;
  }
}

async function sendNotifications(events: any[]) {
  if (!events.length || !process.env.NTFY_TOPIC) return;

  const immediate = events.filter(
    (e) => e.is_home_market || (e.drive_hours != null && e.drive_hours <= 4)
  );
  const nearby = events.filter(
    (e) => !e.is_home_market && e.drive_hours != null && e.drive_hours > 4 && e.drive_hours <= 8
  );

  for (const e of immediate) {
    await ntfy({
      title:    `${e.artistName} — ${e.is_home_market ? "Home market!" : `${e.drive_hours}h away`}`,
      body:     `${fmtDate(e.date)} · ${[e.venue_name, e.venue_city].filter(Boolean).join(", ")}`,
      url:      e.ticket_url ?? "",
      priority: "high",
    });
    await sleep(200);
  }

  if (nearby.length) {
    await ntfy({
      title: `${nearby.length} new show${nearby.length > 1 ? "s" : ""} within 8h`,
      body:  nearby.map((e: any) => `${e.artistName} · ${e.venue_city ?? "TBD"} · ${fmtDate(e.date)}`).join("\n"),
    });
  }
}

async function ntfy({ title, body, url = "", priority = "default" }: {
  title: string; body: string; url?: string; priority?: string;
}) {
  await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
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
