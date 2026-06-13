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

export interface PosterItem {
  id: number;
  title: string;
  /** URL-hash slug for deep-linking the detail view (e.g. "item-07"). */
  slug: string;
  /** Optional poster image from /public/posters/. If absent, `hue` is used. */
  image?: string;
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

/** N items: a mix of image posters and hue placeholders. */
export const CONTENT: PosterItem[] = Array.from({ length: COUNT }, (_, i) => {
  const title = String(i + 1).padStart(2, '0');
  const hue = Math.round((i / COUNT) * 360);
  return {
    id: i,
    title,
    slug: `item-${title}`,
    image: SAMPLE_IMAGES[i],
    hue,
    captions: [`NO ${title}`, `HUE ${hue}`, 'INDEXED'],
    cta: 'OPEN',
  };
});

export const CONTENT_COUNT = COUNT;

/** Content index for a slug, or -1 if no item matches. */
export function indexForSlug(slug: string): number {
  return CONTENT.findIndex((item) => item.slug === slug);
}

/**
 * Deterministic mapping from any world cell to a content index, using the live
 * `wrapStride` (rows are `wrapStride` apart in the list). A true modulo wraps
 * negatives, so a given world cell always resolves to the same item.
 */
export function contentIndex(col: number, row: number): number {
  return mod(row * config.wrapStride + col, COUNT);
}
