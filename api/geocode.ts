// api/geocode.ts
// Vercel Edge Function — called from useProfile.ts when a user saves their home_city.
//
// Uses Nominatim (OpenStreetMap) — free, no API key required.
// Rate limit: 1 req/sec. Fine for profile saves. Do NOT call from the cron.
//
// Writes home_lat + home_lng back to the user's profile row via the service key.
// Returns { lat, lng } on success so the client can optimistically update if needed.

import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Auth: require the user's JWT so we know which profile to update
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { city } = await req.json().catch(() => ({}));
  if (!city || typeof city !== "string" || !city.trim()) {
    return Response.json({ error: "city is required" }, { status: 400 });
  }

  // Geocode via Nominatim
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.set("q",      city.trim());
  nominatimUrl.searchParams.set("format", "json");
  nominatimUrl.searchParams.set("limit",  "1");

  const geoRes = await fetch(nominatimUrl.toString(), {
    headers: {
      // Nominatim requires a descriptive User-Agent with contact info
      "User-Agent": "WookBook/1.0 (contact: bobmcdonough215@gmail.com)",
      "Accept":     "application/json",
    },
  });

  if (!geoRes.ok) {
    return Response.json({ error: "Geocoding service unavailable" }, { status: 502 });
  }

  const results = await geoRes.json();
  if (!results?.length) {
    return Response.json({ error: "Location not found" }, { status: 404 });
  }

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);

  if (isNaN(lat) || isNaN(lng)) {
    return Response.json({ error: "Invalid coordinates returned" }, { status: 502 });
  }

  // Write back to profile using the user's own JWT — respects RLS
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,     // anon key + user JWT = user-scoped access
    {
      global: { headers: { Authorization: authHeader } },
      auth:   { autoRefreshToken: false, persistSession: false },
    }
  );

  const { error } = await supabase
    .from("profiles")
    .update({ home_lat: lat, home_lng: lng })
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");

  if (error) {
    return Response.json({ error: "Failed to save coordinates" }, { status: 500 });
  }

  return Response.json({ lat, lng });
}
