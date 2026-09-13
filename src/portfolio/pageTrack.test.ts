import { describe, expect, it } from 'vitest';
import {
  bottomOf,
  buildTrack,
  cabinetTop,
  columnOf,
  folderClipPath,
  layout,
  maxPosition,
  minPosition,
  pageFoot,
  pageTop,
  pileTop,
  positionAt,
  positionOf,
  resolve,
  rowCount,
  rowOf,
} from './pageTrack';
import type { TrackMetrics } from './pageTrack';

/** A six-folder project — three rows — at a common laptop viewport. */
const metrics = (over: Partial<TrackMetrics> = {}): TrackMetrics => ({
  heights: [1800, 3600, 2700, 4500, 1350, 2250],
  viewportHeight: 900,
  rowPitch: 130,
  tabHeight: 40,
  strip: 90,
  sheetWidth: 1000,
  splits: [0.5, 0.4],
  turnDistance: 720,
  ...over,
});

const TURN = 720;
const PITCH = 130;
const TAB = 40;
const STRIP = 90;
const W = 1000;
/** Where the columns divide: half way in an even row, 40% in an odd one. */
const SPLIT_EVEN = 500;
const SPLIT_ODD = 400;
/** A filed folder's slot: its own pitch, plus the tab of the row in front. */
const FILED = PITCH + TAB;
/** Where each column's page begins: a left folder's at its tab's lip, a right
 *  folder's under the strip its partner is docked in. */
const LEFT_PAGE = TAB - 1;

