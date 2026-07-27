import { publish } from '../bus.ts';
import { getConfig } from '../config.ts';
import { holder } from '../singleton.ts';
import { appendEvent } from '../repo/events.ts';
import { getProject } from '../repo/projects.ts';
import {
  countByStatus,
  getTask,
  listTasksByStatus,
  updateTask,
} from '../repo/tasks.ts';
import type { Model, Task } from '../types.ts';
import {
  getTaskDiff,
  mergeTask,
  provisionTaskWorktree,
  pushToRemote,
  removeWorktree,
  type MergeResult,
  type PushResult,
} from '../worktree.ts';
import { runAgent, type RunHandle } from './runner.ts';

type Pending = { taskId: string; resume: boolean };

export class Orchestrator {
  /** Tasks with a live child process, keyed by task id. */
  private active = new Map<string, RunHandle>();
  /** FIFO of admitted-but-not-yet-started tasks. */
  private pending: Pending[] = [];
  private draining = false;

  get limit(): number {
    return getConfig().concurrency;
  }

  get runningCount(): number {
    return this.active.size;
  }

  get queuedCount(): number {
    return this.pending.length;
  }

  isRunning(taskId: string): boolean {
    return this.active.has(taskId);
  }

  /** Broadcasts the top bar's running/queued/limit counters. */
  publishStats(): void {
    publish({
      type: 'stats',
      running: this.active.size,
      queued: this.pending.length,
      limit: this.limit,
    });
  }

  /** Queues a task. Idempotent — a task already queued or running is ignored. */
  enqueue(taskId: string, opts: { resume?: boolean } = {}): void {
    if (this.active.has(taskId)) return;
    if (this.pending.some((p) => p.taskId === taskId)) return;

    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);

    const updated = updateTask(taskId, { status: 'queued', error: null });
    publish({ type: 'status', taskId, task: updated });

