// src/hooks/useWishlist.ts
//
// Supabase-backed wishlist. Replaces useLocalStorage<WishlistItem[]>.
//
// TanStack Query deduplicates: safe to call from both Index.tsx (for count)
// and WishlistView.tsx (for data) — only one network request is made.
//
// SECURITY:
// - user_id is always from useAuth(), never a parameter.
// - addWishlist validates artist before insertion.
// - removeWishlist scopes delete to .eq("user_id", user.id) as defense-in-depth.
// - priority is validated against the allowed set before insertion.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { WishlistItem } from "@/types/concert";

const VALID_PRIORITIES = new Set<WishlistItem["priority"]>(["high", "medium", "low"]);

export function useWishlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.wishlist(user?.id),
    queryFn: async (): Promise<WishlistItem[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("wishlist")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id:       row.id,
        artist:   row.artist,
        priority: VALID_PRIORITIES.has(row.priority as WishlistItem["priority"])
          ? (row.priority as WishlistItem["priority"])
          : "medium",
        notes:    row.notes ?? undefined,
        addedAt:  row.created_at,
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const addWishlist = useMutation({
    mutationFn: async (
      item: Pick<WishlistItem, "artist" | "priority" | "notes">
    ): Promise<WishlistItem> => {
      if (!user) throw new Error("Not authenticated");
      if (!item.artist.trim()) throw new Error("Artist is required");
      if (!VALID_PRIORITIES.has(item.priority))
        throw new Error("Invalid priority value");

      const { data, error } = await supabase
        .from("wishlist")
        .insert({
          user_id:  user.id,
          artist:   item.artist.trim(),
          priority: item.priority,
          notes:    item.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return {
        id:       data.id,
        artist:   data.artist,
        priority: data.priority as WishlistItem["priority"],
        notes:    data.notes ?? undefined,
        addedAt:  data.created_at,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(user?.id) });
    },
  });

  const removeWishlist = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("wishlist")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id); // Defense-in-depth alongside RLS
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(user?.id) });
    },
  });

  return {
    items: query.data ?? [],
    loading: query.isLoading,
    addWishlist,
    removeWishlist,
  };
}
