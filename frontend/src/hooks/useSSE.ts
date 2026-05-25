import { useEffect, useRef } from 'react';

export type SSEEventHandler = (data: any) => void;

export function useSSE(url: string, onEvent: SSEEventHandler) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        onEventRef.current(JSON.parse(e.data));
      } catch (err) {
        console.warn('useSSE parse error', err);
        onEventRef.current({ raw: e.data });
      }
    };

    es.onerror = (err) => {
      console.error('SSE error', err);
      es.close();
    };

    return () => es.close();
  }, [url]); // only re-subscribe when URL changes, not on every render
}
