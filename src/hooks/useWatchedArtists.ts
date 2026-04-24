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

  // Bulk upsert from archive — idempotent, safe to call repeatedly
  const syncFromArchive = useMutation({
    mutationFn: async (archiveArtists: { name: string; count: number }[]) => {
      if (!user) throw new Error("Not authenticated");
      if (!archiveArtists.length) return;
      const rows = archiveArtists.map((a) => ({
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
    syncFromArchive,
    toggleMute,
    removeArtist,
  };
}
