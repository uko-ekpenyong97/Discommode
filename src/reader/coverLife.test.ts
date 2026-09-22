import { describe, expect, it } from 'vitest';
import {
  BOIL_REST,
  Boil,
  BoilSequence,
  COVER_LIFE_DEFAULTS,
  MIN_STEP_OFFSET,
  MIN_STEP_ROT,
  boilFor,
  publishBoil,
  staggerMs,
  subscribeBoil,
} from './coverLife';

const D = COVER_LIFE_DEFAULTS;
const STEP_MS = 1000 / D.boilFps;

describe('BoilSequence', () => {
  it('is the same sequence for the same seed, and a different one for another', () => {
    const a = new BoilSequence(7);
    const b = new BoilSequence(7);
    const c = new BoilSequence(8);
    for (let n = 0; n < 50; n++) expect(a.at(n)).toEqual(b.at(n));
    expect(a.at(3)).not.toEqual(c.at(3));
  });

  it('never repeats a step: consecutive steps differ in offset and in rotation', () => {
    const q = new BoilSequence(0xb011c0);
    for (let n = 1; n < 2000; n++) {
      const p = q.at(n - 1);
      const s = q.at(n);
      expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThanOrEqual(MIN_STEP_OFFSET);
      expect(Math.abs(s.r - p.r)).toBeGreaterThanOrEqual(MIN_STEP_ROT);
      for (const v of [s.x, s.y, s.r]) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Boil', () => {
  it('is exactly nothing at rest', () => {
    const b = new Boil(1);
    expect(b.sample(1000, 1)).toBe(BOIL_REST);
    expect(b.active(1000)).toBe(false);
  });

  it('ramps its amplitude in over boilInMs and out over boilOutMs, linearly', () => {
    const b = new Boil(1);
    b.hover(true, 0);
    expect(b.sample(D.boilInMs / 2, 1).amp).toBeCloseTo(0.5);
    expect(b.sample(D.boilInMs, 1).amp).toBe(1);
    b.hover(false, 1000);
    expect(b.sample(1000 + D.boilOutMs / 2, 1).amp).toBeCloseTo(0.5);
    expect(b.sample(1000 + D.boilOutMs, 1)).toBe(BOIL_REST);
    expect(b.active(1000 + D.boilOutMs)).toBe(false);
  });

  it('holds each step for 1/boilFps — stepped, not eased — within ±boilPx and ±boilDeg', () => {
    const b = new Boil(3);
    b.hover(true, 0);
    const t0 = D.boilInMs + 1; // full amplitude
    const first = b.sample(t0, 1);
    const stepEnd = Math.ceil(t0 / STEP_MS) * STEP_MS;
    // Everywhere inside the step: the same value.
    for (let t = t0; t < stepEnd - 0.5; t += 5) expect(b.sample(t, 1)).toEqual(first);
    const next = b.sample(stepEnd + 0.5, 1);
    expect(next.step).toBe(first.step + 1);
    expect(next.dx !== first.dx || next.dy !== first.dy).toBe(true);
    for (let t = t0; t < 5000; t += 37) {
      const s = b.sample(t, 1);
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(D.boilPx);
      expect(Math.abs(s.dy)).toBeLessThanOrEqual(D.boilPx);
      expect(Math.abs(s.deg)).toBeLessThanOrEqual(D.boilDeg);
    }
  });

  it('scales the offset with the card, not the rotation', () => {
    const a = new Boil(5);
    const b = new Boil(5);
    a.hover(true, 0);
    b.hover(true, 0);
    const s1 = a.sample(400, 1);
    const s2 = b.sample(400, 0.5);
    expect(s2.dx).toBeCloseTo(s1.dx / 2);
    expect(s2.deg).toBe(s1.deg);
  });

  it('continues the sequence on the next hover, so no two boils open alike', () => {
    const b = new Boil(9);
    b.hover(true, 0);
    const last = b.sample(1000, 1).step;
    b.hover(false, 1000);
    b.sample(2000, 1);
    b.hover(true, 3000);
    expect(b.sample(3001, 1).step).toBe(last + 1);
  });

  it('never walks the sequence back when the rate is lowered mid-boil', () => {
    const b = new Boil(2);
    b.hover(true, 0);
    const at = b.sample(2000, 1).step;
    expect(b.sample(2001, 1, { ...D, boilFps: 1 }).step).toBe(at);
  });

  it('a hold pins the step and the amplitude', () => {
    const b = new Boil(4);
    const s = b.sample(10, 1, D, { step: 7, amp: 1 });
    expect(s.step).toBe(7);
    expect(s.amp).toBe(1);
    expect(s).toEqual(b.sample(99999, 1, D, { step: 7, amp: 1 }));
  });
});

describe('staggerMs', () => {
  it('is 0 without a stagger, and spreads twenty objects over [0, stagger)', () => {
    expect(staggerMs(3, 0)).toBe(0);
    const v = Array.from({ length: 20 }, (_, i) => staggerMs(i, D.stagger));
    for (const x of v) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(D.stagger);
    }
    expect(new Set(v.map((x) => x.toFixed(3))).size).toBe(20);
  });

  it('keeps the hold inside frame 1 at the shipped rate, so the fade lands on the still', () => {
    expect(D.stagger).toBeLessThan(1000 / 6);
  });
});

describe('the registry', () => {
  it('publishes to listeners and forgets a face at rest', () => {
    const host = {} as Element;
    let calls = 0;
    const off = subscribeBoil(() => calls++);
    publishBoil(host, { dx: 1, dy: 0, deg: 0.1, amp: 1, step: 0 });
    expect(boilFor(host).dx).toBe(1);
    publishBoil(host, BOIL_REST);
    expect(boilFor(host)).toBe(BOIL_REST);
    publishBoil(host, null); // already at rest: nothing to tell anyone
    expect(calls).toBe(2);
    off();
  });
});
