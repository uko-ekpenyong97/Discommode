/**
 * Environment data layer — public surface. The future sky renderer imports the
 * EnvState contract + the {@link useEnvState} hook from here.
 */
export type { Condition, EnvState, EnvStatus, GeoLocation } from './types';
export { ATTRIBUTION, DEFAULT_LOCATION } from './types';
export { useEnvState, setEnvOverride, getEnvOverride } from './useEnvState';
export type { EnvSnapshot } from './useEnvState';
export { classifyWeather, WMO_TABLE } from './wmo';
export type { WeatherClass } from './wmo';
