'use client';

import { useMemo, useState } from 'react';
import { initials } from '@/lib/format';
import type { Project, Task } from '@/lib/types';
import { Icon } from './ui/icons.tsx';
import { Button, ConfirmDialog, IconButton, Kbd } from './ui/primitives.tsx';

type Props = {
  projects: Project[];
  tasks: Task[];
  selectedId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (id: string | null) => void;
  onAdd: (input: { path: string; baseBranch?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onShowShortcuts: () => void;
};

export function Sidebar({
  projects,
  tasks,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onAdd,
  onRemove,
  onShowShortcuts,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<Project | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, { active: number; review: number; failed: number; total: number }>();
    for (const task of tasks) {
      const entry = map.get(task.project_id) ?? { active: 0, review: 0, failed: 0, total: 0 };
      entry.total++;
      if (task.status === 'running' || task.status === 'queued') entry.active++;
      if (task.status === 'needs_review') entry.review++;
      if (task.status === 'failed') entry.failed++;
      map.set(task.project_id, entry);
    }
    return map;
  }, [tasks]);

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

  const visible = filter.trim()
    ? projects.filter((p) =>
        `${p.name} ${p.path}`.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : projects;

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-ink-700 bg-ink-850 py-2">
        <IconButton icon="sidebar" title="Expand sidebar (⌘B)" onClick={onToggleCollapsed} />
        <span className="my-1 h-px w-6 bg-ink-700" />
        <button
          onClick={() => onSelect(null)}
          title="All projects"
          className={`flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold ${
            selectedId === null
              ? 'border-forge-500/50 bg-forge-500/12 text-forge-500'
              : 'border-ink-700 bg-ink-800 text-ink-300 hover:text-ink-50'
          }`}
        >
          <Icon name="layers" size={15} />
        </button>
        {projects.map((project) => {
          const entry = counts.get(project.id);
          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              title={`${project.name} · ${project.base_branch}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-semibold ${
                selectedId === project.id
                  ? 'border-forge-500/50 bg-forge-500/12 text-forge-500'
                  : 'border-ink-700 bg-ink-800 text-ink-300 hover:text-ink-50'
              }`}
            >
              {initials(project.name)}
              {entry && entry.active > 0 && (
                <span className="animate-live absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-forge-500" />
              )}
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-850">
      <div className="flex items-center gap-1 px-2.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
          Projects
        </span>
        <span className="rounded-full bg-ink-800 px-1.5 text-[10px] text-ink-400 tabular-nums">
          {projects.length}
        </span>
        <span className="flex-1" />
        <IconButton
          icon="plus"
          title="Register a local repo"
          size="xs"
          active={adding}
          onClick={() => setAdding((v) => !v)}
        />
        <IconButton icon="sidebar" title="Collapse sidebar (⌘B)" size="xs" onClick={onToggleCollapsed} />
      </div>

      {adding && (
        <div className="animate-rise border-y border-ink-700 bg-ink-800 p-2.5">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-ink-400">
            Repository path
          </label>
          <input
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="/absolute/path/to/repo"
            className="mb-2 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-[11px] text-ink-50 placeholder-ink-500 outline-none focus:border-forge-500/60"
          />
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-ink-400">
            Base branch
          </label>
          <input
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="auto-detect"
            className="mb-2 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-[11px] text-ink-50 placeholder-ink-500 outline-none focus:border-forge-500/60"
          />
          {error && (
            <p className="mb-2 rounded border border-danger/30 bg-danger/8 px-1.5 py-1 text-[10.5px] leading-snug text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-1.5">
            <Button tone="primary" busy={busy} onClick={() => void submit()}>
              Add repo
            </Button>
            <Button
              tone="ghost"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {projects.length > 5 && (
        <div className="flex items-center gap-1.5 border-b border-ink-700 px-2.5 py-1.5">
          <Icon name="search" size={12} className="text-ink-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink-100 placeholder-ink-500 outline-none"
          />
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        <button
          onClick={() => onSelect(null)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
            selectedId === null ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-800'
          }`}
        >
          <Icon name="layers" size={14} className="text-ink-400" />
          <span className="flex-1 text-[12px]">All projects</span>
          <span className="text-[10.5px] text-ink-400 tabular-nums">{tasks.length}</span>
        </button>

        {visible.map((project) => {
          const entry = counts.get(project.id);
          const active = selectedId === project.id;
          return (
            <div key={project.id} className="group relative">
              <button
                onClick={() => onSelect(project.id)}
                title={project.path}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-800'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9.5px] font-semibold ${
                    active ? 'bg-forge-500/15 text-forge-500' : 'bg-ink-800 text-ink-300'
                  }`}
                >
                  {initials(project.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px]">{project.name}</span>
                    {entry && entry.active > 0 && (
                      <span className="animate-live h-1.5 w-1.5 shrink-0 rounded-full bg-forge-500" />
                    )}
                  </span>
                  <span className="flex items-center gap-1 truncate font-mono text-[10px] text-ink-400">
                    <Icon name="branch" size={9} />
                    {project.base_branch}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 pr-3.5 text-[10px] tabular-nums">
                  {entry && entry.review > 0 && (
                    <span
                      className="flex items-center gap-0.5 rounded-full bg-review/12 px-1 text-review"
                      title={`${entry.review} awaiting review`}
                    >
                      <span className="h-1 w-1 rounded-full bg-review" />
                      {entry.review}
                    </span>
                  )}
                  {entry && entry.failed > 0 && (
                    <span
                      className="flex items-center gap-0.5 rounded-full bg-danger/12 px-1 text-danger"
                      title={`${entry.failed} failed`}
                    >
                      <span className="h-1 w-1 rounded-full bg-danger" />
                      {entry.failed}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => setConfirmRemove(project)}
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-600 hover:text-danger group-hover:block"
                title="Remove project"
                aria-label={`Remove ${project.name}`}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}

        {projects.length === 0 && !adding && (
          <div className="px-2 py-4 text-[11px] leading-relaxed text-ink-400">
            <p>No projects yet.</p>
            <button
              onClick={() => setAdding(true)}
              className="mt-2 flex items-center gap-1 text-forge-500 hover:underline"
            >
              <Icon name="plus" size={12} />
              Register a local git repo
            </button>
          </div>
        )}
      </nav>

      <div className="flex items-center gap-1.5 border-t border-ink-700 px-2.5 py-2 text-[10.5px] text-ink-500">
        <button
          onClick={onShowShortcuts}
          className="flex items-center gap-1.5 hover:text-ink-200"
          title="Keyboard shortcuts (?)"
        >
          <Icon name="keyboard" size={13} />
          Shortcuts
        </button>
        <span className="flex-1" />
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${confirmRemove.name}?`}
          confirmLabel="Remove project"
          body={
            <>
              <p>
                Karkhana forgets{' '}
                <span className="font-mono text-ink-100">{confirmRemove.path}</span>, deletes its
                tasks from the dashboard, and cleans up the worktrees it created.
              </p>
              <p className="mt-2 text-ink-400">The repository itself is not touched.</p>
            </>
          }
          onConfirm={() => void onRemove(confirmRemove.id)}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </aside>
  );
}
