'use client';

import { useEffect, useState } from 'react';

type BrowseResult = { path: string; parent: string | null; isGitRepo: boolean; entries: string[] };

async function browse(target?: string): Promise<BrowseResult> {
  const res = await fetch(`/api/fs/browse${target ? `?path=${encodeURIComponent(target)}` : ''}`);
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Could not browse that folder.');
  return body as BrowseResult;
}

/** Modal directory picker. Fills in an absolute path by clicking through
 * folders server-side, rather than making the user type one from memory. */
export function FolderBrowser({ onClose, onSelect }: { onClose: () => void; onSelect: (path: string) => void }) {
  const [state, setState] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (target?: string) => {
    setError(null);
    browse(target)
      .then(setState)
      .catch((err) => setError((err as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-[520px] rounded-lg border border-ink-600 bg-ink-850 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
          <span className="text-[12px] font-medium text-ink-100">Choose a folder</span>
          <button onClick={onClose} className="rounded px-1.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100">
            ×
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-300">{state?.path ?? '…'}</span>
          {state?.isGitRepo && (
            <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
              git repo
            </span>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {error && <p className="p-2 text-[11px] text-red-300">{error}</p>}

          {state?.parent && (
            <button
              onClick={() => load(state.parent!)}
              className="flex w-full items-center rounded px-2 py-1 text-left text-[12px] text-ink-400 hover:bg-ink-800"
            >
              ↑ ..
            </button>
          )}
          {state?.entries.map((name) => (
            <button
              key={name}
              onClick={() => load(`${state.path}/${name}`)}
              className="flex w-full items-center rounded px-2 py-1 text-left text-[12px] text-ink-200 hover:bg-ink-800"
            >
              {name}/
            </button>
          ))}
          {state && state.entries.length === 0 && !error && (
            <p className="p-2 text-[11px] text-ink-500">No subfolders here.</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink-700 p-2.5">
          <span className="text-[11px] text-ink-400">Click a folder to open it, then select it.</span>
          <button
            onClick={() => state && onSelect(state.path)}
            disabled={!state}
            className="rounded bg-forge-600 px-3 py-1.5 text-[12px] font-medium text-ink-900 hover:bg-forge-500 disabled:opacity-40"
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
