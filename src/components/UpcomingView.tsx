import { useState } from "react";
import { useLocalStorage, uid } from "@/lib/storage";
import { UpcomingItem, parseConcertDate } from "@/types/concert";
import { StubCard } from "./StubCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check } from "lucide-react";

type Props = {
  onAttend: (item: UpcomingItem) => void;
};

type UpcomingDraft = {
  artist:    string;
  venue:     string;
  city:      string;
  state:     string;
  date:      string;
  ticketUrl: string;
  notes:     string;
};

const EMPTY_DRAFT: UpcomingDraft = {
  artist:    "",
  venue:     "",
  city:      "",
  state:     "",
  date:      "",
  ticketUrl: "",
  notes:     "",
};

export const UpcomingView = ({ onAttend }: Props) => {
  const [items, setItems] = useLocalStorage<UpcomingItem[]>(
    "wookbook:upcoming",
    []
  );
  const [draft, setDraft] = useState<UpcomingDraft>(EMPTY_DRAFT);

  const set = (field: keyof UpcomingDraft) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((prev) => ({ ...prev, [field]: e.target.value }));

  const add = () => {
    if (!draft.artist.trim() || !draft.date) return;
    setItems([
      ...items,
      {
        id:        uid(),
        addedAt:   new Date().toISOString(),
        artist:    draft.artist.trim(),
        date:      draft.date,
        venue:     draft.venue.trim() || undefined,
        city:      draft.city.trim() || undefined,
        state:     draft.state.trim() || undefined,
        ticketUrl: draft.ticketUrl.trim() || undefined,
        notes:     draft.notes.trim() || undefined,
      },
    ]);
    setDraft(EMPTY_DRAFT);
  };

  const remove = (id: string) =>
    setItems(items.filter((i) => i.id !== id));

  const attend = (item: UpcomingItem) => {
    onAttend(item);
    remove(item.id);
  };

  const sorted = [...items].sort(
    (a, b) => parseConcertDate(a.date).ts - parseConcertDate(b.date).ts
  );

  // StubCard expects a Concert-shaped object. Map only the fields it uses.
  const toStubConcert = (item: UpcomingItem) => ({
    id:            item.id,
    artist:        item.artist,
    venue:         item.venue ?? "",
    city:          item.city ?? "",
    state:         item.state ?? "",
    date:          item.date,
    special_notes: item.notes,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-sm border-2 border-ink bg-card p-5">
        <div className="stamp">Add new</div>
        <h2 className="mb-4 font-display text-2xl">An upcoming show</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Input placeholder="Artist *"   value={draft.artist}    onChange={set("artist")} />
          <Input type="date"              value={draft.date}       onChange={set("date")} />
          <Input placeholder="Venue"      value={draft.venue}      onChange={set("venue")} />
          <Input placeholder="City"       value={draft.city}       onChange={set("city")} />
          <Input placeholder="State"      value={draft.state}      onChange={set("state")} />
          <Input placeholder="Ticket URL" value={draft.ticketUrl}  onChange={set("ticketUrl")} />
          <Input
            className="md:col-span-2"
            placeholder="Notes"
            value={draft.notes}
            onChange={set("notes")}
          />
          <Button onClick={add} disabled={!draft.artist.trim() || !draft.date}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((item, i) => (
          <StubCard
            key={item.id}
            concert={toStubConcert(item)}
            index={i + 1}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={() => attend(item)}>
                  <Check className="h-4 w-4" /> Mark attended
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            }
          />
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-ink p-10 text-center">
          <div className="font-display text-xl">Nothing on the horizon.</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Add a show above to start your countdown.
          </div>
        </div>
      )}
    </div>
  );
};
