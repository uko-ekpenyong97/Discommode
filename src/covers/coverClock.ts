/**
 * THE COVER CLOCK — one time for every instance of every cover.
 *
 * Every visible grid tile of card 02, the morph card and the hero sample THIS,
 * so the repeated grid row always shows one moment and the grid→detail morph
 * hands the same frame to the hero. performance.now-based; it does not advance
 * while the tab is hidden (a cover you come back to resumes where it was, not
 * minutes on), and under prefers-reduced-motion it is 0 — the still.
 */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let origin = performance.now();
let hiddenAt: number | null = document.hidden ? origin : null;
let pinned: number | null = null;

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  if (document.hidden) hiddenAt ??= now;
  else if (hiddenAt !== null) {
    origin += now - hiddenAt; // the hidden stretch never happened
    hiddenAt = null;
  }
});

/**
 * The FRAME's time: every rAF callback in one frame sees the same
 * `document.timeline.currentTime`, so the stage's loop and the paper's ticker
 * draw the same moment even though they are different callbacks.
 */
function frameNow(): number {
  const t = document.timeline.currentTime;
  return typeof t === 'number' ? t : performance.now();
}

/** Seconds on the shared cover clock. */
export function coverTime(now = frameNow()): number {
  if (pinned !== null) return pinned;
  if (reduced.matches) return 0;
  return ((hiddenAt ?? now) - origin) / 1000;
}

/** True while the covers should not move at all (reduced motion, or pinned). */
export function coverStill(): boolean {
  return reduced.matches;
}

export function subscribeReducedMotion(fn: () => void): () => void {
  reduced.addEventListener('change', fn);
  return () => reduced.removeEventListener('change', fn);
}

/** DEV / verify: hold the clock at `s` seconds, or release it (null). */
export function pinCoverTime(s: number | null) {
  pinned = s;
}
