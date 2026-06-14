import { describe, expect, it } from 'vitest';
import { buildUrl, computeEnvState, fallbackBase, parseEnvBase } from './openMeteo';
import { DEFAULT_LOCATION } from './types';

/**
 * Parse + derivation contract, using a trimmed real Open-Meteo response as a
 * fixture (SF, PDT) — no network. Also covers the API-less fallback path so the
 * "kill the network" behaviour is verified deterministically: a clock-derived
 * sunElevation, condition 'clear', and no throw.
 */
const FIXTURE = {
  utc_offset_seconds: -25200, // PDT
  current_weather: { windspeed: 23.4, weathercode: 3, is_day: 1 },
  daily: {
    sunrise: ['2026-06-12T05:47', '2026-06-13T05:47', '2026-06-14T05:47'],
    sunset: ['2026-06-12T20:31', '2026-06-13T20:32', '2026-06-14T20:32'],
  },
};
// Helper to read a naive local time as the same absolute ms the parser uses.
const at = (iso: string) => Date.parse(`${iso}Z`) - FIXTURE.utc_offset_seconds * 1000;

describe('buildUrl', () => {
  it('includes the location, current weather, sunrise/sunset and a past day', () => {
    const url = buildUrl(DEFAULT_LOCATION);
    expect(url).toContain('latitude=37.7749');
    expect(url).toContain('longitude=-122.4194');
    expect(url).toContain('current_weather=true');
    expect(url).toContain('daily=sunrise%2Csunset');
    expect(url).toContain('timezone=America%2FLos_Angeles');
    expect(url).toContain('past_days=1');
  });
});

describe('parseEnvBase', () => {
  const base = parseEnvBase(FIXTURE, 1_000);

  it('maps the weathercode and normalizes wind', () => {
    expect(base.condition).toBe('cloudy'); // code 3 → overcast
    expect(base.rawWeatherCode).toBe(3);
    expect(base.windSpeed).toBeCloseTo(23.4 / 60, 5);
    expect(base.isDayApi).toBe(true);
    expect(base.fetchedAt).toBe(1_000);
  });

  it('converts naive local sunrise/sunset to absolute ms via the UTC offset', () => {
    expect(base.days).toHaveLength(3);
    expect(base.days[1].sunrise).toBe(at('2026-06-13T05:47'));
    expect(base.days[1].sunset).toBe(at('2026-06-13T20:32'));
  });

  it('derives a continuous EnvState — deep night, dawn twilight, high noon', () => {
    expect(computeEnvState(base, at('2026-06-13T01:00')).sunElevation).toBe(0);
    const dawn = computeEnvState(base, at('2026-06-13T06:00')).sunElevation;
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(0.25);
    expect(computeEnvState(base, at('2026-06-13T13:09')).sunElevation).toBeCloseTo(1, 2);
  });

  it('prefers the API is_day for the isDay flag', () => {
    // Night by clock, but the API said is_day:1 → trust the API for the flag.
    expect(computeEnvState(base, at('2026-06-13T01:00')).isDay).toBe(true);
  });
});

describe('fallbackBase (API-less)', () => {
  const noon = Date.parse('2026-06-13T12:00:00'); // local noon
  const base = fallbackBase(noon);

  it('is a calm clear sky with a usable sun curve and no crash', () => {
    expect(base.condition).toBe('clear');
    expect(base.precipitation).toBe(0);
    expect(base.rawWeatherCode).toBe(-1); // sentinel: clock-only, no API code
    expect(base.isDayApi).toBeNull();
    const env = computeEnvState(base, noon);
    expect(env.sunElevation).toBeGreaterThan(0.5); // midday-ish, clock-derived
    expect(env.isDay).toBe(true);
    expect(env.condition).toBe('clear');
  });

  it('still bottoms out at night without the API', () => {
    const midnight = Date.parse('2026-06-13T00:00:00');
    expect(computeEnvState(fallbackBase(midnight), midnight).sunElevation).toBe(0);
    expect(computeEnvState(fallbackBase(midnight), midnight).isDay).toBe(false);
  });
});
