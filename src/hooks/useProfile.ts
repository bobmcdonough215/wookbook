// src/hooks/useProfile.ts
//
// Fetches the current user's profile from the `profiles` table.
// Exposes `needsUsernameSetup` — true when the user still has the
// auto-generated temporary username from the handle_new_user trigger.
//
// Trigger creates: emailprefix_[6 hex chars] e.g. bobmcdonough_a1b2c3
// The _[a-f0-9]{6}$ regex detects this reliably — gen_random_uuid()
// produces hex chars and substr(..., 1, 6) takes the first 6.
//
// Geocoding: when home_city changes, we fire a POST to /api/geocode
// which writes home_lat + home_lng back to the profile. This happens
// after the profile save succeeds — the cron reads those coordinates,
// never home_city itself.

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
      username?:     string;
      display_name?: string;
      bio?:          string;
      is_public?:    boolean;
      home_city?:    string;
      ntfy_topic?:   string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate and normalize username if provided.
      // UsernameSchema.transform() lowercases — must use parsed.data,
      // not raw input, or uppercase letters fail the DB constraint.
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
        if (error.message.includes("username") && error.message.includes("unique")) {
          throw new Error("That username is already taken. Try another.");
        }
        throw error;
      }

      // ------------------------------------------------------------------
      // Geocode home_city → home_lat + home_lng if city was updated.
      // We fire this after the profile save so a geocode failure doesn't
      // block the username/profile save from succeeding.
      // Errors are swallowed here — the user can retry by saving again.
      // ------------------------------------------------------------------
      if (updates.home_city?.trim()) {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (token) {
            await fetch("/api/geocode", {
              method: "POST",
              headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({ city: updates.home_city.trim() }),
            });
            // No need to parse the response here — the cron reads from DB directly.
            // Profile query invalidation below will pick up the new lat/lng.
          }
        } catch {
          // Geocode failure is non-fatal — user's home_city is still saved.
          // The cron will skip this user until lat/lng are populated.
          console.warn("useProfile: geocode call failed — home_lat/lng not updated");
        }
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate so needsUsernameSetup re-evaluates and the setup screen
      // disappears, and so home_lat/lng from the geocode call are reflected.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(user?.id) });
    },
  });

  return {
    profile:           profileQuery.data ?? null,
    loading:           profileQuery.isLoading,
    needsUsernameSetup,
    updateProfile,
  };
}
