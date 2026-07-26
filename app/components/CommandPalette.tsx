'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/format';
import type { Project, Task } from '@/lib/types';
import { Icon, type IconName } from './ui/icons.tsx';
import { Kbd } from './ui/primitives.tsx';

export type PaletteAction = {
  id: string;
  label: string;
  icon: IconName | string;
  hint?: string;
  run: () => void;
};

type Entry = {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: IconName | string;
  accent?: string;
  hint?: string;
  run: () => void;
};

/** Substring match, ranked by how early the hit lands. -1 means no match. */
function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const at = haystack.toLowerCase().indexOf(needle.toLowerCase());
  return at === -1 ? -1 : at;
}

export function CommandPalette({
  tasks,
  projects,
  actions,
  onSelectTask,
  onSelectProject,
  onClose,
}: {
  tasks: Task[];
  projects: Project[];
  actions: PaletteAction[];
  onSelectTask: (id: string) => void;
  onSelectProject: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...actions.map((action) => ({
        id: `action:${action.id}`,
        group: 'Actions',
        label: action.label,
        icon: action.icon,
        hint: action.hint,
        run: action.run,
      })),
      ...projects.map((project) => ({
        id: `project:${project.id}`,
        group: 'Projects',
        label: project.name,
        detail: project.path,
        icon: 'folder',
        run: () => onSelectProject(project.id),
      })),
      ...tasks.slice(0, 200).map((task) => ({
        id: `task:${task.id}`,
        group: 'Tasks',
        label: task.title,
        detail: projects.find((p) => p.id === task.project_id)?.name,
        icon: 'chat',
        accent: STATUS_STYLE[task.status].text,
        hint: STATUS_LABEL[task.status],
        run: () => onSelectTask(task.id),
      })),
    ];

    if (!query.trim()) return all.slice(0, 40);

    return all
      .map((entry) => {
        const onLabel = score(entry.label, query);
        const onDetail = score(entry.detail ?? '', query);
        // A hit in the label always outranks one in the path/project subtitle.
        const candidates = [onLabel, onDetail === -1 ? -1 : onDetail + 40].filter((n) => n >= 0);
        return { entry, best: candidates.length ? Math.min(...candidates) : Infinity };
      })
      .filter(({ best }) => Number.isFinite(best))
      .sort((a, b) => a.best - b.best)
      .slice(0, 40)
      .map(({ entry }) => entry);
  }, [actions, projects, tasks, query, onSelectProject, onSelectTask]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(entries.length - 1, c + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = entries[cursor];
        if (entry) {
          entry.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entries, cursor, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = '';

  return (
    <div
      className="animate-fade fixed inset-0 z-[55] flex items-start justify-center bg-ink-900/70 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="animate-pop shadow-float w-[600px] overflow-hidden rounded-xl border border-ink-600 bg-ink-850"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2.5">
          <Icon name="command" size={14} className="text-forge-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, projects, and actions…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-50 placeholder-ink-500 outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {entries.length === 0 && (
            <p className="px-3 py-6 text-center text-[11.5px] text-ink-500">No matches.</p>
          )}

          {entries.map((entry, index) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            const active = index === cursor;

            return (
              <div key={entry.id}>
                {header && (
                  <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-ink-500">
                    {header}
                  </p>
                )}
                <button
                  data-active={active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    entry.run();
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
                    active ? 'bg-ink-700' : 'hover:bg-ink-800'
                  }`}
                >
                  <Icon name={entry.icon} size={13} className={entry.accent ?? 'text-ink-400'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink-100">{entry.label}</span>
                    {entry.detail && (
                      <span className="block truncate font-mono text-[10.5px] text-ink-500">
                        {entry.detail}
                      </span>
                    )}
                  </span>
                  {entry.hint && (
                    <span className={`shrink-0 text-[10.5px] ${entry.accent ?? 'text-ink-500'}`}>
                      {entry.hint}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-ink-700 bg-ink-800/50 px-3 py-1.5 text-[10.5px] text-ink-500">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex-1" />
          <span className="tabular-nums">{entries.length} results</span>
        </div>
      </div>
    </div>
  );
}
