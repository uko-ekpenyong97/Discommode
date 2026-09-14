import { describe, expect, it } from 'vitest';
import {
  SEGMENT_EPSILON,
  bottomOf,
  buildTrack,
  dwellStart,
  enterWindow,
  layout,
  maxPosition,
  minPosition,
  positionAt,
  positionOf,
  resolve,
  settleAt,
  sheetPose,
  tearPose,
} from './pageTrack';
import type { PoseDials, Track } from './pageTrack';

/**
 * The whole model, in node. `pageTrack` is the one file in the view with no
 * DOM in it, which is what makes the four segments testable at all — and the
 * segments are where every ambiguity lives: a boundary, a beat of nothing, and
 * a position that has to survive a rebuild.
 */

const PAGE_HEIGHT = 800;
const ENTER = 900;
const EXIT = 700;
const DWELL = 500;

/** The shipped dials, so the poses are tested against the numbers that ship. */
const DIALS: PoseDials = {
  enterCurl: -0.55,
  enterCurlOrigin: 0.15,
  enterCurlAxis: 270,
  startRotation: -28,
  rotationEndAt: 0.16,
  scaleBase: 0.41,
  scaleTargetAt: 0.22,
  curlOutAt: 0.6,
  riseFrom: -0.51,
  peelAngle: -35,
  peelLiftAt: 0.15,
  peelTravelAt: 0.6,
  peelFreeAt: 0.8,
  peelOriginFrom: 0.08,
  peelOriginTo: 0.53,
  peelCurlLift: 0.45,
  peelCurlPeak: 0.6,
  peelCurlPeakAt: 0.4,
  peelCurlRelax: 0.2,
  peelWrapMin: 2.4,
  peelRotateMid: -12,
  peelRotateEnd: -18,
  peelLiftMid: 0.12,
  peelRiseEnd: 0.9,
  peelScaleEnd: 0.85,
  peelFadeFrom: 0.9,
};

function track(heights: number[], pageHeight = PAGE_HEIGHT): Track {
  return buildTrack({
    heights,
    pageHeight,
    enterDistance: ENTER,
    exitDistance: EXIT,
    dwellDistance: DWELL,
  });
}

/** Three sections: one long, one short enough to have no vertical run at all,
 *  one long again. The short one is the case the model has to reduce to. */
const THREE = () => track([2000, 500, 1400]);

describe('buildTrack', () => {
  it('measures each section against the page, and floors at zero', () => {
    expect(THREE().pageScroll).toEqual([1200, 0, 600]);
  });

  it('spaces the starts by an entrance, the run, a tear and a dwell', () => {
    const t = THREE();
    expect(t.start[0]).toBe(0);
    expect(t.start[1]).toBe(ENTER + 1200 + EXIT + DWELL);
    expect(t.start[2]).toBe(t.start[1] + ENTER + 0 + EXIT + DWELL);
  });

  it('starts one entrance before zero and ends at the last run’s bottom', () => {
    const t = THREE();
    // The scroller cannot go negative; the intro tween drives the entrance and
    // hands over at 0. The last section has neither a tear nor a dwell: there
    // is nothing behind it to bring on.
    expect(minPosition(t)).toBe(-ENTER);
    expect(maxPosition(t)).toBe(t.start[2] + 600);
  });

  it('answers for a one-section project — no tear, no dwell, no settle', () => {
    const t = track([2000]);
    expect(t.start).toEqual([0]);
    expect(maxPosition(t)).toBe(1200);
    expect(settleAt(t, 600)).toBeNull();
  });

  it('never leaves a section without a start, even given nothing', () => {
    const t = track([]);
    expect(t.start).toEqual([0]);
    expect(t.pageScroll).toEqual([0]);
  });
});

