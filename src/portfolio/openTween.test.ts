import { describe, expect, it } from 'vitest';
import { LOOK, OPEN_TRACK, openEase, openFrame, poseDials } from './portfolioMotion';
import { openExtraDepth, openStartDepth, sheetPose } from './pageTrack';

/**
 * THE OPEN TWEEN, which is the only entrance in the view that is not the
 * reader's wheel.
 *
 * Two things are held here. That the curve stays a MONOTONE RE-MAPPING OF TIME
 * — the entrance's pose table is shared with every scroll-driven entrance, so
 * the open is allowed to choose WHEN it is at a given point of that table and
 * nothing else. And that the sheet STARTS BELOW THE FRAME, which is the one
 * thing about the open that is a position rather than a timing.
 *
 * The milliseconds below are the TWEEN's own clock — the delay plus its
 * progress. A real open adds a few hundred ms of fonts and first layout before
 * any of it starts; `verify-open.mjs` is what measures that.
 */

const DIALS = poseDials();
/** The page rect at 1728×996, as `Scroller` derives it: the viewport less one
 *  margin a side, plus the letterhead at the top. */
const RECT = { top: 104, width: 1632, height: 844 };
const VIEWPORT_H = 996;
const EXTRA = openExtraDepth(RECT, VIEWPORT_H, DIALS, LOOK.openStartBelowPx);

/** The sheet at `ms` of the tween's clock: the pose, with the open's own extra
 *  depth still owed folded into `y` the way `Scroller` folds it in. */
const at = (ms: number) => {
  const tau = Math.min(1, Math.max(0, (ms - LOOK.openDelayMs) / LOOK.openRiseMs));
  const frame = openFrame(tau);
  const pose = sheetPose(frame.track, DIALS);
  return { ...pose, y: pose.y - EXTRA * frame.lift, lift: frame.lift };
};

/** Where the flat plane's top edge lands on screen at a given pose — the same
 *  bound `openStartDepth` is computed from. */
const topEdge = (pose: { y: number; scale: number; rotationZ: number }) => {
  const a = Math.abs((pose.rotationZ * Math.PI) / 180);
  const half =
    (pose.scale * RECT.width * Math.sin(a) + pose.scale * RECT.height * Math.cos(a)) / 2;
  return RECT.top + RECT.height / 2 - pose.y * RECT.height - half;
};

describe('openEase — a re-mapping of time, not a second pose table', () => {
  it('runs 0 → 1 and never goes backwards', () => {
    expect(openEase(0)).toBe(0);
    expect(openEase(1)).toBe(1);
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const v = openEase(i / 200);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(1);
      last = v;
    }
  });

  it('clamps outside the tween rather than extrapolating', () => {
    expect(openEase(-1)).toBe(0);
    expect(openEase(2)).toBe(1);
  });

  it('pays the lift off across phase 1 and leaves it off', () => {
    expect(openFrame(0).lift).toBe(1);
    // Phase 1 ends at OPEN_TRACK's first breakpoint, on the EASED clock — so it
    // is done well before that fraction of wall-clock time.
    expect(openFrame(1).lift).toBe(0);
    let last = 2;
    for (let i = 0; i <= 200; i++) {
      const v = openFrame(i / 200).lift;
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });

  it('keeps OPEN_TRACK sorted, anchored and three phases long', () => {
    expect(OPEN_TRACK[0]).toEqual([0, 0]);
    expect(OPEN_TRACK[OPEN_TRACK.length - 1]).toEqual([1, 1]);
    expect(OPEN_TRACK.map(([x]) => x)).toEqual([0, 0.3, 0.75, 1]);
  });
});

describe('the sheet starts below the frame', () => {
  it('puts the top edge exactly the dial below the viewport', () => {
    const pose = at(0);
    expect(pose.lift).toBe(1);
    expect(topEdge(pose)).toBeCloseTo(VIEWPORT_H + LOOK.openStartBelowPx, 6);
  });

  it('is a position against the FRAME, so it follows the page rect', () => {
    // A taller page does not mean a deeper start in pixels — it means the same
    // clearance under the same viewport, expressed in that page's own heights.
    const shallow = openStartDepth(RECT, VIEWPORT_H, DIALS, 40);
    const shorter = { top: 104, width: 1344, height: 748 };
    const other = openStartDepth(shorter, 900, DIALS, 40);
    expect(shallow * RECT.height + RECT.top + RECT.height / 2).toBeGreaterThan(VIEWPORT_H);
    expect(other * shorter.height + shorter.top + shorter.height / 2).toBeGreaterThan(900);
  });

  it('never asks a scroll-driven entrance for any of it', () => {
    // The extra is what the open ADDS. The shared dial is untouched by it.
    expect(DIALS.riseFrom).toBe(LOOK.riseFromH);
    expect(EXTRA).toBeGreaterThan(0);
  });
});

describe('the open, on the tween’s own clock', () => {
  it('holds below the frame while the pane fades up', () => {
    expect(at(200).curl).toBe(-1);
    expect(topEdge(at(200))).toBeGreaterThan(VIEWPORT_H);
    expect(topEdge(at(LOOK.openDelayMs))).toBeGreaterThan(VIEWPORT_H);
  });

  it('climbs into frame as a tube, still turned', () => {
    const entering = at(600);
    expect(topEdge(entering)).toBeLessThan(VIEWPORT_H); // a pixel of it is in shot
    expect(entering.curl).toBeLessThan(-0.9); // …and it is still a tube
    expect(Math.abs(entering.rotationZ)).toBeGreaterThan(30); // …still turned
  });

  it('squares up and starts to open once it is in', () => {
    const open = at(1000);
    expect(open.lift).toBe(0); // the rise is paid off
    expect(open.rotationZ).toBeCloseTo(0, 6);
    expect(open.curl).toBeLessThan(-0.4);
    expect(open.curl).toBeGreaterThan(-0.8);
  });

  it('is flat by about 1.4s and still rising', () => {
    expect(at(1400).curl).toBeGreaterThan(-0.05);
    expect(at(1600).curl).toBeCloseTo(0, 9);
    expect(at(1600).y).toBeLessThan(0);
  });

  it('docks at the end, with nothing left owed', () => {
    const end = at(LOOK.openDelayMs + LOOK.openRiseMs);
    expect(end.y).toBeCloseTo(0, 9);
    expect(end.lift).toBe(0);
    expect(end.scale).toBeCloseTo(1, 9);
    expect(end.rotationZ).toBeCloseTo(0, 9);
  });
});
