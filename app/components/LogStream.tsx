'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toLogLines, type LogLine } from '@/lib/format';
import type { TaskEvent } from '@/lib/types';

const KIND_STYLE: Record<LogLine['kind'], string> = {
  text: 'text-ink-100',
  thinking: 'text-ink-400 italic',
  tool_use: 'text-sky-300',
  tool_result: 'text-ink-300',
  meta: 'text-ink-400',
  error: 'text-red-300',
  result: 'text-emerald-300',
};

const KIND_LABEL: Record<LogLine['kind'], string> = {
  text: '',
  thinking: 'thinking',
  tool_use: '',
  tool_result: '←',
  meta: '',
  error: '!',
  result: '✓',
};

export function LogStream({ events, live }: { events: TaskEvent[]; live: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showThinking, setShowThinking] = useState(false);

  // Follow the tail only while the user is already at the bottom — yanking the
  // view back down while they're reading history is worse than not following.
  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [events.length, pinned]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const lines = events.flatMap((event) =>
    toLogLines(event).map((line, i) => ({ ...line, key: `${event.id}-${i}`, ts: event.ts })),
  );
  const visible = showThinking ? lines : lines.filter((l) => l.kind !== 'thinking');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-700 px-2.5 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Log</span>
        <span className="tabular-nums text-[11px] text-ink-500">{visible.length} lines</span>
        <div className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-ink-400 hover:text-ink-200">
          <input
            type="checkbox"
            checked={showThinking}
            onChange={(e) => setShowThinking(e.target.checked)}
            className="h-3 w-3 accent-forge-500 outline-none focus-visible:ring-2 focus-visible:ring-forge-500/60"
          />
          thinking
        </label>
        {!pinned && (
          <button
            onClick={() => {
              setPinned(true);
              bottomRef.current?.scrollIntoView({ block: 'end' });
            }}
            className="animate-pop flex items-center gap-1 rounded-md bg-ink-700 px-2 py-1 text-[10px] text-ink-200 outline-none transition-colors hover:bg-ink-600 focus-visible:ring-2 focus-visible:ring-forge-500/60"
          >
            <ArrowDown className="h-2.5 w-2.5" strokeWidth={2.5} />
            follow
          </button>
        )}
      </div>

      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-2.5 py-1.5">
        {visible.length === 0 && (
          <p className="py-6 text-center text-[11px] text-ink-500">
            {live ? 'Waiting for the agent to start…' : 'No output.'}
          </p>
        )}

        {visible.map((line) => (
          <div key={line.key} className="flex gap-2 py-[3px] font-mono text-[11px] leading-relaxed">
            <span className="w-14 shrink-0 select-none text-right text-ink-600 tabular-nums">
              {new Date(line.ts).toLocaleTimeString('en-GB', { hour12: false })}
            </span>
            {(line.label || KIND_LABEL[line.kind]) && (
              <span className={`w-16 shrink-0 truncate text-right ${KIND_STYLE[line.kind]} opacity-80`}>
                {line.label ?? KIND_LABEL[line.kind]}
              </span>
            )}
            <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${KIND_STYLE[line.kind]}`}>
              {line.body}
              {line.detail && <span className="ml-2 text-ink-500">{line.detail}</span>}
            </span>
          </div>
        ))}

        {live && (
          <div className="flex gap-2 py-1 font-mono text-[11px] text-forge-500">
            <span className="w-14" />
            <span className="animate-live [text-shadow:0_0_6px_var(--color-forge-500)]">▌</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
