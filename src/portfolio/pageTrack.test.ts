import { describe, expect, it } from 'vitest';
import {
  bottomOf,
  buildTrack,
  fitTabHeight,
  glassClipPath,
  tabTopFor,
  layout,
  maxPosition,
  positionAt,
  positionOf,
  resolve,
} from './pageTrack';
import type { TrackMetrics } from './pageTrack';

/** A five-section project at a common laptop viewport. */
const metrics = (over: Partial<TrackMetrics> = {}): TrackMetrics => ({
  heights: [1800, 3600, 2700, 4500, 1350],
  viewportHeight: 900,
  turnDistance: 720,
  ...over,
});

const TURN = 720;

describe('buildTrack', () => {
  it('gives each section a vertical run of its overflow, then one turn', () => {
    const t = buildTrack(metrics());
    expect(t.pageScroll).toEqual([900, 2700, 1800, 3600, 450]);
    expect(t.start).toEqual([
      0,
      900 + TURN,
      900 + TURN + 2700 + TURN,
      900 + TURN + 2700 + TURN + 1800 + TURN,
      900 + TURN + 2700 + TURN + 1800 + TURN + 3600 + TURN,
    ]);
  });

  it('a section shorter than the viewport still has a segment, just no scroll', () => {
    const t = buildTrack(metrics({ heights: [400, 2000] }));
    expect(t.pageScroll[0]).toBe(0);
    expect(t.start[1]).toBe(TURN); // straight into the turn
  });

  it('ends one viewport past the last section, so it reaches its bottom', () => {
    const t = buildTrack(metrics());
    expect(t.length).toBe(t.start[4] + 450 + 900);
    expect(maxPosition(t)).toBe(t.start[4] + 450);
  });

  it('a single-section project is just that section, with no turn', () => {
    const t = buildTrack(metrics({ heights: [2700] }));
    expect(t.start).toEqual([0]);
    expect(t.length).toBe(1800 + 900);
    expect(maxPosition(t)).toBe(1800);
  });

  it('spends the same scroll on a turn whatever the page is wide', () => {
    // The turn is its own dial now: it is a page sliding over a page, and how
    // far the wheel has to travel to do it is not the page's width.
    const narrow = buildTrack(metrics({ turnDistance: 400 }));
    expect(narrow.start[1]).toBe(900 + 400);
  });
});

