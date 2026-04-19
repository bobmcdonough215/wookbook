import { useCallback, useEffect, useRef, useState } from "react";
import { Concert } from "@/types/concert";
import { RecordingEntry } from "@/types/recording";
import {
  checkHasRecording,
  findRecording,
  getRelistenArtists,
  matchRelistenArtist,
  primaryArtist,
} from "@/lib/recordings";

const LS_KEY = "wookbook:rec-known";

function loadKnown(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveKnown(ids: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function useRecordings(concerts: Concert[]) {
  const [cache, setCache] = useState<Map<string, RecordingEntry>>(new Map());
  const knownRef = useRef<Set<string>>(loadKnown());

  const hasRecording = (id: string) => knownRef.current.has(id);

  const updateCache = useCallback((id: string, entry: RecordingEntry) => {
    setCache((prev) => new Map(prev).set(id, entry));
  }, []);

  const fetchRecording = useCallback(
    async (concert: Concert) => {
      const { id, artist, date } = concert;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      const current = cache.get(id);
      if (current && current.status !== "idle") return;

      updateCache(id, { status: "loading" });
      try {
        const result = await findRecording(artist, date);
        updateCache(id, { status: "found", ...result });
        knownRef.current.add(id);
        saveKnown(knownRef.current);
      } catch (e) {
        updateCache(id, {
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
        if (knownRef.current.has(id)) {
          knownRef.current.delete(id);
          saveKnown(knownRef.current);
        }
      }
    },
    [cache, updateCache]
  );

  // ── Background prefetch ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    async function prefetch() {
      const known = knownRef.current;

      const unchecked = concerts.filter(
        (c) => !known.has(c.id) && /^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "")
      );
      if (!unchecked.length) return;

      // ── Step 1: Year-level Relisten prefetch ──────────────────────────────
      let relistenArtists: Array<{ name: string; slug: string }> = [];
      try {
        relistenArtists = await getRelistenArtists();
      } catch { /* skip Relisten prefetch if list unavailable */ }

      if (!cancelled && relistenArtists.length) {
        // Group unchecked concerts by (slug, year) — one request per pair
        type YearTask = { slug: string; year: string };
        const yearTasks = new Map<string, YearTask>();

        for (const c of unchecked) {
          const slug =
            matchRelistenArtist(c.artist, relistenArtists) ||
            matchRelistenArtist(primaryArtist(c.artist), relistenArtists);
          if (!slug) continue;
          const year = c.date.slice(0, 4);
          const key = `${slug}::${year}`;
          if (!yearTasks.has(key)) yearTasks.set(key, { slug, year });
        }

        // Fetch year-level show lists — builds slug → Set<"YYYY-MM-DD">
        const relistenDateIndex = new Map<string, Set<string>>();
        const tasks = [...yearTasks.values()];
        const BATCH_YEAR = 6;

        for (let i = 0; i < tasks.length; i += BATCH_YEAR) {
          if (cancelled) return;
          await Promise.all(
            tasks.slice(i, i + BATCH_YEAR).map(async ({ slug, year }) => {
              try {
                const res = await fetch(
                  `https://api.relisten.net/api/v2/artists/${slug}/years/${year}`
                );
                if (!res.ok) return;
                const data = await res.json();
                const shows: Array<{ date?: string }> = Array.isArray(data) ? data : (data?.shows ?? []);
                if (!Array.isArray(shows)) return;

                if (!relistenDateIndex.has(slug)) relistenDateIndex.set(slug, new Set());
                const dateSet = relistenDateIndex.get(slug)!;
                for (const show of shows) {
                  if (show.date) dateSet.add(show.date.slice(0, 10));
                }
              } catch { /* network error for this year, skip */ }
            })
          );
          if (i + BATCH_YEAR < tasks.length) await sleep(150);
        }

        // Match concerts against the index — pure local lookups
        let changed = false;
        for (const c of unchecked) {
          if (known.has(c.id)) continue;
          const slug =
            matchRelistenArtist(c.artist, relistenArtists) ||
            matchRelistenArtist(primaryArtist(c.artist), relistenArtists);
          if (!slug) continue;

          const dateSet = relistenDateIndex.get(slug);
          if (dateSet?.has(c.date)) {
            known.add(c.id);
            changed = true;
            setCache((prev) => {
              if (prev.has(c.id)) return prev;
              return new Map(prev).set(c.id, { status: "idle" });
            });
          }
        }
        if (changed) saveKnown(known);
      }

      // ── Step 2: Archive.org per-show checks ───────────────────────────────
      if (!cancelled) {
        const archiveConcerts = unchecked.filter((c) => {
          if (known.has(c.id)) return false;
          const slug = relistenArtists.length
            ? matchRelistenArtist(c.artist, relistenArtists) ||
              matchRelistenArtist(primaryArtist(c.artist), relistenArtists)
            : null;
          return !slug;
        });

        const BATCH_ARCHIVE = 4;
        let archiveChanged = false;

        for (let i = 0; i < archiveConcerts.length; i += BATCH_ARCHIVE) {
          if (cancelled) return;
          await Promise.all(
            archiveConcerts.slice(i, i + BATCH_ARCHIVE).map(async (c) => {
              if (known.has(c.id)) return;
              const found = await checkHasRecording(c.artist, c.date);
              if (found) {
                known.add(c.id);
                archiveChanged = true;
                setCache((prev) => {
                  if (prev.has(c.id)) return prev;
                  return new Map(prev).set(c.id, { status: "idle" });
                });
              }
            })
          );
          if (i + BATCH_ARCHIVE < archiveConcerts.length) await sleep(400);
        }

        if (archiveChanged) saveKnown(known);
      }
    }

    prefetch();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { cache, hasRecording, fetchRecording };
}
