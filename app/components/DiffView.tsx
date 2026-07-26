'use client';

import { useEffect, useState } from 'react';
import type { TaskDiff } from '@/lib/worktree';

/** Colours a unified diff without pulling in a syntax highlighter. */
function DiffBody({ patch }: { patch: string }) {
  return (
    <pre className="px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
      {patch.split('\n').map((line, i) => {
        let className = 'text-ink-300';
        if (line.startsWith('+++') || line.startsWith('---')) className = 'text-ink-400';
        else if (line.startsWith('@@')) className = 'text-sky-300';
        else if (line.startsWith('diff --git')) className = 'mt-2 block text-ink-100 font-medium';
        else if (line.startsWith('+')) className = 'text-emerald-300 bg-emerald-500/5';
        else if (line.startsWith('-')) className = 'text-red-300 bg-red-500/5';
        return (
          <span key={i} className={`block whitespace-pre-wrap break-all ${className}`}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}

export function DiffView({ taskId, refreshKey }: { taskId: string; refreshKey: number }) {
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tasks/${taskId}/diff`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) setError(body.error);
        else {
          setDiff(body as TaskDiff);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  const totalAdded = diff?.files.reduce((n, f) => n + f.added, 0) ?? 0;
  const totalDeleted = diff?.files.reduce((n, f) => n + f.deleted, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-ink-700">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-700 px-2.5 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Diff</span>
        {diff && diff.files.length > 0 && (
          <span className="text-[11px] tabular-nums">
            <span className="text-ink-400">{diff.files.length} files </span>
            <span className="text-emerald-400">+{totalAdded}</span>{' '}
            <span className="text-red-400">−{totalDeleted}</span>
          </span>
        )}
        {loading && <span className="text-[11px] text-ink-500">loading…</span>}
      </div>

      <div className="flex-1 overflow-auto">
        {error && <p className="animate-rise p-3 text-[11px] text-red-300">{error}</p>}

        {diff && diff.files.length === 0 && !error && (
          <p className="animate-fade p-4 text-center text-[11px] text-ink-500">
            No changes in this worktree yet.
          </p>
        )}

        {diff && diff.files.length > 0 && (
          <div className="animate-fade">
            <ul className="border-b border-ink-700 bg-ink-850">
              {diff.files.map((file) => (
                <li key={file.path} className="flex items-center gap-2 px-2.5 py-0.5 font-mono text-[11px]">
                  <span className="flex-1 truncate text-ink-200">{file.path}</span>
                  {file.binary ? (
                    <span className="text-ink-500">binary</span>
                  ) : (
                    <span className="shrink-0 tabular-nums">
                      <span className="text-emerald-400">+{file.added}</span>{' '}
                      <span className="text-red-400">−{file.deleted}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <DiffBody patch={diff.patch} />
            {diff.truncated && (
              <p className="border-t border-ink-700 p-2 text-[11px] text-amber-300">
                Patch truncated at 2MB. Inspect the worktree directly for the rest.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
