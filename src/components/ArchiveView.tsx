// src/components/ArchiveView.tsx
import { useMemo, useState } from "react";
import { Concert, parseConcertDate } from "@/types/concert";
import { RecordingEntry, Track } from "@/types/recording";
import { StubCard } from "./StubCard";
import { StubDetail } from "./StubDetail";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Download, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  concerts: Concert[];
  onSaveConcert: (concert: Concert) => void;
  selectedArtist: string | null;
  onClearArtist: () => void;
  recordingCache: Map<string, RecordingEntry>;
  hasRecording: (id: string) => boolean;
  onFetchRecording: (concert: Concert) => void;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track, concert?: Concert) => void;
  onToggleTrack: (track: Track, concert?: Concert) => void;
};

export const ArchiveView = ({
  concerts,
  onSaveConcert,
  selectedArtist,
  onClearArtist,
  recordingCache,
  hasRecording,
  onFetchRecording,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onToggleTrack,
}: Props) => {
  const [q, setQ] = useState("");
  const [year, setYear] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "artist" | "venue">("newest");
  const [openId, setOpenId] = useState<string | null>(null);

  const years = useMemo(() => {
    const s = new Set<number>();
    concerts.forEach((c) => {
      const y = parseConcertDate(c.date).year;
      if (!Number.isNaN(y)) s.add(y);
    });
    return [...s].sort((a, b) => b - a);
  }, [concerts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = concerts.filter((c) => {
      if (selectedArtist && c.artist !== selectedArtist) return false;
      if (year !== "all" && parseConcertDate(c.date).year !== Number(year)) return false;
      if (!needle) return true;
      return (
        c.artist.toLowerCase().includes(needle) ||
        c.venue.toLowerCase().includes(needle) ||
        c.city.toLowerCase().includes(needle) ||
        (c.event ?? "").toLowerCase().includes(needle)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "artist") return a.artist.localeCompare(b.artist);
      if (sort === "venue")  return a.venue.localeCompare(b.venue);
      const ta = parseConcertDate(a.date).ts;
      const tb = parseConcertDate(b.date).ts;
      return sort === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }, [concerts, q, year, sort, selectedArtist]);

  const grouped = useMemo(() => {
    if (sort === "artist" || sort === "venue" || year !== "all") return null;
    const groups: { year: number; concerts: Concert[] }[] = [];
    for (const c of filtered) {
      const y = parseConcertDate(c.date).year;
      const last = groups[groups.length - 1];
      if (last && last.year === y) last.concerts.push(c);
      else groups.push({ year: y, concerts: [c] });
    }
    return groups;
  }, [filtered, sort, year]);

  const open = filtered.find((c) => c.id === openId) ?? null;

  const exportAll = () => {
    const blob = new Blob(
      [JSON.stringify({ concerts }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wookbook-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Archive exported");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search artist, venue, city…"
            className="pl-9 border-2 border-ink"
          />
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-36 border-2 border-ink"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-40 border-2 border-ink"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="artist">Artist A→Z</SelectItem>
            <SelectItem value="venue">Venue A→Z</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportAll} className="border-2 border-ink">
          <Download className="h-4 w-4" /> Export
        </Button>
        {/* Import removed in Session D — requires Supabase show creation (Phase 3) */}
      </div>

      {selectedArtist && (
        <div className="flex items-center justify-between rounded-sm border-2 border-ink bg-primary/10 p-3 font-mono text-xs uppercase tracking-widest">
          <span>Filtering by artist: <span className="text-primary">{selectedArtist}</span></span>
          <button onClick={onClearArtist} aria-label="Clear artist filter" className="text-ink/60 hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="stamp">
        {filtered.length} {filtered.length === 1 ? "stub" : "stubs"}
      </div>

      {grouped ? (
        <div className="space-y-10">
          {grouped.map(({ year: y, concerts: group }) => (
            <div key={y}>
              <div className="mb-4 flex items-center gap-3">
                <span className="font-display text-3xl leading-none text-primary">{y}</span>
                <div className="flex-1 border-t-2 border-ink" />
                <span className="stamp">{group.length} {group.length === 1 ? "show" : "shows"}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {group.map((c, i) => (
                  <StubCard
                    key={c.id}
                    concert={c}
                    index={i + 1}
                    hasRecording={hasRecording(c.id)}
                    onClick={() => setOpenId(c.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c, i) => (
            <StubCard
              key={c.id}
              concert={c}
              index={i + 1}
              hasRecording={hasRecording(c.id)}
              onClick={() => setOpenId(c.id)}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-ink p-10 text-center">
          <div className="font-display text-xl">Nothing on file.</div>
          <div className="mt-1 text-sm text-muted-foreground">Try a different search or year.</div>
        </div>
      )}

      <StubDetail
        concert={open}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onSave={onSaveConcert}
        onDelete={undefined}
        canDelete={false}
        recordingEntry={open ? recordingCache.get(open.id) : undefined}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onFetchRecording={onFetchRecording}
        onPlayTrack={onPlayTrack}
        onToggleTrack={onToggleTrack}
      />
    </div>
  );
};
