import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => orchestrator.merge(id));
}
