import { describe, expect, it } from 'vitest';
import {
  bottomOf,
  buildTrack,
  layout,
  maxPosition,
  positionAt,
  positionOf,
  resolve,
} from './pageTrack';
import type { TrackMetrics } from './pageTrack';

/** The reference measurements from halfof8.com at 2560x1352. */
const REFERENCE: TrackMetrics = {
  heights: [3000, 6000, 4000],
  viewportWidth: 2560,
  viewportHeight: 1352,
  pageWidth: 1129,
  sliverWidth: 358,
};

/** A three-page project at a common laptop viewport. */
const metrics = (over: Partial<TrackMetrics> = {}): TrackMetrics => ({
  heights: [2250, 4500, 2700],
  viewportWidth: 1440,
  viewportHeight: 900,
  pageWidth: 0.44 * 1440,
  sliverWidth: 0.14 * 1440,
  ...over,
});

describe('buildTrack', () => {
  it('gives each page a vertical run of its overflow, then one page of slide', () => {
    const t = buildTrack(metrics());
    expect(t.pageScroll).toEqual([1350, 3600, 1800]);
    expect(t.start).toEqual([0, 1350 + 633.6, 1350 + 633.6 + 3600 + 633.6]);
  });

  it('a page shorter than the viewport still has a segment, just no scroll', () => {
    const t = buildTrack(metrics({ heights: [400, 2000] }));
    expect(t.pageScroll[0]).toBe(0);
    expect(t.start[1]).toBe(633.6); // straight into the slide
  });

  it('ends one viewport past the last page, so the last page reaches its bottom', () => {
    const t = buildTrack(metrics());
    expect(t.length).toBe(t.start[2] + 1800 + 900);
    expect(maxPosition(t)).toBe(t.start[2] + 1800);
  });

  it('a single-page project is just that page, with no slide', () => {
    const t = buildTrack(metrics({ heights: [2700] }));
    expect(t.start).toEqual([0]);
    expect(t.length).toBe(1800 + 900);
    expect(maxPosition(t)).toBe(1800);
  });

  it('rests the stack at the reference offsets (2560 wide, W 1129, S 358)', () => {
    const t = buildTrack(REFERENCE);
    // Spec: page 0 at -716, page 1 at -1487 (both quoted rounded).
    expect(t.rest[0]).toBeCloseTo(-715.5, 1);
    expect(t.rest[1]).toBeCloseTo(-1486.75, 1);
  });

  it('lands a resting page with its left edge at exactly j * sliver', () => {
    const t = buildTrack(REFERENCE);
    for (let j = 0; j < 3; j++) {
      // A page's untranslated left edge is `gutter + j * pageWidth`.
      const left = t.gutter + j * t.pageWidth + t.rest[j];
      expect(left).toBeCloseTo(j * t.sliver, 6);
    }
  });

  it('shrinks the sliver so the stack fits the gutter, never widening it', () => {
    const six = buildTrack(metrics({ heights: [1000, 1000, 1000, 1000, 1000, 1000] }));
    const gutter = (1440 - 633.6) / 2; // 403.2
    expect(six.gutter).toBeCloseTo(gutter, 6);
    expect(six.sliver).toBeCloseTo(gutter / 5, 6); // 80.64
    expect(six.sliver).toBeLessThan(0.14 * 1440); // below the preferred 14vw
    // The last page to stack (index 5) lands exactly on the gutter's edge.
    expect(5 * six.sliver).toBeCloseTo(gutter, 6);
  });

  it('keeps the preferred sliver when the gutter is roomy enough', () => {
    const two = buildTrack(metrics({ heights: [1000, 1000] }));
    expect(two.sliver).toBeCloseTo(0.14 * 1440, 6);
  });
});

describe('layout', () => {
  const track = buildTrack(metrics());
  const W = 633.6;

  it('scrolls page 0 in place while the row stays home', () => {
    const l = layout(track, 600);
    expect(l.activeIndex).toBe(0);
    expect(l.movingHorizontal).toBe(false);
    expect(l.scrollTop).toEqual([600, 0, 0]);
    expect(l.translateX[0]).toBe(0);
    expect(l.translateX[1]).toBe(0);
  });

  it('moves the row 1:1 with the scroll through the slide', () => {
    const mid = track.pageScroll[0] + W / 2;
    const l = layout(track, mid);
    expect(l.movingHorizontal).toBe(true);
    expect(l.activeIndex).toBe(1);
    // Future pages follow the row exactly.
    expect(l.translateX[2]).toBeCloseTo(-W / 2, 6);
    // The page being left is frozen at its bottom; the incoming one is at its top.
    expect(l.scrollTop).toEqual([1350, 0, 0]);
  });

  it('hands the slide over to the next vertical segment with no jump', () => {
    const before = layout(track, track.start[1] - 0.001);
    const after = layout(track, track.start[1]);
    expect(after.translateX[2]).toBeCloseTo(before.translateX[2], 2);
    expect(after.translateX[2]).toBeCloseTo(-W, 6);
    expect(after.activeIndex).toBe(1);
    expect(after.movingHorizontal).toBe(false);
  });

  it('clamps a finished page at its resting slot instead of carrying it off', () => {
    const onPage2 = layout(track, track.start[2] + 100);
    expect(onPage2.activeIndex).toBe(2);
    expect(onPage2.translateX[0]).toBeCloseTo(track.rest[0], 6);
    expect(onPage2.translateX[1]).toBeCloseTo(track.rest[1], 6);
    expect(onPage2.translateX[2]).toBeCloseTo(-2 * W, 6);
    // Stacked pages hold their bottom; the active one scrolls.
    expect(onPage2.scrollTop).toEqual([1350, 3600, 100]);
  });

  it('never pushes a page past its rest — the stack only ever tightens', () => {
    const end = layout(track, maxPosition(track));
    expect(end.translateX[0]).toBeCloseTo(track.rest[0], 6);
    expect(end.translateX[1]).toBeCloseTo(track.rest[1], 6);
  });

  it('un-stacks through the same mapping when the position goes back', () => {
    const back = layout(track, positionOf(track, 0) + 200);
    expect(back.activeIndex).toBe(0);
    expect(back.translateX).toEqual([0, 0, 0]);
    expect(back.scrollTop).toEqual([200, 0, 0]);
  });

  it('has no horizontal segment at all for a single-page project', () => {
    const one = buildTrack(metrics({ heights: [2700] }));
    for (const y of [0, 900, maxPosition(one)]) {
      const l = layout(one, y);
      expect(l.movingHorizontal).toBe(false);
      expect(l.activeIndex).toBe(0);
      expect(l.translateX).toEqual([0]);
    }
  });

  it('clamps out-of-range positions rather than reporting a phantom page', () => {
    expect(layout(track, -500).activeIndex).toBe(0);
    expect(layout(track, 1e9).activeIndex).toBe(2);
    expect(layout(track, 1e9).scrollTop[2]).toBe(1800);
  });
});

