import { handle } from '@/lib/api';
import { autoInstallBinary, checkBinaries } from '@/lib/installer';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const statuses = await checkBinaries();
    return { ok: true, binaries: statuses };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { binary } = (await req.json()) as { binary: 'codex' | 'claude' | 'antigravity' };
    if (!binary) {
      throw new Error('Binary name is required.');
    }

    const result = await autoInstallBinary(binary);
    return result;
  });
}
