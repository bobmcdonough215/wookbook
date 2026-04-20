// src/hooks/useUpcoming.ts
//
// Supabase-backed upcoming shows. Replaces useLocalStorage<UpcomingItem[]>.
//
// Maps DbUpcomingShow → UpcomingItem (snake_case → camelCase for ticket_url).
// TanStack Query deduplicates: safe to call from both Index.tsx (for count)
// and UpcomingView.tsx (for data) — only one network request is made.
//
// SECURITY:
// - user_id is always from useAuth(), never a parameter.
// - addUpcoming validates artist and date format before insertion.
// - removeUpcoming scopes delete to .eq("user_id", user.id) as defense-in-depth
//   even though RLS already enforces this boundary.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { UpcomingItem } from "@/types/concert";

function toUpcomingItem(row: {
  id: string;
  artist: string;
  date: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  ticket_url: string | null;
  notes: string | null;
  show_id: string | null;
  created_at: string;
}): UpcomingItem {
  return {
    id:        row.id,
    artist:    row.artist,
    date:      row.date,
    venue:     row.venue ?? undefined,
    city:      row.city ?? undefined,
    state:     row.state ?? undefined,
    ticketUrl: row.ticket_url ?? undefined,
    notes:     row.notes ?? undefined,
    showId:    row.show_id ?? undefined,
    addedAt:   row.created_at,
  };
}

export function useUpcoming() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.upcoming(user?.id),
    queryFn: async (): Promise<UpcomingItem[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("upcoming_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toUpcomingItem);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const addUpcoming = useMutation({
    mutationFn: async (
      item: Omit<UpcomingItem, "id" | "addedAt">
    ): Promise<UpcomingItem> => {
      if (!user) throw new Error("Not authenticated");
      if (!item.artist.trim()) throw new Error("Artist is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date))
        throw new Error("Date must be YYYY-MM-DD");

      const { data, error } = await supabase
        .from("upcoming_shows")
        .insert({
          user_id:    user.id,
          artist:     item.artist.trim(),
          date:       item.date,
          venue:      item.venue ?? null,
          city:       item.city ?? null,
          state:      item.state ?? null,
          ticket_url: item.ticketUrl ?? null,
          notes:      item.notes ?? null,
          show_id:    item.showId ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return toUpcomingItem(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.upcoming(user?.id) });
    },
  });

  const removeUpcoming = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("upcoming_shows")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id); // Defense-in-depth alongside RLS
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.upcoming(user?.id) });
    },
  });

  return {
    items: query.data ?? [],
    loading: query.isLoading,
    addUpcoming,
    removeUpcoming,
  };
}