describe('rows and columns', () => {
  it('puts two folders in a row, even on the left', () => {
    expect([0, 1, 2, 3, 4, 5].map(rowOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('gives an odd count a half-empty last row', () => {
    expect(rowCount(7)).toBe(4);
    expect(rowCount(6)).toBe(3);
    expect(rowCount(1)).toBe(1);
  });

  it('steps rows by the pitch, from the top in the cabinet and the bottom in the pile', () => {
    // The cabinet starts one TAB down, not at zero: a folder's tab sticks up
    // above its body, and docking the first row flush would put it off the
    // sheet entirely.
    expect([0, 1, 2].map((r) => cabinetTop(TAB, PITCH, r))).toEqual([40, 170, 300]);
    expect([0, 1, 2].map((r) => pileTop(900, PITCH, 3, r))).toEqual([510, 640, 770]);
  });

  it('starts a page under the tab on the left and under the strip on the right', () => {
    // The left folder is alone in its row, so its page takes the whole width
    // from the tab's own lip; the right one has its partner docked beside it,
    // so the page starts below the strip and leaves that partner showing.
    expect(pageTop(TAB, STRIP, 0)).toBe(LEFT_PAGE);
    expect(pageTop(TAB, STRIP, 1)).toBe(STRIP);
    // …and never so high that it crosses the rounded corner of its own column.
    expect(pageTop(TAB, 10, 1)).toBe(TAB - 1 + 6);
  });

  it('alternates the column divide row by row', () => {
    expect(columnOf(0, 6, W, [0.5, 0.4])).toEqual({ left: 0, right: SPLIT_EVEN });
    expect(columnOf(1, 6, W, [0.5, 0.4])).toEqual({ left: SPLIT_EVEN, right: W });
    expect(columnOf(2, 6, W, [0.5, 0.4])).toEqual({ left: 0, right: SPLIT_ODD });
    expect(columnOf(3, 6, W, [0.5, 0.4])).toEqual({ left: SPLIT_ODD, right: W });
  });

  it('gives the whole row to a folder with no partner', () => {
    // Seven folders: the last one is alone in its row, and half a row of
    // nothing at the foot of the pile is both ugly and a hole.
    expect(columnOf(6, 7, W, [0.5, 0.4])).toEqual({ left: 0, right: W });
    expect(columnOf(6, 8, W, [0.5, 0.4])).toEqual({ left: 0, right: SPLIT_ODD });
  });
});

describe('pageFoot — where a page stops, per column', () => {
  const foot = (k: number) => buildTrack(metrics()).foot[k];

  it('stops at the tab of the first folder still piled in that column', () => {
    // Reading folder 0, its own partner is still piled in the right column one
    // row higher than anything left in the left one — so the page steps.
    expect(foot(0)).toEqual([
      { x: SPLIT_EVEN, y: 640 },
      { x: W, y: 510 },
    ]);
  });

  it('is flat when both columns start their pile in the same row', () => {
    expect(foot(1)).toEqual([{ x: W, y: 640 }]);
    expect(foot(3)).toEqual([{ x: W, y: 770 }]);
  });

  it('steps at the divide of the PILED row, not the reader’s own', () => {
    // Folder 2 is in an odd row (40%), but what is left in its left column is
    // folder 4, in an even one (50%) — and the step lands where folder 3's
    // column begins, because folder 3 is what fills the rest.
    expect(foot(2)).toEqual([
      { x: SPLIT_ODD, y: 770 },
      { x: W, y: 640 },
    ]);
  });

  it('runs to the foot of the sheet where a column has nothing left', () => {
    expect(foot(4)).toEqual([
      { x: SPLIT_EVEN, y: 900 },
      { x: W, y: 770 },
    ]);
    expect(foot(5)).toEqual([{ x: W, y: 900 }]);
  });

  it('leaves no corner under a partnerless last folder', () => {
    // Seven folders: the last row holds one, across the whole width — so both
    // folders of the row above stop a tab into it and nothing is left over.
    const seven = buildTrack(metrics({ heights: Array(7).fill(900) }));
    const l = layout(seven, positionOf(seven, 0));
    const P = (r: number) => pileTop(900, PITCH, 4, r);
    expect(l.folders[5].top).toBe(P(2));
    // Folder 6 spans the whole of row 3, so BOTH of row 2's folders stop a tab
    // into it and folder 6 itself takes the rest of the sheet.
    expect(l.folders[4].top + l.folders[4].clipHeight).toBe(P(3) + TAB);
    expect(l.folders[5].top + l.folders[5].clipHeight).toBe(P(3) + TAB);
    expect(l.folders[6].top + l.folders[6].clipHeight).toBe(900);
  });

  it('steps around a partnerless folder spanning its whole row', () => {
    // Seven folders: the last row holds one, across the full width. Reading
    // folder 4 leaves 5 (row 2, right half) and 6 (row 3, all of it) piled, so
    // the page stops at row 3 on the left and at row 2 on the right.
    const seven = buildTrack(metrics({ heights: Array(7).fill(900) }));
    expect(seven.foot[4]).toEqual([
      { x: SPLIT_EVEN, y: pileTop(900, PITCH, 4, 3) },
      { x: W, y: pileTop(900, PITCH, 4, 2) },
    ]);
  });

  it('is the pile MINUS the folder in the air, which is the next one’s foot', () => {
    // The identity the whole turn rests on: while `k + 1` is rising, what is
    // left in the pile under `k` is exactly what will be left under `k + 1`.
    const t = buildTrack(metrics());
    for (let k = 0; k + 1 < 6; k++) {
      expect(pageFoot(t, t.rows, 6, [...Array(5 - k)].map((_, i) => k + 2 + i))).toEqual(
        t.foot[k + 1],
      );
    }
  });
});

describe('buildTrack', () => {
  it('measures the open body against the SHALLOWEST column, not the deepest', () => {
    const t = buildTrack(metrics());
    // The content is a rectangle and the column of type straddles the divide,
    // so it can only fill the part of the page that is full width. The glass
    // goes deeper on one side; the words do not.
    expect(t.openBody[0]).toBe(510 - TAB - LEFT_PAGE);
    expect(t.openBody[1]).toBe(640 - TAB - STRIP);
    expect(t.openBody[2]).toBe(640 - (TAB + PITCH) - LEFT_PAGE);
    expect(t.openBody[3]).toBe(770 - (TAB + PITCH) - STRIP);
    expect(t.openBody[4]).toBe(770 - (TAB + 2 * PITCH) - LEFT_PAGE);
    expect(t.openBody[5]).toBe(900 - (TAB + 2 * PITCH) - STRIP);
    expect(t.openBody).toEqual(t.footMin.map((y, k) => y - cabinetTop(TAB, PITCH, rowOf(k)) - pageTop(TAB, STRIP, k)));
  });

  it('scrolls each folder by its overflow past its OWN body, then turns', () => {
    const t = buildTrack(metrics());
    expect(t.pageScroll[0]).toBe(1800 - 431);
    expect(t.pageScroll[1]).toBe(3600 - 510);
    expect(t.start[1]).toBe(1369 + TURN);
    expect(t.start[2]).toBe(1369 + TURN + 3090 + TURN);
  });

  it('a folder shorter than its body still has a segment, just no scroll', () => {
    const t = buildTrack(metrics({ heights: [200, 2000] }));
    expect(t.pageScroll[0]).toBe(0);
    expect(t.start[1]).toBe(TURN);
  });

  it('a single-folder project is just that folder, with no turn', () => {
    const t = buildTrack(metrics({ heights: [2700] }));
    expect(t.rows).toBe(1);
    expect(t.foot[0]).toEqual([{ x: W, y: 900 }]);
    expect(t.openBody[0]).toBe(900 - TAB - LEFT_PAGE);
    expect(t.start).toEqual([0]);
    expect(maxPosition(t)).toBe(2700 - (900 - TAB - LEFT_PAGE));
  });

  it('reaches one turn BEFORE the start, which is the entrance', () => {
    expect(minPosition(buildTrack(metrics()))).toBe(-TURN);
  });
});

describe('layout — the cabinet and the pile', () => {
  const track = buildTrack(metrics());

  it('docks what you have read and piles what you have not', () => {
    const l = layout(track, 400);
    expect(l.activeIndex).toBe(0);
    expect(l.turning).toBe(false);
    // Folder 0 docked at the top; its own partner and everything after it are
    // still in the pile, in their own rows.
    expect(l.folders.map((f) => f.top)).toEqual([TAB, 510, 640, 640, 770, 770]);
    // The open one paints its strip AND its page, down to the DEEPER of its two
    // columns; every filed one paints down to the body of the row in front, and
    // the pile's bottom row to the sheet.
    expect(l.folders[0].clipHeight).toBe(track.footMax[0] - TAB);
    expect(l.folders.slice(1).map((f) => f.clipHeight)).toEqual([
      FILED,
      FILED,
      FILED,
      // The last row of the pile has nothing in front of it: it stops at the
      // foot of the sheet, exactly.
      PITCH,
      PITCH,
    ]);
    expect(l.folders.map((f) => f.bodyVisible)).toEqual([true, false, false, false, false, false]);
  });

  it('leaves no glass between rows: a row reaches the BODY of the one in front', () => {
    // Which is the notch beside that row's tab filled in — the one place the
    // old rule left the backdrop showing through the middle of the cabinet.
    const l = layout(track, positionOf(track, 5));
    for (const [behind, front] of [
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
    ]) {
      expect(l.folders[behind].top + l.folders[behind].clipHeight).toBe(
        l.folders[front].top + TAB,
      );
    }
  });

  it('meets the pile exactly, column by column', () => {
    // The seam test, and the whole point of a stepped foot: over every x, the
    // page's bottom is the tab top of the first folder still piled there — no
    // band of backdrop under it, and no page running on under a folder.
    for (const k of [0, 1, 2, 3, 4, 5]) {
      const l = layout(track, positionOf(track, k));
      for (const x of [1, 200, 399, 401, 499, 501, 700, 999]) {
        const piled = track.foot[k].find((run) => x < run.x)!;
        const under = l.folders
          .map((f, j) => ({ j, f }))
          .filter(({ j }) => j > k)
          .filter(({ j }) => {
            const c = columnOf(j, 6, W, [0.5, 0.4]);
            return x > c.left && x < c.right;
          })
          .map(({ f }) => f.top);
        expect(piled.y).toBe(under.length > 0 ? Math.min(...under) : 900);
      }
    }
  });

  it('gives a RIGHT folder’s page its partner’s strip to sit beside', () => {
    // The right-hand parity is the one with a docked neighbour in its own row:
    // the page starts under the strip, and the partner is clipped to exactly
    // that, so the column beside the page is a folder and not glass.
    const l = layout(track, positionOf(track, 3));
    expect(l.folders[2].top).toBe(l.folders[3].top);
    expect(l.folders[2].clipHeight).toBe(STRIP);
    expect(l.folders[3].clipHeight).toBe(track.footMax[3] - (TAB + PITCH));
    expect(l.folders[2].top + l.folders[2].clipHeight).toBe(l.folders[3].top + STRIP);
  });

  it('gives a LEFT folder’s page the whole row, its partner still in the pile', () => {
    const l = layout(track, positionOf(track, 2));
    // Nothing else is docked in row 1, so the page covers both columns from the
    // tab's lip down — and it reaches PAST folder 3, which has not moved and
    // which paints over the far column.
    expect(l.folders[2].clipHeight).toBe(track.footMax[2] - (TAB + PITCH));
    expect(l.folders[3].top).toBe(pileTop(900, PITCH, 3, 1));
    expect(l.folders[3].top).toBeLessThan(l.folders[2].top + l.folders[2].clipHeight);
    expect(l.folders[3].zIndex).toBeGreaterThan(l.folders[2].zIndex);
  });

  it('leaves a half-filled cabinet row while only the left folder has risen', () => {
    const l = layout(track, positionOf(track, 2));
    // Folders 0 and 1 docked in row 0; 2 docked alone in row 1; 3 still piled.
    expect(l.folders.map((f) => f.top)).toEqual([TAB, TAB, TAB + 130, 640, 770, 770]);
    expect(l.folders[3].top).toBe(pileTop(900, PITCH, 3, 1));
  });

  it('fills the cabinet row by row as you read', () => {
    const tops = (k: number): number[] => layout(track, positionOf(track, k)).folders.map((f) => f.top);
    expect(tops(1)).toEqual([TAB, TAB, 640, 640, 770, 770]);
    expect(tops(3)).toEqual([TAB, TAB, TAB + 130, TAB + 130, 770, 770]);
    expect(tops(5)).toEqual([TAB, TAB, TAB + 130, TAB + 130, TAB + 260, TAB + 260]);
  });

  it('shrinks the pile by one folder a turn, never moving the rest', () => {
    // A row's place in the pile does not depend on how many are left, so the
    // ones that stay put genuinely do not move.
    for (const k of [0, 1, 2, 3]) {
      const l = layout(track, positionOf(track, k));
      for (let j = k + 1; j < 6; j++) {
        expect(l.folders[j].top).toBe(pileTop(900, PITCH, 3, rowOf(j)));
      }
    }
  });
});

describe('layout — the turn', () => {
  const track = buildTrack(metrics());
  const at = (k: number, p: number) =>
    layout(track, track.start[k] + track.pageScroll[k] + TURN * p);

  it('raises ONE folder, leaving its partner in the pile', () => {
    const l = at(0, 0.5);
    expect(l.turning).toBe(true);
    // Folder 1 is on its way from the pile to row 0; folders 2–5 have not moved.
    expect(l.folders[1].top).toBeGreaterThan(TAB);
    expect(l.folders[1].top).toBeLessThan(510);
    expect(l.folders[2].top).toBe(640);
  });

  it('carries it 1:1 with the scroll, from its pile slot to its cabinet slot', () => {
    expect(at(0, 0).folders[1].top).toBe(510);
    expect(at(0, 0.5).folders[1].top).toBe(510 + (TAB - 510) * 0.5);
    expect(at(0, 1).folders[1].top).toBeCloseTo(TAB, 6);
  });

  it('keeps the folder you are leaving open until the new one has landed', () => {
    // It is being COVERED, not hidden: the riser paints over it from the top
    // down as it climbs, and only at p = 1 does it become a filed folder.
    for (const p of [0.02, 0.3, 0.6, 0.9]) {
      expect(at(0, p).folders[0].bodyVisible).toBe(true);
      expect(at(0, p).folders[0].clipHeight).toBe(track.footMax[1] - TAB);
    }
    expect(layout(track, track.start[1]).folders[0].clipHeight).toBe(STRIP);
  });

  it('hands the vacated column to the page underneath, from the first frame', () => {
    // Folder 1 is the only thing piled in the right column, so the moment it
    // leaves, folder 0's page has to reach down to whatever is under it — or
    // there is a row of backdrop where folder 1 used to be for the whole turn.
    expect(track.foot[0]).not.toEqual(track.foot[1]);
    const rest = layout(track, track.start[0]).folders[0].clipHeight;
    const gone = at(0, 0.02).folders[0].clipHeight;
    expect(rest).toBe(track.footMax[0] - TAB);
    expect(gone).toBe(track.footMax[1] - TAB);
    // …and the same for a turn that deepens the foot rather than levelling it.
    expect(at(1, 0.02).folders[1].clipHeight).toBe(track.footMax[2] - TAB);
    expect(at(1, 0.02).folders[1].clipHeight).toBeGreaterThan(
      layout(track, track.start[1]).folders[1].clipHeight,
    );
  });

  it('carries the page up with the folder, its foot pinned to the pile', () => {
    // Nothing unfolds at the end of the turn: the page hangs from the rising
    // strip and reaches the top of the pile the whole way, so it grows as the
    // strip climbs and is already its landing size when the strip lands.
    for (const p of [0.3, 0.6, 0.9]) {
      const f = at(0, p).folders[1];
      expect(f.bodyVisible).toBe(true);
      expect(f.scrollTop).toBe(0);
      expect(f.top + f.clipHeight).toBeCloseTo(track.footMax[1], 6);
      // …and there is genuinely a page under the strip, not just the strip.
      expect(f.clipHeight).toBeGreaterThan(STRIP);
    }
    expect(at(0, 1).folders[1].clipHeight).toBeCloseTo(track.footMax[1] - TAB, 6);
  });

  it('never lets a riser show less than it showed in the pile', () => {
    // The first frame of a turn must not take a row out of the pile: until the
    // folder has climbed clear, its slot is the one it had while filed.
    expect(at(0, 0.002).turning).toBe(true);
    expect(at(0, 0.002).folders[1].clipHeight).toBe(FILED);
    expect(at(2, 0.002).folders[3].clipHeight).toBe(FILED);
  });

  it('hands over to the next vertical segment with no jump', () => {
    const before = layout(track, track.start[1] - 0.001);
    const after = layout(track, track.start[1]);
    expect(before.folders[1].clipHeight).toBeCloseTo(after.folders[1].clipHeight, 1);
    expect(before.folders[1].top).toBeCloseTo(after.folders[1].top, 1);
    expect(after.turning).toBe(false);
    expect(after.activeIndex).toBe(1);
  });

  it('covers the body it replaces by the time it lands', () => {
    // A left folder's replacement opens in the same place; a right folder's
    // opens one pitch lower, with the new strip landing on the old body's top.
    const sameRow = layout(track, track.start[1]);
    expect(cabinetTop(TAB, PITCH, rowOf(1))).toBe(cabinetTop(TAB, PITCH, rowOf(0)));
    const nextRow = layout(track, track.start[2]);
    expect(nextRow.folders[2].top).toBe(cabinetTop(TAB, PITCH, rowOf(0)) + PITCH);
    expect(sameRow.folders[0].bodyVisible).toBe(false);
    expect(nextRow.folders[1].bodyVisible).toBe(false);
    // The page that vanishes at p = 1 was under the new one already: the left
    // folder's page ran to the row's strip line, and its partner's page starts
    // there; the right folder's ran to the next row's tab, and the new row's
    // body starts there.
    expect(sameRow.folders[0].clipHeight).toBe(pageTop(TAB, STRIP, 1));
    expect(nextRow.folders[1].clipHeight).toBe(FILED);
    // …and the foot they were painting to is the foot the new page paints to,
    // so the swap is a folder going out from under a page that does not move.
    expect(track.footMax[1]).toBe(track.foot[1][0].y);
    expect(at(0, 0.99).folders[0].clipHeight + TAB).toBe(track.footMax[1]);
  });

  it('hands the folder over at the half-way point, the top of it at once', () => {
    expect(at(0, 0.49).activeIndex).toBe(0);
    expect(at(0, 0.49).topIndex).toBe(1);
    expect(at(0, 0.51).activeIndex).toBe(1);
  });

  it('is LINEAR by default — the folder is where the scroll put it', () => {
    // The rise is 1:1 with the wheel and stays that way; Lenis is the only
    // smoothing there is, and the settle is what stops it resting mid-air.
    const from = pileTop(900, PITCH, 3, 0);
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(at(0, p).folders[1].top).toBeCloseTo(from + (TAB - from) * p, 6);
    }
  });

  it('eases only the position, never the scroll', () => {
    const eased = buildTrack(metrics({ easeRise: 'easeOut' }));
    const y = eased.pageScroll[0] + TURN * 0.5;
    expect(layout(eased, y).progress).toBeCloseTo(layout(track, y).progress, 6);
    expect(layout(eased, y).folders[1].top).toBeLessThan(layout(track, y).folders[1].top);
  });

  it('has no turn at all for a single-folder project', () => {
    const one = buildTrack(metrics({ heights: [2700] }));
    for (const y of [0, 900, maxPosition(one)]) {
      const l = layout(one, y);
      expect(l.turning).toBe(false);
      expect(l.folders[0].top).toBe(TAB);
      expect(l.folders[0].bodyVisible).toBe(true);
    }
  });
});

describe('layout — the entrance', () => {
  const track = buildTrack(metrics());

  it('treats the run-up as folder 0 rising into an empty cabinet', () => {
    const l = layout(track, -TURN);
    expect(l.turning).toBe(true);
    expect(l.progress).toBe(0);
    expect(l.folders[0].top).toBe(510); // still in the pile
    expect(l.folders[0].clipHeight).toBe(FILED); // …and showing what a pile shows
    // Its page is rendered from the first frame, exactly as in any other turn —
    // the entrance IS a turn — but there is nothing of it to see yet.
    expect(l.folders[0].bodyVisible).toBe(true);
    expect(l.activeIndex).toBe(0);
  });

  it('lands exactly on the resting first folder', () => {
    expect(layout(track, -0.001).folders[0].top).toBeCloseTo(TAB, 1);
    expect(layout(track, 0).folders[0].top).toBe(TAB);
    expect(layout(track, 0).turning).toBe(false);
  });
});

describe('the painting invariant', () => {
  const track = buildTrack(metrics());

  /**
   * Folders in the same column overlap by EXACTLY the tab of the row in front —
   * that is the notch beside its tab, filled in. Any more is two sheets of
   * glass sharing a band, which is the smear the whole rule exists to prevent;
   * any less is the backdrop showing through the middle of a pile.
   */
  const overlapsByOneTab = (y: number): void => {
    const l = layout(track, y);
    for (const side of [0, 1]) {
      const bands = l.folders
        .map((f, k) => ({ k, f }))
        .filter(({ k }) => k % 2 === side && !l.folders[k].bodyVisible)
        .map(({ f }) => [f.top, f.top + f.clipHeight] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i++) {
        const overlap = bands[i - 1][1] - bands[i][0];
        expect(overlap).toBeLessThanOrEqual(TAB + 1e-6);
      }
    }
  };

  it('never lets two closed folders in a column share more than a tab', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) overlapsByOneTab(minPosition(track) + ((end + TURN) * i) / 40);
  });

  it('never paints a folder past the bottom of the sheet', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) {
      const l = layout(track, minPosition(track) + ((end + TURN) * i) / 40);
      for (const f of l.folders) expect(f.top + f.clipHeight).toBeLessThanOrEqual(900 + 1e-6);
    }
  });

  it('paints at most two bodies at once, and only during a turn', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) {
      const l = layout(track, (end * i) / 40);
      const open = l.folders.filter((f) => f.bodyVisible);
      expect(open.length).toBeLessThanOrEqual(2);
      if (open.length === 2) expect(l.turning).toBe(true);
    }
  });

  it('runs the open body from the page top to its shallowest column', () => {
    for (const k of [0, 1, 2, 3, 4]) {
      const l = layout(track, positionOf(track, k));
      const bodyTop = l.folders[k].top + pageTop(TAB, STRIP, k);
      expect(bodyTop + track.openBody[k]).toBeCloseTo(track.footMin[k], 6);
      // …and the SLOT to its deepest, so the step has somewhere to be painted.
      expect(l.folders[k].top + l.folders[k].clipHeight).toBeCloseTo(track.footMax[k], 6);
    }
  });
});

