import { describe, expect, it } from 'vitest';
import { bentPoint } from './curlMaterial';
import type { BendParams } from './curlMaterial';

/**
 * `bentPoint` is a hand port of the vertex shader's `bent()`, and it exists so
 * `pv-verify` can ask where a vertex ended up without reading a GPU buffer
 * back. A port can drift, so these are the properties the SHAPE has to have —
 * the ones that would break first if the two ever disagreed, and the ones the
 * hand-offs and the tear are each resting on.
 *
 * What it cannot check is that the port matches the GLSL character for
 * character. What catches that is the browser suite, which measures the corner
 * through this and the silhouette through a screenshot: the two answers come
 * from different sides of the driver and have to agree about the same peel.
 */

/** The tear's shipped shape, at the page's aspect. */
const TEAR: BendParams = {
  amount: 0.45,
  origin: 0.08,
  axis: (125 * Math.PI) / 180,
  tightness: 0.35,
  taper: 0.35,
  depth: 0.5,
  wrap: 2.4,
  aspect: 1632 / 748,
};

/** The entrance's, which wants a wide curve and no floor under it. */
const ENTER: BendParams = {
  ...TEAR,
  amount: -0.55,
  origin: 0.15,
  axis: (270 * Math.PI) / 180,
  wrap: 0,
};

/** uv (1, 0) is the plane's bottom-right corner: the one a tear lifts. */
const CORNER: [number, number] = [1, 0];

const lengthOf = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('bentPoint — flat is exactly flat', () => {
  it('leaves every vertex alone at amount 0', () => {
    // THE HAND-OFF INVARIANT, at the geometry's own level: both crossfades are
    // between a flat sheet and an HTML page at the same rect, and a plane that
    // is a hair off flat is a rect that is a hair off the page's.
    for (const uv of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5],
      [0.3, 0.7],
    ] as [number, number][]) {
      const flat = bentPoint(uv[0], uv[1], { ...TEAR, amount: 0 });
      expect(flat[0]).toBeCloseTo(uv[0] - 0.5, 12);
      expect(flat[1]).toBeCloseTo(uv[1] - 0.5, 12);
      expect(flat[2]).toBe(0);
    }
  });

  it('leaves the part of the sheet the fold has not reached alone', () => {
    // The pinned corner, which is where the tear turns about.
    const pinned = bentPoint(0, 1, TEAR);
    expect(pinned[0]).toBeCloseTo(-0.5, 12);
    expect(pinned[1]).toBeCloseTo(0.5, 12);
    expect(pinned[2]).toBe(0);
  });
});

describe('bentPoint — the tear lifts its free corner', () => {
  it('takes the corner off the plane and pulls it toward the fold', () => {
    const [x, y, z] = bentPoint(...CORNER, TEAR);
    expect(z).toBeGreaterThan(0); // positive bends toward the viewer
    // Toward the fold, which runs up and to the left from the free corner.
    expect(x).toBeLessThan(0.5);
    expect(y).toBeGreaterThan(-0.5);
  });

  it('is what the WRAP FLOOR buys, and nothing else is', () => {
    // The corner's own angle is `frontLen / r`, so once it is inside the arc
    // nothing past it can move it: winding the curl up drives the fold deeper
    // into the sheet and leaves the corner exactly where it was.
    const at = (amount: number, wrap: number) =>
      lengthOf(bentPoint(...CORNER, { ...TEAR, amount, wrap }), [0.5, -0.5, 0]);

    // Nearly doubling the curl moves the corner by about 5e-7 of a page
    // height, which is a millionth of a pixel and is float noise rather than
    // motion.
    const soft = [0.33, 0.45, 0.6].map((a) => at(a, 0));
    expect(soft[1]).toBeCloseTo(soft[0], 6);
    expect(soft[2]).toBeCloseTo(soft[0], 6);

    // With a floor the corner creases, and it creases further the tighter the
    // floor is asked to be.
    const creased = [1.6, 2.4, 3.2].map((w) => at(0.45, w));
    expect(creased[0]).toBeGreaterThan(soft[1]);
    expect(creased[1]).toBeGreaterThan(creased[0]);
    expect(creased[2]).toBeGreaterThan(creased[1]);
  });

  it('stops biting once the peel is long enough to earn the radius', () => {
    // The floor is a crease for a short peel, not a change of material. By the
    // time the fold has crossed a fifth of the sheet the radius is the dial's
    // again and the rest of the tear is untouched.
    const long = { ...TEAR, origin: 0.45, amount: 0.6 };
    for (const uv of [CORNER, [0.7, 0.3], [0.5, 0.5]] as [number, number][]) {
      const floored = bentPoint(uv[0], uv[1], long);
      const free = bentPoint(uv[0], uv[1], { ...long, wrap: 0 });
      expect(lengthOf(floored, free)).toBeLessThan(1e-9);
    }
  });
});

describe('bentPoint — the surface is smooth where it leaves the plane', () => {
  it('has no crease at the fold', () => {
    // The arc is tangent to the plane at its start, so the surface is C1 there.
    // A crease would catch the light as a line and read as a fold in the
    // TEXTURE rather than in the paper.
    const axis = TEAR.axis;
    const d: [number, number] = [Math.cos(axis), Math.sin(axis)];
    const step = 1e-4;
    // Walk across the fold along the roll direction, in uv.
    const at = (k: number): number[] => {
      const u = 0.5 + d[0] * k;
      const v = 0.5 + d[1] * k;
      return bentPoint(u, v, { ...TEAR, origin: 0.5, amount: 0.45 });
    };
    // The second difference is bounded: a crease would make it explode.
    for (let k = -0.05; k <= 0.05; k += 0.005) {
      const a = at(k - step);
      const b = at(k);
      const c = at(k + step);
      const second = a.map((v, i) => v - 2 * b[i] + c[i]);
      expect(Math.hypot(...second) / (step * step)).toBeLessThan(60);
    }
  });
});

describe('bentPoint — the entrance keeps its wide curve', () => {
  it('bends AWAY from the viewer, along the top edge, and only there', () => {
    // The fold sits a sixth of the way in from the top edge and the rest of the
    // sheet is flat, which is what leaves a line of type readable across it.
    expect(bentPoint(0.5, 0.98, ENTER)[2]).toBeLessThan(0);
    expect(bentPoint(0.5, 0.5, ENTER)[2]).toBe(0);
    expect(bentPoint(0.5, 0.02, ENTER)[2]).toBe(0);
  });

  it('takes no floor, so the curve stays as wide as the dial says', () => {
    const wide = bentPoint(0.5, 1, ENTER);
    const creased = bentPoint(0.5, 1, { ...ENTER, wrap: 2.4 });
    expect(Math.abs(creased[2])).toBeGreaterThan(Math.abs(wide[2]));
  });

  it('straightens to exactly flat by the hand-off', () => {
    for (const v of [0, 0.5, 0.9, 1]) {
      expect(bentPoint(0.5, v, { ...ENTER, amount: 0 })[2]).toBe(0);
    }
  });
});
