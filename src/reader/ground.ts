import { LOOK } from '../portfolio/portfolioMotion';

/**
 * THE READER'S GROUND — the dials. The ground is the sky now: the same live
 * weather as the grid, the detail view and the project view, on the one shared
 * canvas (see `ReaderGround.tsx`). The wood it replaced is retired; its
 * texture and `npm run backgrounds` are still in the repo, and nothing loads
 * them.
 *
 * Four dials, and like the project view's two washes they are two kinds of
 * thing. `readerScrim` and `readerBookShadow` are LOOKS, chosen by eye.
 * `readerChromeScrim` is MEASURED: it is what holds the back pill and the page
 * bar to 4.5:1 over any sky the shader can paint, and a test fails if it drops
 * under the floor (`ground.test.ts`). `readerFlipSplat` is how hard a turning
 * leaf pushes the air behind the book.
 *
 * `READER_GROUND` is the live object — the dock writes it, the flip engine and
 * the contrast probe read it — and `applyReaderGround` publishes the three
 * that CSS needs as variables on `:root` (the book is not inside the ground,
 * so the shadow's variable has to be inherited from above both).
 */
export interface ReaderGroundDials {
  /** Black over the whole ground: how far back the sky sits behind the book.
   *  A look. Defaults to the project view's `groundScrim`, so a page read in
   *  the reader and a page read in a project sit on the same sky. */
  readerScrim: number;
  /** Black over the two bands the chrome sits in (the back pill at the top,
   *  the page bar at the bottom), on top of `readerScrim`. MEASURED: the
   *  lowest value at which every run of chrome type is ≥ 4.5:1 over a
   *  pure-white band, plus margin. See `docs/reader.md`. */
  readerChromeScrim: number;
  /** Strength of the contact shadow under the book (its alpha at full
   *  settle). The wood's was 0.35. */
  readerBookShadow: number;
  /** How hard a turning leaf splats into the sky's wake, × the sky's own
   *  `pageSplat`. 0 turns it off. */
  readerFlipSplat: number;
}

export const READER_GROUND_DEFAULTS: ReaderGroundDials = {
  readerScrim: LOOK.groundScrim,
  readerChromeScrim: 0.75,
  readerBookShadow: 0.22,
  readerFlipSplat: 0.5,
};

export const READER_GROUND: ReaderGroundDials = { ...READER_GROUND_DEFAULTS };

/**
 * The chrome's band, CSS px from its screen edge: the detail margin (24) +
 * the chip (40) + 8 of air. The wash is flat across it — so the type sits on
 * one value and the probe's number is exact — and fades out over the same
 * height again beyond it, where there is no type.
 */
export const CHROME_BAND_PX = 72;

/** The bar the chrome is held to: WCAG AA for normal-size text. */
export const CHROME_REQUIRED = 4.5;

export function applyReaderGround(): void {
  const s = document.documentElement.style;
  s.setProperty('--reader-scrim', String(READER_GROUND.readerScrim));
  s.setProperty('--reader-chrome-scrim', String(READER_GROUND.readerChromeScrim));
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
  s.removeProperty('--reader-chrome-scrim');
  s.removeProperty('--reader-book-shadow');
}
