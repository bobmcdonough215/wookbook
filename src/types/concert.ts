// src/types/concert.ts
//
// WookBook application type system.
//
// Three categories of types live here:
//
//   1. Db* types — mirror the Supabase schema exactly. One per table.
//      These are the shapes returned by raw Supabase queries.
//      Components never use these directly — they use the application types.
//
//   2. Application types — the shapes components and hooks work with.
//      Concert is the primary one: a merged view of DbShow + DbAttendance
//      for the current user. All existing components use Concert and remain
//      backward compatible after this change.
//
//   3. Zod schemas — runtime validation for all user-supplied data.
//      Used both client-side (UX feedback) and server-side (actual security).
//      Zod v3 syntax. Do not upgrade to Zod v4 without a full audit.

import { z } from "zod";

// ─── Database Row Types ───────────────────────────────────────────────────────

export type DbShow = {
  id: string;
  legacy_id: string | null;
  artist: string;
  event: string | null;
  venue: string;
  city: string;
  state: string;
  date: string;
  special_notes: string | null;
  source: "seed" | "user";
  created_by: string | null;
  created_at: string;
};

export type DbAttendance = {
  id: string;
  user_id: string;
  show_id: string;
  rating: number | null;
  memory: string | null;
  memory_public: boolean;
  added_at: string;
};

export type DbProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  created_at: string;
};

export type DbFollow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type DbWishlistItem = {
  id: string;
  user_id: string;
  artist: string;
  priority: "high" | "medium" | "low";
  notes: string | null;
  created_at: string;
};

export type DbUpcomingShow = {
  id: string;
  user_id: string;
  show_id: string | null;
  artist: string;
  date: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  ticket_url: string | null;
  notes: string | null;
  created_at: string;
};

// ─── Application Types ────────────────────────────────────────────────────────

export type Concert = {
  id: string;
  artist: string;
  event?: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  special_notes?: string;
  rating?: number;
  memory?: string;
  memory_public?: boolean;
  attendance_count?: number;
  i_was_there?: boolean;
};

export type WishlistItem = {
  id: string;
  artist: string;
  priority: "high" | "medium" | "low";
  notes?: string;
  addedAt: string;
};

export type UpcomingItem = {
  id: string;
  artist: string;
  date: string;
  venue?: string;
  city?: string;
  state?: string;
  ticketUrl?: string;
  notes?: string;
  showId?: string;
  addedAt: string;
};

export type UserProfile = {
  id: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  isPublic: boolean;
  showCount?: number;
  createdAt: string;
};

// ─── Zod Validation Schemas ───────────────────────────────────────────────────
// Zod v3 syntax. Used client-side (UX) and server-side (actual security gate).
// IMPORTANT: Client-side validation is UX only. Server-side API routes are
// the real enforcement boundary.

export const UsernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens"
  )
  .transform((s) => s.toLowerCase());

export const MemorySchema = z
  .string()
  .max(2000, "Memory must be under 2000 characters")
  .optional();

export const BioSchema = z
  .string()
  .max(500, "Bio must be under 500 characters")
  .optional();

export const RatingSchema = z
  .number()
  .int("Rating must be a whole number")
  .min(1, "Rating must be at least 1")
  .max(5, "Rating must be at most 5")
  .optional();

export const ShowInsertSchema = z.object({
  artist:        z.string().min(1, "Artist is required").max(200).trim(),
  venue:         z.string().min(1, "Venue is required").max(200).trim(),
  city:          z.string().min(1, "City is required").max(100).trim(),
  state:         z.string().min(1, "State is required").max(100).trim(),
  date:          z.string().regex(
    /^\d{4}(-\d{2}(-\d{2})?)?$/,
    "Date must be YYYY, YYYY-MM, or YYYY-MM-DD"
  ),
  event:         z.string().max(200).trim().optional(),
  special_notes: z.string().max(1000).trim().optional(),
});

export type ShowInsertInput = z.infer<typeof ShowInsertSchema>;

// ─── Date Helpers (unchanged) ─────────────────────────────────────────────────

export function parseConcertDate(d: string): {
  year: number;
  month?: number;
  day?: number;
  ts: number;
} {
  const parts = d.split("-");
  const year = parseInt(parts[0], 10);
  const month = parts[1] ? parseInt(parts[1], 10) : undefined;
  const day = parts[2] ? parseInt(parts[2], 10) : undefined;
  const ts = new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
  return { year, month, day, ts };
}

export function formatConcertDate(d: string): string {
  const { year, month, day } = parseConcertDate(d);
  if (day && month) {
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }
  if (month) {
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
    });
  }
  return String(year);
}
