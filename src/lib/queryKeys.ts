// src/lib/queryKeys.ts
//
// Centralized TanStack Query cache key factory.
//
// Rules:
//   - All query keys live here. No inline key arrays in hooks.
//   - Keys are typed with `as const` for full tuple inference.
//   - Hierarchical structure: ["entity", id, "sub-entity"] enables
//     partial invalidation. queryClient.invalidateQueries({ queryKey: ["show", showId] })
//     invalidates both ["show", showId] AND ["show", showId, "attendees"].
//
// When adding a new key:
//   1. Add it here first
//   2. Use it in the hook
//   3. Never duplicate the key structure elsewhere

export const queryKeys = {
  // ── Auth & Profile ──────────────────────────────────────────────────────────
  profile: (userId?: string) =>
    ["profile", userId] as const,

  userProfile: (username: string) =>
    ["user", username] as const,

  // ── Archive ─────────────────────────────────────────────────────────────────
  archive: (userId?: string) =>
    ["archive", userId] as const,

  // ── Show Catalog ─────────────────────────────────────────────────────────────
  show: (showId: string) =>
    ["show", showId] as const,

  showAttendees: (showId: string) =>
    ["show", showId, "attendees"] as const,

  // ── Social ───────────────────────────────────────────────────────────────────
  follows: (userId?: string) =>
    ["follows", userId] as const,

  followers: (userId?: string) =>
    ["followers", userId] as const,

  feed: (userId?: string) =>
    ["feed", userId] as const,

  // ── Upcoming & Wishlist ───────────────────────────────────────────────────────
  upcoming: (userId?: string) =>
    ["upcoming", userId] as const,

  wishlist: (userId?: string) =>
    ["wishlist", userId] as const,

  // ── Discover (Phase 4) ────────────────────────────────────────────────────────
  tourEvents: () =>
    ["tourEvents"] as const,

  interestLog: (userId?: string) =>
    ["interestLog", userId] as const,

  watchedArtists: (userId?: string) =>
    ["watchedArtists", userId] as const,

  // ── Recording (existing system) ───────────────────────────────────────────────
  relistenArtists: () =>
    ["relistenArtists"] as const,
} as const;

export type QueryKey<T extends keyof typeof queryKeys> =
  ReturnType<(typeof queryKeys)[T]>;