describe('positionAt — the four segments partition the track', () => {
  const t = THREE();

  it('reads an entrance, a run, a tear and a dwell', () => {
    expect(positionAt(t, -450)).toMatchObject({ section: 0, segment: 'enter', p: 0.5 });
    expect(positionAt(t, 600)).toMatchObject({ section: 0, segment: 'page', offset: 600 });
    expect(positionAt(t, 1200 + 350)).toMatchObject({ section: 0, segment: 'exit', p: 0.5 });
    expect(positionAt(t, 1200 + 700 + 250)).toMatchObject({ section: 0, segment: 'dwell', p: 0.5 });
  });

  it('hands over from one section’s dwell to the next section’s entrance', () => {
    const boundary = t.start[1] - ENTER;
    expect(positionAt(t, boundary - 1)).toMatchObject({ section: 0, segment: 'dwell' });
    expect(positionAt(t, boundary)).toMatchObject({ section: 1, segment: 'enter', p: 0 });
  });

  it('covers every position with exactly one segment', () => {
    for (let y = minPosition(t); y <= maxPosition(t); y += 37) {
      const at = positionAt(t, y);
      expect(at.section).toBeGreaterThanOrEqual(0);
      expect(['enter', 'page', 'exit', 'dwell']).toContain(at.segment);
    }
  });

  it('gives a section with no vertical run a page segment of its own', () => {
    // Section 1 is shorter than the frame, so `start[1]` is both the top and
    // the bottom of its run — and it is still a page, not a seam.
    expect(positionAt(t, t.start[1])).toMatchObject({ section: 1, segment: 'page', offset: 0 });
  });
});

describe('the half-pixel guards', () => {
  const t = THREE();

  it('holds a scroll settling on a run’s bottom out of the tear', () => {
    const bottom = bottomOf(t, 0);
    expect(positionAt(t, bottom + SEGMENT_EPSILON * 0.9).segment).toBe('page');
    expect(positionAt(t, bottom + SEGMENT_EPSILON * 1.1).segment).toBe('exit');
  });

  it('lands a deep link ON the page rather than 99.98% through the entrance', () => {
    // A scroller quantises to device pixels, so `scrollTo(start[k])` can come
    // back a fraction short. Without the guard that reads as an entrance that
    // has not handed off — a texture you cannot scroll.
    expect(positionAt(t, t.start[2] - SEGMENT_EPSILON * 0.9).segment).toBe('page');
    expect(positionAt(t, t.start[2] - SEGMENT_EPSILON * 1.1).segment).toBe('enter');
  });

  it('guards the end of a tear, which the settle lands on', () => {
    const end = dwellStart(t, 0);
    expect(positionAt(t, end + SEGMENT_EPSILON * 0.9).segment).toBe('exit');
    expect(positionAt(t, end + SEGMENT_EPSILON * 1.1).segment).toBe('dwell');
  });
});

describe('semantic position across a rebuild', () => {
  it('round-trips every segment against its own track', () => {
    const t = THREE();
    const points = [-450, 0, 600, 1200, 1500, dwellStart(t, 0) + 200, t.start[1], maxPosition(t)];
    for (const y of points) expect(resolve(t, positionAt(t, y))).toBeCloseTo(y, 6);
  });

  it('keeps the reader where they were when a section behind them grows', () => {
    const before = THREE();
    const held = positionAt(before, before.start[2] + 300);
    // Section 0 gets 400px taller: every start behind it moves, so the same
    // pixel position is a different place.
    const after = track([2400, 500, 1400]);
    expect(resolve(after, held)).toBe(after.start[2] + 300);
  });

  it('puts a reader past the end of a shrunken section at its bottom', () => {
    const held = positionAt(THREE(), 1000); // 1000px down section 0
    expect(resolve(track([1100, 500, 1400]), held)).toBe(300); // …now only 300 long
  });

  it('carries a part-done tear and a part-done dwell across', () => {
    const before = THREE();
    const tear = positionAt(before, bottomOf(before, 0) + EXIT * 0.4);
    const dwell = positionAt(before, dwellStart(before, 0) + DWELL * 0.4);
    expect(tear).toMatchObject({ section: 0, segment: 'exit' });
    expect(dwell).toMatchObject({ section: 0, segment: 'dwell' });
    const after = track([2400, 500, 1400]);
    expect(resolve(after, tear)).toBeCloseTo(bottomOf(after, 0) + EXIT * 0.4, 6);
    expect(resolve(after, dwell)).toBeCloseTo(dwellStart(after, 0) + DWELL * 0.4, 6);
  });
});

describe('enterWindow — nothing overlaps any more', () => {
  it('is exactly the enter segment, for every section', () => {
    const t = THREE();
    for (let k = 0; k < 3; k++) {
      expect(enterWindow(t, k)).toEqual({ from: t.start[k] - ENTER, to: t.start[k] });
    }
  });

  it('starts only once the dwell before it has finished', () => {
    const t = THREE();
    expect(enterWindow(t, 1).from).toBe(dwellStart(t, 0) + DWELL);
  });
});

