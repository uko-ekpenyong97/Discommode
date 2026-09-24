/**
 * The moon — its shape and its place, from one geometry.
 *
 * The sky draws the moon with a terminator, so it needs to know what shape the
 * moon is tonight: how much of the disc is lit, and on which side. Both fall
 * out of one angle, the moon's ELONGATION from the sun, and since the sun and
 * the moon are both computed here from their real positions, that angle is
 * measured rather than averaged:
 *
 *     Δλ = λ(moon) − λ(sun)            ecliptic longitudes, 0..360°
 *     cos ψ = cos β · cos Δλ           ψ the true elongation (β the moon's latitude)
 *     fraction = (1 − cos ψ) / 2       0 at new, 1 at full
 *     waxing = Δλ < 180°               east of the sun: lit on its west side
 *
 * Strictly the fraction is (1 + cos i) / 2 with i the phase angle at the MOON,
 * which differs from 180° − ψ by the sun's parallax over the Earth–Moon
 * distance: at most 0.15°, or 0.001 of fraction. That is left out.
 *
 * WHAT THIS REPLACED. The phase used to be a MEAN synodic month counted from a
 * known new moon — ±0.6 days off the almanac, because the true interval
 * between new moons swings either side of the mean. On 2026-09-18 it put first
 * quarter 0.74 d late. From the positions it is minutes (see `moon.test.ts`),
 * and the lit fraction, the terminator and the bright limb's direction are now
 * one geometry instead of two models that could disagree.
 *
 * It is deliberately NOT from Open-Meteo. The moon does not need a network
 * round trip: it is a function of the clock, and `useEnvState` already
 * recomputes the sun from the clock once a minute. The moon rides along.
 *
 * WHERE IT IS is the second half of this file — Meeus's lunar series,
 * truncated, through the sidereal clock in `astro.ts` to an altitude and
 * azimuth over San Francisco — and which way its bright limb faces, from
 * where the sun is.
 */
import {
  centuries,
  cosD,
  crossings,
  eclipticToEquatorial,
  equatorialToHorizontal,
  norm360,
  refraction,
  sinD,
  sunLongitude,
  sunPosition,
} from './astro';
import type { Horizontal } from './astro';

/** New moon to new moon, in days, on average. Only used to express the
 *  elongation as an age a person would recognise. */
export const SYNODIC_MONTH = 29.530588853;

/** The eight phases, in the order the month walks them. */
export type PhaseName =
  | 'new'
  | 'waxing crescent'
  | 'first quarter'
  | 'waxing gibbous'
  | 'full'
  | 'waning gibbous'
  | 'last quarter'
  | 'waning crescent';

export interface MoonPhase {
  /** How far east of the sun the moon is, in ecliptic longitude: degrees,
   *  0 new, 90 first quarter, 180 full, 270 last quarter. */
  elongation: number;
  /** The same as days of a mean month, 0 .. SYNODIC_MONTH — how old the moon
   *  LOOKS. Not the time since the last new moon, which the ellipse varies. */
  age: number;
  /** Illuminated fraction of the disc: 0 at new, 1 at full. */
  fraction: number;
  /** True on the way from new to full — the lit limb is the right one. */
  waxing: boolean;
  /** Which of the eight named phases the age falls in. */
  phaseName: PhaseName;
}

/**
 * The eight names, each claiming the eighth of the month CENTRED on its own
 * instant — so "full" is the 45° of elongation centred on 180°, about a day
 * and three quarters either side, and not everything past the gibbous.
 */
const PHASE_NAMES: PhaseName[] = [
  'new',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full',
  'waning gibbous',
  'last quarter',
  'waning crescent',
];

/** The moon's shape at a moment — how much of it is lit, and on which side —
 *  from where it and the sun actually are. See the note at the top. */
export function moonPhase(at: Date | number): MoonPhase {
  const ms = typeof at === 'number' ? at : at.getTime();
  const moon = moonEcliptic(ms);
  const dLon = norm360(moon.lon - sunLongitude(ms));
  return {
    elongation: dLon,
    age: (dLon / 360) * SYNODIC_MONTH,
    fraction: (1 - cosD(moon.lat) * cosD(dLon)) / 2,
    waxing: dLon < 180,
    phaseName: PHASE_NAMES[Math.floor(dLon / 45 + 0.5) % 8],
  };
}

/* ── where it is ─────────────────────────────────────────────────────────── */

/**
 * Meeus tables 47.A and 47.B, truncated to the terms over ~0.002°. Each row
 * is the multiples of D, M, M′, F, then the coefficient in millionths of a
 * degree (and, for 47.A, thousandths of a km of distance). What is left out
 * sums to well under a hundredth of a degree — a second or two of rise time.
 */
// prettier-ignore
const LR: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],   [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],     [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],     [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],     [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],   [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],     [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],          [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],     [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],      [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],       [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],       [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],       [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],       [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],          [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],        [2, -2, 0, 0, 2236, -9884],
];
// prettier-ignore
const B: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602],  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413],  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],   [0, 0, 2, 1, 17198],   [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],   [2, -1, 0, -1, 8216],  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],    [2, 1, 0, -1, -3359],  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],   [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],  [0, 1, 0, 1, -1794],
];

