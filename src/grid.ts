/**
 * Pure grid math shared by the motion controller and the layers.
 *
 * The scene's source of truth is a continuous grid position `{ col, row }` in
 * cell units. `{ col: 2, row: 2 }` centres the middle card of the 5x5 window.
 * Everything visual (plane translation, per-card brightness, focused card) is
 * derived from that position.
 */
import { DIM_BY_RING, GRID_SIZE } from './config';

export interface GridPos {
  col: number;
  row: number;
}

/** Largest valid integer cell index on either axis (4 for a 5x5 grid). */
export const GRID_MAX = GRID_SIZE - 1;

/** Grid coordinate that sits at the viewport centre when un-panned. */
export const CENTER_COL = (GRID_SIZE - 1) / 2;
export const CENTER_ROW = (GRID_SIZE - 1) / 2;

/** Map a flat cell index (0..24) to its column/row. */
export function cellColRow(index: number): GridPos {
  return { col: index % GRID_SIZE, row: Math.floor(index / GRID_SIZE) };
}

/** Clamp a single-axis value to the grid bounds [0, GRID_MAX]. */
export function clampCell(value: number): number {
  return Math.min(GRID_MAX, Math.max(0, value));
}

/**
 * Chebyshev (chessboard) distance, in cell units, of a cell from the current
 * viewport-centre position. Continuous: integer at rest, fractional mid-pan.
 */
export function cellDistance(col: number, row: number, pos: GridPos): number {
  return Math.max(Math.abs(col - pos.col), Math.abs(row - pos.row));
}

/**
 * Brightness for a card, sampling DIM_BY_RING at a continuous distance with
 * linear interpolation between ring values. At integer distances this exactly
 * reproduces the Phase 1 ring-based dimming; between them it flows smoothly.
 */
export function brightnessForDistance(distance: number): number {
  const last = DIM_BY_RING.length - 1;
  if (distance <= 0) return DIM_BY_RING[0];
  if (distance >= last) return DIM_BY_RING[last];
  const lo = Math.floor(distance);
  const t = distance - lo;
  return DIM_BY_RING[lo] + (DIM_BY_RING[lo + 1] - DIM_BY_RING[lo]) * t;
}

/** Flat index of the cell nearest the viewport centre (the focused card). */
export function focusedIndex(pos: GridPos): number {
  const col = clampCell(Math.round(pos.col));
  const row = clampCell(Math.round(pos.row));
  return row * GRID_SIZE + col;
}
