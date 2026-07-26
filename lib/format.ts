import type { TaskEvent, TaskStatus } from './types.ts';

// Client-safe: no node imports, so this can be shared with components.

export const STATUS_ORDER: TaskStatus[] = [
  'queued',
  'running',
  'needs_review',
  'merged',
  'failed',
  'cancelled',
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  needs_review: 'Needs review',
  merged: 'Merged',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** Tailwind classes per status — one place so cards, columns, and dots agree. */
export const STATUS_STYLE: Record<
  TaskStatus,
  { dot: string; text: string; border: string; tint: string; glow: string }
> = {
  queued: {
    dot: 'bg-ink-400',
    text: 'text-ink-300',
    border: 'border-ink-600',
    tint: 'bg-ink-400/10',
    glow: 'shadow-[0_0_0_1px_var(--color-ink-600)]',
  },
  running: {
    dot: 'bg-forge-500',
    text: 'text-forge-500',
    border: 'border-forge-500/45',
    tint: 'bg-forge-500/12',
    glow: 'shadow-[0_0_14px_-4px_var(--color-forge-500)]',
  },
  needs_review: {
    dot: 'bg-review',
    text: 'text-review',
    border: 'border-review/40',
    tint: 'bg-review/12',
    glow: 'shadow-[0_0_12px_-6px_var(--color-review)]',
  },
  merged: {
    dot: 'bg-ok',
    text: 'text-ok',
    border: 'border-ok/35',
    tint: 'bg-ok/12',
    glow: '',
  },
  failed: {
    dot: 'bg-danger',
    text: 'text-danger',
    border: 'border-danger/40',
    tint: 'bg-danger/12',
    glow: '',
  },
  cancelled: {
    dot: 'bg-ink-500',
    text: 'text-ink-400',
    border: 'border-ink-700',
    tint: 'bg-ink-500/10',
    glow: '',
  },
};

/** One-line explanation of each column, shown under the kanban headers. */
export const STATUS_HINT: Record<TaskStatus, string> = {
  queued: 'Waiting for a free agent slot',
  running: 'Agent is working in its own worktree',
  needs_review: 'Clean exit — read the diff, then merge',
  merged: 'Merged into the base branch',
  failed: 'Non-zero exit or an error result',
  cancelled: 'Stopped by you; worktree kept',
};

export type LogLine = {
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'meta' | 'error' | 'result';
  label?: string;
  body: string;
  detail?: string;
};

function preview(value: unknown, max = 400): string {
  if (typeof value === 'string') return value.slice(0, max);
  const json = JSON.stringify(value);
  return json ? json.slice(0, max) : String(value);
}

/** `tool_result` content arrives as a string or as a block array. */
function contentToText(content: unknown, max = 20_000): string {
  if (typeof content === 'string') return content.slice(0, max);
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = block as Record<string, unknown>;
        if (typeof b?.text === 'string') return b.text;
        if (b?.type === 'image') return '[image]';
        return preview(b, 400);
      })
      .join('\n')
      .slice(0, max);
  }
  return preview(content, max);
}

/**
 * Flattens a persisted event into displayable lines.
 *
 * `event.type` is whatever the CLI emitted, not a closed set, so anything
 * unrecognised falls through to a generic meta line rather than vanishing.
 */
export function toLogLines(event: TaskEvent): LogLine[] {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.payload_json) as Record<string, unknown>;
  } catch {
    return [{ kind: 'error', body: event.payload_json }];
  }

  if (event.type === 'stderr') {
    const text = (payload.text ?? payload.unparsed ?? '') as string;
    return [{ kind: 'error', label: String(payload.source ?? 'stderr'), body: text }];
  }

  if (event.type === 'lifecycle') {
    const kind = String(payload.kind ?? 'lifecycle');
    const bits: string[] = [];
    if (payload.pid) bits.push(`pid ${payload.pid}`);
    if (payload.model) bits.push(String(payload.model));
    if (payload.exitCode !== undefined && payload.exitCode !== null) bits.push(`exit ${payload.exitCode}`);
    if (payload.error) bits.push(String(payload.error));
    if (payload.prompt) bits.push(`prompt: ${String(payload.prompt).slice(0, 120)}`);
    return [
      {
        kind: kind.includes('fail') || kind.includes('orphan') ? 'error' : 'meta',
        label: kind,
        body: bits.join(' · '),
      },
    ];
  }

  if (event.type === 'system') {
    if (payload.subtype === 'init') {
      const tools = Array.isArray(payload.tools) ? payload.tools.length : 0;
      return [
        {
          kind: 'meta',
          label: 'session',
          body: `${payload.model ?? 'unknown model'} · ${tools} tools · ${payload.permissionMode ?? ''}`,
        },
      ];
    }
    if (payload.subtype === 'post_turn_summary') {
      return [{ kind: 'meta', label: 'summary', body: String(payload.status_detail ?? '') }];
    }
    return [{ kind: 'meta', label: String(payload.subtype ?? 'system'), body: preview(payload, 200) }];
  }

  if (event.type === 'result') {
    const cost = typeof payload.total_cost_usd === 'number' ? `$${payload.total_cost_usd.toFixed(4)}` : null;
    const duration = typeof payload.duration_ms === 'number' ? `${(payload.duration_ms / 1000).toFixed(1)}s` : null;
    const detail = [duration, payload.num_turns ? `${payload.num_turns} turns` : null, cost]
      .filter(Boolean)
      .join(' · ');
    return [
      {
        kind: payload.is_error ? 'error' : 'result',
        label: payload.is_error ? 'failed' : 'done',
        body: String(payload.result ?? payload.subtype ?? ''),
        detail,
      },
    ];
  }

  const message = payload.message as { content?: unknown[] } | undefined;
  if (!Array.isArray(message?.content)) {
    return [{ kind: 'meta', label: event.type, body: preview(payload, 200) }];
  }

  const lines: LogLine[] = [];
  for (const block of message.content) {
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && String(b.text).trim()) {
      lines.push({ kind: 'text', body: String(b.text) });
    } else if (b.type === 'thinking') {
      lines.push({ kind: 'thinking', body: String(b.thinking) });
    } else if (b.type === 'tool_use') {
      lines.push({
        kind: 'tool_use',
        label: String(b.name),
        body: describeToolInput(String(b.name), b.input as Record<string, unknown>),
      });
    } else if (b.type === 'tool_result') {
      lines.push({
        kind: 'tool_result',
        label: b.is_error ? 'error' : undefined,
        body: contentToText(b.content, 600),
      });
    }
  }
  return lines;
}

