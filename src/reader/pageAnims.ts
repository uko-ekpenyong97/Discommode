/**
 * Where the inside pages' animations sit (docs/reader.md, "Inside-page
 * animations"). INPUT to `npm run anims` (which sizes each atlas from its row)
 * and to the reader, which draws each sprite into this box.
 *
 * One row per animation, in PAGE px (2000×2600, the baked page's own): the box
 * of every frame's drawing together, turned `rotation` degrees CLOCKWISE (CSS's
 * sense) about its centre, and mirrored left–right before it turns if `flipX`.
 * Its h is always `w / aspect`, the drawing's own (the build's manifest
 * carries it): the align tool keeps it so, and `pageAnims.test.ts` holds every
 * row to it.
 *
 * The align tool (READER NAV dock, `#read-NN?intro`) writes these rows: Copy
 * pastes one. `npm run anims` prints a SUGGESTED row from registering the
 * frames against the baked page, and never writes this file.
 *
 * Registered 2026-10-01 (scripts/page-anim-register.mjs): every frame of
 * each animation against its baked page, the best frame its `rest`, with the
 * agreement and peak margin beside each row. sfmoma at its known rotation;
 * sofa-yellow mirrored (Figma reported its flipped layer's x at its right
 * edge); cuffs by a rotation search seeded on the drawing's measured bounds,
 * whose best (−58.95°) puts frame 2 within 5px of them but agrees only 71.9%:
 * the print's chain is whole where every frame's is not.
 *
 * Plain data and no imports: the build scripts import this file directly.
 */

export interface PageAnim {
  /** The printed page (`Page.n`): 1 is the first page after the cover. */
  page: number;
  /** The folder in `~/Discommode-pages/<issue>/anim/`, and the atlas's name. */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the box's centre. */
  rotation: number;
  /** Mirrored left–right (before the rotation). */
  flipX?: boolean;
  /**
   * The frame the page rests on, 0-based (`Name-3.png` is 2): the frame the
   * baked page PRINTS, found by registering every frame against it. A settle
   * fades in on it and starts the loop from it; reduced motion and the align
   * tool hold it. Absent: the first frame with any drawing.
   */
  rest?: number;
}

export const PAGE_ANIM_ISSUE = '01';
export const PAGE_W = 2000;
export const PAGE_H = 2600;

/**
 * The atlas's cell size as a share of the row's placed size. 1: a sprite has
 * the baked page's own resolution, so it is exactly as sharp as the plate under
 * it at any display size. Lower it (and `npm run anims`) to trade that for
 * bytes; the reader draws into the row's box whatever the cell.
 */
export const PAGE_ANIM_SCALE = 1;

export const PAGE_ANIMS: PageAnim[] = [
  { page: 8, id: 'badges', x: 1143.2, y: 859.71, w: 723.95, h: 860.29, rotation: 0, rest: 2 }, // matched: agree 92.6%, margin 5.5%
  { page: 10, id: 'sfmoma', x: 308.73, y: 765.91, w: 487.46, h: 685.09, rotation: 16.36, rest: 1 }, // matched: agree 96.7%, margin 11.5%
  { page: 11, id: 'cuffs', x: 1002.84, y: 1695.32, w: 860.24, h: 602.07, rotation: -58.95, rest: 1 }, // registered at its turn: agree 71.9%, margin 26.1% — frame 2's chain is drawn broken where the print's is whole
  { page: 15, id: 'cubiculo', x: 1036, y: 1872.02, w: 805.37, h: 606.94, rotation: 0, rest: 1 }, // matched: agree 95.0%, margin 14.0%
  { page: 17, id: 'cuqui', x: 158.31, y: 1842.09, w: 480.79, h: 662.67, rotation: 0, rest: 1 }, // matched: agree 94.4%, margin 33.7%
  { page: 18, id: 'highlander', x: 233, y: 1896.04, w: 1589.64, h: 498.34, rotation: 0, rest: 0 }, // matched: agree 86.5%, margin 11.6%
  { page: 24, id: 'sofa-green', x: 1127.74, y: 2206.3, w: 746.87, h: 248.61, rotation: 0, rest: 0 }, // matched: agree 96.1%, margin 13.8%
  { page: 25, id: 'sofa-yellow', x: 1093.86, y: 2142.69, w: 612.83, h: 328.54, rotation: 0, flipX: true, rest: 1 }, // matched: agree 95.7%, margin 12.1%
  { page: 27, id: 'sofa-pink', x: 667.52, y: 1953.16, w: 670.31, h: 323.4, rotation: 0, rest: 1 }, // matched: agree 96.7%, margin 12.2%
  { page: 34, id: 'op1-animation', x: 995.37, y: 2148.52, w: 891.48, h: 340.68, rotation: 0, rest: 1 }, // matched: agree 93.3%, margin 21.1%
  { page: 35, id: 'ipad', x: 126.38, y: 851.68, w: 680.8, h: 412.49, rotation: 0, rest: 9 }, // matched: agree 88.6%, margin 22.8%
  { page: 36, id: 'halfframe', x: 1446.59, y: 1354.27, w: 372.67, h: 413.83, rotation: 0, rest: 0 }, // matched: agree 98.0%, margin 17.6%
  { page: 37, id: 'carrito', x: 644.57, y: 131.39, w: 334.69, h: 509.14, rotation: 0, rest: 9 }, // matched: agree 91.0%, margin 31.6%
];

/** The pages that carry an animation, ascending. */
export const ANIMATED_PAGES: number[] = [...new Set(PAGE_ANIMS.map((r) => r.page))].sort((a, b) => a - b);

/** The animations on one printed page. */
export function animsOnPage(page: number): PageAnim[] {
  return PAGE_ANIMS.filter((r) => r.page === page);
}
