import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { holder } from './singleton.ts';

export type KarkhanaConfig = {
  /** Absolute path to the Claude Code binary. Never assumed to be on PATH. */
  claudeBinPath: string;
  /** Max agents running at once; the rest queue. */
  concurrency: number;
  /**
   * Where worktrees live. `null` means the default: `<project>/../.karkhana`,
   * i.e. a sibling of each registered repo.
   */
  worktreeRoot: string | null;
  dbPath: string;
};

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'karkhana.config.json');

/** Places Claude Code commonly lands, checked when it isn't on PATH. */
const CANDIDATE_BINARIES = [
  path.join(os.homedir(), '.claude', 'local', 'claude'),
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  '/usr/bin/claude',
];

function detectClaudeBinary(): string {
  try {
    const found = execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // not on PATH — fall through to the candidate list
  }
  for (const candidate of CANDIDATE_BINARIES) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  // Leave it empty rather than guessing; the UI surfaces this as a setup error.
  return '';
}

function defaults(): KarkhanaConfig {
  return {
    claudeBinPath: detectClaudeBinary(),
    concurrency: 3,
    worktreeRoot: null,
    dbPath: path.join(ROOT, 'karkhana.db'),
  };
}

// Shared, not module-scoped: the orchestrator reads `concurrency` from one
// module instance while the PATCH /api/config route writes it from another, so
// a per-module cache would leave a raised limit invisible until restart.
const state = holder<{ config?: KarkhanaConfig }>('config');

export function getConfig(): KarkhanaConfig {
  if (state.config) return state.config;

  let onDisk: Partial<KarkhanaConfig> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.warn(`[karkhana] ${CONFIG_PATH} is not valid JSON, using defaults:`, err);
    }
  }

  const config = { ...defaults(), ...onDisk };
  state.config = config;

  // Write the resolved config back so the detected binary path is visible and
  // editable rather than being magic.
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  }
  return config;
}

export function updateConfig(patch: Partial<KarkhanaConfig>): KarkhanaConfig {
  const next = { ...getConfig(), ...patch };
  if (next.concurrency < 1) next.concurrency = 1;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  state.config = next;
  return next;
}

/** Validates that the configured binary exists and is executable. */
export function checkClaudeBinary(): { ok: boolean; reason?: string } {
  const { claudeBinPath } = getConfig();
  if (!claudeBinPath) {
    return { ok: false, reason: 'No Claude Code binary configured or auto-detected.' };
  }
  try {
    fs.accessSync(claudeBinPath, fs.constants.X_OK);
    return { ok: true };
  } catch {
    return { ok: false, reason: `${claudeBinPath} is missing or not executable.` };
  }
}

/** Resolved worktree directory for a task, given its project. */
export function worktreePathFor(projectPath: string, taskId: string): string {
  const { worktreeRoot } = getConfig();
  const base = worktreeRoot ?? path.join(path.dirname(projectPath), '.karkhana');
  return path.join(base, taskId);
}
