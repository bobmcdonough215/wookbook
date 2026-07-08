import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useWatchedArtists, WatchedArtist } from "@/hooks/useWatchedArtists";
import { queryKeys } from "@/lib/queryKeys";
import { Concert } from "@/types/concert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ThumbsUp, ThumbsDown, EyeOff, Volume2, VolumeX, RefreshCw, ExternalLink, Trash2, Plus,
} from "lucide-react";

type TourEvent = {
  id:             string;
  artist_name:    string;
  date:           string;
  venue_name:     string | null;
  venue_city:     string | null;
  venue_state:    string | null;
  drive_hours:    number | null;   // ORS-accurate, only for watched matches
  dist_miles:     number | null;   // straight-line, for non-watched shows
  is_home_market: boolean;
  is_festival:    boolean;
  is_watched:     boolean;
  ticket_url:     string | null;
};

const fmtDate = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

type Props = { concerts: Concert[] };

export const DiscoverView = ({ concerts }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addUpcoming } = useUpcoming();
  const { artists: watchedArtists, loading: watchedLoading, atLimit, slotsRemaining, syncFromArchive, addArtist, toggleMute, removeArtist } = useWatchedArtists();
  const [tab, setTab] = useState<"shows" | "watched">("shows");
  const [filterType, setFilterType] = useState<"all" | "concerts" | "festivals">("all");
  const [filterArtists, setFilterArtists] = useState<"all" | "watching" | "new">("all");

  // Auto-populate watched artists from archive on first Discover visit
  useEffect(() => {
    if (watchedLoading || watchedArtists.length > 0) return;

    const counts = new Map<string, number>();
    for (const c of concerts) {
      if (c.artist && c.artist !== "Various Artists") {
        counts.set(c.artist, (counts.get(c.artist) ?? 0) + 1);
      }
    }
    if (!counts.size) return;

    const artists = [...counts.entries()].map(([name, count]) => ({ name, count }));
    syncFromArchive.mutate(artists, {
      onSuccess: (result) => {
        const added = result?.added ?? artists.length;
        const msg = added < artists.length
          ? `Watching top ${added} artists from your archive (50-artist limit).`
          : `Watching ${added} artists from your archive.`;
        toast.success(msg);
      },
    });
  }, [watchedLoading, watchedArtists.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tour events — per-user matches via RPC, fresh for 30 min
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: queryKeys.tourEvents(),
    queryFn: async (): Promise<TourEvent[]> => {
      const { data, error } = await supabase.rpc("get_user_tour_events");
      if (error) throw error;
      return (data ?? []) as TourEvent[];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Interest log — map of tour_event_id → decision
  const { data: decisions } = useQuery({
    queryKey: queryKeys.interestLog(user?.id),
    queryFn: async (): Promise<Map<string, string>> => {
      if (!user) return new Map();
      const { data } = await supabase
        .from("interest_log")
        .select("tour_event_id, decision")
        .eq("user_id", user.id);
      return new Map((data ?? []).map((d) => [d.tour_event_id, d.decision]));
    },
    enabled: !!user,
  });

  const decide = useMutation({
    mutationFn: async ({ tourEventId, decision }: {
      tourEventId: string;
      decision: "interested" | "pass" | "ignore";
    }) => {
      if (!user) throw new Error("Must be signed in");
      const { error } = await supabase
        .from("interest_log")
        .upsert(
          { user_id: user.id, tour_event_id: tourEventId, decision },
          { onConflict: "user_id,tour_event_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.interestLog(user?.id) });
    },
  });

  const handleInterested = async (event: TourEvent) => {
    try {
      await decide.mutateAsync({ tourEventId: event.id, decision: "interested" });
      await addUpcoming.mutateAsync({
        artist:    event.artist_name,
        date:      event.date,
        venue:     event.venue_name ?? undefined,
        city:      event.venue_city ?? undefined,
        state:     event.venue_state ?? undefined,
        ticketUrl: event.ticket_url ?? undefined,
      });
      toast.success(`${event.artist_name} added to Upcoming.`);
    } catch {
      toast.error("Couldn't save interest.");
    }
  };

  const handlePass   = (id: string) => decide.mutate({ tourEventId: id, decision: "pass" });
  const handleIgnore = (id: string) => decide.mutate({ tourEventId: id, decision: "ignore" });

  // Visible = not yet passed or ignored, then apply UI filters
  const visible = (events ?? []).filter((e) => {
    if (["pass", "ignore"].includes(decisions?.get(e.id) ?? "")) return false;
    if (filterType === "concerts" && e.is_festival) return false;
    if (filterType === "festivals" && !e.is_festival) return false;
    if (filterArtists === "watching" && !e.is_watched) return false;
    if (filterArtists === "new" && e.is_watched) return false;
    return true;
  });
  const sorted = [...visible].sort((a, b) => {
    if (a.is_home_market !== b.is_home_market) return a.is_home_market ? -1 : 1;
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    if (a.is_watched !== b.is_watched) return a.is_watched ? -1 : 1;
    const aDist = a.drive_hours ?? (a.dist_miles ? a.dist_miles / 55 : 999);
    const bDist = b.drive_hours ?? (b.dist_miles ? b.dist_miles / 55 : 999);
    return aDist - bDist;
  });

  const interestedEvents = (events ?? []).filter((e) => decisions?.get(e.id) === "interested");
  const passedCount      = (events ?? []).filter((e) => decisions?.get(e.id) === "pass").length;

  const activeTab = "px-5 py-2 stamp text-sm bg-primary text-primary-foreground";
  const inactiveTab = "px-5 py-2 stamp text-sm hover:bg-muted transition-colors";

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="inline-flex border-2 border-ink">
        <button onClick={() => setTab("shows")} className={`${tab === "shows" ? activeTab : inactiveTab}`}>
          Tour Dates
          {sorted.length > 0 && (
            <span className="ml-2 font-mono text-[10px] opacity-70">{sorted.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("watched")}
          className={`${tab === "watched" ? activeTab : inactiveTab} border-l-2 border-ink`}
        >
          Watched Artists
          {watchedArtists.length > 0 && (
            <span className="ml-2 font-mono text-[10px] opacity-70">{watchedArtists.length}</span>
          )}
        </button>
      </div>

      {tab === "shows" && (
        <div className="space-y-4">
          {/* Filter row */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Type</span>
              <div className="inline-flex border border-ink">
                {(["all", "concerts", "festivals"] as const).map((v, i) => (
                  <button
                    key={v}
                    onClick={() => setFilterType(v)}
                    className={`px-3 py-1 font-mono text-xs transition-colors ${
                      filterType === v
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    } ${i > 0 ? "border-l border-ink" : ""}`}
                  >
                    {v === "all" ? "All" : v === "concerts" ? "Concerts" : "Festivals"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Artists</span>
              <div className="inline-flex border border-ink">
                {(["all", "watching", "new"] as const).map((v, i) => (
                  <button
                    key={v}
                    onClick={() => setFilterArtists(v)}
                    className={`px-3 py-1 font-mono text-xs transition-colors ${
                      filterArtists === v
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    } ${i > 0 ? "border-l border-ink" : ""}`}
                  >
                    {v === "all" ? "All" : v === "watching" ? "Watching" : "Discover"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {eventsLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-sm border-2 border-ink bg-card opacity-50" />
              ))}
            </div>
          )}

          {!eventsLoading && sorted.length === 0 && (
            <div className="rounded-sm border-2 border-dashed border-ink p-10 text-center">
              <div className="font-display text-xl">
                {filterType !== "all" || filterArtists !== "all" ? "No matches for this filter." : "Nothing within range."}
              </div>
              <div className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                {filterType !== "all" || filterArtists !== "all" ? (
                  <button
                    onClick={() => { setFilterType("all"); setFilterArtists("all"); }}
                    className="underline hover:text-foreground transition-colors"
                  >
                    Clear filters
                  </button>
                ) : (
                  <>
                    No genre-filtered shows found within 150 miles of your home city.
                    The daily cron picks up new dates each morning.
                  </>
                )}
                {passedCount > 0 && (
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {passedCount} show{passedCount > 1 ? "s" : ""} marked as pass.
                  </span>
                )}
              </div>
            </div>
          )}

          {sorted.map((event) => (
            <TourEventCard
              key={event.id}
              event={event}
              decision={decisions?.get(event.id)}
              onInterested={() => handleInterested(event)}
              onPass={() => handlePass(event.id)}
              onIgnore={() => handleIgnore(event.id)}
              isPending={decide.isPending}
            />
          ))}

          {interestedEvents.length > 0 && (
            <div className="mt-8">
              <div className="stamp mb-3 text-muted-foreground">
                Already interested ({interestedEvents.length}) — added to Upcoming
              </div>
              <div className="space-y-2 opacity-60">
                {interestedEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-sm border border-ink bg-card px-4 py-2"
                  >
                    <span className="font-display text-sm">{e.artist_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 text-center">
            <a
              href="https://www.jambase.com"
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Powered by JamBase
            </a>
          </div>
        </div>
      )}

      {tab === "watched" && (
        <WatchedArtistsPanel
          artists={watchedArtists}
          loading={watchedLoading}
          atLimit={atLimit}
          slotsRemaining={slotsRemaining}
          concerts={concerts}
          syncFromArchive={syncFromArchive}
          addArtist={addArtist}
          toggleMute={toggleMute}
          removeArtist={removeArtist}
        />
      )}
    </div>
  );
};

// ── Tour event card ────────────────────────────────────────────────────────────

type TourEventCardProps = {
  event:        TourEvent;
  decision:     string | undefined;
  onInterested: () => void;
  onPass:       () => void;
  onIgnore:     () => void;
  isPending:    boolean;
};

const TourEventCard = ({ event, decision, onInterested, onPass, onIgnore, isPending }: TourEventCardProps) => {
  const location = [event.venue_name, event.venue_city, event.venue_state]
    .filter(Boolean)
    .join(", ");

  const stripColor = event.is_home_market
    ? "bg-accent"
    : event.is_watched
    ? "bg-brass"
    : "bg-muted";

  const distDisplay = event.is_home_market
    ? null
    : event.drive_hours != null
    ? `${event.drive_hours}h drive`
    : event.dist_miles != null
    ? `~${event.dist_miles}mi`
    : null;

  return (
    <div className="rounded-sm border-2 border-ink bg-card overflow-hidden">
      <div className="flex items-stretch">
        {/* Left accent strip: oxblood = home, brass = watching, muted = discovery */}
        <div className={`w-2 flex-shrink-0 ${stripColor}`} />

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display text-xl leading-tight">{event.artist_name}</div>
              <div className="mt-0.5 font-mono text-sm text-muted-foreground">{fmtDate(event.date)}</div>
              {location && (
                <div className="mt-1 font-mono text-xs text-muted-foreground truncate">{location}</div>
              )}
            </div>

            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {event.is_home_market && (
                <span className="rounded-sm bg-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent-foreground">
                  Home
                </span>
              )}
              {!event.is_home_market && event.is_watched && (
                <span className="rounded-sm border border-brass px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-foreground">
                  Watching
                </span>
              )}
              {event.is_festival && (
                <span className="rounded-sm border border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Festival
                </span>
              )}
              {distDisplay && (
                <span className="font-mono text-xs text-muted-foreground">{distDisplay}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={decision === "interested" ? "default" : "outline"}
              onClick={onInterested}
              disabled={isPending}
              className="gap-1.5"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {decision === "interested" ? "Going" : "Interested"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onPass}
              disabled={isPending}
              title="Pass"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onIgnore}
              disabled={isPending}
              title="Ignore"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
            {event.ticket_url && (
              <a
                href={event.ticket_url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="ml-auto flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Tickets <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Watched artists panel ──────────────────────────────────────────────────────

type WatchedArtistsPanelProps = {
  artists:         WatchedArtist[];
  loading:         boolean;
  atLimit:         boolean;
  slotsRemaining:  number;
  concerts:        Concert[];
  syncFromArchive: ReturnType<typeof useWatchedArtists>["syncFromArchive"];
  addArtist:       ReturnType<typeof useWatchedArtists>["addArtist"];
  toggleMute:      ReturnType<typeof useWatchedArtists>["toggleMute"];
  removeArtist:    ReturnType<typeof useWatchedArtists>["removeArtist"];
};

const WatchedArtistsPanel = ({
  artists, loading, atLimit, slotsRemaining, concerts, syncFromArchive, addArtist, toggleMute, removeArtist,
}: WatchedArtistsPanelProps) => {
  const [input, setInput] = useState("");

  const handleAdd = async () => {
    const name = input.trim();
    if (!name) return;
    try {
      await addArtist.mutateAsync(name);
      setInput("");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add artist.");
    }
  };
  const handleSync = () => {
    const counts = new Map<string, number>();
    for (const c of concerts) {
      if (c.artist && c.artist !== "Various Artists") {
        counts.set(c.artist, (counts.get(c.artist) ?? 0) + 1);
      }
    }
    const archiveArtists = [...counts.entries()].map(([name, count]) => ({ name, count }));
    if (!archiveArtists.length) return;
    syncFromArchive.mutate(archiveArtists, {
      onSuccess: (result) => {
        if (result?.added === 0) {
          toast.success("Watch list up to date.");
        } else if (slotsRemaining === 0) {
          toast.success("Watch list is full — updated existing artists.");
        } else {
          toast.success(`Added ${result?.added} artist${result?.added !== 1 ? "s" : ""} from your archive.`);
        }
      },
      onError: () => toast.error("Sync failed."),
    });
  };

  const active = artists.filter((a) => !a.muted);
  const muted  = artists.filter((a) => a.muted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="stamp">
            {artists.length} / 50 artists
          </div>
          {muted.length > 0 && (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              {muted.length} muted
            </div>
          )}
          {atLimit && (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              limit reached — remove one to add another
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSync}
          disabled={syncFromArchive.isPending}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncFromArchive.isPending ? "animate-spin" : ""}`} />
          Sync from archive
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !atLimit && handleAdd()}
          placeholder={atLimit ? "50-artist limit reached" : "Add an artist to watch…"}
          disabled={atLimit}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!input.trim() || addArtist.isPending || atLimit}
          className="gap-1.5 flex-shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-sm border border-ink bg-card opacity-50" />
          ))}
        </div>
      )}

      {!loading && artists.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-ink p-8 text-center">
          <div className="font-display text-lg">No artists being watched.</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Click "Sync from archive" to add all your artists at once.
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-1">
          {active.map((a) => (
            <ArtistRow
              key={a.id}
              artist={a}
              onToggleMute={() => toggleMute.mutate({ id: a.id, muted: true })}
              onRemove={() => removeArtist.mutate(a.id)}
            />
          ))}
        </div>
      )}

      {muted.length > 0 && (
        <div>
          <div className="stamp mb-2 text-muted-foreground">Muted</div>
          <div className="space-y-1 opacity-50">
            {muted.map((a) => (
              <ArtistRow
                key={a.id}
                artist={a}
                onToggleMute={() => toggleMute.mutate({ id: a.id, muted: false })}
                onRemove={() => removeArtist.mutate(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

type ArtistRowProps = {
  artist:        WatchedArtist;
  onToggleMute:  () => void;
  onRemove:      () => void;
};

const ArtistRow = ({ artist, onToggleMute, onRemove }: ArtistRowProps) => (
  <div className="flex items-center justify-between rounded-sm border border-ink bg-card px-4 py-2.5">
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-display text-sm truncate">{artist.artistName}</span>
      {artist.showCount > 0 && (
        <span className="font-mono text-[10px] text-muted-foreground">×{artist.showCount}</span>
      )}
    </div>
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={onToggleMute}
        title={artist.muted ? "Unmute" : "Mute"}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      >
        {artist.muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={onRemove}
        title="Remove"
        className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);
