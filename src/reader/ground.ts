import { LOOK } from '../portfolio/portfolioMotion';

/**
 * THE READER'S GROUND — the dials. The ground is the sky now: the same live
 * weather as the grid, the detail view and the project view, on the one shared
 * canvas (see `ReaderGround.tsx`). The wood it replaced is retired; its
 * texture and `npm run backgrounds` are still in the repo, and nothing loads
 * them.
 *
 * Three dials. `readerScrim` and `readerBookShadow` are LOOKS, chosen by eye;
 * `readerFlipSplat` is how hard a turning leaf pushes the air behind the book.
 * There used to be a fourth, `readerChromeScrim`: black over two bands at the
 * top and bottom, measured to hold the chips' type to 4.5:1 over any sky. The
 * chrome is paper shapes now (src/chrome) that carry their own contrast — the
 * glyph is measured against its own paper, not the sky — so the bands went.
 *
 * `READER_GROUND` is the live object — the dock writes it, the flip engine
 * reads it — and `applyReaderGround` publishes the two that CSS needs as
 * variables on `:root` (the book is not inside the ground, so the shadow's
 * variable has to be inherited from above both).
 */
export interface ReaderGroundDials {
  /** Black over the whole ground: how far back the sky sits behind the book.
   *  A look. Defaults to the project view's `groundScrim`, so a page read in
   *  the reader and a page read in a project sit on the same sky. */
  readerScrim: number;
  /** Strength of the contact shadow under the book (its alpha at full
   *  settle). The wood's was 0.35. */
  readerBookShadow: number;
  /** How hard a turning leaf splats into the sky's wake, × the sky's own
   *  `pageSplat`. 0 turns it off. */
  readerFlipSplat: number;
}

export const READER_GROUND_DEFAULTS: ReaderGroundDials = {
  readerScrim: LOOK.groundScrim,
  readerBookShadow: 0.22,
  readerFlipSplat: 0.5,
};

export const READER_GROUND: ReaderGroundDials = { ...READER_GROUND_DEFAULTS };

export function applyReaderGround(): void {
  const s = document.documentElement.style;
  s.setProperty('--reader-scrim', String(READER_GROUND.readerScrim));
  s.setProperty('--reader-book-shadow', String(READER_GROUND.readerBookShadow));
}

export function setReaderGround(next: Partial<ReaderGroundDials>): void {
  Object.assign(READER_GROUND, next);
  applyReaderGround();
}

/** Put the shipped values back and take the variables off `:root`, so the
 *  stylesheet's fallbacks (which are the same numbers) take over again. */
export function resetReaderGround(): void {
  Object.assign(READER_GROUND, READER_GROUND_DEFAULTS);
  const s = document.documentElement.style;
  s.removeProperty('--reader-scrim');
  s.removeProperty('--reader-book-shadow');
}
