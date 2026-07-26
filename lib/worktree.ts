import fs from 'node:fs/promises';
import path from 'node:path';
import { publish } from './bus.ts';
import { worktreePathFor } from './config.ts';
import { branchExists, git, isClean, listWorktrees, currentBranch } from './git.ts';
import { updateTask } from './repo/tasks.ts';
import type { Project, Task } from './types.ts';

export const BRANCH_PREFIX = 'karkhana/';

export function branchFor(taskId: string): string {
  return `${BRANCH_PREFIX}${taskId}`;
}

/**
 * Creates the isolated worktree a task's agent will run in.
 *
 * `git worktree add <path> -b karkhana/<taskId> <base>` gives the task its own
 * working directory and its own branch off the project's base branch. Two tasks
 * on the same repo share only `.git/objects`, which git already makes safe for
 * concurrent access.
 */
export async function createWorktree(
  project: Project,
  taskId: string,
): Promise<{ worktreePath: string; branch: string }> {
  const worktreePath = worktreePathFor(project.path, taskId);
  const branch = branchFor(taskId);

  if (!(await branchExists(project.path, project.base_branch))) {
    throw new Error(
      `Base branch "${project.base_branch}" does not exist in ${project.path}. ` +
        `Update the project's base branch and try again.`,
    );
  }

  // A leftover worktree/branch from a previous run of this same task id would
  // make `worktree add` fail; clear both first so retries are clean.
  await removeWorktree(project, worktreePath, branch);

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await git(project.path, ['worktree', 'add', worktreePath, '-b', branch, project.base_branch]);

  return { worktreePath, branch };
}

/**
 * Creates a task's worktree *and* records it on the task row.
 *
 * Always use this rather than calling `createWorktree` directly: a worktree
 * that exists on disk but not in the database is invisible to the diff view,
 * the merge path, and orphan reconciliation.
 */
export async function provisionTaskWorktree(project: Project, task: Task): Promise<Task> {
  const { worktreePath, branch } = await createWorktree(project, task.id);
  const updated = updateTask(task.id, { worktree_path: worktreePath, branch });
  publish({ type: 'status', taskId: task.id, task: updated });
  return updated;
}

/**
 * Tears down a worktree and its branch. Safe to call when either is already
 * gone — this runs on the cleanup path, where half-existing state is normal.
 */
export async function removeWorktree(
  project: Project,
  worktreePath: string | null,
  branch: string | null,
): Promise<void> {
  if (worktreePath) {
    await git(project.path, ['worktree', 'remove', '--force', worktreePath], {
      allowFailure: true,
    });
    // `worktree remove` refuses if the dir vanished from under git; prune fixes
    // the administrative record.
    await git(project.path, ['worktree', 'prune'], { allowFailure: true });
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  }
  if (branch) {
    await git(project.path, ['branch', '-D', branch], { allowFailure: true });
  }
}

export type DiffFile = {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
};

export type TaskDiff = {
  base: string;
  files: DiffFile[];
  patch: string;
  untracked: string[];
  truncated: boolean;
};

const MAX_PATCH_BYTES = 2 * 1024 * 1024;

/**
 * git's numstat path field for a rename is `old => new` or, when old and new
 * share a prefix/suffix, `common/{old => new}/tail`. Reduce either to the
 * resulting path — otherwise it renders as one garbled filename.
 */
function resolveDiffPath(field: string): string {
  const braced = field.match(/^(.*)\{.* => (.*)\}(.*)$/);
  if (braced) return `${braced[1]}${braced[2]}${braced[3]}`;
  const plain = field.match(/^.* => (.*)$/);
  return plain ? plain[1] : field;
}

/**
 * Everything the agent changed, relative to where its branch forked from base.
 *
 * Agents usually leave work uncommitted, so this diffs the *working tree*
 * against the merge base rather than HEAD against HEAD. `add --intent-to-add`
 * makes new files show up as diffs without staging their contents.
 */
export async function getTaskDiff(project: Project, task: Task): Promise<TaskDiff> {
  if (!task.worktree_path) {
    return { base: '', files: [], patch: '', untracked: [], truncated: false };
  }
  const wt = task.worktree_path;

  const { stdout: mergeBaseOut } = await git(wt, ['merge-base', project.base_branch, 'HEAD'], {
    allowFailure: true,
  });
  const base = mergeBaseOut.trim() || project.base_branch;

  const { stdout: untrackedOut } = await git(wt, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  const untracked = untrackedOut.split('\n').filter(Boolean);

  if (untracked.length) {
    await git(wt, ['add', '--intent-to-add', '--', '.'], { allowFailure: true });
  }

  const { stdout: numstat } = await git(wt, ['diff', '--numstat', base]);
  const files: DiffFile[] = numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, filePath] = line.split('\t');
      const binary = added === '-' || deleted === '-';
      return {
        path: resolveDiffPath(filePath ?? ''),
        added: binary ? 0 : Number(added),
        deleted: binary ? 0 : Number(deleted),
        binary,
      };
    });

  const { stdout: patch } = await git(wt, ['diff', base]);
  const truncated = patch.length > MAX_PATCH_BYTES;

  return {
    base,
    files,
    patch: truncated ? patch.slice(0, MAX_PATCH_BYTES) : patch,
    untracked,
    truncated,
  };
}

