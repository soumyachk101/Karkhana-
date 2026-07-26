'use client';

import { AlertCircle, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

/** Inline brand mark — the same three-bars-lit concept as app/icon.svg, so the
 * identity shows up in the product itself, not just the browser tab. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-ink-800)" />
      <rect x="7" y="8" width="4" height="16" rx="1.5" fill="var(--color-ink-400)" />
      <rect x="14" y="5" width="4" height="22" rx="1.5" fill="var(--color-forge-500)" />
      <rect x="21" y="8" width="4" height="16" rx="1.5" fill="var(--color-ink-400)" />
    </svg>
  );
}

type Props = {
  running: number;
  queued: number;
  limit: number;
  connected: boolean;
  binaryOk: boolean;
  binaryReason?: string;
  orphanCount: number;
  onChangeLimit: (limit: number) => void;
  onShowCleanup: () => void;
};

export function TopBar({
  running,
  queued,
  limit,
  connected,
  binaryOk,
  binaryReason,
  orphanCount,
  onChangeLimit,
  onShowCleanup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const atCapacity = running >= limit && limit > 0;

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-4 border-b border-ink-700/80 bg-ink-850 px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.4),0_4px_16px_-4px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2">
        <Mark />
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[16px] font-semibold tracking-tight text-forge-500">Karkhana</span>
          <span className="text-[11px] text-ink-400">कारख़ाना</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-800/60 px-2.5 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <SlidersHorizontal className="h-3 w-3 text-ink-400" strokeWidth={2.25} />
        <span
          className={`h-1.5 w-1.5 rounded-full ${running > 0 ? 'bg-forge-500 animate-live animate-ember' : 'bg-ink-500'}`}
        />
        <span className="text-[12px] tabular-nums">
          <span className={atCapacity ? 'text-forge-400' : 'text-ink-100'}>{running}</span>
          <span className="text-ink-400"> / </span>
          {editing ? (
            <input
              autoFocus
              type="number"
              min={1}
              max={16}
              defaultValue={limit}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (next >= 1 && next !== limit) onChangeLimit(next);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-10 rounded bg-ink-700 px-1 text-center text-ink-50 outline-none focus-visible:ring-2 focus-visible:ring-forge-500/70"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded text-ink-200 underline decoration-ink-500 decoration-dotted underline-offset-2 outline-none hover:text-ink-50 focus-visible:ring-2 focus-visible:ring-forge-500/70"
              title="Concurrency limit — click to change"
            >
              {limit}
            </button>
          )}
        </span>
        <span className="text-[11px] text-ink-400">agents</span>
      </div>

      {queued > 0 && (
        <span className="animate-rise text-[12px] text-ink-300">
          <span className="tabular-nums text-ink-100">{queued}</span> queued
        </span>
      )}

      <div className="flex-1" />

      {orphanCount > 0 && (
        <button
          onClick={onShowCleanup}
          className="animate-rise flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300 outline-none transition hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-amber-400/70 active:scale-[0.97]"
        >
          <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
          {orphanCount} orphan worktree{orphanCount === 1 ? '' : 's'}
        </button>
      )}

      {!binaryOk && (
        <span
          className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300"
          title={binaryReason}
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2.25} />
          Claude binary not found
        </span>
      )}

      <span className="flex items-center gap-1.5 text-[11px] text-ink-400" title={connected ? 'Live' : 'Reconnecting…'}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400 animate-live'}`} />
        {connected ? 'live' : 'offline'}
      </span>
    </header>
  );
}
