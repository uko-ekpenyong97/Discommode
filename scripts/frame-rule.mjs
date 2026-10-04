/**
 * THE FRAME RULE of verify:cover's `drag` and verify:jank: "no frame over 33
 * ms", counted in vsyncs so a frame's few tenths of jitter never decide it
 * (an interval is a whole number of 16.67 ms vsyncs, give or take ~0.2 ms;
 * verify:detail counts the same way).
 *
 * Forgiven: ONE frame that dropped one vsync (two vsyncs long, 33.3 ms), on its
 * own. Over the budget:
 *   - any frame three vsyncs or longer (50 ms: two dropped in a row), and
 *   - a frame that dropped a vsync NEXT TO another that did (33 + 33: two
 *     dropped frames in a row).
 *
 * `budget` is the length, in vsyncs, an isolated frame may reach: 2, or 3
 * where a rule allows one more (verify:jank with the dev dock).
 */
export const VSYNC_MS = 1000 / 60;

export const vsyncs = (ms) => Math.round(ms / VSYNC_MS);

/** The indices of the frames (rAF intervals, ms, in order) that break the rule. */
export function overFrames(dts, budget = 2) {
  const v = dts.map(vsyncs);
  const out = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] > budget) out.push(i);
    else if (v[i] === budget && budget > 1 && (v[i - 1] >= budget || v[i + 1] >= budget)) out.push(i);
  }
  return out;
}
