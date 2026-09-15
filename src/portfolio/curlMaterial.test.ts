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

/** The tear's shipped shape, at the page's aspect. THE FOLD — mode 1. */
const TEAR: BendParams = {
  mode: 1,
  amount: 0.45,
  origin: 0.08,
  originEdge: 0,
  axis: (125 * Math.PI) / 180,
  tightness: 0.35,
  taper: 0.35,
  depth: 0.5,
  wrap: 2.4,
  aspect: 1632 / 748,
};

/**
 * The entrance's, which is THE ROLL — mode 0, the cone wrap, and a different
 * function reading the same field names.
 *
 * `origin` 1 is how much of the sheet the roll reaches at full amount, not
 * where a fold sits; `tightness` 1 is how hard the cone tapers, not a radius.
 * That is the whole hazard these two constants exist to keep visible: put this
 * object through the fold and it is a flat sheet with a crease in one corner,
 * which is exactly what shipped for a release.
 */
const ENTER: BendParams = {
  ...TEAR,
  mode: 0,
  amount: -1,
  origin: 1,
  originEdge: 0,
  tightness: 1,
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

describe('bentPoint — the entrance is a ROLL, and a roll is not a bend', () => {
  /** The z of the surface down the sheet's CENTRE LINE, sampled along v. */
  const spine = (params: BendParams, n = 400): number[] =>
    Array.from({ length: n + 1 }, (_, i) => bentPoint(0.5, i / n, params)[2]);

  /** Local maxima of |z| along that line, endpoints included — the crests of
   *  the roll. ONE is a bend; more than one is a tube, and that is the whole
   *  distinction between the two shapes. */
  const crests = (z: number[]): number => {
    const a = z.map(Math.abs);
    let n = 0;
    for (let i = 0; i < a.length; i++) {
      const up = i === 0 || a[i] > a[i - 1];
      const down = i === a.length - 1 || a[i] >= a[i + 1];
      if (up && down && a[i] > 1e-4) n++;
    }
    return n;
  };

  it('winds the sheet round MORE THAN ONCE, which a fold cannot do', () => {
    // THE TEST THAT WOULD HAVE CAUGHT IT. A fold has one crest however hard it
    // is driven — an arc and a straight flap, and the flap does not come back.
    // The roll makes 2.35 turns whatever is left to roll, so its centre line
    // crosses over itself twice on the way up.
    expect(crests(spine(ENTER))).toBeGreaterThan(1);
    // …and the fold, driven as hard as it ever is, has exactly one.
    expect(crests(spine({ ...TEAR, amount: 0.6, origin: 0.53 }))).toBe(1);
  });

  it('collapses the whole sheet into the tube at full amount', () => {
    // Fully rolled is fully rolled: at reach 1 every point of the sheet is
    // wound, so its extent along y is the tube's diameter rather than a page.
    // A flat sheet tilting in has an extent of 1 — which is what the release
    // this fixes actually put on screen.
    const ys = Array.from({ length: 401 }, (_, i) => bentPoint(0.5, i / 400, ENTER)[1]);
    const extent = Math.max(...ys) - Math.min(...ys);
    expect(extent).toBeLessThan(0.2);
    // The tube stands at the far edge, where a rolled-up scroll ends up.
    expect(Math.min(...ys)).toBeGreaterThan(0.35);
  });

  it('has a radius DERIVED from the amount, so it shrinks to nothing', () => {
    // The tube always makes the same number of turns, so its RADIUS is what
    // gives: it thins as the sheet unrolls and vanishes at zero rather than
    // collapsing through a discontinuity. That is also what a scroll does, and
    // it is the property `tightness` was mistaken for.
    const thickness = (amount: number): number =>
      // A fine grid, because the crest is being found by sampling and the
      // claim is about a ratio to four places.
      Math.max(...spine({ ...ENTER, amount }, 20000).map(Math.abs));
    const full = thickness(-1);
    expect(thickness(-0.5) / full).toBeCloseTo(0.5, 4);
    expect(thickness(-0.25) / full).toBeCloseTo(0.25, 4);
    expect(thickness(0)).toBe(0);
  });

  it('rolls TOWARD the viewer at a negative amount — the fold does not', () => {
    // THE TWO MODES DISAGREE ABOUT THE SIGN, and they always did: the roll
    // reads `amount < 0` as "rolled" and lifts toward the lens, the fold reads
    // negative as "away". One number, two conventions, which is one more reason
    // these are two functions rather than one with a flag in it.
    expect(Math.min(...spine(ENTER))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...spine(ENTER))).toBeGreaterThan(0);
    expect(bentPoint(0.5, 0.98, { ...TEAR, amount: -0.55, origin: 0.15, axis: (270 * Math.PI) / 180, wrap: 0 })[2]).toBeLessThan(0);
  });

  it('is exactly flat once it is out', () => {
    // THE HAND-OFF INVARIANT at the geometry's own level: at amount 0 there is
    // no tube and no offset, so the plane is the page's rect exactly.
    for (const v of [0, 0.5, 0.9, 1]) {
      const flat = bentPoint(0.5, v, { ...ENTER, amount: 0 });
      expect(flat[1]).toBeCloseTo(v - 0.5, 12);
      expect(flat[2]).toBe(0);
    }
  });

  it('takes `tightness` as a TAPER, which is not what makes it a tube', () => {
    // The cone's half-angle scales the radius by `1 + x·aspect·cos(cone)`, and
    // on the centre line x is 0 — so down the middle the tube is the same tube
    // at every tightness. It is the dial the last release mistook for the one
    // that produces a roll, and this is the arithmetic that says it is not.
    const middle = spine({ ...ENTER, tightness: 0 });
    for (const tightness of [0.35, 0.62, 1]) {
      expect(spine({ ...ENTER, tightness })).toEqual(middle);
    }
    // Off the centre line it does bite, or the dial would be dead.
    const edge = (tightness: number) => bentPoint(0.95, 0.5, { ...ENTER, tightness })[2];
    expect(edge(1)).not.toBeCloseTo(edge(0), 6);
  });

  it('ignores every dial that belongs to the fold', () => {
    // `taper`, `depth` and `wrap` are mode 1's. A roll that moved when one of
    // them did would be a roll the tear could reach — which is the coupling the
    // mode exists to break.
    const rolled = spine(ENTER);
    for (const other of [{ taper: -1 }, { depth: 1 }, { wrap: 2.4 }, { axis: 0 }]) {
      expect(spine({ ...ENTER, ...other })).toEqual(rolled);
    }
  });

  it('rolls from the edge it is told to, and only that changes', () => {
    // The free end is the leading edge as the sheet rises. Flipping the dial
    // mirrors the shape about the middle and does nothing else.
    const bottom = spine(ENTER);
    const top = spine({ ...ENTER, originEdge: 1 }).reverse();
    for (let i = 0; i < bottom.length; i++) expect(top[i]).toBeCloseTo(bottom[i], 12);
  });

  it('is a partial roll under the `held` preset, not a different shape', () => {
    // `held` is mode 0 too: fewer turns' worth of sheet taken up, at a smaller
    // radius, with the rest of it flat behind. It is NOT the fold — putting the
    // entrance on the fold is the bug this file is the guard for.
    const HELD: BendParams = { ...ENTER, amount: -0.55, tightness: 0.35 };
    expect(crests(spine(HELD))).toBeGreaterThan(1);
    // The part the roll has not reached is untouched, which the full one has
    // none of: at reach 1 and amount −0.55 the front is 0.55 up the sheet.
    expect(bentPoint(0.5, 0.9, HELD)[2]).toBe(0);
    expect(bentPoint(0.5, 0.9, ENTER)[2]).toBeGreaterThan(0);
  });
});
