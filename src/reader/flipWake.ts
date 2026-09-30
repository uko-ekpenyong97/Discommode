import { skyWake } from '../sky/skyStage';
import { READER_GROUND } from './ground';

/**
 * A TURNING LEAF MOVES AIR. The reader's ground is the sky now, and the sky's
 * wake already hears everything else on the page that moves — a sliding card, a
 * sheet rolling in, the doorway's neighbours (`skyStage.ts`). A page swinging
 * over the spine is the biggest thing that moves in the reader, so it splats
 * too: its free edge, at the top, the middle and the bottom of the page, at the
 * speed the edge is travelling across the screen.
 *
 * The book is in front of the sky, so the middle of that is behind the paper.
 * What reads is the air pushed out past the book's top and bottom edges and,
 * as the leaf lands, the gust off its outer edge — behind the book, which is
 * where air a page pushes would go.
 *
 * Every ordinary turn a person makes (Prev / Next, arrows, a drag, its commit
 * or cancel) and every leaf of a riffle comes through here. The doorway's own
 * cover turn does not: it drives the curl directly and already splats the
 * cover's edge itself (`useDoorwayMotion`), with the strength that was tuned
 * for it.
 */

/** Where the book is on screen, CSS px. Kept by the engine, not measured per
 *  frame: a layout read in the middle of a turn's style writes is a forced
 *  layout on the frame the turn is trying to hold. */
export interface BookGeometry {
  /** The spine's x — the book's centre, with its half-page slide. */
  spineX: number;
  /** One page's width (half the book). */
  pageW: number;
  top: number;
  bottom: number;
}

/**
 * The x of a leaf's free edge on screen for chain angle `tt` (0 flat on its
 * own side, π flat on the other). A `next` leaf is the right page, hinged at
 * the spine; a `prev` leaf is its mirror. Orthographic: the book's perspective
 * pushes the edge a little further out while the leaf stands up, which a
 * 0.08-screen-height splat does not notice.
 */
export function leafEdgeX(spineX: number, pageW: number, dir: 'next' | 'prev', tt: number): number {
  const c = Math.cos(tt);
  return dir === 'next' ? spineX + pageW * c : spineX - pageW * c;
}

/** Splat a leaf's free edge into the wake, under `key` (one per leaf in the
 *  air, so each has its own velocity). A no-op at `readerFlipSplat` 0. */
export function flipWake(key: string, geo: BookGeometry, dir: 'next' | 'prev', tt: number): void {
  const k = READER_GROUND.readerFlipSplat;
  if (!(k > 0)) return;
  const x = leafEdgeX(geo.spineX, geo.pageW, dir, tt);
  skyWake(
    key,
    [
      [x, geo.top],
      [x, (geo.top + geo.bottom) / 2],
      [x, geo.bottom],
    ],
    k,
  );
}
