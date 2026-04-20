// src/hooks/useArchive.ts
//
// Supabase-backed concert archive. Replaces useLocalStorage<Concert[]>.
//
// Calls get_user_archive() — a security-definer RPC that returns only the
// calling user's attendance records joined to shows. The RPC is preferred
// over a raw join because it centralizes the attendance_count subquery on
// the DB side and keeps the client query simple.
//
// saveAttendance uses optimistic updates with mandatory rollback on error.
// The onMutate / onError / onSettled pattern is required — do not simplify
// it. A failed network write without rollback leaves the UI in a corrupted
// state that only resolves on the next full refetch.
//
// SECURITY:
// - user_id is always derived from useAuth(), never accepted as a parameter.
// - rating and memory are validated against Zod schemas before any DB write.
// - Personal data (memory text) is never logged to the console.
// - Upsert on user_id,show_id ensures idempotency — safe to retry on failure.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { Concert, RatingSchema, MemorySchema } from "@/types/concert";

export function useArchive() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const archiveQuery = useQuery({
    queryKey: queryKeys.archive(user?.id),
    queryFn: async (): Promise<Concert[]> => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_user_archive", {
        p_user_id: user.id,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id:               row.show_id,
        artist:           row.artist,
        event:            row.event ?? undefined,
        venue:            row.venue,
        city:             row.city,
        state:            row.state,
        date:             row.date,
        special_notes:    row.special_notes ?? undefined,
        rating:           row.rating ?? undefined,
        memory:           row.memory ?? undefined,
        memory_public:    row.memory_public,
        attendance_count: Number(row.attendance_count ?? 0),
        i_was_there:      true,
      }));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const saveAttendance = useMutation({
    mutationFn: async ({
      showId,
      rating,
      memory,
      memoryPublic = false,
    }: {
      showId: string;
      rating?: number;
      memory?: string;
      memoryPublic?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate before writing — mirrors DB constraints client-side
      if (rating !== undefined) {
        const r = RatingSchema.safeParse(rating);
        if (!r.success) throw new Error(r.error.errors[0].message);
      }
      if (memory !== undefined) {
        const m = MemorySchema.safeParse(memory);
        if (!m.success) throw new Error(m.error.errors[0].message);
      }

      const { data, error } = await supabase
        .from("attendances")
        .upsert(
          {
            user_id:       user.id,
            show_id:       showId,
            rating:        rating ?? null,
            memory:        memory ?? null,
            memory_public: memoryPublic,
          },
          { onConflict: "user_id,show_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    onMutate: async ({ showId, rating, memory, memoryPublic = false }) => {
      // Cancel any in-flight refetches to prevent race with optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.archive(user?.id) });

      // Snapshot current data for rollback on error
      const previous = queryClient.getQueryData<Concert[]>(
        queryKeys.archive(user?.id)
      );

      // Apply optimistic update — UI reflects the change immediately
      queryClient.setQueryData<Concert[]>(
        queryKeys.archive(user?.id),
        (old = []) =>
          old.map((c) =>
            c.id === showId
              ? { ...c, rating, memory, memory_public: memoryPublic }
              : c
          )
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Mandatory rollback — restores UI to pre-mutation state on any error
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.archive(user?.id), context.previous);
      }
    },

    onSettled: () => {
      // Always sync with server after mutation completes (success or failure)
      queryClient.invalidateQueries({ queryKey: queryKeys.archive(user?.id) });
    },
  });

  return {
    concerts:        archiveQuery.data ?? [],
    loading:         archiveQuery.isLoading,
    error:           archiveQuery.error,
    saveAttendance,
  };
}
