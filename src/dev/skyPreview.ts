/**
 * DEV-ONLY sky preview — the six conditions and the four times of day, as an
 * `EnvState` you can force without waiting for the weather.
 *
 * Every state the sky can be in has to be looked at, and San Francisco will not
 * cooperate: a storm is a few days a year and the dusk you want is fifteen
 * minutes long. `setEnvOverride` already existed for exactly this; what was
 * missing was a table of what "rain" or "dusk" actually MEANS as numbers, in
 * one place, so the readout's buttons, the contact-sheet script and the
 * contrast probe's worst case all ask for the same thing.
 *
 * Only `EnvReadout` imports it, and that is behind an `import.meta.env.DEV`
 * dynamic import in `App`, so none of this ships.
 */
import { DEFAULT_LOCATION, FORCE_UP, sunPosition, withForcedMoon } from '../env';
import type { Condition, DayPhase, EnvState, GeoLocation } from '../env';
import { computeEnvState } from '../env/openMeteo';
import { crossings, DAY_MS } from '../env/astro';
import type { SunDay } from '../env/sun';
import { envToTarget } from '../sky/envToTarget';
import type { SkyTarget } from '../sky/skyEngine';

/** The six conditions the sky draws, in WMO-ish order. */
export const CONDITIONS: Condition[] = ['clear', 'partly', 'cloudy', 'fog', 'rain', 'storm'];

/**
 * Cloud + precip per condition. These are the WMO table's own figures for the
 * representative code of each group (0, 2, 3, 45, 63, 96), so previewing 'rain'
 * shows what a real WMO 63 would show and not a guess.
 */
export const PREVIEW_WEATHER: Record<Condition, { cloudiness: number; precipitation: number }> = {
  clear: { cloudiness: 0, precipitation: 0 },
  partly: { cloudiness: 0.5, precipitation: 0 },
  cloudy: { cloudiness: 1, precipitation: 0 },
  fog: { cloudiness: 0.9, precipitation: 0 },
  rain: { cloudiness: 0.9, precipitation: 0.6 },
  storm: { cloudiness: 1, precipitation: 0.85 },
};

/** The four times of day the contact sheet is shot at. */
export const SUN_PRESETS = {
  night: { sun: 0, phase: 'rising' as DayPhase },
  dawn: { sun: 0.12, phase: 'rising' as DayPhase },
  noon: { sun: 1, phase: 'rising' as DayPhase },
  dusk: { sun: 0.12, phase: 'setting' as DayPhase },
} satisfies Record<string, { sun: number; phase: DayPhase }>;

export type SunPreset = keyof typeof SUN_PRESETS;

/**
 * The five moon shapes, as illuminated fractions. Quarter is exactly a half
 * disc; crescent and gibbous are the midpoints either side of it, which are
 * the two shapes the terminator is hardest to get right on.
 */
export const MOON_PRESETS = {
  new: 0,
  crescent: 0.25,
  quarter: 0.5,
  gibbous: 0.75,
  full: 1,
} satisfies Record<string, number>;

export type MoonPreset = keyof typeof MOON_PRESETS;

export const MOON_PRESET_NAMES = Object.keys(MOON_PRESETS) as MoonPreset[];

/**
 * THE PREVIEW MOON IS ALWAYS FULL unless it is asked otherwise, and it is a
 * fixed number rather than tonight's moon on purpose.
 *
 * Everything downstream of this table has to be reproducible: the contact
 * sheet is committed and reviewed as a diff, and the contrast sweep's
 * twenty-four figures are quoted in the docs. A preview that read the live
 * moon would make all of it a function of the date it was run on — the six
 * night frames would change shape every few days for no change to the code.
 *
 * Full is also the worst case for the letterhead, which is the other reason
 * to pin it there rather than at new.
 */
export const PREVIEW_MOON: PreviewMoon = {
  fraction: MOON_PRESETS.full,
  waxing: true,
  // …and it is where the moon used to be nailed, (0.70, 0.80) of the screen,
  // lit straight from the side the phase says. Expressed as the altitude and
  // azimuth the sky's arc maps there, because that is what a moon is now.
  altitude: 67.19,
  azimuth: 249.23,
};

export interface PreviewMoon {
  fraction: number;
  waxing: boolean;
  /** Apparent altitude, degrees; defaults to {@link PREVIEW_MOON}'s. */
  altitude?: number;
  /** Azimuth, degrees from north through east. */
  azimuth?: number;
}

export const SUN_PRESET_NAMES = Object.keys(SUN_PRESETS) as SunPreset[];