export interface MoonEcliptic {
  /** Geocentric ecliptic longitude, degrees. */
  lon: number;
  /** Geocentric ecliptic latitude, degrees. */
  lat: number;
  /** Earth–Moon distance, km. */
  distance: number;
  /** Equatorial horizontal parallax, degrees (~0.95). */
  parallax: number;
}

/** Where the moon is among the stars, seen from the centre of the Earth. */
export function moonEcliptic(ms: number): MoonEcliptic {
  const T = centuries(ms);
  const T2 = T * T;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2;
  // The sun's anomaly terms shrink with the Earth's eccentricity.
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const eFor = (m: number) => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);

  let sl = 0;
  let sr = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    sl += l * eFor(m) * sinD(arg);
    sr += r * eFor(m) * cosD(arg);
  }
  let sb = 0;
  for (const [d, m, mp, f, b] of B) sb += b * eFor(m) * sinD(d * D + m * M + mp * Mp + f * F);

  // Venus, Jupiter and the flattening of the Earth (Meeus's A1–A3).
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;
  sl += 3958 * sinD(A1) + 1962 * sinD(Lp - F) + 318 * sinD(A2);
  sb += -2235 * sinD(Lp) + 382 * sinD(A3) + 175 * sinD(A1 - F) + 175 * sinD(A1 + F) + 127 * sinD(Lp - Mp) - 115 * sinD(Lp + Mp);

  const distance = 385000.56 + sr / 1000;
  return {
    lon: norm360(Lp + sl / 1e6),
    lat: sb / 1e6,
    distance,
    parallax: Math.asin(6378.14 / distance) * (180 / Math.PI),
  };
}

export interface MoonPosition extends Horizontal {
  /** APPARENT altitude of the centre of the disc, from where you stand:
   *  topocentric (a degree lower than from the Earth's centre, near the
   *  horizon) and lifted by refraction. What the sky draws by. */
  alt: number;
  /** Altitude from the centre of the Earth, degrees — what the almanac's
   *  rise/set arithmetic starts from. */
  geocentricAlt: number;
  /** Horizontal parallax at this instant, degrees. */
  parallax: number;
}

/** The moon over (lat, lon) at an instant. About a hundredth of a degree. */
export function moonPosition(ms: number, lat: number, lon: number): MoonPosition {
  const ecl = moonEcliptic(ms);
  const eq = eclipticToEquatorial(ecl.lon, ecl.lat, centuries(ms));
  const geo = equatorialToHorizontal(eq, ms, lat, lon);
  // Parallax in altitude: the moon is close enough that standing on the
  // surface rather than at the centre drops it by up to a degree.
  const topo = geo.alt - ecl.parallax * cosD(geo.alt);
  return { alt: topo + refraction(topo), az: geo.az, geocentricAlt: geo.alt, parallax: ecl.parallax };
}

export interface RiseSet {
  type: 'rise' | 'set';
  at: number;
}

/**
 * Moonrises and moonsets in [from, to), by the almanac's definition: the
 * UPPER LIMB on the horizon, with refraction. Which is the apparent altitude
 * of the centre at minus one semidiameter (0.2725 × the parallax, ~0.26°).
 */
export function moonRiseSet(from: number, to: number, lat: number, lon: number): RiseSet[] {
  return crossings((t) => {
    const p = moonPosition(t, lat, lon);
    return p.alt + 0.2725 * p.parallax;
  }, from, to).map((c) => ({ type: c.rising ? 'rise' : 'set', at: c.at }));
}

/**
 * THE BRIGHT LIMB, as a direction on screen: radians, 0 pointing RIGHT and
 * π/2 pointing UP, which on this sky's screen is toward the west and toward
 * the zenith. It is the direction, from the moon, of the sun — the great
 * circle between them, taken where it leaves the moon — which is what the lit
 * side of any sphere faces.
 *
 * Right is increasing azimuth because the sky is drawn looking SOUTH (east on
 * the left, where the sun rises; west on the right, where it sets). So a
 * waxing moon in the evening, with the sun set below and to its west, comes
 * out lit on the lower right, which is what it is.
 */
export function brightLimbAngle(moon: Horizontal, sun: Horizontal): number {
  const dA = sun.az - moon.az;
  const right = cosD(sun.alt) * sinD(dA);
  const up = sinD(sun.alt) * cosD(moon.alt) - cosD(sun.alt) * sinD(moon.alt) * cosD(dA);
  return Math.atan2(up, right);
}

/** Everything the sky needs about the moon at an instant, over one place. */
export interface MoonSky extends MoonPhase {
  /** Apparent altitude, degrees. Below 0 the moon is not drawn. */
  altitude: number;
  /** Azimuth from north through east, degrees. */
  azimuth: number;
  /** Which way the bright limb faces on screen — see {@link brightLimbAngle}. */
  limbAngle: number;
}

export function moonSky(ms: number, lat: number, lon: number): MoonSky {
  const pos = moonPosition(ms, lat, lon);
  return {
    ...moonPhase(ms),
    altitude: pos.alt,
    azimuth: pos.az,
    limbAngle: brightLimbAngle(pos, sunPosition(ms, lat, lon)),
  };
}
