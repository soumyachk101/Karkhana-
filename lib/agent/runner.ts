import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import type { Readable } from 'node:stream';
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

import { runBuiltinAgent } from './builtinAgent.ts';

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

export function runAgent(
  project: Project,
  task: Task,
  opts: { resume?: boolean } = {},
): RunHandle {
  const config = getConfig();

  const isClaude = ['sonnet', 'opus', 'haiku'].includes(task.model);
  const isAntigravity = task.model.startsWith('antigravity');
  const isCodex = task.model.startsWith('codex');

  // Block Claude models entirely when disabled
  if (isClaude && !config.claudeEnabled && process.env.NODE_ENV !== 'test') {
    return failFast(
      task.id,
      'Claude Code agents are disabled (subscription inactive). Switch to Antigravity or Codex, or enable Claude in Settings → API Keys.',
    );
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

  // ── Route to the correct CLI binary ──
  const agyBin = config.antigravityBinPath || '/Users/soumyachakraborty/.local/bin/agy';

  if (isAntigravity) {
    // ── Antigravity CLI (agy) path ──
    const agyModel = task.model === 'antigravity-pro' ? 'Gemini 3.1 Pro (High)' : 'Gemini 3.6 Flash (High)';
    const args = [
      '--print',
      task.prompt,
      '--model',
      agyModel,
      '--add-dir',
      cwd,
      '--dangerously-skip-permissions',
    ];

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(agyBin, args, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return failFast(task.id, `Failed to spawn agy: ${(err as Error).message}`);
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
      binary: agyBin,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          record(task.id, obj.type ?? 'agy_event', obj);
        } catch {
          record(task.id, 'output', { text: line });
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const done = new Promise<RunOutcome>((resolve) => {
      child.on('close', (code) => {
        const failed = code !== 0;
        const outcome: RunOutcome = {
          status: failed ? 'failed' : 'needs_review',
          exitCode: code,
          error: failed ? (stderr.trim() || `agy exited with code ${code}`) : null,
        };
        if (!failed) {
          record(task.id, 'result', { type: 'result', is_error: false, result: stdout.trim() || 'Antigravity agent completed.' });
        }
        patchTask(task.id, {
          status: outcome.status,
          ended_at: Date.now(),
          exit_code: outcome.exitCode,
          error: outcome.error,
          pid: null,
        });
        resolve(outcome);
      });
    });

    const cancel = () => {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, KILL_GRACE_MS);
    };

    return { taskId: task.id, pid: child.pid, cancel, done };
  }

  const CODEX_MODELS: Record<string, string> = {
    'codex-gpt5.5': 'gpt-5.5',
    'codex-gpt4o': 'gpt-4o',
    'codex-o3-mini': 'o3-mini',
  };

  const codexModel = CODEX_MODELS[task.model];
  const useCodexCli = isCodex || Boolean(codexModel);
  const codexBin = config.codexBinPath || '/Users/soumyachakraborty/.npm-global/bin/codex';

  if (useCodexCli) {
    // ── Codex CLI path ──
    const targetModel = codexModel || 'gpt-4o';
    const args = [
      'exec',
      '--json',
      '-C', cwd,
      '-s', 'danger-full-access',
      '--dangerously-bypass-approvals-and-sandbox',
      '-m', targetModel,
      task.prompt,
    ];

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(codexBin, args, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return failFast(task.id, `Failed to spawn codex: ${(err as Error).message}`);
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
      binary: codexBin,
      codexModel: targetModel,
    });

    // Codex emits JSONL on stdout when --json is used
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Try to parse and emit individual JSONL lines
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          record(task.id, obj.type ?? 'codex_event', obj);
        } catch {
          record(task.id, 'output', { text: line });
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const done = new Promise<RunOutcome>((resolve) => {
      child.on('close', (code) => {
        const failed = code !== 0;
        const outcome: RunOutcome = {
          status: failed ? 'failed' : 'needs_review',
          exitCode: code,
          error: failed ? (stderr.trim() || `codex exited with code ${code}`) : null,
        };
        if (!failed) {
          record(task.id, 'result', { type: 'result', is_error: false, result: 'Codex agent completed successfully.' });
        }
        patchTask(task.id, {
          status: outcome.status,
          ended_at: Date.now(),
          exit_code: outcome.exitCode,
          error: outcome.error,
          pid: null,
        });
        resolve(outcome);
      });
    });

    const cancel = () => {
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, KILL_GRACE_MS);
    };

    return { taskId: task.id, pid: child.pid, cancel, done };
  }

  // ── Claude CLI path ──
  const binary = checkClaudeBinary();
  if (!binary.ok) {
    return failFast(task.id, binary.reason ?? 'Agent runner binary unavailable.');
  }

  const binPath = config.claudeBinPath;
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

  // Isolate Claude config dir to avoid reading ~/.claude.json disabled subscription
  const isolatedConfigDir = path.join(process.cwd(), '.karkhana-claude-config');
  if (!fs.existsSync(isolatedConfigDir)) {
    fs.mkdirSync(isolatedConfigDir, { recursive: true });
  }

  let child: ChildProcessByStdio<null, Readable, Readable>;
  const spawnEnv = {
    ...process.env,
    CLAUDE_CODE_ENTRYPOINT: 'karkhana',
    CLAUDE_CONFIG_DIR: isolatedConfigDir,
    ...(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
    ...(config.openaiApiKey ? { OPENAI_API_KEY: config.openaiApiKey } : {}),
    ...(config.geminiApiKey ? { GEMINI_API_KEY: config.geminiApiKey } : {}),
  };
  try {
    child = spawn(binPath, args, {
      cwd,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return failFast(task.id, `Failed to spawn ${binPath}: ${(err as Error).message}`);
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
    binary: binPath,
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
