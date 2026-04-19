import { Concert, parseConcertDate } from "@/types/concert";
import { MapPin } from "lucide-react";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

type Props = {
  concert: Concert;
  hasRecording?: boolean;
  action?: React.ReactNode;
  onClick?: () => void;
  index?: number;
};

export const StubCard = ({ concert, hasRecording, action, onClick }: Props) => {
  const Tag = onClick ? "button" : "article";
  const { year, month, day } = parseConcertDate(concert.date);

  return (
    <Tag
      onClick={onClick}
      className={`group relative flex w-full overflow-hidden rounded-sm border-2 border-ink bg-card text-left shadow-[3px_3px_0_hsl(var(--ink))] transition-all hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_hsl(var(--primary))] ${onClick ? "cursor-pointer" : ""}`}
      style={{ borderColor: "hsl(var(--ink))" }}
    >
      {/* Left counterfoil */}
      <div className="relative flex w-20 shrink-0 flex-col items-center justify-center bg-primary px-2 py-3 text-primary-foreground">
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] opacity-80">
          Adm.
        </div>
        {month && (
          <div className="font-mono text-[11px] uppercase tracking-widest opacity-90 mt-1">
            {MONTHS[month - 1]}
          </div>
        )}
        {day ? (
          <div className="font-display text-3xl leading-none">
            {String(day).padStart(2, "0")}
          </div>
        ) : (
          <div className="font-display text-2xl leading-none">{year}</div>
        )}
        <div className="font-mono text-[9px] opacity-70 mt-0.5">
          {day ? year : ""}
        </div>
      </div>

      {/* Perforation */}
      <div className="stub-divider-v my-3" />

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl leading-tight text-foreground">
            {concert.artist}
            {hasRecording && (
              <span className="ml-1.5 text-base" title="Recording available">🎧</span>
            )}
          </h3>
          {concert.event && (
            <p className="truncate text-sm italic text-muted-foreground">{concert.event}</p>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {concert.venue} · {concert.city}, {concert.state}
          </span>
        </div>

        {concert.special_notes && (
          <p className="mt-1 stamp">★ {concert.special_notes}</p>
        )}

        {concert.rating && (
          <div className="font-mono text-xs text-accent">
            {"★".repeat(concert.rating)}{"☆".repeat(5 - concert.rating)}
          </div>
        )}

        {action && <div className="mt-2" onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
    </Tag>
  );
};