describe('layout — one thing at a time', () => {
  const t = THREE();
  const at = (y: number) => layout(t, y, DIALS);

  it('shows one page and nothing else on a vertical run', () => {
    const l = at(600);
    expect(l.page).toMatchObject({ index: 0 });
    expect(l.page?.pose).toMatchObject({ scrollTop: 600, opacity: 1 });
    expect(l.sheet).toBeNull();
  });

  it('shows the peeling sheet and no page through a tear', () => {
    const l = at(bottomOf(t, 0) + EXIT * 0.5);
    expect(l.page).toBeNull();
    expect(l.sheet).toMatchObject({ index: 0 });
    expect(l.sheet?.pose.kind).toBe('tail');
  });

  it('shows NOTHING through a dwell', () => {
    const l = at(dwellStart(t, 0) + DWELL * 0.5);
    expect(l.page).toBeNull();
    expect(l.sheet).toBeNull();
  });

  it('shows the unrolling sheet and no page through an entrance', () => {
    const l = at(t.start[1] - ENTER * 0.5);
    expect(l.page).toBeNull();
    expect(l.sheet).toMatchObject({ index: 1 });
    expect(l.sheet?.pose.kind).toBe('sheet');
  });

  it('never puts a page and a sheet on screen at once', () => {
    for (let y = minPosition(t); y <= maxPosition(t); y += 13) {
      const l = at(y);
      expect(l.page === null || l.sheet === null).toBe(true);
    }
  });

  it('commits the active section at the hand-off, and names the pending one', () => {
    // All the way through section 1's entrance you are still reading 0.
    expect(at(t.start[1] - 1)).toMatchObject({ activeIndex: 0, pendingIndex: 1 });
    expect(at(t.start[1])).toMatchObject({ activeIndex: 1, pendingIndex: null });
    // A tear is still the section that is leaving; a dwell already names the
    // one it is waiting for.
    expect(at(bottomOf(t, 0) + 10)).toMatchObject({ activeIndex: 0, pendingIndex: null });
    expect(at(dwellStart(t, 0) + 10)).toMatchObject({ activeIndex: 0, pendingIndex: 1 });
  });
});

describe('sheetPose — the soft entrance', () => {
  it('stops tumbling first, from a gentler angle than the roll did', () => {
    expect(sheetPose(0, DIALS).rotationZ).toBe(-28);
    expect(sheetPose(0.16, DIALS).rotationZ).toBeCloseTo(0, 9);
    expect(sheetPose(0.9, DIALS).rotationZ).toBeCloseTo(0, 9);
  });

  it('reaches full size second', () => {
    expect(sheetPose(0, DIALS).scale).toBeCloseTo(0.41, 6);
    expect(sheetPose(0.22, DIALS).scale).toBeCloseTo(1, 6);
  });

  it('arrives as a wide bend at one edge, not as a tube', () => {
    // The fold does not move: it sits a sixth of the way in from the TOP edge
    // — the leading one as the sheet rises — for the whole entrance, so the
    // rest of the sheet is flat and a line of type stays readable across it.
    for (const p of [0, 0.3, 0.59, 1]) {
      expect(sheetPose(p, DIALS).curlOrigin).toBe(0.15);
      expect(sheetPose(p, DIALS).curlAxis).toBe(270);
      // No wrap floor: the entrance's curve has to stay wide enough to read a
      // line of type across, which is the one thing a floor would take away.
      expect(sheetPose(p, DIALS).curlWrap).toBe(0);
    }
    expect(sheetPose(0, DIALS).curl).toBeCloseTo(-0.55, 6);
    expect(sheetPose(0.3, DIALS).curl).toBeCloseTo(-0.275, 6);
  });

  it('is flat well before the hand-off, and stays flat', () => {
    // THE constraint: a bend still resolving at the swap is a shape the flat
    // HTML cannot match, so the crossfade would have to hide it and cannot.
    for (let p = 0.6; p <= 1.0001; p += 0.05) {
      expect(sheetPose(p, DIALS).curl).toBeCloseTo(0, 9);
    }
  });

  it('keeps the bend SIGNED — it is a direction, not a magnitude', () => {
    for (let p = 0; p < 0.6; p += 0.05) expect(sheetPose(p, DIALS).curl).toBeLessThan(0);
  });

  it('lands exactly on the page, about its own centre', () => {
    const end = sheetPose(1, DIALS);
    expect(end.scale).toBeCloseTo(1, 9);
    expect(end.rotationZ).toBeCloseTo(0, 9);
    expect(end.curl).toBeCloseTo(0, 9);
    expect(end.y).toBeCloseTo(0, 9);
    expect(end.opacity).toBe(1);
    expect([end.pivotX, end.pivotY]).toEqual([0, 0]);
  });

  it('follows the pointer, which the tear does not', () => {
    expect(sheetPose(0.5, DIALS).pointer).toBe(true);
  });
});

