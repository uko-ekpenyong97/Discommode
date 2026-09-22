/**
 * The detail cards' paper — every dial, as a tiny module store (the `config` /
 * `look` pattern): the shader and the driver read `paper` every frame, the dev
 * dock writes it through {@link setPaper}, and anything that has to REBUILD
 * rather than re-read (the mesh's segment count) subscribes.
 *
 * The numbers are ported from the reference's behaviour, not from its source:
 * its sheet is a few world units across under a perspective camera, and these
 * are in card heights on a plane pixel-matched to the DOM. See
 * docs/detail-paper.md for what each one does to the card.
 */

export interface PaperDials {
  /** A/B: 'off' leaves the detail view exactly as it was — DOM cards, no canvas. */
  paper: 'on' | 'off';
  /** How much of the crease texture is screen-blended into the artwork. 0 = none. */
  creaseBlend: number;
  /** How far a crease pushes the artwork's UVs, in UV units. 0 = none. */
  creaseDisplacement: number;
  /** The dent's radius, in UV units from the cursor. */
  hoverRadius: number;
  /** The dent's depth at the cursor, in card heights. */
  hoverDepth: number;
  /** How long the dent takes to arrive and to leave (cubic out). */
  hoverMs: number;
  /** How far the row's slide velocity pushes the cards back, per unit velocity. */
  squash: number;
  /** Cap on the velocity-driven scale-up. */
  squashScale: number;
  /** The resting ripple's amplitude on the NEIGHBOURS, in card heights. */
  ripple: number;
  /**
   * The resting ripple on the HERO. 0: the hero's plate carries Issue 01's hover
   * sprites, which are DOM and flat, and any ripple under them puts the cover
   * 2–3px off its own objects at rest. The dent still applies — that is a
   * hover, and it ends when the hover does.
   */
  heroRipple: number;
  /** How long a neighbour takes to un-crumple into its slot (ease-out). */
  foldMs: number;
  /** The fold's vertex amplitude; the reveal edge ignores it. */
  foldAmp: number;
  /** Plane subdivisions per side. */
  segments: number;
}

export const PAPER_DEFAULTS: PaperDials = {
  paper: 'on',
  creaseBlend: 0.2,
  creaseDisplacement: 0.008,
  hoverRadius: 0.35,
  hoverDepth: 0.05,
  hoverMs: 300,
  squash: 0.7,
  squashScale: 0.185,
  ripple: 0.01,
  heroRipple: 0,
  foldMs: 700,
  foldAmp: 1.0,
  segments: 40,
};

export const paper: PaperDials = { ...PAPER_DEFAULTS };

type Listener = (p: PaperDials) => void;
const listeners = new Set<Listener>();

export function setPaper(next: Partial<PaperDials>): void {
  Object.assign(paper, next);
  for (const fn of listeners) fn(paper);
}

export function subscribePaper(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
