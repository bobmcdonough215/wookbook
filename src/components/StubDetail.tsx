import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Concert, formatConcertDate } from "@/types/concert";
import { RecordingEntry, Track } from "@/types/recording";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { Save, Trash2, Star, Loader2, Pause, Play, X } from "lucide-react";
import { RecordingSection } from "./RecordingSection";
import { useSetlist } from "@/hooks/useSetlist";

type Props = {
  concert: Concert | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (c: Concert) => void;
  onDelete?: (id: string) => void;
  canDelete: boolean;
  recordingEntry: RecordingEntry | undefined;
  currentTrack: Track | null;
  isPlaying: boolean;
  onFetchRecording: (concert: Concert) => void;
  onPlayTrack: (track: Track, concert?: Concert) => void;
  onToggleTrack: (track: Track, concert?: Concert) => void;
};

export const StubDetail = ({
  concert,
  open,
  onOpenChange,
  onSave,
  onDelete,
  canDelete,
  recordingEntry,
  currentTrack,
  isPlaying,
  onFetchRecording,
  onPlayTrack,
  onToggleTrack,
}: Props) => {
  const [draft, setDraft] = useState<Concert | null>(concert);
  const { data: setlist, isLoading: setlistLoading } = useSetlist(
    concert?.artist,
    concert?.date
  );

  useEffect(() => setDraft(concert), [concert]);

  useEffect(() => {
    if (open && concert) onFetchRecording(concert);
  }, [open, concert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-2 border-ink bg-card">
        <DialogHeader>
          <div className="stamp mb-1">Stub № {draft.id.slice(-6).toUpperCase()}</div>
          <DialogTitle className="font-display text-3xl leading-tight">
            {draft.artist}
          </DialogTitle>
          {draft.event && (
            <p className="italic text-muted-foreground">{draft.event}</p>
          )}
        </DialogHeader>

        <div className="ink-rule" />

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="stamp">Date</dt>
            <dd className="font-display text-lg">{formatConcertDate(draft.date)}</dd>
          </div>
          <div>
            <dt className="stamp">Venue</dt>
            <dd className="font-display text-lg">{draft.venue}</dd>
          </div>
          <div>
            <dt className="stamp">Location</dt>
            <dd>{[draft.city, draft.state].filter(Boolean).join(", ")}</dd>
          </div>
          {draft.special_notes && (
            <div>
              <dt className="stamp">With</dt>
              <dd>{draft.special_notes}</dd>
            </div>
          )}
        </dl>

        <div className="ink-rule" />

        {/* Setlist */}
        {setlistLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-mono text-xs">Looking up setlist…</span>
          </div>
        )}

        {!setlistLoading && setlist && setlist.sets.length > 0 && (
          <div className="space-y-4">
            <div className="stamp">Setlist</div>
            {setlist.sets.map((set) => (
              <div key={set.label}>
                <div className="stamp mb-1.5 text-muted-foreground">{set.label}</div>
                <ol className="space-y-0.5">
                  {set.songs.map((song, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <span className="font-mono text-xs">{song}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {/* Attribution — required by Setlist.fm ToS, no nofollow */}
            {setlist.url && (
              <a
                href={setlist.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Setlist via setlist.fm ↗
              </a>
            )}
          </div>
        )}

        {!setlistLoading && setlist === null && (
          <p className="font-mono text-[10px] text-muted-foreground">No setlist on file.</p>
        )}

        <div className="ink-rule" />

        {/* Recording */}
        <RecordingSection
          entry={recordingEntry}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlay={(track) => onPlayTrack(track, draft ?? undefined)}
          onToggle={(track) => onToggleTrack(track, draft ?? undefined)}
        />

        {recordingEntry && recordingEntry.status !== "idle" && (
          <div className="ink-rule" />
        )}

        {/* Personal notes */}
        <div className="space-y-3">
          <div>
            <Label className="stamp">Rating</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft({ ...draft, rating: n === draft.rating ? undefined : n })}
                  className="transition-transform hover:scale-110"
                  aria-label={`Rate ${n}`}
                >
                  <Star
                    className={`h-6 w-6 ${(draft.rating ?? 0) >= n ? "fill-accent text-accent" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="memory" className="stamp">Memory</Label>
            <Textarea
              id="memory"
              value={draft.memory ?? ""}
              onChange={(e) => setDraft({ ...draft, memory: e.target.value })}
              placeholder="What do you remember about this show?"
              rows={4}
              className="mt-1"
            />
          </div>
        </div>

        {/* Now Playing — sticky control so user can pause without closing */}
        {currentTrack && (
          <div className="sticky bottom-0 -mx-6 -mb-6 border-t-2 border-ink bg-primary px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggleTrack(currentTrack, draft ?? undefined)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying
                  ? <Pause className="h-4 w-4 fill-current" />
                  : <Play className="h-4 w-4 fill-current" />}
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-wider text-primary-foreground">
                {currentTrack.title}
              </span>
              <button
                onClick={() => onOpenChange(false)}
                className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer — save/delete + big close tap target on mobile */}
        {!currentTrack && (
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => onOpenChange(false)}
              className="order-last w-full rounded-sm border-2 border-ink py-3 font-mono text-xs uppercase tracking-widest sm:hidden"
            >
              Close
            </button>
            <div className="flex items-center justify-end gap-2">
              {onDelete && canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDelete(draft.id);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  onSave(draft);
                  onOpenChange(false);
                }}
              >
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
