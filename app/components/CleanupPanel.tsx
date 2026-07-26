'use client';

import { useState } from 'react';
import { Icon } from './ui/icons.tsx';
import { Badge, Button, ConfirmDialog, CopyButton, Modal } from './ui/primitives.tsx';

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
  const [confirming, setConfirming] = useState<OrphanWorktree | null>(null);

  const remove = async (orphan: OrphanWorktree) => {
    setBusy(orphan.path);
    try {
      await onRemove(orphan);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal
        title="Orphaned worktrees"
        subtitle={`${orphans.length} left on disk with no task behind them`}
        icon="alert"
        onClose={onClose}
        width="w-[680px]"
      >
        <p className="border-b border-ink-700 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-400">
          These usually come from a crash or a deleted task. They are never removed automatically
          because a worktree may hold the only copy of an agent&apos;s work — open the path and look
          before you delete it.
        </p>

        <ul>
          {orphans.map((orphan) => (
            <li
              key={orphan.path}
              className="flex items-center gap-2.5 border-b border-ink-800 px-3.5 py-2.5 last:border-b-0"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warn/12 text-warn">
                <Icon name="folder" size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11.5px] text-ink-100">{orphan.path}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-ink-400">
                  <span>{orphan.projectName}</span>
                  <span className="text-ink-600">·</span>
                  <span>{orphan.branch ?? 'no branch'}</span>
                  <span className="text-ink-600">·</span>
                  <span>{orphan.reason}</span>
                </p>
              </div>
              <CopyButton text={orphan.path} title="Copy path" size="xs" />
              <Button
                tone="danger"
                size="xs"
                icon="trash"
                busy={busy === orphan.path}
                onClick={() => setConfirming(orphan)}
              >
                Remove
              </Button>
            </li>
          ))}

          {orphans.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-3.5 py-10 text-center">
              <Badge tone="ok">
                <Icon name="check" size={10} />
                clean
              </Badge>
              <p className="text-[11.5px] text-ink-500">Nothing left to clean up.</p>
            </li>
          )}
        </ul>
      </Modal>

      {confirming && (
        <ConfirmDialog
          title="Remove this worktree?"
          confirmLabel="Remove permanently"
          body={
            <>
              <p>
                <span className="font-mono text-ink-100">{confirming.path}</span> and its branch{' '}
                <span className="font-mono text-ink-100">{confirming.branch ?? '—'}</span> will be
                deleted from disk.
              </p>
              <p className="mt-2 text-ink-400">
                If an agent left work here that was never merged, this is where it disappears.
              </p>
            </>
          }
          onConfirm={() => void remove(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
