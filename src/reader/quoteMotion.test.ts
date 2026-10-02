import { describe, expect, it } from 'vitest';
import {
  FLICK_DEG,
  FLICK_MS,
  HOVER_MS,
  breathAt,
  flickAt,
  follow,
  hexToOklab,
  labDistance,
  oklabToHex,
  paletteAt,
  settleLab,
  tweenAt,
  tweenDone,
} from './quoteMotion';
import { QUOTE_DEFAULTS } from './quotes';
import data from './quotes.json';

describe('the hover grow', () => {
  it('eases from where it is to where it goes over 500ms, ahead of linear (an ease-out)', () => {
    const tw = { from: 1.01, to: 1.03, t0: 100 };
    expect(tweenAt(tw, 100)).toBe(1.01);
    expect(tweenAt(tw, 100 + HOVER_MS)).toBeCloseTo(1.03, 9);
    expect(tweenAt(tw, 100 + HOVER_MS / 2)).toBeGreaterThan(1.02);
    expect(tweenDone(tw, 100 + HOVER_MS - 1)).toBe(false);
    expect(tweenDone(tw, 100 + HOVER_MS)).toBe(true);
  });
});

describe('the breathing guide', () => {
  it('rises to its scale and back over the first 55% of the loop, then rests', () => {
    expect(breathAt(0, 3600, 1.012)).toBe(1);
    expect(breathAt(0.275 * 3600, 3600, 1.012)).toBeCloseTo(1.012, 9);
    expect(breathAt(0.55 * 3600, 3600, 1.012)).toBe(1);
    expect(breathAt(0.8 * 3600, 3600, 1.012)).toBe(1);
    expect(breathAt(3600 + 0.275 * 3600, 3600, 1.012)).toBeCloseTo(1.012, 9);
    for (let ms = 0; ms < 3600; ms += 37) {
      const v = breathAt(ms, 3600, 1.012);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(1.012 + 1e-12);
    }
  });
});

describe('the flick', () => {
  it('is an extra −22°, a sine over 420ms, nothing outside it', () => {
    expect(flickAt(-1)).toBe(0);
    expect(flickAt(0)).toBeCloseTo(0, 9);
    expect(flickAt(FLICK_MS / 2)).toBeCloseTo(FLICK_DEG, 9);
    expect(flickAt(FLICK_MS)).toBe(0);
    expect(FLICK_DEG).toBe(-22);
  });
});

describe('the wand’s colour, in OKLab', () => {
  const palette = data.settings.wandPalette.map(hexToOklab);

  it('round-trips sRGB through OKLab', () => {
    for (const h of data.settings.wandPalette) expect(oklabToHex(hexToOklab(h))).toBe(h.toLowerCase());
    expect(hexToOklab('#ffffff')[0]).toBeCloseTo(1, 4);
    expect(hexToOklab('#000000')[0]).toBeCloseTo(0, 6);
  });

  it('passes through each colour in turn, one loop per cycle, back to the first', () => {
    const n = palette.length;
    for (let i = 0; i < n; i++) expect(oklabToHex(paletteAt(palette, (i * 1200) / n, 1200))).toBe(data.settings.wandPalette[i].toLowerCase());
    expect(oklabToHex(paletteAt(palette, 1200, 1200))).toBe('#e8d555');
    // Between two stops it is their OKLab midpoint, not their sRGB one.
    const mid = paletteAt(palette, 1200 / n / 2, 1200);
    expect(labDistance(mid, palette[0])).toBeCloseTo(labDistance(mid, palette[1]), 9);
  });

  it('settles back to the base colour on its time constant', () => {
    const from = palette[2];
    const base = palette[0];
    const after = settleLab(from, base, 220);
    expect(labDistance(after, base) / labDistance(from, base)).toBeCloseTo(Math.exp(-1), 9);
    expect(labDistance(settleLab(from, base, 5000), base)).toBeLessThan(1e-9);
  });
});

describe('the wand follows the pointer', () => {
  it('eases toward it on a 28ms time constant', () => {
    expect(follow(0, 100, 28)).toBeCloseTo(100 * (1 - Math.exp(-1)), 9);
    expect(follow(0, 100, 0)).toBe(0);
  });
});

describe('the settings', () => {
  it('ship the brief’s values', () => {
    expect(QUOTE_DEFAULTS).toMatchObject({
      wandTiltDeg: -32,
      wandSizePx: 52,
      hoverScale: 1.03,
      colorCycleMs: 1200,
      wandPalette: ['#E8D555', '#FF8E91', '#425EB6', '#519B66', '#F5A04A'],
      breatheScale: 1.012,
      breathePeriodMs: 3600,
      breatheUntilFirstTap: true,
      flickOnTap: true,
    });
  });
});
