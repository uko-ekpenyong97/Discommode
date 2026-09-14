import { describe, expect, it } from 'vitest';
import { fitPlaneToRect, projectPlaneRect, unitsPerPixel } from './fitPlaneToRect';

/**
 * The hand-off invariant, in node. The browser check in `pv-verify` is the one
 * that matters — it asks three.js rather than this arithmetic — but a round
 * trip that does not close here can never close there, and this is where the
 * failure is readable.
 */

/** The reference's camera, which is the view's. */
const FOV = 20;
const Z = 50;

/** The two signed-off viewports, and the page rect each one gives with the
 *  shipped margins (48 sides, 56 letterhead + 48 top, 144 foot). */
const CASES = [
  { canvas: { width: 1728, height: 996 }, rect: { left: 48, top: 104, width: 1632, height: 748 } },
  { canvas: { width: 1440, height: 900 }, rect: { left: 48, top: 104, width: 1344, height: 652 } },
];

describe('fitPlaneToRect', () => {
  it('round-trips a rect to the plane and back, exactly', () => {
    for (const { canvas, rect } of CASES) {
      const back = projectPlaneRect(FOV, Z, canvas, fitPlaneToRect(FOV, Z, canvas, rect));
      expect(back.left).toBeCloseTo(rect.left, 9);
      expect(back.top).toBeCloseTo(rect.top, 9);
      expect(back.width).toBeCloseTo(rect.width, 9);
      expect(back.height).toBeCloseTo(rect.height, 9);
    }
  });

  it('is exact at ANY field of view — the plane is on the focal plane', () => {
    // Worth pinning: the narrow fov is for the CURL, not for the flat rect. A
    // flat plane at z = 0 projects to a rectangle whatever the angle, and that
    // is why the hand-off can be a crossfade rather than a morph.
    const { canvas, rect } = CASES[0];
    for (const fov of [8, 20, 45, 75]) {
      const back = projectPlaneRect(fov, Z, canvas, fitPlaneToRect(fov, Z, canvas, rect));
      expect(back.width).toBeCloseTo(rect.width, 9);
      expect(back.left).toBeCloseTo(rect.left, 9);
    }
  });

  it('takes the aspect from the PLANE, never from the viewport', () => {
    const { canvas, rect } = CASES[0];
    const fit = fitPlaneToRect(FOV, Z, canvas, rect);
    expect(fit.aspect).toBeCloseTo(rect.width / rect.height, 9);
    expect(fit.aspect).not.toBeCloseTo(canvas.width / canvas.height, 2);
    expect(fit.width / fit.height).toBeCloseTo(fit.aspect, 9);
  });

  it('centres the plane on the rect, not on the canvas', () => {
    const { canvas, rect } = CASES[0];
    const fit = fitPlaneToRect(FOV, Z, canvas, rect);
    const u = unitsPerPixel(FOV, Z, canvas.height);
    // The rect sits high in the canvas (letterhead above, foot below), so the
    // plane sits above the camera's axis by exactly that difference.
    expect(fit.x).toBeCloseTo((rect.left + rect.width / 2 - canvas.width / 2) * u, 9);
    expect(fit.y).toBeGreaterThan(0);
  });

  it('scales the projected rect about its centre', () => {
    const { canvas, rect } = CASES[0];
    const fit = fitPlaneToRect(FOV, Z, canvas, rect);
    const half = projectPlaneRect(FOV, Z, canvas, fit, 0.5);
    expect(half.width).toBeCloseTo(rect.width / 2, 9);
    expect(half.left + half.width / 2).toBeCloseTo(rect.left + rect.width / 2, 9);
    expect(half.top + half.height / 2).toBeCloseTo(rect.top + rect.height / 2, 9);
  });

  it('answers rather than divides by zero on a canvas with no size', () => {
    const fit = fitPlaneToRect(FOV, Z, { width: 0, height: 0 }, CASES[0].rect);
    expect(fit.unitsPerPixel).toBe(0);
    expect(projectPlaneRect(FOV, Z, { width: 0, height: 0 }, fit)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });
});
