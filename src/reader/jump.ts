/**
 * Jumps: Cover / Back cover (and Home / End) move the book more than one spread
 * at a time. Two modes:
 *
 *  - `riffle` — successive leaf turns through the intervening spreads, each
 *    shorter than the one after it, so the pages flick past and the LAST leaf
 *    lands like an ordinary turn. The whole jump fits in `riffleTotalMs`
 *    however far it goes.
 *  - `cut` — the target spread crossfades in over the current one, CUT_MS.
 *
 * Plain data plus one pure function; the engine (`flipEngine.turnTo`) runs the
 * plan. `JUMP` is the shipped value and the READER NAV dev panel writes into it
 * live, the same arrangement `doorway.ts` has with its dock.
 */

export type JumpMode = 'riffle' | 'cut';

export interface JumpSettings {
  /** The whole riffle, click to landed, in ms. */
  riffleTotalMs: number;
  /** No leaf is shorter than this. Spreads that would need a shorter leaf are
   *  folded into the first leaf instead of being drawn. */
  riffleMinLeafMs: number;
  mode: JumpMode;
}

export const JUMP: JumpSettings = {
  riffleTotalMs: 700,
  riffleMinLeafMs: 60,
  mode: 'riffle',
};

/** Each leaf lasts this fraction of the one after it. */
export const RIFFLE_RATIO = 0.7;

/** The cut's crossfade, in ms. */
export const CUT_MS = 180;

export interface RifflePlan {
  /** The spread each leaf lands on, in order. The last is the target. */
  stops: number[];
  /** Each leaf's duration in ms, same order. Grows toward the end. */
  durations: number[];
}

/**
 * Plan a riffle from spread `from` to spread `to`.
 *
 * Durations are geometric going BACK from the landing: the last leaf is the
 * longest and each one before it is `RIFFLE_RATIO` of the next, scaled so the
 * leaves sum to exactly `totalMs`. That is as many leaves as fit before the
 * first would drop under `minLeafMs`; if the distance is longer than that, the
 * first leaf carries the extra spreads (it lifts the current page and lands on a
 * page further on — at the first leaf's speed the skip is not something the eye
 * resolves). The last leaf is capped at `maxLeafMs`, the ordinary turn, so a
 * short jump never turns SLOWER than a Next click.
 *
 * The engine plans with the budget net of its landing reserve (flipEngine
 * `LAND_RESERVE_MS`, 120ms), then re-fits each leaf in flight to the time left.
 * With the shipped dials that is 580ms, and a jump of four or more spreads is
 * four leaves: 78, 112, 160, 229ms.
 */
export function planRiffle(
  from: number,
  to: number,
  totalMs: number,
  minLeafMs: number,
  maxLeafMs: number,
  ratio = RIFFLE_RATIO,
): RifflePlan {
  const distance = Math.abs(to - from);
  if (distance === 0) return { stops: [], durations: [] };
  const step = to > from ? 1 : -1;

  let leaves = distance;
  let last = totalMs;
  for (; leaves > 1; leaves--) {
    last = (totalMs * (1 - ratio)) / (1 - ratio ** leaves);
    if (last * ratio ** (leaves - 1) >= minLeafMs) break;
  }
  if (leaves === 1) last = totalMs;
  const scale = last > maxLeafMs ? maxLeafMs / last : 1;

  const durations: number[] = [];
  const stops: number[] = [];
  for (let k = 0; k < leaves; k++) {
    durations.push(last * scale * ratio ** (leaves - 1 - k));
    // Leaf k lands `leaves - 1 - k` spreads short of the target.
    stops.push(to - step * (leaves - 1 - k));
  }
  return { stops, durations };
}
