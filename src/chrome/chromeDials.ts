/**
 * THE CHROME — the dials. The reader's and the detail view's buttons are
 * hand-cut paper shapes (Uko's Figma frame "readerview", his SVG outlines in
 * `public/ui/chrome/`), and their colour is not a fill: it is the sky under
 * them, darkened (or lightened) to paper. See docs/reader.md, "Chrome".
 *
 * `CHROME` is the live object: the CHROME panel writes it (in the READER NAV
 * dock, the doorway dock and the app's dev dock — one panel id, persisted),
 * `useSkyChrome` reads the colour dials on every sample, and
 * `applyChrome` publishes the layout and motion dials as variables on `:root`,
 * which is where the stylesheet reads them. This file is where tuned values
 * are pasted: the panel's Copy button writes the snippet.
 */
export interface ChromeDials {
  /** The paper's HSL lightness. 0.22 is ink-dark paper cut from the sky, with
   *  white ink; ~0.92 is the paper-white direction, with ink-black. The hue
   *  and saturation are always the sky's. */
  chromeFillLightness: number;
  /** × the sky's own HSL saturation. 1 keeps it as it is. */
  chromeFillSaturation: number;
  /** How much of the paper's hue gets into the ink: the ink is mixed this far
   *  toward the paper's hue at the ink's own lightness. 0 is pure white / ink-black. */
  chromeInkMix: number;
  /** The cross-fade when the sky under a shape changes, ms. */
  chromeColorEase: number;
  /** How often the sky under the chrome is read back, ms. Never per frame. */
  chromeSampleMs: number;
  /** Hover: the shape's scale. */
  chromeHoverLift: number;
  /** Hover: its tilt, degrees (alternating sign along the row). */
  chromeHoverTilt: number;
  /** Hover: in and out, ms. */
  chromeHoverMs: number;
  /** Press: the paper's lightness moves this far AWAY from the ink, so a press
   *  only ever adds contrast. */
  chromePressNudge: number;
  /** The whole chrome's size, × the frame's (58 / 46 / 131×46 at 1). Hit
   *  areas never go under 44×44 whatever this says. */
  chromeScale: number;
  /** The row's bottom edge, and the top shape's top edge, px from the viewport's. */
  chromeMargin: number;
  /** Between two shapes in a row, px (× chromeScale). */
  chromeGap: number;
}

export const CHROME_DEFAULTS: ChromeDials = {
  chromeFillLightness: 0.22,
  chromeFillSaturation: 1,
  chromeInkMix: 0.12,
  chromeColorEase: 600,
  chromeSampleMs: 500,
  chromeHoverLift: 1.04,
  chromeHoverTilt: 2,
  chromeHoverMs: 120,
  chromePressNudge: 0.05,
  chromeScale: 1,
  chromeMargin: 35,
  chromeGap: 26,
};

export const CHROME: ChromeDials = { ...CHROME_DEFAULTS };

/** The bar every glyph is held to against its own paper: WCAG AA for
 *  normal-size text. */
export const CHROME_REQUIRED = 4.5;

const VARS: [keyof ChromeDials, string, string][] = [
  ['chromeHoverLift', '--chrome-hover-lift', ''],
  ['chromeHoverTilt', '--chrome-hover-tilt', 'deg'],
  ['chromeHoverMs', '--chrome-hover-ms', 'ms'],
  ['chromeScale', '--chrome-scale', ''],
  ['chromeMargin', '--chrome-margin', 'px'],
  ['chromeGap', '--chrome-gap', 'px'],
];

type Listener = (d: ChromeDials) => void;
const listeners = new Set<Listener>();

export function applyChrome(): void {
  const s = document.documentElement.style;
  for (const [k, v, unit] of VARS) s.setProperty(v, `${CHROME[k]}${unit}`);
}

export function setChrome(next: Partial<ChromeDials>): void {
  Object.assign(CHROME, next);
  applyChrome();
  for (const fn of listeners) fn(CHROME);
}

export function subscribeChrome(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The paste-ready snippet the panel's Copy button writes. */
export function chromeSnippet(d: ChromeDials = CHROME): string {
  const body = (Object.keys(CHROME_DEFAULTS) as (keyof ChromeDials)[]).map((k) => `  ${k}: ${d[k]},`).join('\n');
  return `// tuned values — paste over CHROME_DEFAULTS in src/chrome/chromeDials.ts\nexport const CHROME_DEFAULTS: ChromeDials = {\n${body}\n};`;
}