describe('tearPose — the sticky-note peel', () => {
  const at = (p: number) => tearPose(p, DIALS);

  it('starts EXACTLY where the page is: flat, full size, unmoved', () => {
    // The reverse hand-off is a crossfade against the live page, so the first
    // frame of a tear has to be the page's own rect to the pixel.
    const start = at(0);
    expect(start.curl).toBe(0);
    expect(start.scale).toBe(1);
    expect(start.rotationZ).toBe(0);
    expect(start.y).toBe(0);
    expect(start.opacity).toBe(1);
    expect(start.kind).toBe('tail');
  });

  it('lifts the free corner before anything translates', () => {
    // A peel starts as a bend, not as a move: the pinned corner is holding.
    const lift = at(0.15);
    expect(lift.curl).toBeCloseTo(0.45, 6);
    expect(lift.curlOrigin).toBeCloseTo(0.08, 6);
    expect(lift.rotationZ).toBe(0);
    expect(lift.y).toBe(0);
    expect(lift.scale).toBe(1);
  });

  it('bends TOWARD the viewer, which the entrance does not', () => {
    for (const p of [0.2, 0.4, 0.6, 0.9]) expect(at(p).curl).toBeGreaterThan(0);
  });

  it('travels the fold across the sheet toward the pinned corner', () => {
    expect(at(0.15).curlOrigin).toBeCloseTo(0.08, 6);
    expect(at(0.6).curlOrigin).toBeCloseTo(0.53, 6);
    expect(at(1).curlOrigin).toBeCloseTo(0.53, 6);
    // Monotonic: a fold that went backwards would be the sheet re-sticking
    // halfway through coming off.
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const o = at(p).curlOrigin;
      expect(o).toBeGreaterThanOrEqual(last - 1e-9);
      last = o;
    }
  });

  it('peaks the bend mid-travel and lets it spring back when it comes free', () => {
    expect(at(0.4).curl).toBeCloseTo(0.6, 6);
    expect(at(0.6).curl).toBeCloseTo(0.6, 6);
    expect(at(0.8).curl).toBeCloseTo(0.2, 6);
    expect(at(1).curl).toBeCloseTo(0.2, 6);
  });

  it('turns about the PINNED corner, and keeps that pivot after it lets go', () => {
    for (const p of [0, 0.3, 0.6, 1]) {
      expect([at(p).pivotX, at(p).pivotY]).toEqual([-0.5, 0.5]);
    }
    expect(at(0.6).rotationZ).toBeCloseTo(-12, 6);
    expect(at(0.8).rotationZ).toBeCloseTo(-18, 6);
  });

  it('lifts a little while it is held and a lot once it is not', () => {
    expect(at(0.15).y).toBe(0);
    expect(at(0.6).y).toBeCloseTo(0.12, 6);
    expect(at(0.8).y).toBeCloseTo(0.9, 6);
    expect(at(0.6).scale).toBe(1);
    expect(at(0.8).scale).toBeCloseTo(0.85, 6);
  });

  it('fades over the last tenth ONLY — it is off the frame before it goes', () => {
    for (let p = 0; p <= 0.9; p += 0.05) expect(at(p).opacity).toBe(1);
    expect(at(0.95).opacity).toBeCloseTo(0.5, 6);
    expect(at(1).opacity).toBe(0);
  });

  it('rolls at a right angle to the fold line, toward the pinned corner', () => {
    // `peelAngle` is measured the way a CSS rotation is — clockwise from
    // horizontal — so −35° on screen is a fold running up to the right, and the
    // peel travels up and to the LEFT across it.
    const axis = (at(0.5).curlAxis * Math.PI) / 180;
    expect(Math.cos(axis)).toBeLessThan(0);
    expect(Math.sin(axis)).toBeGreaterThan(0);
    expect(at(0.5).curlAxis).toBeCloseTo(125, 6);
  });

  it('ignores the pointer throughout', () => {
    for (const p of [0, 0.5, 1]) expect(at(p).pointer).toBe(false);
  });

  it('creases the free corner rather than bulging it', () => {
    for (const p of [0, 0.15, 0.5, 1]) expect(at(p).curlWrap).toBe(2.4);
  });

  it('is smooth at every joint — no corner in the scroll mapping', () => {
    // Each window is eased in and out, so the four movements read as one
    // gesture. A jump in the first difference is a jolt under the wheel.
    const step = 0.002;
    const d = (f: (p: number) => number, p: number) => (f(p + step) - f(p - step)) / (2 * step);
    for (const p of [DIALS.peelLiftAt, DIALS.peelTravelAt, DIALS.peelFreeAt]) {
      expect(Math.abs(d((q) => at(q).curlOrigin, p))).toBeLessThan(4);
      expect(Math.abs(d((q) => at(q).y, p))).toBeLessThan(8);
      expect(Math.abs(d((q) => at(q).rotationZ, p))).toBeLessThan(80);
    }
  });
});

