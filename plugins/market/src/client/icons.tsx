/** Inline lucide-style stroke icons. No emoji, no icon font. */

export type IconName =
  | "grid"
  | "package"
  | "zap"
  | "layout"
  | "cpu"
  | "database"
  | "message"
  | "search"
  | "globe"
  | "plus"
  | "check"
  | "clock"
  | "trash"
  | "arrowLeft"
  | "close"
  | "download";

const PATHS: Record<IconName, string[]> = {
  grid: [
    "M3 3h7v7H3z",
    "M14 3h7v7h-7z",
    "M14 14h7v7h-7z",
    "M3 14h7v7H3z",
  ],
  package: [
    "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
    "m3.3 7 8.7 5 8.7-5",
    "M12 22V12",
  ],
  zap: [
    "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
  ],
  layout: [
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M9 3v18",
  ],
  cpu: [
    "M6 6h12v12H6z",
    "M9 9h6v6H9z",
    "M12 2v4", "M12 18v4", "M2 12h4", "M18 12h4",
  ],
  database: [
    "M3 5c0 1.66 4.03 3 9 3s9-1.34 9-3-4.03-3-9-3-9 1.34-9 3",
    "M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5",
    "M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3",
  ],
  message: [
    "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
  ],
  search: [
    "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16",
    "m21 21-4.3-4.3",
  ],
  globe: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
    "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
    "M2 12h20",
  ],
  plus: ["M5 12h14", "M12 5v14"],
  check: ["M20 6 9 17l-5-5"],
  clock: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
    "M12 6v6l4 2",
  ],
  trash: [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    "M10 11v6", "M14 11v6",
  ],
  arrowLeft: ["m12 19-7-7 7-7", "M19 12H5"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m7 10 5 5 5-5",
    "M12 15V3",
  ],
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Per-entry glyph: known plugins get their own mark; kinds fall back to package / zap. */
export function entryIconName(entryId: string, kind: "plugin" | "workflow"): IconName {
  switch (entryId) {
    case "hello": return "layout";
    case "providers": return "cpu";
    case "memory": return "database";
    case "im": return "message";
    default: return kind === "workflow" ? "zap" : "package";
  }
}
