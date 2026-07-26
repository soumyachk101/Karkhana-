/**
 * Deployment smoke check — the one to run after `npm start` on a new machine.
 *
 *   npm run smoke -- [baseUrl]
 *
 * Unlike the other harnesses this needs no git repo, no API key, and spawns no
 * agent: it only asserts that a running Karkhana serves its UI, answers every
 * read-only route, resolved a usable Claude binary, and pushes frames down the
 * WebSocket. Exits non-zero on the first thing that isn't true, so a service
 * unit or a post-deploy hook can gate on it.
 */
import WebSocket from 'ws';
import type { ServerFrame } from '../lib/types.ts';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const WS_TIMEOUT_MS = 8000;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log(`smoke: ${base}\n`);

// --- HTTP ----------------------------------------------------------------
try {
  const page = await fetch(base);
  const html = await page.text();
  check('GET / serves the dashboard', page.ok && html.includes('<html'), `status ${page.status}`);
} catch (err) {
  check('GET / serves the dashboard', false, (err as Error).message);
  // Nothing is listening; the rest would just repeat this failure.
  console.log('\nserver unreachable — is it running?');
  process.exit(1);
}

type SystemResponse = {
  limit: number;
  running: number;
  queued: number;
  counts: Record<string, number>;
  binary: { ok: boolean; reason?: string };
  config: { claudeBinPath: string; dbPath: string };
  boot: { orphanedTasks: number; requeued: number } | null;
};

const system = (await (await fetch(`${base}/api/system`)).json()) as SystemResponse;
check('GET /api/system answers', typeof system.limit === 'number', `limit ${system.limit}`);
check('claude binary usable', system.binary?.ok === true, system.binary?.reason ?? '');
check('config resolved', Boolean(system.config?.dbPath), system.config?.dbPath ?? '');
// boot() runs in the custom server's module instance and the route reads it
// from Next's; a null here means the singleton holder is broken again.
check('boot report visible to the API', system.boot !== null && system.boot !== undefined);

for (const route of ['/api/tasks', '/api/projects', '/api/config']) {
  const res = await fetch(`${base}${route}`);
  check(`GET ${route}`, res.ok, `status ${res.status}`);
}

// --- WebSocket -----------------------------------------------------------
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
const gotStats = await new Promise<boolean>((resolve) => {
  const socket = new WebSocket(wsUrl);
  const timer = setTimeout(() => {
    socket.terminate();
    resolve(false);
  }, WS_TIMEOUT_MS);

  socket.on('message', (raw) => {
    const frame = JSON.parse(String(raw)) as ServerFrame;
    // The server sends `stats` unprompted on connect so a fresh tab isn't blank.
    if (frame.type !== 'stats') return;
    clearTimeout(timer);
    socket.close();
    resolve(true);
  });
  socket.on('error', () => {
    clearTimeout(timer);
    resolve(false);
  });
});
check('WebSocket /ws sends stats on connect', gotStats, gotStats ? '' : `no frame in ${WS_TIMEOUT_MS}ms`);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
