'use client';

import { STATUS_STYLE, duration, relativeTime } from '@/lib/format';
import type { Project, Task } from '@/lib/types';

type Props = {
  task: Task;
  project: Project | undefined;
  showProject: boolean;
  selected: boolean;
  onClick: () => void;
};

export function TaskCard({ task, project, showProject, selected, onClick }: Props) {
  const style = STATUS_STYLE[task.status];
  const isRunning = task.status === 'running';

  return (
    <button
      onClick={onClick}
      className={`w-full rounded border bg-ink-800 p-2 text-left transition-colors hover:border-ink-500 ${
        selected ? 'border-forge-600 bg-ink-700' : style.border
      }`}
    >
      <div className="mb-1 flex items-start gap-1.5">
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live' : ''}`}
        />
        <span className="line-clamp-2 text-[12px] leading-snug text-ink-100">{task.title}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3 text-[10px] text-ink-400">
        {showProject && project && <span className="text-ink-300">{project.name}</span>}
        <span className="rounded bg-ink-700 px-1 font-mono">{task.model}</span>
        {isRunning ? (
          <span className={style.text}>{duration(task.started_at, null)}</span>
        ) : (
          <span>{relativeTime(task.ended_at ?? task.created_at)}</span>
        )}
        {task.session_id && <span className="font-mono opacity-60">{task.session_id.slice(0, 6)}</span>}
      </div>

      {task.error && (
        <p className="mt-1 line-clamp-2 pl-3 text-[10px] leading-snug text-red-300/80">{task.error}</p>
      )}
    </button>
  );
}
