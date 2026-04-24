// api/csv-import.ts
// Vercel serverless function — receives pre-parsed CSV rows from the client,
// finds or creates shows, and upserts attendances for the authenticated user.
// Uses service key server-side so RLS does not interfere with show inserts.
//
// Dedup key is artist + date + city so two shows on the same day in different
// cities don't collide. All DB work is done in bulk (4 queries per batch)
// rather than N queries per row.

import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

type ImportRow = {
  rowIndex: number;
  artist: string;
  date: string;    // YYYY-MM-DD
  city: string;
  venue: string;   // may be empty string when not provided
  opener: string;  // opening act(s) — stored in special_notes on the show record
  notes: string;   // user's personal notes — stored in memory on the attendance record
};

type RowResult = {
  rowIndex: number;
  status: "imported" | "already_logged" | "error";
  message?: string;
};

// Validates a date string against the DB constraint pattern.
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Authenticate the caller
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const anonKey     = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Verify the user's JWT and extract user ID
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { rows: ImportRow[] };
  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "No rows provided" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Phase 1: Server-side validation ──────────────────────────────────────────
  const results: RowResult[] = [];
  const validRows: ImportRow[] = [];

  for (const row of rows) {
    if (!row.artist?.trim() || !row.city?.trim()) {
      results.push({ rowIndex: row.rowIndex, status: "error", message: "Missing artist or city" });
    } else if (!DATE_RE.test(row.date)) {
      results.push({ rowIndex: row.rowIndex, status: "error", message: `Invalid date: "${row.date}"` });
    } else {
      validRows.push(row);
    }
  }

  if (!validRows.length) {
    return Response.json({ results });
  }

  // ── Phase 2: Bulk-fetch all shows that could match any row ────────────────────
  // Fetch by artist (IN clause), then match by date+city in memory.
  const uniqueArtists = [...new Set(validRows.map((r) => r.artist))];

  const { data: existingShows, error: showsErr } = await admin
    .from("shows")
    .select("id, artist, date, city")
    .in("artist", uniqueArtists);

  if (showsErr) {
    return Response.json({ error: showsErr.message }, { status: 500 });
  }

  // Build lookup: "artist|date|city" -> show_id
  const showLookup = new Map<string, string>();
  for (const s of existingShows ?? []) {
    showLookup.set(`${s.artist}|${s.date}|${s.city}`, s.id);
  }

  // ── Phase 3: Bulk-fetch user's existing attendances for matched show IDs ──────
  const matchedShowIds = [
    ...new Set(
      validRows
        .map((r) => showLookup.get(`${r.artist}|${r.date}|${r.city}`))
        .filter((id): id is string => !!id)
    ),
  ];

  const attendedSet = new Set<string>();
  if (matchedShowIds.length) {
    const { data: atts } = await admin
      .from("attendances")
      .select("show_id")
      .eq("user_id", user.id)
      .in("show_id", matchedShowIds);
    for (const a of atts ?? []) attendedSet.add(a.show_id);
  }

  // ── Phase 4: Categorise each row ─────────────────────────────────────────────
  const needNewShow: ImportRow[]     = [];
  const needAttendance: Array<{ rowIndex: number; showId: string; notes: string }> = [];
  const seenNewKeys = new Set<string>();

  for (const row of validRows) {
    const key = `${row.artist}|${row.date}|${row.city}`;
    const existingId = showLookup.get(key);

    if (existingId) {
      if (attendedSet.has(existingId)) {
        results.push({ rowIndex: row.rowIndex, status: "already_logged" });
      } else {
        needAttendance.push({ rowIndex: row.rowIndex, showId: existingId, notes: row.notes });
        attendedSet.add(existingId); // prevent duplicate attendance within batch
      }
    } else {
      if (!seenNewKeys.has(key)) {
        seenNewKeys.add(key);
        needNewShow.push(row); // one insert per unique show
      }
      // All rows mapping to the same new show will be resolved in phase 5
    }
  }

  // ── Phase 5: Bulk-insert new shows ───────────────────────────────────────────
  if (needNewShow.length) {
    const { data: newShows, error: insertErr } = await admin
      .from("shows")
      .insert(
        needNewShow.map((r) => ({
          artist:        r.artist,
          date:          r.date,
          venue:         r.venue || "",
          city:          r.city,
          state:         "",
          special_notes: r.opener || null,
          source:        "user",
          created_by:    user.id,
        }))
      )
      .select("id, artist, date, city");

    if (insertErr) {
      // Bulk insert failed — mark all rows that needed new shows as errors
      for (const row of validRows) {
        const key = `${row.artist}|${row.date}|${row.city}`;
        if (seenNewKeys.has(key) && !results.some((r) => r.rowIndex === row.rowIndex)) {
          results.push({ rowIndex: row.rowIndex, status: "error", message: insertErr.message });
        }
      }
    } else {
      // Map newly-created shows back to all rows that need them
      const newShowMap = new Map<string, string>();
      for (const s of newShows ?? []) {
        newShowMap.set(`${s.artist}|${s.date}|${s.city}`, s.id);
      }

      const processedRowIndexes = new Set(results.map((r) => r.rowIndex));

      for (const row of validRows) {
        if (processedRowIndexes.has(row.rowIndex)) continue;
        if (needAttendance.some((a) => a.rowIndex === row.rowIndex)) continue;

        const newId = newShowMap.get(`${row.artist}|${row.date}|${row.city}`);
        if (newId) {
          needAttendance.push({ rowIndex: row.rowIndex, showId: newId, notes: row.notes });
        } else {
          results.push({ rowIndex: row.rowIndex, status: "error", message: "Show could not be created" });
        }
      }
    }
  }

  // ── Phase 6: Bulk-upsert attendances ─────────────────────────────────────────
  if (needAttendance.length) {
    // Deduplicate by showId — multiple CSV rows can map to the same show
    const uniqueByShow = [
      ...new Map(needAttendance.map((a) => [a.showId, a])).values(),
    ];

    const { error: attErr } = await admin
      .from("attendances")
      .upsert(
        uniqueByShow.map((a) => ({
          user_id:       user.id,
          show_id:       a.showId,
          rating:        null,
          memory:        a.notes || null,
          memory_public: false,
        })),
        { onConflict: "user_id,show_id" }
      );

    for (const a of needAttendance) {
      results.push({
        rowIndex: a.rowIndex,
        status:   attErr ? "error" : "imported",
        message:  attErr?.message,
      });
    }
  }

  return Response.json({ results });
}
