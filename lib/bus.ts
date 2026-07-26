import { EventEmitter } from 'node:events';
import type { ServerFrame } from './types.ts';

// Same globalThis-caching rationale as lib/db.ts: one bus per process, even
// across Next's dev-time module re-evaluation.
const GLOBAL_KEY = Symbol.for('karkhana.bus');
type Holder = { bus?: EventEmitter };
const holder = ((globalThis as Record<symbol, unknown>)[GLOBAL_KEY] ??= {} as Holder) as Holder;

function emitter(): EventEmitter {
  if (!holder.bus) {
    holder.bus = new EventEmitter();
    // A dozen agents plus every open browser tab adds up; the default limit of
    // 10 would spam warnings.
    holder.bus.setMaxListeners(0);
  }
  return holder.bus;
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
