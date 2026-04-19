import { useState } from "react";
import { Track } from "@/types/recording";
import { Concert, formatConcertDate } from "@/types/concert";
import { Play, Pause, X, SkipBack, SkipForward, ListMusic } from "lucide-react";

type Props = {
  track: Track;
  tracks: Track[];
  concert: Concert | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onToggle: () => void;
  onPlayTrack: (track: Track) => void;
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
  tracks,
  concert,
  isPlaying,
  progress,
  duration,
  onToggle,
  onPlayTrack,
  onSeek,
  onDismiss,
}: Props) => {
  const [showTracklist, setShowTracklist] = useState(false);
  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const currentIndex = tracks.findIndex((t) => t.src === track.src);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < tracks.length - 1;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Tracklist panel — right-anchored, ~30% width */}
      {showTracklist && (
        <div className="absolute bottom-full right-0 w-[30%] min-w-[280px] border-2 border-b-0 border-ink bg-card shadow-[-4px_-4px_0_hsl(var(--ink))]">
          <div className="flex items-center justify-between border-b border-ink/20 px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate pr-2">
              {concert ? `${concert.artist} · ${formatConcertDate(concert.date)}` : "Tracklist"}
            </span>
            <button onClick={() => setShowTracklist(false)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Close tracklist">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {tracks.map((t, i) => {
              const active = t.src === track.src;
              return (
                <li key={i}>
                  <button
                    onClick={() => onPlayTrack(t)}
                    className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-primary/10 ${active ? "bg-primary/10" : ""}`}
                  >
                    <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums text-right">
                      {active && isPlaying ? <Pause className="h-3 w-3 text-primary ml-auto" /> : String(i + 1)}
                    </span>
                    <span className={`flex-1 truncate font-mono text-[11px] ${active ? "text-primary font-medium" : ""}`}>
                      {t.title}
                    </span>
                    {t.duration && (
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {t.duration}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 bg-primary/30">
        <div className="h-full bg-primary-foreground/80 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Player bar */}
      <div className="bg-primary">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          {/* Prev */}
          <button
            onClick={() => hasPrev && onPlayTrack(tracks[currentIndex - 1])}
            disabled={!hasPrev}
            className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous track"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          {/* Play/Pause */}
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

          {/* Next */}
          <button
            onClick={() => hasNext && onPlayTrack(tracks[currentIndex + 1])}
            disabled={!hasNext}
            className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next track"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          {/* Track info */}
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

          {/* Tracklist toggle */}
          {tracks.length > 1 && (
            <button
              onClick={() => setShowTracklist((v) => !v)}
              className={`shrink-0 transition-colors ${showTracklist ? "text-primary-foreground" : "text-primary-foreground/70 hover:text-primary-foreground"}`}
              aria-label="Toggle tracklist"
            >
              <ListMusic className="h-4 w-4" />
            </button>
          )}

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="shrink-0 text-primary-foreground/70 hover:text-primary-foreground"
            aria-label="Close player"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