/** One-line summary of a tool call — full paths are noise in a log pane. */
export function describeToolInput(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const short = (p: unknown) => String(p ?? '').split('/').slice(-2).join('/');
  switch (name) {
    case 'Read':
    case 'Write':
      return short(input.file_path);
    case 'Edit':
      return `${short(input.file_path)}  ${String(input.old_string ?? '').slice(0, 40).replace(/\n/g, '⏎')} → ${String(input.new_string ?? '').slice(0, 40).replace(/\n/g, '⏎')}`;
    case 'Bash':
      return String(input.command ?? '');
    case 'Glob':
    case 'Grep':
      return `${input.pattern ?? ''}${input.path ? ` in ${short(input.path)}` : ''}`;
    default:
      return preview(input, 200);
  }
}

/* --------------------------------------------------------------------------
 * Chat transcript
 *
 * The log pane shows the stream as it arrived; the chat pane shows it as a
 * conversation. That needs one thing the flat list can't give: a `tool_use`
 * block and the `tool_result` that answers it are in *different* events,
 * usually several frames apart, so they are stitched back together here by
 * `tool_use_id` before rendering.
 * ------------------------------------------------------------------------ */

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  summary: string;
  result?: { text: string; isError: boolean; ts: number };
};

export type TranscriptItem =
  | { key: string; ts: number; kind: 'session'; model: string; tools: number; cwd: string; permission: string }
  | { key: string; ts: number; kind: 'user'; text: string; resumed: boolean }
  | { key: string; ts: number; kind: 'assistant'; text: string }
  | { key: string; ts: number; kind: 'thinking'; text: string }
  | { key: string; ts: number; kind: 'tool'; call: ToolCall }
  | {
      key: string;
      ts: number;
      kind: 'result';
      ok: boolean;
      text: string;
      durationMs: number | null;
      turns: number | null;
      costUsd: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
    }
  | { key: string; ts: number; kind: 'notice'; label: string; text: string; tone: 'info' | 'error' };

