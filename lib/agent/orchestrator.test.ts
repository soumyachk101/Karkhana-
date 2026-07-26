import '../testHelpers/env.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateConfig } from '../config.ts';
import { createProject } from '../repo/projects.ts';
import { createTask, deleteTask, getTask, updateTask } from '../repo/tasks.ts';
import { FAKE_CLAUDE_BIN, fakePrompt, makeTempRepo, waitUntil } from '../testHelpers/harness.ts';
import type { Project } from '../types.ts';
import { Orchestrator } from './orchestrator.ts';

updateConfig({ claudeBinPath: FAKE_CLAUDE_BIN });

/** Fresh repo + registered project + fresh orchestrator instance per test. */
async function setup(concurrency: number): Promise<{ project: Project; orch: Orchestrator; cleanup: () => void }> {
  updateConfig({ concurrency });
  const { root, cleanup } = await makeTempRepo();
  const project = await createProject({ path: root });
  return { project, orch: new Orchestrator(), cleanup };
}

await test('enforces the concurrency limit and starts queued work FIFO as slots free up', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const tasks = [0, 1, 2].map((i) =>
      createTask({ projectId: project.id, title: `t${i}`, prompt: fakePrompt({ delayMs: 150 }) }),
    );
    for (const t of tasks) orch.enqueue(t.id);

    await waitUntil(() => orch.runningCount === 1, 3000);
    assert.equal(orch.runningCount, 1);
    assert.equal(orch.queuedCount, 2);
    assert.equal(getTask(tasks[0].id)?.status, 'running');
    assert.equal(getTask(tasks[1].id)?.status, 'queued');
    assert.equal(getTask(tasks[2].id)?.status, 'queued');

    // Not `runningCount === 0 && queuedCount === 0`: a task is shifted out of
    // `pending` before it lands in `active` (worktree provisioning is async),
    // so both counters can hit zero for an instant while the last task is
    // still in that handoff, well before it has actually finished.
    await waitUntil(() => tasks.every((t) => getTask(t.id)?.status === 'needs_review'), 5000);
  } finally {
    cleanup();
  }
});

await test('enqueue is idempotent for a task already queued or already active', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const occupier = createTask({ projectId: project.id, title: 'occupier', prompt: fakePrompt({ delayMs: 300 }) });
    orch.enqueue(occupier.id);
    await waitUntil(() => orch.runningCount === 1, 3000);

    orch.enqueue(occupier.id); // duplicate call while active
    assert.equal(orch.runningCount, 1);

    const b = createTask({ projectId: project.id, title: 'b', prompt: fakePrompt({ delayMs: 20 }) });
    orch.enqueue(b.id);
    orch.enqueue(b.id); // duplicate call while queued
    assert.equal(orch.queuedCount, 1);

    await waitUntil(
      () => getTask(occupier.id)?.status === 'needs_review' && getTask(b.id)?.status === 'needs_review',
      5000,
    );
  } finally {
    cleanup();
  }
});

await test('cancel on a queued task removes it and marks it cancelled without ever spawning', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const occupier = createTask({ projectId: project.id, title: 'occupier', prompt: fakePrompt({ delayMs: 300 }) });
    orch.enqueue(occupier.id);
    await waitUntil(() => orch.runningCount === 1, 3000);

    const queued = createTask({ projectId: project.id, title: 'queued', prompt: fakePrompt() });
    orch.enqueue(queued.id);
    assert.equal(orch.queuedCount, 1);

    orch.cancel(queued.id);
    assert.equal(orch.queuedCount, 0);
    assert.equal(getTask(queued.id)?.status, 'cancelled');

    await waitUntil(() => orch.runningCount === 0, 5000);
    // Never started: no worktree was ever provisioned for it.
    assert.equal(getTask(queued.id)?.worktree_path, null);
  } finally {
    cleanup();
  }
});

await test('cancel on a running task delegates to the handle and settles as cancelled', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const task = createTask({ projectId: project.id, title: 'to-cancel', prompt: fakePrompt({ delayMs: 5000 }) });
    orch.enqueue(task.id);
    await waitUntil(() => orch.runningCount === 1, 3000);

    orch.cancel(task.id);
    await waitUntil(() => orch.runningCount === 0, 3000);
    assert.equal(getTask(task.id)?.status, 'cancelled');
  } finally {
    cleanup();
  }
});

