/**
 * Turns Claude Code's `--output-format stream-json` stdout into events worth
 * keeping.
 *
 * The raw stream is newline-delimited JSON, but it is not all signal. A single
 * short run emits a ~20KB `system/commands_changed` frame listing every slash
 * command, a `system/thinking_tokens` frame roughly every 200ms, and thinking
 * blocks carrying ~1KB base64 signatures. Persisting that verbatim would bloat
 * SQLite and flood the log pane, so this module both splits and normalizes.
 */

export type RawEvent = Record<string, unknown> & { type?: string; subtype?: string };

/** Frames with no display value, dropped before they ever reach the DB. */
const NOISE_TYPES = new Set(['active_goal', 'rate_limit_event']);
const NOISE_SUBTYPES = new Set(['commands_changed', 'thinking_tokens']);

/**
 * `system/init` carries the whole slash-command, skill, and agent inventory.
 * We only want the bits that describe the run.
 */
const INIT_KEEP = [
  'type',
  'subtype',
  'session_id',
  'cwd',
  'model',
  'permissionMode',
  'tools',
  'mcp_servers',
  'claude_code_version',
  'apiKeySource',
  'output_style',
] as const;

const MAX_PAYLOAD_BYTES = 128 * 1024;

/**
 * Splits a byte stream into complete JSON lines.
 *
 * Chunk boundaries fall mid-line constantly, so partial text is buffered until
 * a newline arrives. Lines that don't parse are surfaced rather than swallowed
 * — a runner that silently eats malformed output is impossible to debug.
 */
export class StreamJsonParser {
  private buffer = '';

  push(chunk: string): Array<{ ok: true; event: RawEvent } | { ok: false; line: string }> {
    this.buffer += chunk;
    const out: Array<{ ok: true; event: RawEvent } | { ok: false; line: string }> = [];

    let newlineAt: number;
    while ((newlineAt = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineAt).trim();
      this.buffer = this.buffer.slice(newlineAt + 1);
      if (!line) continue;

      try {
        out.push({ ok: true, event: JSON.parse(line) as RawEvent });
      } catch {
        out.push({ ok: false, line });
      }
    }
    return out;
  }

  /** Anything left after the process closes stdout without a trailing newline. */
  flush(): Array<{ ok: true; event: RawEvent } | { ok: false; line: string }> {
    if (!this.buffer.trim()) {
      this.buffer = '';
      return [];
    }
    const rest = this.buffer.trim();
    this.buffer = '';
    try {
      return [{ ok: true, event: JSON.parse(rest) as RawEvent }];
    } catch {
      return [{ ok: false, line: rest }];
    }
  }
}

/** Recursively drops thinking-block signatures — ~1KB of base64 apiece. */
function stripSignatures(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSignatures);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'signature') continue;
      out[k] = stripSignatures(v);
    }
    return out;
  }
  return value;
}

/**
 * Drops noise and shrinks the rest. Returns `null` for frames we don't persist.
 */
export function normalizeEvent(event: RawEvent): RawEvent | null {
  const type = typeof event.type === 'string' ? event.type : 'unknown';
  const subtype = typeof event.subtype === 'string' ? event.subtype : undefined;

  if (NOISE_TYPES.has(type)) return null;
  if (subtype && NOISE_SUBTYPES.has(subtype)) return null;

  if (type === 'system' && subtype === 'init') {
    const compact: Record<string, unknown> = {};
    for (const key of INIT_KEEP) {
      if (key in event) compact[key] = event[key];
    }
    return compact as RawEvent;
  }

  let normalized = stripSignatures(event) as RawEvent;

  // Tool results can carry entire file contents. Cap the payload rather than
  // letting one Read blow up the row.
  const serialized = JSON.stringify(normalized);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    normalized = {
      type,
      subtype,
      _truncated: true,
      _original_bytes: serialized.length,
      _preview: serialized.slice(0, MAX_PAYLOAD_BYTES),
    };
  }
  return normalized;
}

/**
 * Claude Code stamps `session_id` on nearly every frame, including the first
 * one — so we don't have to wait for `system/init` to learn it. That matters
 * because a run that dies early is only resumable if we captured it.
 */
export function extractSessionId(event: RawEvent): string | null {
  const id = event.session_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export type ResultSummary = {
  isError: boolean;
  subtype: string | null;
  result: string | null;
  durationMs: number | null;
  numTurns: number | null;
  totalCostUsd: number | null;
};

export function parseResult(event: RawEvent): ResultSummary {
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    isError: event.is_error === true,
    subtype: typeof event.subtype === 'string' ? event.subtype : null,
    result: typeof event.result === 'string' ? event.result : null,
    durationMs: num(event.duration_ms),
    numTurns: num(event.num_turns),
    totalCostUsd: num(event.total_cost_usd),
  };
}
