import { useRef } from 'react';

/** Keeps the latest callback in a ref for effects that should not re-run when the parent re-renders. */
export function useStableCallbackRef<T extends (...args: never[]) => unknown>(callback: T) {
  const ref = useRef(callback);
  ref.current = callback;
  return ref;
}
