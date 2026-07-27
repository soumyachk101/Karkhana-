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
    let fallbackHome = process.cwd();
    try {
      if (fs.existsSync(os.homedir())) fallbackHome = os.homedir();
    } catch {
      fallbackHome = process.cwd();
    }

    const target = path.resolve(requested?.trim() || fallbackHome);

    let stat: fs.Stats | null = null;
    try {
      if (fs.existsSync(target)) {
        stat = fs.statSync(target);
      }
    } catch {
      stat = null;
    }

    if (!stat || !stat.isDirectory()) {
      // Fallback to process.cwd() or /tmp on Vercel
      const fallbackTarget = process.cwd();
      const fallbackEntries = fs
        .readdirSync(fallbackTarget, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));

      return {
        path: fallbackTarget,
        parent: null,
        isGitRepo: fs.existsSync(path.join(fallbackTarget, '.git')),
        entries: fallbackEntries,
      };
    }

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
