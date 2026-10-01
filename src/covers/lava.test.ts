import { describe, expect, it } from 'vitest';
import { LavaInstance, LavaModel, MAX_BLOBS, blobPeriod, blobPose } from './covers/lava';
import type { LavaDials, LavaShape } from './covers/lava';
import { riveSite } from './covers/rive-site';
import { dialDefaults } from './dialValues';
import { DomeSpring, advanceDome, domeUp } from './dome';
import type { DialValues } from './dialValues';

const values = dialDefaults(riveSite.dials) as { lava: LavaDials; refraction5: LavaShape & Record<string, unknown> };
const dials = values.lava;
const shape = values.refraction5;
const model = (d: Partial<LavaDials> = {}) => new LavaModel({ ...dials, ...d }, shape);

const arrays = () => ({ A: new Float32Array(MAX_BLOBS * 4), B: new Float32Array(MAX_BLOBS * 4), S: new Float32Array(MAX_BLOBS * 2) });

/** Run an instance for `seconds` of wall and cover time at 60 Hz, its dome at
 *  `amp` over frame (x, y), from wall ms `from`; returns the next ms. */
function run(inst: LavaInstance, from: number, seconds: number, amp: number, x = 450, y = 663) {
  let now = from;
  for (let i = 0; i < seconds * 60; i++) {
    now += 1000 / 60;
    inst.step(now, now / 1000, { x, y, amp }, {} as DialValues);
  }
  return now;
}

describe("card 02's lava", () => {
  it('has the LAVA dials, its dark ground, and no cell, presence or drift', () => {
    expect(dials).toEqual({
      count: 9,
      size: 1,
      riseSpeed: 78,
      wobble: 0.31,
      mergeSoftness: 86,
      cursorRadius: 249,
      cursorStrength: 0.38,
      cursorSign: 'away',
      background: '#0d1220',
    });
    for (const gone of ['slugCell', 'slugPresence', 'slugDrift']) expect(shape).not.toHaveProperty(gone);
    expect(riveSite.coverBackdrop).toBe('solid');
  });

  it('never moves in sync: every period is its own, and blobs rise while others sink', () => {
    const m = model();
    const periods = m.blobs.slice(0, dials.count).map((b) => blobPeriod(b, dials.riseSpeed));
    const sorted = [...periods].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] / sorted[i - 1]).toBeGreaterThan(1.01);
    // a 500-unit rise and fall at riseSpeed, × 0.75–1.3
    for (const p of periods) {
      expect(p).toBeGreaterThanOrEqual((1000 / dials.riseSpeed) * 0.75);
      expect(p).toBeLessThanOrEqual((1000 / dials.riseSpeed) * 1.3);
    }
    for (const t of [0, 7, 31, 120, 600]) {
      let up = 0;
      let down = 0;
      for (const b of m.blobs.slice(0, dials.count)) {
        const y0 = blobPose(b, dials, t).y;
        const y1 = blobPose(b, dials, t + 0.5).y;
        if (y1 < y0 - 0.01) up++;
        else if (y1 > y0 + 0.01) down++;
      }
      expect(up, `t = ${t}`).toBeGreaterThan(0);
      expect(down, `t = ${t}`).toBeGreaterThan(0);
    }
  });

  it('keeps every blob in the frame, and moves them over 2 s', () => {
    const m = model();
    const a = arrays();
    const b = arrays();
    for (let t = 0; t < 300; t += 3.7) {
      m.fill(t, null, a.A, a.B, a.S);
      m.fill(t + 2, null, b.A, b.B, b.S);
      let moved = 0;
      for (let i = 0; i < dials.count; i++) {
        const x = a.A[i * 4];
        const y = a.A[i * 4 + 1];
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(900);
        expect(y).toBeGreaterThanOrEqual(60);
        expect(y).toBeLessThanOrEqual(1266);
        moved = Math.max(moved, Math.hypot(b.A[i * 4] - x, b.A[i * 4 + 1] - y));
      }
      expect(moved).toBeGreaterThan(20);
    }
  });

  it('stretches a blob as it travels, keeping its length × width', () => {
    const m = model({ wobble: 0 });
    const b = m.blobs[0];
    const T = blobPeriod(b, dials.riseSpeed);
    // mid-travel (sin φ = 0) against the top (sin φ = 1)
    const at = (ph: number) => ((ph - b.phase0) / (2 * Math.PI)) * T;
    const mid = { ...blobPose(b, m.dials, at(Math.PI)) };
    const end = { ...blobPose(b, m.dials, at(Math.PI / 2)) };
    expect(mid.l / mid.w).toBeGreaterThan(1.5 * (end.l / end.w));
    expect(mid.l * mid.w).toBeCloseTo(end.l * end.w, 3);
  });

  it('is a function of the clock at rest, and a settled instance is the rest', () => {
    const m = model();
    const a = arrays();
    const b = arrays();
    m.fill(12.5, null, a.A, a.B, a.S);
    m.fill(12.5, new LavaInstance(() => m), b.A, b.B, b.S);
    expect(b.A).toEqual(a.A);
    expect(b.B).toEqual(a.B);
  });

  it('drifts the blobs near a warm pointer toward it, or away with the sign', () => {
    const t = 20;
    const rest = arrays();
    model().fill(t, null, rest.A, rest.B, rest.S);
    // the pointer just off blob 0
    const px = rest.A[0] + 60;
    const py = rest.A[1] + 40;
    const toward = (sign: string) => {
      const m = model({ cursorSign: sign });
      const inst = new LavaInstance(() => m);
      inst.heat = 1;
      inst.px = px;
      inst.py = py;
      const o = arrays();
      m.fill(t, inst, o.A, o.B, o.S);
      const before = Math.hypot(rest.A[0] - px, rest.A[1] - py);
      return before - Math.hypot(o.A[0] - px, o.A[1] - py);
    };
    expect(toward('toward')).toBeGreaterThan(10);
    expect(toward('away')).toBeLessThan(-10);
  });

  it('speeds the warm blobs up, then eases back onto the shared timeline', () => {
    const m = model({ cursorRadius: 900 });
    const inst = new LavaInstance(() => m);
    let now = run(inst, 1000, 4, 1);
    expect(inst.heat).toBeGreaterThan(0.99);
    expect(inst.settled()).toBe(false);
    const ahead = Math.max(...inst.extra.slice(0, dials.count).map(Math.abs));
    expect(ahead).toBeGreaterThan(0.3);
    // the pointer leaves: no frame jumps, and it settles
    let last = inst.heat;
    for (let i = 0; i < 60 * 8 && !inst.settled(); i++) {
      now = run(inst, now, 1 / 60, 0);
      expect(last - inst.heat).toBeLessThan(0.05);
      last = inst.heat;
    }
    expect(inst.settled()).toBe(true);
    expect(inst.heat).toBe(0);
    expect(Math.max(...inst.extra.map(Math.abs))).toBe(0);
  });
});

