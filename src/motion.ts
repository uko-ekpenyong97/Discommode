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

/**
 * Where a release lands on one axis. Below the flick threshold it is a plain
 * snap to the nearest cell. Above it, the landing is the projected coast point,
 * forced at least one cell in the flick direction (never settles back onto the
 * card you flicked from) and capped to `maxFlickCells` of travel. The grid is
 * unbounded, so there is no clamp — flicks travel forever.
 */
export function flickTarget(axisPos: number, velocity: number): number {
  if (Math.abs(velocity) < config.flickThreshold) {
    return Math.round(axisPos);
  }

  const base = Math.round(axisPos);
  const dir = velocity > 0 ? 1 : -1;
  let landed = Math.round(axisPos + velocity * config.momentumFactor);

  // Always move at least one cell in the flick direction.
  landed = dir > 0 ? Math.max(landed, base + 1) : Math.min(landed, base - 1);
  // Cap how far a single flick may travel from the release cell.
  const cap = config.maxFlickCells;
  return Math.max(base - cap, Math.min(base + cap, landed));
}

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
