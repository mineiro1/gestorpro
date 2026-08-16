import { useEffect, useRef } from 'react';

export function useAutoRefresh(refreshFunction: () => void, intervalMs: number = 30000) {
  const savedCallback = useRef(refreshFunction);

  useEffect(() => {
    savedCallback.current = refreshFunction;
  }, [refreshFunction]);

  useEffect(() => {
    let lastRefresh = Date.now();
    const handler = () => {
      const now = Date.now();
      if (now - lastRefresh > 2000) { // Throttle
        savedCallback.current();
        lastRefresh = now;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handler();
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handler);

    let intervalId: any;
    if (intervalMs) {
      intervalId = setInterval(() => {
        handler();
      }, intervalMs);
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handler);
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalMs]);
}
