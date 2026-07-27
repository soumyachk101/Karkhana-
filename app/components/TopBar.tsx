'use client';

import { AlertCircle, AlertTriangle, FolderGit2, Key, LayoutGrid, Settings, SlidersHorizontal, Terminal } from 'lucide-react';
import Link from 'next/link';
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
  running?: number;
  queued?: number;
  limit?: number;
  connected?: boolean;
  binaryOk?: boolean;
  binaryReason?: string;
  orphanCount?: number;
  onChangeLimit?: (limit: number) => void;
  onShowCleanup?: () => void;
  onShowApiKeys?: () => void;
  activeTab?: 'hub' | 'projects' | 'terminal' | 'settings';
  projects?: unknown[];
  selectedProjectId?: string | null;
  onSelectProject?: (id: string) => void;
  onNewTask?: () => void;
  onOpenApiKeys?: () => void;
  runningCount?: number;
  queuedCount?: number;
  concurrencyLimit?: number;
};

export function TopBar({
  running = 0,
  queued = 0,
  limit = 10,
  connected = true,
  binaryOk = true,
  binaryReason,
  orphanCount = 0,
  onChangeLimit = () => {},
  onShowCleanup = () => {},
  onShowApiKeys = () => {},
  activeTab = 'hub',
  runningCount,
  queuedCount,
  concurrencyLimit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const activeRunning = runningCount ?? running;
  const activeQueued = queuedCount ?? queued;
  const activeLimit = concurrencyLimit ?? limit;
  const atCapacity = activeRunning >= activeLimit && activeLimit > 0;

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-4 border-b border-ink-700/80 bg-[#0A0D14] px-4 shadow-[0_1px_0_0_rgba(0,0,0,0.4),0_4px_16px_-4px_rgba(0,0,0,0.5)] backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2 group">
        <Mark />
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[16px] font-bold tracking-tight text-forge-500 group-hover:text-forge-400 transition">Karkhana</span>
          <span className="text-[11px] text-ink-400">कारख़ाना</span>
        </div>
      </Link>

      {/* SaaS Navigation Tabs */}
      <nav className="flex items-center gap-1 ml-4 border-l border-ink-800 pl-4 font-display text-[12px] font-medium">
        <Link
          href="/"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${
            activeTab === 'hub'
              ? 'bg-forge-500/20 text-forge-400 font-semibold border border-forge-500/40 shadow-sm'
              : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>Command Hub</span>
        </Link>

        <Link
          href="/projects"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${
            activeTab === 'projects'
              ? 'bg-forge-500/20 text-forge-400 font-semibold border border-forge-500/40 shadow-sm'
              : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
          }`}
        >
          <FolderGit2 className="h-3.5 w-3.5" />
          <span>Projects</span>
        </Link>

        <Link
          href="/terminal"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${
            activeTab === 'terminal'
              ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/40 shadow-sm'
              : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Terminal Studio</span>
        </Link>

        <Link
          href="/settings"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${
            activeTab === 'settings'
              ? 'bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/40 shadow-sm'
              : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Settings</span>
        </Link>
      </nav>

      <div className="flex items-center gap-1.5 rounded-md border border-ink-600/80 bg-gradient-to-b from-ink-800 to-ink-850 px-2.5 py-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-forge-400" strokeWidth={2.25} />
        <span
          className={`h-2 w-2 rounded-full ${running > 0 ? 'bg-forge-500 animate-live animate-ember' : 'bg-ink-500'}`}
        />
        <span className="text-[12px] tabular-nums font-mono">
          <span className={atCapacity ? 'text-forge-400 font-semibold' : 'text-ink-100'}>{running}</span>
          <span className="text-ink-500"> / </span>
          {editing ? (
            <div className="inline-flex items-center gap-1">
              <input
                autoFocus
                type="number"
                min={1}
                max={999}
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
                className="w-12 rounded bg-ink-700 px-1 py-0.5 text-center text-[12px] font-semibold text-forge-400 outline-none focus-visible:ring-2 focus-visible:ring-forge-500/70"
              />
              <div className="flex items-center gap-0.5 text-[10px]">
                {[5, 10, 25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      onChangeLimit(preset);
                      setEditing(false);
                    }}
                    className={`rounded px-1 py-0.5 font-mono transition ${
                      limit === preset
                        ? 'bg-forge-500 text-ink-900 font-bold'
                        : 'bg-ink-700 text-ink-300 hover:bg-ink-600 hover:text-ink-100'
                    }`}
                    title={`Set limit to ${preset}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded font-semibold text-forge-400 hover:underline decoration-forge-500 decoration-dotted underline-offset-2 outline-none hover:text-forge-300 focus-visible:ring-2 focus-visible:ring-forge-500/70"
              title="Concurrency limit — click to change (supports unlimited)"
            >
              {limit >= 500 ? '∞ Unlimited' : limit}
            </button>
          )}
        </span>
        <span className="text-[11px] font-medium text-ink-400">parallel agents</span>
      </div>

      {queued > 0 && (
        <span className="animate-rise text-[12px] text-ink-300">
          <span className="tabular-nums text-ink-100">{queued}</span> queued
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={onShowApiKeys}
        className="flex items-center gap-1.5 rounded-md border border-forge-500/40 bg-forge-500/10 px-2.5 py-1 text-[11px] font-medium text-forge-400 outline-none transition hover:bg-forge-500/20 focus-visible:ring-2 focus-visible:ring-forge-400/70"
        title="Configure Anthropic / OpenAI API Keys"
      >
        <Key className="h-3 w-3" strokeWidth={2.25} />
        API Keys
      </button>

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
          Agent binary not found
        </span>
      )}

      <span className="flex items-center gap-1.5 text-[11px] text-ink-400 font-mono" title={connected ? 'WebSocket Live' : 'HTTP Cloud Polling Active'}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/80'}`} />
        <span>{connected ? 'live (ws)' : 'live (cloud)'}</span>
      </span>
    </header>
  );
}
