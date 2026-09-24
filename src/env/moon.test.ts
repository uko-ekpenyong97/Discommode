import { describe, expect, it } from 'vitest';
import {
  brightLimbAngle,
  moonEcliptic,
  moonPhase,
  moonPosition,
  moonRiseSet,
  moonSky,
  SYNODIC_MONTH,
} from './moon';
import { sunLongitude } from './astro';

/**
 * THE PHASE, against the almanac.
 *
 * The phase is the moon's elongation from the sun, from their real positions,
 * so it is held to the almanac's INSTANTS and not to a day either side of
 * them. The mean-synodic model this replaced was tested to ±0.6 d and missed
 * this lunation's first quarter by 0.74 d; these are minutes.
 *
 * Instants are the US Naval Observatory's (aa.usno.navy.mil, "Phases of the
 * Moon", fetched 2026-09-23), in UTC. The moon gains about half a degree an
 * hour on the sun, so ±0.05° of elongation is ±6 minutes of the almanac.
 */
const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);
const PHASE_TOL_DEG = 0.05;

/** Signed distance of the elongation at `t` from `target`, degrees. */
const offBy = (t: number, target: number) => {
  const d = (moonPhase(t).elongation - target + 540) % 360 - 180;
  return d;
};

describe('moonPhase at the almanac instants (±0.05°, about ±6 min)', () => {
  const instants: [string, string, number][] = [
    ['new', '2026-09-11T03:27:00Z', 0],
    ['first quarter', '2026-09-18T20:44:00Z', 90],
    ['full', '2026-09-26T16:49:00Z', 180],
    ['last quarter', '2026-10-03T13:25:00Z', 270],
    ['new', '2026-10-10T15:50:00Z', 0],
  ];
  for (const [name, iso, target] of instants) {
    it(`${name}, ${iso.replace('T', ' ').slice(0, 16)} UTC`, () => {
      expect(Math.abs(offBy(at(iso), target))).toBeLessThan(PHASE_TOL_DEG);
      expect(moonPhase(at(iso)).phaseName).toBe(name);
    });
  }

  /**
   * THE MISS THE OLD MODEL HAD, as a test that it is gone. The mean month put
   * first quarter at 2026-09-19 05:40 UTC, 0.74 d after midday on the 18th
   * and nine hours after the real one. The elongation crosses 90° at the
   * almanac's minute, not the next morning.
   */
  it('first quarter is on the 18th, not the 19th the mean month said', () => {
    expect(moonPhase(at('2026-09-18T20:34:00Z')).elongation).toBeLessThan(90);
    expect(moonPhase(at('2026-09-18T20:54:00Z')).elongation).toBeGreaterThan(90);
    expect(moonPhase(at('2026-09-19T05:40:00Z')).elongation).toBeGreaterThan(94);
  });

  it('turns from waxing to waning at full, and back at new', () => {
    expect(moonPhase(at('2026-09-26T16:39:00Z')).waxing).toBe(true);
    expect(moonPhase(at('2026-09-26T16:59:00Z')).waxing).toBe(false);
    expect(moonPhase(at('2026-10-10T15:40:00Z')).waxing).toBe(false);
    expect(moonPhase(at('2026-10-10T16:00:00Z')).waxing).toBe(true);
  });
});

/**
 * THE LIT FRACTION, against the USNO's "fraction illuminated" for those dates
 * (the same source, fetched 2026-09-23, asked in UT). Its figure is for NOON
 * of the date in the zone asked for, which is not written on the page: asked
 * in UTC−7 instead, 09-22 comes back 84% (the model: 0.843 at 12:00 PDT,
 * 0.805 at midnight), so noon is where it is compared. It publishes whole
 * percent, so the bar is ±0.01: its rounding, plus the 0.001 the note in
 * `moon.ts` leaves out.
 */
describe('the lit fraction against the almanac (±0.01)', () => {
  const published: [string, number][] = [
    ['2026-09-15', 0.2],
    ['2026-09-18', 0.47],
    ['2026-09-22', 0.82],
    ['2026-09-30', 0.82],
    ['2026-10-06', 0.19],
  ];
  for (const [date, frac] of published) {
    it(`${date}: ${Math.round(frac * 100)}%`, () => {
      expect(Math.abs(moonPhase(at(`${date}T12:00:00Z`)).fraction - frac)).toBeLessThanOrEqual(0.01);
    });
  }
});

