import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';
import { createProject, getProject, listProjects } from '@/lib/repo/projects';
import { createTask, listTasks } from '@/lib/repo/tasks';
import { MODELS, type Model } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId') ?? undefined;
  return handle(() => ({ tasks: listTasks(projectId) }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as {
      projectId?: string;
      title?: string;
      prompt?: string;
      model?: Model;
    };

    let targetProjectId = body.projectId;
    let project = targetProjectId ? getProject(targetProjectId) : null;

    if (!project) {
      const allProjects = listProjects();
      if (allProjects.length > 0) {
        project = allProjects[0];
        targetProjectId = project.id;
      } else {
        // Auto-heal by registering default project
        project = await createProject({ path: process.cwd(), name: 'Default Workspace' });
        targetProjectId = project.id;
      }
    }

    if (!body.prompt?.trim()) throw new Error('A prompt is required.');
    if (body.model && !MODELS.includes(body.model)) {
      throw new Error(`Unknown model "${body.model}".`);
    }

    const task = createTask({
      projectId: targetProjectId!,
      title: body.title ?? '',
      prompt: body.prompt,
      model: body.model,
    });

    // Queued immediately; on Vercel serverless environment execute synchronously
    if (process.env.VERCEL) {
      await orchestrator.executeTaskSync(task.id);
    } else {
      orchestrator.enqueue(task.id);
    }
    return { task };
  });
}
