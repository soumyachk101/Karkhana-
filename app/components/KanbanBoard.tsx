'use client';

import { STATUS_HINT, STATUS_LABEL, STATUS_ORDER, STATUS_STYLE } from '@/lib/format';
import type { Project, Task } from '@/lib/types';
import { TaskCard, TaskRow } from './TaskCard.tsx';
import { EmptyState } from './ui/primitives.tsx';

type Props = {
  tasks: Task[];
  projects: Project[];
  showProject: boolean;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  layout: 'board' | 'list';
  onNewTask: () => void;
  emptyReason: 'no-projects' | 'no-tasks' | 'no-matches';
};

export function KanbanBoard({
  tasks,
  projects,
  showProject,
  selectedTaskId,
  onSelectTask,
  layout,
  onNewTask,
  emptyReason,
}: Props) {
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  if (tasks.length === 0) {
    const copy = {
      'no-projects': {
        icon: 'folder',
        title: 'No projects registered',
        hint: 'Add a local git repo in the sidebar. Karkhana never runs an agent in its main working tree — every task gets its own worktree and branch off the base.',
      },
      'no-tasks': {
        icon: 'sparkles',
        title: 'No tasks yet',
        hint: 'Dispatch an agent and it starts working in an isolated worktree. Several can run on the same repo at once.',
      },
      'no-matches': {
        icon: 'search',
        title: 'Nothing matches your filters',
        hint: 'Clear the search or pick a different status to see the rest of the board.',
      },
    }[emptyReason];

    return (
      <EmptyState icon={copy.icon} title={copy.title} hint={copy.hint}>
        {emptyReason === 'no-tasks' && (
          <button
            onClick={onNewTask}
            className="rounded-md bg-forge-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-forge-400"
          >
            Dispatch an agent
          </button>
        )}
      </EmptyState>
    );
  }

  if (layout === 'list') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-700 bg-ink-850/95 px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-400 backdrop-blur">
          <span className="w-1.5" />
          <span className="flex-1">Task</span>
          <span className="w-24">Status</span>
          <span className="w-28">Project</span>
          <span className="w-14">Model</span>
          <span className="w-20 text-right">Age</span>
        </div>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            project={projectsById.get(task.project_id)}
            selected={task.id === selectedTaskId}
            onClick={() => onSelectTask(task.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2.5 overflow-x-auto p-2.5">
      {STATUS_ORDER.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        const style = STATUS_STYLE[status];

        return (
          // Columns share the available width so all six statuses stay visible;
          // below ~1400px they hit min-width and the row scrolls instead.
          <section
            key={status}
            className="flex min-w-52 flex-1 flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850/60"
          >
            <header className="shrink-0 border-b border-ink-700 px-2.5 py-2" title={STATUS_HINT[status]}>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                <span className={`text-[11.5px] font-semibold ${style.text}`}>
                  {STATUS_LABEL[status]}
                </span>
                <span
                  className={`ml-auto rounded-full px-1.5 text-[10px] font-medium tabular-nums ${style.tint} ${style.text}`}
                >
                  {column.length}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-ink-500">{STATUS_HINT[status]}</p>
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
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-700/70 py-6 text-[10.5px] text-ink-600">
                  empty
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
