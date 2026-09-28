import dials from './nosey.json';
import type { RiveCoverDef } from '../types';

/**
 * CARD 04, Nosey — a Rive cover (docs/covers.md, "Rive covers"). The file, its
 * artboards ("Main" in the grid, "Main Bounce" as the detail hero) and the
 * state machine are the manifest's (content.ts); this is the rest:
 *
 *   frame  Main's and Main Bounce's size, 1000 × 1300 (10:13, the hero's
 *          ratio) — every instance is an `object-fit: cover` crop of it, and a
 *          pointer on an instance maps back through that crop into artboard
 *          space, which is these units
 *   dials  riveSwapAt (when the hero switches to Main Bounce: as the
 *          grid→detail morph lands, or as it starts), riveMaxDpr (the cap on
 *          the drawing's backing store) and coverPaperShade (this cover's own
 *          value for the paper's light; card 02's is the site dial)
 *   coverBackdrop  'solid': Main and Main Bounce are filled #E0DDDD, an opaque
 *          ground of their own, so nothing is drawn behind them and the sky
 *          does not show through (docs/covers.md, "Transparency, and the
 *          backdrop")
 */
export const nosey: RiveCoverDef = {
  kind: 'rive',
  id: 'nosey',
  frame: { w: 1000, h: 1300 },
  dials,
  coverBackdrop: 'solid',
};
