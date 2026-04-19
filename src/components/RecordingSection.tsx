import { RecordingEntry, Track } from "@/types/recording";
import { Play, Pause, Loader2 } from "lucide-react";

type Props = {
  entry: RecordingEntry | undefined;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  onToggle: (track: Track) => void;
};

export const RecordingSection = ({
  entry,
  currentTrack,
  isPlaying,
  onPlay,
  onToggle,
}: Props) => {
  if (!entry || entry.status === "idle") return null;

  if (entry.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Looking for a recording…</span>
      </div>
    );
  }

  if (entry.status === "error") {
    return (
      <div className="font-mono text-xs text-muted-foreground">
        No recording found — {entry.message}
      </div>
    );
  }

  // status === "found"
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        🎧 {entry.source}
      </div>
      <ul className="space-y-1">
        {entry.tracks.map((track, i) => {
          const active = currentTrack?.src === track.src;
          return (
            <li key={i}>
              <button
                onClick={() => (active ? onToggle(track) : onPlay(track))}
                className={`group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-primary/10 ${
                  active ? "bg-primary/10" : ""
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {active && isPlaying ? (
                    <Pause className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Play
                      className={`h-3.5 w-3.5 ${
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                  )}
                </span>
                <span
                  className={`flex-1 truncate font-mono text-[11px] ${
                    active ? "text-primary" : ""
                  }`}
                >
                  {track.title}
                </span>
                {track.duration && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {track.duration}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
