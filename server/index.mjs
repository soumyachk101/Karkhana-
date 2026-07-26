// Karkhana's HTTP entrypoint.
//
// Next owns its own server when you run `next dev`/`next start`, which leaves
// nowhere to attach a WebSocket upgrade handler and no guarantee that a
// long-lived process supervisor survives between requests. So we own the
// http.Server, mount `ws` on it, boot the orchestrator, and delegate everything
// else to Next. One process, one port, shared memory.

import { createServer } from 'node:http';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.KARKHANA_HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[karkhana] request failed:', err);
    res.statusCode = 500;
    res.end('internal error');
  });
});

// --- boot: reconcile crashed state, then start accepting work -------------
// Imported dynamically and after `app.prepare()` so a failure here surfaces as
// a readable stack instead of an opaque Next build error.
const { attachWebSocketServer } = await import('../lib/wsServer.ts');
const { boot } = await import('../lib/boot.ts');

const wss = attachWebSocketServer(server);
await boot();

server.listen(port, hostname, () => {
  console.log(`\n  Karkhana ready on http://${hostname}:${port}`);
  console.log(`  WebSocket at ws://${hostname}:${port}/ws\n`);
});

// --- shutdown -------------------------------------------------------------
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[karkhana] ${signal} — shutting down`);

  const { orchestrator } = await import('../lib/agent/orchestrator.ts');
  await orchestrator.shutdown();

  wss.close();
  server.close(() => process.exit(0));
  // Don't hang forever on a wedged keep-alive socket.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('[karkhana] unhandled rejection:', err);
});