describe('the settle', () => {
  const t = THREE();

  it('says nothing on a vertical run', () => {
    expect(settleAt(t, 600)).toBeNull();
  });

  it('finishes a half-done TEAR to its nearer end', () => {
    const from = bottomOf(t, 0);
    const to = dwellStart(t, 0);
    expect(settleAt(t, from + EXIT * 0.25)).toMatchObject({ target: from, reversible: true });
    expect(settleAt(t, from + EXIT * 0.75)).toMatchObject({ target: to, reversible: true });
    expect(settleAt(t, from + EXIT * 0.5)?.p).toBeCloseTo(0.5, 6);
  });

  it('lands a tear on a page or on empty ground, never mid-peel', () => {
    const plan = settleAt(t, bottomOf(t, 0) + EXIT * 0.75)!;
    expect(layout(t, plan.target, DIALS).sheet).toBeNull();
  });

  it('always runs a DWELL forward, to the next page', () => {
    // Empty ground is a beat you pass through rather than a place to sit, and
    // the only thing on the far side of it is the next page. "Back to the start
    // of the dwell" would leave the reader staring at nothing; "on to the start
    // of the next entrance" would leave them looking at a rolled sheet.
    for (const q of [0.25, 0.5, 0.75]) {
      const plan = settleAt(t, dwellStart(t, 0) + DWELL * q)!;
      expect(plan.target).toBe(t.start[1]);
      expect(plan.reversible).toBe(false);
    }
  });

  it('treats the dwell and the entrance after it as ONE move', () => {
    const from = dwellStart(t, 0);
    const to = t.start[1];
    // A hair past the boundary at either end: the last half-pixel of the tear
    // belongs to the tear, and the first of the next page to the page.
    expect(settleAt(t, from + 1)?.p).toBeCloseTo(1 / (DWELL + ENTER), 6);
    expect(settleAt(t, to - 1)?.p).toBeCloseTo(1 - 1 / (DWELL + ENTER), 6);
    expect(settleAt(t, from + (DWELL + ENTER) / 2)?.p).toBeCloseTo(0.5, 6);
  });

  it('gives the view’s own entrance nothing behind it to go back to', () => {
    const plan = settleAt(t, -ENTER / 2)!;
    expect(plan.p).toBeCloseTo(0.5, 6);
    expect(plan.target).toBe(0);
  });

  it('never lands anywhere with a sheet in mid-air', () => {
    // The whole point of the thing: every target is either a page or the empty
    // ground a tear finishes on, and neither has a sheet part-way through a
    // move on it.
    for (let y = minPosition(t); y <= maxPosition(t); y += 23) {
      const plan = settleAt(t, y);
      if (!plan) continue;
      expect(layout(t, plan.target, DIALS).sheet).toBeNull();
    }
  });
});

describe('positionOf / bottomOf — where a letterhead click goes', () => {
  const t = THREE();

  it('lands on the section’s page, at its top', () => {
    for (let k = 0; k < 3; k++) {
      expect(positionAt(t, positionOf(t, k))).toMatchObject({
        section: k,
        segment: 'page',
        offset: 0,
      });
    }
  });

  it('clamps a nonsense index rather than returning undefined', () => {
    expect(positionOf(t, -4)).toBe(t.start[0]);
    expect(positionOf(t, 99)).toBe(t.start[2]);
    expect(bottomOf(t, 99)).toBe(maxPosition(t));
  });
});
