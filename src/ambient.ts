/**
 * AMBIENT MOTION AT 60 — the sky's drift and wake, the cover clock's covers
 * (the shaders and card 04's Rive face), wherever they are drawn: at most ~60
 * frames a second, whatever the screen's refresh. On a 120 Hz screen (a
 * MacBook's ProMotion) Chrome runs rAF at 120 where Safari runs 60, and paid
 * for every WebGL canvas twice over (docs/perf/thirty-fps.md). What moves with
 * the hand — the grid, the paper, the page turns — keeps the full rate.
 *
 * One decision per FRAME, cached by the frame's timestamp, so the sky's loop,
 * the cover stage's and the paper's cover draws skip the same frames. The rule:
 * draw when the time since the last ambient frame, plus half a frame, reaches a
 * 60 Hz frame. At 60 Hz or less that is every frame. At 120 every other one; at
 * 90 (11.1 ms) every frame still, rather than a judder of 2 in 3; at 144 every
 * other one (72).
 */
const FRAME_60 = 1000 / 60;

let stamp = -1;
let due = true;
let lastDue = -Infinity;
let prev = -1;
/** The screen's frame interval, ms, as measured: a running mean. */
let interval = FRAME_60;
let off = false;

/** The frame's time: every rAF callback in one frame sees the same one. */
function frameNow(): number {
  const t = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof t === 'number' ? t : performance.now();
}

/** Whether ambient motion draws on this frame. Ask in each rAF callback,
 *  without an argument: every caller then reads the same frame clock. */
export function ambientFrame(now: number = frameNow()): boolean {
  // The same frame, asked again (by another loop, or with a clock a hair off).
  if (Math.abs(now - stamp) < 1) return due;
  if (prev >= 0) {
    const d = now - prev;
    // Not across a pause (a hidden tab, a stopped loop) or a long frame.
    if (d > 2 && d < 40) interval += (d - interval) * 0.2;
  }
  prev = now;
  stamp = now;
  due = off || now - lastDue >= FRAME_60 - interval / 2 - 1;
  if (due) lastDue = now;
  return due;
}

/** The screen's frame interval as measured, ms. */
export const frameInterval = (): number => interval;

/** DEV / checks: draw ambient motion on every frame (true), or cap it again. */
export function setAmbientUncapped(v: boolean): void {
  off = v;
}
