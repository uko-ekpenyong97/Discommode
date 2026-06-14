import { describe, expect, it } from 'vitest';
import { isDaytime, sunElevation, sunHeight } from './sun';
import type { SunDay } from './sun';

/**
 * Sun-elevation model. A fixed day window (06:00 → 20:00 of an arbitrary day,
 * with the neighbouring days so nights are bracketed) lets us assert the curve
 * shape deterministically — no clock, no network.
 */
const DAY = 24 * 3_600_000;
const H = 3_600_000;
// Day k: sunrise 06:00, sunset 20:00 (epoch ms, arbitrary base).
const base = 1_700_000_000_000; // some midnight-ish anchor; only deltas matter
const day = (k: number): SunDay => ({
  sunrise: base + k * DAY + 6 * H,
  sunset: base + k * DAY + 20 * H,
});
const DAYS: SunDay[] = [day(-1), day(0), day(1)];

const noon = base + 13 * H; // solar noon = midpoint of 06:00→20:00
const sunrise = base + 6 * H;
const sunset = base + 20 * H;
const deepNight = base + 1 * H; // ~1am of day 0 (mid-night between day -1 and 0)

describe('sunHeight', () => {
  it('peaks at +1 at solar noon and bottoms near -1 at solar midnight', () => {
    expect(sunHeight(noon, DAYS)).toBeCloseTo(1, 5);
    // Solar midnight of the night before day 0 = midpoint of day(-1).sunset→day(0).sunrise.
    const midnight = (day(-1).sunset + day(0).sunrise) / 2;
    expect(sunHeight(midnight, DAYS)).toBeCloseTo(-1, 5);
  });

  it('is exactly 0 at sunrise and sunset (the horizon)', () => {
    expect(sunHeight(sunrise, DAYS)).toBeCloseTo(0, 5);
    expect(sunHeight(sunset, DAYS)).toBeCloseTo(0, 5);
  });
});

describe('sunElevation', () => {
  it('is 1 at noon and 0 in deep night', () => {
    expect(sunElevation(noon, DAYS)).toBeCloseTo(1, 5);
    expect(sunElevation(deepNight, DAYS)).toBe(0);
  });

  it('passes through low (twilight) values at sunrise/sunset, not mid', () => {
    const dawn = sunElevation(sunrise, DAYS);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(0.25); // low, not a mid 0.5
  });

  it('rises monotonically from sunrise toward noon (continuous, time-driven)', () => {
    let prev = -1;
    for (let t = sunrise; t <= noon; t += 30 * 60_000) {
      const e = sunElevation(t, DAYS);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
    expect(prev).toBeCloseTo(1, 5);
  });

  it('stays within 0..1 across a full day', () => {
    for (let t = base; t < base + DAY; t += 15 * 60_000) {
      const e = sunElevation(t, DAYS);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe('isDaytime', () => {
  it('is true between sunrise and sunset, false at night', () => {
    expect(isDaytime(noon, DAYS)).toBe(true);
    expect(isDaytime(deepNight, DAYS)).toBe(false);
  });
});