await test('retry throws while the task is active, and otherwise clears session/worktree state and re-queues', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const running = createTask({ projectId: project.id, title: 'running', prompt: fakePrompt({ delayMs: 300 }) });
    orch.enqueue(running.id);
    await waitUntil(() => orch.runningCount === 1, 3000);
    await assert.rejects(() => orch.retry(running.id), /still running/);
    await waitUntil(() => orch.runningCount === 0, 5000);

    const failing = createTask({ projectId: project.id, title: 'failing', prompt: fakePrompt({ exitCode: 1 }) });
    orch.enqueue(failing.id);
    await waitUntil(() => getTask(failing.id)?.status === 'failed', 3000);
    const beforeRetry = getTask(failing.id)!;
    assert.ok(beforeRetry.worktree_path);

    await orch.retry(failing.id);
    // enqueue() inside retry() sets status synchronously before draining.
    assert.equal(getTask(failing.id)?.status, 'queued');
    assert.equal(getTask(failing.id)?.session_id, null);

    await waitUntil(() => getTask(failing.id)?.status === 'failed', 3000);
    // A fresh worktree was cut for the retry (even though it failed again).
    assert.ok(getTask(failing.id)?.worktree_path);
  } finally {
    cleanup();
  }
});

await test('resume throws its three distinct preconditions', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const running = createTask({ projectId: project.id, title: 'running', prompt: fakePrompt({ delayMs: 300 }) });
    orch.enqueue(running.id);
    await waitUntil(() => orch.runningCount === 1, 3000);
    assert.throws(() => orch.resume(running.id), /already running/);
    await waitUntil(() => orch.runningCount === 0, 5000);

    // Neither of these ever reaches orch.enqueue() (resume() throws first),
    // so they'd stay 'queued' in the DB forever and pollute a later test's
    // requeuePersisted() scan — delete them rather than leave zombies behind.
    const fresh = createTask({ projectId: project.id, title: 'fresh', prompt: fakePrompt() });
    try {
      assert.throws(() => orch.resume(fresh.id), /No session_id captured/);
    } finally {
      deleteTask(fresh.id);
    }

    const noWorktree = createTask({ projectId: project.id, title: 'no-worktree', prompt: fakePrompt() });
    try {
      updateTask(noWorktree.id, { session_id: 'fake-session-xyz', worktree_path: null });
      assert.throws(() => orch.resume(noWorktree.id), /Worktree is gone/);
    } finally {
      deleteTask(noWorktree.id);
    }
  } finally {
    cleanup();
  }
});

await test('requeuePersisted re-admits persisted queued rows without duplicating ones already pending', async () => {
  const { project, orch, cleanup } = await setup(1);
  try {
    const occupier = createTask({ projectId: project.id, title: 'occupier', prompt: fakePrompt({ delayMs: 400 }) });
    orch.enqueue(occupier.id);
    await waitUntil(() => orch.runningCount === 1, 3000);

    // Already in orch.pending — requeuePersisted must not duplicate it.
    const alreadyPending = createTask({ projectId: project.id, title: 'already-pending', prompt: fakePrompt() });
    orch.enqueue(alreadyPending.id);
    assert.equal(orch.queuedCount, 1);
    orch.requeuePersisted();
    assert.equal(orch.queuedCount, 1);

    // Persisted as 'queued' in the DB but never passed to this orchestrator's
    // enqueue() — models a fresh instance re-admitting work after a restart.
    const neverEnqueued = createTask({ projectId: project.id, title: 'never-enqueued', prompt: fakePrompt() });
    assert.equal(getTask(neverEnqueued.id)?.status, 'queued');
    const admitted = orch.requeuePersisted();
    assert.ok(admitted >= 1);
    assert.equal(orch.queuedCount, 2);

    await waitUntil(
      () =>
        getTask(occupier.id)?.status === 'needs_review' &&
        getTask(alreadyPending.id)?.status === 'needs_review' &&
        getTask(neverEnqueued.id)?.status === 'needs_review',
      5000,
    );
  } finally {
    cleanup();
  }
});

await test('shutdown cancels every live handle and resolves well before its 6s race timeout', async () => {
  const { project, orch, cleanup } = await setup(2);
  try {
    const tasks = [0, 1].map((i) =>
      createTask({ projectId: project.id, title: `t${i}`, prompt: fakePrompt({ delayMs: 4000 }) }),
    );
    for (const t of tasks) orch.enqueue(t.id);
    await waitUntil(() => orch.runningCount === 2, 3000);

    const startedAt = Date.now();
    await orch.shutdown();
    assert.ok(Date.now() - startedAt < 3000, 'shutdown should resolve quickly once SIGTERM kills the fake agents');
    assert.equal(orch.runningCount, 0);
    for (const t of tasks) assert.equal(getTask(t.id)?.status, 'cancelled');
  } finally {
    cleanup();
  }
});