describe("the dome and card 02's lava", () => {
  it('stays up until the lava has settled, and hands its state on', () => {
    const v = dialDefaults(riveSite.dials);
    const tile = new DomeSpring();
    let now = 1000;
    tile.point(450, 600);
    for (let i = 0; i < 120; i++) advanceDome(tile, (now += 16.7), riveSite, v, now / 1000);
    expect(domeUp(tile.state)).toBe(true);
    const heat = (tile.state.ext as LavaInstance).heat;
    expect(heat).toBeGreaterThan(0.9);
    // the click: the hero takes it over
    const hero = new DomeSpring();
    hero.adopt(tile, now, riveSite);
    expect((hero.state.ext as LavaInstance).heat).toBe(heat);
    expect(hero.state.amp).toBe(tile.state.amp);
    // the pointer gone, it eases out and comes back to rest
    tile.leave();
    let frames = 0;
    while (domeUp(tile.state) && frames < 600) {
      advanceDome(tile, (now += 16.7), riveSite, v, now / 1000);
      frames++;
    }
    expect(domeUp(tile.state)).toBe(false);
    expect(frames).toBeGreaterThan(20);
  });

  it('drops an adopted state that nobody showed', () => {
    const v = dialDefaults(riveSite.dials);
    const tile = new DomeSpring();
    tile.point(450, 600);
    let now = 1000;
    for (let i = 0; i < 60; i++) advanceDome(tile, (now += 16.7), riveSite, v, now / 1000);
    const hero = new DomeSpring();
    hero.adopt(tile, now, riveSite);
    advanceDome(hero, now + 5000, riveSite, v, now / 1000 + 5);
    expect(hero.state.amp).toBe(0);
    expect(domeUp(hero.state)).toBe(false);
  });
});

describe('which easing tile keeps its own draw', () => {
  it('is the one under the pointer, then the one it left last', async () => {
    const first = new DomeSpring();
    const second = new DomeSpring();
    const hovered = new DomeSpring();
    first.point(1, 1);
    first.leave();
    await new Promise((r) => setTimeout(r, 5));
    second.point(1, 1);
    second.leave();
    hovered.point(1, 1);
    const order = [first, second, hovered].sort((a, b) => b.priority() - a.priority());
    expect(order).toEqual([hovered, second, first]);
  });
});
