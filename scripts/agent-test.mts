/**
 * M3 harness — one task, end to end, no server and no UI.
 *
 *   npm run agent:test -- <repoPath> "<prompt>" [model]
 *
 * Registers the repo, creates a task, cuts a worktree, spawns a real headless
 * agent, and prints stream events as they arrive. Then checks the things that
 * actually matter: events landed in SQLite, a session_id was captured, and the
 * agent's changes exist in the worktree but not in the main working tree.
 */
import path from 'node:path';
import { subscribe } from '../lib/bus.ts';
import { getConfig, checkClaudeBinary } from '../lib/config.ts';
import { closeDb } from '../lib/db.ts';
import { git, repoRoot } from '../lib/git.ts';
import { countEvents, listEvents } from '../lib/repo/events.ts';
import { createProject, getProjectByPath } from '../lib/repo/projects.ts';
import { createTask, getTask } from '../lib/repo/tasks.ts';
import { getTaskDiff, provisionTaskWorktree, removeWorktree } from '../lib/worktree.ts';
import { runAgent } from '../lib/agent/runner.ts';
import type { Model } from '../lib/types.ts';

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const positional = argv.filter((a) => !a.startsWith('--'));
const [repoArg, prompt, modelArg] = positional;

if (!repoArg || !prompt) {
  console.error('usage: npm run agent:test -- <repoPath> "<prompt>" [haiku|sonnet|opus] [--keep]');
  process.exit(1);
}

const binary = checkClaudeBinary();
if (!binary.ok) {
  console.error(`Claude Code binary unusable: ${binary.reason}`);
  console.error('Set claudeBinPath in karkhana.config.json.');
  process.exit(1);
}

const root = await repoRoot(path.resolve(repoArg));
const model = (modelArg as Model) ?? 'haiku';

console.log(`binary : ${getConfig().claudeBinPath}`);
console.log(`repo   : ${root}`);
console.log(`model  : ${model}\n`);

const project = getProjectByPath(root) ?? (await createProject({ path: root }));
console.log(`project: ${project.name} (${project.id}) base=${project.base_branch}`);

const task = createTask({
  projectId: project.id,
  title: prompt.slice(0, 50),
  prompt,
  model,
});
console.log(`task   : ${task.id}`);

// Snapshot the main tree so we compare against a baseline rather than
// demanding absolute cleanliness — the user's repo may legitimately be dirty.
const mainDirtyBefore = (await git(root, ['status', '--porcelain'])).stdout;

const running = await provisionTaskWorktree(project, task);
const worktreePath = running.worktree_path!;
const branch = running.branch!;
console.log(`worktree: ${worktreePath} (${branch})\n`);
console.log('--- live stream ---------------------------------------------');

// Exactly what the WebSocket layer will forward to the browser at M5.
const unsubscribe = subscribe((frame) => {
  if (frame.type === 'event') {
    const payload = JSON.parse(frame.event.payload_json);
    console.log(`  ${String(frame.event.type).padEnd(10)} ${summarize(payload)}`);
  } else if (frame.type === 'status') {
    console.log(`  [status]   ${frame.task.status}${frame.task.session_id ? ` session=${frame.task.session_id.slice(0, 8)}` : ''}`);
  }
});

function summarize(payload: Record<string, unknown>): string {
  const message = payload.message as { content?: unknown[] } | undefined;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((block) => {
        const b = block as Record<string, unknown>;
        if (b.type === 'text') return `text: ${String(b.text).replace(/\s+/g, ' ').slice(0, 90)}`;
        if (b.type === 'thinking') return `thinking: ${String(b.thinking).replace(/\s+/g, ' ').slice(0, 70)}…`;
        if (b.type === 'tool_use') return `tool_use: ${b.name} ${JSON.stringify(b.input).slice(0, 70)}`;
        if (b.type === 'tool_result') return `tool_result: ${JSON.stringify(b.content).slice(0, 70)}`;
        return String(b.type);
      })
      .join(' | ');
  }
  if (payload.kind) return `${payload.kind} ${JSON.stringify(payload).slice(0, 90)}`;
  if (payload.subtype === 'init') return `init model=${payload.model} tools=${(payload.tools as unknown[])?.length}`;
  return JSON.stringify(payload).slice(0, 100);
}

const startedAt = Date.now();
const handle = runAgent(project, running);
const outcome = await handle.done;
unsubscribe();

console.log('--- end of stream -------------------------------------------\n');
console.log(`outcome: ${outcome.status} exit=${outcome.exitCode} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
if (outcome.error) console.log(`error  : ${outcome.error}`);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('\nchecks:');
const final = getTask(task.id)!;
const events = listEvents(task.id);

check('task reached a terminal status', ['needs_review', 'failed', 'cancelled'].includes(final.status), final.status);
check('session_id captured', Boolean(final.session_id), final.session_id ?? 'none');
check('events persisted', countEvents(task.id) > 0, `${countEvents(task.id)} rows`);
check('an init event was stored', events.some((e) => JSON.parse(e.payload_json).subtype === 'init'));
check('a result event was stored', events.some((e) => e.type === 'result'));
check(
  'noise was filtered out',
  !events.some((e) => ['thinking_tokens', 'commands_changed'].includes(JSON.parse(e.payload_json).subtype)),
);
check(
  'no thinking signatures stored',
  !events.some((e) => e.payload_json.includes('"signature"')),
);
check('pid cleared after exit', final.pid === null);

const diff = await getTaskDiff(project, final);
console.log(`\n  worktree diff: ${diff.files.length} file(s)`);
for (const f of diff.files) console.log(`    +${f.added} -${f.deleted}  ${f.path}`);
check('worktree path recorded on the task row', Boolean(final.worktree_path), final.worktree_path ?? 'null');
check('agent changed something in the worktree', diff.files.length > 0);

const mainDirtyAfter = (await git(root, ['status', '--porcelain'])).stdout;
check(
  'main working tree unchanged by the agent',
  mainDirtyAfter === mainDirtyBefore,
  mainDirtyAfter === mainDirtyBefore ? '' : `main tree changed:\n${mainDirtyAfter}`,
);

const biggest = Math.max(0, ...events.map((e) => e.payload_json.length));
console.log(`\n  events: ${events.length}  largest payload: ${(biggest / 1024).toFixed(1)}KB  total: ${(events.reduce((n, e) => n + e.payload_json.length, 0) / 1024).toFixed(1)}KB`);

if (!keep) {
  await removeWorktree(project, worktreePath, branch);
  console.log('  (worktree removed; pass --keep to inspect it)');
} else {
  console.log(`  worktree kept at ${worktreePath}`);
}

closeDb();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
