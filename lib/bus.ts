import { EventEmitter } from 'node:events';
import { holder } from './singleton.ts';
import type { ServerFrame } from './types.ts';

// One bus per process. The runner publishes from Next's module instance while
// the WebSocket server subscribes from the custom server's — see
// lib/singleton.ts for why that needs a shared holder.
const state = holder<{ bus?: EventEmitter }>('bus');

function emitter(): EventEmitter {
  if (!state.bus) {
    state.bus = new EventEmitter();
    // A dozen agents plus every open browser tab adds up; the default limit of
    // 10 would spam warnings.
    state.bus.setMaxListeners(0);
  }
  return state.bus;
}

const CHANNEL = 'frame';

/** Publishes a frame to every WebSocket client (they filter by subscription). */
export function publish(frame: ServerFrame): void {
  emitter().emit(CHANNEL, frame);
}

export function subscribe(listener: (frame: ServerFrame) => void): () => void {
  emitter().on(CHANNEL, listener);
  return () => emitter().off(CHANNEL, listener);
}
