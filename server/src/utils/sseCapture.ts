import { Response } from 'express';

interface SSEPayload {
  fullText: string;
  fitScore?: number | null;
  score?: number | null;
}

/**
 * Wraps res.write and res.end to capture the final SSE payload emitted by AI
 * streaming functions. Calls onComplete once with the accumulated result when
 * the stream ends, allowing callers to persist data without duplicating the
 * write/end override pattern across routes.
 */
export function withSSECapture(
  res: Response,
  onComplete: (payload: SSEPayload) => void
): void {
  let captured: SSEPayload = { fullText: '' };

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = function(chunk: unknown, ...args: unknown[]) {
    const str = typeof chunk === 'string' ? chunk : chunk instanceof Buffer ? chunk.toString() : '';
    for (const line of str.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) {
            captured = { fullText: data.fullText || '', fitScore: data.fitScore ?? null, score: data.score ?? null };
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
    return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args);
  } as typeof res.write;

  res.end = function(...args: unknown[]) {
    try {
      onComplete(captured);
    } catch {
      // ignore post-stream errors so the response always completes
    }
    return (originalEnd as (...a: unknown[]) => void)(...args);
  } as typeof res.end;
}
