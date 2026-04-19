import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="grain flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md border-2 border-ink bg-card p-10 text-center shadow-[5px_5px_0_hsl(var(--ink))]">
        <div className="stamp">Volume 404</div>
        <h1 className="mt-2 font-display text-8xl leading-none text-primary">404</h1>
        <div className="brass-rule my-5" />
        <p className="font-display text-2xl">Not in the ledger.</p>
        <p className="mt-2 text-sm italic text-muted-foreground">
          Whatever you were looking for hasn't been catalogued here.
        </p>
        <div className="ink-rule my-5" />
        <a href="/" className="stamp text-primary hover:underline">
          ← Return to the archive
        </a>
      </div>
    </div>
  );
};

export default NotFound;
