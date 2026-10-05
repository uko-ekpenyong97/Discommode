/**
 * THE FRAME RULE of verify:cover's `drag` and verify:jank: "no frame over 33
 * ms", judged so that a frame's jitter never decides it. An interval is a whole
 * number of vsyncs give or take a few tenths of a ms — 16.67 ms at 60 Hz, 8.33
 * at 120 Hz (headed Chrome on this Mac) — so a frame is measured against
 * whole vsyncs plus a JITTER_MS allowance, not rounded.
 *
 * Forgiven: ONE frame that dropped one vsync (up to two vsyncs long, 33.3 ms +
 * jitter), on its own. Over the budget:
 *   - any frame longer than that (50 ms at 60 Hz; 41.7 ms, five 120 Hz ticks,
 *     which the old rounding passed at 41.4 and failed at 41.8), and
 *   - a dropped frame (over one vsync) NEXT TO another dropped frame (33 + 33:
 *     two dropped frames in a row).
 *
 * `budget` is how many 60 Hz vsyncs an isolated frame may last: 2, or 3 where
 * a rule allows one more (verify:jank with the dev dock).
 */
export const VSYNC_MS = 1000 / 60;
export const JITTER_MS = 3;

const dropped = (ms) => ms > VSYNC_MS + JITTER_MS;

/** The indices of the frames (rAF intervals, ms, in order) that break the rule. */
export function overFrames(dts, budget = 2) {
  const long = budget * VSYNC_MS + JITTER_MS;
  const out = [];
  for (let i = 0; i < dts.length; i++) {
    if (dts[i] > long) out.push(i);
    else if (dropped(dts[i]) && (dropped(dts[i - 1] ?? 0) || dropped(dts[i + 1] ?? 0))) out.push(i);
  }
  return out;
}
