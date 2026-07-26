/**
 * M2 harness — proves worktree isolation without touching the DB or the server.
 *
 *   npm run wt:test -- /path/to/some/repo [baseBranch]
 *
 * Creates a worktree, writes a file into it, prints the diff, verifies the main
 * working tree is untouched, then tears everything down.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { currentBranch, git, isClean, listWorktrees, repoRoot } from '../lib/git.ts';
import {
  branchFor,
  createWorktree,
  getTaskDiff,
  mergeTask,
  removeWorktree,
} from '../lib/worktree.ts';
import type { Project, Task } from '../lib/types.ts';

const argv = process.argv.slice(2);
const testMerge = argv.includes('--merge');
const positional = argv.filter((a) => !a.startsWith('--'));
const repoArg = positional[0];
if (!repoArg) {
  console.error('usage: npm run wt:test -- <repoPath> [baseBranch] [--merge]');
  console.error('  --merge  also exercise mergeTask(), which creates a real merge commit');
  process.exit(1);
}

const root = await repoRoot(path.resolve(repoArg));
const base = positional[1] ?? (await currentBranch(root));
const taskId = `wttest${Date.now().toString(36)}`;

const project: Project = {
  id: 'p_test',
  name: path.basename(root),
  path: root,
  base_branch: base,
  created_at: Date.now(),
};

const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`repo: ${root}\nbase: ${base}\ntask: ${taskId}`);

const mainCleanBefore = await isClean(root);
const mainBranchBefore = await currentBranch(root);

step(1, 'create worktree');
const { worktreePath, branch } = await createWorktree(project, taskId);
console.log(`    ${worktreePath}  (branch ${branch})`);
check('worktree dir exists', await fs.stat(worktreePath).then(() => true).catch(() => false));
check('branch name matches convention', branch === branchFor(taskId));
check(
  'git worktree list includes it',
  (await listWorktrees(root)).some((w) => path.resolve(w.path) === path.resolve(worktreePath)),
);
check('worktree is outside the repo', !path.resolve(worktreePath).startsWith(path.resolve(root) + path.sep));

step(2, 'write a file inside the worktree');
await fs.writeFile(path.join(worktreePath, 'KARKHANA_WT_TEST.md'), '# isolation check\n');
await fs.mkdir(path.join(worktreePath, 'nested'), { recursive: true });
await fs.writeFile(path.join(worktreePath, 'nested', 'deep.txt'), 'hello\n');

step(3, 'diff the worktree');
const task = {
  id: taskId,
  title: 'worktree harness',
  worktree_path: worktreePath,
  branch,
} as Task;
const diff = await getTaskDiff(project, task);
console.log(`    base ${diff.base.slice(0, 12)}  files ${diff.files.length}  untracked ${diff.untracked.length}`);
for (const f of diff.files) console.log(`      +${f.added} -${f.deleted}  ${f.path}`);
check('new file appears in diff', diff.files.some((f) => f.path === 'KARKHANA_WT_TEST.md'));
check('nested new file appears in diff', diff.files.some((f) => f.path === 'nested/deep.txt'));
check('patch is non-empty', diff.patch.includes('isolation check'));

step(4, 'main working tree untouched');
check('main tree still on the same branch', (await currentBranch(root)) === mainBranchBefore);
check(
  'main tree cleanliness unchanged',
  (await isClean(root)) === mainCleanBefore,
  `was ${mainCleanBefore ? 'clean' : 'dirty'}`,
);
check(
  'test file did NOT land in the main tree',
  !(await fs.stat(path.join(root, 'KARKHANA_WT_TEST.md')).then(() => true).catch(() => false)),
);

if (testMerge) {
  step(5, 'merge into base (creates a real merge commit)');
  const headBefore = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
  const result = await mergeTask(project, task);
  console.log(`    ${JSON.stringify(result)}`);
  check('merge reported ok', result.ok === true);
  check('merge auto-committed the agent leftovers', result.ok === true && result.committed);
  check(
    'file landed in the main tree',
    await fs.stat(path.join(root, 'KARKHANA_WT_TEST.md')).then(() => true).catch(() => false),
  );
  check('base branch advanced', (await git(root, ['rev-parse', 'HEAD'])).stdout.trim() !== headBefore);
  check('worktree cleaned up by merge', !(await fs.stat(worktreePath).then(() => true).catch(() => false)));

  step(6, 'rollback of the test merge');
  await git(root, ['reset', '--hard', headBefore]);
  console.log(`    reset ${base} back to ${headBefore.slice(0, 12)}`);
} else {
  step(5, 'teardown');
  await removeWorktree(project, worktreePath, branch);
  check('worktree dir removed', !(await fs.stat(worktreePath).then(() => true).catch(() => false)));
  check(
    'worktree deregistered',
    !(await listWorktrees(root)).some((w) => path.resolve(w.path) === path.resolve(worktreePath)),
  );
  console.log('    (pass --merge to also exercise the merge path)');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
