import '../lib/testHelpers/env.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { currentBranch, git, isClean } from './git.ts';
import { makeTempRepo } from './testHelpers/harness.ts';
import type { Project, Task } from './types.ts';
import {
  commitAll,
  createWorktree,
  findOrphanWorktrees,
  getTaskDiff,
  mergeTask,
  pushToRemote,
  removeWorktree,
} from './worktree.ts';

function makeProject(root: string, baseBranch = 'main'): Project {
  return { id: 'p_test', name: path.basename(root), path: root, base_branch: baseBranch, created_at: Date.now() };
}

function makeTask(id: string, worktreePath: string | null, branch: string | null): Task {
  return {
    id,
    project_id: 'p_test',
    title: `task ${id}`,
    prompt: 'do the thing',
    status: 'running',
    worktree_path: worktreePath,
    branch,
    session_id: null,
    model: 'sonnet',
    created_at: Date.now(),
    started_at: Date.now(),
    ended_at: null,
    pid: null,
    exit_code: null,
    error: null,
  };
}

await test('createWorktree + removeWorktree round trip', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt1');

    assert.ok(await fs.stat(worktreePath).then(() => true).catch(() => false));
    assert.equal(branch, 'karkhana/wt1');
    assert.ok(!path.resolve(worktreePath).startsWith(path.resolve(root) + path.sep));

    await removeWorktree(project, worktreePath, branch);
    assert.ok(!(await fs.stat(worktreePath).then(() => true).catch(() => false)));
  } finally {
    cleanup();
  }
});

await test('createWorktree refuses when the base branch does not exist', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root, 'no-such-branch');
    await assert.rejects(() => createWorktree(project, 'wt2'), /does not exist/);
  } finally {
    cleanup();
  }
});

await test('createWorktree clears a leftover worktree/branch from a previous attempt at the same task id', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const first = await createWorktree(project, 'wt3');
    // Simulate a retry without going through removeWorktree first.
    const second = await createWorktree(project, 'wt3');
    assert.equal(second.worktreePath, first.worktreePath);
    assert.ok(await fs.stat(second.worktreePath).then(() => true).catch(() => false));
    await removeWorktree(project, second.worktreePath, second.branch);
  } finally {
    cleanup();
  }
});

await test('getTaskDiff returns an empty diff when the task has no worktree', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const task = makeTask('wt4', null, null);
    const diff = await getTaskDiff(project, task);
    assert.deepEqual(diff, { base: '', files: [], patch: '', untracked: [], truncated: false });
  } finally {
    cleanup();
  }
});

await test('getTaskDiff surfaces new files, including nested ones, as untracked and in the patch', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt5');
    await fs.writeFile(path.join(worktreePath, 'NEW.md'), '# hello\n');
    await fs.mkdir(path.join(worktreePath, 'nested'), { recursive: true });
    await fs.writeFile(path.join(worktreePath, 'nested', 'deep.txt'), 'hi\n');

    const task = makeTask('wt5', worktreePath, branch);
    const diff = await getTaskDiff(project, task);

    assert.ok(diff.untracked.includes('NEW.md'));
    assert.ok(diff.untracked.includes('nested/deep.txt'));
    assert.ok(diff.files.some((f) => f.path === 'NEW.md'));
    assert.ok(diff.files.some((f) => f.path === 'nested/deep.txt'));
    assert.ok(diff.patch.includes('hello'));
  } finally {
    cleanup();
  }
});

