import { useEffect, useLayoutEffect, useRef } from 'react';

/** Largest frame delta (seconds) we integrate, guarding against the big jump
 *  produced after a tab has been backgrounded. */
const MAX_DT = 0.05;

/**
 * The single requestAnimationFrame loop for the whole app. Every per-frame
 * update flows through the `callback`, which receives the frame delta in
 * seconds (clamped). The loop is created once; the latest callback is read
 * from a ref so changing closures never restart it.
 */
export function useTicker(callback: (dtSeconds: number) => void): void {
  const callbackRef = useRef(callback);
  // Keep the ref pointing at the latest callback without restarting the loop.
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      callbackRef.current(dt);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
