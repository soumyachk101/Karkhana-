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
export const STATUS_STYLE: Record<TaskStatus, { dot: string; text: string; border: string }> = {
  queued: { dot: 'bg-ink-400', text: 'text-ink-300', border: 'border-ink-600' },
  running: { dot: 'bg-forge-500', text: 'text-forge-400', border: 'border-forge-600/50' },
  needs_review: { dot: 'bg-violet-400', text: 'text-violet-300', border: 'border-violet-500/40' },
  merged: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  failed: { dot: 'bg-red-400', text: 'text-red-300', border: 'border-red-500/40' },
  cancelled: { dot: 'bg-ink-500', text: 'text-ink-400', border: 'border-ink-700' },
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
    return [{ kind: kind.includes('fail') || kind.includes('orphan') ? 'error' : 'meta', label: kind, body: bits.join(' · ') }];
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
        body: preview(b.content, 600),
      });
    }
  }
  return lines;
}

/** One-line summary of a tool call — full paths are noise in a log pane. */
function describeToolInput(name: string, input: Record<string, unknown> | undefined): string {
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
