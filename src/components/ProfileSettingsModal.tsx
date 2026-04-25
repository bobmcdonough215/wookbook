import { useState, useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";
import { UsernameSchema } from "@/types/concert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ProfileSettingsModal = ({ open, onOpenChange }: Props) => {
  const { profile, updateProfile } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername]       = useState("");
  const [bio, setBio]                 = useState("");
  const [isPublic, setIsPublic]       = useState(false);
  const [homeCity, setHomeCity]       = useState("");
  const [profileError, setProfileError]   = useState<string | null>(null);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [homeCityGeoNote, setHomeCityGeoNote] = useState(false);

  const [ntfyTopic, setNtfyTopic]         = useState("");
  const [notifError, setNotifError]       = useState<string | null>(null);
  const [notifSaved, setNotifSaved]       = useState(false);
  const [notifPending, setNotifPending]   = useState(false);

  const usernameError = username
    ? (() => {
        const r = UsernameSchema.safeParse(username);
        return r.success ? null : r.error.errors[0].message;
      })()
    : null;

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.display_name ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setIsPublic(profile.is_public ?? false);
      setHomeCity(profile.home_city ?? "");
      setNtfyTopic(profile.ntfy_topic ?? "");
      setProfileError(null);
      setNotifError(null);
      setProfileSaved(false);
      setNotifSaved(false);
      setHomeCityGeoNote(false);
    }
  }, [open, profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfilePending(true);
    const originalCity = profile?.home_city?.trim() ?? "";
    const newCity = homeCity.trim();
    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || undefined,
        username,
        bio:          bio.trim() || undefined,
        is_public:    isPublic,
        home_city:    newCity || undefined,
      });
      setHomeCityGeoNote(!!newCity && newCity !== originalCity);
      setProfileSaved(true);
      setTimeout(() => { setProfileSaved(false); setHomeCityGeoNote(false); }, 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save profile. Try again.");
    } finally {
      setProfilePending(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifError(null);
    setNotifPending(true);
    try {
      await updateProfile.mutateAsync({
        ntfy_topic: ntfyTopic.trim() || undefined,
      });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : "Couldn't save notification settings. Try again.");
    } finally {
      setNotifPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-2 border-ink bg-card shadow-[5px_5px_0_hsl(var(--ink))] rounded-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="stamp mb-1">Account</div>
          <DialogTitle className="font-display text-3xl leading-tight">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="brass-rule" />

        {/* ── Profile section ─────────────────────────────────── */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="stamp">Profile</div>

          <div className="space-y-1">
            <Label htmlFor="settings-display-name" className="stamp">Display name</Label>
            <Input
              id="settings-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Bob McDonough"
              autoComplete="off"
              disabled={profilePending}
              className="border-2 border-ink font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="settings-username" className="stamp">Username</Label>
            <Input
              id="settings-username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setProfileError(null); }}
              placeholder="e.g. deadhead_bob"
              autoComplete="username"
              disabled={profilePending}
              className="border-2 border-ink font-mono"
            />
            {usernameError && (
              <p className="font-mono text-[10px] text-destructive">{usernameError}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="settings-bio" className="stamp">Bio</Label>
            <Textarea
              id="settings-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. 342 shows deep. Mostly rail. Philly."
              disabled={profilePending}
              className="border-2 border-ink font-mono text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="stamp">Public profile</div>
              <p className="font-mono text-[10px] text-muted-foreground">
                Let other users find and view your archive.
              </p>
            </div>
            <input
              type="checkbox"
              id="settings-is-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={profilePending}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="settings-home-city" className="stamp">Home city</Label>
            <p className="font-mono text-[10px] text-muted-foreground">
              Used to calculate drive times and flag home market shows in Discover.
            </p>
            <Input
              id="settings-home-city"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              placeholder="e.g. Philadelphia, PA or 19103"
              autoComplete="off"
              disabled={profilePending}
              className="border-2 border-ink font-mono"
            />
          </div>

          {profileError && (
            <div className="rounded-sm border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {profileError}
            </div>
          )}

          {profileSaved && (
            <div className="rounded-sm border-2 border-accent bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
              {homeCityGeoNote
                ? "Profile saved — location coordinates will update shortly."
                : "Profile saved."}
            </div>
          )}

          <Button
            type="submit"
            disabled={!username || !!usernameError || profilePending}
            className="w-full"
          >
            {profilePending ? "Saving…" : "Save profile"}
          </Button>
        </form>

        <div className="brass-rule my-2" />

        {/* ── Notifications section ────────────────────────────── */}
        <form onSubmit={handleSaveNotifications} className="space-y-4">
          <div className="stamp">Notifications</div>

          <div className="space-y-1">
            <Label htmlFor="settings-ntfy-topic" className="stamp">Notification channel</Label>
            <p className="font-mono text-[10px] text-muted-foreground">
              Install the free Ntfy app → create any topic name you choose
              (e.g. <span className="text-foreground">wookbook-yourname</span>) → subscribe to it → paste the
              topic name here. WookBook will notify you the moment a new show
              is announced for an artist you're watching.
            </p>
            <Input
              id="settings-ntfy-topic"
              value={ntfyTopic}
              onChange={(e) => setNtfyTopic(e.target.value)}
              placeholder="e.g. wookbook-deadhead-bob"
              autoComplete="off"
              disabled={notifPending}
              className="border-2 border-ink font-mono"
            />
          </div>

          {notifError && (
            <div className="rounded-sm border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {notifError}
            </div>
          )}

          {notifSaved && (
            <div className="rounded-sm border-2 border-accent bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
              Notification settings saved.
            </div>
          )}

          <Button type="submit" disabled={notifPending} className="w-full">
            {notifPending ? "Saving…" : "Save notifications"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
