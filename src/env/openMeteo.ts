/**
 * Open-Meteo fetch + parse, and the {@link computeEnvState} derivation.
 *
 * Open-Meteo is free, keyless, and no-auth (CC BY 4.0 — see {@link ATTRIBUTION}).
 * One request gives current weather + today's (and neighbouring days') sunrise/
 * sunset. We split the result into an {@link EnvBase} (the slowly-changing
 * weather + sun windows, refetched ~every 15 min) and derive a fresh
 * {@link EnvState} from it against the live clock every minute — the sun moves
 * continuously, the weather does not need frequent polling.
 */
import type { EnvState, GeoLocation } from './types';
import { classifyWeather } from './wmo';
import { clamp01, dayPhaseAt, estimateSunDays, isDaytime, sunElevation } from './sun';
import { moonPhase } from './moon';
import type { SunDay } from './sun';

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Windspeed (km/h) treated as the top of the normalized 0..1 range. */
const WIND_MAX_KMH = 60;

/** Slowly-changing inputs: refetched periodically, not recomputed per minute. */
export interface EnvBase {
  condition: EnvState['condition'];
  cloudiness: number;
  precipitation: number;
  windSpeed: number;
  rawWeatherCode: number;
  /** API `is_day` when live; null in the clock-only fallback (use the sun model). */
  isDayApi: boolean | null;
  /** Sunrise/sunset windows (absolute ms) bracketing "now". */
  days: SunDay[];
  fetchedAt: number;
}

/** Shape of the slice of the Open-Meteo response we read. */
interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  current_weather?: { windspeed?: number; weathercode?: number; is_day?: number };
  daily?: { sunrise?: string[]; sunset?: string[] };
}

/** The single forecast URL for a location (with one past day so pre-dawn is bracketed). */
export function buildUrl(loc: GeoLocation): string {
  const p = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current_weather: 'true',
    daily: 'sunrise,sunset',
    timezone: loc.timezone,
    past_days: '1',
  });
  return `${OPEN_METEO_URL}?${p.toString()}`;
}

/**
 * Convert a naive local ISO timestamp (e.g. "2026-06-13T05:47", in the
 * requested timezone) plus the response's UTC offset into an absolute epoch ms,
 * so comparisons against `Date.now()` are correct regardless of the browser's
 * own timezone.
 */
function localIsoToUtcMs(iso: string, offsetSeconds: number): number {
  return Date.parse(`${iso}Z`) - offsetSeconds * 1000;
}

/** Parse a raw Open-Meteo response into an {@link EnvBase}. */
export function parseEnvBase(json: OpenMeteoResponse, fetchedAt: number): EnvBase {
  const cw = json.current_weather ?? {};
  const code = cw.weathercode ?? 0;
  const klass = classifyWeather(code);
  const offset = json.utc_offset_seconds ?? 0;

  const sunrises = json.daily?.sunrise ?? [];
  const sunsets = json.daily?.sunset ?? [];
  const days: SunDay[] = sunrises.map((sr, i) => ({
    sunrise: localIsoToUtcMs(sr, offset),
    sunset: localIsoToUtcMs(sunsets[i] ?? sr, offset),
  }));

  return {
    condition: klass.condition,
    cloudiness: klass.cloudiness,
    precipitation: klass.precipitation,
    windSpeed: clamp01((cw.windspeed ?? 0) / WIND_MAX_KMH),
    rawWeatherCode: code,
    isDayApi: cw.is_day === undefined ? null : cw.is_day === 1,
    days,
    fetchedAt,
  };
}

/** Fetch + parse the live environment base for a location. Throws on failure. */
export async function fetchEnvBase(
  loc: GeoLocation,
  fetchedAt: number,
  signal?: AbortSignal,
): Promise<EnvBase> {
  const res = await fetch(buildUrl(loc), { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return parseEnvBase((await res.json()) as OpenMeteoResponse, fetchedAt);
}

/**
 * Clock-only fallback base: a calm 'clear' sky with a sun curve derived from a
 * fixed SF sunrise/sunset estimate. Lets `sunElevation` keep working with no API.
 */
export function fallbackBase(nowMs: number): EnvBase {
  return {
    condition: 'clear',
    cloudiness: 0,
    precipitation: 0,
    windSpeed: 0,
    rawWeatherCode: -1,
    isDayApi: null,
    days: estimateSunDays(nowMs),
    fetchedAt: nowMs,
  };
}

/**
 * Derive the normalized {@link EnvState} from an {@link EnvBase} at a moment in
 * time. The sun fields are recomputed from `nowMs` (continuous), everything
 * else carries through from the last fetch.
 */
export function computeEnvState(base: EnvBase, nowMs: number): EnvState {
  const moon = moonPhase(nowMs);
  return {
    sunElevation: sunElevation(nowMs, base.days),
    isDay: base.isDayApi ?? isDaytime(nowMs, base.days),
    dayPhase: dayPhaseAt(nowMs, base.days),
    condition: base.condition,
    cloudiness: base.cloudiness,
    precipitation: base.precipitation,
    windSpeed: base.windSpeed,
    // Local, from the clock, on the same minute tick as the sun. `base` has
    // nothing to say about it and the API was never asked.
    moonFraction: moon.fraction,
    moonWaxing: moon.waxing,
    rawWeatherCode: base.rawWeatherCode,
    fetchedAt: base.fetchedAt,
  };
}
