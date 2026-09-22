import { describe, expect, it } from 'vitest';
import {
  coverCrop,
  easeOutCubic,
  effectiveFold,
  foldTarget,
  lerpK,
  pointerUv,
  retarget,
  sampleTween,
  spriteUvRect,
  stripVelocity,
} from './paperMath';

describe('tweens', () => {
  it('eases out and lands exactly', () => {
    const t = { from: 0, to: 1, start: 100, ms: 300 };
    expect(sampleTween(t, 100)).toBe(0);
    expect(sampleTween(t, 250)).toBeCloseTo(easeOutCubic(0.5));
    expect(sampleTween(t, 400)).toBe(1);
    expect(sampleTween(t, 9999)).toBe(1);
  });

  it('retargets from where it is, never jumping', () => {
    const t = { from: 0, to: 1, start: 0, ms: 300 };
    const mid = sampleTween(t, 150);
    const back = retarget(t, 0, 150, 300);
    expect(sampleTween(back, 150)).toBeCloseTo(mid);
    expect(sampleTween(back, 450)).toBe(0);
    expect(retarget(t, 1, 150, 300)).toBe(t); // already heading there
  });
});

describe('fold', () => {
  it('folds only the off-screen buffer slot', () => {
    expect(foldTarget(0)).toBe(0);
    expect(foldTarget(1)).toBe(0);
    expect(foldTarget(2)).toBe(1);
  });

  it('never folds the hero, whatever its tween says', () => {
    expect(effectiveFold(1, 0)).toBe(0);
    expect(effectiveFold(1, 0.5)).toBe(0.5);
    expect(effectiveFold(1, 1.7)).toBe(1);
    expect(effectiveFold(0.4, -2)).toBe(0.4);
  });
});

describe('velocity', () => {
  it('is hero widths per 60Hz frame, whatever the frame rate', () => {
    // A tenth of a panel step of 600px on a 600px hero, in one 60Hz frame.
    expect(stripVelocity(0.1, 600, 600, 1 / 60)).toBeCloseTo(0.1);
    // The same motion at 120Hz is half the distance in half the time.
    expect(stripVelocity(0.05, 600, 600, 1 / 120)).toBeCloseTo(0.1);
    expect(stripVelocity(0.1, 600, 600, 0)).toBe(0);
  });

  it('lerps at the same rate at any frame rate', () => {
    const at60 = 1 - lerpK(0.2, 1 / 60);
    const at120 = (1 - lerpK(0.2, 1 / 120)) ** 2;
    expect(at120).toBeCloseTo(at60);
  });
});

describe('pointer UV (the raycast)', () => {
  const r = { cx: 500, cy: 400, w: 200, h: 260 };
  it('is y-up, and null off the card', () => {
    expect(pointerUv(r, 400, 270)).toEqual({ u: 0, v: 1 });
    expect(pointerUv(r, 600, 530)).toEqual({ u: 1, v: 0 });
    expect(pointerUv(r, 500, 400)).toEqual({ u: 0.5, v: 0.5 });
    expect(pointerUv(r, 399, 400)).toBeNull();
  });
});

describe('sprite UV rects', () => {
  it('maps a box in panel px to y-up UV', () => {
    expect(spriteUvRect(100, 0, 50, 130, 200, 260)).toEqual([0.5, 0.5, 0.75, 1]);
  });
});

describe('coverCrop', () => {
  it('is the whole image when the aspects agree (the faces are 10:13, as is the hero)', () => {
    expect(coverCrop(2000, 2600, 628, 816.4)).toEqual({ sx: 0, sy: 0, sw: 2000, sh: 2600 });
  });
  it('centres the crop otherwise', () => {
    expect(coverCrop(2000, 1000, 100, 100)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
    expect(coverCrop(1000, 2000, 100, 100)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 });
  });
});
