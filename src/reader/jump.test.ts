import { describe, expect, it } from 'vitest';
import { JUMP, RIFFLE_RATIO, planRiffle } from './jump';

const TURN_MS = 850;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
/** The shipped dials. */
const plan = (from: number, to: number) =>
  planRiffle(from, to, JUMP.riffleTotalMs, JUMP.riffleMinLeafMs, TURN_MS);

describe('planRiffle', () => {
  it('ships at 700ms / 60ms', () => {
    expect(JUMP).toEqual({ riffleTotalMs: 700, riffleMinLeafMs: 60, mode: 'riffle' });
  });

  it('is empty for a jump to where the book already is', () => {
    expect(plan(4, 4)).toEqual({ stops: [], durations: [] });
  });

  it('lands in the budget at every distance in the issue, both ways', () => {
    for (let from = 0; from < 22; from++) {
      for (const to of [0, 21]) {
        if (from === to) continue;
        const { stops, durations } = plan(from, to);
        expect(sum(durations)).toBeLessThanOrEqual(700 + 1e-6);
        expect(stops.at(-1)).toBe(to);
        expect(stops).toHaveLength(durations.length);
      }
    }
  });

  it('never draws a leaf under the minimum', () => {
    for (let d = 1; d <= 21; d++) {
      for (const leaf of plan(0, d).durations) expect(leaf).toBeGreaterThanOrEqual(60);
    }
  });

  it('shrinks geometrically going back from the landing, the last leaf longest', () => {
    const { durations } = plan(20, 0);
    for (let k = 1; k < durations.length; k++) {
      expect(durations[k - 1] / durations[k]).toBeCloseTo(RIFFLE_RATIO, 9);
    }
    expect(Math.max(...durations)).toBe(durations.at(-1));
  });

  it('is five leaves from spread 20 to the cover, spending the whole budget', () => {
    const { stops, durations } = plan(20, 0);
    expect(stops).toEqual([4, 3, 2, 1, 0]);
    expect(durations.map(Math.round)).toEqual([61, 87, 124, 177, 252]);
    expect(sum(durations)).toBeCloseTo(700, 6);
  });

  it('turns through every spread when they all fit', () => {
    expect(plan(3, 0).stops).toEqual([2, 1, 0]);
    expect(plan(18, 21).stops).toEqual([19, 20, 21]);
  });

  it('folds the spreads that do not fit into the first leaf', () => {
    // 21 spreads, five leaves: the first carries 17 of them.
    expect(plan(0, 21).stops).toEqual([17, 18, 19, 20, 21]);
  });

  it('never turns a leaf slower than an ordinary turn', () => {
    const one = planRiffle(1, 0, 2000, 60, TURN_MS);
    expect(one.durations).toEqual([TURN_MS]);
    for (const leaf of planRiffle(0, 3, 5000, 60, TURN_MS).durations) {
      expect(leaf).toBeLessThanOrEqual(TURN_MS);
    }
  });

  it('is one leaf of the whole budget when the minimum leaves no room for two', () => {
    expect(planRiffle(10, 0, 700, 400, TURN_MS)).toEqual({ stops: [0], durations: [700] });
  });
});
