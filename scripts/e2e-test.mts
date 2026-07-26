/**
 * M5 harness — drives a running Karkhana server the way the browser will.
 *
 *   npm run e2e -- <repoPath> [baseUrl]
 *
 * Registers a project over HTTP, opens the WebSocket, creates two tasks on the
 * SAME repo, and checks that both stream concurrently into isolated worktrees.
 * Requires `npm run dev` to already be running.
 */
import path from 'node:path';
import WebSocket from 'ws';
import type { ServerFrame } from '../lib/types.ts';

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const repoPath = argv[0];
const base = argv[1] ?? 'http://127.0.0.1:3000';

if (!repoPath) {
  console.error('usage: npm run e2e -- <repoPath> [baseUrl]');
  process.exit(1);
}

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${route}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${route} → ${res.status}: ${(body as { error?: string }).error}`);
  return body as T;
}

console.log(`server: ${base}\nrepo  : ${repoPath}\n`);

const system = await api<{ limit: number; binary: { ok: boolean; reason?: string } }>('/api/system');
console.log(`concurrency limit: ${system.limit}`);
check('claude binary usable', system.binary.ok, system.binary.reason ?? '');

// --- project -------------------------------------------------------------
const absolute = path.resolve(repoPath);
const existing = await api<{ projects: Array<{ id: string; path: string; name: string }> }>('/api/projects');
let project = existing.projects.find((p) => p.path === absolute);
if (!project) {
  project = (await api<{ project: typeof project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ path: absolute }),
  })).project!;
}
console.log(`project: ${project.name} (${project.id})\n`);

// --- websocket -----------------------------------------------------------
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const socket = new WebSocket(wsUrl);
const frames: ServerFrame[] = [];
const eventsByTask = new Map<string, number>();
const statusByTask = new Map<string, string[]>();

await new Promise<void>((resolve, reject) => {
  socket.once('open', () => resolve());
  socket.once('error', reject);
});
console.log('websocket connected');

socket.on('message', (raw) => {
  const frame = JSON.parse(String(raw)) as ServerFrame;
  frames.push(frame);
  if (frame.type === 'event') {
    eventsByTask.set(frame.taskId, (eventsByTask.get(frame.taskId) ?? 0) + 1);
  } else if (frame.type === 'status') {
    const seen = statusByTask.get(frame.taskId) ?? [];
    if (seen[seen.length - 1] !== frame.task.status) seen.push(frame.task.status);
    statusByTask.set(frame.taskId, seen);
  }
});

// --- two agents, one repo ------------------------------------------------
const prompts = [
  'Create a file called AGENT_ONE.md containing exactly one line: task one was here.',
  'Create a file called AGENT_TWO.md containing exactly one line: task two was here.',
];

const tasks: Array<{ id: string; title: string }> = [];
for (const prompt of prompts) {
  const { task } = await api<{ task: { id: string; title: string } }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ projectId: project.id, prompt, title: prompt.slice(0, 30), model: 'haiku' }),
  });
  tasks.push(task);
  socket.send(JSON.stringify({ type: 'subscribe', taskId: task.id }));
  console.log(`queued ${task.id}  ${task.title}`);
}

console.log('\nwaiting for both agents to finish…');
const deadline = Date.now() + 240_000;
let sawBothRunning = false;

while (Date.now() < deadline) {
  const states = await Promise.all(
    tasks.map((t) => api<{ task: { status: string } }>(`/api/tasks/${t.id}`).then((r) => r.task.status)),
  );
  if (states.filter((s) => s === 'running').length === 2) sawBothRunning = true;
  if (states.every((s) => ['needs_review', 'failed', 'cancelled', 'merged'].includes(s))) break;
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('\nchecks:');
const finals = await Promise.all(
  tasks.map((t) =>
    api<{ task: { id: string; status: string; worktree_path: string | null; branch: string | null; session_id: string | null } }>(
      `/api/tasks/${t.id}`,
    ).then((r) => r.task),
  ),
);

for (const task of finals) {
  console.log(`  ${task.id}: ${task.status}  ${task.branch}`);
}

check('both tasks reached needs_review', finals.every((t) => t.status === 'needs_review'));
check('both ran concurrently', sawBothRunning);
check('worktrees are distinct', finals[0]!.worktree_path !== finals[1]!.worktree_path);
check('branches are distinct', finals[0]!.branch !== finals[1]!.branch);
check('both captured a session_id', finals.every((t) => Boolean(t.session_id)));
check('websocket delivered events for task 1', (eventsByTask.get(tasks[0]!.id) ?? 0) > 0, `${eventsByTask.get(tasks[0]!.id) ?? 0} frames`);
check('websocket delivered events for task 2', (eventsByTask.get(tasks[1]!.id) ?? 0) > 0, `${eventsByTask.get(tasks[1]!.id) ?? 0} frames`);
check('websocket delivered stats frames', frames.some((f) => f.type === 'stats'));
check('websocket delivered replay_done', frames.some((f) => f.type === 'replay_done'));
check(
  'status frames tracked the lifecycle',
  finals.every((t) => (statusByTask.get(t.id) ?? []).includes('running')),
  [...statusByTask.values()].map((v) => v.join('→')).join('  '),
);

// --- diffs are isolated --------------------------------------------------
for (const [index, task] of finals.entries()) {
  const diff = await api<{ files: Array<{ path: string }> }>(`/api/tasks/${task.id}/diff`);
  const names = diff.files.map((f) => f.path);
  console.log(`  ${task.id} diff: ${names.join(', ') || '(empty)'}`);
  const mine = index === 0 ? 'AGENT_ONE.md' : 'AGENT_TWO.md';
  const theirs = index === 0 ? 'AGENT_TWO.md' : 'AGENT_ONE.md';
  check(`task ${index + 1} produced its own file`, names.includes(mine));
  check(`task ${index + 1} cannot see the other agent's file`, !names.includes(theirs));
}

// --- review actions ------------------------------------------------------
const mergeResult = await api<{ ok: boolean; reason?: string }>(`/api/tasks/${finals[0]!.id}/merge`, {
  method: 'POST',
});
console.log(`\n  merge task 1: ${JSON.stringify(mergeResult)}`);
check('merge succeeded', mergeResult.ok === true, mergeResult.reason ?? '');
const merged = await api<{ task: { status: string } }>(`/api/tasks/${finals[0]!.id}`);
check('task 1 is now merged', merged.task.status === 'merged');

await api(`/api/tasks/${finals[1]!.id}/discard`, { method: 'POST' });
const discarded = await api<{ task: { status: string; worktree_path: string | null } }>(`/api/tasks/${finals[1]!.id}`);
check('task 2 is now cancelled', discarded.task.status === 'cancelled');
check('discard cleared the worktree', discarded.task.worktree_path === null);

socket.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
