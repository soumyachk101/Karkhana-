import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { handle } from '@/lib/api';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const { cwd, command } = (await req.json()) as { cwd?: string; command?: string };
    if (!command || !command.trim()) {
      throw new Error('Command is required.');
    }

    const workingDir = cwd?.trim() || process.cwd();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` },
        timeout: 30000, // 30s timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      return {
        ok: false,
        stdout: e.stdout?.trim() ?? '',
        stderr: e.stderr?.trim() ?? e.message ?? 'Command failed',
        exitCode: e.code ?? 1,
      };
    }
  });
}
