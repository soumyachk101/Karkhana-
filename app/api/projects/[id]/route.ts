import { handle } from '@/lib/api';
import { deleteProject, getProject, updateProject } from '@/lib/repo/projects';
import { listTasks } from '@/lib/repo/tasks';
import { removeWorktree } from '@/lib/worktree';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => {
    const project = getProject(id);
    if (!project) throw new Error(`No project ${id}`);
    return { project, tasks: listTasks(id) };
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const body = (await req.json()) as { name?: string; base_branch?: string };
    return { project: await updateProject(id, body) };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const project = getProject(id);
    if (!project) throw new Error(`No project ${id}`);

    // Clean up worktrees before the cascade deletes the rows that point at them,
    // otherwise they become unattributable orphans on disk.
    for (const task of listTasks(id)) {
      if (task.worktree_path) {
        await removeWorktree(project, task.worktree_path, task.branch);
      }
    }
    deleteProject(id);
    return { ok: true };
  });
}
