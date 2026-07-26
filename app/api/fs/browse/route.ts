import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handle } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Lists subdirectories of a local path, for the "browse for a folder" picker.
 *
 * A web page can never read an absolute filesystem path off a native file
 * input (browsers deliberately don't expose one) — but Karkhana's server and
 * browser always run on the same machine, so the server can just read the
 * disk itself and hand back directory names to click through.
 */
export async function GET(req: Request) {
  return handle(() => {
    const requested = new URL(req.url).searchParams.get('path');
    const target = path.resolve(requested?.trim() || os.homedir());

    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      throw new Error(`${target} does not exist or isn't accessible.`);
    }
    if (!stat.isDirectory()) throw new Error(`${target} is not a folder.`);

    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    const parent = path.dirname(target);
    return {
      path: target,
      parent: parent === target ? null : parent,
      isGitRepo: fs.existsSync(path.join(target, '.git')),
      entries,
    };
  });
}
