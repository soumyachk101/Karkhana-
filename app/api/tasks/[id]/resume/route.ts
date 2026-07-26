import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    orchestrator.resume(id, { prompt: body.prompt });
    return { ok: true };
  });
}
