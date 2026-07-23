import { useEffect, useRef, useState } from 'react';

export function useThrottledDate(date: Date, active: boolean, intervalMs: number): Date {
  const [displayed, setDisplayed] = useState(date);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef(date);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    pendingRef.current = date;

    if (!active) {
      window.clearTimeout(timeoutRef.current);
      lastUpdateRef.current = 0;
      setDisplayed(date);
      return;
    }

    const now = Date.now();
    const elapsed = lastUpdateRef.current === 0 ? intervalMs : now - lastUpdateRef.current;

    const commit = () => {
      lastUpdateRef.current = Date.now();
      setDisplayed(pendingRef.current);
    };

    if (elapsed >= intervalMs) {
      window.clearTimeout(timeoutRef.current);
      commit();
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(commit, intervalMs - elapsed);

    return () => window.clearTimeout(timeoutRef.current);
  }, [date, active, intervalMs]);

  return displayed;
}
