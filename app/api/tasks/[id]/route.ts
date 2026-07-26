import { handle } from '@/lib/api';
import { listEvents } from '@/lib/repo/events';
import { getTask } from '@/lib/repo/tasks';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const afterId = Number(new URL(req.url).searchParams.get('afterId') ?? 0);
  return handle(() => {
    const task = getTask(id);
    if (!task) throw new Error(`No task ${id}`);
    return { task, events: listEvents(id, afterId) };
  });
}
