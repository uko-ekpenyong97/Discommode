/** DEV: time `fn` as a User Timing measure `paper:<name>`. */
export function span<T>(name: string, fn: () => T): T {
  if (!import.meta.env.DEV) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    performance.measure(`paper:${name}`, { start: t0, end: performance.now() });
  }
}
