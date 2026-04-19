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

export const UpcomingView = ({ onAttend }: Props) => {
  const [items, setItems] = useLocalStorage<UpcomingItem[]>("wookbook:upcoming", []);
  const [draft, setDraft] = useState({
    artist: "", venue: "", city: "", state: "", date: "", event: "", special_notes: "",
  });

  const add = () => {
    if (!draft.artist || !draft.date) return;
    setItems([
      ...items,
      { id: uid(), addedAt: new Date().toISOString(), ...draft },
    ]);
    setDraft({ artist: "", venue: "", city: "", state: "", date: "", event: "", special_notes: "" });
  };

  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const attend = (item: UpcomingItem) => {
    onAttend(item);
    remove(item.id);
  };

  const sorted = [...items].sort((a, b) => parseConcertDate(a.date).ts - parseConcertDate(b.date).ts);

  return (
    <div className="space-y-6">
      <section className="rounded-sm border-2 border-ink bg-card p-5">
        <div className="stamp">Add new</div>
        <h2 className="mb-4 font-display text-2xl">An upcoming show</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Input placeholder="Artist *" value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} />
          <Input placeholder="Event (optional)" value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value })} />
          <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <Input placeholder="Venue" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
          <Input placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          <Input placeholder="State" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
          <Input className="md:col-span-2" placeholder="Notes" value={draft.special_notes} onChange={(e) => setDraft({ ...draft, special_notes: e.target.value })} />
          <Button onClick={add} disabled={!draft.artist || !draft.date}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((item, i) => (
          <StubCard
            key={item.id}
            concert={item}
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
          <div className="mt-1 text-sm text-muted-foreground">Add a show above to start your countdown.</div>
        </div>
      )}
    </div>
  );
};