describe('layout', () => {
  const track = buildTrack(metrics());

  it('scrolls a section in place with nothing turning', () => {
    const l = layout(track, 600);
    expect(l.topIndex).toBe(0);
    expect(l.activeIndex).toBe(0);
    expect(l.turning).toBe(false);
    expect(l.scrollTop).toEqual([600, 0, 0, 0, 0]);
    // Section 0 at rest; section 1 waiting off to the right; the rest parked.
    expect(l.translateX).toEqual([0, 100, 100, 100, 100]);
    // Only the section being read paints — nothing is waiting in view.
    expect(l.visible).toEqual([true, false, false, false, false]);
  });

  it('turns the next section in 1:1 with the scroll, over a stack that holds', () => {
    const quarter = layout(track, track.pageScroll[0] + TURN * 0.25);
    expect(quarter.turning).toBe(true);
    expect(quarter.progress).toBeCloseTo(0.25, 6);
    expect(quarter.translateX[1]).toBeCloseTo(75, 6);
    expect(quarter.translateX[0]).toBe(0); // the covered section does not move
    // The section being covered is frozen at its bottom; the incoming one is
    // at its top.
    expect(quarter.scrollTop).toEqual([900, 0, 0, 0, 0]);
  });

  it('puts the incoming section on top the instant the turn starts', () => {
    const early = layout(track, track.pageScroll[0] + 1);
    expect(early.topIndex).toBe(1);
    // …but you are still IN section 0 until the half-way point.
    expect(early.activeIndex).toBe(0);
    expect(early.zIndex[1]).toBeGreaterThan(early.zIndex[0]);
  });

  it('hands the section over at the half-way point', () => {
    const before = layout(track, track.pageScroll[0] + TURN * 0.49);
    const after = layout(track, track.pageScroll[0] + TURN * 0.51);
    expect(before.activeIndex).toBe(0);
    expect(after.activeIndex).toBe(1);
  });

  it('hands the turn over to the next vertical segment with no jump', () => {
    const before = layout(track, track.start[1] - 0.001);
    const after = layout(track, track.start[1]);
    expect(before.translateX[1]).toBeCloseTo(0, 2);
    expect(after.translateX[1]).toBe(0);
    expect(after.turning).toBe(false);
    expect(after.activeIndex).toBe(1);
  });

  it('keeps every finished section stacked at rest, frozen at its bottom', () => {
    const l = layout(track, track.start[3] + 100);
    expect(l.activeIndex).toBe(3);
    expect(l.translateX).toEqual([0, 0, 0, 0, 100]);
    expect(l.scrollTop).toEqual([900, 2700, 1800, 100, 0]);
    // The three underneath are COVERED, and a covered section must not paint:
    // the glass above it would blur it in and its title would ghost through.
    expect(l.visible).toEqual([false, false, false, true, false]);
  });

  it('paints the pair a turn involves, and only that pair', () => {
    const mid = layout(track, track.start[1] + track.pageScroll[1] + TURN * 0.4);
    expect(mid.turning).toBe(true);
    // Turning 1 → 2: section 1 is still under section 2, so both paint. Section
    // 0 is covered by section 1 and must not.
    expect(mid.visible).toEqual([false, true, true, false, false]);
  });

  it('un-covers a section the instant the one above it starts to leave', () => {
    const atRest = layout(track, track.start[2]);
    expect(atRest.visible).toEqual([false, false, true, false, false]);
    // A hair back into the turn that brought section 2 in, and section 1 is
    // painting again — which is what makes a rewind un-cover the stack in order.
    const rewinding = layout(track, track.start[2] - 1);
    expect(rewinding.turning).toBe(true);
    expect(rewinding.visible).toEqual([false, true, true, false, false]);
  });

  it('orders sections by index, so a later one always covers an earlier one', () => {
    const l = layout(track, track.start[2] + 50);
    for (let j = 1; j < l.zIndex.length; j++) {
      expect(l.zIndex[j]).toBeGreaterThan(l.zIndex[j - 1]);
    }
  });

  it('un-turns through the same mapping when the position goes back', () => {
    const back = layout(track, 200);
    expect(back.activeIndex).toBe(0);
    expect(back.translateX).toEqual([0, 100, 100, 100, 100]);
    expect(back.scrollTop).toEqual([200, 0, 0, 0, 0]);
    expect(back.visible).toEqual([true, false, false, false, false]);
  });

  it('has no turn at all for a single-section project', () => {
    const one = buildTrack(metrics({ heights: [2700] }));
    for (const y of [0, 900, maxPosition(one)]) {
      const l = layout(one, y);
      expect(l.turning).toBe(false);
      expect(l.topIndex).toBe(0);
      expect(l.translateX).toEqual([0]);
      expect(l.visible).toEqual([true]);
    }
  });

  it('clamps out-of-range positions rather than reporting a phantom section', () => {
    expect(layout(track, -500).activeIndex).toBe(0);
    expect(layout(track, 1e9).activeIndex).toBe(4);
    expect(layout(track, 1e9).scrollTop[4]).toBe(450);
  });
});

describe('positionOf / bottomOf', () => {
  const track = buildTrack(metrics());

  it('lands a deep link (and a tab click) at a section’s top', () => {
    expect(positionOf(track, 0)).toBe(0);
    expect(positionOf(track, 3)).toBe(track.start[3]);
    const l = layout(track, positionOf(track, 3));
    expect(l.activeIndex).toBe(3);
    expect(l.turning).toBe(false);
    expect(l.scrollTop[3]).toBe(0);
    expect(l.translateX).toEqual([0, 0, 0, 0, 100]);
  });

  it('lands the `bottom` dial where the section was left', () => {
    const y = bottomOf(track, 1);
    expect(y).toBe(track.start[1] + track.pageScroll[1]);
    const l = layout(track, y);
    expect(l.activeIndex).toBe(1);
    expect(l.turning).toBe(false);
    expect(l.scrollTop[1]).toBe(track.pageScroll[1]);
  });

  it('holds the section at a sub-pixel wobble around its bottom', () => {
    // Lenis settles on a float; a hair past the boundary must not read as a turn.
    const y = bottomOf(track, 1);
    for (const eps of [-0.4, -0.05, 0, 0.05, 0.4]) {
      expect(layout(track, y + eps).turning).toBe(false);
      expect(layout(track, y + eps).activeIndex).toBe(1);
    }
  });

  it('clamps a section index outside the project', () => {
    expect(positionOf(track, -3)).toBe(0);
    expect(positionOf(track, 99)).toBe(track.start[4]);
  });
});

