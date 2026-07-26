'use client';

import { useState } from 'react';

export type OrphanWorktree = {
  path: string;
  branch: string | null;
  reason: string;
  projectId: string;
  projectName: string;
};

/**
 * Worktrees left on disk with no task behind them. Removal is always manual:
 * an orphan may hold the only copy of an agent's work, so Karkhana surfaces
 * them but never cleans them up on its own.
 */
export function CleanupPanel({
  orphans,
  onClose,
  onRemove,
}: {
  orphans: OrphanWorktree[];
  onClose: () => void;
  onRemove: (orphan: OrphanWorktree) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-[640px] rounded-lg border border-ink-600 bg-ink-850 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
          <span className="text-[12px] font-medium text-ink-100">Orphaned worktrees</span>
          <button onClick={onClose} className="rounded px-1.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100">
            ×
          </button>
        </div>

        <p className="border-b border-ink-700 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
          These worktrees exist on disk but have no task behind them — usually left by a crash or a
          deleted task. They are never removed automatically because they may hold the only copy of an
          agent&apos;s work. Inspect the path before removing.
        </p>

        <ul className="max-h-80 overflow-y-auto">
          {orphans.map((orphan) => (
            <li key={orphan.path} className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] text-ink-100">{orphan.path}</p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                  {orphan.projectName} · {orphan.branch ?? 'no branch'} · {orphan.reason}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`Remove ${orphan.path} and its branch? This cannot be undone.`)) return;
                  setBusy(orphan.path);
                  try {
                    await onRemove(orphan);
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy === orphan.path}
                className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                {busy === orphan.path ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {orphans.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px] text-ink-500">Nothing left to clean up.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
