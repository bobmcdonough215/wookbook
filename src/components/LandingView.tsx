// src/components/LandingView.tsx
//
// Full-page landing shown to unauthenticated visitors.
// No sidebar. No Bob's stats. Just the pitch.

type Props = {
  onSignIn: () => void;
  onSignUp: () => void;
};

const FEATURES = [
  {
    title: "Your Archive",
    body: "Every show you've ever attended, catalogued by date, artist, venue, and city. Rate it. Add a memory. Search by artist or year.",
  },
  {
    title: "Live Recordings",
    body: "Instant access to live recordings via Relisten, Phish.in, and Archive.org — right from your show stub. No searching. No tabs.",
  },
  {
    title: "CSV Import",
    body: "Already tracking shows in a spreadsheet or notes app? Import a CSV and we'll pull your whole history in — artist, date, venue, city. No manual entry row by row.",
  },
  {
    title: "Follow Upcoming Tour Dates",
    body: "Watch the artists you love. Get notified the moment they announce a show near you. Discover new live music in your area — tour dates surfaced automatically as they're announced.",
  },
];

export const LandingView = ({ onSignIn, onSignUp }: Props) => (
  <div className="grain min-h-screen w-full bg-background">
    {/* ── Minimal header ── */}
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="stamp">◆ WookBook</div>
        <button
          onClick={onSignIn}
          className="stamp text-primary hover:underline transition-colors"
        >
          Sign in
        </button>
      </div>
    </header>

    {/* ── Hero ── */}
    <section className="mx-auto max-w-5xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
      <h1 className="font-display text-6xl leading-none sm:text-8xl lg:text-[7rem]">
        Wook<span className="text-primary">Book</span>
      </h1>
      <div className="brass-rule my-8 max-w-sm" />
      <p className="max-w-lg font-display text-3xl leading-snug">
        A concert archive built by a fan, for fans.
      </p>
      <p className="mt-4 max-w-md text-sm italic text-muted-foreground">
        Log every show you've ever seen. Discover live recordings. Track upcoming dates.
        Connect with the people who were there.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button
          onClick={onSignIn}
          className="inline-flex items-center gap-2 border-2 border-ink bg-primary px-7 py-3.5 font-mono text-xs uppercase tracking-widest text-primary-foreground shadow-[4px_4px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--ink))]"
        >
          Sign in to your archive
        </button>
        <button
          onClick={onSignUp}
          className="inline-flex items-center gap-2 border-2 border-ink bg-background px-7 py-3.5 font-mono text-xs uppercase tracking-widest shadow-[4px_4px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--ink))]"
        >
          Create an account
        </button>
      </div>
    </section>

    {/* ── Divider ── */}
    <div className="border-y-2 border-ink bg-primary">
      <div className="mx-auto max-w-5xl px-6 py-3">
        <p className="font-mono text-xs uppercase tracking-widest text-primary-foreground">
          What's inside
        </p>
      </div>
    </div>

    {/* ── Features grid ── */}
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="relative border-2 border-ink bg-card p-6 shadow-[4px_4px_0_hsl(var(--ink))]"
          >
            {f.badge && (
              <span className="absolute right-4 top-4 border border-brass px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brass">
                {f.badge}
              </span>
            )}
            <h2 className="font-display text-2xl leading-none">{f.title}</h2>
            <div className="ink-rule my-3" />
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ── CSV callout ── */}
    <section className="border-y-2 border-ink">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-12">
          <div className="flex-1">
            <div className="stamp mb-2">CSV Import · Available Now</div>
            <h2 className="font-display text-4xl leading-none">
              Already tracking shows?
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Got a Google Sheet, a notes app, a spreadsheet going back years?
              Export it as a CSV — artist, date, venue, city — and import your whole history in one shot.
              No manual entry row by row.
            </p>
          </div>
          <div className="shrink-0">
            <div className="border-2 border-dashed border-ink bg-card p-6 text-center shadow-[4px_4px_0_hsl(var(--ink))]">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Sample format
              </div>
              <pre className="mt-3 overflow-x-auto text-left font-mono text-xs leading-relaxed text-foreground">
{`artist,date,venue,city,state
Phish,1999-12-31,MSG,New York,NY
Goose,2023-07-04,SPAC,Saratoga,NY
Billy Strings,2022-08-05,Red Rocks,Morrison,CO`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ── Bottom CTA ── */}
    <section className="mx-auto max-w-5xl px-6 py-16 text-center">
      <div className="stamp mb-4 text-muted-foreground">Admit One</div>
      <h2 className="font-display text-5xl leading-none">
        Your shows deserve a ledger.
      </h2>
      <button
        onClick={onSignUp}
        className="mt-8 inline-flex items-center gap-2 border-2 border-ink bg-primary px-8 py-4 font-mono text-xs uppercase tracking-widest text-primary-foreground shadow-[5px_5px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_hsl(var(--ink))]"
      >
        Get early access
      </button>
    </section>

    {/* ── Footer ── */}
    <footer className="border-t-2 border-ink px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="stamp">WookBook · est. {new Date().getFullYear()}</div>
        <a
          href="https://bobmcd.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          bobmcd.com
        </a>
      </div>
    </footer>
  </div>
);
