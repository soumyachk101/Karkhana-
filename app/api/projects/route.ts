import { handle } from '@/lib/api';
import { createProject, listProjects } from '@/lib/repo/projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(() => ({ projects: listProjects() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { path?: string; name?: string; baseBranch?: string };
    if (!body.path?.trim()) throw new Error('A repository path is required.');
    return { project: await createProject({ path: body.path, name: body.name, baseBranch: body.baseBranch }) };
  });
}
