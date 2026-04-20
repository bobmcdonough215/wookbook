// src/components/AuthModal.tsx
//
// Email + password authentication modal.
// Two modes: sign_in and sign_up — user can toggle between them.
//
// Sign-up with email confirmation disabled: signUp() returns { user, session }.
//   User is immediately signed in. onAuthStateChange fires. Modal closes.
//   Username setup screen appears.
//
// Sign-up with email confirmation enabled: signUp() returns { user, session: null }.
//   Modal shows confirmation message and switches to sign-in mode.
//   User confirms email, then signs in normally.

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "sign_in" | "sign_up";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AuthModal = ({ open, onOpenChange }: Props) => {
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setInfo(null);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    clearMessages();
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setEmail("");
      setPassword("");
      clearMessages();
      setMode("sign_in");
    }
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();

    try {
      if (mode === "sign_in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange fires SIGNED_IN — useAuth updates automatically.
        handleClose(false);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user && !data.session) {
          // Email confirmation required — user must verify before signing in.
          // switchMode calls clearMessages() internally, so setInfo must come after.
          switchMode("sign_in");
          setInfo("Account created. Check your email to confirm, then sign in.");
        } else {
          // Immediately signed in — onAuthStateChange fires, modal closes.
          handleClose(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm border-2 border-ink bg-card shadow-[5px_5px_0_hsl(var(--ink))] rounded-sm">
        <DialogHeader>
          <div className="stamp mb-1">WookBook</div>
          <DialogTitle className="font-display text-3xl leading-tight">
            {mode === "sign_in" ? "Welcome back." : "Join the ledger."}
          </DialogTitle>
        </DialogHeader>

        <div className="brass-rule" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="auth-email" className="stamp">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="border-2 border-ink"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="auth-password" className="stamp">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
              className="border-2 border-ink"
            />
            {mode === "sign_up" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Minimum 6 characters.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-sm border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Brass styling distinguishes info from error — both --primary and --destructive
              resolve to oxblood, making them visually identical if both use primary/destructive. */}
          {info && (
            <div className="rounded-sm border-2 border-accent bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
              {info}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full"
          >
            {loading ? "…" : mode === "sign_in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="ink-rule" />

        <div className="text-center">
          {mode === "sign_in" ? (
            <p className="font-mono text-xs text-muted-foreground">
              No account?{" "}
              <button
                type="button"
                onClick={() => switchMode("sign_up")}
                className="text-primary hover:underline"
              >
                Create one
              </button>
            </p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("sign_in")}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
