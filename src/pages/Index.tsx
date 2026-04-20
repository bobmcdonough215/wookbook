import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import rawData from "@/data/concerts.json";
import { Concert } from "@/types/concert";
import { useLocalStorage } from "@/lib/storage";
import { useRecordings } from "@/hooks/useRecordings";
import { useRecordingPlayer } from "@/hooks/useRecordingPlayer";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, ViewKey } from "@/components/AppSidebar";
import { ArchiveView } from "@/components/ArchiveView";
import { UpcomingView } from "@/components/UpcomingView";
import { WishlistView } from "@/components/WishlistView";
import { Stats } from "@/components/Stats";
import { AudioPlayer } from "@/components/AudioPlayer";

const seedConcerts: Concert[] = (rawData as { concerts: Concert[] }).concerts;

const Index = () => {
  const [extras, setExtras] = useLocalStorage<Concert[]>("wookbook:archive-extras", []);
  const [upcoming] = useLocalStorage<UpcomingItem[]>("wookbook:upcoming", []);
  const [wishlist] = useLocalStorage<{ id: string }[]>("wookbook:wishlist", []);
  const [view, setView] = useState<ViewKey>("archive");
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const all = useMemo(() => {
    const map = new Map<string, Concert>();
    seedConcerts.forEach((c) => map.set(c.id, c));
    extras.forEach((c) => map.set(c.id, c));
    return [...map.values()];
  }, [extras]);

  const globalStats = useMemo(() => ({
    shows: all.length,
    artists: new Set(all.map((c) => c.artist)).size,
    venues: new Set(all.map((c) => c.venue).filter(Boolean)).size,
    years: new Set(all.map((c) => c.date?.slice(0, 4)).filter(Boolean)).size,
  }), [all]);

  const { cache: recordingCache, hasRecording, fetchRecording } = useRecordings(all);
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
  const handleDismiss = () => { dismiss(); setCurrentConcert(null); setCurrentTracks([]); };

  const titleByView: Record<ViewKey, { eyebrow: string; title: string; sub: string }> = {
    archive: { eyebrow: "Volume I", title: "The Archive", sub: "Every show, catalogued and dated." },
    stats: { eyebrow: "Volume II", title: "By the Numbers", sub: "Patterns drawn from the ledger." },
    upcoming: { eyebrow: "Volume III", title: "On the Horizon", sub: "Tickets in hand, dates circled." },
    wishlist: { eyebrow: "Volume IV", title: "The Wishlist", sub: "Shows you'd cross a state line for." },
  };
  const head = titleByView[view];

  return (
    <SidebarProvider defaultOpen>
      <div className="grain flex min-h-screen w-full bg-background">
        <AppSidebar
          view={view}
          onView={(v) => { setView(v); if (v !== "archive") setSelectedArtist(null); }}
          concerts={all}
          selectedArtist={selectedArtist}
          onSelectArtist={(a) => { setSelectedArtist(a); setView("archive"); }}
          search={search}
          onSearch={setSearch}
          upcomingCount={upcoming.length}
          wishlistCount={wishlist.length}
        />

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b-2 border-ink bg-background/95 backdrop-blur">
            <div className="flex items-center gap-2 px-6 py-3">
              <SidebarTrigger className="border border-ink" />
              <div className="stamp">◆ WookBook — Personal Concert Ledger</div>
              <div className="ml-auto stamp">{all.length} stubs on file</div>
            </div>
          </header>

          {/* Global stats strip */}
          <div className="border-b-2 border-ink bg-card">
            <div className="mx-auto flex max-w-5xl divide-x-2 divide-ink px-6">
              {[
                { val: globalStats.shows, label: "Shows" },
                { val: globalStats.artists, label: "Artists" },
                { val: globalStats.venues, label: "Venues" },
                { val: globalStats.years, label: "Years" },
              ].map(({ val, label }) => (
                <div key={label} className="flex flex-col items-center px-6 py-3 first:pl-0 last:pr-0">
                  <span className="font-mono text-xl font-semibold leading-none">{val}</span>
                  <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <main className="flex-1 overflow-auto px-6 py-8">
            <div className="mx-auto max-w-5xl space-y-8">
              <div>
                <div className="stamp">{head.eyebrow}</div>
                <h1 className="mt-1 font-display text-5xl leading-none sm:text-6xl">
                  {head.title}
                </h1>
                <p className="mt-3 max-w-xl text-muted-foreground italic">{head.sub}</p>
                <div className="brass-rule mt-5" />
              </div>

              {view === "archive" && (
                <ArchiveView
                  concerts={all}
                  extras={extras}
                  onUpdateExtras={setExtras}
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
              {view === "stats" && <Stats concerts={all} />}
              {view === "upcoming" && <UpcomingView onAttend={(item) => {
                const concert: Concert = {
                  id:            item.id,
                  artist:        item.artist,
                  venue:         item.venue ?? "",
                  city:          item.city ?? "",
                  state:         item.state ?? "",
                  date:          item.date,
                  special_notes: item.notes,
                };
                setExtras([...extras, concert]);
              }} />}
              {view === "wishlist" && <WishlistView />}
            </div>
          </main>

          <footer className={`border-t-2 border-ink px-6 py-4 ${currentTrack ? "pb-20" : ""}`}>
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
    </SidebarProvider>
  );
};

export default Index;
