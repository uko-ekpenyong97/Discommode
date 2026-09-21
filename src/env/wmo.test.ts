import { describe, expect, it } from 'vitest';
import { classifyWeather, WMO_TABLE } from './wmo';
import type { Condition } from './types';

/**
 * WMO weathercode → condition mapping. A table of sample codes drawn from each
 * range, including the SF-relevant fog codes (45/48), so a regression in the
 * mapping is caught without a renderer.
 *
 * The snow codes are in here as RAIN. The sky has six conditions and none of
 * them is snow — see `docs/sky.md` — so the codes are mapped to the nearest
 * thing it can draw rather than left to fall through to 'clear'. A freak
 * reading must never produce a sky the renderer has no state for.
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
  { code: 71, condition: 'rain' }, // slight snow → rain
  { code: 73, condition: 'rain' }, // moderate snow → rain
  { code: 75, condition: 'rain' }, // heavy snow → rain
  { code: 77, condition: 'rain' }, // snow grains → rain
  { code: 80, condition: 'rain' }, // rain showers
  { code: 85, condition: 'rain' }, // slight snow showers → rain
  { code: 86, condition: 'rain' }, // heavy snow showers → rain
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

  it('never produces a condition the sky cannot draw', () => {
    const DRAWN: Condition[] = ['clear', 'partly', 'cloudy', 'fog', 'rain', 'storm'];
    for (const klass of Object.values(WMO_TABLE)) {
      expect(DRAWN).toContain(klass.condition);
    }
    // Every code in the WMO 4677 range, not just the ones in the table.
    for (let code = 0; code <= 99; code++) {
      expect(DRAWN).toContain(classifyWeather(code).condition);
    }
  });

  it('draws the snow codes as rain — this sky is San Francisco’s', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      const klass = classifyWeather(code);
      expect(klass.condition).toBe('rain');
      expect(klass.precipitation).toBeGreaterThan(0);
    }
  });

  it('reports precipitation only for wet conditions', () => {
    expect(classifyWeather(0).precipitation).toBe(0); // clear → dry
    expect(classifyWeather(45).precipitation).toBe(0); // fog → dry
    expect(classifyWeather(65).precipitation).toBeGreaterThan(0); // heavy rain → wet
    expect(classifyWeather(95).precipitation).toBeGreaterThan(0); // storm → wet
  });
});
