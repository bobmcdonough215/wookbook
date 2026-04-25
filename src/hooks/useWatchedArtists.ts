import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";

export type WatchedArtist = {
  id:          string;
  artistName:  string;
  showCount:   number;
  autoWatched: boolean;
  muted:       boolean;
  createdAt:   string;
};

function toWatchedArtist(row: any): WatchedArtist {
  return {
    id:          row.id,
    artistName:  row.artist_name,
    showCount:   row.show_count,
    autoWatched: row.auto_watched,
    muted:       row.muted,
    createdAt:   row.created_at,
  };
}

export const WATCHED_LIMIT = 50;

export function useWatchedArtists() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.watchedArtists(user?.id),
    queryFn: async (): Promise<WatchedArtist[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("watched_artists")
        .select("*")
        .eq("user_id", user.id)
        .order("show_count", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toWatchedArtist);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Bulk upsert from archive — idempotent, safe to call repeatedly.
  // Respects the 50-artist limit: updates existing watched artists freely,
  // only adds new ones up to the remaining available slots (top by show count).
  const syncFromArchive = useMutation({
    mutationFn: async (archiveArtists: { name: string; count: number }[]) => {
      if (!user) throw new Error("Not authenticated");
      if (!archiveArtists.length) return;

      const current = query.data ?? [];
      const currentNames = new Set(current.map((a) => a.artistName.toLowerCase()));
      const slotsAvailable = Math.max(0, WATCHED_LIMIT - current.length);

      const updates = archiveArtists.filter((a) => currentNames.has(a.name.toLowerCase()));
      const additions = archiveArtists
        .filter((a) => !currentNames.has(a.name.toLowerCase()))
        .sort((a, b) => b.count - a.count)
        .slice(0, slotsAvailable);

      const toUpsert = [...updates, ...additions];
      if (!toUpsert.length) return;

      const rows = toUpsert.map((a) => ({
        user_id:      user.id,
        artist_name:  a.name,
        show_count:   a.count,
        auto_watched: true,
        muted:        false,
      }));
      const { error } = await supabase
        .from("watched_artists")
        .upsert(rows, { onConflict: "user_id,artist_name", ignoreDuplicates: false });
      if (error) throw error;

      return { added: additions.length, updated: updates.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchedArtists(user?.id) });
    },
  });

  const toggleMute = useMutation({
    mutationFn: async ({ id, muted }: { id: string; muted: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("watched_artists")
        .update({ muted })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchedArtists(user?.id) });
    },
  });

  const addArtist = useMutation({
    mutationFn: async (artistName: string) => {
      if (!user) throw new Error("Not authenticated");
      const current = query.data ?? [];
      if (current.length >= WATCHED_LIMIT) {
        throw new Error(`You can watch up to ${WATCHED_LIMIT} artists.`);
      }
      const { error } = await supabase
        .from("watched_artists")
        .upsert(
          { user_id: user.id, artist_name: artistName.trim(), show_count: 0, auto_watched: false, muted: false },
          { onConflict: "user_id,artist_name", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchedArtists(user?.id) });
    },
  });

  const removeArtist = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("watched_artists")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchedArtists(user?.id) });
    },
  });

  return {
    artists:         query.data ?? [],
    loading:         query.isLoading,
    atLimit:         (query.data ?? []).length >= WATCHED_LIMIT,
    slotsRemaining:  Math.max(0, WATCHED_LIMIT - (query.data ?? []).length),
    syncFromArchive,
    addArtist,
    toggleMute,
    removeArtist,
  };
}
