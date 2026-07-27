'use client';

import { CheckCircle2, CornerLeftUp, Folder, FolderSearch, X } from 'lucide-react';
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
  const [manualInput, setManualInput] = useState('');

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
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop w-[520px] rounded-xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-850 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_24px_48px_-12px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-3.5 py-2.5">
          <span className="font-display flex items-center gap-1.5 text-[13px] font-medium text-ink-100">
            <FolderSearch className="h-3.5 w-3.5 text-forge-400" strokeWidth={2} />
            Choose a folder
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 outline-none transition-colors hover:bg-ink-700 hover:text-ink-100 focus-visible:ring-2 focus-visible:ring-forge-500/60"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="p-3 border-b border-ink-700 bg-ink-950/60 space-y-2">
          <label className="block text-[11px] font-medium text-ink-300">
            Paste Local Path or GitHub Remote Repository URL:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="/Users/username/project or https://github.com/user/repo.git"
              className="flex-1 rounded border border-ink-700 bg-black px-3 py-1.5 font-mono text-[11px] text-ink-100 placeholder-ink-600 outline-none focus:border-forge-500"
            />
            <button
              onClick={() => manualInput.trim() && onSelect(manualInput.trim())}
              disabled={!manualInput.trim()}
              className="rounded bg-forge-500 px-3 py-1.5 font-sans text-[11px] font-semibold text-ink-900 hover:bg-forge-400 disabled:opacity-40 transition"
            >
              Add Project
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-900/40 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-300">{state?.path ?? '…'}</span>
          {state?.isGitRepo && (
            <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
              <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} />
              git repo
            </span>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {error && <p className="animate-rise p-2 text-[11px] text-red-300">{error}</p>}

          {state?.parent && (
            <button
              onClick={() => load(state.parent!)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-400 outline-none transition-colors hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-forge-500/60"
            >
              <CornerLeftUp className="h-3.5 w-3.5" strokeWidth={2} />
              ..
            </button>
          )}
          {state?.entries.map((name) => (
            <button
              key={name}
              onClick={() => load(`${state.path}/${name}`)}
              className="animate-rise flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-200 outline-none transition-colors hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-forge-500/60"
            >
              <Folder className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
              {name}
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
            className="rounded-md border border-forge-600 bg-gradient-to-b from-forge-500 to-forge-600 px-3 py-1.5 text-[12px] font-medium text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(217,119,6,0.5)] outline-none transition hover:from-forge-400 hover:to-forge-500 focus-visible:ring-2 focus-visible:ring-forge-400/70 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
