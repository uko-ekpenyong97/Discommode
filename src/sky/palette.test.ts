import { describe, expect, it } from 'vitest';
import { PALETTE_HEX, hexToRgb, paletteAt, sunOpacity, sunScreenY } from './palette';

/** The palette blend must be continuous and pin to the band anchors. */
describe('paletteAt', () => {
  it('returns the night palette at elevation 0', () => {
    expect(paletteAt(0).horizon).toEqual(hexToRgb(PALETTE_HEX.night.horizon));
  });

  it('returns the day palette at high elevation', () => {
    expect(paletteAt(1).zenith).toEqual(hexToRgb(PALETTE_HEX.day.zenith));
    expect(paletteAt(0.35).zenith).toEqual(hexToRgb(PALETTE_HEX.day.zenith));
  });

  it('blends dawn→day across 0.15–0.35 (a value strictly between the anchors)', () => {
    const dawn = hexToRgb(PALETTE_HEX.dawn.horizon);
    const day = hexToRgb(PALETTE_HEX.day.horizon);
    const mid = paletteAt(0.25).horizon; // halfway between 0.15 and 0.35
    for (let c = 0; c < 3; c++) {
      const lo = Math.min(dawn[c], day[c]);
      const hi = Math.max(dawn[c], day[c]);
      expect(mid[c]).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(mid[c]).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('is continuous (no jumps) when swept across the whole range', () => {
    let prev = paletteAt(0).horizon;
    for (let e = 0; e <= 1.0001; e += 0.01) {
      const cur = paletteAt(e).horizon;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(cur[c] - prev[c])).toBeLessThan(0.1); // small step → no snap
      }
      prev = cur;
    }
  });

  it('keeps every channel within 0..1', () => {
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const p = paletteAt(e);
      for (const rgb of [p.horizon, p.zenith, p.sun]) {
        for (const ch of rgb) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('sun disc', () => {
  it('rises with elevation and is gone at night', () => {
    expect(sunScreenY(1)).toBeGreaterThan(sunScreenY(0.2));
    expect(sunOpacity(0)).toBe(0); // no sun in deep night
    expect(sunOpacity(1)).toBeCloseTo(1, 5); // full sun at noon
  });
});
