'use client';

/**
 * The icon set, as raw path data.
 *
 * Hand-rolled rather than pulled from a package: the whole set below is smaller
 * than the import statement's worth of runtime an icon library would add, and
 * every glyph inherits `currentColor` so it themes for free.
 */
const PATHS: Record<string, string[]> = {
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: ['M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0', 'M16 16l4.5 4.5'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronUp: ['M6 15l6-6 6 6'],
  terminal: ['M5 7l5 5-5 5', 'M13 17h6'],
  chat: ['M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z'],
  branch: [
    'M6 6v12',
    'M6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M6 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M18 8v2a4 4 0 0 1-4 4H6',
  ],
  diff: [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5',
    'M12 10v5',
    'M9.5 12.5h5',
    'M9.5 17h5',
  ],
  play: ['M8 5l11 7-11 7z'],
  stop: ['M7 7h10v10H7z'],
  retry: ['M20.5 12a8.5 8.5 0 1 1-2.8-6.3', 'M20.5 3.5v5h-5'],
  merge: [
    'M7 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M7 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M17 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    'M7 6v12',
    'M7 9a4 4 0 0 0 4 4h4',
  ],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7', 'M9.5 7V4.5h5V7'],
  moon: ['M20.5 14.6A8.6 8.6 0 1 1 9.9 3.6a6.9 6.9 0 0 0 10.6 11z'],
  sun: [
    'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
    'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2',
    'M5.2 5.2l1.4 1.4', 'M17.4 17.4l1.4 1.4', 'M18.8 5.2l-1.4 1.4', 'M6.6 17.4l-1.4 1.4',
  ],
  sliders: ['M4 8h9', 'M17 8h3', 'M4 16h3', 'M11 16h9', 'M15 6v4', 'M7 14v4'],
  sparkles: [
    'M12 3.5l1.5 4.2 4.2 1.5-4.2 1.5L12 15l-1.5-4.3L6.3 9.2l4.2-1.5z',
    'M18.3 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  ],
  alert: ['M12 4l8.5 15.5h-17z', 'M12 10v4', 'M12 17.1v.1'],
  check: ['M5 13l4.5 4.5L19.5 7'],
  checkCircle: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M8.2 12.4l2.6 2.6 5-5.4'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 7.5V12l3 2'],
  cpu: [
    'M7.5 7.5h9v9h-9z', 'M4 10h3.5', 'M4 14h3.5', 'M16.5 10H20', 'M16.5 14H20',
    'M10 4v3.5', 'M14 4v3.5', 'M10 16.5V20', 'M14 16.5V20',
  ],
  folder: ['M3.5 7.5a2 2 0 0 1 2-2h3.2l2 2.5h7.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'],
  copy: [
    'M8.5 8.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
    'M16 6.5v-1a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1',
  ],
  download: ['M12 4v11', 'M8 11.5l4 4 4-4', 'M5 19.5h14'],
  maximize: ['M4.5 9.5v-5h5', 'M19.5 14.5v5h-5', 'M19.5 9.5v-5h-5', 'M4.5 14.5v5h5'],
  minimize: ['M9.5 4.5v5h-5', 'M14.5 19.5v-5h5', 'M14.5 4.5v5h5', 'M9.5 19.5v-5h-5'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  command: ['M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z'],
  keyboard: ['M3.5 7h17v10h-17z', 'M7 11h.1', 'M11 11h.1', 'M15 11h.1', 'M8 14h8'],
  filter: ['M4 5.5h16l-6.2 7v6l-3.6 1.8v-7.8z'],
  board: ['M4 5h4.6v14H4z', 'M9.7 5h4.6v9.5H9.7z', 'M15.4 5H20v12h-4.6z'],
  list: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 11.5V16.5', 'M12 8v.1'],
  zap: ['M13.5 3L5.5 14h6l-1 7 8-11h-6z'],
  send: ['M4.5 12l15-7.5-6 15-2.4-5.1z', 'M11.1 14.4l3.4-3.4'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  pencil: ['M4.5 19.5l4.2-1L19 8.2a2.1 2.1 0 0 0-3-3L5.5 15.3z', 'M14.5 6.7l3 3'],
  globe: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    'M3.4 9.2h17.2', 'M3.4 14.8h17.2',
    'M12 3a15 15 0 0 1 0 18', 'M12 3a15 15 0 0 0 0 18',
  ],
  tool: ['M15.6 8.4a4.2 4.2 0 0 0 5.1 5.1l-7.7 7.7a2.9 2.9 0 0 1-4.1-4.1z', 'M15.6 8.4L19 5'],
  dots: ['M6 12h.1', 'M12 12h.1', 'M18 12h.1'],
  external: ['M14 4.5h5.5V10', 'M19.5 4.5L12 12', 'M18 14v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4'],
  activity: ['M3 12h4l3 8 4-16 3 8h4'],
  eye: ['M2.5 12S6.2 5.5 12 5.5 21.5 12 21.5 12 17.8 18.5 12 18.5 2.5 12 2.5 12z', 'M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0'],
  eyeOff: ['M4 4l16 16', 'M9.8 5.8A9.9 9.9 0 0 1 12 5.5c5.8 0 9.5 6.5 9.5 6.5a17.4 17.4 0 0 1-3.4 4.1', 'M6.4 8.1A17.3 17.3 0 0 0 2.5 12S6.2 18.5 12 18.5c1.1 0 2.2-.2 3.1-.6'],
  user: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  brain: ['M9.5 4.5A3 3 0 0 0 6.6 8 3 3 0 0 0 5.5 13.6V16a3 3 0 0 0 4 2.8', 'M14.5 4.5A3 3 0 0 1 17.4 8 3 3 0 0 1 18.5 13.6V16a3 3 0 0 1-4 2.8', 'M12 4v16'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.9-6.4', 'M3 3.5v4.5h4.5', 'M12 8v4.4l3 1.8'],
  layers: ['M12 3l8.5 4.8L12 12.6 3.5 7.8z', 'M3.5 12.6L12 17.4l8.5-4.8', 'M3.5 16.8L12 21.6l8.5-4.8'],
  sidebar: ['M4 5h16v14H4z', 'M9.5 5v14'],
  pause: ['M9.5 5.5v13', 'M14.5 5.5v13'],
  refresh: ['M20.5 5.5v5h-5', 'M3.5 18.5v-5h5', 'M4.2 10a8.5 8.5 0 0 1 14-3.2l2.3 2.2', 'M19.8 14a8.5 8.5 0 0 1-14 3.2L3.5 15'],
  pin: ['M12 3.5l5 5-2 .8-.7 4.7L12 16l-2.3-2-.7-4.7-2-.8z', 'M12 16v4.5'],
  wrap: ['M4 6h16', 'M4 12h12a3 3 0 0 1 0 6h-3', 'M15 15l-2.5 3 2.5 3'],
  hash: ['M6 9h13', 'M5 15h13', 'M10.5 4l-2 16', 'M16 4l-2 16'],
  spark: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M5.6 5.6l2.1 2.1', 'M16.3 16.3l2.1 2.1', 'M18.4 5.6l-2.1 2.1', 'M7.7 16.3l-2.1 2.1'],
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 14,
  className = '',
  strokeWidth = 1.75,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const paths = PATHS[name] ?? PATHS.tool ?? [];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** The Karkhana mark: three bars, the middle one lit — parallel agents. */
export function BrandMark({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={className}>
      <rect x="6" y="9" width="4.5" height="14" rx="2" className="fill-ink-500" />
      <rect x="13.75" y="4" width="4.5" height="24" rx="2" className="fill-forge-500" />
      <rect x="21.5" y="9" width="4.5" height="14" rx="2" className="fill-ink-500" />
    </svg>
  );
}
