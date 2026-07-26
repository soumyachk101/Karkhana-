export const TASK_STATUSES = [
  'queued',
  'running',
  'needs_review',
  'merged',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MODELS = ['haiku', 'sonnet', 'opus'] as const;
export type Model = (typeof MODELS)[number];

export type Project = {
  id: string;
  name: string;
  path: string;
  base_branch: string;
  created_at: number;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  worktree_path: string | null;
  branch: string | null;
  session_id: string | null;
  model: Model;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  pid: number | null;
  exit_code: number | null;
  error: string | null;
};

/**
 * Event types we persist. `system`/`assistant`/`user`/`result` mirror Claude
 * Code's stream-json shapes verbatim; `stderr` and `lifecycle` are ours.
 */
export type EventType = 'system' | 'assistant' | 'user' | 'result' | 'stderr' | 'lifecycle';

export type TaskEvent = {
  id: number;
  task_id: string;
  type: EventType;
  payload_json: string;
  ts: number;
};

/** Server → client WebSocket frames. */
export type ServerFrame =
  | { type: 'event'; taskId: string; event: TaskEvent }
  | { type: 'status'; taskId: string; task: Task }
  | { type: 'stats'; running: number; queued: number; limit: number }
  | { type: 'replay_done'; taskId: string };

/** Client → server WebSocket frames. */
export type ClientFrame =
  | { type: 'subscribe'; taskId: string }
  | { type: 'unsubscribe'; taskId: string };
