import { Track } from "@/types/recording";
import { Concert, formatConcertDate } from "@/types/concert";
import { Play, Pause, X } from "lucide-react";

type Props = {
  track: Track;
  concert: Concert | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onDismiss: () => void;
};

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const AudioPlayer = ({
  track,
  concert,
  isPlaying,
  progress,
  duration,
  onToggle,
  onSeek,
  onDismiss,
}: Props) => {
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-primary">
      <div
        className="h-0.5 bg-primary-foreground/60 transition-all"
        style={{ width: `${pct}%` }}
      />
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] uppercase tracking-wider text-primary-foreground">
            {track.title}
          </div>
          {concert && (
            <div className="truncate font-mono text-[10px] text-primary-foreground/70">
              {concert.artist}
              {concert.date ? ` · ${formatConcertDate(concert.date)}` : ""}
              {concert.venue ? ` · ${concert.venue}` : ""}
              {concert.city ? `, ${concert.city}` : ""}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[10px] text-primary-foreground/70 tabular-nums">
              {fmt(progress)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={progress}
              step={0.5}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-primary-foreground"
            />
            <span className="font-mono text-[10px] text-primary-foreground/70 tabular-nums">
              {fmt(duration)}
            </span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground"
          aria-label="Close player"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
