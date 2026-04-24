// api/setlist.ts
// Vercel serverless function — proxies Setlist.fm API.
// SETLISTFM_KEY never touches the browser bundle.
// Setlist.fm ToS: no caching beyond short periods, attribution required.

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist");
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!artist || !date) {
    return Response.json({ error: "Missing artist or date" }, { status: 400 });
  }

  const key = process.env.SETLISTFM_KEY;
  if (!key) {
    return Response.json({ error: "Setlist.fm key not configured" }, { status: 500 });
  }

  // Setlist.fm date format: DD-MM-YYYY
  const [year, month, day] = date.split("-");
  const sfmDate = `${day}-${month}-${year}`;

  const sfmUrl =
    `https://api.setlist.fm/rest/1.0/search/setlists` +
    `?artistName=${encodeURIComponent(artist)}&date=${sfmDate}&p=1`;

  const res = await fetch(sfmUrl, {
    headers: {
      "x-api-key": key,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    return Response.json({ error: `Setlist.fm: ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  const setlists: SetlistFmSetlist[] = data?.setlist ?? [];

  if (!setlists.length) {
    return Response.json({ setlist: null });
  }

  // Pick the best match — exact date match, prefer entries with sets
  const match = setlists.find((s) => s.eventDate === sfmDate && s.sets?.set?.length)
    ?? setlists.find((s) => s.eventDate === sfmDate)
    ?? setlists[0];

  const rawSets = match.sets?.set ?? [];
  let setNumber = 0;
  const sets: { label: string; songs: string[] }[] = [];

  for (const set of rawSets) {
    const songs = (set.song ?? []).map((s) => s.name).filter(Boolean) as string[];
    if (!songs.length) continue;

    let label: string;
    if (set.encore) {
      label = set.encore > 1 ? `Encore ${set.encore}` : "Encore";
    } else {
      setNumber++;
      label = set.name?.trim().replace(/:$/, "") || `Set ${setNumber}`;
    }

    sets.push({ label, songs });
  }

  return Response.json({
    setlist: {
      sets,
      venue: match.venue?.name ?? null,
      city: match.venue?.city?.name ?? null,
      url: match.url ?? null,
      eventDate: match.eventDate,
    },
  });
}

// ─── Setlist.fm response shape (partial) ─────────────────────────────────────

type SetlistFmSetlist = {
  eventDate: string;
  url?: string;
  venue?: { name?: string; city?: { name?: string } };
  sets?: {
    set?: Array<{
      name?: string;
      encore?: number;
      song?: Array<{ name?: string }>;
    }>;
  };
};
