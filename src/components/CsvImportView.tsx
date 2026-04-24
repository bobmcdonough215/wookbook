// src/components/CsvImportView.tsx
import { useRef, useState } from "react";
import { parseCsvText, CsvRow } from "@/lib/csvParse";
import { useCsvImport, ImportRowResult } from "@/hooks/useCsvImport";
import { Upload, FileText, AlertTriangle, CheckCircle2, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = "input" | "preview" | "importing" | "done";

const SAMPLE = `artist,date,venue,city,opener,notes
Phish,1999-12-31,Madison Square Garden,New York,,Best NYE ever
Goose,2023-07-04,SPAC,Saratoga Springs,,
Billy Strings,8/5/2022,Red Rocks Amphitheatre,Morrison,Marcus King Band,
Joe Russo's Almost Dead,June 14 2019,,Brooklyn,,Front row`;

export const CsvImportView = () => {
  const [step, setStep] = useState<Step>("input");
  const [raw, setRaw] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headerError, setHeaderError] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | undefined>();
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useCsvImport();

  const handleParse = () => {
    const { rows: parsed, headerError: hErr } = parseCsvText(raw);
    setHeaderError(hErr);
    setRows(parsed);
    setImportError(undefined);
    if (!hErr) setStep("preview");
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRaw(text);
      const { rows: parsed, headerError: hErr } = parseCsvText(text);
      setHeaderError(hErr);
      setRows(parsed);
      setImportError(undefined);
      if (!hErr) setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setStep("importing");
    setImportError(undefined);
    try {
      const res = await importMutation.mutateAsync(rows);
      setResults(res);
      setStep("done");
    } catch (e) {
      // mutateAsync only throws when the entire mutation function throws (i.e.
      // auth failure), since per-chunk errors are accumulated into results.
      setImportError(e instanceof Error ? e.message : "Import failed. Please try again.");
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("input");
    setRaw("");
    setShowPaste(false);
    setRows([]);
    setHeaderError(undefined);
    setImportError(undefined);
    setResults([]);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);
  const ambiguousRows = rows.filter((r) => !r.error && r.dateAmbiguous);

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === "done") {
    const imported     = results.filter((r) => r.status === "imported").length;
    const alreadyLogged = results.filter((r) => r.status === "already_logged").length;
    const failed       = results.filter((r) => r.status === "error");

    return (
      <div className="space-y-6">
        <div className="border-2 border-ink bg-card p-8 shadow-[4px_4px_0_hsl(var(--ink))] text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h2 className="font-display text-3xl leading-none">Import complete</h2>
          <div className="flex justify-center gap-8 pt-2">
            <div>
              <div className="font-mono text-2xl font-semibold">{imported}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Added</div>
            </div>
            {alreadyLogged > 0 && (
              <div>
                <div className="font-mono text-2xl font-semibold text-muted-foreground">{alreadyLogged}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Already logged</div>
              </div>
            )}
            {failed.length > 0 && (
              <div>
                <div className="font-mono text-2xl font-semibold text-destructive">{failed.length}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Errors</div>
              </div>
            )}
          </div>
        </div>

        {failed.length > 0 && (
          <div className="border-2 border-ink bg-card shadow-[4px_4px_0_hsl(var(--ink))]">
            <div className="border-b-2 border-ink px-4 py-2">
              <div className="stamp text-muted-foreground">Import errors</div>
            </div>
            <div className="divide-y divide-ink/30 max-h-60 overflow-y-auto">
              {failed.map((r) => (
                <div key={r.rowIndex} className="px-4 py-2 text-xs font-mono text-destructive">
                  Row {r.rowIndex}: {r.message}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="outline" onClick={reset} className="gap-2 border-2 border-ink">
          <RefreshCw className="h-4 w-4" /> Import another file
        </Button>
      </div>
    );
  }

  // ── Importing ─────────────────────────────────────────────────────────────────
  if (step === "importing") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink border-t-primary" />
        <p className="font-mono text-sm text-muted-foreground">Importing your shows…</p>
      </div>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-sm font-semibold">{validRows.length} shows ready</span>
            {errorRows.length > 0 && (
              <span className="ml-3 font-mono text-sm text-destructive">
                · {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} with errors (will be skipped)
              </span>
            )}
          </div>
          <button onClick={reset} className="stamp text-muted-foreground hover:text-foreground transition-colors">
            Start over
          </button>
        </div>

        {/* Import-level error (auth failure, network down, etc.) */}
        {importError && (
          <div className="flex items-start gap-2 border-2 border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Ambiguous date notice */}
        {ambiguousRows.length > 0 && (
          <div className="flex items-start gap-2 border-2 border-brass/50 bg-brass/5 px-4 py-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
            <span>
              <span className="font-medium">{ambiguousRows.length} date{ambiguousRows.length !== 1 ? "s" : ""} assumed MM/DD</span>
              {" — "}dates like "05/06" could be May 6 or June 5. Rows marked{" "}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <Info className="h-3 w-3 text-brass" />
              </span>{" "}
              were parsed as MM/DD. Verify them in your archive after import.
            </span>
          </div>
        )}

        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_hsl(var(--ink))]">
          <div className="min-w-[480px]">
          <div className="grid grid-cols-[2fr_1fr_2fr_2fr_auto] border-b-2 border-ink bg-primary text-primary-foreground">
            {["Artist", "Date", "City", "Venue", ""].map((h) => (
              <div key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest">{h}</div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-ink/20 bg-card">
            {rows.map((row) => (
              <div
                key={row.rowIndex}
                className={`grid grid-cols-[2fr_1fr_2fr_2fr_auto] items-center ${row.error ? "bg-destructive/5" : ""}`}
              >
                <div className="px-3 py-2 text-sm truncate">
                  {row.artist || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="px-3 py-2 font-mono text-xs text-muted-foreground truncate">
                  {row.date || <span className="text-destructive">{row.rawDate || "—"}</span>}
                </div>
                <div className="px-3 py-2 text-sm truncate">
                  {row.city || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="px-3 py-2 text-sm truncate text-muted-foreground">
                  {row.venue || <span className="italic">—</span>}
                </div>
                <div className="px-3 py-2">
                  {row.error && (
                    <span title={row.error}>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </span>
                  )}
                  {!row.error && row.dateAmbiguous && (
                    <span title="Date assumed MM/DD — could also be DD/MM">
                      <Info className="h-4 w-4 text-brass" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        {errorRows.length > 0 && (
          <div className="space-y-1">
            <div className="stamp text-muted-foreground">Rows that will be skipped</div>
            {errorRows.map((r) => (
              <div key={r.rowIndex} className="font-mono text-xs text-destructive">
                Row {r.rowIndex}: {r.error}
              </div>
            ))}
          </div>
        )}

        {validRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No importable rows found. Check your column headers and try again.
          </p>
        ) : (
          <Button
            onClick={handleImport}
            className="gap-2 border-2 border-ink shadow-[3px_3px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_hsl(var(--ink))]"
          >
            Import {validRows.length} show{validRows.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Export your spreadsheet as a CSV and import it here. Needs at least three columns:{" "}
          <span className="font-mono text-foreground">artist</span>,{" "}
          <span className="font-mono text-foreground">date</span>, and{" "}
          <span className="font-mono text-foreground">city</span>. Everything else is optional.
          Date formats, column name variations — we handle them.
        </p>
      </div>

      {/* Primary: file drop zone */}
      <div
        className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-ink bg-card p-12 shadow-[4px_4px_0_hsl(var(--ink))] text-center"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload className="h-10 w-10 text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="font-mono text-sm">Drop your CSV here</p>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">or</p>
        </div>
        <Button
          onClick={() => fileRef.current?.click()}
          className="gap-2 border-2 border-ink shadow-[3px_3px_0_hsl(var(--ink))] transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_hsl(var(--ink))]"
        >
          <Upload className="h-4 w-4" /> Choose file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {headerError && (
        <div className="flex items-start gap-2 border-2 border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{headerError}</span>
        </div>
      )}

      {/* Secondary: paste */}
      <div className="space-y-3">
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="stamp text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPaste ? "Hide paste area" : "Or paste CSV directly"}
        </button>

        {showPaste && (
          <>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`Paste CSV here…\n\n${SAMPLE}`}
              className="h-48 w-full resize-none border-2 border-ink bg-card p-4 font-mono text-xs focus:outline-none placeholder:text-muted-foreground/40"
              spellCheck={false}
            />
            <Button
              onClick={handleParse}
              disabled={!raw.trim()}
              variant="outline"
              className="gap-2 border-2 border-ink"
            >
              <FileText className="h-4 w-4" /> Preview import
            </Button>
          </>
        )}
      </div>

      {/* Sample format */}
      <div className="border-2 border-ink bg-card p-5 shadow-[4px_4px_0_hsl(var(--ink))]">
        <div className="stamp mb-2 text-muted-foreground">Expected format</div>
        <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">{SAMPLE}</pre>
        <p className="mt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          opener · notes · venue are all optional
        </p>
      </div>
    </div>
  );
};
