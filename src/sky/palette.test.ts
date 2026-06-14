import { describe, expect, it } from 'vitest';
import {
  PALETTE_FIELDS,
  applyFieldWeather,
  fieldColorsAt,
  hexToRgb,
} from './palette';
import type { FieldColors } from './palette';

const eqColor = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const eqField = (f: FieldColors, hexes: readonly string[]) =>
  f.every((c, i) => eqColor(c, hexToRgb(hexes[i])));

describe('fieldColorsAt', () => {
  it('returns the night set at elevation 0', () => {
    expect(eqField(fieldColorsAt(0, 'rising'), PALETTE_FIELDS.night)).toBe(true);
  });

  it('returns the day set at high elevation', () => {
    expect(eqField(fieldColorsAt(1, 'rising'), PALETTE_FIELDS.day)).toBe(true);
    expect(eqField(fieldColorsAt(0.35, 'setting'), PALETTE_FIELDS.day)).toBe(true);
  });

  it('uses dawn when rising and dusk when setting at the low-sun peak', () => {
    expect(eqField(fieldColorsAt(0.15, 'rising'), PALETTE_FIELDS.dawn)).toBe(true);
    expect(eqField(fieldColorsAt(0.15, 'setting'), PALETTE_FIELDS.dusk)).toBe(true);
  });

  it('produces four colors and stays continuous across a sweep', () => {
    let prev = fieldColorsAt(0, 'rising');
    for (let e = 0; e <= 1.0001; e += 0.01) {
      const cur = fieldColorsAt(e, 'rising');
      expect(cur).toHaveLength(4);
      for (let c = 0; c < 4; c++) {
        for (let ch = 0; ch < 3; ch++) {
          expect(Math.abs(cur[c][ch] - prev[c][ch])).toBeLessThan(0.2); // no snap
        }
      }
      prev = cur;
    }
  });
});

describe('applyFieldWeather', () => {
  const dials = { fogDesaturation: 0.7, fogLift: 0.5, cloudMute: 0.5, stormDarken: 0.45 };
  const base = fieldColorsAt(0.15, 'setting'); // a saturated dusk field

  it('is identity with no weather', () => {
    const out = applyFieldWeather(base, { fog: 0, cloud: 0, storm: 0 }, dials);
    expect(out.every((c, i) => eqColor(c, base[i]))).toBe(true);
  });

  it('fog desaturates AND lightens the field toward gray', () => {
    const out = applyFieldWeather(base, { fog: 1, cloud: 0, storm: 0 }, dials);
    const sat = (c: number[]) => Math.max(...c) - Math.min(...c);
    const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    // The most saturated base color loses saturation and gains lightness.
    const i = base.map(sat).indexOf(Math.max(...base.map(sat)));
    expect(sat(out[i])).toBeLessThan(sat(base[i]));
    expect(lum(out[i])).toBeGreaterThan(lum(base[i]));
  });

  it('storm darkens the field', () => {
    const out = applyFieldWeather(base, { fog: 0, cloud: 0, storm: 1 }, dials);
    const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    expect(lum(out[0])).toBeLessThan(lum(base[0]));
  });

  it('keeps every channel within 0..1', () => {
    const out = applyFieldWeather(base, { fog: 1, cloud: 1, storm: 1 }, dials);
    for (const c of out) for (const ch of c) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });
});
