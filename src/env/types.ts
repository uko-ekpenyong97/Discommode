/**
 * Environment data layer — the typed contract a future sky renderer consumes.
 *
 * This phase is DATA ONLY: it determines San Francisco's current sky state
 * (day/night + weather) from real data (Open-Meteo) and exposes it as a
 * normalized, typed {@link EnvState}. No shader, no visual change yet — the
 * renderer is a later phase. See {@link useEnvState} for the live hook.
 */

/** Required Open-Meteo attribution, shown wherever the data surfaces later. */
export const ATTRIBUTION = 'Weather data by Open-Meteo, CC BY 4.0';

/**
 * Sky condition, mapped from the WMO weathercode (see `wmo.ts`). Fog is a
 * first-class state — this is San Francisco.
 */
export type Condition =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'storm';

/** Data-source health, surfaced so the UI can show live-vs-fallback. */
export type EnvStatus = 'loading' | 'live' | 'fallback';

/**
 * Whether the sun is on its way up (before solar noon) or down (after). Resolves
 * the dawn-vs-dusk ambiguity that a single symmetric `sunElevation` can't: low
 * sun + rising = dawn, low sun + setting = dusk.
 */
export type DayPhase = 'rising' | 'setting';

/**
 * A geographic point + its IANA timezone. Coordinates are an *input* to the
 * data layer (never baked into logic) so we can later swap in user geolocation.
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
}

/** San Francisco — the default location for now. */
export const DEFAULT_LOCATION: GeoLocation = {
  latitude: 37.7749,
  longitude: -122.4194,
  timezone: 'America/Los_Angeles',
};

/**
 * The single contract the future renderer depends on. Every field is
 * normalized and continuous where possible, so a renderer can animate
 * dawn → day → dusk → night smoothly from `sunElevation` alone.
 */
export interface EnvState {
  /**
   * 0 = deep night, 1 = high noon. A smooth, continuous curve derived from the
   * local clock relative to today's sunrise/sunset (with a twilight band a bit
   * before/after) — NOT just `is_day`. See `sun.ts` for the model.
   */
  sunElevation: number;
  /** True while the sun is above the horizon (API `is_day`, or sun-model fallback). */
  isDay: boolean;
  /** Sun rising (pre-solar-noon) or setting (post) — distinguishes dawn from dusk. */
  dayPhase: DayPhase;
  /** Sky condition mapped from the WMO weathercode. */
  condition: Condition;
  /** Cloud cover, 0..1 (from the WMO mapping). */
  cloudiness: number;
  /** Precipitation intensity, 0..1 (0 if none; from the WMO mapping). */
  precipitation: number;
  /** Wind speed normalized to 0..1 from the reported windspeed. */
  windSpeed: number;
  /** The original WMO weathercode, kept for debugging (-1 in clock-only fallback). */
  rawWeatherCode: number;
  /** When the underlying weather was fetched (ms epoch). */
  fetchedAt: number;
}
