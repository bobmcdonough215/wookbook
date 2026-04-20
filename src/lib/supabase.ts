// src/lib/supabase.ts
//
// Browser-side Supabase client. Singleton — created once, imported everywhere.
//
// Uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — both are intentionally
// public. Security is enforced by Row Level Security policies on every table,
// not by key secrecy.
//
// NEVER import supabase-server.ts from this file or any file under src/.
// NEVER use the service key here.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  throw new Error(
    "[WookBook] Missing Supabase environment variables.\n" +
    "Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local.\n" +
    "These variables are intentionally public — do not confuse them with SUPABASE_SERVICE_KEY."
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  url,
  anon,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-app-name": "wookbook",
      },
    },
  }
);

export type { Database };
