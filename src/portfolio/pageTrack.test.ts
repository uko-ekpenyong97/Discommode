import { describe, expect, it } from 'vitest';
import {
  SEGMENT_EPSILON,
  bottomOf,
  buildTrack,
  enterWindow,
  exitPose,
  layout,
  maxPosition,
  minPosition,
  positionAt,
  positionOf,
  resolve,
  settleTarget,
  sheetPose,
  turnAt,
} from './pageTrack';
import type { PoseDials, Track } from './pageTrack';

/**
 * The whole model, in node. `pageTrack` is the one file in the view with no
 * DOM in it, which is what makes the three segments testable at all — and the
 * segments are where every ambiguity lives: a boundary, an overlap, and a
 * position that has to survive a rebuild.
 */

const PAGE_HEIGHT = 800;
const ENTER = 900;
const EXIT = 600;
const OVERLAP = 0.35;

/** The shipped dials, so the poses are tested against the numbers that ship. */
const DIALS: PoseDials = {
  startRotation: -45,
  rotationEndAt: 0.16,
  scaleBase: 0.41,
  scaleTargetAt: 0.22,
  curlOutAt: 0.6,
  riseFrom: -0.51,
  exitScale: 0.58,
  exitRotate: 16,
  exitRise: -0.3,
  exitFadeFrom: 0.7,
};

function track(heights: number[], pageHeight = PAGE_HEIGHT): Track {
  return buildTrack({
    heights,
    pageHeight,
    enterDistance: ENTER,
    exitDistance: EXIT,
    enterOverlap: OVERLAP,
  });
}

/** Three sections: one long, one short enough to have no vertical run at all,
 *  one long again. The short one is the case the model has to reduce to. */
const THREE = () => track([2000, 500, 1400]);

describe('buildTrack', () => {
  it('measures each section against the page, and floors at zero', () => {
    const t = THREE();
    expect(t.pageScroll).toEqual([1200, 0, 600]);
  });

  it('spaces the starts by an entrance, the run and an exit', () => {
    const t = THREE();
    expect(t.start[0]).toBe(0);
    expect(t.start[1]).toBe(ENTER + 1200 + EXIT);
    expect(t.start[2]).toBe(t.start[1] + ENTER + 0 + EXIT);
  });

  it('starts one entrance before zero and ends at the last run’s bottom', () => {
    const t = THREE();
    // The scroller cannot go negative; the intro tween drives the entrance and
    // hands over at 0.
    expect(minPosition(t)).toBe(-ENTER);
    expect(maxPosition(t)).toBe(t.start[2] + 600);
  });

  it('answers for a one-section project — no exit, no turn anywhere', () => {
    const t = track([2000]);
    expect(t.start).toEqual([0]);
    expect(maxPosition(t)).toBe(1200);
    expect(turnAt(t, 600)).toBeNull();
  });

  it('never leaves a section without a start, even given nothing', () => {
    const t = track([]);
    expect(t.start).toEqual([0]);
    expect(t.pageScroll).toEqual([0]);
  });
});

describe('positionAt — the three segments partition the track', () => {
  const t = THREE();

  it('reads an entrance, a run and an exit', () => {
    expect(positionAt(t, -450)).toMatchObject({ section: 0, segment: 'enter', p: 0.5 });
    expect(positionAt(t, 600)).toMatchObject({ section: 0, segment: 'page', offset: 600 });
    expect(positionAt(t, 1200 + 300)).toMatchObject({ section: 0, segment: 'exit', p: 0.5 });
  });

  it('hands over from one section’s exit to the next section’s entrance', () => {
    const boundary = t.start[1] - ENTER;
    expect(positionAt(t, boundary - 1).section).toBe(0);
    expect(positionAt(t, boundary - 1).segment).toBe('exit');
    expect(positionAt(t, boundary).section).toBe(1);
    expect(positionAt(t, boundary).segment).toBe('enter');
  });

  it('covers every position with exactly one segment', () => {
    for (let y = minPosition(t); y <= maxPosition(t); y += 37) {
      const at = positionAt(t, y);
      expect(at.section).toBeGreaterThanOrEqual(0);
      expect(['enter', 'page', 'exit']).toContain(at.segment);
    }
  });

  it('gives a section with no vertical run a page segment of its own', () => {
    // Section 1 is shorter than the frame, so `start[1]` is both the top and
    // the bottom of its run — and it is still a page, not a seam.
    const at = positionAt(t, t.start[1]);
    expect(at).toMatchObject({ section: 1, segment: 'page', offset: 0 });
  });
});