describe('moonPhase, whatever day it is', () => {
  it('agrees with itself for the live clock', () => {
    const m = moonPhase(new Date());
    expect(m.elongation).toBeGreaterThanOrEqual(0);
    expect(m.elongation).toBeLessThan(360);
    expect(m.fraction).toBeGreaterThanOrEqual(0);
    expect(m.fraction).toBeLessThanOrEqual(1);
    expect(m.age).toBeCloseTo((m.elongation / 360) * SYNODIC_MONTH, 12);
    expect(m.waxing).toBe(m.elongation < 180);
  });

  it('walks new → full → new across a real month, lit fraction rising then falling', () => {
    const newA = at('2026-09-11T03:27:00Z');
    const full = at('2026-09-26T16:49:00Z');
    const newB = at('2026-10-10T15:50:00Z');
    const walk = (from: number, to: number) =>
      Array.from({ length: 31 }, (_, i) => moonPhase(from + ((to - from) * i) / 30).fraction);
    const up = walk(newA, full);
    const down = walk(full, newB);
    // At new and full the fraction is set by the moon's latitude, which is
    // why it is not exactly 0 or 1: the moon passes a few degrees off the sun.
    expect(up[0]).toBeLessThan(0.005);
    expect(up[30]).toBeGreaterThan(0.995);
    expect(down[30]).toBeLessThan(0.005);
    for (let i = 1; i <= 30; i++) expect(up[i]).toBeGreaterThan(up[i - 1]);
    for (let i = 1; i <= 30; i++) expect(down[i]).toBeLessThan(down[i - 1]);
  });

  it('a quarter is half lit', () => {
    expect(moonPhase(at('2026-09-18T20:44:00Z')).fraction).toBeCloseTo(0.5, 2);
    expect(moonPhase(at('2026-10-03T13:25:00Z')).fraction).toBeCloseTo(0.5, 2);
  });

  it('is one day of month per ~12° of elongation', () => {
    const a = moonPhase(at('2026-09-20T00:00:00Z')).elongation;
    const b = moonPhase(at('2026-09-20T00:00:00Z') + DAY).elongation;
    expect(b - a).toBeGreaterThan(10);
    expect(b - a).toBeLessThan(15);
  });
});

/**
 * WHERE THE MOON IS, against the almanac.
 *
 * The published figures are the US Naval Observatory's (aa.usno.navy.mil,
 * "Rise, Set, and Transit Times" for 37.77 N, 122.42 W, fetched 2026-09-23),
 * written here in UTC. Its definition is the one `moonRiseSet` uses: the
 * upper limb on the horizon, with refraction. The bar is ±10 minutes; the
 * model lands within about two on every one of these.
 */
const SF = { lat: 37.77, lon: -122.42 };
const MIN = 60_000;

