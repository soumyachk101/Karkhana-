'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collapseCarriageReturns, parseAnsi, stripAnsi } from '@/lib/ansi';
import { clockTime, toLogLines, type LogLine } from '@/lib/format';
import type { Task, TaskEvent } from '@/lib/types';
import { Icon } from './ui/icons.tsx';
import { Badge, Button, IconButton, PaneHeader, Segmented } from './ui/primitives.tsx';

/* --- rows ----------------------------------------------------------------- */

type RowKind = LogLine['kind'] | 'command' | 'stdout' | 'stderr' | 'note';

type Row = {
  key: string;
  ts: number;
  kind: RowKind;
  label?: string;
  text: string;
  /** Local rows come from the command prompt, not the agent stream. */
  local?: boolean;
};

const KIND_TEXT: Record<RowKind, string> = {
  text: 'text-ink-100',
  thinking: 'text-ink-400 italic',
  tool_use: 'text-info',
  tool_result: 'text-ink-300',
  meta: 'text-ink-400',
  error: 'text-danger',
  result: 'text-ok',
  command: 'text-forge-500 font-medium',
  stdout: 'text-ink-200',
  stderr: 'text-danger',
  note: 'text-ink-500 italic',
};

const KIND_MARK: Record<RowKind, string> = {
  text: '',
  thinking: '~',
  tool_use: '▸',
  tool_result: '←',
  meta: '·',
  error: '✕',
  result: '✓',
  command: '❯',
  stdout: '',
  stderr: '!',
  note: '·',
};

type FilterId = 'all' | 'output' | 'tools' | 'errors' | 'shell';

const FILTERS: { value: FilterId; label: string; title: string }[] = [
  { value: 'all', label: 'All', title: 'Every line' },
  { value: 'output', label: 'Text', title: 'Assistant text and results' },
  { value: 'tools', label: 'Tools', title: 'Tool calls and their results' },
  { value: 'errors', label: 'Errors', title: 'stderr and failures' },
  { value: 'shell', label: 'Shell', title: 'Commands you ran here' },
];

function matchesFilter(kind: RowKind, filter: FilterId): boolean {
  switch (filter) {
    case 'output':
      return kind === 'text' || kind === 'result' || kind === 'thinking';
    case 'tools':
      return kind === 'tool_use' || kind === 'tool_result';
    case 'errors':
      return kind === 'error' || kind === 'stderr';
    case 'shell':
      return kind === 'command' || kind === 'stdout' || kind === 'stderr' || kind === 'note';
    default:
      return true;
  }
}

/** ANSI segments, with search hits wrapped in <mark>. */
function Line({ text, query }: { text: string; query: string }) {
  const segments = useMemo(() => parseAnsi(text), [text]);
  const needle = query.toLowerCase();

  return (
    <>
      {segments.map((segment, i) => {
        if (!needle) {
          return (
            <span key={i} className={segment.className} style={segment.color ? { color: segment.color } : undefined}>
              {segment.text}
            </span>
          );
        }
        const parts: React.ReactNode[] = [];
        const haystack = segment.text.toLowerCase();
        let cursor = 0;
        let hit = haystack.indexOf(needle);
        while (hit !== -1) {
          if (hit > cursor) parts.push(segment.text.slice(cursor, hit));
          parts.push(
            <mark key={`${i}-${hit}`} className="rounded-sm bg-forge-500/35 px-px text-ink-50">
              {segment.text.slice(hit, hit + needle.length)}
            </mark>,
          );
          cursor = hit + needle.length;
          hit = haystack.indexOf(needle, cursor);
        }
        if (cursor < segment.text.length) parts.push(segment.text.slice(cursor));
        return (
          <span key={i} className={segment.className} style={segment.color ? { color: segment.color } : undefined}>
            {parts}
          </span>
        );
      })}
    </>
  );
}

/* --- pane ----------------------------------------------------------------- */

const HISTORY_KEY = 'karkhana:shell-history';
const QUICK_COMMANDS = ['git status -sb', 'git diff --stat', 'git log --oneline -10', 'ls -la'];

