import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { checkClaudeBinary, getConfig } from '../config.ts';
import { publish } from '../bus.ts';
import { appendEvent } from '../repo/events.ts';
import { getTask, updateTask } from '../repo/tasks.ts';
import type { Project, Task, TaskStatus } from '../types.ts';
import {
  StreamJsonParser,
  extractSessionId,
  normalizeEvent,
  parseResult,
  type RawEvent,
} from './streamParser.ts';

export const ALLOWED_TOOLS = 'Read,Write,Edit,Bash,Glob,Grep';

/** How long a cancelled agent gets to exit on SIGTERM before SIGKILL. */
const KILL_GRACE_MS = 5000;

export type RunOutcome = {
  status: Extract<TaskStatus, 'needs_review' | 'failed' | 'cancelled'>;
  exitCode: number | null;
  error: string | null;
};

export type RunHandle = {
  taskId: string;
  pid: number | undefined;
  cancel: () => void;
  done: Promise<RunOutcome>;
};

function record(taskId: string, type: string, payload: unknown): void {
  const event = appendEvent(taskId, type as never, payload);
  publish({ type: 'event', taskId, event });
}

function patchTask(taskId: string, patch: Partial<Task>): Task {
  const task = updateTask(taskId, patch);
  publish({ type: 'status', taskId, task });
  return task;
}

/**
 * Spawns a headless Claude Code agent for a task and streams its output into
 * the database and onto the bus.
 *
 * The agent's cwd is always the task's own worktree — never the project's main
 * working tree. That invariant is asserted here rather than trusted, because
 * it's the one mistake that would let two agents corrupt each other's work.
 */
export function runAgent(
  project: Project,
  task: Task,
  opts: { resume?: boolean } = {},
): RunHandle {
  const { claudeBinPath } = getConfig();

  const binary = checkClaudeBinary();
  if (!binary.ok) {
    return failFast(task.id, binary.reason ?? 'Claude Code binary unavailable.');
  }
  if (!task.worktree_path) {
    return failFast(task.id, 'Task has no worktree; refusing to run.');
  }

  const cwd = path.resolve(task.worktree_path);
  if (cwd === path.resolve(project.path)) {
    return failFast(
      task.id,
      `Refusing to run an agent in the main working tree (${project.path}). Worktrees only.`,
    );
  }

  const args = [
    '-p',
    task.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--allowedTools',
    ALLOWED_TOOLS,
    '--model',
    task.model,
  ];
  if (opts.resume) {
    if (!task.session_id) {
      return failFast(task.id, 'Cannot resume: no session_id was captured for this task.');
    }
    args.push('--resume', task.session_id);
  }

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(claudeBinPath, args, {
      cwd,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'karkhana' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return failFast(task.id, `Failed to spawn ${claudeBinPath}: ${(err as Error).message}`);
  }

  patchTask(task.id, {
    status: 'running',
    started_at: Date.now(),
    ended_at: null,
    pid: child.pid ?? null,
    exit_code: null,
    error: null,
  });
  record(task.id, 'lifecycle', {
    kind: opts.resume ? 'resumed' : 'spawned',
    pid: child.pid,
    cwd,
    model: task.model,
    binary: claudeBinPath,
    resumedSession: opts.resume ? task.session_id : undefined,
  });

  const parser = new StreamJsonParser();
  let sessionCaptured = Boolean(task.session_id);
  let resultSummary: ReturnType<typeof parseResult> | null = null;
  let cancelled = false;
  let killTimer: NodeJS.Timeout | null = null;

  const handleEvent = (raw: RawEvent) => {
    // Capture the session id from the first frame that carries one, so a run
    // that dies mid-flight is still resumable.
    if (!sessionCaptured) {
      const sessionId = extractSessionId(raw);
      if (sessionId) {
        sessionCaptured = true;
        patchTask(task.id, { session_id: sessionId });
      }
    }
    if (raw.type === 'result') resultSummary = parseResult(raw);

    const normalized = normalizeEvent(raw);
    if (normalized) record(task.id, String(raw.type ?? 'unknown'), normalized);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    for (const item of parser.push(chunk)) {
      if (item.ok) handleEvent(item.event);
      else record(task.id, 'stderr', { source: 'stdout', unparsed: item.line });
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    const text = chunk.trim();
    if (text) record(task.id, 'stderr', { source: 'stderr', text });
  });

  const done = new Promise<RunOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);

      for (const item of parser.flush()) {
        if (item.ok) handleEvent(item.event);
        else record(task.id, 'stderr', { source: 'stdout', unparsed: item.line });
      }

      record(task.id, 'lifecycle', {
        kind: 'exited',
        status: outcome.status,
        exitCode: outcome.exitCode,
        error: outcome.error,
        summary: resultSummary,
      });
      patchTask(task.id, {
        status: outcome.status,
        ended_at: Date.now(),
        exit_code: outcome.exitCode,
        error: outcome.error,
        pid: null,
      });
      resolve(outcome);
    };

    child.on('error', (err) => {
      settle({ status: 'failed', exitCode: null, error: `spawn error: ${err.message}` });
    });

    child.on('close', (code, signal) => {
      if (cancelled) {
        settle({ status: 'cancelled', exitCode: code, error: 'Cancelled by user.' });
        return;
      }
      if (code !== 0) {
        settle({
          status: 'failed',
          exitCode: code,
          error: signal
            ? `Agent killed by ${signal}.`
            : `Agent exited with code ${code}.`,
        });
        return;
      }
      // Exit 0 but the agent itself reported failure (e.g. hit max turns).
      if (resultSummary?.isError) {
        settle({
          status: 'failed',
          exitCode: code,
          error: resultSummary.result ?? `Agent reported ${resultSummary.subtype ?? 'an error'}.`,
        });
        return;
      }
      settle({ status: 'needs_review', exitCode: code, error: null });
    });
  });

  const cancel = () => {
    if (cancelled || child.exitCode !== null) return;
    cancelled = true;
    record(task.id, 'lifecycle', { kind: 'cancelling', pid: child.pid });
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      if (child.exitCode === null) {
        record(task.id, 'lifecycle', { kind: 'sigkill', pid: child.pid });
        child.kill('SIGKILL');
      }
    }, KILL_GRACE_MS);
  };

  return { taskId: task.id, pid: child.pid, cancel, done };
}

/** Marks a task failed without ever spawning, but keeps the RunHandle shape. */
function failFast(taskId: string, error: string): RunHandle {
  const existing = getTask(taskId);
  if (existing) {
    record(taskId, 'lifecycle', { kind: 'failed_to_start', error });
    patchTask(taskId, {
      status: 'failed',
      error,
      ended_at: Date.now(),
      pid: null,
    });
  }
  return {
    taskId,
    pid: undefined,
    cancel: () => {},
    done: Promise.resolve({ status: 'failed', exitCode: null, error }),
  };
}
