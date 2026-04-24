// src/lib/csvParse.ts
// Client-side CSV parsing and date normalisation for the import flow.
// No network calls, no side effects — pure data transformation.

// ─── Date normalisation ───────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function expandYear(yy: number): number {
  return yy >= 60 ? 1900 + yy : 2000 + yy;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type DateParseResult = {
  date: string;
  ambiguous?: boolean; // true when MM/DD and DD/MM are both valid interpretations
};

/**
 * Attempts to parse a free-form date string into YYYY-MM-DD (or YYYY-MM / YYYY).
 * Returns null when the input is unrecognisable.
 * Sets `ambiguous: true` when the date could be read as either MM/DD or DD/MM
 * and we had to pick one (US default).
 *
 * Supported formats:
 *   ISO:           2025-09-18, 2025-09, 2025
 *   US numeric:    9/18/25, 9/18/2025, 09-18-2025, 09.18.2025
 *   EU numeric:    18/09/2025 (unambiguous when first number > 12)
 *   YYYY/MM/DD:    2025/09/18
 *   Written month: "September 18, 2025", "Sep 18 2025", "18 September 2025"
 */
export function parseDateFlexible(raw: string): DateParseResult | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO exact — unambiguous
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s };
  if (/^\d{4}-\d{2}$/.test(s)) return { date: s };
  if (/^\d{4}$/.test(s)) return { date: s };

  // YYYY/MM/DD or YYYY.MM.DD — unambiguous
  const ymdSlash = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (ymdSlash) {
    const [, y, m, d] = ymdSlash;
    return { date: `${y}-${pad2(+m)}-${pad2(+d)}` };
  }

  // Written month-first: "September 18, 2025" / "Sep. 18 2025" — unambiguous
  const mFirst = s.match(/^([a-zA-Z]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (mFirst) {
    const mo = MONTHS[mFirst[1].toLowerCase()];
    if (mo) {
      const d = +mFirst[2];
      const y = +mFirst[3];
      return { date: `${y < 100 ? expandYear(y) : y}-${pad2(mo)}-${pad2(d)}` };
    }
  }

  // Written day-first: "18 September 2025" / "18 Sep, 2025" — unambiguous
  const dFirst = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?,?\s+(\d{2,4})$/);
  if (dFirst) {
    const mo = MONTHS[dFirst[2].toLowerCase()];
    if (mo) {
      const d = +dFirst[1];
      const y = +dFirst[3];
      return { date: `${y < 100 ? expandYear(y) : y}-${pad2(mo)}-${pad2(d)}` };
    }
  }

  // Numeric M/D/Y or D/M/Y — separator can be / - .
  const numeric = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (numeric) {
    const a = +numeric[1];
    const b = +numeric[2];
    const y = +numeric[3];
    const year = y < 100 ? expandYear(y) : y;

    if (a > 12) {
      // First number can't be a month — unambiguously DD/MM
      return { date: `${year}-${pad2(b)}-${pad2(a)}` };
    }
    if (b > 12) {
      // Second number can't be a month — unambiguously MM/DD
      return { date: `${year}-${pad2(a)}-${pad2(b)}` };
    }
    // Both ≤ 12: could be either format. Default to US (MM/DD) and flag it.
    return { date: `${year}-${pad2(a)}-${pad2(b)}`, ambiguous: true };
  }

  return null;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  // i < line.length (not <=) prevents pushing a spurious empty field after
  // a closing quote that lands exactly at line.length.
  while (i < line.length) {
    if (line[i] === '"') {
      let field = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field.trim());
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end < 0) {
        fields.push(line.slice(i).trim());
        break;
      }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

const ARTIST_ALIASES = ["artist", "band", "performer", "act", "headliner", "name"];
const DATE_ALIASES   = ["date", "show date", "show_date", "event date", "event_date", "when", "concert date"];
const VENUE_ALIASES  = ["venue", "hall", "theater", "theatre", "club", "arena", "amphitheater", "amphitheatre"];
const CITY_ALIASES   = ["city", "town", "municipality", "location"];
const OPENER_ALIASES = ["opener", "openers", "opening act", "opening acts", "support", "support act", "with"];
const NOTES_ALIASES  = ["notes", "my notes", "show notes", "personal notes", "comments", "comment", "memo", "memory"];

function findCol(headers: string[], aliases: string[]): number {
  const lc = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lc.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

export type CsvRow = {
  rowIndex: number;
  artist: string;
  rawDate: string;
  date: string;            // normalised YYYY-MM-DD (or empty if unparseable)
  city: string;
  venue: string;
  opener: string;          // opening act(s), empty string when absent
  notes: string;           // user's personal show notes, empty string when absent
  error?: string;          // set when the row can't be imported
  dateAmbiguous?: boolean; // true when date assumed MM/DD — could be DD/MM
};

export type CsvParseResult = {
  rows: CsvRow[];
  headerError?: string;
};

export function parseCsvText(text: string): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return { rows: [], headerError: "No content found." };

  const headers = parseCsvLine(lines[0]);
  const artistIdx = findCol(headers, ARTIST_ALIASES);
  const dateIdx   = findCol(headers, DATE_ALIASES);
  const cityIdx   = findCol(headers, CITY_ALIASES);
  const venueIdx  = findCol(headers, VENUE_ALIASES);
  const openerIdx = findCol(headers, OPENER_ALIASES);
  const notesIdx  = findCol(headers, NOTES_ALIASES);

  if (artistIdx < 0 || dateIdx < 0 || cityIdx < 0) {
    return {
      rows: [],
      headerError:
        `Couldn't find required columns. Your header row needs at least: ` +
        `"artist" (or "band"), "date", and "city". ` +
        `Found: ${headers.join(", ")}`,
    };
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols    = parseCsvLine(lines[i]);
    const artist  = cols[artistIdx]?.trim() ?? "";
    const rawDate = cols[dateIdx]?.trim() ?? "";
    const city    = cols[cityIdx]?.trim() ?? "";
    const venue   = venueIdx  >= 0 ? (cols[venueIdx]?.trim()  ?? "") : "";
    const opener  = openerIdx >= 0 ? (cols[openerIdx]?.trim() ?? "") : "";
    const notes   = notesIdx  >= 0 ? (cols[notesIdx]?.trim()  ?? "") : "";

    const parsed = parseDateFlexible(rawDate);

    let error: string | undefined;
    if (!artist)       error = "Missing artist";
    else if (!rawDate) error = "Missing date";
    else if (!parsed)  error = `Couldn't parse date "${rawDate}"`;
    else if (!city)    error = "Missing city";

    rows.push({
      rowIndex: i,
      artist,
      rawDate,
      date: parsed?.date ?? "",
      city,
      venue,
      opener,
      notes,
      error,
      dateAmbiguous: !error && parsed?.ambiguous ? true : undefined,
    });
  }

  return { rows };
}
