import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A throwaway git repo with one commit on `main`, for tests that need real
 * git behaviour (worktrees, merges, diffs) rather than mocks.
 *
 * The repo lives under its own mkdtemp'd parent so that a worktree root
 * created as a *sibling* of the repo (Karkhana's default) is cleaned up by
 * the same `cleanup()` call.
 */
export async function makeTempRepo(): Promise<{ root: string; cleanup: () => void }> {
  // realpath: macOS's tmpdir is under a symlink (/tmp -> /private/tmp), and
  // git reports worktree paths fully resolved — comparing against an
  // unresolved path would spuriously fail `path.resolve(...) === ...`.
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'karkhana-repo-')));
  const root = path.join(parent, 'repo');
  fs.mkdirSync(root);

  const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@karkhana.local']);
  run(['config', 'user.name', 'Karkhana Test']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture repo\n');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'init']);

  return {
    root,
    cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
  };
}

/** Polls `predicate` until it's true or `timeoutMs` elapses. */
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Absolute path to the fake `claude` binary fixture, for orchestrator/runner tests. */
export const FAKE_CLAUDE_BIN = path.join(import.meta.dirname, 'fakeClaude.mjs');

/** Directive accepted by the fake binary, JSON-encoded into a task's prompt. */
export type FakeDirective = {
  exitCode?: number;
  isError?: boolean;
  delayMs?: number;
};

export function fakePrompt(directive: FakeDirective = {}): string {
  return JSON.stringify(directive);
}
