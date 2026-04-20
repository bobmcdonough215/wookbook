// src/components/WishlistView.tsx
import { useState } from "react";
import { toast } from "sonner";
import { useWishlist } from "@/hooks/useWishlist";
import { useUpcoming } from "@/hooks/useUpcoming";
import { WishlistItem } from "@/types/concert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Heart, Trash2, ArrowRight } from "lucide-react";

const PRIORITY_LABELS: Record<WishlistItem["priority"], string> = {
  high:   "🔥 High priority",
  medium: "Medium priority",
  low:    "Low priority",
};

export const WishlistView = () => {
  const { items, addWishlist, removeWishlist } = useWishlist();
  const { addUpcoming } = useUpcoming();
  const [draft, setDraft] = useState<{
    artist:   string;
    priority: WishlistItem["priority"];
    notes:    string;
  }>({ artist: "", priority: "medium", notes: "" });

  const add = async () => {
    if (!draft.artist.trim()) return;
    try {
      await addWishlist.mutateAsync({
        artist:   draft.artist.trim(),
        priority: draft.priority,
        notes:    draft.notes.trim() || undefined,
      });
      setDraft({ artist: "", priority: "medium", notes: "" });
    } catch {
      toast.error("Couldn't add to wishlist.");
    }
  };

  const remove = (id: string) => {
    removeWishlist.mutate(id, {
      onError: () => toast.error("Couldn't remove from wishlist."),
    });
  };

  const promote = async (it: WishlistItem) => {
    try {
      await addUpcoming.mutateAsync({
        artist: it.artist,
        date:   new Date().toISOString().slice(0, 10),
        notes:  it.notes,
      });
      remove(it.id);
      toast.success(`${it.artist} moved to Upcoming`);
    } catch {
      toast.error("Couldn't move to upcoming.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-sm border-2 border-ink bg-card p-5">
        <div className="stamp">Add new</div>
        <h2 className="mb-4 font-display text-2xl">A dream show</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="Artist *"
            value={draft.artist}
            onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
          />
          <Select
            value={draft.priority}
            onValueChange={(v) =>
              setDraft({ ...draft, priority: v as WishlistItem["priority"] })
            }
          >
            <SelectTrigger className="border-2 border-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">🔥 High priority</SelectItem>
              <SelectItem value="medium">Medium priority</SelectItem>
              <SelectItem value="low">Low priority</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Notes"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>
        <Button
          className="mt-3"
          onClick={add}
          disabled={!draft.artist.trim() || addWishlist.isPending}
        >
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
              <div className="stamp mt-0.5">{PRIORITY_LABELS[it.priority]}</div>
              {it.notes && (
                <div className="mt-1 text-sm text-muted-foreground">{it.notes}</div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => promote(it)}
                disabled={addUpcoming.isPending}
                title="Move to upcoming"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(it.id)}
                aria-label="Remove"
              >
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