await test('getTaskDiff resolves a rename to the new path instead of the raw "old => new" numstat field', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    // A committed file to rename, so the rename is relative to the merge base.
    await fs.writeFile(path.join(root, 'original.txt'), 'line1\nline2\nline3\n');
    await git(root, ['add', '-A']);
    await git(root, ['commit', '-q', '-m', 'add original.txt']);

    const { worktreePath, branch } = await createWorktree(project, 'wt6');
    await git(worktreePath, ['mv', 'original.txt', 'renamed.txt']);
    await fs.writeFile(path.join(worktreePath, 'renamed.txt'), 'line1\nline2\nline3\nline4\n');

    const task = makeTask('wt6', worktreePath, branch);
    const diff = await getTaskDiff(project, task);

    const renamedEntry = diff.files.find((f) => f.path === 'renamed.txt');
    assert.ok(renamedEntry, `expected a clean "renamed.txt" entry, got paths: ${diff.files.map((f) => f.path)}`);
    assert.ok(!diff.files.some((f) => f.path.includes('=>')), 'no entry should contain the raw rename arrow');
  } finally {
    cleanup();
  }
});

await test('getTaskDiff marks binary files without added/deleted counts', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt7');
    await fs.writeFile(path.join(worktreePath, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 4]));

    const task = makeTask('wt7', worktreePath, branch);
    const diff = await getTaskDiff(project, task);
    const entry = diff.files.find((f) => f.path === 'blob.bin');
    assert.deepEqual(entry, { path: 'blob.bin', added: 0, deleted: 0, binary: true });
  } finally {
    cleanup();
  }
});

await test('getTaskDiff truncates patches over 2MB and flags it', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt8');
    const big = Array.from({ length: 60_000 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n');
    await fs.writeFile(path.join(worktreePath, 'big.txt'), big);

    const task = makeTask('wt8', worktreePath, branch);
    const diff = await getTaskDiff(project, task);
    assert.equal(diff.truncated, true);
    assert.equal(diff.patch.length, 2 * 1024 * 1024);
  } finally {
    cleanup();
  }
});

await test('commitAll is a no-op on a clean tree and commits everything on a dirty one', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath } = await createWorktree(project, 'wt9');

    assert.equal(await commitAll(worktreePath, 'nothing to do'), false);

    await fs.writeFile(path.join(worktreePath, 'work.txt'), 'work\n');
    assert.equal(await commitAll(worktreePath, 'karkhana: did work'), true);
    assert.equal(await isClean(worktreePath), true);

    const log = await git(worktreePath, ['log', '-1', '--format=%s']);
    assert.equal(log.stdout.trim(), 'karkhana: did work');
  } finally {
    cleanup();
  }
});

await test('mergeTask refuses when the main tree is not on the base branch, and leaves it untouched', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt10');
    await fs.writeFile(path.join(worktreePath, 'x.txt'), 'x\n');

    await git(root, ['checkout', '-q', '-b', 'not-main']);
    const task = makeTask('wt10', worktreePath, branch);
    const result = await mergeTask(project, task);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /not-main/);
      assert.ok(result.manualCommand?.includes('merge --no-ff'));
    }
    assert.equal(await currentBranch(root), 'not-main');
  } finally {
    cleanup();
  }
});

await test('mergeTask refuses when the main tree is dirty, and leaves it untouched', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt11');
    await fs.writeFile(path.join(root, 'dirty.txt'), 'uncommitted\n');

    const task = makeTask('wt11', worktreePath, branch);
    const result = await mergeTask(project, task);

    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /uncommitted changes/);
    assert.equal(await isClean(root), false);
    const status = await git(root, ['status', '--porcelain']);
    assert.equal(status.stdout.trim(), '?? dirty.txt');
  } finally {
    cleanup();
  }
});

await test('mergeTask succeeds, auto-commits worktree leftovers, and removes the worktree', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const { worktreePath, branch } = await createWorktree(project, 'wt12');
    await fs.writeFile(path.join(worktreePath, 'feature.txt'), 'a feature\n');

    const task = { ...makeTask('wt12', worktreePath, branch), title: 'add a feature' };
    const result = await mergeTask(project, task);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.committed, true);
      assert.equal(result.mergedInto, 'main');
    }
    assert.ok(await fs.stat(path.join(root, 'feature.txt')).then(() => true).catch(() => false));
    assert.ok(!(await fs.stat(worktreePath).then(() => true).catch(() => false)));
  } finally {
    cleanup();
  }
});

