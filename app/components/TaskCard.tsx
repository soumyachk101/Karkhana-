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

  const getModelBadge = (m: string) => {
    if (m.startsWith('antigravity')) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    }
    if (m.startsWith('codex')) {
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    }
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  };

  return (
    <button
      onClick={onClick}
      className={`animate-rise group relative w-full rounded-xl border p-2.5 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] ${
        selected
          ? 'border-amber-500/60 bg-slate-900/90 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40'
          : 'border-slate-800/80 bg-[#0C0F17]/90 hover:border-slate-700 hover:bg-[#111522]'
      }`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]' : ''}`}
          />
          <span className="line-clamp-2 text-[12px] font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
            {task.title}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 font-mono text-[10px]">
        {showProject && project && (
          <span className="rounded bg-slate-800/80 border border-slate-700/60 px-1.5 py-0.5 text-slate-300">
            {project.name}
          </span>
        )}
        <span className={`rounded border px-1.5 py-0.5 font-semibold ${getModelBadge(task.model)}`}>
          {task.model}
        </span>
        <span className="ml-auto text-slate-400 font-sans text-[10px]">
          {isRunning ? (
            <span className="text-amber-400 font-semibold">{duration(task.started_at, null)}</span>
          ) : (
            relativeTime(task.ended_at ?? task.created_at)
          )}
        </span>
      </div>

      {task.error && (
        <p className="mt-1.5 line-clamp-2 rounded bg-rose-950/40 border border-rose-900/50 p-1.5 font-mono text-[10px] text-rose-300">
          {task.error}
        </p>
      )}
    </button>
  );
}
