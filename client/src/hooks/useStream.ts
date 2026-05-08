import { useState, useCallback, useRef } from 'react';
import { streamRequest } from '@/api';

interface StreamState {
  text: string;
  done: boolean;
  error: string | null;
  loading: boolean;
}

interface StreamResult extends StreamState {
  start: (path: string, body: object, onComplete?: (payload: Record<string, unknown>) => void) => Promise<void>;
  reset: () => void;
  setText: (text: string) => void;
}

export function useStream(): StreamResult {
  const [state, setState] = useState<StreamState>({
    text: '',
    done: false,
    error: null,
    loading: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setState({ text: '', done: false, error: null, loading: false });
  }, []);

  const setText = useCallback((text: string) => {
    setState(prev => ({ ...prev, text }));
  }, []);

  const start = useCallback(async (
    path: string,
    body: object,
    onComplete?: (payload: Record<string, unknown>) => void
  ) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    abortRef.current = new AbortController();

    setState({ text: '', done: false, error: null, loading: true });

    try {
      const response = await streamRequest(path, body, abortRef.current.signal);

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          errMsg = (data as { error?: string }).error || errMsg;
        } catch {
          // ignore
        }
        setState(prev => ({ ...prev, error: errMsg, loading: false }));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr) as Record<string, unknown>;

              if (data.error) {
                setState(prev => ({ ...prev, error: String(data.error), loading: false }));
                return;
              }

              if (data.done) {
                setState(prev => ({ ...prev, done: true, loading: false }));
                if (onComplete) onComplete(data);
              } else if (data.token) {
                setState(prev => ({ ...prev, text: prev.text + String(data.token) }));
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      setState(prev => ({ ...prev, loading: false, done: true }));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Stream failed';
      setState(prev => ({ ...prev, error: message, loading: false }));
    }
  }, []);

  return { ...state, start, reset, setText };
}
