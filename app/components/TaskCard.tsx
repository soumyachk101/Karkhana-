'use client';

import { STATUS_STYLE, duration, initials, relativeTime } from '@/lib/format';
import type { Project, Task } from '@/lib/types';
import { Icon } from './ui/icons.tsx';

export function TaskCard({
  task,
  project,
  showProject,
  selected,
  onClick,
}: {
  task: Task;
  project: Project | undefined;
  showProject: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLE[task.status];
  const isRunning = task.status === 'running';

  return (
    <button
      onClick={onClick}
      className={`group animate-rise relative w-full overflow-hidden rounded-lg border bg-ink-800 p-2.5 text-left transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-px hover:border-ink-500 hover:shadow-pop ${
        selected ? 'border-forge-500/60 shadow-pop' : style.border
      }`}
    >
      {/* A running task gets a live rail rather than a spinner: it reads at a
          glance from across the board, which is the point of the kanban. */}
      {isRunning && <span className="rail absolute inset-x-0 top-0 h-0.5" />}

      <div className="flex items-start gap-2">
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live' : ''}`}
        />
        <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug text-ink-100">
          {task.title}
        </span>
        <Icon
          name="chevronRight"
          size={13}
          className="mt-0.5 shrink-0 text-ink-600 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-3.5 text-[10px] text-ink-400">
        {showProject && project && (
          <span className="flex items-center gap-1">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-ink-700 text-[8px] font-semibold text-ink-200">
              {initials(project.name)}
            </span>
            <span className="max-w-[90px] truncate">{project.name}</span>
          </span>
        )}
        <span className="rounded border border-ink-700 bg-ink-850 px-1 font-mono">{task.model}</span>
        {isRunning ? (
          <span className={`font-mono tabular-nums ${style.text}`}>
            {duration(task.started_at, null)}
          </span>
        ) : (
          <span className="tabular-nums">{relativeTime(task.ended_at ?? task.created_at)}</span>
        )}
        {task.branch && (
          <span className="flex items-center gap-0.5 font-mono opacity-70" title={task.branch}>
            <Icon name="branch" size={9} />
            {task.branch.replace('karkhana/', '').slice(-6)}
          </span>
        )}
      </div>

      {task.error && (
        <p className="mt-1.5 line-clamp-2 rounded border border-danger/25 bg-danger/8 px-1.5 py-1 text-[10px] leading-snug text-danger">
          {task.error}
        </p>
      )}
    </button>
  );
}

/** Dense single-line variant for the list view. */
export function TaskRow({
  task,
  project,
  selected,
  onClick,
}: {
  task: Task;
  project: Project | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLE[task.status];
  const isRunning = task.status === 'running';

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-ink-800 px-3 py-2 text-left transition-colors hover:bg-ink-850 ${
        selected ? 'bg-ink-850' : ''
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live' : ''}`}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{task.title}</span>
      <span className={`w-24 shrink-0 truncate text-[10.5px] ${style.text}`}>
        {task.status.replace('_', ' ')}
      </span>
      <span className="w-28 shrink-0 truncate text-[10.5px] text-ink-400">{project?.name ?? '—'}</span>
      <span className="w-14 shrink-0 truncate font-mono text-[10.5px] text-ink-400">{task.model}</span>
      <span className="w-20 shrink-0 text-right font-mono text-[10.5px] text-ink-400 tabular-nums">
        {isRunning ? duration(task.started_at, null) : relativeTime(task.ended_at ?? task.created_at)}
      </span>
    </button>
  );
}
