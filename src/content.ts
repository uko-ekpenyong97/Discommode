/**
 * Placeholder content for the infinite grid. The world is an unbounded lattice
 * of integer (col, row) cells; this list is what those cells display, tiled.
 */
import { GRID_SIZE } from './config';
import { mod } from './grid';

export interface ContentItem {
  id: number;
  title: string;
  hue: number;
}

const COUNT = 25;

/** N placeholder items, each a distinct muted hue and a two-digit label. */
export const CONTENT: ContentItem[] = Array.from({ length: COUNT }, (_, i) => ({
  id: i,
  title: String(i + 1).padStart(2, '0'),
  hue: Math.round((i / COUNT) * 360),
}));

export const CONTENT_COUNT = COUNT;

/**
 * Deterministic mapping from any world cell to a content index. Rows are
 * GRID_SIZE apart in the list, and a true modulo wraps negatives, so a given
 * world cell — e.g. (7, -3) — always resolves to the same item no matter how
 * the viewer travelled there.
 */
export function contentIndex(col: number, row: number): number {
  return mod(row * GRID_SIZE + col, COUNT);
}
