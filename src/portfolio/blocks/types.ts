/**
 * A project is an ORDERED ARRAY OF BLOCKS — the whole content model. Adding a
 * kind of thing a project can say means adding a variant here and a case in
 * `Blocks.tsx`; it never means touching the sheet, the page or the scroller.
 *
 * Runs: consecutive blocks group into one `<div class="pv-run">`. A block with
 * `newRun: true` starts a fresh one (and gets the hairline divider above it),
 * so the rhythm is authored in the data rather than inferred from types.
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
  /**
   * THE LETTERHEAD. The number, the title and a mono date/ref line, at the top
   * of the page. Every section opens with one, and that is what makes
   * `sheet.webp` a picture of a DOCUMENT rather than a crop of a scrolling
   * list — the capture is the section's first viewport, so whatever is at the
   * top of the page is what the rolled sheet is showing.
   *
   * Not the same thing as the letterhead STRIP on the ground, which names the
   * project and never moves. This one is printed on the paper.
   */
  | { type: 'letterhead'; no: string; title: string; ref: string }
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
  /** The full measure, or edge-to-edge of the page with `bleed`. */
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
   *  divider above it. A run is a paragraph-level grouping inside a page, not a
   *  section: a section is a whole sheet of paper. */
  newRun?: boolean;
  /** Give this block the 3D flip-in rather than the standard reveal — for the
   *  one or two frames a project leads with. */
  flip?: boolean;
};

/**
 * The capture of a section's first viewport, as a texture.
 *
 * The intrinsic size is carried for the same reason every other piece of media
 * carries one, even though nothing lays out around this one: it is the table
 * the generator writes the file from, a texture whose size is a guess is a
 * texture nobody can tell has gone stale — and here it is also how the right
 * capture is CHOSEN. See {@link Section.sheets}.
 *
 * THE CSS SIZE AND THE SCALE ARE DECLARED SEPARATELY, the way an `srcset`
 * descriptor is and for the same reason. `width`/`height` are the page rect the
 * capture was taken of, in CSS pixels, and they are what a capture is picked by
 * — two captures at the same width are the same document. `scale` is how many
 * device pixels the file has per CSS pixel: the file itself is
 * `width × scale` by `height × scale`. Folding the two into one number would
 * make a 2x capture of a 1632px page indistinguishable from a 1x capture of a
 * 3264px one, which is a different document.
 */
export interface SheetTexture {
  src: string;
  /** The page rect it was taken of, in CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel: 1 or 2. The file is `width × scale` wide. */
  scale: number;
}

/**
 * One SECTION of a project, which is one sheet of paper.
 *
 * Where a section break falls is a content decision, never a computed split of
 * a long list: a section is a sheet, and only the person writing the project
 * knows where one ends.
 */
export interface Section {
  /** Named on the ground's letterhead while you are reading it, and on the
   *  page's own letterhead block. */
  title: string;
  blocks: Block[];
  /**
   * THE SECTION'S FIRST VIEWPORT, one capture per signed-off viewport PER
   * SCALE, widest first. This is what the entrance unrolls into the page.
   *
   * It would be tidier for one capture to serve both viewports, and it does not
   * work. The page's type is a fixed number of pixels and its measure is not,
   * so a page at 1632 wraps its lines somewhere a page at 1344 does not — the
   * two are different documents, not the same document at two scales, and no
   * amount of resampling turns one into the other. Measured: a single capture
   * put the hand-off diff at 8–16% of the page's pixels at the viewport it was
   * not taken at, against a 2% budget. With one each it is under 2% at both.
   *
   * ONE MORE PER SCALE, and that one IS the same document at two scales — which
   * is exactly why it has to ship rather than be resampled: the renderer's
   * framebuffer is at the display's pixel ratio, so a 1x capture on a 2x display
   * is every glyph magnified two to one next to an HTML page drawn at 2x, at the
   * one moment the two surfaces swap.
   *
   * `SheetCanvas` picks the one whose `width` is nearest the live page's rect
   * and then the `scale` nearest the renderer's, so a project that ships one
   * capture still works — at one viewport, on one kind of display.
   */
  sheets: SheetTexture[];
  /**
   * THE SECTION'S LAST VIEWPORT, the same way. This is what the tear peels off
   * the ground.
   *
   * A tear always begins with the page scrolled to its bottom — that is what
   * the end of a vertical run IS — so the frame it starts from is as
   * deterministic as the one an entrance ends on, and it can be captured the
   * same way. Without it the peel would have to start from the section's first
   * viewport, which is a different page, and the reverse hand-off would be a
   * cut rather than a crossfade.
   */
  tails: SheetTexture[];
}

export interface Project {
  /** Project id — the `NN` in `#view-NN`. */
  id: string;
  /** Shown on the ground's letterhead; not a block. */
  title: string;
  /** A dateline for the ground's letterhead. A placeholder until there is a
   *  real project to put one on. */
  ref: string;
  /**
   * The project's SECTIONS, in order. The count is unbounded — one section is a
   * perfectly good project, and it exercises the case with no turn at all (see
   * `pageTrack.ts`).
   */
  sections: Section[];
}
