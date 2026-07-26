/**
 * Minimal ANSI SGR parser for the terminal pane. Client-safe.
 *
 * Tool output that reaches us through the agent's stdout keeps its colour
 * codes — `git diff`, test runners, and anything the agent shells out to. The
 * old log pane rendered those escapes literally, which is both ugly and
 * actively misleading (a bare `[32m` in the middle of a filename). This turns
 * them into styled segments and, just as importantly, drops the cursor-movement
 * codes that have no meaning in a scrollback pane.
 *
 * Escapes are written as `\u001b` rather than literal control bytes so the file
 * stays plain text — a stray raw ESC makes it a binary blob to git and grep.
 */

export type AnsiSegment = {
  text: string;
  /** Class names from globals.css (`ansi-*`). */
  className: string;
  /** Set for 256-colour and truecolor codes, which have no class. */
  color?: string;
};

const ESC = '\u001b';
const SGR = /\u001b\[([0-9;]*)m/g;
/** OSC strings, CSI non-colour sequences, charset selects, and lone escapes. */
const OTHER_ESCAPES =
  /\u001b\][\s\S]*?(?:\u0007|\u001b\\)|\u001b[[(][0-9;?]*[ -/]*[@-~]|\u001b[=>]|\u001b[@-Z\\-_]/g;

const BASIC: Record<number, string> = {
  30: 'ansi-black',
  31: 'ansi-red',
  32: 'ansi-green',
  33: 'ansi-yellow',
  34: 'ansi-blue',
  35: 'ansi-magenta',
  36: 'ansi-cyan',
  37: 'ansi-white',
};

const BASIC_CLASSES = Object.values(BASIC);

const XTERM_BASE = [
  '#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
];

function xterm256(n: number): string {
  if (n < 16) return XTERM_BASE[n] ?? '';
  if (n < 232) {
    const i = n - 16;
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${level(Math.floor(i / 36))},${level(Math.floor((i % 36) / 6))},${level(i % 6)})`;
  }
  const grey = 8 + (n - 232) * 10;
  return `rgb(${grey},${grey},${grey})`;
}

type State = { className: Set<string>; color?: string };

function apply(state: State, params: number[]): void {
  for (let i = 0; i < params.length; i++) {
    const code = params[i] ?? 0;
    if (code === 0) {
      state.className.clear();
      state.color = undefined;
    } else if (code === 1) state.className.add('ansi-bold');
    else if (code === 2) state.className.add('ansi-dim');
    else if (code === 3) state.className.add('italic');
    else if (code === 4) state.className.add('underline');
    else if (code === 22) {
      state.className.delete('ansi-bold');
      state.className.delete('ansi-dim');
    } else if (code === 23) state.className.delete('italic');
    else if (code === 24) state.className.delete('underline');
    else if (code === 39) {
      for (const cls of BASIC_CLASSES) state.className.delete(cls);
      state.color = undefined;
    } else if (BASIC[code]) {
      for (const cls of BASIC_CLASSES) state.className.delete(cls);
      state.className.add(BASIC[code] as string);
      state.color = undefined;
    } else if (code >= 90 && code <= 97) {
      for (const cls of BASIC_CLASSES) state.className.delete(cls);
      state.className.add(BASIC[code - 60] as string);
      state.className.add('ansi-bold');
      state.color = undefined;
    } else if (code === 38 || code === 48) {
      // 38;5;n  or  38;2;r;g;b. Background variants (48) are parsed only so
      // their parameters are consumed — a log pane with agent-chosen
      // backgrounds is unreadable in at least one of the two themes.
      const mode = params[i + 1];
      if (mode === 5) {
        if (code === 38) state.color = xterm256(params[i + 2] ?? 0);
        i += 2;
      } else if (mode === 2) {
        if (code === 38) {
          state.color = `rgb(${params[i + 2] ?? 0},${params[i + 3] ?? 0},${params[i + 4] ?? 0})`;
        }
        i += 4;
      }
    }
  }
}

/** Splits text into styled segments, dropping non-colour escapes entirely. */
export function parseAnsi(input: string): AnsiSegment[] {
  if (!input) return [];
  if (!input.includes(ESC)) return [{ text: input, className: '' }];

  const segments: AnsiSegment[] = [];
  const state: State = { className: new Set() };
  let lastIndex = 0;

  const push = (raw: string) => {
    const text = raw.replace(OTHER_ESCAPES, '');
    if (!text) return;
    segments.push({ text, className: [...state.className].join(' '), color: state.color });
  };

  SGR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SGR.exec(input)) !== null) {
    push(input.slice(lastIndex, match.index));
    const params = (match[1] ?? '')
      .split(';')
      .map((p) => (p === '' ? 0 : Number(p)))
      .filter((n) => Number.isFinite(n));
    apply(state, params.length ? params : [0]);
    lastIndex = match.index + match[0].length;
  }
  push(input.slice(lastIndex));

  return segments;
}

/** Colour codes removed — used for search, copy, and download. */
export function stripAnsi(input: string): string {
  return input.replace(SGR, '').replace(OTHER_ESCAPES, '');
}

/**
 * Applies carriage returns the way a real terminal would: everything before the
 * last `\r` on a line was overwritten in place, so only the tail survives.
 * Without this, every spinner and progress bar an agent shells out to arrives
 * as hundreds of near-identical lines.
 */
export function collapseCarriageReturns(text: string): string {
  if (!text.includes('\r')) return text;
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split('\r').filter((p) => p !== '');
      return parts.length ? (parts[parts.length - 1] as string) : '';
    })
    .join('\n');
}
