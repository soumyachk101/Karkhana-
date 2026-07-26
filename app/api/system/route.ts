import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';
import { getBootReport, rescanOrphans } from '@/lib/boot';
import { checkClaudeBinary, getConfig } from '@/lib/config';
import { getProject } from '@/lib/repo/projects';
import { removeWorktree } from '@/lib/worktree';

export const dynamic = 'force-dynamic';

/** Top-bar state: counters, config health, and anything left over from a crash. */
export async function GET() {
  return handle(() => ({
    ...orchestrator.snapshot(),
    binary: checkClaudeBinary(),
    config: getConfig(),
    boot: getBootReport(),
  }));
}

/** Cleanup actions for orphaned worktrees surfaced by boot reconciliation. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as {
      action?: 'rescan' | 'removeOrphan';
      projectId?: string;
      path?: string;
      branch?: string | null;
    };

    if (body.action === 'removeOrphan') {
      if (!body.projectId || !body.path) throw new Error('projectId and path are required.');
      const project = getProject(body.projectId);
      if (!project) throw new Error(`No project ${body.projectId}`);
      await removeWorktree(project, body.path, body.branch ?? null);
    }
    return { orphanWorktrees: await rescanOrphans() };
  });
}