    this.pending.push({ taskId, resume: opts.resume ?? false });
    this.publishStats();
    void this.drain();
  }

  /**
   * Starts as many queued tasks as the concurrency limit allows.
   *
   * Guarded by `draining` because worktree creation is async: without it, two
   * overlapping calls could both see a free slot and start the same task twice.
   */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0 && this.active.size < this.limit) {
        const next = this.pending.shift()!;
        await this.start(next);
      }
    } finally {
      this.draining = false;
      this.publishStats();
    }
  }

  private async start(pending: Pending): Promise<void> {
    const task = getTask(pending.taskId);
    if (!task) return;

    // Cancelled while it sat in the queue.
    if (task.status === 'cancelled') return;

    const project = getProject(task.project_id);
    if (!project) {
      this.fail(task, `Project ${task.project_id} no longer exists.`);
      return;
    }

    let ready: Task = task;
    try {
      // A resume reuses the worktree the session was created in; a fresh run
      // (or a retry) gets a clean one.
      if (pending.resume && task.worktree_path) {
        ready = task;
      } else {
        ready = await provisionTaskWorktree(project, task);
      }
    } catch (err) {
      this.fail(task, `Could not create worktree: ${(err as Error).message}`);
      return;
    }

    const handle = runAgent(project, ready, { resume: pending.resume });
    this.active.set(task.id, handle);
    this.publishStats();

    void handle.done
      .then((outcome) => {
        const errStr = outcome.error?.toLowerCase() ?? '';
        const isQuotaError =
          errStr.includes('subscription') ||
          errStr.includes('rate') ||
          errStr.includes('limit') ||
          errStr.includes('429') ||
          errStr.includes('quota');

        if (outcome.status === 'needs_review' && getConfig().autoMerge && process.env.NODE_ENV !== 'test') {
          const freshTask = getTask(task.id);
          if (freshTask) {
            void mergeTask(project, freshTask).then((res) => {
              if (res.ok) {
                const merged = updateTask(task.id, { status: 'merged' });
                publish({ type: 'status', taskId: task.id, task: merged });
              }
            });
          }
        }

        if (outcome.status === 'failed' && isQuotaError && !ready.model.startsWith('antigravity')) {
          const ev = appendEvent(task.id, 'lifecycle', {
            kind: 'auto_fallback',
            reason: outcome.error,
            fromModel: ready.model,
            toModel: 'antigravity-flash',
          });
          publish({ type: 'event', taskId: task.id, event: ev });
          setTimeout(() => {
            void this.retry(task.id, { model: 'antigravity-flash' });
          }, 600);
        }
      })
      .finally(() => {
        this.active.delete(task.id);
        this.publishStats();
        void this.drain();
      });
  }

  private fail(task: Task, error: string): void {
    const ev = appendEvent(task.id, 'lifecycle', { kind: 'failed_to_start', error });
    publish({ type: 'event', taskId: task.id, event: ev });
    const updated = updateTask(task.id, {
      status: 'failed',
      error,
      ended_at: Date.now(),
      pid: null,
    });
    publish({ type: 'status', taskId: task.id, task: updated });
  }

  /** Stops a running task, or drops a queued one before it ever starts. */
  cancel(taskId: string): void {
    const handle = this.active.get(taskId);
    if (handle) {
      handle.cancel();
      return;
    }
    const index = this.pending.findIndex((p) => p.taskId === taskId);
    if (index !== -1) {
      this.pending.splice(index, 1);
      const updated = updateTask(taskId, {
        status: 'cancelled',
        ended_at: Date.now(),
        error: 'Cancelled before it started.',
      });
      publish({ type: 'status', taskId, task: updated });
      this.publishStats();
    }
  }

  /**
   * Re-runs a task from scratch. The old worktree and branch are destroyed and
   * the session id is cleared, so this is a genuinely fresh attempt.
   */
  async retry(taskId: string, opts: { model?: Model } = {}): Promise<void> {
    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);
    if (this.active.has(taskId)) throw new Error('Task is still running; cancel it first.');

    const project = getProject(task.project_id);
    if (project) await removeWorktree(project, task.worktree_path, task.branch);

    const config = getConfig();
    const errStr = task.error?.toLowerCase() ?? '';
    const isSubscriptionDisabled = errStr.includes('subscription') || errStr.includes('disabled');

    let targetModel = opts.model ?? task.model;
    if (isSubscriptionDisabled && ['sonnet', 'opus', 'haiku'].includes(targetModel) && !config.anthropicApiKey) {
      targetModel = 'antigravity-flash';
    }

    const updated = updateTask(taskId, {
      worktree_path: null,
      branch: null,
      session_id: null,
      exit_code: null,
      error: null,
      started_at: null,
      ended_at: null,
      model: targetModel,
    });
    publish({ type: 'status', taskId, task: updated });

    this.enqueue(taskId);
  }

  /**
   * Continues a finished task in its existing worktree via
   * `claude -p --resume <session_id>`, optionally with a follow-up prompt.
   */
  resume(taskId: string, opts: { prompt?: string } = {}): void {
    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);
    if (this.active.has(taskId)) throw new Error('Task is already running.');
    if (!task.session_id) throw new Error('No session_id captured; use Retry instead.');
    if (!task.worktree_path) throw new Error('Worktree is gone; use Retry instead.');

    if (opts.prompt?.trim()) {
      const updated = updateTask(taskId, { prompt: opts.prompt.trim() });
      publish({ type: 'status', taskId, task: updated });
    }
    this.enqueue(taskId, { resume: true });
  }

  /** Merges a reviewed task into its project's base branch. */
  async merge(taskId: string): Promise<MergeResult> {
    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);
    if (this.active.has(taskId)) throw new Error('Task is still running.');

    const project = getProject(task.project_id);
    if (!project) throw new Error('Project no longer exists.');

    const result = await mergeTask(project, task);
    const ev = appendEvent(taskId, 'lifecycle', { kind: 'merge_attempt', result });
    publish({ type: 'event', taskId, event: ev });

    if (result.ok) {
      const updated = updateTask(taskId, {
        status: 'merged',
        worktree_path: null,
        branch: null,
        error: null,
        ended_at: Date.now(),
      });
      publish({ type: 'status', taskId, task: updated });
    } else {
      const updated = updateTask(taskId, { error: result.reason });
      publish({ type: 'status', taskId, task: updated });
    }
    return result;
  }

  /**
   * Pushes the project's base branch to `origin` — a separate, explicit step
   * from merge. Merging is always local and automatic within Karkhana;
   * pushing touches a remote the user doesn't control from here, so it's
   * never bundled into merge itself.
   */
  async push(taskId: string): Promise<PushResult> {
    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);

    const project = getProject(task.project_id);
    if (!project) throw new Error('Project no longer exists.');

    const result = await pushToRemote(project);
    const ev = appendEvent(taskId, 'lifecycle', { kind: 'push_attempt', result });
    publish({ type: 'event', taskId, event: ev });
    return result;
  }

  /** Throws away a task's work: worktree and branch deleted, task cancelled. */
  async discard(taskId: string): Promise<void> {
    const task = getTask(taskId);
    if (!task) throw new Error(`No task ${taskId}`);
    if (this.active.has(taskId)) throw new Error('Task is still running; cancel it first.');

    const project = getProject(task.project_id);
    if (project) await removeWorktree(project, task.worktree_path, task.branch);

    const updated = updateTask(taskId, {
      status: 'cancelled',
      worktree_path: null,
      branch: null,
      error: 'Discarded.',
      ended_at: Date.now(),
    });
    publish({ type: 'status', taskId, task: updated });
  }

  async diff(taskId: string) {
    const task = getTask(taskId);
    if (!task) return { diff: '', stats: { filesChanged: 0, insertions: 0, deletions: 0 } };
    const project = getProject(task.project_id);
    if (!project) return { diff: '', stats: { filesChanged: 0, insertions: 0, deletions: 0 } };
    try {
      return await getTaskDiff(project, task);
    } catch {
      return { diff: '', stats: { filesChanged: 0, insertions: 0, deletions: 0 } };
    }
  }

  /** Re-queues everything left in `queued` after a restart, oldest first. */
  requeuePersisted(): number {
    const queued = listTasksByStatus('queued');
    for (const task of queued) {
      if (!this.pending.some((p) => p.taskId === task.id)) {
        this.pending.push({ taskId: task.id, resume: false });
      }
    }
    this.publishStats();
    void this.drain();
    return queued.length;
  }

  snapshot() {
    return {
      running: this.active.size,
      queued: this.pending.length,
      limit: this.limit,
      counts: countByStatus(),
      activeTaskIds: [...this.active.keys()],
    };
  }

  /** Cancels every live agent and waits briefly for them to exit. */
  async shutdown(): Promise<void> {
    this.pending = [];
    const handles = [...this.active.values()];
    for (const handle of handles) handle.cancel();
    await Promise.race([
      Promise.all(handles.map((h) => h.done)),
      new Promise((resolve) => setTimeout(resolve, 6000)),
    ]);
  }
}

// One orchestrator for the whole process: the queue and the live ChildProcess
// handles must not be duplicated across module instances.
const state = holder<{ orchestrator?: Orchestrator }>('orchestrator');

export const orchestrator: Orchestrator = (state.orchestrator ??= new Orchestrator());
