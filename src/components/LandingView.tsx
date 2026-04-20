// src/components/LandingView.tsx
//
// Shown to unauthenticated users in place of the archive.
// Placeholder until Phase 3 public-facing pages are built.
// Must stay within the existing design system — no new tokens, no gradients,
// no deviations from the oxblood/bone/brass aesthetic.

type Props = {
  onSignIn: () => void;
};

export const LandingView = ({ onSignIn }: Props) => (
  <div className="flex flex-1 items-center justify-center px-6 py-20">
    <div className="w-full max-w-lg">
      <div className="stamp mb-3">Personal Concert Archive</div>
      <h1 className="font-display text-7xl leading-none">
        Wook<span className="text-primary">Book</span>
      </h1>
      <div className="brass-rule my-6" />
      <p className="font-display text-2xl leading-snug">
        Every show you've ever seen, catalogued and dated.
      </p>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground italic">
        Log your history, discover live recordings, track upcoming shows,
        and connect with the people who were there.
      </p>
      <div className="mt-8">
        <button
          onClick={onSignIn}
          className="inline-flex items-center gap-2 border-2 border-ink bg-primary px-6 py-3 font-mono text-xs uppercase tracking-widest text-primary-foreground shadow-[4px_4px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--ink))]"
        >
          Sign in to your archive
        </button>
      </div>
      <p className="mt-4 font-mono text-[10px] text-muted-foreground">
        New to WookBook? Create an account from the sign-in screen.
      </p>
    </div>
  </div>
);
