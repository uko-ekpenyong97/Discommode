/**
 * Content manifest for the infinite grid.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  ADD A POSTER
 *  1. Drop the image into  public/posters/   (3:4 works best; any format).
 *  2. Add an entry to CONTENT below with `image: '/posters/<file>'`.
 *     `hue` stays as the fallback colour, so an entry without an image still
 *     renders as a tinted block — real and placeholder content can mix freely.
 *  3. Commit & push.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The world is an unbounded lattice of integer (col, row) cells; this list is
 * what those cells display, tiled by `contentIndex` using the live wrap stride.
 */
import { config } from './config';
import { mod } from './grid';
import { issueCover } from './reader/issue-01';

export interface PosterItem {
  id: number;
  title: string;
  /** URL-hash slug for deep-linking the detail view (e.g. "item-07"). */
  slug: string;
  /** Optional poster image from /public/posters/. If absent, `hue` is used. */
  image?: string;
  /** Issue id (e.g. "01") when this item is a readable issue; opens the reader. */
  issue?: string;
  /** Fallback tint (HSL hue) when there is no image. */
  hue: number;
  /** Short caption fragments shown around the card edges in the hover overlay. */
  captions: string[];
  /** Call-to-action label for the overlay button. */
  cta: string;
}

const COUNT = 25;

/** A few real sample posters, keyed by item id, to prove the mixed pipeline. */
const SAMPLE_IMAGES: Record<number, string> = {
  0: '/posters/poster-01.svg',
  7: '/posters/poster-02.svg',
  14: '/posters/poster-03.svg',
};

/** Item id → issue id, for the items that are readable issues. */
const ISSUE_BY_ID: Record<number, string> = {
  0: '01',
};

/** N items: a mix of image posters and hue placeholders. */
export const CONTENT: PosterItem[] = Array.from({ length: COUNT }, (_, i) => {
  const title = String(i + 1).padStart(2, '0');
  const hue = Math.round((i / COUNT) * 360);
  return {
    id: i,
    title,
    slug: `item-${title}`,
    image: SAMPLE_IMAGES[i],
    issue: ISSUE_BY_ID[i],
    hue,
    captions: [`NO ${title}`, `HUE ${hue}`, 'INDEXED'],
    cta: 'OPEN',
  };
});

export const CONTENT_COUNT = COUNT;

/**
 * The image a card/panel shows as its face: an issue cover takes precedence over
 * a sample poster, and either falls back to the hue tint (undefined here). One
 * place so the grid, detail view, and grid↔detail morph never disagree.
 */
export function itemFace(item: PosterItem): string | undefined {
  return (item.issue ? issueCover(item.issue) : undefined) ?? item.image;
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

/**
 * Deterministic mapping from any world cell to a content index, using the live
 * `wrapStride` (rows are `wrapStride` apart in the list). A true modulo wraps
 * negatives, so a given world cell always resolves to the same item.
 */
export function contentIndex(col: number, row: number): number {
  return mod(row * config.wrapStride + col, COUNT);
}
