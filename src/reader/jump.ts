/**
 * Jumps: Cover / Back cover (and Home / End) move the book more than one spread
 * at a time. Two modes:
 *
 *  - `riffle` — every intervening leaf turns, several in the air at once, their
 *    lift times laid along ONE ease-in-out over the whole run: the riffle
 *    gathers speed out of the first leaf and slows into the last, which lands
 *    like an ordinary turn.
 *  - `cut` — the target spread crossfades in over the current one, CUT_MS.
 *
 * Plain data plus pure functions; the engine (`flipEngine.turnTo`) runs the
 * plan. `JUMP` is the shipped value and the READER NAV dev panel writes into it
 * live, the same arrangement `doorway.ts` has with its dock.
 */

export type JumpMode = 'riffle' | 'cut';

/** The run-wide curve lift times are laid along. */
export type RiffleCurve = 'easeInOutCubic' | 'easeInOutSine' | 'easeInOutQuint' | 'linear';

export interface JumpSettings {
  /** How long a 20-spread riffle takes, first lift to last landing, in ms.
   *  4000 is Uko's tuning from the READER NAV dock (2026-09-21).
   *  Other distances scale by (n / 20) ^ RIFFLE_DISTANCE_EXP. */
  riffleMsPer20: number;
  /** No riffle is shorter than this, however near the target. */
  riffleMinMs: number;
  /** How far (0–1 of its travel) a leaf has turned when the next one lifts. */
  riffleOverlap: number;
  /** Most leaves in the air at once. */
  riffleMaxInAir: number;
  riffleCurve: RiffleCurve;
  /** A leaf scheduled to cross faster than this uses the half-resolution
   *  copies of its pages (`Page.riffle`); slower leaves, full size. */
  riffleHalfResBelowMs: number;
  /**
   * Every leaf IN THE AIR uses the half-resolution pages, whatever its speed;
   * a page at rest under the stack, or once its leaf has landed, goes back to
   * full size as soon as that has decoded (flipEngine.ts, `upgradeSlot`). The
   * book comes to rest on the full-size pages, as always. A READER NAV dial.
   */
  riffleHalfResInMotion: boolean;
  mode: JumpMode;
}

export const JUMP: JumpSettings = {
  riffleMsPer20: 4000,
  riffleMinMs: 900,
  riffleOverlap: 0.45,
  riffleMaxInAir: 3,
  riffleCurve: 'easeInOutCubic',
  riffleHalfResBelowMs: 150,
  riffleHalfResInMotion: false,
  mode: 'riffle',
};

/** Duration grows with distance, but sub-linearly: long jumps don't drag. */
export const RIFFLE_DISTANCE_EXP = 0.7;
/** The last leaf is the one the eye sees come to rest: never shorter than this. */
export const LAST_LEAF_MIN_MS = 320;
/** An inner leaf would rather not cross in fewer ms than this — two frames of
 *  travel — but `riffleMaxInAir` and landing order outrank it: a steep curve's
 *  middle can pack lifts tighter than this allows. */
export const MIN_LEAF_MS = 34;

/** The cut's crossfade, in ms. */
export const CUT_MS = 180;

export type Bezier = [number, number, number, number];

export const RIFFLE_CURVES: Record<RiffleCurve, Bezier> = {
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  linear: [0, 0, 1, 1],
};

/** A single inner leaf's own travel: a gentle in-out, a page flicked over. */
export const INNER_LEAF_EASE: Bezier = [0.37, 0, 0.63, 1];
/** The last leaf's: out only — it is already moving when it lifts, and settles. */
export const LAST_LEAF_EASE: Bezier = [0.33, 1, 0.68, 1];

/** A cubic-bézier timing function, x (time) → y (progress). */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Bisection on the parameter: monotonic in x for every curve used here, and
    // 30 halvings is far below a pixel of anything.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (sx(mid) < x) lo = mid;
      else hi = mid;
    }
    return sy((lo + hi) / 2);
  };
}

