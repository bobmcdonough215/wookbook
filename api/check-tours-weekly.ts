// api/check-tours-weekly.ts
// Weekly Vercel cron — Monday 10am UTC.
// 1. Artist-specific JamBase queries to catch far-away shows outside the daily 350mi geo radius.
// 2. Sends a grouped digest of all new tour events added in the past 7 days.

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { runtime: "edge" };

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

  // --- Artist-specific pass: catch shows outside the daily geo radius ---

  const { data: watched } = await supabase
    .from("watched_artists")
    .select("artist_name")
    .eq("muted", false);

  const artists = [...new Set((watched ?? []).map((w) => w.artist_name))];

  for (const artist of artists) {
    try {
      const events = await fetchJambaseByArtist(artist);

      for (const rawEvent of events) {
        const parsed = JambaseEventSchema.safeParse(rawEvent);
        if (!parsed.success) continue;

        const ev = parsed.data;
        if (ev.eventStatus === "cancelled") continue;

        const date = ev.startDate.slice(0, 10);
        if (new Date(date + "T00:00:00") < new Date()) continue;

        // Dedup — daily geo cron already handles nearby events; skip if present
        const { data: existing } = await supabase
          .from("tour_events")
          .select("id")
          .eq("external_id", ev.identifier)
          .maybeSingle();
        if (existing) continue;

        const primaryOffer = (ev.offers ?? []).find((o) => o.category === "ticketingLinkPrimary");
        const ticketUrl = primaryOffer?.url ?? ev.url ?? null;
        const lat = ev.location?.geo?.latitude ?? null;
        const lng = ev.location?.geo?.longitude ?? null;

        await supabase.from("tour_events").insert({
          external_id:    ev.identifier,
          source:         "jambase",
          artist_name:    artist,
          date,
          venue_name:     ev.location?.name ?? null,
          venue_city:     ev.location?.address?.addressLocality ?? null,
          venue_state:    ev.location?.address?.addressRegion?.alternateName ?? null,
          venue_lat:      lat,
          venue_lng:      lng,
          ticket_url:     ticketUrl,
          is_festival:    ev.type === "Festival",
          is_home_market: false, // beyond geo radius — never home market
          drive_hours:    null,  // ORS not called weekly to save quota
          raw:            ev,
        });
      }
    } catch (e) {
      console.error(`check-tours-weekly: failed for ${artist}`, e);
    }
  }

  // --- Digest: all events added in the past 7 days ---

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const today = new Date().toISOString().slice(0, 10);

  const { data: recentEvents } = await supabase
    .from("tour_events")
    .select("*")
    .gte("fetched_at", cutoff.toISOString())
    .gte("date", today)
    .order("date", { ascending: true });

  if (!recentEvents?.length) {
    return Response.json({ artistsChecked: artists.length, events: 0, notified: false });
  }

  if (!process.env.NTFY_TOPIC) {
    return Response.json({ artistsChecked: artists.length, events: recentEvents.length, notified: false });
  }

  const byArtist = new Map<string, typeof recentEvents>();
  for (const ev of recentEvents) {
    const arr = byArtist.get(ev.artist_name) ?? [];
    arr.push(ev);
    byArtist.set(ev.artist_name, arr);
  }

  const lines = [...byArtist.entries()].map(([artist, evs]) => {
    const dates = evs.slice(0, 3).map((e) =>
      `  ${fmtDate(e.date)} · ${e.venue_city ?? "TBD"}${e.is_home_market ? " (home)" : ""}`
    );
    return `${artist}\n${dates.join("\n")}`;
  });

  await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
    method: "POST",
    headers: {
      "Title":        `Weekly tour digest — ${recentEvents.length} new show${recentEvents.length > 1 ? "s" : ""}`,
      "Priority":     "default",
      "Content-Type": "text/plain",
    },
    body: lines.join("\n\n"),
  });

  return Response.json({ artistsChecked: artists.length, events: recentEvents.length, notified: true });
}

async function fetchJambaseByArtist(artist: string): Promise<unknown[]> {
  if (!process.env.JAMBASE_KEY) return [];

  const today = new Date().toISOString().slice(0, 10);
  const all: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL("https://api.data.jambase.com/v3/events");
    url.searchParams.set("artistName", artist);
    url.searchParams.set("eventDateFrom", today);
    url.searchParams.set("perPage", "100");
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
    all.push(...(Array.isArray(data.events) ? data.events : []));
    totalPages = data.pagination?.totalPages ?? 1;
    page++;
  } while (page <= totalPages);

  return all;
}

const fmtDate = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
