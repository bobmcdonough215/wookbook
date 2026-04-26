// api/cleanup-tours.ts
// Monthly cron — 3am UTC on the 1st.
//
// JamBase ToS: no caching beyond 30 days without written permission.
// Deletes all jambase tour_events older than 30 days.
// Cascade deletes on user_event_matches and interest_log handle dependent rows
// automatically — requires ON DELETE CASCADE on both FK constraints (see migration SQL).

import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).end("Unauthorized");
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { error, count } = await supabase
    .from("tour_events")
    .delete({ count: "exact" })
    .eq("source", "jambase")
    .lt("date", cutoff);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ deleted: count ?? 0, cutoff });
}
