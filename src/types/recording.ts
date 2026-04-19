export type Track = {
  title: string;
  src: string;
  duration: string;
  position?: number;
  set?: string;
};

export type RecordingEntry =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; source: string; tracks: Track[] }
  | { status: "error"; message: string };
