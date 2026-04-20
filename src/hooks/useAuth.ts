// src/hooks/useAuth.ts
//
// Current user session management.
// Subscribes to Supabase auth state changes and exposes the current
// user, session, and loading state to the rest of the application.
//
// - `loading` is true only during the initial session check on mount.
//   After the first resolution it never goes back to true.
// - `user` is null when logged out, populated when logged in.
// - getSession() resolves from the persisted localStorage token — fast,
//   no network request unless the token needs refreshing.

import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Covers: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange fires SIGNED_OUT automatically — no need to clear state here
  };

  return { user, session, loading, signOut };
}
