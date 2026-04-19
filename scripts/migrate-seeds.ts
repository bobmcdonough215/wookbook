/**
 * scripts/migrate-seeds.ts
 *
 * One-time seed migration: inserts all concerts from src/data/concerts.json
 * into the Supabase `shows` table.
 *
 * Run from project root:
 *   npx tsx scripts/migrate-seeds.ts
 *
 * Requirements:
 *   - .env.local must contain SUPABASE_URL and SUPABASE_SERVICE_KEY
 *   - The Supabase schema must already be applied (shows table must exist)
 *   - Run only once. The script is idempotent via upsert on legacy_id,
 *     but running it twice is wasteful and produces console noise.
 *
 * What this script does:
 *   1. Reads concerts.json
 *   2. Normalizes dates that fail the DB constraint (e.g. "2009/2010" → "2009")
 *   3. Maps each concert to the shows table schema, preserving the original
 *      seed ID in the legacy_id column for future migration reference
 *   4. Inserts in batches of 100 using upsert (idempotent on legacy_id)
 *   5. Reports any failures with full detail
 *   6. Prints a summary: inserted count, skipped count, error count
 *
 * After this runs successfully:
 *   - concerts.json remains in the repo as a backup/fixture
 *   - The shows table is the source of truth for concert data
 *   - Each row has a legacy_id matching its original seed-XXXX identifier
 *     which the localStorage migration (Session E) will use to resolve UUIDs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local — must be called before accessing process.env
config({ path: resolve(process.cwd(), ".env.local") });

// ─── Validate environment ──────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "\n❌ Missing environment variables.\n" +
    "   Ensure .env.local contains SUPABASE_URL and SUPABASE_SERVICE_KEY.\n" +
    "   These must NOT have the VITE_ prefix — this script runs in Node.js,\n" +
    "   not the browser, and uses process.env instead of import.meta.env.\n"
  );
  process.exit(1);
}

// ─── Supabase client (service key — bypasses RLS) ─────────────────────────────
// The service key is required here because seed shows have source: 'seed',
// and the RLS insert policy on shows requires source = 'user' for client requests.
// Seed data is trusted, admin-level data inserted once by this script.

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type RawConcert = {
  id: string;
  artist: string;
  event?: string;
  venue?: string;
  city?: string;
  state?: string;
  date: string;
  special_notes?: string;
  rating?: number;
  memory?: string;
};

type ShowInsert = {
  legacy_id: string;
  artist: string;
  event: string | null;
  venue: string;
  city: string;
  state: string;
  date: string;
  special_notes: string | null;
  source: "seed";
  created_by: null;
};

// ─── Date normalization ───────────────────────────────────────────────────────
//
// The shows table enforces: date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'
// Valid formats: "2024", "2024-08", "2024-08-15"
// Invalid formats found in concerts.json: "2009/2010" (ambiguous year range)
//
// Normalization rules:
//   - "2009/2010"  → "2009"  (take first year, note ambiguity)
//   - "2009"       → "2009"  (already valid)
//   - "2009-08"    → "2009-08" (already valid)
//   - "2009-08-15" → "2009-08-15" (already valid)

function normalizeDate(raw: string): { date: string; addedNote: string | null } {
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) {
    return { date: raw, addedNote: null };
  }

  // "YYYY/YYYY" or "YYYY/YY" pattern — take first year
  const slashMatch = raw.match(/^(\d{4})\//);
  if (slashMatch) {
    return {
      date: slashMatch[1],
      addedNote: `Original date: "${raw}" — year ambiguous, using ${slashMatch[1]}.`,
    };
  }

  // "YYYY-MM-" or "YYYY-" — trailing dash from incomplete entry
  const trailingDash = raw.replace(/-+$/, "");
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(trailingDash)) {
    return {
      date: trailingDash,
      addedNote: `Original date: "${raw}" — trailing dash removed.`,
    };
  }

  console.warn(`  ⚠️  Unrecognized date format: "${raw}" — inserting as-is. This may fail the DB constraint.`);
  return { date: raw, addedNote: `Original date value: "${raw}" — format unrecognized.` };
}

// ─── Map concert to DB row ────────────────────────────────────────────────────

function toShowInsert(concert: RawConcert): ShowInsert {
  const { date, addedNote } = normalizeDate(concert.date);

  let special_notes = concert.special_notes ?? null;
  if (addedNote) {
    special_notes = special_notes
      ? `${special_notes} | ${addedNote}`
      : addedNote;
  }

  return {
    legacy_id:     concert.id,
    artist:        concert.artist,
    event:         concert.event ?? null,
    venue:         concert.venue ?? "",
    city:          concert.city ?? "",
    state:         concert.state ?? "",
    date,
    special_notes,
    source:        "seed",
    created_by:    null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n🎸 WookBook — Seed Migration\n");

  const jsonPath = resolve(process.cwd(), "src/data/concerts.json");
  let rawData: { concerts: RawConcert[] };
  try {
    rawData = JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch (e) {
    console.error(`❌ Failed to read concerts.json at ${jsonPath}:`, e);
    process.exit(1);
  }

  const concerts = rawData.concerts;
  if (!Array.isArray(concerts) || concerts.length === 0) {
    console.error("❌ concerts.json is empty or malformed.");
    process.exit(1);
  }

  console.log(`📋 Found ${concerts.length} concerts in concerts.json`);

  const rows: ShowInsert[] = concerts.map(toShowInsert);

  const normalized = rows.filter((r, i) => r.date !== concerts[i].date);
  if (normalized.length > 0) {
    console.log(`\n⚠️  ${normalized.length} date(s) normalized:`);
    normalized.forEach((r) => {
      const original = concerts.find((c) => c.id === r.legacy_id);
      console.log(`   ${r.legacy_id}: "${original?.date}" → "${r.date}"`);
    });
  }

  const CHUNK_SIZE = 100;
  let inserted = 0;
  let errors = 0;
  const errorDetails: Array<{ chunk: string; message: string }> = [];

  console.log(`\n⬆️  Inserting in chunks of ${CHUNK_SIZE}...\n`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkLabel = `rows ${i + 1}–${Math.min(i + CHUNK_SIZE, rows.length)}`;

    const { error } = await supabase
      .from("shows")
      .upsert(chunk, { onConflict: "legacy_id" });

    if (error) {
      console.error(`   ❌ ${chunkLabel} failed: ${error.message}`);
      errors += chunk.length;
      errorDetails.push({ chunk: chunkLabel, message: error.message });
    } else {
      inserted += chunk.length;
      console.log(`   ✓ ${chunkLabel} (${inserted}/${rows.length})`);
    }
  }

  const { count, error: countError } = await supabase
    .from("shows")
    .select("*", { count: "exact", head: true })
    .eq("source", "seed");

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Inserted:   ${inserted} / ${rows.length}`);
  if (errors > 0) {
    console.log(`❌ Errors:     ${errors}`);
    errorDetails.forEach((e) => console.log(`   • ${e.chunk}: ${e.message}`));
  }
  if (!countError) {
    console.log(`📊 DB count:   ${count} seed shows now in Supabase`);
  }
  console.log("─────────────────────────────────────────\n");

  if (errors > 0) {
    console.log(
      "⚠️  Some rows failed. Fix the errors above and re-run.\n" +
      "   The script is idempotent (upsert on legacy_id) — safe to re-run.\n"
    );
    process.exit(1);
  }

  console.log(
    "🎉 Seed migration complete.\n\n" +
    "   Next steps:\n" +
    "   • Verify in Supabase Table Editor: shows table should have ~340 rows\n" +
    "   • Each row should have a legacy_id like 'seed-0000'\n" +
    "   • concerts.json is now a backup — Supabase is the source of truth\n" +
    "   • Do NOT run this script again unless you drop and recreate the shows table\n"
  );
}

run().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
