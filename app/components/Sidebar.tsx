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
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#0B0E16]/95 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
        <span className="font-display text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Registered Vaults
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800/80 text-amber-400 hover:bg-amber-500 hover:text-black transition"
          title="Register a local repo"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>

      {adding && (
        <div className="animate-rise border-b border-slate-800 bg-[#101420] p-3 space-y-2">
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="/path/to/repo or git URL"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-black px-2.5 py-1 font-mono text-[11px] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
            />
            <button
              onClick={() => setBrowsing(true)}
              title="Browse for a folder"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition"
            >
              <FolderOpen className="h-3 w-3 text-amber-400" strokeWidth={2.25} />
            </button>
          </div>
          <input
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="base branch (main)"
            className="w-full rounded-lg border border-slate-700 bg-black px-2.5 py-1 font-mono text-[11px] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
          />
          {error && <p className="animate-rise text-[11px] text-rose-400">{error}</p>}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 transition"
            >
              {busy ? 'Adding…' : 'Add Repo'}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-lg px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <button
          onClick={() => onSelect(null)}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12px] font-medium transition ${
            selectedId === null
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-sm'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
          }`}
        >
          <span>All Workspace Repos</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {tasks.length}
          </span>
        </button>

        {projects.map((project) => {
          const active = activeCount(project.id);
          const isSelected = selectedId === project.id;
          return (
            <div key={project.id} className="animate-rise group relative">
              <button
                onClick={() => onSelect(project.id)}
                className={`flex w-full flex-col items-start rounded-xl px-3 py-2 pr-7 text-left transition border ${
                  isSelected
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 font-semibold shadow-sm'
                    : 'border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/60'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">{project.name}</span>
                  {active > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 animate-pulse">
                      {active}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 truncate font-mono text-[10px] text-emerald-400/90 mt-0.5">
                  <GitBranch className="h-2.5 w-2.5 shrink-0 text-emerald-400" strokeWidth={2} />
                  {project.base_branch}
                </span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Remove "${project.name}" and clean up its worktrees?`)) void onRemove(project.id);
                }}
                className="absolute right-2 top-2.5 hidden rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition group-hover:block"
                title="Remove project"
              >
                <X className="h-3 w-3" strokeWidth={2.25} />
              </button>
            </div>
          );
        })}

        {projects.length === 0 && !adding && (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-slate-500 italic">
            No repositories registered. Click <span className="text-amber-400 font-bold">+</span> to add a local git repo or remote URL.
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
