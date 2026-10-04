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
  /** Ticks (1/fps s) each frame is held, from the folder's Procreate APNG.
   *  Absent: every frame one tick. */
  holds?: number[];
  /** The APNG's own loop, ms (what `holds` was counted from). */
  apngMs?: number;
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

/** The manifest's holds if there is a whole one per frame, else null (every
 *  frame one tick). */
export function holdsOf(e: AtlasEntry): number[] | null {
  const h = e.holds;
  return h && h.length === e.frames && h.every((t) => Number.isInteger(t) && t >= 1) ? h : null;
}

/** Which frame shows `ms` after the loop started: from the start of the rest
 *  frame's hold (the row's rest, else the manifest's), counting ticks of the
 *  atlas's fps against the cumulative holds. From elapsed time, never from
 *  counted draws, so a loop keeps its length however frames are dropped. A
 *  `once` animation holds its last frame. */
export function frameAt(e: AtlasEntry, ms: number, rest = e.rest): number {
  const n = Math.max(0, stepsIn(Math.max(0, ms), e.fps));
  const holds = holdsOf(e);
  if (!holds) {
    if (e.mode === 'once') return Math.min(e.frames - 1, rest + n);
    return (rest + n) % e.frames;
  }
  let t = n;
  let total = 0;
  for (let i = 0; i < holds.length; i++) {
    if (i < rest) t += holds[i];
    total += holds[i];
  }
  if (e.mode === 'once') {
    if (t >= total) return e.frames - 1;
  } else {
    t %= total;
  }
  for (let i = 0; i < holds.length; i++) {
    if (t < holds[i]) return i;
    t -= holds[i];
  }
  return e.frames - 1;
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
