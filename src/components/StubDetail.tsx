import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Concert, formatConcertDate } from "@/types/concert";
import { RecordingEntry, Track } from "@/types/recording";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { Save, Trash2, Star } from "lucide-react";
import { RecordingSection } from "./RecordingSection";

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
            <dd>{draft.city}, {draft.state}</dd>
          </div>
          {draft.special_notes && (
            <div>
              <dt className="stamp">Notes</dt>
              <dd>{draft.special_notes}</dd>
            </div>
          )}
        </dl>

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

        <div className="flex items-center justify-end gap-2 pt-2">
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
      </DialogContent>
    </Dialog>
  );
};
