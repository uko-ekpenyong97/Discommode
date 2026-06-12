/**
 * Pure momentum/flick math. Reads the live `config` (so DialKit retuning takes
 * effect immediately) but is otherwise side-effect free and deterministic given
 * the config + inputs: it returns where the plane should land and the release
 * velocity, without touching React or the DOM.
 */
import { config, settleTauMaxScale } from './config';

export interface PointerSample {
  t: number; // timestamp (performance.now / event.timeStamp ms)
  x: number;
  y: number;
}

/** ~99% of the snap distance is treated as settled, so tau = snapMs / ln(100). */
const SETTLE_DECAY = Math.log(100);

/**
 * Release velocity in cells/sec on one axis, from a rolling sample window.
 * Uses the oldest sample still within `velocityWindowMs` of `now` and the
 * newest sample (the caller appends the release point as the final sample).
 * The sign is negated because content follows the finger — dragging left/up
 * (decreasing coordinate) moves toward higher col/row, i.e. positive velocity.
 *
 * If a pause precedes release, every real sample falls outside the window and
 * only the release point remains, so the velocity is 0 (no flick).
 */
export function releaseVelocity(
  samples: PointerSample[],
  now: number,
  axis: 'x' | 'y',
  cellSpan: number,
): number {
  const cutoff = now - config.velocityWindowMs;
  let oldest: PointerSample | null = null;
  for (const s of samples) {
    if (s.t >= cutoff) {
      oldest = s;
      break;
    }
  }
  const newest = samples[samples.length - 1];
  if (!oldest || !newest || newest.t <= oldest.t) return 0;

  const dtSec = (newest.t - oldest.t) / 1000;
  const dCoord = newest[axis] - oldest[axis];
  return -dCoord / cellSpan / dtSec;
}

// Phase 8 replaced per-axis flick projection (the former `flickTarget`) with a
// 2D vector decision in the controller: project both axes, cap the offset vector
// to maxFlickCells (preserving direction), and ensure ≥1 cell on the dominant
// axis. `releaseVelocity` (above) is now called per axis to build that vector.

/**
 * Settle time constant (seconds) for a glide of `cellsTravelled` cells. Scales
 * mildly with distance (capped) so a long flick decelerates over a touch more
 * time while a one-cell snap keeps the base settle.
 */
export function settleTauSeconds(cellsTravelled: number): number {
  const scale = Math.min(
    settleTauMaxScale,
    Math.max(1, 1 + config.settleTauPerCell * (cellsTravelled - 1)),
  );
  return (config.snapMs / 1000 / SETTLE_DECAY) * scale;
}
