import { Concert, parseConcertDate } from "@/types/concert";
import { useMemo } from "react";

export const Stats = ({ concerts }: { concerts: Concert[] }) => {
  const stats = useMemo(() => {
    const artists = new Map<string, number>();
    const venues = new Map<string, number>();
    const cities = new Map<string, number>();
    const years = new Map<number, number>();
    for (const c of concerts) {
      artists.set(c.artist, (artists.get(c.artist) ?? 0) + 1);
      venues.set(c.venue, (venues.get(c.venue) ?? 0) + 1);
      cities.set(`${c.city}, ${c.state}`, (cities.get(`${c.city}, ${c.state}`) ?? 0) + 1);
      const y = parseConcertDate(c.date).year;
      if (!Number.isNaN(y)) years.set(y, (years.get(y) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n = 5) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    const yearEntries = [...years.entries()].sort((a, b) => a[0] - b[0]);
    const maxYear = Math.max(1, ...yearEntries.map(([, v]) => v));
    return {
      total: concerts.length,
      artists: artists.size,
      venues: venues.size,
      topArtists: top(artists),
      topVenues: top(venues),
      topCities: top(cities, 4),
      yearEntries,
      maxYear,
    };
  }, [concerts]);

  return (
    <section className="space-y-6">
      {/* Headline numbers */}
      <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-sm border-2 border-ink bg-card">
        {[
          { label: "Shows", value: stats.total },
          { label: "Artists", value: stats.artists },
          { label: "Venues", value: stats.venues },
        ].map((s, i) => (
          <div
            key={s.label}
            className={`p-5 ${i > 0 ? "border-l-2 border-ink" : ""}`}
          >
            <div className="stamp">{s.label}</div>
            <div className="mt-1 font-display text-4xl leading-none text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Year bar chart */}
      {stats.yearEntries.length > 0 && (
        <div className="rounded-sm border-2 border-ink bg-card p-5">
          <div className="stamp mb-4">Shows per year</div>
          <div className="flex items-end gap-2 h-32">
            {stats.yearEntries.map(([y, count]) => (
              <div key={y} className="flex flex-1 flex-col items-center gap-1 min-w-0">
                <div className="font-mono text-[10px] text-muted-foreground">{count}</div>
                <div
                  className="w-full bg-primary transition-all hover:bg-accent"
                  style={{ height: `${(count / stats.maxYear) * 100}%`, minHeight: "4px" }}
                  title={`${y}: ${count} shows`}
                />
                <div className="font-mono text-[10px] text-muted-foreground">{String(y).slice(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top artists & venues */}
      <div className="grid gap-4 md:grid-cols-2">
        <Leaderboard title="Most-seen artists" rows={stats.topArtists} />
        <Leaderboard title="Most-visited venues" rows={stats.topVenues} />
      </div>
    </section>
  );
};

const Leaderboard = ({ title, rows }: { title: string; rows: [string, number][] }) => (
  <div className="rounded-sm border-2 border-ink bg-card p-5">
    <div className="stamp mb-3">{title}</div>
    <ol className="space-y-2">
      {rows.map(([name, n], i) => (
        <li key={name} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5 last:border-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <span className="truncate font-display text-base">{name}</span>
          </div>
          <span className="font-mono text-sm text-primary">×{n}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-muted-foreground">No data yet.</li>}
    </ol>
  </div>
);
