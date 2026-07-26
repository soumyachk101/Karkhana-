'use client';

import { useState } from 'react';

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
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-850 px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tracking-tight text-forge-500">Karkhana</span>
        <span className="text-[11px] text-ink-400">कारख़ाना</span>
      </div>

      <div className="flex items-center gap-2 rounded border border-ink-600 bg-ink-800 px-2.5 py-1">
        <span
          className={`h-1.5 w-1.5 rounded-full ${running > 0 ? 'bg-forge-500 animate-live' : 'bg-ink-500'}`}
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
              className="w-10 rounded bg-ink-700 px-1 text-center text-ink-50 outline-none"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-ink-200 underline decoration-ink-500 decoration-dotted underline-offset-2 hover:text-ink-50"
              title="Concurrency limit — click to change"
            >
              {limit}
            </button>
          )}
        </span>
        <span className="text-[11px] text-ink-400">agents</span>
      </div>

      {queued > 0 && (
        <span className="text-[12px] text-ink-300">
          <span className="tabular-nums text-ink-100">{queued}</span> queued
        </span>
      )}

      <div className="flex-1" />

      {orphanCount > 0 && (
        <button
          onClick={onShowCleanup}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20"
        >
          {orphanCount} orphan worktree{orphanCount === 1 ? '' : 's'}
        </button>
      )}

      {!binaryOk && (
        <span
          className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
          title={binaryReason}
        >
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
