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
      className={`animate-rise w-full rounded-md border bg-gradient-to-b from-ink-800 to-ink-800/70 p-2 text-left outline-none transition hover:-translate-y-px hover:border-ink-500 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] focus-visible:ring-2 focus-visible:ring-forge-500/60 active:scale-[0.99] active:translate-y-0 ${
        selected
          ? 'border-forge-600 bg-gradient-to-b from-ink-700 to-ink-700/80 shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_4px_12px_-4px_rgba(0,0,0,0.5)]'
          : style.border
      }`}
    >
      <div className="mb-1 flex items-start gap-1.5">
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live animate-ember' : ''}`}
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