describe('positionOf / bottomOf', () => {
  const track = buildTrack(metrics());

  it('lands a deep link (and a tab click) at a folder’s top', () => {
    const l = layout(track, positionOf(track, 3));
    expect(l.activeIndex).toBe(3);
    expect(l.turning).toBe(false);
    expect(l.folders[3].scrollTop).toBe(0);
    expect(l.folders[3].bodyVisible).toBe(true);
  });

  it('lands the `bottom` dial where the folder was left', () => {
    const l = layout(track, bottomOf(track, 1));
    expect(l.activeIndex).toBe(1);
    expect(l.turning).toBe(false);
    expect(l.folders[1].scrollTop).toBe(track.pageScroll[1]);
  });

  it('lands ON the next folder from a hair short of a turn’s end', () => {
    // A scroller quantises to device pixels, so `scrollTo(start[k])` can come
    // back a fraction under it; without a guard the turn reads as 99.98% done
    // and TWO folders are open at a resting position.
    for (const eps of [0, -0.1, -0.4]) {
      const l = layout(track, positionOf(track, 3) + eps);
      expect(l.turning).toBe(false);
      expect(l.activeIndex).toBe(3);
      expect(l.folders.filter((f) => f.bodyVisible)).toHaveLength(1);
    }
  });

  it('holds the folder at a sub-pixel wobble around its bottom', () => {
    const y = bottomOf(track, 1);
    for (const eps of [-0.4, -0.05, 0, 0.05, 0.4]) {
      expect(layout(track, y + eps).turning).toBe(false);
      expect(layout(track, y + eps).activeIndex).toBe(1);
    }
  });

  it('clamps an index outside the project', () => {
    expect(positionOf(track, -3)).toBe(0);
    expect(positionOf(track, 99)).toBe(track.start[5]);
  });
});

