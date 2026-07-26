import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';
import { MODELS, type Model } from '@/lib/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { model?: Model };
    if (body.model && !MODELS.includes(body.model)) {
      throw new Error(`Unknown model "${body.model}".`);
    }
    await orchestrator.retry(id, { model: body.model });
    return { ok: true };
  });
}
