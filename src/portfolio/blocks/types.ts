/**
 * A project is an ORDERED ARRAY OF BLOCKS — the whole content model. Adding a
 * kind of thing a project can say means adding a variant here and a case in
 * `Blocks.tsx`; it never means touching the sheet, the strip or the scroller.
 *
 * Sections: consecutive blocks group into one `<section>`. A block with
 * `newSection: true` starts a fresh one (and gets the hairline divider above
 * it), so the rhythm is authored in the data rather than inferred from types.
 */

/** A piece of media inside a composite block. */
export type Media =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; src: string; poster: string };

export type BlockBody =
  /** ~120px display heading, revealed per character. */
  | { type: 'title'; text: string }
  /** A thin one-liner — a dateline, a role, a year. */
  | { type: 'caption'; text: string }
  /** A subheading and its paragraphs. */
  | { type: 'text'; heading: string; body: string[] }
  /** Two columns, each media + paragraph. */
  | { type: 'twoUp'; columns: [TwoUpColumn, TwoUpColumn] }
  /** Full column width, or edge-to-edge of the article with `bleed`. */
  | { type: 'image'; src: string; alt?: string; bleed?: boolean; caption?: string }
  /** Four columns of image + label. */
  | { type: 'statGrid'; stats: Stat[] }
  /** An outlined pill with an icon, linking out. */
  | { type: 'linkPill'; label: string; href: string }
  /** Muted, looping, plays only while in view. */
  | { type: 'video'; src: string; poster: string; caption?: string }
  /** Lazy-mounted Rive artboard; never runs once the view is closed. */
  | { type: 'rive'; src: string; artboard?: string; stateMachine?: string; label?: string };

export interface TwoUpColumn {
  media: Media;
  text: string;
}

export interface Stat {
  src: string;
  label: string;
}

export type Block = BlockBody & {
  /** Start a new `<section>` at this block (hairline divider above it). */
  newSection?: boolean;
  /** Give this block the 3D flip-in rather than the standard reveal — for the
   *  one or two frames a project leads with. */
  flip?: boolean;
};

export interface Project {
  /** Project id — the `NN` in `#view-NN`. */
  id: string;
  blocks: Block[];
}