/** True if the worktree has anything uncommitted. */
export async function hasUncommittedWork(worktreePath: string): Promise<boolean> {
  return !(await isClean(worktreePath));
}

/** Commits everything in the worktree. No-op when the tree is already clean. */
export async function commitAll(worktreePath: string, message: string): Promise<boolean> {
  if (await isClean(worktreePath)) return false;
  await git(worktreePath, ['add', '--all']);
  await git(worktreePath, [
    '-c',
    'user.name=Karkhana',
    '-c',
    'user.email=karkhana@localhost',
    'commit',
    '--no-verify',
    '-m',
    message,
  ]);
  return true;
}

export type MergeResult =
  | { ok: true; committed: boolean; mergedInto: string }
  | { ok: false; reason: string; conflicts?: string[]; manualCommand?: string };

/**
 * Merges a task's branch into the project's base branch.
 *
 * git will not check out one branch in two worktrees, so the merge has to
 * happen in the main working tree. We refuse unless it is clean and already on
 * the base branch, and we abort rather than leaving a half-merged main tree
 * behind — a conflicted main tree would block every later merge.
 */
export async function mergeTask(project: Project, task: Task): Promise<MergeResult> {
  if (!task.branch || !task.worktree_path) {
    return { ok: false, reason: 'Task has no worktree to merge.' };
  }

  const manualCommand = `git -C ${project.path} merge --no-ff ${task.branch}`;

  const onBranch = await currentBranch(project.path);
  if (onBranch !== project.base_branch) {
    return {
      ok: false,
      reason: `${project.path} is on "${onBranch}", not the base branch "${project.base_branch}". Switch to it and retry.`,
      manualCommand,
    };
  }
  if (!(await isClean(project.path))) {
    return {
      ok: false,
      reason: `${project.path} has uncommitted changes. Karkhana will not merge into a dirty working tree.`,
      manualCommand,
    };
  }

  const committed = await commitAll(task.worktree_path, `karkhana: ${task.title}`);

  const merge = await git(
    project.path,
    ['merge', '--no-ff', '-m', `karkhana: ${task.title} (${task.id})`, task.branch],
    { allowFailure: true },
  );

  const conflicted = await git(project.path, ['diff', '--name-only', '--diff-filter=U'], {
    allowFailure: true,
  });
  const conflicts = conflicted.stdout.split('\n').filter(Boolean);

  if (conflicts.length) {
    await git(project.path, ['merge', '--abort'], { allowFailure: true });
    return {
      ok: false,
      reason: `Merge conflicts in ${conflicts.length} file(s). The main working tree was left untouched.`,
      conflicts,
      manualCommand,
    };
  }

  // No conflicts but git still failed — surface whatever it said.
  if (merge.stderr && /error|fatal/i.test(merge.stderr)) {
    return { ok: false, reason: merge.stderr.trim(), manualCommand };
  }

  await removeWorktree(project, task.worktree_path, task.branch);
  return { ok: true, committed, mergedInto: project.base_branch };
}

export type PushResult = { ok: true; remote: string; branch: string } | { ok: false; reason: string };

/**
 * Pushes the project's base branch to its `origin` remote — the explicit,
 * user-triggered step after a merge for repos that were cloned from GitHub
 * (or anywhere else). Never automatic: Karkhana merges locally on its own,
 * but pushing touches a shared remote, so it only happens when asked.
 *
 * Uses whatever credential helper or SSH key already authenticates a manual
 * `git push` on this machine — same as `cloneRepo`, there is no separate
 * auth layer of Karkhana's own.
 */
export async function pushToRemote(project: Project): Promise<PushResult> {
  const onBranch = await currentBranch(project.path);
  if (onBranch !== project.base_branch) {
    return {
      ok: false,
      reason: `${project.path} is on "${onBranch}", not the base branch "${project.base_branch}". Switch to it and retry.`,
    };
  }

  const remotes = await git(project.path, ['remote'], { allowFailure: true });
  if (!remotes.stdout.split('\n').map((r) => r.trim()).includes('origin')) {
    return { ok: false, reason: `No "origin" remote configured for ${project.path}.` };
  }

  try {
    await git(project.path, ['push', 'origin', project.base_branch]);
    return { ok: true, remote: 'origin', branch: project.base_branch };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export type Orphan = { path: string; branch: string | null; reason: string };

/**
 * Karkhana worktrees with no live task behind them — left over from a crash, a
 * deleted task, or a manual `git worktree add`. Never auto-removed: they may
 * hold the only copy of an agent's work.
 */
export async function findOrphanWorktrees(
  project: Project,
  liveTaskIds: Set<string>,
): Promise<Orphan[]> {
  const worktrees = await listWorktrees(project.path);
  const orphans: Orphan[] = [];

  for (const wt of worktrees) {
    if (path.resolve(wt.path) === path.resolve(project.path)) continue;
    if (!wt.branch?.startsWith(BRANCH_PREFIX)) continue;

    const taskId = wt.branch.slice(BRANCH_PREFIX.length);
    if (liveTaskIds.has(taskId)) continue;

    orphans.push({
      path: wt.path,
      branch: wt.branch,
      reason: `No task ${taskId} in the database`,
    });
  }
  return orphans;
}

/** Drops administrative records for worktrees whose directories are gone. */
export async function pruneWorktrees(project: Project): Promise<void> {
  await git(project.path, ['worktree', 'prune'], { allowFailure: true });
}
