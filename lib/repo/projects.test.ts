import '../testHelpers/env.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeTempRepo } from '../testHelpers/harness.ts';

// projects.ts reads KARKHANA_CLONE_ROOT into a top-level const at import
// time, same reason lib/testHelpers/env.ts sets KARKHANA_HOME before any
// other import — set it before the first `../repo/projects.ts` import so a
// cloned-URL test never touches the real machine's home directory.
// realpath: macOS's tmpdir is under a symlink (/tmp -> /private/tmp), and
// repoRoot() (git rev-parse --show-toplevel) always returns the resolved
// path — comparing against an unresolved path would spuriously fail.
process.env.KARKHANA_CLONE_ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'karkhana-clone-root-')));

const { createProject, deleteProject, getProjectByPath } = await import('./projects.ts');

await test('createProject registers a local path', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    const project = await createProject({ path: root });
    assert.equal(project.path, root);
    assert.equal(project.base_branch, 'main');
    assert.equal(project.name, path.basename(root));
  } finally {
    cleanup();
  }
});

await test('createProject rejects a path that is not a git repo', async () => {
  const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'karkhana-not-a-repo-'));
  try {
    await assert.rejects(() => createProject({ path: notARepo }), /not a git repository/);
  } finally {
    fs.rmSync(notARepo, { recursive: true, force: true });
  }
});

await test('createProject rejects a path already registered', async () => {
  const { root, cleanup } = await makeTempRepo();
  try {
    await createProject({ path: root });
    await assert.rejects(() => createProject({ path: root }), /already registered/);
  } finally {
    cleanup();
  }
});

await test('createProject clones a remote URL and registers the clone', async () => {
  const { root: source, cleanup } = await makeTempRepo();
  let clonedPath: string | undefined;
  let projectId: string | undefined;
  try {
    // file:// URLs exercise git's real clone path with no network involved.
    const project = await createProject({ path: `file://${source}` });
    clonedPath = project.path;
    projectId = project.id;
    assert.ok(getProjectByPath(project.path));
    assert.equal(project.path, fs.realpathSync(project.path));
    assert.ok(fs.existsSync(path.join(project.path, 'README.md')));
    assert.ok(
      path.resolve(project.path).startsWith(path.resolve(process.env.KARKHANA_CLONE_ROOT!)),
      `expected the clone under KARKHANA_CLONE_ROOT, got ${project.path}`,
    );
  } finally {
    cleanup();
    // Every fixture repo from makeTempRepo() is named "repo", so cloning it
    // always lands at the same <CLONE_ROOT>/repo — delete both the directory
    // and the DB row, or the next cloning test collides with this leftover.
    if (projectId) deleteProject(projectId);
    if (clonedPath) fs.rmSync(clonedPath, { recursive: true, force: true });
  }
});

await test('createProject reuses an existing clone instead of cloning over it', async () => {
  const { root: source, cleanup } = await makeTempRepo();
  let clonedPath: string | undefined;
  try {
    const first = await createProject({ path: `file://${source}` });
    clonedPath = first.path;
    // `git clone` refuses to clone into a non-empty existing directory, so
    // if createProject re-registers the same URL after the row was removed
    // (e.g. the project was deleted, or a crash left the clone behind), it
    // must detect the existing clone and skip cloning again rather than
    // throwing "destination path already exists".
    deleteProject(first.id);
    const second = await createProject({ path: `file://${source}` });
    assert.equal(second.path, first.path);
  } finally {
    cleanup();
    if (clonedPath) fs.rmSync(clonedPath, { recursive: true, force: true });
  }
});
