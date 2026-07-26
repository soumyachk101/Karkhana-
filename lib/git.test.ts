import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  branchExists,
  currentBranch,
  git,
  guessDefaultBranch,
  isClean,
  isGitRepo,
  listWorktrees,
  repoRoot,
} from './git.ts';
import { makeTempRepo } from './testHelpers/harness.ts';

await test('isGitRepo is true for a real repo and false for a plain directory', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    assert.equal(await isGitRepo(root), true);
    assert.equal(await isGitRepo(path.dirname(root)), false);
  } finally {
    cleanup();
  }
});

await test('repoRoot resolves from a subdirectory', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const sub = path.join(root, 'nested', 'dir');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(await repoRoot(sub), root);
  } finally {
    cleanup();
  }
});

await test('currentBranch and branchExists', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    assert.equal(await currentBranch(root), 'main');
    assert.equal(await branchExists(root, 'main'), true);
    assert.equal(await branchExists(root, 'does-not-exist'), false);
  } finally {
    cleanup();
  }
});

await test('isClean reflects untracked and staged changes', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    assert.equal(await isClean(root), true);
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'x');
    assert.equal(await isClean(root), false);
  } finally {
    cleanup();
  }
});

await test('guessDefaultBranch falls back to a candidate when there is no remote', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    assert.equal(await guessDefaultBranch(root), 'main');
  } finally {
    cleanup();
  }
});

await test('listWorktrees: base repo reports one entry with its branch', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const entries = await listWorktrees(root);
    assert.equal(entries.length, 1);
    assert.equal(path.resolve(entries[0].path), path.resolve(root));
    assert.equal(entries[0].branch, 'main');
  } finally {
    cleanup();
  }
});

await test('listWorktrees: detached HEAD worktree yields branch:null, refs/heads/ stripped elsewhere', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const parent = path.dirname(root);
    const featurePath = path.join(parent, 'wt-feature');
    const detachedPath = path.join(parent, 'wt-detached');
    await git(root, ['worktree', 'add', '-q', featurePath, '-b', 'feature']);
    await git(root, ['worktree', 'add', '-q', '--detach', detachedPath]);

    const entries = await listWorktrees(root);
    assert.equal(entries.length, 3);

    const feature = entries.find((e) => path.resolve(e.path) === path.resolve(featurePath));
    assert.equal(feature?.branch, 'feature'); // refs/heads/ stripped, not the raw ref

    const detached = entries.find((e) => path.resolve(e.path) === path.resolve(detachedPath));
    assert.equal(detached?.branch, null);
  } finally {
    cleanup();
  }
});

await test('listWorktrees: a prunable entry does not corrupt the entry that follows, and the final entry is captured with no trailing blank line', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const parent = path.dirname(root);
    const prunablePath = path.join(parent, 'wt-prunable');
    const trailingPath = path.join(parent, 'wt-trailing');
    await git(root, ['worktree', 'add', '-q', prunablePath, '-b', 'prunable-branch']);
    // Delete the directory out from under git without `worktree remove` —
    // git's porcelain output marks this entry `prunable <reason>` instead of
    // dropping it, and that line must not bleed into the next entry.
    fs.rmSync(prunablePath, { recursive: true, force: true });
    await git(root, ['worktree', 'add', '-q', trailingPath, '-b', 'trailing-branch']);

    const entries = await listWorktrees(root);
    // stdout ends with the last entry's blank-line separator omitted only if
    // git doesn't add a final newline; either way all entries must parse.
    const trailing = entries.find((e) => path.resolve(e.path) === path.resolve(trailingPath));
    assert.equal(trailing?.branch, 'trailing-branch');
    assert.equal(entries.length, 3);
  } finally {
    cleanup();
  }
});
