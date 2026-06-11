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
  /** Short caption fragments shown around the card edges in the hover overlay. */
  captions: string[];
  /** Call-to-action label for the overlay button. */
  cta: string;
}

const COUNT = 25;

/** N placeholder items, each a distinct muted hue, a two-digit label, and
 *  placeholder overlay copy (we design these properly in a later phase). */
export const CONTENT: ContentItem[] = Array.from({ length: COUNT }, (_, i) => {
  const title = String(i + 1).padStart(2, '0');
  const hue = Math.round((i / COUNT) * 360);
  return {
    id: i,
    title,
    hue,
    captions: [`NO ${title}`, `HUE ${hue}`, 'INDEXED'],
    cta: 'OPEN',
  };
});

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