/** The inverse of a timing function: the time at which it reaches progress y. */
export function inverseOf(f: (x: number) => number): (y: number) => number {
  return (y: number) => {
    if (y <= 0) return 0;
    if (y >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
}

/** The whole riffle's length for a jump of `distance` spreads, in ms. */
export function riffleMs(distance: number, s: Pick<JumpSettings, 'riffleMsPer20' | 'riffleMinMs'>): number {
  if (distance <= 0) return 0;
  return Math.max(s.riffleMinMs, s.riffleMsPer20 * (distance / 20) ** RIFFLE_DISTANCE_EXP);
}

export interface RiffleLeaf {
  /** Spread the leaf lifts from, and lands on (always adjacent). */
  from: number;
  to: number;
  /** ms from the start of the run. */
  start: number;
  duration: number;
  /** True for the last leaf: its own ease, and the landing plate. */
  last: boolean;
}

/**
 * Plan a riffle from spread `from` to spread `to`: one leaf per spread crossed.
 *
 *  1. The run lasts `riffleMs(n)`. The last leaf ends it, and every lift happens
 *     in the time before it lifts. Its length follows the same rule as every
 *     other leaf's — as if one more leaf were due at the same gap — so the
 *     deceleration carries through it instead of the last leaf overtaking a
 *     slower one; never under LAST_LEAF_MIN_MS.
 *  2. Lift times are the CURVE's inverse sampled evenly: the curve says what
 *     share of the leaves should be up by each moment, so a slow start and a
 *     slow finish on the curve become wide gaps between lifts at both ends and
 *     tight ones in the middle.
 *  3. Each inner leaf lasts exactly long enough to have turned `overlap` of its
 *     travel (under its own ease) as the next one lifts…
 *  4. …clamped so it has landed before the leaf `maxInAir` places behind it
 *     lifts (never more than that many up at once), and so it lands before the
 *     leaf after it (landing order is lift order). MIN_LEAF_MS is a floor on
 *     the overlap rule only; these two clamps outrank it.
 */
export function planRiffle(from: number, to: number, s: JumpSettings): RiffleLeaf[] {
  const n = Math.abs(to - from);
  if (n === 0) return [];
  const step = to > from ? 1 : -1;
  const total = riffleMs(n, s);
  const curveInv = inverseOf(cubicBezier(RIFFLE_CURVES[s.riffleCurve]));
  // Time share of a leaf's duration at which it has travelled `overlap`.
  const overlap = Math.min(0.95, Math.max(0.05, s.riffleOverlap));
  const atOverlap = inverseOf(cubicBezier(INNER_LEAF_EASE))(overlap);
  const maxInAir = Math.max(1, Math.round(s.riffleMaxInAir));

  // The last lift gap as a share of the lift span; the last leaf lasts that gap
  // over `atOverlap`, and total = span + last. Solved for the last leaf directly.
  const lastGap = n === 1 ? 0 : 1 - curveInv((n - 2) / (n - 1));
  const r = lastGap / atOverlap;
  const lastMs = n === 1 ? total : Math.max(LAST_LEAF_MIN_MS, (total * r) / (1 + r));
  const liftSpan = total - lastMs;
  const starts = Array.from({ length: n }, (_, k) => (n === 1 ? 0 : liftSpan * curveInv(k / (n - 1))));

  const durations = new Array<number>(n);
  durations[n - 1] = lastMs;
  // Back to front, so each leaf can be held to land before the one after it.
  for (let k = n - 2; k >= 0; k--) {
    let d = Math.max(MIN_LEAF_MS, (starts[k + 1] - starts[k]) / atOverlap);
    const k2 = k + maxInAir;
    if (k2 < n) d = Math.min(d, starts[k2] - starts[k]);
    const nextEnd = starts[k + 1] + durations[k + 1];
    durations[k] = Math.min(d, nextEnd - starts[k] - 1);
  }

  return starts.map((start, k) => ({
    from: from + step * k,
    to: from + step * (k + 1),
    start,
    duration: durations[k],
    last: k === n - 1,
  }));
}
