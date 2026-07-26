import { getDb } from '../db.ts';
import type { EventType, TaskEvent } from '../types.ts';

export function appendEvent(taskId: string, type: EventType, payload: unknown): TaskEvent {
  const ts = Date.now();
  const payload_json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const info = getDb()
    .prepare('INSERT INTO events (task_id, type, payload_json, ts) VALUES (?, ?, ?, ?)')
    .run(taskId, type, payload_json, ts);

  return {
    id: Number(info.lastInsertRowid),
    task_id: taskId,
    type,
    payload_json,
    ts,
  };
}

/** Events for a task, oldest first. `afterId` supports incremental catch-up. */
export function listEvents(taskId: string, afterId = 0, limit = 5000): TaskEvent[] {
  return getDb()
    .prepare('SELECT * FROM events WHERE task_id = ? AND id > ? ORDER BY id ASC LIMIT ?')
    .all(taskId, afterId, limit) as TaskEvent[];
}

export function countEvents(taskId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM events WHERE task_id = ?')
    .get(taskId) as { n: number };
  return row.n;
}

export function deleteEvents(taskId: string): void {
  getDb().prepare('DELETE FROM events WHERE task_id = ?').run(taskId);
}
