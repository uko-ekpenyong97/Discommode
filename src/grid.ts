/**
 * Pure grid math shared by the motion controller and the layers.
 *
 * The scene's source of truth is a continuous, unbounded grid position
 * `{ col, row }` in cell units. There are no edges; coordinates run to any
 * integer. Layout sizes and the wrap stride live in the reactive config.
 */
import { DIM_BY_RING, config } from './config';

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

/**
 * Focus scale for a card: `focusScale` at the centre, easing to 1.0 by one cell
 * of distance. A continuous function of distance (cell units), so it flows
 * across cards as the plane pans rather than toggling.
 */
export function focusScaleForDistance(distance: number): number {
  const t = Math.min(Math.max(distance, 0), 1);
  return config.focusScale + (1 - config.focusScale) * t;
}

/**
 * Focus opacity for a card: 1.0 at the centre, falling to `unfocusedOpacity` by
 * one cell and `farOpacity` by two (flat beyond). Combines with the brightness
 * dimming — both apply.
 */
export function focusOpacityForDistance(distance: number): number {
  if (distance <= 1) {
    return 1 + (config.unfocusedOpacity - 1) * Math.min(Math.max(distance, 0), 1);
  }
  const t = Math.min(distance - 1, 1);
  return config.unfocusedOpacity + (config.farOpacity - config.unfocusedOpacity) * t;
}
