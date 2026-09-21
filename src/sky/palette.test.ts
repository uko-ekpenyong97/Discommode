import { describe, expect, it } from 'vitest';
import { PALETTE_FIELDS, hexToRgb, skyFallbackCss, skyGradientAt } from './palette';
import type { SkyGradient } from './palette';

const eqColor = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const eqBand = (g: SkyGradient, hexes: readonly [string, string]) =>
  eqColor(g.zenith, hexToRgb(hexes[0])) && eqColor(g.horizon, hexToRgb(hexes[1]));

const RISING = 0;
const SETTING = 1;

/** WCAG-ish relative luminance, enough to say "this is brighter than that". */
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Distance from grey: how much colour is in it at all. */
const sat = (c: number[]) => Math.max(...c) - Math.min(...c);

describe('skyGradientAt', () => {
  it('returns the night band at and below elevation 0', () => {
    expect(eqBand(skyGradientAt(0, RISING), PALETTE_FIELDS.night)).toBe(true);
    expect(eqBand(skyGradientAt(-1, SETTING), PALETTE_FIELDS.night)).toBe(true);
  });

  it('returns the day band at high elevation', () => {
    expect(eqBand(skyGradientAt(1, RISING), PALETTE_FIELDS.day)).toBe(true);
    expect(eqBand(skyGradientAt(0.42, SETTING), PALETTE_FIELDS.day)).toBe(true);
  });

  it('uses dawn when rising and dusk when setting at the low-sun peak', () => {
    expect(eqBand(skyGradientAt(0.15, RISING), PALETTE_FIELDS.dawn)).toBe(true);
    expect(eqBand(skyGradientAt(0.15, SETTING), PALETTE_FIELDS.dusk)).toBe(true);
  });

  it('cross-fades a phase flip rather than snapping', () => {
    const half = skyGradientAt(0.15, 0.5);
    const dawn = skyGradientAt(0.15, RISING);
    const dusk = skyGradientAt(0.15, SETTING);
    for (let ch = 0; ch < 3; ch++) {
      expect(half.zenith[ch]).toBeCloseTo((dawn.zenith[ch] + dusk.zenith[ch]) / 2, 9);
    }
  });

  // The whole reason the palette was replaced: the old `day` band was four
  // desaturated blue-greys, so a clear noon was the same wash as an overcast.
  it('the day is BLUE — the zenith is saturated and blue-dominant', () => {
    const day = skyGradientAt(1, RISING);
    expect(day.zenith[2]).toBeGreaterThan(day.zenith[0] * 2);
    expect(sat(day.zenith)).toBeGreaterThan(0.4);
  });

  it('the horizon is lighter than the zenith in daylight, and both are dark at night', () => {
    const day = skyGradientAt(1, RISING);
    expect(lum(day.horizon)).toBeGreaterThan(lum(day.zenith));
    const night = skyGradientAt(0, RISING);
    expect(lum(night.zenith)).toBeLessThan(0.1);
    expect(lum(night.horizon)).toBeLessThan(0.2);
  });

  it('stays continuous across a full sweep, in both phases', () => {
    for (const phase of [RISING, SETTING]) {
      let prev = skyGradientAt(0, phase);
      for (let e = 0; e <= 1.0001; e += 0.005) {
        const cur = skyGradientAt(e, phase);
        for (const key of ['zenith', 'horizon'] as const) {
          for (let ch = 0; ch < 3; ch++) {
            expect(Math.abs(cur[key][ch] - prev[key][ch])).toBeLessThan(0.05); // no snap
          }
        }
        prev = cur;
      }
    }
  });

  it('keeps every channel within 0..1', () => {
    for (let e = -0.5; e <= 1.5; e += 0.01) {
      const g = skyGradientAt(e, 0.37);
      for (const c of [g.zenith, g.horizon]) {
        for (const ch of c) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('skyFallbackCss', () => {
  const day = skyGradientAt(1, RISING);

  it('is a zenith → horizon gradient with a transparent cloud wash over it', () => {
    const css = skyFallbackCss(day, 0);
    expect(css).toContain('linear-gradient(to bottom');
    expect(css).toContain('rgba(52, 124, 214, 1)'); // the day zenith, from the hex table
    expect(css).toContain('rgba(196, 222, 245, 1)'); // …and its horizon
    expect(css).toContain('rgba(184, 191, 204, 0)'); // the wash, absent at cloud 0
  });

  it('thickens the cloud wash with coverage', () => {
    expect(skyFallbackCss(day, 1)).toContain('0.85');
    expect(skyFallbackCss(day, 0.5)).toContain('0.425');
  });
});
