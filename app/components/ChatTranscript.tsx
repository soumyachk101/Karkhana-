'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTranscript,
  clockTime,
  formatCost,
  formatCount,
  formatDurationMs,
  presentTool,
  type ToolCall,
  type TranscriptItem,
} from '@/lib/format';
import { languageFromPath } from '@/lib/highlight';
import type { Task, TaskEvent } from '@/lib/types';
import { Markdown } from './Markdown.tsx';
import { CodeBlock } from './ui/CodeBlock.tsx';
import { Icon } from './ui/icons.tsx';
import { Badge, CopyButton, IconButton, PaneHeader } from './ui/primitives.tsx';

/* --- tool call ------------------------------------------------------------ */

function EditPreview({ before, after }: { before: string; after: string }) {
  const rows = [
    ...before.split('\n').map((line) => ({ sign: '-', line })),
    ...after.split('\n').map((line) => ({ sign: '+', line })),
  ];
  return (
    <pre className="overflow-x-auto rounded-md border border-ink-700 bg-ink-900/70 px-2.5 py-2 font-mono text-[11.5px] leading-[1.55]">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex gap-2 ${row.sign === '+' ? 'bg-ok/8 text-ok' : 'bg-danger/8 text-danger'}`}
        >
          <span className="select-none opacity-60">{row.sign}</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{row.line || ' '}</span>
        </div>
      ))}
    </pre>
  );
}

function ToolResultBody({ text, isError }: { text: string; isError: boolean }) {
  const lines = text.split('\n');
  const [expanded, setExpanded] = useState(false);
  const clipped = !expanded && lines.length > 12;

  return (
    <div
      className={`overflow-hidden rounded-md border ${isError ? 'border-danger/30 bg-danger/5' : 'border-ink-700 bg-ink-900/60'}`}
    >
      <pre
        className={`overflow-x-auto px-2.5 py-2 font-mono text-[11.5px] leading-[1.55] ${isError ? 'text-danger' : 'text-ink-300'}`}
      >
        {(clipped ? lines.slice(0, 12) : lines).map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            {line || ' '}
          </div>
        ))}
      </pre>
      {lines.length > 12 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-ink-700 py-1 text-[10.5px] text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
          {expanded ? 'Collapse output' : `${lines.length - 12} more lines`}
        </button>
      )}
    </div>
  );
}

function ToolCard({ call, defaultOpen }: { call: ToolCall; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const presentation = presentTool(call);
  const pending = !call.result;
  const failed = call.result?.isError ?? false;

  const isEdit = call.name === 'Edit' || call.name === 'MultiEdit';
  const before = typeof call.input.old_string === 'string' ? call.input.old_string : '';
  const after = typeof call.input.new_string === 'string' ? call.input.new_string : '';

  return (
    <div
      className={`overflow-hidden rounded-lg border transition-colors ${
        failed ? 'border-danger/35 bg-danger/5' : 'border-ink-700 bg-ink-850/60'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ink-800/60"
      >
        <Icon
          name="chevronRight"
          size={12}
          className={`text-ink-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <span
          className={`flex h-5 w-5 items-center justify-center rounded ${
            failed ? 'bg-danger/15 text-danger' : 'bg-ink-700/70 text-ink-200'
          }`}
        >
          <Icon name={presentation.icon} size={12} />
        </span>
        <span className="font-mono text-[11.5px] font-medium text-ink-100">{call.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-400">
          {presentation.target || call.summary}
        </span>
        {pending ? (
          <span className="animate-live text-[10px] text-forge-500">running…</span>
        ) : failed ? (
          <Badge tone="danger">error</Badge>
        ) : (
          <Icon name="check" size={12} className="text-ok/70" />
        )}
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-ink-700/70 px-2.5 py-2">
          {isEdit && (before || after) ? (
            <EditPreview before={before} after={after} />
          ) : presentation.body ? (
            <CodeBlock
              code={presentation.body}
              lang={
                presentation.language ??
                languageFromPath(presentation.target ?? undefined) ??
                undefined
              }
              collapseAfter={14}
            />
          ) : (
            <p className="font-mono text-[11px] text-ink-400">{call.summary || 'no arguments'}</p>
          )}

          {call.result && <ToolResultBody text={call.result.text} isError={call.result.isError} />}
        </div>
      )}
    </div>
  );
}

/* --- items ---------------------------------------------------------------- */

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const words = text.trim().split(/\s+/).length;
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-850/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-ink-400 hover:text-ink-200"
      >
        <Icon name="brain" size={13} />
        <span className="text-[11.5px] italic">Thought for {words} words</span>
        <span className="flex-1" />
        <Icon
          name="chevronRight"
          size={12}
          className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <p className="whitespace-pre-wrap break-words border-t border-ink-700/70 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-400 italic">
          {text}
        </p>
      )}
    </div>
  );
}

function ResultCard({
  item,
}: {
  item: Extract<TranscriptItem, { kind: 'result' }>;
}) {
  const stats: [string, string][] = [
    ['duration', formatDurationMs(item.durationMs)],
    ['turns', item.turns === null ? '—' : String(item.turns)],
    ['cost', formatCost(item.costUsd)],
    ['tokens', `${formatCount(item.inputTokens)} in · ${formatCount(item.outputTokens)} out`],
  ];

  return (
    <div
      className={`overflow-hidden rounded-lg border ${item.ok ? 'border-ok/30 bg-ok/5' : 'border-danger/35 bg-danger/5'}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Icon name={item.ok ? 'checkCircle' : 'alert'} size={14} className={item.ok ? 'text-ok' : 'text-danger'} />
        <span className={`text-[12px] font-medium ${item.ok ? 'text-ok' : 'text-danger'}`}>
          {item.ok ? 'Run complete' : 'Run failed'}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-ink-500">{clockTime(item.ts)}</span>
      </div>

      {item.text && (
        <div className="border-t border-ink-700/60 px-3 py-2">
          <Markdown source={item.text} />
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700/60 px-3 py-1.5">
        {stats.map(([label, value]) => (
          <span key={label} className="text-[10.5px] text-ink-400">
            {label} <span className="font-medium text-ink-200 tabular-nums">{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({ item, expandTools }: { item: TranscriptItem; expandTools: boolean }) {
  switch (item.kind) {
    case 'session':
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="h-px flex-1 bg-ink-700" />
          <span className="flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 font-mono text-[10px] text-ink-400">
            <Icon name="spark" size={11} className="text-forge-500" />
            {item.model}
            <span className="text-ink-600">·</span>
            {item.tools} tools
            {item.permission && (
              <>
                <span className="text-ink-600">·</span>
                {item.permission}
              </>
            )}
          </span>
          <span className="h-px flex-1 bg-ink-700" />
        </div>
      );

    case 'user':
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-xl rounded-br-sm border border-ink-600 bg-ink-800 px-3 py-2 shadow-card">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-400">
              <Icon name="user" size={11} />
              {item.resumed ? 'Follow-up' : 'Prompt'}
              <span className="text-ink-600">·</span>
              <span className="font-mono normal-case tracking-normal">{clockTime(item.ts)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.6] text-ink-100">
              {item.text}
            </p>
          </div>
        </div>
      );

    case 'assistant':
      return (
        <div className="flex gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-forge-500/30 bg-forge-500/12 text-forge-500">
            <Icon name="sparkles" size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <Markdown source={item.text} />
          </div>
        </div>
      );

    case 'thinking':
      return (
        <div className="pl-8.5">
          <ThinkingBlock text={item.text} />
        </div>
      );

    case 'tool':
      return (
        <div className="pl-8.5">
          <ToolCard call={item.call} defaultOpen={expandTools} />
        </div>
      );

    case 'result':
      return <ResultCard item={item} />;

    default:
      return (
        <div
          className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] ${
            item.tone === 'error'
              ? 'border-danger/30 bg-danger/5 text-danger'
              : 'border-ink-700 bg-ink-850/50 text-ink-400'
          }`}
        >
          <Icon name={item.tone === 'error' ? 'alert' : 'info'} size={12} className="mt-0.5" />
          <span className="shrink-0 uppercase tracking-wider opacity-70">{item.label}</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.text}</span>
        </div>
      );
  }
}

/* --- pane ----------------------------------------------------------------- */

export function ChatTranscript({
  task,
  events,
  live,
}: {
  task: Task;
  events: TaskEvent[];
  live: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [expandTools, setExpandTools] = useState(false);

  const items = useMemo(() => buildTranscript(events), [events]);

  // Tasks dispatched before the runner recorded prompts have no user turn in
  // their history — fall back to the task row so the conversation still opens
  // with what was asked.
  const hasUserTurn = items.some((item) => item.kind === 'user');
  const visible = useMemo(
    () => (showThinking ? items : items.filter((item) => item.kind !== 'thinking')),
    [items, showThinking],
  );

  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [visible.length, pinned]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const plainText = useMemo(
    () =>
      items
        .map((item) => {
          if (item.kind === 'assistant') return item.text;
          if (item.kind === 'user') return `> ${item.text}`;
          if (item.kind === 'tool') return `[${item.call.name}] ${item.call.summary}`;
          if (item.kind === 'result') return `--- ${item.ok ? 'done' : 'failed'} ---\n${item.text}`;
          return '';
        })
        .filter(Boolean)
        .join('\n\n'),
    [items],
  );

  const toolCount = items.filter((item) => item.kind === 'tool').length;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-ink-900">
      <PaneHeader
        icon="chat"
        title="Conversation"
        meta={`${items.filter((i) => i.kind === 'assistant').length} replies · ${toolCount} tool calls`}
      >
        <IconButton
          icon={showThinking ? 'eye' : 'eyeOff'}
          title={showThinking ? 'Hide thinking' : 'Show thinking'}
          active={showThinking}
          size="xs"
          onClick={() => setShowThinking((v) => !v)}
        />
        <IconButton
          icon="list"
          title={expandTools ? 'Collapse tool calls' : 'Expand tool calls'}
          active={expandTools}
          size="xs"
          onClick={() => setExpandTools((v) => !v)}
        />
        <CopyButton text={plainText} size="xs" title="Copy transcript" />
      </PaneHeader>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
      >
        {!hasUserTurn && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-xl rounded-br-sm border border-ink-600 bg-ink-800 px-3 py-2 shadow-card">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-400">
                <Icon name="user" size={11} />
                Prompt
              </div>
              <p className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.6] text-ink-100">
                {task.prompt}
              </p>
            </div>
          </div>
        )}

        {visible.map((item) => (
          <div key={item.key} className="animate-rise">
            <Row item={item} expandTools={expandTools} />
          </div>
        ))}

        {live && (
          <div className="flex items-center gap-2.5 pt-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-forge-500/30 bg-forge-500/12 text-forge-500">
              <Icon name="sparkles" size={13} className="animate-live" />
            </span>
            <span className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="animate-live h-1.5 w-1.5 rounded-full bg-forge-500"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          </div>
        )}

        {!live && visible.length === 0 && (
          <p className="py-10 text-center text-[11.5px] text-ink-500">
            No conversation recorded for this run.
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {!pinned && (
        <button
          onClick={() => {
            setPinned(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }}
          className="animate-pop shadow-float absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800 px-3 py-1.5 text-[11px] text-ink-100 hover:border-forge-500/50"
        >
          <Icon name="arrowDown" size={12} />
          Jump to latest
        </button>
      )}
    </div>
  );
}
