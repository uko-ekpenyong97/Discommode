import { describe, expect, it } from 'vitest';
import {
  INNER_LEAF_EASE,
  JUMP,
  LAST_LEAF_MIN_MS,
  RIFFLE_CURVES,
  cubicBezier,
  inverseOf,
  planRiffle,
  riffleMs,
} from './jump';
import type { JumpSettings, RiffleLeaf } from './jump';

const end = (l: RiffleLeaf) => l.start + l.duration;
/** Most leaves in the air at any moment — checked at every lift. */
const maxInAir = (p: RiffleLeaf[]) =>
  Math.max(...p.map((a) => p.filter((b) => b.start <= a.start + 1e-6 && end(b) > a.start + 1e-6).length));

describe('riffle settings', () => {
  it('ship as specified', () => {
    expect(JUMP).toEqual({
      riffleMsPer20: 4000,
      riffleMinMs: 900,
      riffleOverlap: 0.45,
      riffleMaxInAir: 3,
      riffleCurve: 'easeInOutCubic',
      riffleHalfResBelowMs: 150,
      mode: 'riffle',
    });
    expect(RIFFLE_CURVES.easeInOutCubic).toEqual([0.65, 0, 0.35, 1]);
  });
});

describe('riffleMs', () => {
  it('is 4000ms for twenty spreads, sub-linear either side, floored at 900', () => {
    expect(riffleMs(20, JUMP)).toBeCloseTo(4000, 6);
    expect(riffleMs(10, JUMP)).toBeCloseTo(4000 * 0.5 ** 0.7, 6);
    expect(riffleMs(40, JUMP)).toBeCloseTo(4000 * 2 ** 0.7, 6);
    expect(riffleMs(2, JUMP)).toBe(900);
    expect(riffleMs(0, JUMP)).toBe(0);
  });
});

describe('planRiffle', () => {
  it('turns every spread crossed, adjacent pairs, in either direction', () => {
    const down = planRiffle(20, 0, JUMP);
    expect(down).toHaveLength(20);
    expect(down.map((l) => [l.from, l.to])).toEqual(Array.from({ length: 20 }, (_, k) => [20 - k, 19 - k]));
    const up = planRiffle(0, 21, JUMP);
    expect(up).toHaveLength(21);
    expect(up.at(-1)).toMatchObject({ from: 20, to: 21, last: true });
  });

  it('ends at the run length, with the last leaf landing last', () => {
    for (const n of [1, 2, 3, 5, 12, 20, 21]) {
      const p = planRiffle(0, n, JUMP);
      expect(end(p.at(-1)!)).toBeCloseTo(riffleMs(n, JUMP), 6);
      for (const l of p) expect(end(l)).toBeLessThanOrEqual(end(p.at(-1)!) + 1e-6);
    }
  });

  it('lands in lift order and never has more than riffleMaxInAir up', () => {
    for (const s of [JUMP, { ...JUMP, riffleMaxInAir: 2 }, { ...JUMP, riffleOverlap: 0.8 }, { ...JUMP, riffleCurve: 'easeInOutQuint' as const }]) {
      for (const n of [2, 5, 20, 21]) {
        const p = planRiffle(0, n, s);
        for (let k = 1; k < p.length; k++) {
          expect(p[k].start).toBeGreaterThan(p[k - 1].start);
          expect(end(p[k])).toBeGreaterThan(end(p[k - 1]));
        }
        expect(maxInAir(p)).toBeLessThanOrEqual(s.riffleMaxInAir);
      }
    }
  });

  it('lifts each leaf no earlier than its predecessor has passed the overlap', () => {
    const inner = cubicBezier(INNER_LEAF_EASE);
    const p = planRiffle(20, 0, JUMP);
    for (let k = 1; k < p.length; k++) {
      const prev = p[k - 1];
      const travelled = inner(Math.min(1, (p[k].start - prev.start) / prev.duration));
      expect(travelled).toBeGreaterThanOrEqual(JUMP.riffleOverlap - 1e-6);
    }
  });

  it('accelerates out of the first leaf and decelerates into the last', () => {
    const p = planRiffle(20, 0, JUMP);
    const gaps = p.slice(1).map((l, k) => l.start - p[k].start);
    const mid = gaps.indexOf(Math.min(...gaps));
    expect(mid).toBeGreaterThan(3);
    expect(mid).toBeLessThan(gaps.length - 4);
    for (let k = 1; k <= mid; k++) expect(gaps[k]).toBeLessThanOrEqual(gaps[k - 1] + 1e-6);
    for (let k = mid + 1; k < gaps.length; k++) expect(gaps[k]).toBeGreaterThanOrEqual(gaps[k - 1] - 1e-6);
  });

  it('gives the last leaf at least 320ms, and a one-spread jump the whole run', () => {
    for (const n of [2, 5, 20]) expect(planRiffle(0, n, JUMP).at(-1)!.duration).toBeGreaterThanOrEqual(LAST_LEAF_MIN_MS);
    expect(planRiffle(1, 0, JUMP)).toEqual([{ from: 1, to: 0, start: 0, duration: 900, last: true }]);
  });

  it('leaves only the fast middle under the half-res threshold on 20→0', () => {
    const slow = planRiffle(20, 0, JUMP).map((l, k) => [k, l.duration] as const).filter(([, d]) => d >= JUMP.riffleHalfResBelowMs);
    expect(slow.map(([k]) => k)).toEqual([0, 1, 2, 3, 4, 14, 15, 16, 17, 18, 19]);
  });

  it('is empty for a jump to where the book already is', () => {
    expect(planRiffle(4, 4, JUMP)).toEqual([]);
  });

  it('follows the curve dial', () => {
    const lift = (s: JumpSettings) => planRiffle(20, 0, s).map((l) => l.start);
    const linear = lift({ ...JUMP, riffleCurve: 'linear' });
    const gaps = linear.slice(1).map((t, k) => t - linear[k]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 3);
    expect(lift({ ...JUMP, riffleCurve: 'easeInOutQuint' })[1]).toBeGreaterThan(lift(JUMP)[1]);
  });
});

describe('cubicBezier / inverseOf', () => {
  it('invert each other', () => {
    const f = cubicBezier([0.65, 0, 0.35, 1]);
    const g = inverseOf(f);
    for (const y of [0.1, 0.25, 0.5, 0.9]) expect(f(g(y))).toBeCloseTo(y, 6);
    expect(f(0.5)).toBeCloseTo(0.5, 6);
  });
});
