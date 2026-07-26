import { NextResponse } from 'next/server';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a handler so a thrown error becomes a JSON body instead of Next's HTML
 * error page — the UI reads `error` off every failed response.
 */
export async function handle<T>(fn: () => Promise<T> | T): Promise<NextResponse> {
  try {
    return ok(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[karkhana] api error:', err);
    return bad(message, 500);
  }
}
