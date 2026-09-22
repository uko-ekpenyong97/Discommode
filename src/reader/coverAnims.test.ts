import { describe, expect, it } from 'vitest';
import {
  ENTER_FADE_MS,
  LEAVE_FADE_MS,
  enterFadeMs,
  faceOf,
  fitCover,
  hitTest,
  leavePlan,
  manifestBytes,
  timeToLoopEnd,
  toCover,
  toScreen,
} from './coverAnims';
import type { CoverAnim, CoverAnimManifest } from './coverAnims';

const anim = (id: string, z: number, hit: [number, number, number, number]): CoverAnim => ({
  id,
  z,
  src: `/anim/${id}.webp`,
  still: `/anim/${id}-still.webp`,
  displayRect: { x: hit[0], y: hit[1], w: hit[2], h: hit[3] },
  hitRect: { x: hit[0], y: hit[1], w: hit[2], h: hit[3] },
  frames: 4,
  fps: 6,
  mode: 'loop',
  restFrame: 'first',
  durationMs: 668,
  bytes: 1000,
});

describe('fitCover', () => {
  it('is a pure width scale when the box matches the cover ratio', () => {
    // The hero rect is 10:13 and the cover is 2000x2600 — the case that
    // actually ships, where the letterbox offsets must be exactly zero.
    const fit = fitCover(1000, 1300, 2000, 2600);
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(0);
  });

  it('letterboxes a too-wide box, pillarboxing the sides', () => {
    const fit = fitCover(2000, 1300, 2000, 2600);
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(500);
    expect(fit.offsetY).toBe(0);
  });

  it('collapses to zero scale on a degenerate box rather than dividing by it', () => {
    expect(fitCover(0, 0, 2000, 2600).scale).toBe(0);
    expect(fitCover(100, 100, 0, 0).scale).toBe(0);
  });
});

describe('toScreen / toCover', () => {
  it('round-trips a point through the fit', () => {
    const fit = fitCover(2000, 1300, 2000, 2600);
    const p = toCover(500 + 123 * 0.5, 456 * 0.5, fit);
    expect(p?.x).toBeCloseTo(123, 6);
    expect(p?.y).toBeCloseTo(456, 6);
  });

  it('places a cover rect inside the box, offsets included', () => {
    const fit = fitCover(2000, 1300, 2000, 2600);
    expect(toScreen({ x: 100, y: 200, w: 300, h: 400 }, fit)).toEqual({
      left: 550,
      top: 100,
      width: 150,
      height: 200,
    });
  });

  it('refuses to invert a degenerate fit', () => {
    expect(toCover(10, 10, { scale: 0, offsetX: 0, offsetY: 0 })).toBeNull();
  });
});

describe('hitTest', () => {
  // The shark lies ON the bed, inside its rect — the overlap is the normal case,
  // not an edge case, and z is what has to break it.
  const bed = anim('bed', 1, [400, 600, 640, 640]);
  const shark = anim('shark', 2, [460, 895, 330, 200]);
  const objects = [bed, shark];

  it('picks the highest z where two objects overlap', () => {
    expect(hitTest(objects, 600, 950)?.id).toBe('shark');
  });

  it('picks the lower object where only it is under the pointer', () => {
    expect(hitTest(objects, 430, 650)?.id).toBe('bed');
  });

  it('is unaffected by the order the objects are listed in', () => {
    expect(hitTest([...objects].reverse(), 600, 950)?.id).toBe('shark');
  });

  it('returns null off every object', () => {
    expect(hitTest(objects, 10, 10)).toBeNull();
  });

  it('counts the rect edges as inside', () => {
    expect(hitTest([bed], 400, 600)?.id).toBe('bed');
    expect(hitTest([bed], 1040, 1240)?.id).toBe('bed');
    expect(hitTest([bed], 1041, 1240)).toBeNull();
  });
});

describe('manifestBytes', () => {
  it('totals the animations for the preload budget', () => {
    const m: CoverAnimManifest = {
      issue: '01',
      coverW: 2000,
      coverH: 2600,
      plate: '/issues/01/cover-plate.webp',
      rest: '/issues/01/cover-rest.webp',
      objects: [anim('a', 1, [0, 0, 1, 1]), anim('b', 2, [0, 0, 1, 1])],
    };
    expect(manifestBytes(m)).toBe(2000);
  });
});

