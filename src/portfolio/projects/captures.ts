import type { SheetTexture } from '../blocks/types';
import { CAPTURE_HEIGHT, CAPTURE_SCALE, PAGE_BUCKETS, pageWidthFor } from '../pageBuckets';
import { LOOK } from '../portfolioMotion';

/**
 * WHERE A SECTION'S CAPTURES LIVE, and what set of them a section ships.
 *
 * A capture is a picture of a section's first or last viewport, and a real
 * project's sections are captured exactly the way a placeholder's are.
 * Everything here is re-exported from `placeholder.ts` so the older imports
 * still resolve.
 *
 * ONE PER PAGE BUCKET, at one scale and one tall height. The page is laid out
 * at a bucket's width and nothing in between (see `pageBuckets.ts`), so a
 * capture per bucket is a capture of every page a reader can be shown. The
 * height is fixed and taller than any page the view draws, and the sheet crops
 * it by uv to the live page's height. So the window's height needs no capture
 * of its own.
 *
 * Written by `npm run placeholders` from the live page, and committed like
 * every other WebP.
 */

/**
 * `sheet-01-1728@2x.webp`: the kind, the section, the BUCKET, and the scale.
 *
 * The bucket rather than the page width. The page width is the bucket less a
 * margin dial, and a name that moved when a dial did would be a name nobody
 * could find the file by. The scale is still in the name, the way a retina
 * asset has been named since before anyone called it that.
 *
 * The folder is the PROJECT ID rather than a slug, because that is what
 * `#view-NN` names and what the capture script walks.
 */
export function sheetSrc(
  project: string,
  index: number,
  bucket: number,
  scale: number,
  kind: 'sheet' | 'tail',
): string {
  const no = String(index + 1).padStart(2, '0');
  return `/projects/${project}/${kind}-${no}-${bucket}${scale > 1 ? `@${scale}x` : ''}.webp`;
}

/** Every capture of one kind a section ships: one per bucket. */
export function captures(
  project: string,
  index: number,
  kind: 'sheet' | 'tail',
): SheetTexture[] {
  return PAGE_BUCKETS.map((bucket) => ({
    src: sheetSrc(project, index, bucket, CAPTURE_SCALE, kind),
    bucket,
    width: pageWidthFor(bucket, LOOK.pageMarginPx),
    height: CAPTURE_HEIGHT,
    scale: CAPTURE_SCALE,
  }));
}
