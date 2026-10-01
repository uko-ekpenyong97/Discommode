/**
 * The inside pages' sprite atlases: their manifest's shape, and the pure
 * geometry and timing the player (pageAnimPlayer.ts) draws by. Kept apart from
 * the player so it can be tested without a browser.
 */
import { stepsIn } from './coverLife';
import type { Spread } from './issue-01';

/** One atlas, as `npm run anims` writes it (public/issues/<issue>/page-anim/manifest.json). */
export interface AtlasEntry {
  page: number;
  src: string;
  frames: number;
  fps: number;
  mode: 'loop' | 'once';
  /** The frame the page rests on (0-based). */
  rest: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  gutter: number;
  /** The drawing's w/h — what a row's h is locked to. */
  aspect: number;
}

export interface PageAnimManifest {
  issue: string;
  scale: number;
  anims: Record<string, AtlasEntry>;
}

/** Frame `i`'s cell in its atlas, atlas px. */
export function cellRect(e: AtlasEntry, i: number): { sx: number; sy: number; sw: number; sh: number } {
  const col = i % e.cols;
  const row = Math.floor(i / e.cols);
  return { sx: col * (e.cellW + e.gutter), sy: row * (e.cellH + e.gutter), sw: e.cellW, sh: e.cellH };
}

/** Which frame shows `ms` after the loop started: from the rest frame (the
 *  row's, else the manifest's), stepped at the atlas's fps. A `once`
 *  animation holds its last frame. */
export function frameAt(e: AtlasEntry, ms: number, rest = e.rest): number {
  const n = Math.max(0, stepsIn(Math.max(0, ms), e.fps));
  if (e.mode === 'once') return Math.min(e.frames - 1, rest + n);
  return (rest + n) % e.frames;
}

/** The frame a row rests on: its own `rest` if it is a frame, else the atlas's. */
export function restOf(e: AtlasEntry, rowRest: number | undefined): number {
  return rowRest != null && Number.isInteger(rowRest) && rowRest >= 0 && rowRest < e.frames ? rowRest : e.rest;
}

/** The inside pages on spreads `index − radius … index + radius`. */
export function pagesNear(spreads: Spread[], index: number, radius = 1): Set<number> {
  const out = new Set<number>();
  for (let s = index - radius; s <= index + radius; s++) {
    for (const p of spreads[s] ?? []) if (p) out.add(p.n);
  }
  return out;
}

/** The row's h for its width: the drawing's own shape. */
export const lockedH = (w: number, aspect: number): number => Math.round((w / aspect) * 100) / 100;
