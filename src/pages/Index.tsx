// src/pages/Index.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Concert, UpcomingItem } from "@/types/concert";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useArchive } from "@/hooks/useArchive";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useWishlist } from "@/hooks/useWishlist";
import { migrateLegacyLocalStorage } from "@/lib/migrateLegacyData";
import { queryKeys } from "@/lib/queryKeys";
import { useRecordings } from "@/hooks/useRecordings";
import { useRecordingPlayer } from "@/hooks/useRecordingPlayer";
import { AuthModal } from "@/components/AuthModal";
import { ProfileSettingsModal } from "@/components/ProfileSettingsModal";
import { LandingView } from "@/components/LandingView";
import { UsernameSetupModal } from "@/components/UsernameSetupModal";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, ViewKey } from "@/components/AppSidebar";
import { ArchiveView } from "@/components/ArchiveView";
import { UpcomingView } from "@/components/UpcomingView";
import { WishlistView } from "@/components/WishlistView";
import { Stats } from "@/components/Stats";
import { DiscoverView } from "@/components/DiscoverView";
import { CsvImportView } from "@/components/CsvImportView";
import { AudioPlayer } from "@/components/AudioPlayer";
import { LogIn, LogOut } from "lucide-react";

const Index = () => {
  const queryClient = useQueryClient();
  const { user, loading: authLoading, signOut } = useAuth();
  const { needsUsernameSetup, profile } = useProfile();
  const { concerts, loading: archiveLoading, saveAttendance, removeAttendance } = useArchive();
  const { items: upcomingItems, removeUpcoming } = useUpcoming();
  const { items: wishlistItems } = useWishlist();
  const [view, setView] = useState<ViewKey>("archive");
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // ── One-time localStorage migration ───────────────────────────────────────────
  // Runs on first login after Session D. The migration function is idempotent —
  // it checks the migration flag and returns immediately on subsequent logins.
  // After migration, invalidate the archive query to load the newly migrated data.
  useEffect(() => {
    if (!user) return;
    migrateLegacyLocalStorage(user.id).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.archive(user.id) });
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording player ──────────────────────────────────────────────────────────
  const { cache: recordingCache, hasRecording, fetchRecording } = useRecordings(concerts);
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    audioError,
    play,
    toggle,
    seek,
    dismiss,
  } = useRecordingPlayer();

  useEffect(() => {
    if (audioError) toast.error(audioError);
  }, [audioError]);

  const [currentConcert, setCurrentConcert] = useState<Concert | null>(null);
  const [currentTracks, setCurrentTracks] = useState<import("@/types/recording").Track[]>([]);

  const handlePlay = (track: import("@/types/recording").Track, concert?: Concert) => {
    play(track);
    if (concert) {
      setCurrentConcert(concert);
      const entry = recordingCache.get(concert.id);
      if (entry?.status === "found") setCurrentTracks(entry.tracks);
    }
  };
  const handleToggle = (track: import("@/types/recording").Track, concert?: Concert) => {
    toggle(track);
    if (concert) {
      setCurrentConcert(concert);
      const entry = recordingCache.get(concert.id);
      if (entry?.status === "found") setCurrentTracks(entry.tracks);
    }
  };
  const handleDismiss = () => {
    dismiss();
    setCurrentConcert(null);
    setCurrentTracks([]);
  };

  // ── Save concert (rating + memory) ───────────────────────────────────────────
  const handleSaveConcert = useCallback((concert: Concert) => {
    saveAttendance.mutate(
      {
        showId:       concert.id,
        rating:       concert.rating,
        memory:       concert.memory,
        memoryPublic: concert.memory_public ?? false,
      },
      {
        onSuccess: () => toast.success("Stub updated"),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Couldn't save changes"),
      }
    );
  }, [saveAttendance]);

  const handleDeleteConcert = useCallback((id: string) => {
    removeAttendance.mutate(id, {
      onSuccess: () => toast.success("Show removed from archive"),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Couldn't remove show"),
    });
  }, [removeAttendance]);

  // ── Mark upcoming show as attended ────────────────────────────────────────────
  // Removes from upcoming_shows. If the item has a showId, logs attendance.
  // If not (manually added upcoming shows), just removes and prompts the user.
  const handleAttend = useCallback((item: UpcomingItem) => {
    removeUpcoming.mutate(item.id);
    if (item.showId) {
      saveAttendance.mutate({ showId: item.showId });
    } else {
      toast.success("Marked as attended. Find the show in your archive to rate it.");
    }
  }, [removeUpcoming, saveAttendance]);

  // ── Global stats (computed from live archive data) ────────────────────────────
  const globalStats = useMemo(() => ({
    shows:   concerts.length,
    artists: new Set(concerts.map((c) => c.artist)).size,
    venues:  new Set(concerts.map((c) => c.venue).filter(Boolean)).size,
    years:   new Set(concerts.map((c) => c.date?.slice(0, 4)).filter(Boolean)).size,
  }), [concerts]);

  // ── Auth gates ────────────────────────────────────────────────────────────────
  // Full-page landing for logged-out users — no sidebar, no Bob's stats.
  if (!authLoading && !user) {
    return (
      <>
        <LandingView onSignIn={() => setShowAuthModal(true)} />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }

  // !!user guard on username check: TanStack Query caches profile data for gcTime
  // (10 min) after sign-out. Without !!user, a signed-out user with a cached temp
  // username would see the username setup screen.
  if (!authLoading && !!user && needsUsernameSetup) {
    return <UsernameSetupModal />;
  }

  const titleByView: Record<ViewKey, { eyebrow: string; title: string; sub: string }> = {
    archive:  { eyebrow: "Beta Version 0.01", title: "The Archive",      sub: "" },
    stats:    { eyebrow: "Volume II",  title: "By the Numbers",   sub: "Patterns drawn from the ledger." },
    upcoming: { eyebrow: "Volume III", title: "On the Horizon",   sub: "Tickets in hand, dates circled." },
    wishlist: { eyebrow: "Volume IV",  title: "The Wishlist",     sub: "Shows you'd cross a state line for." },
    discover: { eyebrow: "Volume V",   title: "Discover",         sub: "New dates for artists you love." },
    import:   { eyebrow: "Utility",   title: "Import CSV",        sub: "Bring your whole history in at once." },
  };
  const head = titleByView[view];

  return (
    <SidebarProvider defaultOpen>
      <div className="grain flex min-h-screen w-full bg-background">
        <AppSidebar
          view={view}
          onView={(v) => { setView(v); if (v !== "archive") setSelectedArtist(null); }}
          concerts={concerts}
          selectedArtist={selectedArtist}
          onSelectArtist={(a) => { setSelectedArtist(a); setView("archive"); }}
          search={search}
          onSearch={setSearch}
          upcomingCount={upcomingItems.length}
          wishlistCount={wishlistItems.length}
        />

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b-2 border-ink bg-background/95 backdrop-blur">
            <div className="flex items-center gap-2 px-3 py-3 sm:px-6">
              <SidebarTrigger className="border border-ink" />
              <div className="stamp">
                ◆ WookBook<span className="hidden sm:inline"> — Personal Concert Ledger</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {user && profile ? (
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="stamp text-primary hover:underline transition-colors"
                    title="Profile settings"
                  >
                    @{profile.username}
                  </button>
                ) : null}
                {!authLoading && (
                  user ? (
                    <button
                      onClick={signOut}
                      className="flex items-center gap-1 stamp text-muted-foreground hover:text-foreground transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="h-3 w-3" />
                      <span className="hidden sm:inline">Sign out</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="flex items-center gap-1 stamp text-primary hover:underline transition-colors"
                    >
                      <LogIn className="h-3 w-3" />
                      <span className="hidden sm:inline">Sign in</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </header>

          {/* Global stats strip */}
          <div className="border-b-2 border-ink bg-card">
            <div className="mx-auto flex max-w-5xl divide-x-2 divide-ink px-2 sm:px-6">
              {[
                { val: globalStats.shows,   label: "Shows" },
                { val: globalStats.artists, label: "Artists" },
                { val: globalStats.venues,  label: "Venues" },
                { val: globalStats.years,   label: "Years" },
              ].map(({ val, label }) => (
                <div key={label} className="flex flex-col items-center px-3 py-3 first:pl-0 last:pr-0 sm:px-6">
                  <span className="font-mono text-lg font-semibold leading-none sm:text-xl">{val}</span>
                  <span className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:text-[10px]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-5xl space-y-8">
              <div>
                <div className="stamp">{head.eyebrow}</div>
                <h1 className="mt-1 font-display text-5xl leading-none sm:text-6xl">
                  {head.title}
                </h1>
                <p className="mt-3 max-w-xl text-muted-foreground italic">{head.sub}</p>
                <div className="brass-rule mt-5" />
              </div>

              {/* Archive loading state — shown while Supabase query resolves */}
              {view === "archive" && archiveLoading && (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-sm border-2 border-ink bg-card opacity-50"
                    />
                  ))}
                </div>
              )}

              {view === "archive" && !archiveLoading && (
                <ArchiveView
                  concerts={concerts}
                  onSaveConcert={handleSaveConcert}
                  onDeleteConcert={handleDeleteConcert}
                  selectedArtist={selectedArtist}
                  onClearArtist={() => setSelectedArtist(null)}
                  recordingCache={recordingCache}
                  hasRecording={hasRecording}
                  onFetchRecording={fetchRecording}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  onPlayTrack={handlePlay}
                  onToggleTrack={handleToggle}
                />
              )}
              {view === "stats"    && <Stats concerts={concerts} />}
              {view === "upcoming" && <UpcomingView onAttend={handleAttend} />}
              {view === "wishlist" && <WishlistView />}
              {view === "discover" && <DiscoverView concerts={concerts} />}
              {view === "import"   && <CsvImportView />}
            </div>
          </main>

          <footer className={`border-t-2 border-ink px-4 py-4 sm:px-6 ${currentTrack ? "pb-20" : ""}`}>
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <div className="stamp">WookBook · est. {new Date().getFullYear()}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                Pressed in oxblood &amp; bone
              </div>
            </div>
          </footer>
        </div>
      </div>

      {currentTrack && (
        <AudioPlayer
          track={currentTrack}
          tracks={currentTracks}
          concert={currentConcert}
          isPlaying={isPlaying}
          progress={progress}
          duration={duration}
          onToggle={() => toggle(currentTrack)}
          onPlayTrack={handlePlay}
          onSeek={seek}
          onDismiss={handleDismiss}
        />
      )}

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      <ProfileSettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
    </SidebarProvider>
  );
};

export default Index;
