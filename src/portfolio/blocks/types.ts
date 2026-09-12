/**
 * A project is an ORDERED ARRAY OF BLOCKS — the whole content model. Adding a
 * kind of thing a project can say means adding a variant here and a case in
 * `Blocks.tsx`; it never means touching the sheet, the strip or the scroller.
 *
 * Sections: consecutive blocks group into one `<section>`. A block with
 * `newSection: true` starts a fresh one (and gets the hairline divider above
 * it), so the rhythm is authored in the data rather than inferred from types.
 */

/**
 * Intrinsic pixel size. Required on every piece of media, and not a nicety: the
 * box is laid out from it BEFORE the asset loads, so a page's height is the
 * same at mount as it is once everything has decoded. A height that changes
 * moves every page start behind it, and the track is derived from those.
 */
export interface Sized {
  w: number;
  h: number;
}

/** A piece of media inside a composite block. */
export type Media =
  | ({ kind: 'image'; src: string; alt?: string } & Sized)
  | ({ kind: 'video'; src: string; poster: string } & Sized);

export type BlockBody =
  /** ~120px display heading, revealed per character. */
  | { type: 'title'; text: string }
  /** A thin one-liner — a dateline, a role, a year. */
  | { type: 'caption'; text: string }
  /** A subheading and its paragraphs. */
  | { type: 'text'; heading: string; body: string[] }
  /** Two columns, each media + paragraph. */
  | { type: 'twoUp'; columns: [TwoUpColumn, TwoUpColumn] }
  /** Full column width, or edge-to-edge of the page with `bleed`. */
  | ({ type: 'image'; src: string; alt?: string; bleed?: boolean; caption?: string } & Sized)
  /** Four columns of image + label. */
  | { type: 'statGrid'; stats: Stat[] }
  /** An outlined pill with an icon, linking out. */
  | { type: 'linkPill'; label: string; href: string }
  /** Muted, looping, plays only while in view. */
  | ({ type: 'video'; src: string; poster: string; caption?: string } & Sized)
  /** Lazy-mounted Rive artboard; never runs once the view is closed. `w`/`h` are
   *  the ARTBOARD's ratio — the box is reserved at it, so the lazy mount never
   *  reflows the page. */
  | ({ type: 'rive'; src: string; artboard?: string; stateMachine?: string; label?: string } & Sized);

export interface TwoUpColumn {
  media: Media;
  text: string;
}

export interface Stat extends Sized {
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
  /** Shown in the sheet's chrome; not a block. */
  title: string;
  /**
   * The project's PAGES, in order. Each entry is one page's blocks.
   *
   * Where a page break falls is a content decision, never a computed split of a
   * long list: a page is a held frame, and only the person writing the project
   * knows where one ends. The count is unbounded — one page is a perfectly good
   * project, and the sheet's mechanics derive everything from the list's
   * length (see `pageTrack.ts`).
   */
  pages: Block[][];
}
