import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { subscribe } from './bus.ts';
import { listEvents } from './repo/events.ts';
import { orchestrator } from './agent/orchestrator.ts';
import type { ClientFrame, ServerFrame } from './types.ts';

const PATH = '/ws';

/** Events replayed on subscribe before switching to live. */
const REPLAY_LIMIT = 2000;

type Client = {
  socket: WebSocket;
  /** Task ids this connection wants `event` frames for. */
  subscriptions: Set<string>;
  alive: boolean;
};

/**
 * Mounts the WebSocket server on Karkhana's HTTP server.
 *
 * The bus broadcasts every frame; filtering happens here, per connection.
 * `status` and `stats` go to everyone so the kanban and top bar stay live
 * without polling. `event` frames go only to tabs viewing that task — a task
 * detail pane open on one agent shouldn't receive another agent's output.
 */
export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  server.on('upgrade', (req, socket, head) => {
    // Leave other upgrade paths (Next's HMR socket) alone.
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== PATH) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (socket: WebSocket) => {
    const client: Client = { socket, subscriptions: new Set(), alive: true };
    clients.add(client);

    // Send the counters immediately so a fresh tab isn't blank until the next
    // state change.
    send(socket, {
      type: 'stats',
      running: orchestrator.runningCount,
      queued: orchestrator.queuedCount,
      limit: orchestrator.limit,
    });

    socket.on('pong', () => {
      client.alive = true;
    });

    socket.on('message', (raw) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(String(raw)) as ClientFrame;
      } catch {
        return;
      }

      if (frame.type === 'subscribe' && frame.taskId) {
        client.subscriptions.add(frame.taskId);
        // Replay history first so a tab opened mid-run shows the whole log,
        // then live frames continue from the bus.
        for (const event of listEvents(frame.taskId, 0, REPLAY_LIMIT)) {
          send(socket, { type: 'event', taskId: frame.taskId, event });
        }
        send(socket, { type: 'replay_done', taskId: frame.taskId });
      } else if (frame.type === 'unsubscribe' && frame.taskId) {
        client.subscriptions.delete(frame.taskId);
      }
    });

    const cleanup = () => clients.delete(client);
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  const unsubscribeBus = subscribe((frame: ServerFrame) => {
    for (const client of clients) {
      if (frame.type === 'event' && !client.subscriptions.has(frame.taskId)) continue;
      send(client.socket, frame);
    }
  });

  // Drop connections that stopped responding (laptop sleep, closed tab that
  // never sent a close frame) so the client set doesn't grow unbounded.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        clients.delete(client);
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  wss.on('close', () => {
    clearInterval(heartbeat);
    unsubscribeBus();
  });

  return wss;
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(frame));
}