describe('positionOf', () => {
  const track = buildTrack(metrics());

  it('is the start of a page, so a deep link lands at its top', () => {
    expect(positionOf(track, 0)).toBe(0);
    expect(positionOf(track, 2)).toBe(track.start[2]);
    expect(layout(track, positionOf(track, 2)).activeIndex).toBe(2);
    expect(layout(track, positionOf(track, 2)).scrollTop[2]).toBe(0);
  });

  it('clamps a page index outside the project', () => {
    expect(positionOf(track, -3)).toBe(0);
    expect(positionOf(track, 99)).toBe(track.start[2]);
  });
});

describe('bottomOf', () => {
  const track = buildTrack(metrics());

  it('is the end of a page, so a sliver click lands where you left it', () => {
    const y = bottomOf(track, 0);
    expect(y).toBe(track.pageScroll[0]);
    const l = layout(track, y);
    // Back to reading page 0, at its bottom, with nothing stacked any more.
    expect(l.activeIndex).toBe(0);
    expect(l.movingHorizontal).toBe(false);
    expect(l.scrollTop[0]).toBe(track.pageScroll[0]);
    expect(l.translateX).toEqual([0, 0, 0]);
  });

  it('is exactly the position the next page\u2019s slide starts from', () => {
    for (let k = 0; k + 1 < track.start.length; k++) {
      expect(bottomOf(track, k)).toBeLessThan(track.start[k + 1]);
      expect(layout(track, bottomOf(track, k) + 4).movingHorizontal).toBe(true);
    }
  });

  it('holds the page at a sub-pixel wobble around its bottom', () => {
    // A smoothed scroll settles a hair either side of the boundary; the active
    // page must not flicker between two there.
    for (const nudge of [-0.2, 0, 0.2, 0.4]) {
      const l = layout(track, bottomOf(track, 1) + nudge);
      expect(l.activeIndex).toBe(1);
      expect(l.movingHorizontal).toBe(false);
    }
  });
});

describe('positionAt / resolve (carrying the reader across a rebuild)', () => {
  it('keeps the page and the offset when the heights change under you', () => {
    const before = buildTrack(metrics());
    const y = before.start[1] + 800; // 800px down page 2
    const at = positionAt(before, y);
    expect(at).toEqual({ page: 1, offset: 800, slide: null });

    // Page 1 grows by 900 and page 2 by 400 — every start behind them moves.
    const after = buildTrack(metrics({ heights: [2250 + 900, 4500 + 400, 2700] }));
    const y2 = resolve(after, at);

    expect(y2).not.toBe(y); // the PIXEL position genuinely moved
    expect(positionAt(after, y2)).toEqual(at); // the SEMANTIC one did not
    expect(layout(after, y2).activeIndex).toBe(layout(before, y).activeIndex);
    expect(layout(after, y2).scrollTop[1]).toBe(800);
  });

  it('keeps slide progress across a rebuild', () => {
    const before = buildTrack(metrics());
    const y = before.start[0] + before.pageScroll[0] + 0.25 * before.pageWidth;
    const at = positionAt(before, y);
    expect(at.page).toBe(0);
    expect(at.slide).toBeCloseTo(0.25, 6);

    const after = buildTrack(metrics({ heights: [3400, 4500, 2700] }));
    const y2 = resolve(after, at);
    const l = layout(after, y2);
    expect(l.movingHorizontal).toBe(true);
    expect(l.activeIndex).toBe(1);
    expect(l.translateX[2]).toBeCloseTo(-0.25 * after.pageWidth, 4);
  });

  it('lands at the bottom of a page that shrank past where you were', () => {
    const before = buildTrack(metrics());
    const at = positionAt(before, before.start[1] + 3000);
    const after = buildTrack(metrics({ heights: [2250, 1400, 2700] })); // page 2 now barely scrolls
    const y2 = resolve(after, at);
    expect(positionAt(after, y2)).toEqual({ page: 1, offset: after.pageScroll[1], slide: null });
  });

  it('round-trips every position on an unchanged track', () => {
    const track = buildTrack(metrics());
    for (let y = 0; y <= maxPosition(track); y += 137) {
      expect(resolve(track, positionAt(track, y))).toBeCloseTo(y, 6);
    }
  });

  it('drops a slide that has no page left to slide to', () => {
    const track = buildTrack(metrics({ heights: [2250] }));
    expect(resolve(track, { page: 0, offset: 1350, slide: 0.5 })).toBe(maxPosition(track));
  });
});
