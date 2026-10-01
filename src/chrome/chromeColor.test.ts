import { describe, expect, it } from 'vitest';
import { CHROME_DEFAULTS, CHROME_REQUIRED } from './chromeDials';
import { INK_DARK, INK_LIGHT, chromePaint, contrast, hslToRgb, mixPaint, rgbToHsl, skyStepped } from './chromeColor';
import type { RGB } from './chromeColor';
import { PALETTE_FIELDS, hexToRgb } from '../sky/palette';

const D = CHROME_DEFAULTS;
const at = (over: Partial<typeof D>) => ({ ...D, ...over });

/** Every hue × saturation × lightness a sky could hand the chrome. */
function skies(): RGB[] {
  const out: RGB[] = [];
  for (let h = 0; h < 360; h += 15) for (const s of [0, 0.25, 0.5, 0.75, 1]) for (const l of [0.05, 0.3, 0.5, 0.7, 0.95]) out.push(hslToRgb(h, s, l));
  out.push([255, 255, 255], [0, 0, 0]);
  return out;
}

describe('hsl', () => {
  it('round-trips', () => {
    for (const c of [[12, 200, 90], [240, 118, 78], [5, 9, 24], [128, 128, 128]] as RGB[]) {
      const back = hslToRgb(...rgbToHsl(c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 6));
    }
  });
});

describe('chromePaint', () => {
  it(`holds every glyph to ${CHROME_REQUIRED}:1 on its paper, over any sky, at any dial`, () => {
    let worst = Infinity;
    for (const chromeFillLightness of [0.05, 0.22, 0.4, 0.5, 0.6, 0.8, 0.92, 0.98])
      for (const chromeInkMix of [0, 0.12, 0.3, 0.5])
        for (const chromeFillSaturation of [0, 1, 1.5])
          for (const chromeSkyStep of [0, 0.08, 0.3])
          for (const sky of skies()) {
            const p = chromePaint(sky, at({ chromeFillLightness, chromeInkMix, chromeFillSaturation, chromeSkyStep }));
            // the ratio it reports is the one the rounded colours make
            expect(p.ratio).toBeCloseTo(contrast(p.ink, p.fill), 9);
            worst = Math.min(worst, p.ratio);
          }
    expect(worst).toBeGreaterThanOrEqual(CHROME_REQUIRED);
  });

  it('keeps the sky’s hue', () => {
    for (const hex of Object.values(PALETTE_FIELDS).flat()) {
      const sky = hexToRgb(hex).map((c) => c * 255) as RGB;
      const [h, s] = rgbToHsl(sky);
      if (s < 0.2) continue;
      const [fh] = rgbToHsl(chromePaint(sky).fill);
      expect(Math.abs(((fh - h + 540) % 360) - 180), hex).toBeLessThan(3);
    }
  });

  it('as shipped: ink-dark paper and white ink, unclamped, on every palette colour', () => {
    for (const hex of Object.values(PALETTE_FIELDS).flat()) {
      const p = chromePaint(hexToRgb(hex).map((c) => c * 255) as RGB);
      expect(p.light, hex).toBe(true);
      expect(p.clamp, hex).toBeNull();
      // at chromeFillLightness, or stepped off a sky that sits too near it
      expect(rgbToHsl(p.fill)[2]).toBeCloseTo(p.skyStep ? p.skyStep.to : D.chromeFillLightness, 1);
    }
  });

  it('the paper-white direction takes ink-black', () => {
    const p = chromePaint([52, 124, 214], at({ chromeFillLightness: 0.92 }));
    expect(p.light).toBe(false);
    expect(contrast(p.ink, INK_DARK)).toBeLessThan(1.5);
  });

  it('no ink mix is pure white', () => {
    expect(chromePaint([52, 124, 214], at({ chromeInkMix: 0 })).ink).toEqual(INK_LIGHT);
  });

  it('clamps a mid-grey paper away from its ink, and says so', () => {
    // a grey of luminance ~0.19 is under 4.5:1 against white AND ink-black
    const p = chromePaint([120, 120, 120], at({ chromeFillLightness: 120 / 255, chromeInkMix: 0, chromeSkyStep: 0 }));
    expect(p.clamp).not.toBeNull();
    expect(p.ratio).toBeGreaterThanOrEqual(CHROME_REQUIRED);
  });

  it('a press only adds contrast', () => {
    for (const sky of skies()) {
      const p = chromePaint(sky);
      expect(contrast(p.ink, p.press)).toBeGreaterThanOrEqual(p.ratio - 1e-9);
    }
  });
});

describe('mixPaint', () => {
  it('holds the bar across a cross-fade whose ink flips', () => {
    const dark = chromePaint([240, 118, 78], at({ chromeFillLightness: 0.3 }));
    const light = chromePaint([240, 118, 78], at({ chromeFillLightness: 0.85 }));
    expect(dark.light).not.toBe(light.light);
    for (let t = 0; t <= 1; t += 0.05) expect(mixPaint(dark, light, t).ratio).toBeGreaterThanOrEqual(CHROME_REQUIRED);
  });
});

describe('chromeSkyStep — the paper never melts into the sky', () => {
  it('pushes the paper out of the step: darker under a dark sky, lighter under a light one', () => {
    expect(skyStepped(0.22, 0.25, 0.08)).toBeCloseTo(0.17, 9); // dark sky: darker
    expect(skyStepped(0.22, 0.18, 0.08)).toBeCloseTo(0.1, 9); //  …even from above it
    expect(skyStepped(0.1, 0.05, 0.08)).toBeCloseTo(0.13, 9); //   no room under it: lighter
    expect(skyStepped(0.9, 0.85, 0.08)).toBeCloseTo(0.93, 9); //  light sky: lighter
    expect(skyStepped(0.22, 0.31, 0.08)).toBe(0.22); //           outside the step: untouched
    expect(skyStepped(0.22, 0.25, 0)).toBe(0.22); //              0 is off
  });

  it('keeps every paper at least the step from its sky, unless the ink clamp needed the room', () => {
    for (const step of [0.08, 0.2])
      for (const sky of skies()) {
        const p = chromePaint(sky, at({ chromeSkyStep: step }));
        if (!p.clamp) expect(p.skyGap, sky.join(',')).toBeGreaterThanOrEqual(step - 0.01);
        expect(p.ratio).toBeGreaterThanOrEqual(CHROME_REQUIRED);
      }
  });

  it('reports itself, and is off at 0', () => {
    const dusk: RGB = [59, 46, 111]; // a dusk zenith, lightness 0.31
    expect(chromePaint(dusk, at({ chromeSkyStep: 0.1 })).skyStep).toMatchObject({ from: 0.22, to: 0.208 });
    expect(chromePaint(dusk, at({ chromeSkyStep: 0 })).skyStep).toBeNull();
  });
});
