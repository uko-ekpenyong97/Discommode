/**
 * Sun-elevation model — a smooth 0..1 curve from the local clock.
 *
 * This is a *toy* model (no true astronomical elevation needed), but it is
 * continuous and time-driven so a renderer can animate dawn → day → dusk →
 * night smoothly. The shape, per day window:
 *
 *   sunHeight(t)  — a "sun height" proxy in [-1, 1]:
 *     • +1 at solar noon (midpoint of sunrise→sunset)
 *     •  0 exactly at sunrise and sunset (the horizon)
 *     • -1 at solar midnight (midpoint of sunset→next sunrise)
 *   Day uses a sine hump scaled to that day's *daylight* length; night uses an
 *   inverted sine hump scaled to that night's length — so the asymmetry between
 *   long summer days and short nights is preserved, and the curve stays smooth
 *   and continuous across every sunrise/sunset boundary.
 *
 *   sunElevation(t) maps that height to 0..1 with a twilight band: the horizon
 *   (height 0) reads as a *low* value (dawn/dusk glow), deep below the horizon
 *   bottoms out at 0, and the height climbs to 1 toward noon. So sunrise/sunset
 *   pass through low twilight values rather than snapping between night and day.
 */

/** A single day's sunrise/sunset as absolute epoch ms. */
export interface SunDay {
  sunrise: number;
  sunset: number;
}

/** How far below the horizon (in sun-height units) still carries twilight glow. */
const TWILIGHT_DEPTH = 0.2;

/** Fixed San Francisco estimate (local hours) for the API-less fallback. */
const FALLBACK_SUNRISE_HR = 6.5;
const FALLBACK_SUNSET_HR = 19.5;
const HOUR_MS = 3_600_000;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Sun-height proxy in [-1, 1] for `nowMs`, given an ascending list of day
 * windows that bracket the moment. Returns 0 (the horizon) if `nowMs` falls
 * outside the provided windows — callers should pass yesterday/today/tomorrow
 * so this never happens in practice.
 */
export function sunHeight(nowMs: number, days: SunDay[]): number {
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    // Daytime: sine hump, 0 at the edges, +1 at solar noon.
    if (nowMs >= d.sunrise && nowMs < d.sunset) {
      const f = (nowMs - d.sunrise) / (d.sunset - d.sunrise);
      return Math.sin(Math.PI * f);
    }
    // Nighttime (this sunset → next sunrise): inverted hump, 0 at the edges,
    // -1 at solar midnight.
    const next = days[i + 1];
    if (next && nowMs >= d.sunset && nowMs < next.sunrise) {
      const g = (nowMs - d.sunset) / (next.sunrise - d.sunset);
      return -Math.sin(Math.PI * g);
    }
  }
  return 0;
}

/**
 * A height in [-1, 1] (0 = the horizon, 1 = as high as it gets) to the 0..1
 * elevation scale, twilight band and all. The sky places the SUN on screen by
 * this number, and the moon by the same function of its own altitude, so the
 * two share a horizon and a top of the sky.
 */
export function elevationFromHeight(h: number): number {
  return clamp01((h + TWILIGHT_DEPTH) / (1 + TWILIGHT_DEPTH));
}

/**
 * Continuous sun elevation in [0, 1]: 0 = deep night, 1 = high noon, with a
 * twilight band so sunrise/sunset read as low (not mid) values.
 */
export function sunElevation(nowMs: number, days: SunDay[]): number {
  return elevationFromHeight(sunHeight(nowMs, days));
}

/** True while the sun is above the horizon. */
export function isDaytime(nowMs: number, days: SunDay[]): boolean {
  return sunHeight(nowMs, days) > 0;
}

/**
 * Whether the sun is rising (height increasing) or setting (decreasing) at
 * `nowMs` — i.e. before vs after the nearest solar noon, derived from the
 * fetched sunrise/sunset. Distinguishes dawn (rising) from dusk (setting).
 *
 * Daytime: before the day's solar noon = rising, after = setting.
 * Nighttime: after sunset, before solar midnight = still setting; after solar
 * midnight, heading to sunrise = rising.
 */
export function dayPhaseAt(nowMs: number, days: SunDay[]): 'rising' | 'setting' {
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (nowMs >= d.sunrise && nowMs < d.sunset) {
      const solarNoon = (d.sunrise + d.sunset) / 2;
      return nowMs < solarNoon ? 'rising' : 'setting';
    }
    const next = days[i + 1];
    if (next && nowMs >= d.sunset && nowMs < next.sunrise) {
      const solarMidnight = (d.sunset + next.sunrise) / 2;
      return nowMs < solarMidnight ? 'setting' : 'rising';
    }
  }
  return 'rising';
}

/**
 * Synthesize yesterday/today/tomorrow sun windows from a fixed SF sunrise/sunset
 * estimate using the *local* clock — the offline fallback when the API is
 * unreachable. Three days guarantee `nowMs` is always bracketed (incl. the
 * pre-dawn hours that belong to the previous day's night).
 */
export function estimateSunDays(nowMs: number): SunDay[] {
  const d = new Date(nowMs);
  const days: SunDay[] = [];
  for (let k = -1; k <= 1; k++) {
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, 0, 0, 0, 0).getTime();
    days.push({
      sunrise: midnight + FALLBACK_SUNRISE_HR * HOUR_MS,
      sunset: midnight + FALLBACK_SUNSET_HR * HOUR_MS,
    });
  }
  return days;
}
