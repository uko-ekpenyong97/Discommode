/**
 * `afterFirstPaint(fn)`: run `fn` in a task of its own once the page's first
 * contentful paint is on screen — at once (a task later) if it already is.
 *
 * For work the first frames do not show: the cover stage's context and
 * programs (each tile shows its still until its first draw lands), the sky's
 * wake (nothing to see until the pointer stirs it). Made in React's first
 * commit, they were the boot's longest tasks, and their GPU work queued
 * behind — and in front of — the raster of the first frame
 * (docs/perf/first-second.md).
 *
 * The paint entry is reported once the frame is presented. A tab that loads
 * hidden paints nothing until it is shown; the fallback timer (throttled in a
 * hidden tab) still runs everything eventually.
 */
const FALLBACK_MS = 2000;

let painted = false;
const waiting: (() => void)[] = [];

function flush() {
  if (painted) return;
  painted = true;
  for (const fn of waiting.splice(0)) window.setTimeout(fn, 0);
}

if (typeof window !== 'undefined') {
  if (performance.getEntriesByName('first-contentful-paint').length) painted = true;
  else {
    try {
      const po = new PerformanceObserver((list) => {
        if (list.getEntriesByName('first-contentful-paint').length) {
          po.disconnect();
          flush();
        }
      });
      po.observe({ type: 'paint', buffered: true });
    } catch {
      // No paint timing: two frames, then a task.
      requestAnimationFrame(() => requestAnimationFrame(() => flush()));
    }
    window.setTimeout(flush, FALLBACK_MS);
  }
}

export function afterFirstPaint(fn: () => void): void {
  if (painted) window.setTimeout(fn, 0);
  else waiting.push(fn);
}
