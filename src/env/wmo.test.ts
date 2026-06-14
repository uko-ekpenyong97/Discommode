import { describe, expect, it } from 'vitest';
import { classifyWeather } from './wmo';
import type { Condition } from './types';

/**
 * WMO weathercode → condition mapping. A table of sample codes drawn from each
 * range, including the SF-relevant fog codes (45/48), so a regression in the
 * mapping is caught without a renderer.
 */
const CASES: Array<{ code: number; condition: Condition }> = [
  { code: 0, condition: 'clear' }, // clear sky
  { code: 1, condition: 'clear' }, // mainly clear
  { code: 2, condition: 'partly' }, // partly cloudy
  { code: 3, condition: 'cloudy' }, // overcast
  { code: 45, condition: 'fog' }, // fog (SF)
  { code: 48, condition: 'fog' }, // rime fog (SF)
  { code: 51, condition: 'rain' }, // light drizzle
  { code: 55, condition: 'rain' }, // dense drizzle
  { code: 61, condition: 'rain' }, // slight rain
  { code: 65, condition: 'rain' }, // heavy rain
  { code: 71, condition: 'snow' }, // slight snow
  { code: 75, condition: 'snow' }, // heavy snow
  { code: 80, condition: 'rain' }, // rain showers
  { code: 85, condition: 'snow' }, // snow showers
  { code: 95, condition: 'storm' }, // thunderstorm
  { code: 99, condition: 'storm' }, // thunderstorm w/ heavy hail
];

describe('classifyWeather', () => {
  it.each(CASES)('code $code → $condition', ({ code, condition }) => {
    expect(classifyWeather(code).condition).toBe(condition);
  });

  it('falls back to a calm clear sky for unknown codes', () => {
    const klass = classifyWeather(1234);
    expect(klass).toEqual({ condition: 'clear', cloudiness: 0, precipitation: 0 });
  });

  it('keeps cloudiness and precipitation within 0..1', () => {
    for (const { code } of CASES) {
      const { cloudiness, precipitation } = classifyWeather(code);
      expect(cloudiness).toBeGreaterThanOrEqual(0);
      expect(cloudiness).toBeLessThanOrEqual(1);
      expect(precipitation).toBeGreaterThanOrEqual(0);
      expect(precipitation).toBeLessThanOrEqual(1);
    }
  });

  it('reports precipitation only for wet conditions', () => {
    expect(classifyWeather(0).precipitation).toBe(0); // clear → dry
    expect(classifyWeather(45).precipitation).toBe(0); // fog → dry
    expect(classifyWeather(65).precipitation).toBeGreaterThan(0); // heavy rain → wet
    expect(classifyWeather(95).precipitation).toBeGreaterThan(0); // storm → wet
  });
});
