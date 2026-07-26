'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientFrame, ServerFrame } from '@/lib/types';

/**
 * One WebSocket for the whole app, with reconnect.
 *
 * The frame handler is held in a ref so that a parent re-render doesn't tear
 * down and re-open the socket — that would drop the event stream every time a
 * task status changed, which is constantly.
 */
export function useSocket(onFrame: (frame: ServerFrame) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onFrame);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const [connected, setConnected] = useState(false);

  handlerRef.current = onFrame;

  useEffect(() => {
    closedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closedRef.current) return;
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        // Re-subscribe: the server holds subscriptions per connection, so a
        // reconnect starts with none.
        for (const taskId of subscriptionsRef.current) {
          socket.send(JSON.stringify({ type: 'subscribe', taskId } satisfies ClientFrame));
        }
      };

      socket.onmessage = (message) => {
        try {
          handlerRef.current(JSON.parse(message.data as string) as ServerFrame);
        } catch {
          /* ignore malformed frames */
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (closedRef.current) return;
        const delay = Math.min(500 * 2 ** retryRef.current++, 10_000);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      closedRef.current = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback((taskId: string) => {
    subscriptionsRef.current.add(taskId);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe', taskId } satisfies ClientFrame));
    }
  }, []);

  const unsubscribe = useCallback((taskId: string) => {
    subscriptionsRef.current.delete(taskId);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'unsubscribe', taskId } satisfies ClientFrame));
    }
  }, []);

  return { connected, subscribe, unsubscribe };
}
