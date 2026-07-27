import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { holder } from './singleton.ts';

export type KarkhanaConfig = {
  /** Absolute path to the Claude Code binary. Never assumed to be on PATH. */
  claudeBinPath: string;
  /** Absolute path to the Antigravity Agent binary. */
  antigravityBinPath: string;
  /** Absolute path to the OpenAI Codex binary. */
  codexBinPath: string;
  /** Whether Claude Code agents are enabled. Set to false when subscription is inactive. */
  claudeEnabled: boolean;
  /** Custom Anthropic API Key (bypasses organization subscription restrictions). */
  anthropicApiKey?: string;
  /** Custom OpenAI API Key. */
  openaiApiKey?: string;
  /** Custom Gemini / Antigravity API Key. */
  geminiApiKey?: string;
  /** Max agents running at once; the rest queue. */
  concurrency: number;
  worktreeRoot: string | null;
  /** Whether tasks automatically merge to local project folder when completed. Default: true. */
  autoMerge: boolean;
  dbPath: string;
};

// Where machine-local state lives: karkhana.config.json and karkhana.db. The
// cwd is right when started through npm, but a service unit starts in `/`, so
// KARKHANA_HOME exists to pin it.
const ROOT = process.env.KARKHANA_HOME ?? process.cwd();
const CONFIG_PATH = path.join(ROOT, 'karkhana.config.json');

function detectNamedBinary(name: string, candidates: string[]): string {
  try {
    const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // not on PATH
  }
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

const safeHomedir = (): string => {
  try {
    const h = os.homedir();
    if (h && fs.existsSync(h)) return h;
  } catch {
    /* fallback below */
  }
  return '/tmp';
};

function detectClaudeBinary(): string {
  const home = safeHomedir();
  return detectNamedBinary('claude', [
    path.join(home, '.claude', 'local', 'claude'),
    path.join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]);
}

function detectAntigravityBinary(): string {
  const home = safeHomedir();
  const found = detectNamedBinary('agy', [
    path.join(home, '.local', 'bin', 'agy'),
    '/opt/homebrew/bin/agy',
    '/usr/local/bin/agy',
    '/usr/bin/agy',
  ]);
  if (found) return found;

  return detectNamedBinary('antigravity', [
    path.join(home, '.antigravity', 'bin', 'antigravity'),
    path.join(home, '.local', 'bin', 'antigravity'),
    '/opt/homebrew/bin/antigravity',
    '/usr/local/bin/antigravity',
    '/usr/bin/antigravity',
  ]);
}

function detectCodexBinary(): string {
  const home = safeHomedir();
  return detectNamedBinary('codex', [
    path.join(home, '.codex', 'bin', 'codex'),
    path.join(home, '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    '/usr/bin/codex',
  ]);
}

function defaults(): KarkhanaConfig {
  return {
    claudeBinPath: detectClaudeBinary(),
    antigravityBinPath: detectAntigravityBinary(),
    codexBinPath: detectCodexBinary(),
    claudeEnabled: false,
    autoMerge: true,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    concurrency: 10,
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
    fs.mkdirSync(ROOT, { recursive: true }); // KARKHANA_HOME may not exist yet
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  }
  return config;
}

/**
 * Validates and clamps a config patch before it's merged.
 */
function sanitizePatch(patch: Partial<KarkhanaConfig>): Partial<KarkhanaConfig> {
  const clean: Partial<KarkhanaConfig> = { ...patch };
  if ('concurrency' in clean) {
    const n = Number(clean.concurrency);
    clean.concurrency = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
  }
  if ('claudeBinPath' in clean && typeof clean.claudeBinPath !== 'string') {
    delete clean.claudeBinPath;
  }
  if ('anthropicApiKey' in clean && typeof clean.anthropicApiKey !== 'string') {
    delete clean.anthropicApiKey;
  }
  if ('openaiApiKey' in clean && typeof clean.openaiApiKey !== 'string') {
    delete clean.openaiApiKey;
  }
  if ('geminiApiKey' in clean && typeof clean.geminiApiKey !== 'string') {
    delete clean.geminiApiKey;
  }
  if ('worktreeRoot' in clean && clean.worktreeRoot !== null && typeof clean.worktreeRoot !== 'string') {
    delete clean.worktreeRoot;
  }
  if ('claudeEnabled' in clean) {
    clean.claudeEnabled = Boolean(clean.claudeEnabled);
  }
  return clean;
}

export function updateConfig(patch: Partial<KarkhanaConfig>): KarkhanaConfig {
  const next = { ...getConfig(), ...sanitizePatch(patch) };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  state.config = next;
  return next;
}

/** Validates that at least one configured agent binary exists and is executable. */
export function checkClaudeBinary(): { ok: boolean; reason?: string } {
  const { claudeBinPath, antigravityBinPath, codexBinPath } = getConfig();
  const paths = [claudeBinPath, antigravityBinPath, codexBinPath].filter(Boolean);
  if (paths.length === 0) {
    return { ok: false, reason: 'No Agent runner binary (Claude, Antigravity, or Codex) configured or auto-detected.' };
  }
  for (const p of paths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return { ok: true };
    } catch {}
  }
  return { ok: false, reason: 'Configured agent binaries are missing or not executable.' };
}

/** Resolved worktree directory for a task, given its project. */
export function worktreePathFor(projectPath: string, taskId: string): string {
  const { worktreeRoot } = getConfig();
  const base = worktreeRoot ?? path.join(path.dirname(projectPath), '.karkhana');
  return path.join(base, taskId);
}
