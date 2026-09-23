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
import type { Condition, DayPhase, EnvState } from '../env';

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
export const PREVIEW_MOON = { fraction: MOON_PRESETS.full, waxing: true };

export const SUN_PRESET_NAMES = Object.keys(SUN_PRESETS) as SunPreset[];

/** Build a forced {@link EnvState} for the sky preview. */
export function previewEnv(
  sunElevation: number,
  condition: Condition,
  dayPhase: DayPhase,
  windSpeed = 0.35,
  moon: { fraction: number; waxing: boolean } = PREVIEW_MOON,
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
    rawWeatherCode: -1,
    fetchedAt: Date.now(),
  };
}