/** Build a forced {@link EnvState} for the sky preview. */
export function previewEnv(
  sunElevation: number,
  condition: Condition,
  dayPhase: DayPhase,
  windSpeed = 0.35,
  moon: PreviewMoon = PREVIEW_MOON,
): EnvState {
  const w = PREVIEW_WEATHER[condition];
  return {
    sunElevation,
    isDay: sunElevation > 0.05,
    dayPhase,
    condition,
    cloudiness: w.cloudiness,
    precipitation: w.precipitation,
    windSpeed,
    moonFraction: moon.fraction,
    moonWaxing: moon.waxing,
    moonAltitude: moon.altitude ?? PREVIEW_MOON.altitude!,
    moonAzimuth: moon.azimuth ?? PREVIEW_MOON.azimuth!,
    // A preview is not an instant, so there is no sun to aim at: the limb is
    // straight to the side the phase says, which is the one orientation the
    // sky had before it knew where anything was.
    moonLimbAngle: moon.waxing ? 0 : Math.PI,
    rawWeatherCode: -1,
    fetchedAt: Date.now(),
  };
}

/* ── the day, every five minutes ─────────────────────────────────────────── */

/** The sweep's step. */
export const SWEEP_STEP_MIN = 5;

/** UTC ms of local midnight on `date` (YYYY-MM-DD) in `timeZone`. */
function zonedMidnight(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  // What the zone's wall clock reads at the guess, and how far that is off.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return guess - (wall - guess);
}

/**
 * Sunrise and sunset for the three days round `ms`, from the sun's real
 * altitude (−0.833°: the upper limb, with refraction) — what Open-Meteo would
 * have sent for that date, without asking it.
 */
export function sunDaysAround(ms: number, loc: GeoLocation = DEFAULT_LOCATION): SunDay[] {
  const events = crossings(
    (t) => sunPosition(t, loc.latitude, loc.longitude).alt + 0.833,
    ms - 2 * DAY_MS,
    ms + 2 * DAY_MS,
  );
  const days: SunDay[] = [];
  for (let i = 0; i < events.length; i++) {
    const rise = events[i];
    const set = events[i + 1];
    if (rise.rising && set && !set.rising) days.push({ sunrise: rise.at, sunset: set.at });
  }
  return days;
}

/**
 * The sky at a real instant — its sun, its moon — under one of the preview
 * table's weathers. What the sweep walks, and what a person wants when they
 * ask to SEE tonight's moon on a clear night whatever SF is doing.
 */
export function envAt(
  ms: number,
  condition: Condition,
  loc: GeoLocation = DEFAULT_LOCATION,
  days: SunDay[] = sunDaysAround(ms, loc),
): EnvState {
  const w = PREVIEW_WEATHER[condition];
  const base = {
    condition,
    cloudiness: w.cloudiness,
    precipitation: w.precipitation,
    windSpeed: 0.35,
    rawWeatherCode: -1,
    isDayApi: null,
    days,
    fetchedAt: ms,
  };
  return computeEnvState(base, ms, loc);
}

export interface SweepState {
  condition: Condition;
  /** Minutes after local midnight. */
  minute: number;
  /** Where the moon is: where it really is at that minute, or FORCE UP. */
  moon: 'real' | 'force';
  dayPhase: DayPhase;
  sun: number;
  target: SkyTarget;
}

/**
 * EVERY STATE THE SKY IS IN OVER ONE DAY: six conditions × every five minutes
 * of `date` in San Francisco × the moon where it really is and at FORCE UP.
 * The sun is the real day's (sunrise and sunset from its real altitude), the
 * moon is the real moon, and the weather is the preview table's — which is
 * what makes it a sweep of the sky and not of one afternoon's forecast.
 */
export function daySweepStates(date: string, loc: GeoLocation = DEFAULT_LOCATION): SweepState[] {
  const midnight = zonedMidnight(date, loc.timezone);
  // Two days either side of noon brackets every minute of the day.
  const days = sunDaysAround(midnight + DAY_MS / 2, loc);
  const out: SweepState[] = [];
  for (const condition of CONDITIONS) {
    for (let minute = 0; minute < 24 * 60; minute += SWEEP_STEP_MIN) {
      const t = midnight + minute * 60_000;
      const env = envAt(t, condition, loc, days);
      for (const moon of ['real', 'force'] as const) {
        const e = moon === 'real' ? env : withForcedMoon(env, FORCE_UP, t, loc);
        out.push({ condition, minute, moon, dayPhase: e.dayPhase, sun: e.sunElevation, target: envToTarget(e) });
      }
    }
  }
  return out;
}
