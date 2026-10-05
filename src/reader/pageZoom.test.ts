import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, clampPan, pinchState, zoomAbout } from './pageZoom';

/** A point of the unzoomed screen, where the zoom draws it. */
const at = (s: { z: number; tx: number; ty: number }, x: number, y: number) => [x * s.z + s.tx, y * s.z + s.ty];

describe('the reader zoom (touch)', () => {
  it('keeps the point it zooms about still', () => {
    const s = zoomAbout({ z: 1, tx: 0, ty: 0 }, 2.4, 300, 500);
    expect(at(s, 300, 500)).toEqual([300, 500]);
    const back = zoomAbout(s, 1, 120, 80);
    expect(back.z).toBe(1);
    expect(at(back, (120 - s.tx) / s.z, (80 - s.ty) / s.z)[0]).toBeCloseTo(120, 9);
  });

  it('follows the fingers: the point under their start stays under their midpoint', () => {
    const start = { z: 1, tx: 0, ty: 0 };
    const s = pinchState(start, 100, 250, [400, 600], [420, 610]);
    expect(s.z).toBeCloseTo(2.5, 9);
    const [x, y] = at(s, 400, 600);
    expect(x).toBeCloseTo(420, 9);
    expect(y).toBeCloseTo(610, 9);
  });

  it('never zooms out past the page, or in past the most', () => {
    expect(pinchState({ z: 1, tx: 0, ty: 0 }, 200, 50, [0, 0], [0, 0]).z).toBe(1);
    expect(pinchState({ z: 1, tx: 0, ty: 0 }, 50, 5000, [0, 0], [0, 0]).z).toBe(MAX_ZOOM);
  });

  it('pans no further than the page reaches', () => {
    // A page filling 20..800 × 90..1090 of an 820×1180 screen, at 2×.
    const page = { left: 20, top: 90, right: 800, bottom: 1090 };
    const far = clampPan({ z: 2, tx: 500, ty: 500 }, page, 820, 1180);
    // Its left and top edges stop at the screen's.
    expect(at(far, page.left, page.top)).toEqual([0, 0]);
    const other = clampPan({ z: 2, tx: -5000, ty: -5000 }, page, 820, 1180);
    expect(at(other, page.right, page.bottom)).toEqual([820, 1180]);
    // Inside the range it is left alone.
    const mid = clampPan({ z: 2, tx: -400, ty: -600 }, page, 820, 1180);
    expect([mid.tx, mid.ty]).toEqual([-400, -600]);
  });

  it('keeps a page smaller than the screen on the screen', () => {
    const page = { left: 100, top: 200, right: 300, bottom: 400 };
    const s = clampPan({ z: 1.5, tx: -400, ty: 900 }, page, 820, 1180);
    const [l, t] = at(s, page.left, page.top);
    const [r, b] = at(s, page.right, page.bottom);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(820);
    expect(b).toBeLessThanOrEqual(1180);
  });
});
