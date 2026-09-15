import type { SheetTexture } from '../blocks/types';

/**
 * WHERE A SECTION'S CAPTURES LIVE, and what set of them a section ships.
 *
 * This used to sit in `placeholder.ts`, and none of it was ever about
 * placeholders: a capture is a picture of a section's first or last viewport,
 * and a real project's sections are captured exactly the way a placeholder's
 * are. The file it lived in is what made that look like a placeholder concern.
 * Everything here is re-exported from `placeholder.ts` so the existing imports
 * still resolve.
 */

/**
 * THE PAGE RECT AT EACH SIGNED-OFF VIEWPORT, widest first — which is what the
 * captures are, and what they are named after.
 *
 * MEASURED, from the shipped page dials: the viewport less `pageMarginPx` on
 * every side, plus the letterhead's height at the top. One entry per viewport
 * and not one in total, because a page's type is a fixed size and its measure
 * is not — see `Section.sheets`.
 */
export const SHEET_SIZES = [
  { width: 1632, height: 844 },
  { width: 1344, height: 748 },
];

/**
 * …AND AT EACH SCALE. The renderer's framebuffer is at the display's pixel
 * ratio, clamped at 2, so a capture is picked by width and then by scale: a 1x
 * capture in a 2x buffer is every glyph magnified two to one, next to an HTML
 * page drawn at 2x.
 *
 * Unlike the widths, these ARE the same document twice — which is why the scale
 * is declared beside the CSS size rather than folded into it (see
 * `SheetTexture`), and why the file is `width × scale` pixels wide.
 */
export const SHEET_SCALES = [1, 2];

/**
 * Two per section per viewport per scale: the first viewport of its page and
 * the last. Written by `npm run placeholders` from the live page and committed
 * like every other WebP — see `docs/portfolio-view.md` on why this is still a
 * placeholder pipeline rather than a content one.
 *
 * The name carries the PAGE's CSS width and then the scale, `@2x` the way a
 * retina asset has been named since before anyone called it that. The width is
 * what picks the document and the scale is what picks the resolution of it, and
 * a name that multiplied the two would lose the difference between a 2x capture
 * of a 1632px page and a 1x capture of a 3264px one.
 *
 * The folder is the PROJECT ID rather than a slug, because that is what
 * `#view-NN` names and what the capture script walks.
 */
export function sheetSrc(
  project: string,
  index: number,
  width: number,
  scale: number,
  kind: 'sheet' | 'tail',
): string {
  const no = String(index + 1).padStart(2, '0');
  return `/projects/${project}/${kind}-${no}-${width}${scale > 1 ? `@${scale}x` : ''}.webp`;
}

/** Every capture of one kind a section ships: each width, at each scale. */
export function captures(
  project: string,
  index: number,
  kind: 'sheet' | 'tail',
): SheetTexture[] {
  return SHEET_SIZES.flatMap((size) =>
    SHEET_SCALES.map((scale) => ({
      src: sheetSrc(project, index, size.width, scale, kind),
      ...size,
      scale,
    })),
  );
}