describe('positionAt / resolve', () => {
  const track = buildTrack(metrics());

  it('round-trips every kind of position', () => {
    for (const y of [0, 450, 900, 900 + 360, track.start[2] + 10, maxPosition(track)]) {
      expect(resolve(track, positionAt(track, y))).toBeCloseTo(y, 6);
    }
  });

  it('keeps the reader in place when a section grows under them', () => {
    const y = track.start[2] + 700;
    const at = positionAt(track, y);
    // Section 1 gains 1200px: every start behind it moves, so the same pixel
    // position is a different place — but the semantic one is not.
    const grown = buildTrack(metrics({ heights: [1800, 4800, 2700, 4500, 1350] }));
    const y2 = resolve(grown, at);
    expect(layout(grown, y2).activeIndex).toBe(2);
    expect(layout(grown, y2).scrollTop[2]).toBe(700);
    expect(y2).toBe(y + 1200);
    // Whereas keeping the pixel position would have put them back in section 1.
    expect(layout(grown, y).activeIndex).toBe(1);
  });

  it('keeps the reader in place when the section they are on shrinks', () => {
    const at = positionAt(track, track.start[1] + 2600);
    const shrunk = buildTrack(metrics({ heights: [1800, 1200, 2700, 4500, 1350] }));
    const y = resolve(shrunk, at);
    expect(layout(shrunk, y).activeIndex).toBe(1);
    // Past the new bottom, so it holds there rather than spilling into the turn.
    expect(layout(shrunk, y).scrollTop[1]).toBe(shrunk.pageScroll[1]);
    expect(layout(shrunk, y).turning).toBe(false);
  });

  it('keeps a mid-turn position mid-turn', () => {
    const at = positionAt(track, track.pageScroll[0] + TURN * 0.4);
    expect(at).toEqual({ section: 0, offset: 900, turn: 0.4 });
    const grown = buildTrack(metrics({ heights: [3000, 3600, 2700, 4500, 1350] }));
    const l = layout(grown, resolve(grown, at));
    expect(l.turning).toBe(true);
    expect(l.progress).toBeCloseTo(0.4, 6);
  });

  it('drops a turn that no longer exists rather than overshooting', () => {
    const at = positionAt(track, track.start[3] + track.pageScroll[3] + TURN * 0.5);
    expect(at.turn).toBeCloseTo(0.5, 6);
    // The project loses its last section: there is nothing left to turn in.
    const shorter = buildTrack(metrics({ heights: [1800, 3600, 2700, 4500] }));
    const y = resolve(shorter, at);
    expect(y).toBe(maxPosition(shorter));
    expect(layout(shorter, y).turning).toBe(false);
  });
});

describe('fitTabHeight', () => {
  it('keeps the preferred height when the column has room', () => {
    expect(fitTabHeight(132, 5, 900, 0, 6)).toBe(132);
  });

  it('shrinks the tabs rather than scrolling the column', () => {
    // Eight tabs at 132 + 6 gap needs 1098px; a 900px viewport has not got it.
    const h = fitTabHeight(132, 8, 900, 0, 6);
    expect(h).toBeLessThan(132);
    expect(8 * h + 7 * 6).toBeCloseTo(900, 6);
  });

  it('accounts for the offset the first tab starts at', () => {
    const h = fitTabHeight(132, 8, 900, 40, 6);
    expect(40 + 8 * h + 7 * 6).toBeCloseTo(900, 6);
  });

  it('never returns a height a tab could not be drawn at', () => {
    expect(fitTabHeight(132, 400, 900, 0, 6)).toBeGreaterThan(0);
  });
});

describe('glassClipPath', () => {
  const opts = { tabWidth: 64, pageWidth: 720, viewportHeight: 900, flapTop: 138, flapHeight: 132 };

  it('traces the page and the flap as ONE subpath — one sheet of glass', () => {
    const d = glassClipPath(opts);
    // A single `M`: two subpaths would be two shapes, and `backdrop-filter`
    // would seam between them.
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).toContain('M 64 0'); // the page's top-left, at the tab column's width
    expect(d).toContain('H 784'); // …out to the page's right edge
    expect(d).toContain('V 900'); // …down to the viewport's bottom
  });

  it('puts the flap exactly where the tab column puts it', () => {
    const d = glassClipPath(opts);
    expect(d).toContain('V 270 H 10'); // the flap's bottom edge, 138 + 132
    expect(d).toContain('V 148'); // …up to its top plus the corner radius
  });

  it('rounds only the two outer corners, leaving the junction square', () => {
    const d = glassClipPath(opts);
    expect(d.match(/A 10 10 0 0 1/g)).toHaveLength(2);
    // The path returns to the junction (x = tabWidth) and closes there, so the
    // page-to-flap edge is a straight line with nothing drawn on it.
    expect(d.endsWith("H 64 Z')")).toBe(true);
  });

  it('falls back to the page alone when there is no flap to include', () => {
    const d = glassClipPath({ ...opts, flapHeight: 0 });
    expect(d).toBe("path('M 64 0 H 784 V 900 H 64 Z')");
    expect(d.match(/A /g)).toBeNull();
  });

  it('lays tabs out from the top, gap by gap', () => {
    expect(tabTopFor(0, 0, 132, 6)).toBe(0);
    expect(tabTopFor(1, 0, 132, 6)).toBe(138);
    expect(tabTopFor(3, 40, 100, 8)).toBe(40 + 3 * 108);
  });
});
