import dials from './nosey.json';
import type { RiveCoverDef } from '../types';

/**
 * CARD 04, Nosey — a Rive cover (docs/covers.md, "Rive covers"). The file, its
 * artboard ("Nosey Detail", one instance for every surface), the state machine
 * and the focus input are the manifest's (content.ts); this is the rest:
 *
 *   frame  the artboard's size, 1000 × 1300 (10:13, the hero's ratio) —
 *          every surface is an `object-fit: cover` crop of it, and a pointer
 *          maps back through that crop into artboard space, which is these
 *          units
 *   dials  riveFocusAt (when a card opened from the grid is focused: as the
 *          morph starts, or as it lands), riveMaxDpr (the cap on the
 *          drawing's backing store) and coverPaperShade (this cover's own
 *          value for the paper's light; card 02's is the site dial)
 *   coverBackdrop  'solid': the artboard is filled #0A85D1 (the face's blue),
 *          an opaque ground of its own, so nothing is drawn behind it and the
 *          sky does not show through (docs/covers.md, "Transparency, and the
 *          backdrop")
 */
export const nosey: RiveCoverDef = {
  kind: 'rive',
  id: 'nosey',
  frame: { w: 1000, h: 1300 },
  dials,
  coverBackdrop: 'solid',
};
