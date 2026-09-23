/**
 * Environment data layer — public surface. The future sky renderer imports the
 * EnvState contract + the {@link useEnvState} hook from here.
 */
export type { Condition, DayPhase, EnvState, EnvStatus, GeoLocation } from './types';
export { ATTRIBUTION, DEFAULT_LOCATION } from './types';
export {
  useEnvState,
  setEnvOverride,
  getEnvOverride,
  setMoonForce,
  getMoonForce,
  withForcedMoon,
  FORCE_UP,
} from './useEnvState';
export type { EnvSnapshot, MoonForce } from './useEnvState';
export { classifyWeather, WMO_TABLE } from './wmo';
export {
  brightLimbAngle,
  moonAge,
  moonPhase,
  moonPosition,
  moonRiseSet,
  moonSky,
  NEW_MOON_EPOCH,
  SYNODIC_MONTH,
} from './moon';
export type { MoonPhase, MoonSky, PhaseName, RiseSet } from './moon';
export { sunPosition } from './astro';
export type { WeatherClass } from './wmo';
