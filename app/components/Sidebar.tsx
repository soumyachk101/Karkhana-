'use client';

import { FolderOpen, GitBranch, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { Project, Task } from '@/lib/types';
import { FolderBrowser } from './FolderBrowser.tsx';

type Props = {
  projects: Project[];
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (input: { path: string; baseBranch?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export function Sidebar({ projects, tasks, selectedId, onSelect, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const submit = async () => {
    if (!path.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ path: path.trim(), baseBranch: baseBranch.trim() || undefined });
      setPath('');
      setBaseBranch('');
      setAdding(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeCount = (projectId: string) =>
    tasks.filter((t) => t.project_id === projectId && (t.status === 'running' || t.status === 'queued')).length;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700 bg-ink-850">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Projects</span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded p-1 text-ink-300 outline-none transition-colors hover:bg-ink-700 hover:text-ink-50 focus-visible:ring-2 focus-visible:ring-forge-500/60"
          title="Register a local repo"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>

      {adding && (
        <div className="animate-rise border-y border-ink-700 bg-ink-800 p-2.5">
          <div className="mb-1.5 flex gap-1.5">
            <input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="/absolute/path/to/repo or a git URL"
              className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-50 placeholder-ink-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
            />
            <button
              onClick={() => setBrowsing(true)}
              title="Browse for a folder"
              className="flex shrink-0 items-center gap-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-300 outline-none transition-colors hover:bg-ink-700 focus-visible:ring-2 focus-visible:ring-forge-500/60"
            >
              <FolderOpen className="h-3 w-3" strokeWidth={2.25} />
              Browse
            </button>
          </div>
          <input
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="base branch (auto-detect)"
            className="mb-1.5 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-50 placeholder-ink-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
          />
          {error && <p className="animate-rise mb-1.5 text-[11px] leading-snug text-red-300">{error}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-md border border-forge-600 bg-gradient-to-b from-forge-500 to-forge-600 px-2.5 py-1 text-[11px] font-medium text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] outline-none transition hover:from-forge-400 hover:to-forge-500 focus-visible:ring-2 focus-visible:ring-forge-400/70 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded px-2 py-1 text-[11px] text-ink-300 outline-none transition-colors hover:bg-ink-700 focus-visible:ring-2 focus-visible:ring-forge-500/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-1.5">
        <button
          onClick={() => onSelect(null)}
          className={`mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-forge-500/60 ${
            selectedId === null ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-800'
          }`}
        >
          <span>All projects</span>
          <span className="tabular-nums text-[11px] text-ink-400">{tasks.length}</span>
        </button>

        {projects.map((project) => {
          const active = activeCount(project.id);
          return (
            <div key={project.id} className="animate-rise group relative">
              <button
                onClick={() => onSelect(project.id)}
                className={`mb-0.5 flex w-full flex-col items-start rounded-md px-2 py-1.5 pr-7 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-forge-500/60 ${
                  selectedId === project.id
                    ? 'bg-gradient-to-b from-ink-700 to-ink-700/70 text-ink-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                    : 'text-ink-200 hover:bg-ink-800'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-[12px]">{project.name}</span>
                  {active > 0 && (
                    <span className="shrink-0 rounded bg-forge-600/20 px-1 text-[10px] tabular-nums text-forge-400">
                      {active}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 truncate font-mono text-[10px] text-ink-400">
                  <GitBranch className="h-2.5 w-2.5 shrink-0" strokeWidth={2} />
                  {project.base_branch}
                </span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Remove "${project.name}" and clean up its worktrees?`)) void onRemove(project.id);
                }}
                className="absolute right-1 top-1.5 hidden rounded p-1 text-ink-400 outline-none transition-colors hover:bg-ink-600 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover:block group-focus-within:block"
                title="Remove project"
              >
                <X className="h-3 w-3" strokeWidth={2.25} />
              </button>
            </div>
          );
        })}

        {projects.length === 0 && !adding && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-ink-400">
            No projects yet. Press <span className="text-ink-200">+</span> to register a local git repo
            or clone one from a URL.
          </p>
        )}
      </nav>

      {browsing && (
        <FolderBrowser
          onClose={() => setBrowsing(false)}
          onSelect={(selected) => {
            setPath(selected);
            setBrowsing(false);
          }}
        />
      )}
    </aside>
  );
}