await test('mergeTask on conflict aborts and leaves the main tree byte-identical to before', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    await fs.writeFile(path.join(root, 'shared.txt'), 'original\n');
    await git(root, ['add', '-A']);
    await git(root, ['commit', '-q', '-m', 'add shared.txt']);

    const { worktreePath, branch } = await createWorktree(project, 'wt13');
    await fs.writeFile(path.join(worktreePath, 'shared.txt'), 'from the task\n');

    // Main diverges from the task's fork point by touching the same line.
    await fs.writeFile(path.join(root, 'shared.txt'), 'from main\n');
    await git(root, ['commit', '-aq', '-m', 'edit shared.txt on main']);

    const headBefore = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
    const statusBefore = (await git(root, ['status', '--porcelain'])).stdout;

    const task = { ...makeTask('wt13', worktreePath, branch), title: 'edit shared.txt' };
    const result = await mergeTask(project, task);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.conflicts?.includes('shared.txt'));
      assert.match(result.reason, /conflict/i);
    }

    const headAfter = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
    const statusAfter = (await git(root, ['status', '--porcelain'])).stdout;
    assert.equal(headAfter, headBefore, 'HEAD must not move on a conflicted merge');
    assert.equal(statusAfter, statusBefore, 'the main tree must come back byte-identical after --abort');
    assert.equal(await currentBranch(root), 'main');

    // The worktree's own commit survives — nothing here should have touched it.
    assert.ok(await fs.stat(worktreePath).then(() => true).catch(() => false));
    await removeWorktree(project, worktreePath, branch);
  } finally {
    cleanup();
  }
});

await test('findOrphanWorktrees ignores the project root and non-karkhana branches, flags unknown task ids, skips live ones', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const parent = path.dirname(root);

    await git(root, ['worktree', 'add', '-q', path.join(parent, 'wt-other'), '-b', 'some-other-branch']);
    const { worktreePath: liveWt, branch: liveBranch } = await createWorktree(project, 'live1');
    const { worktreePath: deadWt } = await createWorktree(project, 'dead1');

    const orphans = await findOrphanWorktrees(project, new Set(['live1']));

    assert.ok(!orphans.some((o) => path.resolve(o.path) === path.resolve(root)));
    assert.ok(!orphans.some((o) => o.branch === 'some-other-branch'));
    assert.ok(!orphans.some((o) => path.resolve(o.path) === path.resolve(liveWt)));
    assert.ok(orphans.some((o) => path.resolve(o.path) === path.resolve(deadWt)));

    await removeWorktree(project, liveWt, liveBranch);
  } finally {
    cleanup();
  }
});

await test('pushToRemote refuses when there is no origin remote configured', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = makeProject(root);
    const result = await pushToRemote(project);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /No "origin" remote/);
  } finally {
    cleanup();
  }
});

await test('pushToRemote refuses when the main tree is not on the base branch', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    await git(root, ['checkout', '-q', '-b', 'not-main']);
    const project = makeProject(root);
    const result = await pushToRemote(project);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /not-main/);
  } finally {
    cleanup();
  }
});

await test('pushToRemote pushes the base branch to a real origin', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const bareDir = path.join(path.dirname(root), 'bare-origin.git');
    await fs.mkdir(bareDir, { recursive: true });
    await git(bareDir, ['init', '-q', '--bare']);
    await git(root, ['remote', 'add', 'origin', bareDir]);

    const project = makeProject(root);
    const result = await pushToRemote(project);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.remote, 'origin');
      assert.equal(result.branch, 'main');
    }

    const headInRoot = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
    const headInBare = (await git(bareDir, ['rev-parse', 'main'])).stdout.trim();
    assert.equal(headInBare, headInRoot);

    await fs.rm(bareDir, { recursive: true, force: true });
  } finally {
    cleanup();
  }
});
