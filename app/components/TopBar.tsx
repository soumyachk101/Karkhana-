'use client';

import { useState } from 'react';
import type { Theme } from '@/lib/theme';
import { BrandMark, Icon } from './ui/icons.tsx';
import { IconButton, Kbd } from './ui/primitives.tsx';

type Props = {
  running: number;
  queued: number;
  limit: number;
  connected: boolean;
  binaryOk: boolean;
  binaryReason?: string;
  orphanCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  onChangeLimit: (limit: number) => void;
  onShowCleanup: () => void;
  onOpenPalette: () => void;
};

/** One pip per concurrency slot — capacity at a glance, no arithmetic. */
function CapacityMeter({ running, limit }: { running: number; limit: number }) {
  const pips = Array.from({ length: Math.min(limit, 16) }, (_, i) => i < running);
  return (
    <span className="flex items-center gap-[3px]">
      {pips.map((filled, i) => (
        <span
          key={i}
          className={`h-3 w-[3px] rounded-full ${
            filled ? 'animate-live bg-forge-500' : 'bg-ink-600'
          }`}
          style={filled ? { animationDelay: `${i * 0.12}s` } : undefined}
        />
      ))}
    </span>
  );
}

export function TopBar({
  running,
  queued,
  limit,
  connected,
  binaryOk,
  binaryReason,
  orphanCount,
  theme,
  onToggleTheme,
  onChangeLimit,
  onShowCleanup,
  onOpenPalette,
}: Props) {
  const [editing, setEditing] = useState(false);
  const atCapacity = running >= limit && limit > 0;

  return (
    <header className="glass hairline z-30 flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 px-3">
      <div className="flex items-center gap-2">
        <BrandMark size={20} />
        <span className="font-serif text-[16px] font-semibold tracking-tight text-ink-50">
          Karkhana
        </span>
        <span className="hidden text-[11px] text-ink-400 sm:inline">कारख़ाना</span>
      </div>

      <span className="h-5 w-px bg-ink-700" />

      <div
        className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800/70 px-2.5 py-1"
        title="Agents running against the concurrency limit"
      >
        <CapacityMeter running={running} limit={limit} />
        <span className="text-[12px] tabular-nums">
          <span className={atCapacity ? 'font-medium text-forge-500' : 'text-ink-100'}>{running}</span>
          <span className="text-ink-500"> / </span>
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
              className="w-11 rounded bg-ink-700 px-1 text-center text-ink-50 outline-none"
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
        <span className="text-[10.5px] uppercase tracking-wider text-ink-500">agents</span>
      </div>

      {queued > 0 && (
        <span className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/70 px-2 py-1 text-[11.5px] text-ink-300">
          <Icon name="clock" size={12} className="text-ink-400" />
          <span className="tabular-nums text-ink-100">{queued}</span> queued
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenPalette}
        className="hidden items-center gap-2 rounded-md border border-ink-700 bg-ink-800/70 py-1 pl-2 pr-1.5 text-[11.5px] text-ink-400 transition-colors hover:border-ink-500 hover:text-ink-100 md:flex"
      >
        <Icon name="search" size={13} />
        <span>Search tasks…</span>
        <span className="flex items-center gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {orphanCount > 0 && (
        <button
          onClick={onShowCleanup}
          className="flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn transition-colors hover:bg-warn/20"
        >
          <Icon name="alert" size={12} />
          {orphanCount} orphan worktree{orphanCount === 1 ? '' : 's'}
        </button>
      )}

      {!binaryOk && (
        <span
          className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger"
          title={binaryReason}
        >
          <Icon name="alert" size={12} />
          Claude binary not found
        </span>
      )}

      <span
        className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800/70 px-2 py-1 text-[11px] text-ink-400"
        title={connected ? 'Live — streaming over the WebSocket' : 'Reconnecting…'}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-ok' : 'animate-live bg-danger'}`}
        />
        {connected ? 'live' : 'offline'}
      </span>

      <IconButton
        icon={theme === 'dark' ? 'sun' : 'moon'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      />
    </header>
  );
}
