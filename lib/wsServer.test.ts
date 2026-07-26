import './testHelpers/env.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import WebSocket from 'ws';
import { publish } from './bus.ts';
import { appendEvent } from './repo/events.ts';
import { createProject } from './repo/projects.ts';
import { createTask } from './repo/tasks.ts';
import { makeTempRepo, waitUntil } from './testHelpers/harness.ts';
import type { ServerFrame } from './types.ts';
import { attachWebSocketServer } from './wsServer.ts';

// events.task_id has a foreign key onto tasks(id) — appendEvent needs a real
// task row, which needs a real project row. This file never touches the
// working tree, so one shared fixture project for all three tests is enough.
const { root, cleanup: cleanupRepo } = await makeTempRepo();
const project = await createProject({ path: root });
function makeTaskId(title: string): string {
  return createTask({ projectId: project.id, title, prompt: 'n/a' }).id;
}

function isEventFrame(f: ServerFrame): f is Extract<ServerFrame, { type: 'event' }> {
  return f.type === 'event';
}
function isStatsFrame(f: ServerFrame): f is Extract<ServerFrame, { type: 'stats' }> {
  return f.type === 'stats';
}
function isReplayDoneFrame(f: ServerFrame): f is Extract<ServerFrame, { type: 'replay_done' }> {
  return f.type === 'replay_done';
}

async function withServer<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const server: Server = createServer();
  const wss = attachWebSocketServer(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    return await fn(port);
  } finally {
    // http.Server#close only fires its callback once every connection ends;
    // an upgraded WebSocket connection never does that on its own, so the
    // process (and `node --test`) would hang forever without this.
    for (const client of wss.clients) client.terminate();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function collectFrames(ws: WebSocket): ServerFrame[] {
  const frames: ServerFrame[] = [];
  ws.on('message', (raw) => frames.push(JSON.parse(String(raw)) as ServerFrame));
  return frames;
}

await test('subscribing while events are still being appended delivers them in monotonic id order', async () => {
  await withServer(async (port) => {
    const taskId = makeTaskId('ws-order-1');
    for (let i = 0; i < 5; i++) appendEvent(taskId, 'lifecycle', { kind: 'history', i });

    const ws = await connect(port);
    const frames = collectFrames(ws);
    ws.send(JSON.stringify({ type: 'subscribe', taskId }));

    // Appending (and publishing) more events immediately after subscribing —
    // before we know whether replay has finished — is exactly the window a
    // replay/live interleaving race would show up in.
    for (let i = 5; i < 10; i++) {
      const event = appendEvent(taskId, 'lifecycle', { kind: 'live', i });
      publish({ type: 'event', taskId, event });
    }

    await waitUntil(() => frames.some((f) => isReplayDoneFrame(f) && f.taskId === taskId), 2000);
    await new Promise((r) => setTimeout(r, 50)); // let any straggling live sends land

    const ids = frames.filter(isEventFrame).filter((f) => f.taskId === taskId).map((f) => f.event.id);
    assert.equal(ids.length, 10);
    for (let i = 1; i < ids.length; i++) {
      assert.ok(ids[i] > ids[i - 1], `event ids arrived out of order: ${ids.join(',')}`);
    }

    ws.close();
  });
});

await test('event frames reach only subscribed clients; stats reaches every client', async () => {
  await withServer(async (port) => {
    const subscriber = await connect(port);
    const bystander = await connect(port);
    const subFrames = collectFrames(subscriber);
    const byFrames = collectFrames(bystander);

    const taskId = makeTaskId('ws-scope-1');
    subscriber.send(JSON.stringify({ type: 'subscribe', taskId }));
    await waitUntil(() => subFrames.some((f) => isReplayDoneFrame(f) && f.taskId === taskId), 2000);

    const event = appendEvent(taskId, 'lifecycle', { kind: 'only-for-subscriber' });
    publish({ type: 'event', taskId, event });
    // A distinctive limit value ties this assertion to *this* publish call
    // rather than the stats frame every connection already gets on open.
    publish({ type: 'stats', running: 7, queued: 7, limit: 999 });

    await waitUntil(() => byFrames.some((f) => isStatsFrame(f) && f.limit === 999), 2000);

    assert.ok(subFrames.some((f) => isEventFrame(f) && f.taskId === taskId));
    assert.ok(!byFrames.some(isEventFrame), 'a client that never subscribed must not receive event frames');
    assert.ok(byFrames.some((f) => isStatsFrame(f) && f.limit === 999));

    subscriber.close();
    bystander.close();
  });
});

await test('unsubscribe stops further event frames for that task', async () => {
  await withServer(async (port) => {
    const ws = await connect(port);
    const frames = collectFrames(ws);
    const taskId = makeTaskId('ws-unsub-1');

    ws.send(JSON.stringify({ type: 'subscribe', taskId }));
    await waitUntil(() => frames.some((f) => isReplayDoneFrame(f) && f.taskId === taskId), 2000);

    ws.send(JSON.stringify({ type: 'unsubscribe', taskId }));
    await new Promise((r) => setTimeout(r, 20)); // let the unsubscribe be processed

    const event = appendEvent(taskId, 'lifecycle', { kind: 'after-unsub' });
    publish({ type: 'event', taskId, event });
    publish({ type: 'stats', running: 0, queued: 0, limit: 998 });
    await waitUntil(() => frames.some((f) => isStatsFrame(f) && f.limit === 998), 2000);

    assert.ok(!frames.some((f) => isEventFrame(f) && f.taskId === taskId && f.event.id === event.id));
    ws.close();
  });
});

cleanupRepo();
