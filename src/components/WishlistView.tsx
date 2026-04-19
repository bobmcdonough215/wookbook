import { useState } from "react";
import { useLocalStorage, uid } from "@/lib/storage";
import { UpcomingItem, WishlistItem } from "@/types/concert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const WishlistView = () => {
  const [items, setItems] = useLocalStorage<WishlistItem[]>("wookbook:wishlist", []);
  const [, setUpcoming] = useLocalStorage<UpcomingItem[]>("wookbook:upcoming", []);
  const [draft, setDraft] = useState({ artist: "", venue: "", notes: "" });

  const add = () => {
    if (!draft.artist) return;
    setItems([{ id: uid(), addedAt: new Date().toISOString(), ...draft }, ...items]);
    setDraft({ artist: "", venue: "", notes: "" });
  };
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const promote = (it: WishlistItem) => {
    setUpcoming((prev) => [
      ...prev,
      {
        id: uid(),
        addedAt: new Date().toISOString(),
        artist: it.artist,
        venue: it.venue ?? "TBA",
        city: "",
        state: "",
        date: new Date().toISOString().slice(0, 10),
        special_notes: it.notes,
      },
    ]);
    remove(it.id);
    toast.success(`${it.artist} moved to Upcoming`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-sm border-2 border-ink bg-card p-5">
        <div className="stamp">Add new</div>
        <h2 className="mb-4 font-display text-2xl">A dream show</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Artist *" value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} />
          <Input placeholder="Dream venue" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
          <Input placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <Button className="mt-3" onClick={add} disabled={!draft.artist}>
          <Heart className="h-4 w-4" /> Add to wishlist
        </Button>
      </section>

      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start justify-between gap-3 rounded-sm border-2 border-ink bg-card p-4 shadow-[3px_3px_0_hsl(var(--ink))]"
          >
            <div className="min-w-0">
              <div className="font-display text-xl">{it.artist}</div>
              {it.venue && <div className="text-sm text-muted-foreground">@ {it.venue}</div>}
              {it.notes && <div className="mt-1 stamp">{it.notes}</div>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => promote(it)} title="Move to upcoming">
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(it.id)} aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <div className="rounded-sm border-2 border-dashed border-ink p-10 text-center">
          <div className="font-display text-xl">Your wishlist is empty.</div>
          <div className="mt-1 text-sm text-muted-foreground">Dream big.</div>
        </div>
      )}
    </div>
  );
};