describe('timeToLoopEnd', () => {
  // 6fps × 6 frames = 1002ms, the polaroid's pass.
  const PASS = 1002;

  it('waits out the remainder of the pass a looping object is in', () => {
    expect(timeToLoopEnd(200, PASS)).toBe(802);
    expect(timeToLoopEnd(900, PASS)).toBe(102);
  });

  it('never waits more than one pass, however long the hover was', () => {
    // Four and a bit passes in: only the "bit" is left, not four passes.
    expect(timeToLoopEnd(PASS * 4 + 250, PASS)).toBe(PASS - 250);
    expect(timeToLoopEnd(PASS * 40 + 1, PASS)).toBeLessThanOrEqual(PASS);
  });

  it('returns immediately when the pointer leaves exactly on a boundary', () => {
    expect(timeToLoopEnd(PASS, PASS)).toBe(0);
    expect(timeToLoopEnd(PASS * 3, PASS)).toBe(0);
  });

  it('waits out the single pass of a `once` object, then stops waiting', () => {
    expect(timeToLoopEnd(200, PASS, 'once')).toBe(802);
    // Held on its last frame for a while — there is nothing left to finish.
    expect(timeToLoopEnd(PASS + 5000, PASS, 'once')).toBe(0);
  });

  it('does not wait on a degenerate duration', () => {
    expect(timeToLoopEnd(100, 0)).toBe(0);
    expect(timeToLoopEnd(100, Number.NaN)).toBe(0);
  });

  it('returns immediately on a nonsensical elapsed time, rather than a negative wait', () => {
    expect(timeToLoopEnd(-50, PASS)).toBe(0);
  });

  it('never returns a wait outside [0, duration]', () => {
    for (const e of [0, 1, 17, 333, 1001, 1002, 1003, 99_999]) {
      const w = timeToLoopEnd(e, PASS);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(PASS);
    }
  });
});

describe('enterFadeMs', () => {
  it('cuts instantly when the loop opens on the frame already showing', () => {
    expect(enterFadeMs({ restFrame: 'first' })).toBe(0);
  });

  it('dissolves when the loop opens on a different frame than the still', () => {
    // libros rests on its LAST frame (a full shelf) and plays from its first
    // (an empty one) — cutting would snap the books out of existence.
    expect(enterFadeMs({ restFrame: 'last' })).toBe(ENTER_FADE_MS);
  });
});

describe('leavePlan', () => {
  const loopFirst = { durationMs: 1002, mode: 'loop', restFrame: 'first' } as const;
  const onceLast = { durationMs: 1837, mode: 'once', restFrame: 'last' } as const;
  const onceFirst = { durationMs: 1837, mode: 'once', restFrame: 'first' } as const;

  it('finishes the pass, then cross-fades, for an ordinary looping object', () => {
    expect(leavePlan(300, loopFirst)).toEqual({ wait: 702, fade: LEAVE_FADE_MS });
  });

  it('returns instantly when the animation is frozen on the very frame it rests on', () => {
    // `once` + rest `last`, played out: the last frame IS the still, so there is
    // provably nothing to wait for and nothing to dissolve.
    expect(leavePlan(1837, onceLast)).toEqual({ wait: 0, fade: 0 });
    expect(leavePlan(9000, onceLast)).toEqual({ wait: 0, fade: 0 });
  });

  it('still waits out a build that was interrupted, and lands with a fade', () => {
    expect(leavePlan(400, onceLast)).toEqual({ wait: 1437, fade: LEAVE_FADE_MS });
  });

  it('does not take the instant path when the frozen frame is not the still', () => {
    // Played out, but it rests on frame 1 — the last frame is something else, so
    // the still genuinely has to come back over it.
    expect(leavePlan(9000, onceFirst)).toEqual({ wait: 0, fade: LEAVE_FADE_MS });
  });
});

describe('faceOf', () => {
  const base: CoverAnimManifest = {
    issue: '01',
    coverW: 2000,
    coverH: 2600,
    plate: '/issues/01/cover-plate.webp',
    rest: '/issues/01/cover-rest.webp',
    objects: [anim('bed', 1, [0, 0, 1, 1]), { ...anim('riddim', 1, [0, 0, 1, 1]), face: 'back' }],
  };

  it('reads an object with no face as a cover object', () => {
    expect(faceOf(base, 'cover')?.objects.map((o) => o.id)).toEqual(['bed']);
  });

  it('gives the back its own space and plate', () => {
    const m = { ...base, back: { backW: 2000, backH: 2600, plate: '/b-plate.webp', rest: '/b-rest.webp' } };
    expect(faceOf(m, 'back')).toEqual({ w: 2000, h: 2600, plate: '/b-plate.webp', objects: [m.objects[1]] });
  });

  it('is null for a face with no objects, or a back with no plate', () => {
    expect(faceOf({ ...base, objects: [base.objects[0]] }, 'back')).toBeNull();
    expect(faceOf(base, 'back')).toBeNull();
  });
});
