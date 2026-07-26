import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Runs a one-shot shell command inside a task's worktree, for the terminal pane.
 *
 * Scope, deliberately: this is not a pty. There is no interactive stdin, no job
 * control, and no session state between calls — each command gets a fresh
 * `bash -lc` in the worktree and returns its captured output. That covers what
 * the pane is actually for (`git status`, `git log`, `npm test`, poking at what
 * the agent left behind) without the ceremony of a terminal multiplexer.
 *
 * Three guardrails, because a command that never returns would pin a request
 * handler open forever:
 *  - stdin is closed, so anything that prompts gets EOF instead of hanging;
 *  - a timeout kills the process group (SIGTERM, then SIGKILL);
 *  - output is capped, so `cat` on a huge file truncates rather than OOMs.
 *
 * Karkhana is localhost-only and unauthenticated by design, and the agents it
 * runs already have Bash in the same directories — this adds no reach that the
 * dashboard did not already have.
 */

export type ExecResult = {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
};

export const EXEC_TIMEOUT_MS = 30_000;
export const EXEC_MAX_OUTPUT = 256 * 1024;

/** True when `dir` exists and is a directory. */
export async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

export async function runInWorktree(
  worktreePath: string,
  command: string,
  opts: { timeoutMs?: number } = {},
): Promise<ExecResult> {
  const cwd = path.resolve(worktreePath);
  if (!(await isDirectory(cwd))) {
    throw new Error(`Worktree ${cwd} is gone from disk.`);
  }

  const timeoutMs = opts.timeoutMs ?? EXEC_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise<ExecResult>((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group, so the timeout can take the whole pipeline down and
      // not just the shell that spawned it.
      detached: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        // Most tools drop colour when they see a pipe; ask for it back, since
        // the pane understands ANSI now.
        FORCE_COLOR: '1',
        CLICOLOR_FORCE: '1',
        TERM: 'xterm-256color',
        COLUMNS: '160',
      },
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const collect = (chunk: string, into: 'out' | 'err') => {
      const room = EXEC_MAX_OUTPUT - (stdout.length + stderr.length);
      if (room <= 0) {
        truncated = true;
        return;
      }
      const slice = chunk.length > room ? chunk.slice(0, room) : chunk;
      if (slice.length < chunk.length) truncated = true;
      if (into === 'out') stdout += slice;
      else stderr += slice;
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => collect(chunk, 'out'));
    child.stderr.on('data', (chunk: string) => collect(chunk, 'err'));

    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 2000).unref?.();
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - startedAt,
        truncated,
        timedOut,
      });
    });
  });
}
