import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  stderr: string;
  code: number | null;

  constructor(message: string, stderr: string, code: number | null) {
    super(message);
    this.name = 'GitError';
    this.stderr = stderr;
    this.code = code;
  }
}

export type GitResult = { stdout: string; stderr: string };

/**
 * Runs git in `cwd`. Diffs can be large, so the buffer is generous.
 * Throws GitError on non-zero exit unless `allowFailure` is set.
 */
export async function git(
  cwd: string,
  args: string[],
  opts: { allowFailure?: boolean } = {},
): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message: string };
    if (opts.allowFailure) {
      return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message };
    }
    throw new GitError(
      `git ${args.join(' ')} failed in ${cwd}: ${(e.stderr ?? e.message).trim()}`,
      e.stderr ?? '',
      e.code ?? null,
    );
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const { stdout } = await git(dir, ['rev-parse', '--is-inside-work-tree'], {
    allowFailure: true,
  });
  return stdout.trim() === 'true';
}

/**
 * Clones a remote URL into `destDir` (its parent is created if needed).
 * `GIT_TERMINAL_PROMPT=0` (set in `git()`) means a private repo with no
 * cached credentials or SSH key fails fast with a clear error instead of
 * hanging on a password prompt nobody can answer.
 */
export async function cloneRepo(url: string, destDir: string): Promise<void> {
  await mkdir(path.dirname(destDir), { recursive: true });
  await git(path.dirname(destDir), ['clone', url, destDir]);
}

/** Absolute path to the repo root containing `dir`. */
export async function repoRoot(dir: string): Promise<string> {
  const { stdout } = await git(dir, ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}

export async function currentBranch(dir: string): Promise<string> {
  const { stdout } = await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout.trim();
}

export async function branchExists(dir: string, branch: string): Promise<boolean> {
  const { stdout } = await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
    allowFailure: true,
  });
  return stdout.trim().length > 0;
}

/** True when there are no staged, unstaged, or untracked changes. */
export async function isClean(dir: string): Promise<boolean> {
  const { stdout } = await git(dir, ['status', '--porcelain']);
  return stdout.trim().length === 0;
}

/** Best guess at a repo's default branch, for pre-filling the project form. */
export async function guessDefaultBranch(dir: string): Promise<string> {
  const head = await git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    allowFailure: true,
  });
  const remote = head.stdout.trim().replace(/^origin\//, '');
  if (remote) return remote;

  for (const candidate of ['main', 'master', 'trunk', 'develop']) {
    if (await branchExists(dir, candidate)) return candidate;
  }
  return currentBranch(dir);
}

export type WorktreeEntry = { path: string; head: string; branch: string | null };

export async function listWorktrees(dir: string): Promise<WorktreeEntry[]> {
  const { stdout } = await git(dir, ['worktree', 'list', '--porcelain']);
  const entries: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === '' && current.path) {
      entries.push(current as WorktreeEntry);
      current = {};
    }
  }
  if (current.path) entries.push(current as WorktreeEntry);
  return entries;
}
