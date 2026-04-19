import { useCallback, useEffect, useRef, useState } from "react";
import { Concert } from "@/types/concert";
import { RecordingEntry } from "@/types/recording";
import { checkHasRecording, findRecording, getSource } from "@/lib/recordings";

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
      }
    },
    [cache, updateCache]
  );

  // Background prefetch on mount
  useEffect(() => {
    let cancelled = false;

    async function prefetch() {
      const known = knownRef.current;
      const BATCH_RELISTEN = 8;
      const BATCH_ARCHIVE = 5;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const validDate = (c: Concert) =>
        /^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "");

      const relisten = concerts.filter(
        (c) => !known.has(c.id) && validDate(c) && getSource(c.artist).type === "relisten"
      );
      const archive = concerts.filter(
        (c) => !known.has(c.id) && validDate(c) && getSource(c.artist).type !== "relisten"
      );

      let changed = false;

      for (let i = 0; i < relisten.length; i += BATCH_RELISTEN) {
        if (cancelled) return;
        await Promise.all(
          relisten.slice(i, i + BATCH_RELISTEN).map(async (c) => {
            if (known.has(c.id)) return;
            const found = await checkHasRecording(c.artist, c.date);
            if (found) {
              known.add(c.id);
              changed = true;
              setCache((prev) => {
                if (prev.has(c.id)) return prev;
                return new Map(prev).set(c.id, { status: "idle" });
              });
            }
          })
        );
        if (i + BATCH_RELISTEN < relisten.length) await sleep(100);
      }

      for (let j = 0; j < archive.length; j += BATCH_ARCHIVE) {
        if (cancelled) return;
        await Promise.all(
          archive.slice(j, j + BATCH_ARCHIVE).map(async (c) => {
            if (known.has(c.id)) return;
            const found = await checkHasRecording(c.artist, c.date);
            if (found) {
              known.add(c.id);
              changed = true;
              setCache((prev) => {
                if (prev.has(c.id)) return prev;
                return new Map(prev).set(c.id, { status: "idle" });
              });
            }
          })
        );
        if (j + BATCH_ARCHIVE < archive.length) await sleep(300);
      }

      if (changed) saveKnown(known);
    }

    prefetch();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { cache, hasRecording, fetchRecording };
}