export function buildTranscript(events: TaskEvent[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const pendingTools = new Map<string, ToolCall>();

  for (const event of events) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.payload_json) as Record<string, unknown>;
    } catch {
      items.push({
        key: `${event.id}-raw`,
        ts: event.ts,
        kind: 'notice',
        label: 'unparsed',
        text: event.payload_json,
        tone: 'error',
      });
      continue;
    }

    if (event.type === 'stderr') {
      items.push({
        key: `${event.id}`,
        ts: event.ts,
        kind: 'notice',
        label: String(payload.source ?? 'stderr'),
        text: String(payload.text ?? payload.unparsed ?? ''),
        tone: 'error',
      });
      continue;
    }

    if (event.type === 'lifecycle') {
      const kind = String(payload.kind ?? 'lifecycle');
      const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
      if ((kind === 'spawned' || kind === 'resumed') && prompt) {
        items.push({
          key: `${event.id}-prompt`,
          ts: event.ts,
          kind: 'user',
          text: prompt,
          resumed: kind === 'resumed',
        });
      }
      if (kind === 'failed_to_start' || kind === 'orphaned') {
        items.push({
          key: `${event.id}`,
          ts: event.ts,
          kind: 'notice',
          label: kind.replace(/_/g, ' '),
          text: String(payload.error ?? ''),
          tone: 'error',
        });
      } else if (kind === 'cancelling' || kind === 'sigkill') {
        items.push({
          key: `${event.id}`,
          ts: event.ts,
          kind: 'notice',
          label: kind,
          text: payload.pid ? `pid ${payload.pid}` : '',
          tone: 'info',
        });
      }
      continue;
    }

    if (event.type === 'system') {
      if (payload.subtype === 'init') {
        items.push({
          key: `${event.id}`,
          ts: event.ts,
          kind: 'session',
          model: String(payload.model ?? 'unknown'),
          tools: Array.isArray(payload.tools) ? payload.tools.length : 0,
          cwd: String(payload.cwd ?? ''),
          permission: String(payload.permissionMode ?? ''),
        });
      } else if (payload.subtype === 'post_turn_summary' && payload.status_detail) {
        items.push({
          key: `${event.id}`,
          ts: event.ts,
          kind: 'notice',
          label: 'summary',
          text: String(payload.status_detail),
          tone: 'info',
        });
      }
      continue;
    }

    if (event.type === 'result') {
      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      items.push({
        key: `${event.id}`,
        ts: event.ts,
        kind: 'result',
        ok: !payload.is_error,
        text: String(payload.result ?? payload.subtype ?? ''),
        durationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : null,
        turns: typeof payload.num_turns === 'number' ? payload.num_turns : null,
        costUsd: typeof payload.total_cost_usd === 'number' ? payload.total_cost_usd : null,
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
      });
      continue;
    }

    const message = payload.message as { content?: unknown[] } | undefined;
    if (!Array.isArray(message?.content)) continue;

    message.content.forEach((block, index) => {
      const b = block as Record<string, unknown>;
      const key = `${event.id}-${index}`;

      if (b.type === 'text' && String(b.text).trim()) {
        items.push({ key, ts: event.ts, kind: 'assistant', text: String(b.text) });
      } else if (b.type === 'thinking' && String(b.thinking ?? '').trim()) {
        items.push({ key, ts: event.ts, kind: 'thinking', text: String(b.thinking) });
      } else if (b.type === 'tool_use') {
        const call: ToolCall = {
          id: String(b.id ?? key),
          name: String(b.name ?? 'tool'),
          input: (b.input ?? {}) as Record<string, unknown>,
          summary: describeToolInput(String(b.name), b.input as Record<string, unknown>),
        };
        pendingTools.set(call.id, call);
        items.push({ key, ts: event.ts, kind: 'tool', call });
      } else if (b.type === 'tool_result') {
        const call = pendingTools.get(String(b.tool_use_id));
        const text = contentToText(b.content);
        if (call) {
          call.result = { text, isError: Boolean(b.is_error), ts: event.ts };
        } else {
          // A result whose call we never saw — replayed history can start
          // mid-turn. Better to show it orphaned than to drop it.
          items.push({
            key,
            ts: event.ts,
            kind: 'notice',
            label: 'tool result',
            text,
            tone: b.is_error ? 'error' : 'info',
          });
        }
      }
    });
  }

  return items;
}

/* --- tool presentation ---------------------------------------------------- */

export type ToolPresentation = {
  icon: string;
  /** Fenced-code language for the primary input, when there is one. */
  language: string | null;
  /** The input worth showing in full, if any. */
  body: string | null;
  /** Short right-aligned target, e.g. a file path. */
  target: string | null;
};

export function presentTool(call: ToolCall): ToolPresentation {
  const input = call.input ?? {};
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  // Worktree paths are long and share a useless prefix; the tail identifies the
  // file, and the full path is one click away in the expanded card.
  const shortPath = (key: string) => str(key).split('/').slice(-2).join('/');

  switch (call.name) {
    case 'Bash':
      return { icon: 'terminal', language: 'sh', body: str('command'), target: null };
    case 'Read':
      return { icon: 'file', language: null, body: null, target: shortPath('file_path') };
    case 'Write':
      return {
        icon: 'pencil',
        language: str('file_path').split('.').pop() ?? null,
        body: str('content'),
        target: shortPath('file_path'),
      };
    case 'Edit':
      return { icon: 'pencil', language: null, body: null, target: shortPath('file_path') };
    case 'Glob':
      return { icon: 'search', language: null, body: null, target: str('pattern') };
    case 'Grep':
      return { icon: 'search', language: null, body: null, target: str('pattern') };
    case 'WebFetch':
    case 'WebSearch':
      return { icon: 'globe', language: null, body: null, target: str('url') || str('query') };
    case 'Task':
      return { icon: 'sparkles', language: null, body: str('prompt'), target: str('description') };
    case 'TodoWrite':
      return { icon: 'check', language: 'json', body: JSON.stringify(input.todos ?? input, null, 2), target: null };
    default:
      return { icon: 'tool', language: 'json', body: JSON.stringify(input, null, 2), target: null };
  }
}

/* --- small formatters ----------------------------------------------------- */

export function relativeTime(ts: number | null): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function duration(from: number | null, to: number | null): string {
  if (!from) return '';
  const ms = (to ?? Date.now()) - from;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return '—';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

/** Two-letter mark for a project chip. */
export function initials(name: string): string {
  const parts = name.split(/[\s_\-.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${(parts[0] as string)[0] ?? ''}${(parts[1] as string)[0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
