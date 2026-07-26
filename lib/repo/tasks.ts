import { getDb, newId } from '../db.ts';
import type { Model, Task, TaskStatus } from '../types.ts';

export function listTasks(projectId?: string): Task[] {
  const db = getDb();
  return (
    projectId
      ? db
          .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
          .all(projectId)
      : db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
  ) as Task[];
}

export function getTask(id: string): Task | null {
  return (getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task) ?? null;
}

export function listTasksByStatus(status: TaskStatus): Task[] {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC')
    .all(status) as Task[];
}

export function countByStatus(): Record<TaskStatus, number> {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status')
    .all() as Array<{ status: TaskStatus; n: number }>;
  const out = {
    queued: 0,
    running: 0,
    needs_review: 0,
    merged: 0,
    failed: 0,
    cancelled: 0,
  } as Record<TaskStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export function createTask(input: {
  projectId: string;
  title: string;
  prompt: string;
  model?: Model;
}): Task {
  const task: Task = {
    id: newId('t'),
    project_id: input.projectId,
    title: input.title.trim() || input.prompt.slice(0, 60),
    prompt: input.prompt,
    status: 'queued',
    worktree_path: null,
    branch: null,
    session_id: null,
    model: input.model ?? 'sonnet',
    created_at: Date.now(),
    started_at: null,
    ended_at: null,
    pid: null,
    exit_code: null,
    error: null,
  };

  getDb()
    .prepare(
      `INSERT INTO tasks (id, project_id, title, prompt, status, worktree_path, branch,
                          session_id, model, created_at, started_at, ended_at, pid, exit_code, error)
       VALUES (@id, @project_id, @title, @prompt, @status, @worktree_path, @branch,
               @session_id, @model, @created_at, @started_at, @ended_at, @pid, @exit_code, @error)`,
    )
    .run(task);

  return task;
}

/**
 * Partial update by column name. Returns the fresh row so callers always
 * broadcast the true post-write state rather than an optimistic guess.
 */
export function updateTask(id: string, patch: Partial<Task>): Task {
  const keys = Object.keys(patch).filter((k) => k !== 'id') as Array<keyof Task>;
  if (keys.length) {
    const setters = keys.map((k) => `${k} = @${k}`).join(', ');
    getDb()
      .prepare(`UPDATE tasks SET ${setters} WHERE id = @id`)
      .run({ ...patch, id });
  }
  const next = getTask(id);
  if (!next) throw new Error(`No task ${id}`);
  return next;
}

export function setStatus(id: string, status: TaskStatus, extra: Partial<Task> = {}): Task {
  return updateTask(id, { status, ...extra });
}

export function deleteTask(id: string): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

/** Tasks whose worktrees still exist — used for orphan reconciliation. */
export function tasksWithWorktrees(projectId: string): Task[] {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE project_id = ? AND worktree_path IS NOT NULL')
    .all(projectId) as Task[];
}
