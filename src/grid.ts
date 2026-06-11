/**
 * Pure grid math shared by the motion controller and the layers.
 *
 * The scene's source of truth is a continuous, unbounded grid position
 * `{ col, row }` in cell units. There are no edges; coordinates run to any
 * integer. Layout sizes and the wrap stride live in the reactive config.
 */
import { DIM_BY_RING } from './config';

export interface GridPos {
  col: number;
  row: number;
}

/** True modulo: the result is always in [0, m). `mod(-1, 25) === 24`. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Brightness for a card, sampling DIM_BY_RING at a continuous distance with
 * linear interpolation between ring values. At integer distances this exactly
 * reproduces the ring-based dimming; between them it flows smoothly.
 */
export function brightnessForDistance(distance: number): number {
  const last = DIM_BY_RING.length - 1;
  if (distance <= 0) return DIM_BY_RING[0];
  if (distance >= last) return DIM_BY_RING[last];
  const lo = Math.floor(distance);
  const t = distance - lo;
  return DIM_BY_RING[lo] + (DIM_BY_RING[lo + 1] - DIM_BY_RING[lo]) * t;
}
