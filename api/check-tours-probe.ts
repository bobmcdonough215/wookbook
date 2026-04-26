// api/check-tours-probe.ts
// ONE-TIME diagnostic — run before the first real cron invocation.
//
// Hits page 1 of each hub and reports totalPages with no side effects.
// Costs exactly 10 JamBase API calls. Writes nothing to the DB.
// Delete this file after you've confirmed the page counts look sane.
//
// Usage:
//   curl -s -X GET https://wookbook.vercel.app/api/check-tours-probe \
//     -H "Authorization: Bearer <CRON_SECRET>" | jq

export const config = { maxDuration: 30 };

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

export default async function handler(req: any, res: any) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).end("Unauthorized");
    return;
  }

  if (!process.env.JAMBASE_KEY) {
    res.status(500).json({ error: "JAMBASE_KEY not set" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Hit page 1 of all hubs in parallel — one call per hub, nothing stored.
  const results = await Promise.allSettled(
    HUBS.map(async (hub) => {
      const url = new URL("https://api.data.jambase.com/v3/events");
      url.searchParams.set("geoLatitude",     String(hub.lat));
      url.searchParams.set("geoLongitude",    String(hub.lng));
      url.searchParams.set("geoRadiusAmount", String(GEO_RADIUS_MI));
      url.searchParams.set("geoRadiusUnits",  "mi");
      url.searchParams.set("eventDateFrom",   today);
      url.searchParams.set("perPage",         "100");

      const res = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${process.env.JAMBASE_KEY}`,
          "User-Agent":    "WookBook/1.0",
          "Accept":        "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data        = await res.json();
      const totalPages  = data.pagination?.totalPages  ?? 1;
      const totalEvents = data.pagination?.totalItems  ?? "?";
      const pageEvents  = Array.isArray(data.events) ? data.events.length : 0;

      return {
        hub:         hub.name,
        totalPages,
        totalEvents,
        pageEvents,  // events on page 1 — sanity check that data is coming back
      };
    })
  );

  // Shape the output
  const hubs = results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        hub:   HUBS[i].name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });

  const totalCalls        = hubs.length;                                         // always 10
  const worstCaseFirstRun = hubs.reduce((sum, h) => {
    if ("totalPages" in h) return sum + Math.min(h.totalPages, 15);
    return sum + 15; // failed hub — assume worst case
  }, 0);

  res.json({
    note:               "Read-only probe. Wrote nothing to DB.",
    apiCallsUsedNow:    totalCalls,
    worstCaseFirstRun,  // JamBase calls check-tours would make on first real run
    steadyStatePerDay:  "10–20 (early bail after page 1-2 once DB is populated)",
    hubs,
  });
}
