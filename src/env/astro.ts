/**
 * The clock, the sky's coordinates, and the sun's real place in them.
 *
 * `sun.ts` never needed any of this: the sun on screen is a curve fitted
 * between the day's sunrise and sunset, not an altitude, and it has no notion
 * of a sidereal clock. The moon does need one — it rises fifty minutes later
 * every day and has no sunrise table to fit a curve between — so the time and
 * frame conversions live here, in one place, rather than inside `moon.ts`
 * where the next thing that needs a real position would copy them from.
 *
 * Everything is Meeus (*Astronomical Algorithms*, 2nd ed.) at LOW PRECISION.
 * UT is used where TT is asked for (ΔT is about 69 s, which moves the moon
 * 0.01°), and nutation and aberration are left out (both well under 0.01°).
 * The bar is a moon that rises within a few minutes of the almanac, and that
 * is two orders of magnitude looser than anything left out here.
 *
 * Angles in and out are DEGREES. Azimuth is measured from north through east,
 * which is the almanac convention: 90 east, 180 south, 270 west.
 */

export const DAY_MS = 86_400_000;
/** JD of the Unix epoch. */
const JD_UNIX = 2440587.5;
/** JD of J2000.0 (2000-01-01 12:00 TT). */
export const J2000 = 2451545.0;

const RAD = Math.PI / 180;
export const sinD = (d: number) => Math.sin(d * RAD);
export const cosD = (d: number) => Math.cos(d * RAD);
const asinD = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) / RAD;
const atan2D = (y: number, x: number) => Math.atan2(y, x) / RAD;

/** Wrap to [0, 360). */
export function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Julian Day for an epoch-ms instant. */
export function julianDay(ms: number): number {
  return ms / DAY_MS + JD_UNIX;
}

/** Julian centuries since J2000.0 — the T every Meeus series is written in. */
export function centuries(ms: number): number {
  return (julianDay(ms) - J2000) / 36525;
}

/** Greenwich mean sidereal time, degrees (Meeus 12.4). */
export function gmst(ms: number): number {
  const jd = julianDay(ms);
  const T = (jd - J2000) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/** Local mean sidereal time, degrees. `lon` is east-positive. */
export function lst(ms: number, lon: number): number {
  return norm360(gmst(ms) + lon);
}

/** Mean obliquity of the ecliptic, degrees (Meeus 22.2, first two terms). */
export function obliquity(T: number): number {
  return 23.439291 - 0.0130042 * T;
}

export interface Equatorial {
  /** Right ascension, degrees. */
  ra: number;
  /** Declination, degrees. */
  dec: number;
}

export interface Horizontal {
  /** Altitude above the horizon, degrees. */
  alt: number;
  /** Azimuth from north through east, degrees in [0, 360). */
  az: number;
}

/** Ecliptic (λ, β) → equatorial (α, δ). Meeus 13.3 / 13.4. */
export function eclipticToEquatorial(lon: number, lat: number, T: number): Equatorial {
  const e = obliquity(T);
  return {
    ra: norm360(atan2D(sinD(lon) * cosD(e) - (sinD(lat) / cosD(lat)) * sinD(e), cosD(lon))),
    dec: asinD(sinD(lat) * cosD(e) + cosD(lat) * sinD(e) * sinD(lon)),
  };
}

/**
 * Equatorial → horizontal, through the local sidereal time. Meeus 13.5 / 13.6,
 * with azimuth turned round to be measured from north rather than south.
 */
export function equatorialToHorizontal(eq: Equatorial, ms: number, lat: number, lon: number): Horizontal {
  const H = lst(ms, lon) - eq.ra; // local hour angle
  const alt = asinD(sinD(lat) * sinD(eq.dec) + cosD(lat) * cosD(eq.dec) * cosD(H));
  const azSouth = atan2D(sinD(H), cosD(H) * sinD(lat) - (sinD(eq.dec) / cosD(eq.dec)) * cosD(lat));
  return { alt, az: norm360(azSouth + 180) };
}

/**
 * Atmospheric refraction for an apparent-ish altitude, degrees (Bennett).
 * It is 0.57° at the horizon, which is the whole reason a body is visible
 * for a couple of minutes it is geometrically below it. Faded to nothing
 * over the two degrees under the horizon rather than evaluated there, where
 * the formula runs away.
 */
export function refraction(alt: number): number {
  const at = (h: number) => 1 / 60 / Math.tan((h + 7.31 / (h + 4.4)) * RAD);
  if (alt >= -1) return at(alt);
  return at(-1) * Math.max(0, (alt + 3) / 2);
}

/** The sun's apparent ecliptic longitude, degrees (Meeus ch. 25, low precision). */
export function sunLongitude(ms: number): number {
  const T = centuries(ms);
  const L0 = 280.46646 + 36000.76983 * T;
  const M = 357.52911 + 35999.05029 * T;
  const C =
    (1.914602 - 0.004817 * T) * sinD(M) + (0.019993 - 0.000101 * T) * sinD(2 * M) + 0.000289 * sinD(3 * M);
  return norm360(L0 + C);
}

/** The sun, geometric, as seen from (lat, lon). ~0.01°. */
export function sunPosition(ms: number, lat: number, lon: number): Horizontal {
  const eq = eclipticToEquatorial(sunLongitude(ms), 0, centuries(ms));
  return equatorialToHorizontal(eq, ms, lat, lon);
}

/**
 * Every instant in [from, to) at which `f` changes sign, found by stepping
 * `stepMs` and bisecting each bracket to a second. `f` is anything smooth
 * over a step — an altitude minus the altitude an event is defined at.
 */
export function crossings(
  f: (ms: number) => number,
  from: number,
  to: number,
  stepMs = 10 * 60_000,
): { at: number; rising: boolean }[] {
  const out: { at: number; rising: boolean }[] = [];
  let t0 = from;
  let f0 = f(t0);
  while (t0 < to) {
    const t1 = Math.min(t0 + stepMs, to);
    const f1 = f(t1);
    if ((f0 < 0) !== (f1 < 0)) {
      let a = t0;
      let b = t1;
      let fa = f0;
      while (b - a > 1000) {
        const m = (a + b) / 2;
        const fm = f(m);
        if ((fa < 0) === (fm < 0)) {
          a = m;
          fa = fm;
        } else {
          b = m;
        }
      }
      out.push({ at: (a + b) / 2, rising: f0 < 0 });
    }
    t0 = t1;
    f0 = f1;
  }
  return out;
}
