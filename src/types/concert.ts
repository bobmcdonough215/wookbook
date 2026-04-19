export type Concert = {
  id: string;
  artist: string;
  event?: string;
  venue: string;
  city: string;
  state: string;
  date: string; // ISO-ish: YYYY, YYYY-MM, or YYYY-MM-DD
  special_notes?: string;
  rating?: number; // 1-5
  memory?: string;
};

export type WishlistItem = {
  id: string;
  artist: string;
  venue?: string;
  notes?: string;
  addedAt: string;
};

export type UpcomingItem = Concert & { addedAt: string };

export function parseConcertDate(d: string): { year: number; month?: number; day?: number; ts: number } {
  const parts = d.split("-");
  const year = parseInt(parts[0], 10);
  const month = parts[1] ? parseInt(parts[1], 10) : undefined;
  const day = parts[2] ? parseInt(parts[2], 10) : undefined;
  const ts = new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
  return { year, month, day, ts };
}

export function formatConcertDate(d: string): string {
  const { year, month, day } = parseConcertDate(d);
  if (day && month) {
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }
  if (month) {
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
    });
  }
  return String(year);
}
