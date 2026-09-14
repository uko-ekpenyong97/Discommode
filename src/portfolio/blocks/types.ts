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
  /** Two columns, each media + paragraph. Six grid columns each. */
  | { type: 'twoUp'; columns: [TwoUpColumn, TwoUpColumn] }
  /**
   * A LIST ROW: text on the left, a piece of media pinned to the right. Seven
   * grid columns and five. For the part of a project that reads as a table —
   * a list of pieces, a run of credits — where a stack of full-width blocks
   * would read as a stack of separate things.
   */
  | { type: 'row'; heading: string; text: string; media: Media }
  /** The full measure, or edge-to-edge of the folder with `bleed`. */
  | ({ type: 'image'; src: string; alt?: string; bleed?: boolean; caption?: string } & Sized)
  /** Four columns of image + label. Three grid columns each. */
  | { type: 'statGrid'; stats: Stat[] }
  /** An outlined pill with an icon, linking out. */
  | { type: 'linkPill'; label: string; href: string }
  /** Muted, looping, plays only while in view. */
  | ({ type: 'video'; src: string; poster: string; bleed?: boolean; caption?: string } & Sized)
  /** Lazy-mounted Rive artboard; never runs once the view is closed. `w`/`h` are
   *  the ARTBOARD's ratio — the box is reserved at it, so the lazy mount never
   *  reflows the page. */
  | ({
      type: 'rive';
      src: string;
      artboard?: string;
      stateMachine?: string;
      label?: string;
      bleed?: boolean;
    } & Sized);

export interface TwoUpColumn {
  media: Media;
  text: string;
}

export interface Stat extends Sized {
  src: string;
  label: string;
}

export type Block = BlockBody & {
  /**
   * How many of the page's TWELVE columns this block takes. Omitted, the block
   * takes its type's default (see `spanOf` in `Blocks.tsx`) — which is the
   * whole twelve for everything that is not already two or four things side by
   * side. Here so a project can narrow one block without a class of its own.
   */
  span?: number;
  /** Start a new RUN at this block — one `<div class="pv-run">` with a hairline
   *  divider above it. A run is a paragraph-level grouping inside a section,
   *  not a section: sections are the notebook's tabbed units. */
  newRun?: boolean;
  /** Give this block the 3D flip-in rather than the standard reveal — for the
   *  one or two frames a project leads with. */
  flip?: boolean;
};

/**
 * One tabbed section of a project — a divider in the notebook.
 *
 * Where a section break falls is a content decision, never a computed split of
 * a long list: a section is what a tab names, and only the person writing the
 * project knows where one ends.
 */
export interface Section {
  /** The tab's label, running down the left edge. */
  title: string;
  /** HSL hue for this section's glass and its tab. Sections are told apart by
   *  colour as much as by label, so it belongs to the content, not to a theme. */
  hue: number;
  blocks: Block[];
}

export interface Project {
  /** Project id — the `NN` in `#view-NN`. */
  id: string;
  /** Shown in the sheet's chrome; not a block. */
  title: string;
  /**
   * The project's SECTIONS, in order. The count is unbounded — one section is a
   * perfectly good project, and the notebook derives everything from the list's
   * length, down to how tall the tabs have to be to fit (see `pageTrack.ts`).
   */
  sections: Section[];
}
