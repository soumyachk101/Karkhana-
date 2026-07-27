'use client';

import { STATUS_LABEL, STATUS_ORDER, STATUS_STYLE } from '@/lib/format';
import type { Project, Task } from '@/lib/types';
import { TaskCard } from './TaskCard.tsx';

type Props = {
  tasks: Task[];
  projects: Project[];
  showProject: boolean;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
};

export function KanbanBoard({ tasks, projects, showProject, selectedTaskId, onSelectTask }: Props) {
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="flex h-full gap-2 overflow-x-auto p-2">
      {STATUS_ORDER.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        const style = STATUS_STYLE[status];

        return (
          // Columns share the available width so all six statuses stay visible;
          // below ~1400px they hit min-width and the row scrolls instead.
          <section
            key={status}
            className="flex min-w-52 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0B0E16]/80 shadow-xl backdrop-blur-md transition-all"
          >
            {/* Top status header bar */}
            <header className="flex items-center justify-between border-b border-slate-800/80 bg-[#101420]/90 px-3.5 py-2.5 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${style.dot} ${status === 'running' ? 'animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]' : ''}`} />
                <span className="font-display text-[12px] font-bold tracking-tight text-slate-200">
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <span className="rounded-full bg-slate-800/90 border border-slate-700/60 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300 shadow-inner">
                {column.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {column.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={projectsById.get(task.project_id)}
                  showProject={showProject}
                  selected={task.id === selectedTaskId}
                  onClick={() => onSelectTask(task.id)}
                />
              ))}
              {column.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center text-slate-600">
                  <p className="font-mono text-[11px]">No tasks</p>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