describe('positionAt / resolve', () => {
  const track = buildTrack(metrics());

  it('round-trips every kind of position, the entrance included', () => {
    for (const y of [-TURN, -TURN / 2, 0, 450, 1460, 1460 + 360, track.start[2] + 10, maxPosition(track)]) {
      expect(resolve(track, positionAt(track, y))).toBeCloseTo(y, 6);
    }
  });

  it('keeps the reader in place when a folder grows under them', () => {
    const y = track.start[2] + 700;
    const at = positionAt(track, y);
    const grown = buildTrack(metrics({ heights: [1800, 4800, 2700, 4500, 1350, 2250] }));
    const y2 = resolve(grown, at);
    expect(layout(grown, y2).activeIndex).toBe(2);
    expect(layout(grown, y2).folders[2].scrollTop).toBe(700);
    expect(y2).toBe(y + 1200);
    // Whereas keeping the pixel position would have put them back in folder 1.
    expect(layout(grown, y).activeIndex).toBe(1);
  });

  it('keeps the reader in place when the folder they are on shrinks', () => {
    const at = positionAt(track, track.start[1] + 3000);
    const shrunk = buildTrack(metrics({ heights: [1800, 1200, 2700, 4500, 1350, 2250] }));
    const y = resolve(shrunk, at);
    expect(layout(shrunk, y).activeIndex).toBe(1);
    expect(layout(shrunk, y).folders[1].scrollTop).toBe(shrunk.pageScroll[1]);
    expect(layout(shrunk, y).turning).toBe(false);
  });

  it('keeps a mid-turn position mid-turn', () => {
    const at = positionAt(track, track.pageScroll[0] + TURN * 0.4);
    expect(at).toEqual({ section: 0, offset: track.pageScroll[0], turn: 0.4 });
    const grown = buildTrack(metrics({ heights: [3000, 3600, 2700, 4500, 1350, 2250] }));
    const l = layout(grown, resolve(grown, at));
    expect(l.turning).toBe(true);
    expect(l.progress).toBeCloseTo(0.4, 6);
  });

  it('drops a turn that no longer exists rather than overshooting', () => {
    const at = positionAt(track, track.start[4] + track.pageScroll[4] + TURN * 0.5);
    const shorter = buildTrack(metrics({ heights: [1800, 3600, 2700, 4500, 1350] }));
    const y = resolve(shorter, at);
    expect(y).toBe(maxPosition(shorter));
    expect(layout(shorter, y).turning).toBe(false);
  });
});

