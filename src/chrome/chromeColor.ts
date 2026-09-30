import { CHROME, CHROME_REQUIRED } from './chromeDials';
import type { ChromeDials } from './chromeDials';

/**
 * THE CHROME'S COLOUR — a relationship with the sky, not a fill. Pure, with no
 * DOM in it: the live chrome (`useSkyChrome`), the browser probe and the sweep
 * (`chromeContrast.ts`, `scripts/sky-contrast.mjs`) and the unit test all ask
 * it the same question the same way.
 *
 *   1. The sky under a shape (its mean colour, read back from the sky's canvas)
 *      gives a HUE and a SATURATION, in HSL.
 *   2. The paper keeps them — saturation × `chromeFillSaturation` — at the
 *      lightness `chromeFillLightness`: ink-dark paper cut from the sky at
 *      0.22, paper-white at ~0.92.
 *   3. The ink is whichever of white and the site's ink-black reads harder on
 *      that paper, mixed `chromeInkMix` of the way toward the paper's own hue
 *      at the ink's lightness, so a little of the sky gets into it too.
 *   4. THE CLAMP. If the glyph is under 4.5:1 on its paper, the paper's
 *      lightness is moved AWAY from the ink, 0.005 at a time, until it is not.
 *      The clamp is reported (`clamp`), and the sweep prints every one.
 *
 * The paper is opaque and the glyph sits wholly inside it, so the sky itself
 * is not in the contrast at all: fill against ink is the whole question. What
 * the sky decides is which fill.
 *
 * Colours are 0..255 sRGB, and fill and ink are ROUNDED to whole levels before
 * they are measured — the ratio is the one the stylesheet will actually paint.
 */

export type RGB = [number, number, number];

/** White ink, on dark paper. */
export const INK_LIGHT: RGB = [255, 255, 255];
/** The site's ink-black (`--pv-ink`), on light paper. */
export const INK_DARK: RGB = [0x14, 0x12, 0x0f];

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

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const round = (c: RGB): RGB => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** sRGB 0..255 → [hue 0..360, saturation 0..1, lightness 0..1]. */
export function rgbToHsl([r8, g8, b8]: RGB): [number, number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, clamp01(s), l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export interface ChromePaint {
  /** The paper, at rest and hovered. */
  fill: RGB;
  /** The paper pressed: `chromePressNudge` further from the ink. */
  press: RGB;
  /** Glyphs, the pill's numbers and its hairline. */
  ink: RGB;
  /** True for white ink on dark paper, false for ink-black on light. */
  light: boolean;
  /** Glyph against paper, as painted. ≥ {@link CHROME_REQUIRED} always. */
  ratio: number;
  /** Set when the paper had to be moved off `chromeFillLightness` to reach
   *  the bar: the lightness it was asked for and the one it got. */
  clamp: { from: number; to: number } | null;
}

/**
 * Move `fill` (at hue `h`, saturation `s`, lightness `l`) away from `ink` until
 * the two are at least {@link CHROME_REQUIRED} apart. Returns the rounded fill
 * and the lightness it ended on.
 */
function hold(h: number, s: number, l: number, ink: RGB, light: boolean): { fill: RGB; l: number } {
  const dir = light ? -1 : 1;
  let L = l;
  let fill = round(hslToRgb(h, s, L));
  while (contrast(ink, fill) < CHROME_REQUIRED && L > 0 && L < 1) {
    L = clamp01(L + dir * 0.005);
    fill = round(hslToRgb(h, s, L));
  }
  return { fill, l: L };
}

/** The paper and ink for a sky colour. See the top of this file. */
export function chromePaint(sky: RGB, d: ChromeDials = CHROME): ChromePaint {
  const [h, s0] = rgbToHsl(sky);
  const s = clamp01(s0 * d.chromeFillSaturation);
  const l0 = clamp01(d.chromeFillLightness);
  const asked = round(hslToRgb(h, s, l0));
  const light = contrast(INK_LIGHT, asked) >= contrast(INK_DARK, asked);
  const ink = round(mix(light ? INK_LIGHT : INK_DARK, hslToRgb(h, s, light ? 0.85 : 0.15), clamp01(d.chromeInkMix)));
  const held = hold(h, s, l0, ink, light);
  const press = round(hslToRgb(h, s, clamp01(held.l + (light ? -1 : 1) * d.chromePressNudge)));
  return {
    fill: held.fill,
    press,
    ink,
    light,
    ratio: contrast(ink, held.fill),
    clamp: Math.abs(held.l - l0) > 1e-9 ? { from: l0, to: Math.round(held.l * 1000) / 1000 } : null,
  };
}

/**
 * A step of the cross-fade between two paints, `t` 0..1. Linear in sRGB, and
 * held to the bar on the way: two passing paints can have a failing mixture
 * between them (an ink that flips from white to black crosses grey on grey),
 * so the mixture's paper is clamped the same way.
 */
export function mixPaint(a: ChromePaint, b: ChromePaint, t: number): ChromePaint {
  if (t >= 1) return b;
  const ink = round(mix(a.ink, b.ink, t));
  const fill = round(mix(a.fill, b.fill, t));
  // Which way the paper can get away from this ink: toward black if the ink
  // is the lighter pole's, toward white if not.
  const light = contrast(ink, [0, 0, 0]) >= contrast(ink, [255, 255, 255]);
  let out = fill;
  if (contrast(ink, fill) < CHROME_REQUIRED) {
    const [h, s, l] = rgbToHsl(fill);
    out = hold(h, s, l, ink, light).fill;
  }
  return { ...b, fill: out, press: round(mix(a.press, b.press, t)), ink, light, ratio: contrast(ink, out) };
}

export const css = (c: RGB): string => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
