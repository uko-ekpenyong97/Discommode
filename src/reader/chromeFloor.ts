/**
 * THE READER'S CHROME OVER THE SKY — the arithmetic, with no DOM in it, so the
 * floor can be a unit test (`ground.test.ts`) and the browser probe
 * (`chromeContrast.ts`) and the sweep (`scripts/sky-contrast.mjs`) all ask the
 * same question the same way.
 *
 * What a run of chrome type is printed on, bottom to top: the SKY (the
 * brightest pixel of the chrome's band), black at `readerScrim` over the whole
 * ground, black at `readerChromeScrim` over the band, then the chip's own fill
 * (a translucent grey — the detail view's, `DetailView.css`), then the type in
 * its own translucent white. The bar is WCAG AA for normal text, 4.5:1: the
 * chrome's type is 11–16px mono, none of it large.
 *
 * There is no grain in the reader, so unlike the project view's probe this is
 * one number per run of type rather than a distribution.
 */

export type RGB = [number, number, number];
/** A CSS colour as RGB 0–255 and alpha 0–1. */
export type RGBA = [number, number, number, number];

/** WCAG relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over: `top` at `alpha` on `under`. */
export function over(top: RGB, alpha: number, under: RGB): RGB {
  return [
    alpha * top[0] + (1 - alpha) * under[0],
    alpha * top[1] + (1 - alpha) * under[1],
    alpha * top[2] + (1 - alpha) * under[2],
  ];
}

const BLACK: RGB = [0, 0, 0];

/** The ground under the chrome: the sky under both washes. */
export function groundUnderChrome(sky: RGB, readerScrim: number, readerChromeScrim: number): RGB {
  return over(BLACK, readerChromeScrim, over(BLACK, readerScrim, sky));
}

/**
 * One run of chrome type over one sky: the ground, then each fill between it
 * and the type (outermost first), then the type. Returns the WCAG ratio of the
 * type against what it sits on.
 */
export function chromeRatio(ground: RGB, fills: RGBA[], text: RGBA): number {
  let under = ground;
  for (const [r, g, b, a] of fills) under = over([r, g, b], a, under);
  const ink = over([text[0], text[1], text[2]], text[3], under);
  return contrast(ink, under);
}

/**
 * The chrome's runs of type as the stylesheets have them — the MODEL the unit
 * test holds the floor with. The browser probe reads the real ones off the
 * elements, so if these drift from the CSS the sweep says so.
 */
export const CHROME_RUNS: { kind: string; fills: RGBA[]; text: RGBA }[] = [
  // `.detail__back`: black 0.5 pill, white 0.85 type, 14px.
  { kind: 'reader__back', fills: [[0, 0, 0, 0.5]], text: [255, 255, 255, 0.85] },
  // `.detail__btn`: grey 53 at 0.4, white type, 16px.
  { kind: 'detail__btn', fills: [[53, 53, 53, 0.4]], text: [255, 255, 255, 1] },
  // `.reader__caption`: the same chip; "SPREAD n / N" at white 0.5, 11px —
  // the dimmest type on the chrome, and so the one the floor is set by.
  { kind: 'reader__caption', fills: [[53, 53, 53, 0.4]], text: [255, 255, 255, 0.5] },
  // `.reader__pages`: the pages in the same chip, at white 0.72.
  { kind: 'reader__pages', fills: [[53, 53, 53, 0.4]], text: [255, 255, 255, 0.72] },
];

/** The worst run of chrome type over `sky`. */
export function worstChrome(sky: RGB, readerScrim: number, readerChromeScrim: number): { ratio: number; kind: string } {
  const ground = groundUnderChrome(sky, readerScrim, readerChromeScrim);
  let worst = { ratio: Infinity, kind: '' };
  for (const run of CHROME_RUNS) {
    const ratio = chromeRatio(ground, run.fills, run.text);
    if (ratio < worst.ratio) worst = { ratio, kind: run.kind };
  }
  return worst;
}
