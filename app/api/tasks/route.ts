import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';
import { getProject } from '@/lib/repo/projects';
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

    if (!body.projectId) throw new Error('projectId is required.');
    if (!body.prompt?.trim()) throw new Error('A prompt is required.');
    if (!getProject(body.projectId)) throw new Error(`No project ${body.projectId}`);
    if (body.model && !MODELS.includes(body.model)) {
      throw new Error(`Unknown model "${body.model}".`);
    }

    const task = createTask({
      projectId: body.projectId,
      title: body.title ?? '',
      prompt: body.prompt,
      model: body.model,
    });

    // Queued immediately; the orchestrator starts it when a slot frees up.
    orchestrator.enqueue(task.id);
    return { task };
  });
}
