// src/hooks/useSetlist.ts
// Fetches setlist data from our /api/setlist proxy.
// Data is cached in-memory for the session only — never written to Supabase.
// Setlist.fm ToS compliance: no persistent storage, attribution rendered in UI.

import { useQuery } from "@tanstack/react-query";

export type SetlistSet = {
  label: string;
  songs: string[];
};

export type SetlistData = {
  sets: SetlistSet[];
  venue: string | null;
  city: string | null;
  url: string | null;
  eventDate: string;
};

export function useSetlist(artist: string | undefined, date: string | undefined) {
  const enabled =
    !!artist &&
    !!date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date);

  return useQuery<SetlistData | null>({
    queryKey: ["setlist", artist, date],
    queryFn: async () => {
      const res = await fetch(
        `/api/setlist?artist=${encodeURIComponent(artist!)}&date=${encodeURIComponent(date!)}`
      );
      if (!res.ok) throw new Error(`Setlist fetch failed: ${res.status}`);
      const data = await res.json();
      return data.setlist ?? null;
    },
    enabled,
    staleTime: 30 * 60 * 1000, // 30 min — fresh enough, respects ToS short-period cache
    gcTime: 60 * 60 * 1000,    // drop from memory after 1 hour
    retry: 1,
  });
}
