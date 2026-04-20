// src/lib/supabase-server.ts
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SERVER-SIDE ONLY. DO NOT IMPORT FROM COMPONENTS, HOOKS, OR PAGES.      ║
// ║  This file uses SUPABASE_SERVICE_KEY which bypasses RLS entirely.        ║
// ║  Importing it from browser code = full database exposure.                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Usage: Vercel serverless functions in api/ directory only.
// The service key is available only via process.env (Node.js),
// never via import.meta.env (Vite/browser).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Creates a Supabase client with the service key.
 * Bypasses Row Level Security — has full read/write access to all tables.
 * Use only for:
 *   - Cron job operations (tour event insertion)
 *   - Admin scripts
 *   - Operations that legitimately require cross-user data access
 *
 * Each call creates a new client instance. This is intentional for
 * serverless functions where you don't want to share state between invocations.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "[WookBook] Missing Supabase service credentials.\n" +
      "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in Vercel environment variables.\n" +
      "These must NOT have the VITE_ prefix — they are server-side only."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client that acts as the calling user.
 * Respects Row Level Security — access is scoped to what the user owns.
 * Use for API routes that perform operations on behalf of an authenticated user
 * but need server-side execution.
 *
 * @param accessToken - The user's JWT from the Authorization header
 */
export function createUserScopedClient(accessToken: string): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("[WookBook] Missing Supabase credentials for user-scoped client.");
  }

  return createClient<Database>(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
