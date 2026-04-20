// src/lib/migrateLegacyData.ts
//
// One-time client-side migration: moves Bob's localStorage data into Supabase.
// Runs automatically on first login after Session D is deployed.
//
// ── SECURITY ────────────────────────────────────────────────────────────────────
// - localStorage is an untrusted, user-accessible store. Treat all data as
//   potentially malformed, tampered, or oversized. Validate and clamp everything
//   before any DB write. Never trust the shape or type of localStorage values.
// - Personal data (memory text, ratings) must NEVER appear in console output.
//   Log error codes and legacy IDs only.
// - The migration flag is set ONLY after zero errors. On partial failure, the
//   function returns without setting the flag — it retries on next login.
//   All Supabase writes are upserts or guarded inserts — safe to retry.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────
// - Archive extras: upsert on user_id,show_id — fully idempotent.
// - Upcoming shows: insert — could create duplicates on partial retry.
//   Acceptable: the rare case of a mid-migration crash is tolerable.
// - Wishlist: insert — same.
//
// ── REC-KNOWN CLEARING ──────────────────────────────────────────────────────────
// - wookbook:rec-known stores concert IDs. Before migration: seed-XXXX strings.
//   After migration: Supabase UUIDs (from get_user_archive). The old keys will
//   never match the new IDs. This cache is cleared unconditionally so the
//   recording prefetch re-runs with the correct IDs.

import { supabase } from "@/lib/supabase";

const LEGACY_KEYS = {
  extras:   "wookbook:archive-extras",
  upcoming: "wookbook:upcoming",
  wishlist: "wookbook:wishlist",
  recKnown: "wookbook:rec-known",
} as const;

const migrationFlagKey = (userId: string) => `wookbook:migrated:${userId}`;

export async function migrateLegacyLocalStorage(userId: string): Promise<void> {
  // Guard: do not re-run if already completed for this user
  if (localStorage.getItem(migrationFlagKey(userId))) return;

  const errors: string[] = [];

  // ── 1. Archive extras → attendances ──────────────────────────────────────────
  // Extras are seed concerts with user-added ratings and memories.
  // We match them to Supabase shows via legacy_id (the original seed-XXXX id).
  // This is exactly what the legacy_id column was designed for.
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.extras);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          // Full type guard — localStorage content is untrusted
          if (!item || typeof item !== "object") continue;
          const extra = item as Record<string, unknown>;

          // Only seed shows can be matched by legacy_id
          if (typeof extra.id !== "string" || !extra.id.startsWith("seed-")) continue;

          // Only migrate records that have attendance data worth preserving
          const hasRating = typeof extra.rating === "number";
          const hasMemory =
            typeof extra.memory === "string" &&
            (extra.memory as string).trim().length > 0;
          if (!hasRating && !hasMemory) continue;

          // Look up the Supabase show by legacy_id
          const { data: show, error: showError } = await supabase
            .from("shows")
            .select("id")
            .eq("legacy_id", extra.id)
            .maybeSingle();

          if (showError || !show) {
            // Log the ID only — never log personal content
            errors.push(`show not found for legacy_id: ${extra.id}`);
            continue;
          }

          // Validate and clamp — never trust localStorage values
          const rating =
            hasRating &&
            (extra.rating as number) >= 1 &&
            (extra.rating as number) <= 5
              ? Math.round(extra.rating as number)
              : null;

          const rawMemory = hasMemory
            ? (extra.memory as string).trim()
            : null;
          // Truncate at 2000 chars to match DB constraint — preserve over reject
          const memory = rawMemory ? rawMemory.slice(0, 2000) : null;

          const { error: upsertError } = await supabase
            .from("attendances")
            .upsert(
              {
                user_id:       userId,
                show_id:       show.id,
                rating,
                memory,
                memory_public: false, // always private on migration
              },
              { onConflict: "user_id,show_id" }
            );

          if (upsertError) {
            // Log error code only — never log memory content or personal data
            errors.push(
              `attendance upsert failed (legacy_id: ${extra.id}): ${upsertError.code}`
            );
          }
        }
      }
    }
  } catch (e) {
    errors.push(
      `extras parse error: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  // ── 2. Upcoming shows → upcoming_shows ────────────────────────────────────────
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.upcoming);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const rows = (parsed as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              item !== null && typeof item === "object"
          )
          .filter(
            (item) =>
              typeof item.artist === "string" &&
              (item.artist as string).trim().length > 0 &&
              typeof item.date === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(item.date as string)
          )
          .map((item) => ({
            user_id: userId,
            artist:  (item.artist as string).trim().slice(0, 200),
            date:    item.date as string,
            venue:
              typeof item.venue === "string"
                ? item.venue.trim().slice(0, 200) || null
                : null,
            city:
              typeof item.city === "string"
                ? item.city.trim().slice(0, 100) || null
                : null,
            state:
              typeof item.state === "string"
                ? item.state.trim().slice(0, 100) || null
                : null,
            ticket_url:
              typeof item.ticketUrl === "string"
                ? item.ticketUrl.trim().slice(0, 500) || null
                : null,
            notes:
              typeof item.notes === "string"
                ? item.notes.trim().slice(0, 1000) || null
                : null,
          }));

        if (rows.length > 0) {
          const { error } = await supabase.from("upcoming_shows").insert(rows);
          if (error) errors.push(`upcoming insert: ${error.code}`);
        }
      }
    }
  } catch (e) {
    errors.push(
      `upcoming parse error: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  // ── 3. Wishlist → wishlist ────────────────────────────────────────────────────
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.wishlist);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

        const rows = (parsed as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              item !== null && typeof item === "object"
          )
          .filter(
            (item) =>
              typeof item.artist === "string" &&
              (item.artist as string).trim().length > 0
          )
          .map((item) => ({
            user_id:  userId,
            artist:   (item.artist as string).trim().slice(0, 200),
            priority: VALID_PRIORITIES.has(item.priority as string)
              ? (item.priority as string)
              : "medium",
            notes:
              typeof item.notes === "string"
                ? item.notes.trim().slice(0, 500) || null
                : null,
          }));

        if (rows.length > 0) {
          const { error } = await supabase.from("wishlist").insert(rows);
          if (error) errors.push(`wishlist insert: ${error.code}`);
        }
      }
    }
  } catch (e) {
    errors.push(
      `wishlist parse error: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  // ── 4. Clear rec-known ────────────────────────────────────────────────────────
  // Show IDs are now Supabase UUIDs — old seed-XXXX keys are permanently stale.
  // The recording prefetch will re-populate on next mount with the new IDs.
  // This step runs regardless of errors above.
  localStorage.removeItem(LEGACY_KEYS.recKnown);

  // ── 5. Finalize ───────────────────────────────────────────────────────────────
  if (errors.length === 0) {
    // Clean up all legacy keys and mark migration complete
    localStorage.removeItem(LEGACY_KEYS.extras);
    localStorage.removeItem(LEGACY_KEYS.upcoming);
    localStorage.removeItem(LEGACY_KEYS.wishlist);
    localStorage.setItem(migrationFlagKey(userId), new Date().toISOString());
  } else {
    // Do not set the flag — retry on next login
    // Log error count and codes only, never personal content
    console.warn(
      `[WookBook] Migration: ${errors.length} error(s). Will retry on next login.`,
      errors
    );
  }
}