describe('moonRiseSet against the USNO almanac for San Francisco (±10 min)', () => {
  const almanac: { date: string; type: 'rise' | 'set'; utc: string; local: string }[] = [
    { date: '2026-09-23', type: 'set', utc: '2026-09-23T10:47:00Z', local: '03:47 PDT' },
    { date: '2026-09-23', type: 'rise', utc: '2026-09-24T00:40:00Z', local: '17:40 PDT' },
    { date: '2026-09-26', type: 'set', utc: '2026-09-26T14:01:00Z', local: '07:01 PDT, the morning of the full moon' },
    { date: '2026-09-26', type: 'rise', utc: '2026-09-27T01:54:00Z', local: '18:54 PDT' },
    { date: '2026-10-03', type: 'set', utc: '2026-10-03T21:56:00Z', local: '14:56 PDT, last quarter' },
    { date: '2026-10-10', type: 'rise', utc: '2026-10-10T14:20:00Z', local: '07:20 PDT, new moon' },
  ];

  for (const a of almanac) {
    it(`${a.type} on ${a.date} at ${a.local}`, () => {
      const t = at(a.utc);
      const found = moonRiseSet(t - 3 * 60 * MIN, t + 3 * 60 * MIN, SF.lat, SF.lon).filter((e) => e.type === a.type);
      expect(found).toHaveLength(1);
      expect(Math.abs(found[0].at - t) / MIN).toBeLessThanOrEqual(10);
    });
  }

  it('is up between a rise and the next set, and down after it', () => {
    const rise = at('2026-09-24T00:40:00Z');
    expect(moonPosition(rise + 60 * MIN, SF.lat, SF.lon).alt).toBeGreaterThan(5);
    expect(moonPosition(at('2026-09-23T10:47:00Z') + 60 * MIN, SF.lat, SF.lon).alt).toBeLessThan(-5);
  });

  it('rises in the east and sets in the west, and culminates in the south', () => {
    expect(moonPosition(at('2026-09-24T00:40:00Z'), SF.lat, SF.lon).az).toBeGreaterThan(60);
    expect(moonPosition(at('2026-09-24T00:40:00Z'), SF.lat, SF.lon).az).toBeLessThan(135);
    expect(moonPosition(at('2026-09-23T10:47:00Z'), SF.lat, SF.lon).az).toBeGreaterThan(225);
    expect(moonPosition(at('2026-09-23T10:47:00Z'), SF.lat, SF.lon).az).toBeLessThan(300);
    // USNO's upper transit that night: 23:11 PDT on the 23rd.
    const transit = moonPosition(at('2026-09-24T06:11:00Z'), SF.lat, SF.lon);
    expect(Math.abs(transit.az - 180)).toBeLessThan(3);
  });
});

/**
 * The published phase INSTANTS, against the raw positions: at full the moon is
 * opposite the sun in ecliptic longitude, at new it is with it. ±0.05° is
 * ±6 minutes of the almanac's instant (it was ±0.25°, ±30 min, before the
 * phase came from these positions); measured, it is within 0.015°.
 */
describe('the moon and the sun at the almanac phase instants', () => {
  const elongation = (iso: string) => {
    const t = at(iso);
    const d = (moonEcliptic(t).lon - sunLongitude(t)) % 360;
    return d < 0 ? d + 360 : d;
  };

  it('full moon, 2026-09-26 16:49 UTC: opposite the sun', () => {
    expect(Math.abs(elongation('2026-09-26T16:49:00Z') - 180)).toBeLessThan(PHASE_TOL_DEG);
  });

  it('new moon, 2026-10-10 15:50 UTC: with the sun', () => {
    const e = elongation('2026-10-10T15:50:00Z');
    expect(Math.min(e, 360 - e)).toBeLessThan(PHASE_TOL_DEG);
  });
});

describe('brightLimbAngle', () => {
  it('faces the sun: sun due west on the horizon lights the right limb', () => {
    const a = brightLimbAngle({ alt: 0, az: 180 }, { alt: 0, az: 270 });
    expect(Math.cos(a)).toBeCloseTo(1, 6);
  });

  it('an evening crescent, with the sun set below and west of it, is lit lower right', () => {
    const a = brightLimbAngle({ alt: 20, az: 240 }, { alt: -10, az: 280 });
    expect(Math.cos(a)).toBeGreaterThan(0);
    expect(Math.sin(a)).toBeLessThan(0);
  });

  it('a pre-dawn crescent, with the sun under it in the east, is lit from below and to the left', () => {
    const a = brightLimbAngle({ alt: 25, az: 100 }, { alt: -12, az: 90 });
    expect(Math.cos(a)).toBeLessThan(0);
    expect(Math.sin(a)).toBeLessThan(-0.8);
  });

  it('agrees with the phase over a real month: waxing is lit on the west side', () => {
    // Every evening at 21:00 PDT the moon is up, from first quarter to full.
    for (let d = 19; d <= 25; d++) {
      const t = at(`2026-09-${d + 1}T04:00:00Z`);
      const sky = moonSky(t, SF.lat, SF.lon);
      if (sky.altitude < 5) continue;
      expect(sky.waxing).toBe(true);
      expect(Math.cos(sky.limbAngle)).toBeGreaterThan(0);
    }
  });
});
