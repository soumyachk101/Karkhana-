import { bad, handle } from '@/lib/api';
import { EXEC_TIMEOUT_MS, runInWorktree } from '@/lib/exec';
import { getTask } from '@/lib/repo/tasks';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Runs a shell command in the task's worktree and returns its output.
 *
 * The terminal pane's prompt lands here. Commands run in the *worktree*, never
 * the project's main tree — that is the same invariant the agent runner
 * enforces, for the same reason.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { command?: string };
  const command = (body.command ?? '').trim();

  if (!command) return bad('No command given.');
  if (command.length > 4000) return bad('Command is too long.');

  const task = getTask(id);
  if (!task) return bad(`No task ${id}`, 404);
  if (!task.worktree_path) {
    return bad(
      task.status === 'merged'
        ? 'This task was merged and its worktree removed.'
        : 'This task has no worktree yet.',
    );
  }

  return handle(() => runInWorktree(task.worktree_path as string, command, { timeoutMs: EXEC_TIMEOUT_MS }));
}
