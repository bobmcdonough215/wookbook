// src/hooks/useCsvImport.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { CsvRow } from "@/lib/csvParse";

export type ImportRowResult = {
  rowIndex: number;
  status: "imported" | "already_logged" | "error";
  message?: string;
};

export function useCsvImport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: CsvRow[]): Promise<ImportRowResult[]> => {
      if (!user) throw new Error("Not authenticated");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const validRows = rows
        .filter((r) => !r.error)
        .map((r) => ({
          rowIndex: r.rowIndex,
          artist:   r.artist,
          date:     r.date,
          city:     r.city,
          venue:    r.venue,
          opener:   r.opener,
          notes:    r.notes,
        }));

      // Batch in chunks of 50 to stay within edge function time limits.
      // A chunk failure doesn't abort subsequent chunks — errors are
      // accumulated per-chunk so the caller always gets a full result set.
      const BATCH = 50;
      const allResults: ImportRowResult[] = [];

      for (let i = 0; i < validRows.length; i += BATCH) {
        const chunk = validRows.slice(i, i + BATCH);

        try {
          const res = await fetch("/api/csv-import", {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ rows: chunk }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { error?: string };
            const msg = body.error ?? `HTTP ${res.status}`;
            // Record all rows in this chunk as errors rather than aborting
            for (const r of chunk) {
              allResults.push({ rowIndex: r.rowIndex, status: "error", message: msg });
            }
            continue;
          }

          const { results } = await res.json() as { results: ImportRowResult[] };
          allResults.push(...results);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Network error";
          for (const r of chunk) {
            allResults.push({ rowIndex: r.rowIndex, status: "error", message: msg });
          }
        }
      }

      return allResults;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.archive(user?.id) });
    },
  });
}
