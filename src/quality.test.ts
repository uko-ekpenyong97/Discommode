import { describe, expect, it } from 'vitest';
import { Governor, scoreWindow, snapCadence, tierQuery } from './quality';
import type { Tier } from './quality';

/**
 * Adaptive quality's rule (src/quality.ts) on synthetic frame streams: what a
 * visitor's frames look like, cut into the governor's 2 s windows.
 */
interface Frame {
  interval: number;
  busy: number;
}

/** `seconds` of frames at `interval` ms, each `busy` ms of work. */
const stream = (seconds: number, interval: number, busy: number): Frame[] =>
  Array.from({ length: Math.round((seconds * 1000) / interval) }, () => ({ interval, busy }));

/** Feed a stream through a governor in 2 s windows; the tiers it steps to. */
function run(frames: Frame[], from: Tier = 0): { tier: Tier; steps: Tier[] } {
  const gov = new Governor(from);
  const steps: Tier[] = [];
  let t = 0;
  let iv: number[] = [];
  let busy: number[] = [];
  for (const f of frames) {
    iv.push(f.interval);
    busy.push(f.busy);
    t += f.interval;
    if (t >= 2000) {
      const to = gov.feed(scoreWindow(iv, busy));
      if (to !== null) steps.push(to);
      t = 0;
      iv = [];
      busy = [];
    }
  }
  return { tier: gov.tier, steps };
}

describe('scoreWindow', () => {
  it('reads the cadence off the intervals, and the budget is never under 60 Hz', () => {
    expect(scoreWindow(stream(2, 1000 / 120, 2).map((f) => f.interval), [2]).budget).toBeCloseTo(1000 / 60, 6);
    const capped = scoreWindow(stream(2, 1000 / 30, 3).map((f) => f.interval), [3]);
    expect(capped.cadence).toBeCloseTo(1000 / 30, 6);
    expect(capped.budget).toBeCloseTo(1000 / 30, 6);
    expect(capped.dropped).toBe(0);
    expect(capped.slow).toBe(false);
  });

  it('snaps a measured cadence to the nearest refresh', () => {
    expect(snapCadence(16.2)).toBeCloseTo(1000 / 60, 6);
    expect(snapCadence(34.4)).toBeCloseTo(1000 / 30, 6);
    expect(snapCadence(8.1)).toBeCloseTo(1000 / 120, 6);
    expect(snapCadence(11.6)).toBeCloseTo(1000 / 90, 6);
  });
});

describe('Governor', () => {
  it.each([
    ['120 Hz', 1000 / 120],
    ['60 Hz', 1000 / 60],
    ['a 30 fps cap (Energy Saver)', 1000 / 30],
  ])('leaves light work alone at %s', (_, interval) => {
    expect(run(stream(20, interval, 3))).toEqual({ tier: 0, steps: [] });
  });

  it('leaves a capped 30 with a 4× slower CPU alone (busy ≈ 12 ms of 33)', () => {
    expect(run(stream(20, 1000 / 30, 12)).tier).toBe(0);
  });

  it('steps down at a 30 fps cap when the work fills the frame', () => {
    // Five seconds: two whole windows of 33.3 ms frames.
    expect(run(stream(5, 1000 / 30, 28)).steps).toEqual([1]);
  });

  it('takes two slow windows for each step, and one tier at a time', () => {
    expect(run(stream(4, 1000 / 60, 25)).steps).toEqual([1]);
    expect(run(stream(2, 1000 / 60, 25)).steps).toEqual([]);
    expect(run(stream(16, 1000 / 60, 25)).steps).toEqual([1, 2, 3, 4]);
  });

  it('counts dropped frames with light work (GPU-bound) as slow', () => {
    // Every third frame takes two vsyncs: a third of the frames over 1.5 × B.
    const frames: Frame[] = [];
    for (let i = 0; i < 400; i++) frames.push({ interval: i % 3 === 0 ? 33.4 : 16.7, busy: 3 });
    expect(run(frames).steps.length).toBeGreaterThan(0);
  });

  it("does not step for the portfolio's eight 70 ms frames in 14 s", () => {
    const frames = stream(14, 1000 / 60, 3);
    for (let i = 0; i < 8; i++) frames[50 + i * 100] = { interval: 70, busy: 65 };
    expect(run(frames).tier).toBe(0);
  });

  it('never steps for alternating good and bad windows, and never steps up', () => {
    const frames: Frame[] = [];
    for (let w = 0; w < 10; w++) frames.push(...stream(2, 1000 / 60, w % 2 ? 25 : 3));
    expect(run(frames).tier).toBe(0);
    expect(run(stream(20, 1000 / 60, 3), 2).tier).toBe(2);
  });

  it('goes straight to tier 4 when busy p50 is over 100 ms', () => {
    expect(run(stream(4, 400, 380)).steps).toEqual([4]);
  });

  it('ignores a window with too few frames, unless they are severe', () => {
    expect(new Governor().feed(scoreWindow([40, 40, 40], [30, 30, 30]))).toBeNull();
    expect(new Governor().feed(scoreWindow([500, 500], [480, 480]))).toBeNull();
    expect(new Governor().feed(scoreWindow([500, 500, 500], [480, 480, 480]))).toBe(4);
  });
});

describe('tierQuery', () => {
  it('reads ?tier=N from the query or the hash', () => {
    expect(tierQuery('?tier=2', '')).toBe(2);
    expect(tierQuery('', '#item-04?tier=3')).toBe(3);
    expect(tierQuery('?intro&tier=0', '')).toBe(0);
    expect(tierQuery('?tier=auto', '')).toBe('auto');
    expect(tierQuery('?tier=7', '')).toBeNull();
    expect(tierQuery('?stier=2', '')).toBeNull();
    expect(tierQuery('', '')).toBeNull();
  });
});
