/**
 * Content manifest for the infinite grid — the ONE ordered sequence the whole
 * site walks.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  ADD A CARD
 *  1. Append an entry to CONTENT below. `kind` decides what opening it does:
 *       'magazine'  → `issue` id; the detail bar reads "Read issue"  → #read-NN
 *       'portfolio' → `project` id; the bar reads "Open project"     → #view-NN
 *  2. Art: drop a 2000x2600 (10:13, the hero rect) WebP in public/ and point
 *     `image` at it. `hue` stays as the fallback tint, so an entry without art
 *     still renders as a tinted block — real and placeholder cards mix freely.
 *  3. Commit & push.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The order of this list IS the shared sequence: the grid row (cell → item via
 * `contentIndex`), the detail view's Prev/Next (wrapping at the ends), the
 * mini-map squares, and — filtered to portfolio kinds — the portfolio view's
 * neighbour strip. Nothing keeps a second ordering.
 *
 * The world is an unbounded lattice of integer (col, row) cells; this list is
 * what those cells display, tiled by `contentIndex` using the live wrap stride.
 * Along any row the columns run consecutive indices, so 01 → 02 → 03 → 04 sit
 * side by side, in that order, and the four-card row is the repeating unit.
 */
import { config } from './config';
import { mod } from './grid';
import { issueCover, issueCoverRest, issueOverlay } from './reader/issue-01';

/** What a card opens. The detail bar's primary action follows from it. */
export type CardKind = 'magazine' | 'portfolio';

export interface PosterItem {
  id: number;
  title: string;
  /** URL-hash slug for deep-linking the detail view (e.g. "item-02"). */
  slug: string;
  /** Magazine cards open the reader; portfolio cards open the project view. */
  kind: CardKind;
  /** Optional card art (2000x2600). If absent, `hue` is used. */
  image?: string;
  /** Issue id (e.g. "01") — `kind: 'magazine'` only; opens `#read-NN`. */
  issue?: string;
  /** Project id (e.g. "02") — `kind: 'portfolio'` only; opens `#view-NN`. */
  project?: string;
  /** Fallback tint (HSL hue) when there is no image. */
  hue: number;
  /** Short caption fragments shown around the card edges in the hover overlay. */
  captions: string[];
  /** Call-to-action label for the overlay button. */
  cta: string;
}

/**
 * The sequence. One magazine (Discommode issue 01) followed by the three
 * portfolio projects; 02/03/04 are placeholders — flat-colour art and the shared
 * placeholder block list — until the real projects land.
 */
export const CONTENT: PosterItem[] = [
  {
    id: 0,
    title: '01',
    slug: 'item-01',
    kind: 'magazine',
    issue: '01',
    hue: 24,
    captions: ['NO 01', 'DISCOMMODE', 'ISSUE'],
    cta: 'READ',
  },
  {
    id: 1,
    title: '02',
    slug: 'item-02',
    kind: 'portfolio',
    project: '02',
    image: '/projects/02/card.webp',
    hue: 208,
    captions: ['NO 02', 'PLACEHOLDER', 'PROJECT'],
    cta: 'OPEN',
  },
  {
    id: 2,
    title: '03',
    slug: 'item-03',
    kind: 'portfolio',
    project: '03',
    image: '/projects/03/card.webp',
    hue: 276,
    captions: ['NO 03', 'PLACEHOLDER', 'PROJECT'],
    cta: 'OPEN',
  },
  {
    id: 3,
    title: '04',
    slug: 'item-04',
    kind: 'portfolio',
    project: '04',
    image: '/projects/04/card.webp',
    hue: 148,
    captions: ['NO 04', 'PLACEHOLDER', 'PROJECT'],
    cta: 'OPEN',
  },
];

export const CONTENT_COUNT = CONTENT.length;

/**
 * The portfolio cards, in manifest order — the sequence the portfolio view's
 * neighbour strip cycles (02 ↔ 03 ↔ 04, wrapping). The magazine card is not in
 * it: you return to the detail view to reach the issue.
 */
export const PORTFOLIO: PosterItem[] = CONTENT.filter((item) => item.kind === 'portfolio');

/**
 * The image a card/panel shows as its face: an issue cover takes precedence over
 * the card art, and either falls back to the hue tint (undefined here). One
 * place so the grid, detail view, and grid↔detail morph never disagree.
 */
export function itemFace(item: PosterItem): string | undefined {
  return (item.issue ? issueCover(item.issue) : undefined) ?? item.image;
}

/**
 * The face a card shows once it is the HERO — the detail view's panels, and the
 * grid→detail morph that lands on them. For a readable issue that is the drawn
 * cover AT REST, not the photographed one: the detail panel is the surface the
 * hover animations play on, and the reader's closed book (which the panel
 * becomes) shows the same drawing, so the doorway stays continuous.
 *
 * `itemFace` remains the grid's, and stays the photograph — the switch is
 * deliberate and happens as the morph starts. Portfolio cards have one piece of
 * art, so the two agree for them.
 */
export function itemHeroFace(item: PosterItem): string | undefined {
  return (item.issue ? issueCoverRest(item.issue) : undefined) ?? item.image;
}

/**
 * The hover-state overlay plate for a card, or undefined if it has none. Only
 * readable issues have one — portfolio placeholders return undefined, and the
 * grid then renders no overlay element at all for them.
 */
export function itemOverlay(item: PosterItem): string | undefined {
  return item.issue ? issueOverlay(item.issue) : undefined;
}

/** Content index for a slug, or -1 if no item matches. */
export function indexForSlug(slug: string): number {
  return CONTENT.findIndex((item) => item.slug === slug);
}

/** The issue id a slug reads (e.g. "item-01" → "01"), or null if it isn't a
 *  readable issue. Used by the dev `#item-NN?intro` doorway-authoring path. */
export function issueForSlug(slug: string): string | null {
  const i = indexForSlug(slug);
  return i >= 0 ? (CONTENT[i].issue ?? null) : null;
}

/** Content index of the card whose project id this is, or -1. Maps `#view-NN`
 *  back onto the shared sequence (so closing lands on the right detail item). */
export function indexForProject(project: string): number {
  return CONTENT.findIndex((item) => item.project === project);
}

/**
 * Deterministic mapping from any world cell to a content index, using the live
 * `wrapStride` (rows are `wrapStride` apart in the list). A true modulo wraps
 * negatives, so a given world cell always resolves to the same item.
 */
export function contentIndex(col: number, row: number): number {
  return mod(row * config.wrapStride + col, CONTENT_COUNT);
}