describe('the two half-pixel guards', () => {
  const t = THREE();

  it('holds a scroll settling on a run’s bottom out of the exit', () => {
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
});

describe('semantic position across a rebuild', () => {
  it('round-trips every segment against its own track', () => {
    const t = THREE();
    for (const y of [-450, 0, 600, 1200, 1500, t.start[1], t.start[2] - 200, maxPosition(t)]) {
      expect(resolve(t, positionAt(t, y))).toBeCloseTo(y, 6);
    }
  });

  it('keeps the reader where they were when a section behind them grows', () => {
    const before = THREE();
    const y = before.start[2] + 300;
    const held = positionAt(before, y);
    // Section 0 gets 400px taller: every start behind it moves, so the same
    // pixel position is a different place.
    const after = track([2400, 500, 1400]);
    expect(resolve(after, held)).toBe(after.start[2] + 300);
    expect(positionAt(after, resolve(after, held))).toMatchObject({ section: 2, offset: 300 });
  });

  it('puts a reader past the end of a shrunken section at its bottom', () => {
    const before = THREE();
    const held = positionAt(before, 1000); // 1000px down section 0
    const after = track([1100, 500, 1400]); // …which is now only 300 long
    expect(resolve(after, held)).toBe(300);
  });

  it('carries a part-done exit across, from the new bottom', () => {
    const before = THREE();
    const held = positionAt(before, bottomOf(before, 0) + EXIT * 0.4);
    expect(held).toMatchObject({ section: 0, segment: 'exit' });
    const after = track([2400, 500, 1400]);
    expect(resolve(after, held)).toBeCloseTo(bottomOf(after, 0) + EXIT * 0.4, 6);
  });
});

describe('enterWindow — the overlap', () => {
  const t = THREE();

  it('gives section 0 an entrance of its own length, and nothing in front', () => {
    expect(enterWindow(t, 0)).toEqual({ from: -ENTER, to: 0 });
  });

  it('starts every other sheet part-way through the previous page’s exit', () => {
    const w = enterWindow(t, 1);
    expect(w.from).toBe(bottomOf(t, 0) + OVERLAP * EXIT);
    expect(w.to).toBe(t.start[1]);
    // Longer than `enterDistance`, and by exactly the part of the exit it
    // reaches back into.
    expect(w.to - w.from).toBeCloseTo(ENTER + (1 - OVERLAP) * EXIT, 6);
  });
});

describe('layout — what is on screen', () => {
  const t = THREE();
  const at = (y: number) => layout(t, y, DIALS);

  it('shows one page and nothing else on a vertical run', () => {
    const l = at(600);
    expect(l.page).toMatchObject({ index: 0 });
    expect(l.page?.pose).toMatchObject({ scrollTop: 600, scale: 1, opacity: 1 });
    expect(l.sheet).toBeNull();
  });

  it('shows the leaving page alone before the overlap starts', () => {
    const l = at(bottomOf(t, 0) + EXIT * 0.2);
    expect(l.page?.index).toBe(0);
    expect(l.sheet).toBeNull();
  });

  it('shows both once the overlap starts — the new sheet behind the old page', () => {
    const l = at(bottomOf(t, 0) + EXIT * 0.5);
    expect(l.page?.index).toBe(0);
    expect(l.sheet?.index).toBe(1);
    expect(l.sheet?.pose.p).toBeGreaterThan(0);
  });

  it('shows the sheet alone once the exit is over', () => {
    const l = at(t.start[1] - ENTER * 0.5);
    expect(l.page).toBeNull();
    expect(l.sheet?.index).toBe(1);
  });

  it('never puts two live pages on screen', () => {
    for (let y = minPosition(t); y <= maxPosition(t); y += 13) {
      const l = at(y);
      if (l.page && l.sheet) expect(l.sheet.index).toBe(l.page.index + 1);
    }
  });

  it('commits the active section at the hand-off, not before', () => {
    // All the way through section 1's entrance you are still reading 0.
    expect(at(t.start[1] - 1).activeIndex).toBe(0);
    expect(at(t.start[1]).activeIndex).toBe(1);
    // …and it stays 1 for the whole of 1's exit.
    expect(at(bottomOf(t, 1) + EXIT * 0.9).activeIndex).toBe(1);
  });

  it('has no exit to fall into at the end of the last section', () => {
    const l = at(maxPosition(t));
    expect(l.page?.index).toBe(2);
    expect(l.segment).toBe('page');
  });
});

describe('sheetPose — the staggered windows', () => {
  it('stops tumbling first', () => {
    expect(sheetPose(0, DIALS).rotationZ).toBe(-45);
    expect(sheetPose(0.08, DIALS).rotationZ).toBeCloseTo(-22.5, 6);
    expect(sheetPose(0.16, DIALS).rotationZ).toBeCloseTo(0, 9);
    expect(sheetPose(0.9, DIALS).rotationZ).toBeCloseTo(0, 9);
  });

  it('reaches full size second', () => {
    expect(sheetPose(0, DIALS).scale).toBeCloseTo(0.41, 6);
    expect(sheetPose(0.22, DIALS).scale).toBeCloseTo(1, 6);
    expect(sheetPose(1, DIALS).scale).toBeCloseTo(1, 6);
  });

  it('is flat well before the hand-off, and stays flat', () => {
    // THE constraint: a curl still resolving at the swap is a shape the flat
    // HTML cannot match, so the crossfade would have to hide it and cannot.
    expect(sheetPose(0, DIALS).curl).toBe(-1);
    expect(sheetPose(0.3, DIALS).curl).toBeCloseTo(-0.5, 6);
    for (let p = 0.6; p <= 1.0001; p += 0.05) {
      expect(sheetPose(p, DIALS).curl).toBeCloseTo(0, 9);
    }
  });

  it('keeps the curl SIGNED — it is a direction, not a magnitude', () => {
    for (let p = 0; p < 0.6; p += 0.05) expect(sheetPose(p, DIALS).curl).toBeLessThan(0);
  });

  it('is still rising when everything else has settled', () => {
    expect(sheetPose(0, DIALS).y).toBeCloseTo(-0.51, 6);
    expect(sheetPose(0.5, DIALS).y).toBeCloseTo(-0.255, 6);
    expect(sheetPose(1, DIALS).y).toBeCloseTo(0, 9);
  });

  it('lands exactly on the page: scale 1, no rotation, no curl, no offset', () => {
    const end = sheetPose(1, DIALS);
    expect(end.rotationZ).toBeCloseTo(0, 9);
    expect(end.scale).toBeCloseTo(1, 9);
    expect(end.curl).toBeCloseTo(0, 9);
    expect(end.y).toBeCloseTo(0, 9);
  });
});

describe('exitPose — the page tilts away', () => {
  it('starts as the page and ends small, turned and gone', () => {
    const start = exitPose(0, 0, DIALS);
    expect(start.scale).toBeCloseTo(1, 9);
    expect(start.rotateZ).toBeCloseTo(0, 9);
    expect(start.translateY).toBeCloseTo(0, 9);
    expect(start.opacity).toBe(1);
    const end = exitPose(1, 0, DIALS);
    expect(end.scale).toBeCloseTo(0.58, 6);
    expect(end.rotateZ).toBeCloseTo(16, 6);
    expect(end.translateY).toBeCloseTo(-0.3, 6);
    expect(end.opacity).toBe(0);
  });

  it('holds the page solid until the last thirty per cent', () => {
    // Fading it from the start turns a sheet being taken away into a layer
    // being switched off.
    expect(exitPose(0.69, 0, DIALS).opacity).toBe(1);
    expect(exitPose(0.85, 0, DIALS).opacity).toBeCloseTo(0.5, 6);
  });

  it('holds the page at its own bottom while it leaves', () => {
    expect(exitPose(0.5, 1200, DIALS).scrollTop).toBe(1200);
  });
});

describe('the settle works on a TURN, not on a segment', () => {
  const t = THREE();

  it('says nothing on a vertical run', () => {
    expect(turnAt(t, 600)).toBeNull();
  });

  it('measures an exit and the entrance after it as one move', () => {
    const from = bottomOf(t, 0);
    // A hair past the bottom, because the bottom itself is still the PAGE —
    // that is the half-pixel guard doing its job.
    expect(turnAt(t, from + 1)).toMatchObject({ index: 0 });
    expect(turnAt(t, from + 1)?.p).toBeCloseTo(1 / (EXIT + ENTER), 6);
    expect(turnAt(t, from + (EXIT + ENTER) / 2)?.p).toBeCloseTo(0.5, 6);
    // …and a hair short of the far end, for the same reason at the other side.
    expect(turnAt(t, t.start[1] - 1)?.p).toBeCloseTo(1 - 1 / (EXIT + ENTER), 6);
    expect(turnAt(t, t.start[1])).toBeNull();
  });

  it('lands on a page at either end — never on the seam between the two', () => {
    const from = bottomOf(t, 0);
    // The boundary between the exit and the entrance is the one position with
    // nothing on screen but ground. Settling to "the nearer end of the exit"
    // would park the reader exactly there.
    const seam = t.start[1] - ENTER;
    const turn = turnAt(t, seam)!;
    expect(layout(t, seam, DIALS).page).toBeNull();
    expect(settleTarget(t, turn)).toBe(turn.p < 0.5 ? from : t.start[1]);
    expect(layout(t, settleTarget(t, turn), DIALS).page).not.toBeNull();
  });

  it('runs back before halfway and on after it', () => {
    expect(settleTarget(t, { index: 0, p: 0.2 })).toBe(bottomOf(t, 0));
    expect(settleTarget(t, { index: 0, p: 0.8 })).toBe(positionOf(t, 1));
  });

  it('treats the view’s own entrance as a half-turn with nothing behind it', () => {
    const turn = turnAt(t, -ENTER / 2)!;
    expect(turn.index).toBe(-1);
    expect(turn.p).toBeCloseTo(0.5, 6);
    expect(settleTarget(t, turn)).toBe(0);
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
