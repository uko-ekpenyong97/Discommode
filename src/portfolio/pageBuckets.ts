import BUCKETS from './pageBuckets.json';

/**
 * THE PAGE'S WIDTH COMES FROM A LIST, and the list is the dial.
 *
 * A page's type is a fixed number of pixels and its measure is not, so a page
 * laid out at one width is a different document from the same page at
 * another: the lines wrap elsewhere, a two-up's halves change height, a list
 * row's media box is a different size. The sheet is a PICTURE of the page, and
 * the hand-off swaps one for the other, so the two must be the same document,
 * and a picture can only be taken of a width somebody chose in advance.
 *
 * So the page is not as wide as the window. It is as wide as the nearest
 * BUCKET at or below the window's width, less a margin each side, and it is
 * centred on the ground. The ground's margins absorb whatever is left over.
 * Every bucket has its own real layout (the grid, the spans, the measure and
 * the media boxes all resolve at its width), and every bucket has its own
 * captures. A window between two buckets gets the smaller one's page and
 * wider margins.
 *
 * The buckets are window widths rather than page widths because that is how a
 * person names a screen, and it keeps the list readable: bucket 1728 is the
 * page a 1728px window has always had (1632 wide at the shipped 48px margin).
 * The list lives in JSON so the capture script and `pv-verify` read the same
 * one. Change it, and `npm run placeholders -- --force` retakes the captures.
 *
 * Below the smallest bucket there is nothing to snap down to. The page falls
 * back to the window less its margins, and the sheet wears the smallest
 * bucket's capture resized to fit. That is a stretch, and the only place one
 * is left. See `docs/portfolio-view.md`.
 */
export const PAGE_BUCKETS: readonly number[] = [...BUCKETS.buckets].sort((a, b) => a - b);

/**
 * THE CAPTURES ARE TALLER THAN ANY PAGE, and the sheet crops them. A page's
 * height is the window's, less the letterhead and two margins, and a window's
 * height is not a list anyone can choose from. So each bucket is captured once,
 * with the page this many CSS pixels tall, and the sheet shows the rows the
 * live page would show: the top of it for a `sheet`, and the right band near
 * the bottom for a `tail`.
 */
export const CAPTURE_HEIGHT: number = BUCKETS.captureHeight;

/** Device pixels per CSS pixel in every capture. One scale, and the larger of
 *  the two the renderer ever uses: a 2x capture minifies exactly 2:1 onto a 1x
 *  framebuffer, which bilinear sampling averages four texels to one for. */
export const CAPTURE_SCALE: number = BUCKETS.captureScale;

/** The bucket a window of `width` CSS pixels lays its page out at, or null when
 *  it is narrower than every bucket. */
export function bucketFor(width: number): number | null {
  let found: number | null = null;
  for (const b of PAGE_BUCKETS) if (b <= width) found = b;
  return found;
}

/** A bucket's page width: the bucket less one margin each side. */
export const pageWidthFor = (bucket: number, marginPx: number): number => bucket - 2 * marginPx;
