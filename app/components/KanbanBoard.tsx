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
            className="flex min-w-48 flex-1 flex-col rounded border border-ink-700 bg-ink-850"
          >
            <header className="flex items-center gap-1.5 border-b border-ink-700 px-2 py-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              <span className={`text-[11px] font-medium ${style.text}`}>{STATUS_LABEL[status]}</span>
              <span className="ml-auto tabular-nums text-[11px] text-ink-400">{column.length}</span>
            </header>

            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
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
                <p className="px-1 py-2 text-[11px] text-ink-500">—</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
