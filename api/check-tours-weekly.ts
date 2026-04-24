// api/check-tours-weekly.ts
// Weekly Vercel cron — Monday 10am UTC. Sends a grouped digest of new tour events
// added in the past 7 days. Catches artists not covered by the daily top-N run.

import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

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
    return Response.json({ events: 0, notified: false });
  }

  if (!process.env.NTFY_TOPIC) {
    return Response.json({ events: recentEvents.length, notified: false });
  }

  // Group by artist, list up to 3 dates each
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

  return Response.json({ events: recentEvents.length, notified: true });
}

const fmtDate = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
