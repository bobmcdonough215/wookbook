// src/hooks/useProfile.ts
//
// Fetches the current user's profile from the `profiles` table.
// Exposes `needsUsernameSetup` — true when the user still has the
// auto-generated temporary username from the handle_new_user trigger.
//
// Trigger creates: emailprefix_[6 hex chars] e.g. bobmcdonough_a1b2c3
// The _[a-f0-9]{6}$ regex detects this reliably — gen_random_uuid()
// produces hex chars and substr(..., 1, 6) takes the first 6.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { UsernameSchema } from "@/types/concert";

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(user?.id),
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const needsUsernameSetup = !!profileQuery.data?.username?.match(/_[a-f0-9]{6}$/);

  const updateProfile = useMutation({
    mutationFn: async (updates: {
      username?: string;
      display_name?: string;
      bio?: string;
      is_public?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate and normalize. UsernameSchema.transform() lowercases —
      // must use parsed.data, not the raw input, or uppercase letters
      // will fail the DB constraint username ~ '^[a-z0-9_-]+$'.
      if (updates.username !== undefined) {
        const parsed = UsernameSchema.safeParse(updates.username);
        if (!parsed.success) throw new Error(parsed.error.errors[0].message);
        updates = { ...updates, username: parsed.data };
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        // Postgres unique constraint errors aren't user-friendly — intercept them.
        if (error.message.includes("username") && error.message.includes("unique")) {
          throw new Error("That username is already taken. Try another.");
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate so needsUsernameSetup re-evaluates and the setup screen disappears.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(user?.id) });
    },
  });

  return {
    profile: profileQuery.data ?? null,
    loading: profileQuery.isLoading,
    needsUsernameSetup,
    updateProfile,
  };
}