export function Terminal({
  task,
  events,
  live,
  fullscreen = false,
  onToggleFullscreen,
}: {
  task: Task;
  events: TaskEvent[];
  live: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pinned, setPinned] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const [localRows, setLocalRows] = useState<Row[]>([]);
  const [clearedAt, setClearedAt] = useState(0);
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved) as string[]);
    } catch {
      /* history is a nicety; never let it break the pane */
    }
  }, []);

  /* Stream rows: one row per physical line, so search, wrapping, and the
     timestamp gutter all line up with what a terminal would show. */
  const streamRows = useMemo(() => {
    const rows: Row[] = [];
    for (const event of events) {
      toLogLines(event).forEach((line, lineIndex) => {
        const body = collapseCarriageReturns(
          line.detail ? `${line.body} ${line.detail}` : line.body,
        );
        body.split('\n').forEach((text, i) => {
          rows.push({
            key: `${event.id}-${lineIndex}-${i}`,
            ts: event.ts,
            kind: line.kind,
            label: i === 0 ? line.label : undefined,
            text,
          });
        });
      });
    }
    return rows;
  }, [events]);

  const rows = useMemo(() => {
    const merged = [...streamRows, ...localRows]
      .filter((row) => row.ts >= clearedAt)
      .sort((a, b) => a.ts - b.ts);
    return merged.filter((row) => matchesFilter(row.kind, filter));
  }, [streamRows, localRows, clearedAt, filter]);

  const visible = useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.toLowerCase();
    return rows.filter((row) => row.text.toLowerCase().includes(needle));
  }, [rows, query]);

  const matchCount = query.trim() ? visible.length : 0;

  useEffect(() => {
    if (pinned && !query) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [visible.length, pinned, query]);

  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  const jumpToMatch = useCallback(
    (next: number) => {
      if (!matchCount) return;
      const index = (next + matchCount) % matchCount;
      setMatchIndex(index);
      const row = visible[index];
      if (!row) return;
      scrollerRef.current
        ?.querySelector(`[data-row="${CSS.escape(row.key)}"]`)
        ?.scrollIntoView({ block: 'center' });
    },
    [matchCount, visible],
  );

  const appendLocal = useCallback((rows: Omit<Row, 'key' | 'local'>[]) => {
    setLocalRows((prev) => {
      const base = Date.now();
      return [
        ...prev,
        ...rows.map((row, i) => ({
          ...row,
          // Local rows share a millisecond; nudge each so the merge sort keeps
          // them in the order they were produced.
          ts: row.ts + i,
          key: `local-${base}-${prev.length + i}`,
          local: true,
        })),
      ];
    });
  }, []);

  const execute = useCallback(
    async (raw: string) => {
      const input = raw.trim();
      if (!input || running) return;

      setHistory((prev) => {
        const next = [...prev.filter((c) => c !== input), input].slice(-80);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      setHistoryIndex(-1);
      setCommand('');

      const now = Date.now();

      if (input === 'clear' || input === 'cls') {
        setLocalRows([]);
        setClearedAt(Date.now());
        return;
      }
      if (input === 'help') {
        appendLocal([
          { ts: now, kind: 'command', text: input },
          {
            ts: now,
            kind: 'note',
            text:
              'Commands run through `bash -lc` in this task\'s worktree — never the project\'s main tree.\n' +
              'Each run is independent: no shell state carries over, and stdin is closed.\n' +
              'Built-ins: clear · help   Keys: ↑/↓ history · Ctrl+L clear · / search',
          },
        ]);
        return;
      }

      appendLocal([{ ts: now, kind: 'command', text: input }]);
      setRunning(true);
      setPinned(true);

      try {
        const res = await fetch(`/api/tasks/${task.id}/exec`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command: input }),
        });
        const body = (await res.json()) as {
          error?: string;
          stdout?: string;
          stderr?: string;
          exitCode?: number | null;
          signal?: string | null;
          durationMs?: number;
          truncated?: boolean;
          timedOut?: boolean;
        };

        const stamp = Date.now();
        if (!res.ok || body.error) {
          appendLocal([{ ts: stamp, kind: 'stderr', text: body.error ?? `Request failed (${res.status})` }]);
          return;
        }

        const out: Omit<Row, 'key' | 'local'>[] = [];
        if (body.stdout) {
          for (const line of collapseCarriageReturns(body.stdout).replace(/\n$/, '').split('\n')) {
            out.push({ ts: stamp, kind: 'stdout', text: line });
          }
        }
        if (body.stderr) {
          for (const line of collapseCarriageReturns(body.stderr).replace(/\n$/, '').split('\n')) {
            out.push({ ts: stamp, kind: 'stderr', text: line });
          }
        }
        const notes: string[] = [];
        if (body.timedOut) notes.push('timed out — process group killed');
        if (body.truncated) notes.push('output truncated');
        if (body.signal) notes.push(`signal ${body.signal}`);
        notes.push(`exit ${body.exitCode ?? '—'} · ${body.durationMs ?? 0}ms`);
        out.push({ ts: stamp, kind: 'note', text: notes.join(' · ') });

        appendLocal(out);
      } catch (err) {
        appendLocal([{ ts: Date.now(), kind: 'stderr', text: (err as Error).message }]);
      } finally {
        setRunning(false);
        inputRef.current?.focus();
      }
    },
    [appendLocal, running, task.id],
  );

  const plainText = useMemo(
    () =>
      rows
        .map((row) => `${clockTime(row.ts)}  ${row.label ? `[${row.label}] ` : ''}${stripAnsi(row.text)}`)
        .join('\n'),
    [rows],
  );

  const download = () => {
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `karkhana-${task.id.slice(0, 8)}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const canExec = Boolean(task.worktree_path);
  const shellLabel = task.worktree_path?.split('/').slice(-1)[0] ?? 'no worktree';

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-900">
      <PaneHeader icon="terminal" title="Terminal" meta={`${rows.length} lines`}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} size="xs" />
        <span className="mx-0.5 h-4 w-px bg-ink-700" />
        <IconButton
          icon="search"
          title="Search (/)"
          size="xs"
          active={searching}
          onClick={() => {
            setSearching((v) => !v);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
        />
        <IconButton
          icon="wrap"
          title={wrap ? 'Disable wrapping' : 'Wrap long lines'}
          size="xs"
          active={wrap}
          onClick={() => setWrap((v) => !v)}
        />
        <IconButton
          icon="clock"
          title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
          size="xs"
          active={showTimestamps}
          onClick={() => setShowTimestamps((v) => !v)}
        />
        <IconButton icon="download" title="Download log" size="xs" onClick={download} />
        <IconButton
          icon="trash"
          title="Clear view (Ctrl+L) — history stays on disk"
          size="xs"
          onClick={() => {
            setLocalRows([]);
            setClearedAt(Date.now());
          }}
        />
        {onToggleFullscreen && (
          <IconButton
            icon={fullscreen ? 'minimize' : 'maximize'}
            title={fullscreen ? 'Restore layout' : 'Fullscreen terminal'}
            size="xs"
            onClick={onToggleFullscreen}
          />
        )}
      </PaneHeader>

      {searching && (
        <div className="flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-850/60 px-2.5 py-1.5">
          <Icon name="search" size={12} className="text-ink-500" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') jumpToMatch(matchIndex + (e.shiftKey ? -1 : 1));
              if (e.key === 'Escape') {
                setQuery('');
                setSearching(false);
              }
            }}
            placeholder="Filter lines…"
            className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-ink-100 placeholder-ink-500 outline-none"
          />
          <span className="font-mono text-[10.5px] text-ink-400 tabular-nums">
            {query ? `${matchCount ? matchIndex + 1 : 0}/${matchCount}` : ''}
          </span>
          <IconButton icon="chevronUp" title="Previous match" size="xs" onClick={() => jumpToMatch(matchIndex - 1)} />
          <IconButton icon="chevronDown" title="Next match" size="xs" onClick={() => jumpToMatch(matchIndex + 1)} />
          <IconButton
            icon="close"
            title="Close search"
            size="xs"
            onClick={() => {
              setQuery('');
              setSearching(false);
            }}
          />
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            setLocalRows([]);
            setClearedAt(Date.now());
          }
        }}
        className="min-h-0 flex-1 overflow-auto px-2.5 py-2 font-mono text-[11.5px] leading-[1.6]"
        tabIndex={-1}
      >
        {visible.length === 0 && (
          <p className="py-8 text-center text-[11.5px] text-ink-500">
            {query
              ? `Nothing matches “${query}”.`
              : live
                ? 'Waiting for the agent to start…'
                : filter === 'all'
                  ? 'No output.'
                  : 'No lines of this kind.'}
          </p>
        )}

        {visible.map((row, index) => (
          <div
            key={row.key}
            data-row={row.key}
            className={`flex gap-2 ${
              query && index === matchIndex ? 'rounded-sm bg-forge-500/10 ring-1 ring-forge-500/30' : ''
            }`}
          >
            {showTimestamps && (
              <span className="w-[62px] shrink-0 select-none text-right text-ink-600 tabular-nums">
                {clockTime(row.ts)}
              </span>
            )}
            <span className={`w-3 shrink-0 select-none text-center opacity-70 ${KIND_TEXT[row.kind]}`}>
              {KIND_MARK[row.kind]}
            </span>
            {row.label && (
              <span className={`w-20 shrink-0 truncate text-right opacity-80 ${KIND_TEXT[row.kind]}`}>
                {row.label}
              </span>
            )}
            <span
              className={`min-w-0 flex-1 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${KIND_TEXT[row.kind]}`}
            >
              <Line text={row.text} query={query} />
            </span>
          </div>
        ))}

        {live && (
          <div className="flex gap-2 pt-0.5 text-forge-500">
            {showTimestamps && <span className="w-[62px]" />}
            <span className="animate-caret">▌</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* prompt */}
      <div className="shrink-0 border-t border-ink-700 bg-ink-850/70">
        <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
          {QUICK_COMMANDS.map((quick) => (
            <button
              key={quick}
              onClick={() => void execute(quick)}
              disabled={!canExec || running}
              className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 transition-colors hover:border-forge-500/40 hover:text-ink-100 disabled:opacity-40"
            >
              {quick}
            </button>
          ))}
          <span className="flex-1" />
          {!pinned && (
            <Button
              size="xs"
              tone="ghost"
              icon="arrowDown"
              onClick={() => {
                setPinned(true);
                bottomRef.current?.scrollIntoView({ block: 'end' });
              }}
            >
              follow
            </Button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void execute(command);
          }}
          className="flex items-center gap-2 px-2.5 py-2"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-ok">
            <Icon name="branch" size={12} className="text-ink-500" />
            <span className="max-w-[160px] truncate text-ink-400">{shellLabel}</span>
            <span className="text-forge-500">❯</span>
          </span>
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={!canExec}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
                if (history[next] !== undefined) {
                  setHistoryIndex(next);
                  setCommand(history[next] as string);
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex < 0) return;
                const next = historyIndex + 1;
                if (next >= history.length) {
                  setHistoryIndex(-1);
                  setCommand('');
                } else {
                  setHistoryIndex(next);
                  setCommand(history[next] as string);
                }
              } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                setLocalRows([]);
                setClearedAt(Date.now());
              } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
                setCommand('');
              }
            }}
            placeholder={
              canExec ? 'Run a command in this worktree…' : 'No worktree — nothing to run against'
            }
            className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-ink-100 placeholder-ink-500 outline-none disabled:cursor-not-allowed"
          />
          {running && <Badge tone="accent">running</Badge>}
          <Button
            type="submit"
            size="xs"
            tone="primary"
            icon="send"
            busy={running}
            disabled={!canExec || !command.trim()}
          >
            Run
          </Button>
        </form>
      </div>
    </div>
  );
}
