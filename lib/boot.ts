import { publish } from './bus.ts';
import { holder } from './singleton.ts';
import { checkClaudeBinary, getConfig } from './config.ts';
import { getDb } from './db.ts';
import { appendEvent } from './repo/events.ts';
import { listProjects } from './repo/projects.ts';
import { listTasksByStatus, listTasks, updateTask } from './repo/tasks.ts';
import { findOrphanWorktrees, pruneWorktrees, type Orphan } from './worktree.ts';
import { orchestrator } from './agent/orchestrator.ts';

export type BootReport = {
  orphanedTasks: number;
  requeued: number;
  orphanWorktrees: Array<Orphan & { projectId: string; projectName: string }>;
  binaryOk: boolean;
  binaryReason?: string;
};

// Orphan scan results, refreshed on boot and after each manual cleanup.
//
// boot() runs in the custom server's module instance; GET /api/system reads
// this from Next's. A module-level `let` here meant the route always saw null,
// so orphaned worktrees never reached the UI.
const state = holder<{ report?: BootReport | null }>('boot');

export function getBootReport(): BootReport | null {
  return state.report ?? null;
}

/** True if a process with this pid is alive and reachable. */
function isAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission/existence check without delivering.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Reconciles state left behind by a crash or a hard restart, then re-admits
 * queued work. Runs before the server accepts connections.
 */
export async function boot(): Promise<BootReport> {
  getDb(); // opens the DB and applies the schema

  const report: BootReport = {
    orphanedTasks: 0,
    requeued: 0,
    orphanWorktrees: [],
    binaryOk: true,
  };

  const binary = checkClaudeBinary();
  report.binaryOk = binary.ok;
  report.binaryReason = binary.reason;
  if (!binary.ok) {
    console.warn(`[karkhana] ${binary.reason} Set claudeBinPath in karkhana.config.json.`);
  }

  // 1. Tasks the DB thinks are running, but whose process died with us.
  //
  // A surviving child is deliberately NOT adopted: its stdout pipe belonged to
  // the previous process, so its output is unrecoverable and its events would
  // be lost anyway. Kill it rather than leave an untracked agent writing to a
  // worktree we no longer watch.
  for (const task of listTasksByStatus('running')) {
    if (task.pid && isAlive(task.pid)) {
      try {
        process.kill(task.pid, 'SIGTERM');
        console.warn(`[karkhana] killed orphaned agent pid ${task.pid} for task ${task.id}`);
      } catch {
        /* already gone */
      }
    }
    const error = 'Orphaned by a Karkhana restart; its output could not be recovered.';
    const ev = appendEvent(task.id, 'lifecycle', { kind: 'orphaned_by_restart', pid: task.pid });
    publish({ type: 'event', taskId: task.id, event: ev });
    const updated = updateTask(task.id, {
      status: 'failed',
      error,
      ended_at: Date.now(),
      pid: null,
    });
    publish({ type: 'status', taskId: task.id, task: updated });
    report.orphanedTasks++;
  }

  // 2 & 3. Worktrees with no live task behind them. Reported, never deleted —
  // they may hold the only copy of an agent's work.
  const liveTaskIds = new Set(listTasks().map((t) => t.id));
  for (const project of listProjects()) {
    try {
      await pruneWorktrees(project);
      const orphans = await findOrphanWorktrees(project, liveTaskIds);
      for (const orphan of orphans) {
        report.orphanWorktrees.push({
          ...orphan,
          projectId: project.id,
          projectName: project.name,
        });
      }
    } catch (err) {
      // A project directory that has been moved or deleted shouldn't stop boot.
      console.warn(`[karkhana] could not scan ${project.path}: ${(err as Error).message}`);
    }
  }

  // 4. Re-admit whatever was still queued.
  report.requeued = orchestrator.requeuePersisted();

  state.report = report;

  const { concurrency, claudeBinPath } = getConfig();
  console.log(
    `[karkhana] boot: ${report.orphanedTasks} orphaned task(s), ` +
      `${report.requeued} requeued, ${report.orphanWorktrees.length} orphan worktree(s), ` +
      `concurrency ${concurrency}, binary ${claudeBinPath || '(unset)'}`,
  );
  return report;
}

/** Re-scans for orphan worktrees; used after a manual cleanup from the UI. */
export async function rescanOrphans(): Promise<BootReport['orphanWorktrees']> {
  const liveTaskIds = new Set(listTasks().map((t) => t.id));
  const found: BootReport['orphanWorktrees'] = [];
  for (const project of listProjects()) {
    try {
      await pruneWorktrees(project);
      for (const orphan of await findOrphanWorktrees(project, liveTaskIds)) {
        found.push({ ...orphan, projectId: project.id, projectName: project.name });
      }
    } catch {
      /* skip unreadable projects */
    }
  }
  if (state.report) state.report.orphanWorktrees = found;
  return found;
}
