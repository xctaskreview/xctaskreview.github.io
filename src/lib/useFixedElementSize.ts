import { useLayoutEffect, useState, type RefObject } from 'react';

export interface FixedElementSize {
  width: number;
  height: number;
}

export function useFixedElementSize(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): FixedElementSize {
  const [size, setSize] = useState<FixedElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const width = Math.max(0, Math.floor(element.clientWidth));
      const height = Math.max(0, Math.floor(element.clientHeight));
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, enabled]);

  return size;
}
