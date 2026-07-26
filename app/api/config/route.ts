import { handle } from '@/lib/api';
import { orchestrator } from '@/lib/agent/orchestrator';
import { checkClaudeBinary, getConfig, updateConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(() => ({ config: getConfig(), binary: checkClaudeBinary() }));
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { claudeBinPath?: string; concurrency?: number; worktreeRoot?: string | null };
    const config = updateConfig(body);
    // A raised limit should start queued work immediately, not on next enqueue.
    orchestrator.publishStats();
    if (typeof body.concurrency === 'number') orchestrator.requeuePersisted();
    return { config, binary: checkClaudeBinary() };
  });
}