describe('folderClipPath', () => {
  /** A RIGHT-hand folder's shape: its page starts under the strip, and its foot
   *  steps — 700 across the left half of the sheet, 600 across the right. */
  const shape = {
    left: 0,
    right: 540,
    sheetWidth: 1080,
    tabWidth: 342,
    tabHeight: 40,
    chamfer: 40,
    closedHeight: 900,
    bodyTop: 130,
    foot: [
      { x: 540, y: 700 },
      { x: 1080, y: 600 },
    ],
  };
  /** …and the same folder with nothing to step over. */
  const flat = { ...shape, foot: [{ x: 1080, y: 700 }] };

  it('emits UNITLESS path data — a stray `px` voids the whole declaration', () => {
    expect(folderClipPath(flat, false)).not.toMatch(/\dpx/);
    expect(folderClipPath(flat, true)).not.toMatch(/\dpx/);
  });

  it('cuts tab, chamfer and body from ONE path — one sheet of glass', () => {
    const d = folderClipPath(shape, false);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).toContain('H 342'); // along the tab
    expect(d).toContain('L 382 39'); // the 45° chamfer, down to the body's top
    expect(d).toContain('V 900'); // …down past any slot it could be given
  });

  it('puts the tab one pixel INTO the body, so there is no seam to hide', () => {
    expect(folderClipPath({ ...shape, tabHeight: 40 }, false)).toContain('39');
  });

  it('rounds the tab’s outer corner and the body’s, and no others', () => {
    const d = folderClipPath(shape, false);
    expect(d.match(/A 6 6/g)).toHaveLength(2);
  });

  it('takes the open body out to the full sheet, not the column', () => {
    const d = folderClipPath(flat, true);
    expect(d).toContain('V 130 H 1080'); // out of the column at the body's top
    expect(d).toContain('V 700 H 0'); // …and back along the bottom
    // The closed outline stops at its slot and never mentions the sheet width.
    expect(folderClipPath(flat, false)).not.toContain('1080');
  });

  it('steps the page’s foot where its two columns stop at different heights', () => {
    // Walked right to left: down the far edge to the shallower column, left to
    // the divide, down to the deeper one, and left to the sheet's edge.
    const d = folderClipPath(shape, true);
    expect(d).toContain('H 1080 V 600 H 540 V 700 H 0 V 130');
    // Still one path, still no units, still no doubling back on itself.
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).not.toMatch(/\dpx/);
  });

  it('steps a LEFT folder straight off the chamfer to the sheet’s edge', () => {
    // Its page starts at the tab's own lip, so there is no column strip under
    // the tab to round the corner of. Rounding it anyway would send the path
    // back UP from `lip + r` to `lip` — and a self-crossing outline is not an
    // error, it is a clip to something nobody asked for.
    const d = folderClipPath({ ...flat, bodyTop: 39 }, true);
    expect(d).toContain('L 382 39 H 1080 V 700');
    expect(d.match(/A 6 6/g)).toHaveLength(1); // the tab's corner, and no other
    // Every vertical run goes DOWN the page, which is what "does not cross" is.
    const ys = [...d.matchAll(/V (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([700, 6]); // down the right edge, then up the left
  });

  it('clamps the tab so its chamfer lands INSIDE the column', () => {
    // A narrow column and a preferred width that does not fit: unclamped, the
    // chamfer runs past the column's right edge and the outline doubles back.
    const narrow = folderClipPath({ ...shape, left: 0, right: 342 }, false);
    const xs = [...narrow.matchAll(/[HL] (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThanOrEqual(342);
  });

  it('leaves a notch of clear body after the chamfer', () => {
    const d = folderClipPath({ ...shape, left: 0, right: 400, tabWidth: 10000 }, false);
    // tab + chamfer must stop a chamfer's width short of the column's edge.
    expect(d).toContain('H 320 L 360 39'); // 400 − chamfer − notch
  });

  it('keeps a right-hand folder in its own column', () => {
    const right = folderClipPath({ ...shape, left: 540, right: 1080 }, false);
    expect(right).toContain('M 546 0'); // starts at the column, not the sheet
    expect(right).toContain('H 882'); // its tab is the same width, further over
  });
});
