'use client';

import {
  ArrowDown,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  CornerDownLeft,
  FileCode,
  FileEdit,
  FileText,
  Search,
  Sparkles,
  Terminal,
  User,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { describeToolInput, toLogLines } from '@/lib/format';
import type { Task, TaskEvent } from '@/lib/types';

type Props = {
  task: Task;
  events: TaskEvent[];
  live: boolean;
  onSendFollowUp?: (prompt: string) => Promise<unknown>;
};

type FormattedTurn = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'thinking' | 'system' | 'result';
  ts: number;
  title?: string;
  content?: string;
  thinking?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  isError?: boolean;
  meta?: string;
};

export function ClaudeChatView({ task, events, live, onSendFollowUp }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const [followUpText, setFollowUpText] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  // Auto-scroll pinning with precise threshold calculation
  useEffect(() => {
    if (pinned) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [events.length, pinned]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distanceToBottom < 80);
  };

  const toggleThinking = (id: string) => {
    setThinkingOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFollowUpSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!followUpText.trim() || sendingFollowUp || !onSendFollowUp) return;
    setSendingFollowUp(true);
    try {
      await onSendFollowUp(followUpText.trim());
      setFollowUpText('');
    } catch (err) {
      console.error('Follow-up error:', err);
    } finally {
      setSendingFollowUp(false);
    }
  };

  // Group events into turns
  const turns = parseEventsToTurns(events);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-900 font-sans text-ink-100 selection:bg-forge-500/30">
      {/* Header Info */}
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700/80 bg-ink-850/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-forge-500/20 text-forge-400">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="font-display text-[13px] font-semibold text-ink-100">Claude Code Agent Session</span>
          <span className="rounded-full bg-ink-800 px-2 py-0.5 font-mono text-[10px] text-ink-300">
            {task.model}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <span className="tabular-nums font-mono">{events.length} stream frames</span>
          {!pinned && (
            <button
              onClick={() => {
                setPinned(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
              }}
              className="animate-pop flex items-center gap-1 rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-200 hover:bg-ink-600 focus:outline-none"
            >
              <ArrowDown className="h-3 w-3 text-forge-400" />
              Follow Live
            </button>
          )}
        </div>
      </div>

      {/* Main Stream Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {/* User Initial Prompt Card */}
        <div className="rounded-xl border border-forge-500/30 bg-gradient-to-b from-ink-800/90 to-ink-850/90 p-4 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2.5 border-b border-ink-700/60 pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-forge-500 text-ink-900 font-bold shadow-md shadow-forge-500/20">
              <User className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[13px] font-semibold text-ink-100">User Prompt</span>
                <span className="rounded bg-forge-500/10 px-1.5 py-0.5 font-mono text-[10px] text-forge-400">
                  {task.branch || 'task branch'}
                </span>
              </div>
              <span className="text-[11px] text-ink-400 font-mono">
                {task.created_at ? new Date(task.created_at).toLocaleTimeString() : 'Initial task'}
              </span>
            </div>
          </div>
          <div className="mt-3 font-mono text-[12px] leading-relaxed text-ink-100 whitespace-pre-wrap break-words">
            {task.prompt}
          </div>
        </div>

        {/* Turns Stream */}
        {turns.map((turn) => {
          if (turn.type === 'thinking') {
            const isOpen = thinkingOpen[turn.id] ?? false;
            return (
              <div
                key={turn.id}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 transition-all overflow-hidden"
              >
                <button
                  onClick={() => toggleThinking(turn.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-amber-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[12px] text-amber-300 font-medium">
                    <Brain className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span>Claude Thinking Process</span>
                    <span className="text-[10px] text-amber-400/70 font-mono">
                      ({turn.thinking?.length || 0} chars)
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-amber-400" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t border-amber-500/20 bg-ink-950/60 p-3 font-mono text-[11px] leading-relaxed text-ink-300 whitespace-pre-wrap break-words italic max-h-72 overflow-y-auto">
                    {turn.thinking}
                  </div>
                )}
              </div>
            );
          }

          if (turn.type === 'assistant') {
            return (
              <div key={turn.id} className="flex gap-3 pl-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-800 border border-ink-600 text-forge-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-xl border border-ink-700/60 bg-ink-850/80 p-3.5 shadow-sm">
                  <div className="text-[11px] font-medium text-ink-400 mb-1.5">Claude Assistant</div>
                  <div className="font-mono text-[12px] leading-relaxed text-ink-100 whitespace-pre-wrap break-words">
                    {turn.content}
                  </div>
                </div>
              </div>
            );
          }

          if (turn.type === 'tool') {
            return (
              <ToolCard
                key={turn.id}
                toolName={turn.toolName || 'Tool'}
                input={turn.toolInput}
                result={turn.toolResult}
                isError={turn.isError}
              />
            );
          }

          if (turn.type === 'result') {
            return (
              <div
                key={turn.id}
                className={`flex items-center gap-3 rounded-xl border p-3 font-mono text-[11px] ${
                  turn.isError
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {turn.isError ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-[12px]">{turn.title}</div>
                  {turn.content && <div className="mt-0.5 opacity-90">{turn.content}</div>}
                </div>
                {turn.meta && <span className="text-[10px] text-ink-400 opacity-75">{turn.meta}</span>}
              </div>
            );
          }

          return null;
        })}

        {/* Active execution indicator */}
        {live && (
          <div className="flex items-center gap-3 pl-1 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-forge-500/20 text-forge-400 animate-pulse">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 font-mono text-[12px] text-forge-400">
              <span className="animate-pulse">Claude is executing task commands...</span>
              <span className="inline-block h-2 w-2 rounded-full bg-forge-500 animate-ping" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Interactive Sticky Bottom Input (Follow-Up Bar) */}
      {onSendFollowUp && (
        <div className="shrink-0 border-t border-ink-700/80 bg-ink-850 p-3 shadow-2xl">
          <form onSubmit={handleFollowUpSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                placeholder={
                  live
                    ? 'Agent is currently running...'
                    : 'Type a follow-up instruction to Claude (e.g. "Fix failing tests", "Add docstrings")'
                }
                disabled={live || sendingFollowUp}
                className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 pr-10 font-mono text-[12px] text-ink-100 placeholder-ink-400 outline-none transition focus:border-forge-500 focus:ring-1 focus:ring-forge-500/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={live || !followUpText.trim() || sendingFollowUp}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-forge-500 text-ink-900 hover:bg-forge-400 disabled:opacity-30 transition-all"
                title="Send follow-up instruction"
              >
                <CornerDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            </div>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-400 font-mono">
            <span>Press Enter to send follow-up • Claude Code Interactive Session</span>
            <span>{live ? '● Live Running' : '○ Idle — Ready for prompt'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rich Tool Card Component */
function ToolCard({
  toolName,
  input,
  result,
  isError,
}: {
  toolName: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const getToolIcon = () => {
    switch (toolName) {
      case 'Bash':
        return <Terminal className="h-3.5 w-3.5 text-emerald-400" />;
      case 'Edit':
        return <FileEdit className="h-3.5 w-3.5 text-amber-400" />;
      case 'Write':
        return <FileCode className="h-3.5 w-3.5 text-sky-400" />;
      case 'Read':
        return <FileText className="h-3.5 w-3.5 text-indigo-400" />;
      case 'Glob':
      case 'Grep':
        return <Search className="h-3.5 w-3.5 text-purple-400" />;
      default:
        return <Code2 className="h-3.5 w-3.5 text-forge-400" />;
    }
  };

  const toolSummary = describeToolInput(toolName, input);

  return (
    <div className="rounded-lg border border-ink-700/80 bg-ink-950/70 overflow-hidden shadow-sm">
      {/* Tool Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="flex cursor-pointer items-center justify-between border-b border-ink-700/50 bg-ink-850/90 px-3 py-2 hover:bg-ink-800 transition-colors"
      >
        <div className="flex items-center gap-2 font-mono text-[11px]">
          {getToolIcon()}
          <span className="font-semibold text-ink-200">{toolName}</span>
          {toolSummary && <span className="text-ink-400 truncate max-w-md">{toolSummary}</span>}
        </div>
        <div className="flex items-center gap-2">
          {isError ? (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-mono text-red-300">Error</span>
          ) : (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">Done</span>
          )}
          {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-ink-400" /> : <ChevronDown className="h-3.5 w-3.5 text-ink-400" />}
        </div>
      </div>

      {/* Tool Details / Output */}
      {!collapsed && (
        <div className="p-3 space-y-2 font-mono text-[11px]">
          {/* Input block */}
          {Boolean(input && toolName === 'Bash' && input.command) && (
            <div className="rounded bg-black/50 p-2 text-emerald-300 border border-emerald-500/20">
              <span className="text-ink-500 select-none">$ </span>
              {String(input?.command)}
            </div>
          )}

          {Boolean(input && toolName === 'Edit') && (
            <div className="space-y-1">
              <div className="text-[10px] text-ink-400">Target File: <span className="text-ink-200">{String(input?.file_path)}</span></div>
              {Boolean(input?.old_string) && (
                <div className="rounded bg-red-950/30 p-2 text-red-300 border border-red-500/20 overflow-x-auto whitespace-pre">
                  - {String(input?.old_string)}
                </div>
              )}
              {Boolean(input?.new_string) && (
                <div className="rounded bg-emerald-950/30 p-2 text-emerald-300 border border-emerald-500/20 overflow-x-auto whitespace-pre">
                  + {String(input?.new_string)}
                </div>
              )}
            </div>
          )}

          {/* Result Output */}
          {result && (
            <div className="rounded bg-ink-900 p-2 text-ink-300 border border-ink-700/50 max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-[10px]">
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Parses raw TaskEvents into structured conversational turns */
function parseEventsToTurns(events: TaskEvent[]): FormattedTurn[] {
  const turns: FormattedTurn[] = [];

  for (const event of events) {
    const lines = toLogLines(event);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const turnId = `${event.id}-${i}`;

      if (line.kind === 'thinking') {
        turns.push({
          id: turnId,
          type: 'thinking',
          ts: event.ts,
          thinking: line.body,
        });
      } else if (line.kind === 'text') {
        turns.push({
          id: turnId,
          type: 'assistant',
          ts: event.ts,
          content: line.body,
        });
      } else if (line.kind === 'tool_use') {
        let input: Record<string, unknown> | undefined;
        try {
          const payload = JSON.parse(event.payload_json);
          input = payload.message?.content?.[i]?.input;
        } catch {}
        turns.push({
          id: turnId,
          type: 'tool',
          ts: event.ts,
          toolName: line.label,
          toolInput: input,
          toolResult: line.body,
        });
      } else if (line.kind === 'result' || line.kind === 'error') {
        turns.push({
          id: turnId,
          type: 'result',
          ts: event.ts,
          title: line.label || (line.kind === 'error' ? 'Failed' : 'Completed'),
          content: line.body,
          meta: line.detail,
          isError: line.kind === 'error',
        });
      }
    }
  }

  return turns;
}
