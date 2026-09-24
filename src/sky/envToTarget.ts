/**
 * The EnvState → sky mapping, and the whole of it.
 *
 * Its own file because it is the one place the data layer and the renderer
 * meet, and because everything that wants to ask "what would the sky be in
 * state X" — the layer, the contrast sweep, a test — should ask the same
 * function rather than each build a target of its own.
 */
import type { EnvState } from '../env';
import type { SkyTarget } from './skyEngine';

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Every condition gets its own element and no two share a code path:
 *
 *   cloud  cloudiness, as coverage
 *   fog    the CONDITION, 0 or 1 — not a function of cloudiness
 *   rain   precipitation
 *   storm  the CONDITION, 0 or 1
 *   wind   normalized windspeed
 *   moon   the illuminated fraction, where it is (altitude, azimuth), and
 *          which way its bright limb faces
 *
 * FOG AND OVERCAST ARE DIFFERENT STATES and that is the point of the change.
 * They used to be one: `fog = clamp01((cloudiness - 0.85) / 0.15)`, which gave
 * WMO 3 — plain overcast, the most ordinary sky San Francisco has — the full
 * fog treatment, and left every condition converging on the same grey.
 */
export function envToTarget(env: EnvState): SkyTarget {
  return {
    sun: env.sunElevation,
    dayPhase: env.dayPhase,
    cloud: clamp01(env.cloudiness),
    fog: env.condition === 'fog' ? 1 : 0,
    rain: clamp01(env.precipitation),
    storm: env.condition === 'storm' ? 1 : 0,
    wind: clamp01(env.windSpeed),
    moonFraction: clamp01(env.moonFraction),
    moonAltitude: env.moonAltitude,
    moonAzimuth: env.moonAzimuth,
    moonLimb: env.moonLimbAngle,
  };
}
