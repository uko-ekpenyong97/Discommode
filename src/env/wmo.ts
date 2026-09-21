/**
 * WMO weathercode → sky condition mapping.
 *
 * Open-Meteo reports a single WMO 4677 "present weather" code per observation.
 * `current_weather` gives no cloud-cover % or precip amount, so this one table
 * is also where `cloudiness` and `precipitation` *hints* come from — values
 * chosen to read well visually, not as meteorological measurements.
 *
 * Code ranges (documented per group below):
 *   0          clear sky
 *   1–3        mainly clear → partly cloudy → overcast
 *   45, 48     fog / depositing rime fog        (first-class for SF)
 *   51–57      drizzle (incl. freezing)         → 'rain'
 *   61–67      rain (incl. freezing)            → 'rain'
 *   71–77      snow fall / snow grains          → 'rain'  (see below)
 *   80–82      rain showers                     → 'rain'
 *   85, 86     snow showers                     → 'rain'  (see below)
 *   95–99      thunderstorm (incl. hail)        → 'storm'
 *
 * THE SNOW CODES MAP TO RAIN, deliberately. The sky draws six conditions and
 * none of them is snow (`docs/sky.md`): this is San Francisco, where it has
 * snowed three times in a century. The codes still have to GO somewhere —
 * Open-Meteo will report what it reports, and a reading the renderer has no
 * state for is a blank sky. Falling wet is the nearest thing the sky can draw,
 * so a freak 73 is a heavy grey day with rain in it rather than a bug.
 *
 * Anything not listed falls back to a calm 'clear' (see {@link classifyWeather}).
 */
import type { Condition } from './types';

export interface WeatherClass {
  condition: Condition;
  /** Cloud cover hint, 0..1. */
  cloudiness: number;
  /** Precipitation intensity hint, 0..1 (0 if none). */
  precipitation: number;
}

/** Exact-code lookup. Comments give the WMO description for each entry. */
export const WMO_TABLE: Record<number, WeatherClass> = {
  // 0–3 — clear → overcast (no precipitation).
  0: { condition: 'clear', cloudiness: 0, precipitation: 0 }, // clear sky
  1: { condition: 'clear', cloudiness: 0.15, precipitation: 0 }, // mainly clear
  2: { condition: 'partly', cloudiness: 0.5, precipitation: 0 }, // partly cloudy
  3: { condition: 'cloudy', cloudiness: 1, precipitation: 0 }, // overcast

  // 45 / 48 — fog. First-class state for San Francisco.
  45: { condition: 'fog', cloudiness: 0.9, precipitation: 0 }, // fog
  48: { condition: 'fog', cloudiness: 0.9, precipitation: 0 }, // depositing rime fog

  // 51–57 — drizzle (light → dense, incl. freezing). Light precip, heavy cloud.
  51: { condition: 'rain', cloudiness: 0.8, precipitation: 0.2 }, // light drizzle
  53: { condition: 'rain', cloudiness: 0.85, precipitation: 0.35 }, // moderate drizzle
  55: { condition: 'rain', cloudiness: 0.9, precipitation: 0.5 }, // dense drizzle
  56: { condition: 'rain', cloudiness: 0.85, precipitation: 0.3 }, // light freezing drizzle
  57: { condition: 'rain', cloudiness: 0.9, precipitation: 0.5 }, // dense freezing drizzle

  // 61–67 — rain (slight → heavy, incl. freezing).
  61: { condition: 'rain', cloudiness: 0.85, precipitation: 0.4 }, // slight rain
  63: { condition: 'rain', cloudiness: 0.9, precipitation: 0.6 }, // moderate rain
  65: { condition: 'rain', cloudiness: 1, precipitation: 0.85 }, // heavy rain
  66: { condition: 'rain', cloudiness: 0.9, precipitation: 0.5 }, // light freezing rain
  67: { condition: 'rain', cloudiness: 1, precipitation: 0.8 }, // heavy freezing rain

  // 71–77 — snow fall / snow grains. Drawn as rain; see the note above.
  71: { condition: 'rain', cloudiness: 0.85, precipitation: 0.3 }, // slight snow
  73: { condition: 'rain', cloudiness: 0.9, precipitation: 0.55 }, // moderate snow
  75: { condition: 'rain', cloudiness: 1, precipitation: 0.85 }, // heavy snow
  77: { condition: 'rain', cloudiness: 0.8, precipitation: 0.3 }, // snow grains

  // 80–82 — rain showers (slight → violent).
  80: { condition: 'rain', cloudiness: 0.75, precipitation: 0.4 }, // slight rain showers
  81: { condition: 'rain', cloudiness: 0.85, precipitation: 0.6 }, // moderate rain showers
  82: { condition: 'rain', cloudiness: 1, precipitation: 0.9 }, // violent rain showers

  // 85 / 86 — snow showers. Drawn as rain; see the note above.
  85: { condition: 'rain', cloudiness: 0.85, precipitation: 0.4 }, // slight snow showers
  86: { condition: 'rain', cloudiness: 1, precipitation: 0.75 }, // heavy snow showers

  // 95–99 — thunderstorm (slight/moderate, with hail).
  95: { condition: 'storm', cloudiness: 1, precipitation: 0.7 }, // thunderstorm
  96: { condition: 'storm', cloudiness: 1, precipitation: 0.85 }, // thunderstorm w/ slight hail
  99: { condition: 'storm', cloudiness: 1, precipitation: 1 }, // thunderstorm w/ heavy hail
};

/** Calm default for any unrecognized / missing code. */
const DEFAULT_CLASS: WeatherClass = { condition: 'clear', cloudiness: 0, precipitation: 0 };

/**
 * Classify a WMO weathercode into a {@link WeatherClass}. Unknown codes fall
 * back to a calm 'clear' so the data layer never produces an invalid condition.
 */
export function classifyWeather(code: number): WeatherClass {
  return WMO_TABLE[code] ?? DEFAULT_CLASS;
}
