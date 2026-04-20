// src/components/UsernameSetupModal.tsx
//
// Full-screen username setup flow.
// Returned early from Index.tsx when !authLoading && !!user && needsUsernameSetup.
// Blocks all app interaction until a real username is saved.
//
// The handle_new_user DB trigger creates a temporary username on signup.
// This screen replaces it with the user's chosen handle.
//
// After a successful save, queryKeys.profile is invalidated → profileQuery
// refetches → needsUsernameSetup becomes false → Index.tsx renders the
// normal app. No navigation needed.
//
// Username rules (UsernameSchema + DB constraint):
//   - 3–30 characters
//   - Lowercase letters, numbers, underscores, hyphens only
//   - UsernameSchema.transform() lowercases input on parse

import { useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { UsernameSchema } from "@/types/concert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const UsernameSetupModal = () => {
  const { updateProfile } = useProfile();
  const [username, setUsername] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live validation — only runs on non-empty input so the field
  // doesn't show errors before the user has typed anything.
  const liveValidationError = username
    ? (() => {
        const result = UsernameSchema.safeParse(username);
        return result.success ? null : result.error.errors[0].message;
      })()
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const result = UsernameSchema.safeParse(username);
    if (!result.success) {
      setSubmitError(result.error.errors[0].message);
      return;
    }

    try {
      await updateProfile.mutateAsync({ username: result.data });
      // On success: profile invalidated → needsUsernameSetup = false → normal app renders.
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Couldn't save username. Try again."
      );
    }
  };

  const isSubmitDisabled = !username || !!liveValidationError || updateProfile.isPending;

  return (
    <div className="grain flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border-2 border-ink bg-card p-10 shadow-[5px_5px_0_hsl(var(--ink))] rounded-sm">
        <div className="stamp mb-2">One more thing</div>
        <h1 className="font-display text-4xl leading-none text-foreground">
          Choose your handle.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground italic">
          This is how other wooks will find you. Letters, numbers, underscores,
          and hyphens only. No spaces.
        </p>

        <div className="brass-rule my-6" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="new-username" className="stamp">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setSubmitError(null);
              }}
              placeholder="e.g. deadhead_bob"
              autoFocus
              autoComplete="username"
              disabled={updateProfile.isPending}
              className="border-2 border-ink font-mono"
            />
            {liveValidationError && (
              <p className="font-mono text-[10px] text-destructive">
                {liveValidationError}
              </p>
            )}
          </div>

          {submitError && (
            <div className="rounded-sm border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {submitError}
            </div>
          )}

          <Button type="submit" disabled={isSubmitDisabled} className="w-full">
            {updateProfile.isPending ? "Saving…" : "Set username"}
          </Button>
        </form>

        <div className="ink-rule mt-6" />

        <p className="mt-4 font-mono text-[10px] text-muted-foreground text-center">
          You can change this later in your profile settings.
        </p>
      </div>
    </div>
  );
};
