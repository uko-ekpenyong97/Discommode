import { describe, expect, it } from 'vitest';
import {
  bottomOf,
  buildTrack,
  cabinetTop,
  folderClipPath,
  layout,
  maxPosition,
  minPosition,
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
  stripHeight: 187, // 40px tab + 148px body, less the 1px lip
  turnDistance: 720,
  unfoldShare: 0.3,
  ...over,
});

const TURN = 720;
const PITCH = 130;

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
    expect([0, 1, 2].map((r) => cabinetTop(PITCH, r))).toEqual([0, 130, 260]);
    expect([0, 1, 2].map((r) => pileTop(900, PITCH, 3, r))).toEqual([510, 640, 770]);
  });

  it('overlaps the rows — a folder is taller than the step between them', () => {
    const t = buildTrack(metrics());
    expect(t.stripHeight).toBeGreaterThan(t.rowPitch);
    expect(t.stripHeight - t.rowPitch).toBe(57); // 18px of body, plus the tab riding over
  });
});

describe('buildTrack', () => {
  it('alternates the open body by a row pitch, because a left folder leaves its partner behind', () => {
    const t = buildTrack(metrics());
    // Reading a LEFT folder, its own partner is still in the pile, so the pile
    // starts one row higher and the body is one pitch shorter.
    expect(t.openBody[0]).toBe(510 - 130);
    expect(t.openBody[1]).toBe(640 - 130);
    expect(t.openBody[2]).toBe(640 - 260);
    expect(t.openBody[3]).toBe(770 - 260);
    expect(t.openBody[4]).toBe(770 - 390);
    // The last folder has nothing below it at all.
    expect(t.openBody[5]).toBe(900 - 390);
  });

  it('scrolls each folder by its overflow past its OWN body, then turns', () => {
    const t = buildTrack(metrics());
    expect(t.pageScroll[0]).toBe(1800 - 380);
    expect(t.pageScroll[1]).toBe(3600 - 510);
    expect(t.start[1]).toBe(1420 + TURN);
    expect(t.start[2]).toBe(1420 + TURN + 3090 + TURN);
  });

  it('a folder shorter than its body still has a segment, just no scroll', () => {
    const t = buildTrack(metrics({ heights: [200, 2000] }));
    expect(t.pageScroll[0]).toBe(0);
    expect(t.start[1]).toBe(TURN);
  });

  it('a single-folder project is just that folder, with no turn', () => {
    const t = buildTrack(metrics({ heights: [2700] }));
    expect(t.rows).toBe(1);
    expect(t.openBody[0]).toBe(900 - 130);
    expect(t.start).toEqual([0]);
    expect(maxPosition(t)).toBe(2700 - 770);
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
    expect(l.folders.map((f) => f.top)).toEqual([0, 510, 640, 640, 770, 770]);
    // The open one paints its strip AND its body; the rest paint one pitch.
    expect(l.folders[0].clipHeight).toBe(PITCH + track.openBody[0]);
    expect(l.folders.slice(1).map((f) => f.clipHeight)).toEqual([130, 130, 130, 130, 130]);
    expect(l.folders.map((f) => f.bodyVisible)).toEqual([true, false, false, false, false, false]);
  });

  it('leaves a half-filled cabinet row while only the left folder has risen', () => {
    const l = layout(track, positionOf(track, 2));
    // Folders 0 and 1 docked in row 0; 2 docked alone in row 1; 3 still piled.
    expect(l.folders.map((f) => f.top)).toEqual([0, 0, 130, 640, 770, 770]);
    expect(l.folders[3].top).toBe(pileTop(900, PITCH, 3, 1));
  });

  it('fills the cabinet row by row as you read', () => {
    const tops = (k: number): number[] => layout(track, positionOf(track, k)).folders.map((f) => f.top);
    expect(tops(1)).toEqual([0, 0, 640, 640, 770, 770]);
    expect(tops(3)).toEqual([0, 0, 130, 130, 770, 770]);
    expect(tops(5)).toEqual([0, 0, 130, 130, 260, 260]);
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
    expect(l.folders[1].top).toBeGreaterThan(0);
    expect(l.folders[1].top).toBeLessThan(510);
    expect(l.folders[2].top).toBe(640);
  });

  it('carries it 1:1 with the scroll, from its pile slot to its cabinet slot', () => {
    expect(at(0, 0).folders[1].top).toBe(510);
    expect(at(0, 0.5).folders[1].top).toBe(510 + (0 - 510) * 0.5);
    expect(at(0, 1).folders[1].top).toBeCloseTo(0, 6);
  });

  it('keeps the folder you are leaving open until the new one has landed', () => {
    for (const p of [0, 0.3, 0.6, 0.9]) {
      expect(at(0, p).folders[0].clipHeight).toBe(PITCH + track.openBody[0]);
    }
  });

  it('unfolds the new body only over the last stretch of the turn', () => {
    expect(at(0, 0.5).folders[1].clipHeight).toBe(PITCH); // still just the strip
    expect(at(0, 0.7).folders[1].clipHeight).toBeCloseTo(PITCH, 6);
    expect(at(0, 0.85).folders[1].clipHeight).toBeCloseTo(PITCH + track.openBody[1] * 0.5, 6);
    expect(at(0, 1).folders[1].clipHeight).toBeCloseTo(PITCH + track.openBody[1], 6);
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
    expect(cabinetTop(PITCH, rowOf(1)) + PITCH).toBe(cabinetTop(PITCH, rowOf(0)) + PITCH);
    const nextRow = layout(track, track.start[2]);
    expect(nextRow.folders[2].top).toBe(cabinetTop(PITCH, rowOf(1)) + PITCH - PITCH + PITCH);
    expect(sameRow.folders[0].bodyVisible).toBe(false);
    expect(nextRow.folders[1].bodyVisible).toBe(false);
  });

  it('hands the folder over at the half-way point, the top of it at once', () => {
    expect(at(0, 0.49).activeIndex).toBe(0);
    expect(at(0, 0.49).topIndex).toBe(1);
    expect(at(0, 0.51).activeIndex).toBe(1);
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
      expect(l.folders[0].top).toBe(0);
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
    expect(l.folders[0].bodyVisible).toBe(false);
    expect(l.activeIndex).toBe(0);
  });

  it('lands exactly on the resting first folder', () => {
    expect(layout(track, -0.001).folders[0].top).toBeCloseTo(0, 1);
    expect(layout(track, 0).folders[0].top).toBe(0);
    expect(layout(track, 0).turning).toBe(false);
  });
});

describe('the painting invariant', () => {
  const track = buildTrack(metrics());

  /** Folders in the same column whose bands overlap would be glass on glass. */
  const noColumnOverlap = (y: number): void => {
    const l = layout(track, y);
    for (const side of [0, 1]) {
      const bands = l.folders
        .map((f, k) => ({ k, f }))
        .filter(({ k }) => k % 2 === side && !l.folders[k].bodyVisible)
        .map(({ f }) => [f.top, f.top + f.clipHeight] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][1] - 1e-6);
      }
    }
  };

  it('never lets two closed folders in a column paint over each other', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) noColumnOverlap(minPosition(track) + ((end + TURN) * i) / 40);
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

  it('leaves no gap between docked rows — a pitch each, exactly', () => {
    const l = layout(track, positionOf(track, 5));
    expect(l.folders[0].top + l.folders[0].clipHeight).toBe(l.folders[2].top);
    expect(l.folders[2].top + l.folders[2].clipHeight).toBe(l.folders[4].top);
  });

  it('runs the open body from one row below its folder to the top of the pile', () => {
    for (const k of [0, 1, 2, 3, 4]) {
      const l = layout(track, positionOf(track, k));
      const bodyTop = l.folders[k].top + PITCH;
      const pile = Math.min(...l.folders.filter((_, j) => j > k).map((f) => f.top));
      expect(bodyTop + track.openBody[k]).toBeCloseTo(pile, 6);
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
    for (const y of [-TURN, -TURN / 2, 0, 450, 1420, 1420 + 360, track.start[2] + 10, maxPosition(track)]) {
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
  const shape = {
    left: 0,
    right: 540,
    sheetWidth: 1080,
    tabWidth: 342,
    tabHeight: 40,
    chamfer: 40,
    stripHeight: 187,
    bodyTop: 130,
    height: 700,
  };

  it('emits UNITLESS path data — a stray `px` voids the whole declaration', () => {
    expect(folderClipPath(shape, false)).not.toMatch(/\dpx/);
    expect(folderClipPath(shape, true)).not.toMatch(/\dpx/);
  });

  it('cuts tab, chamfer and body from ONE path — one sheet of glass', () => {
    const d = folderClipPath(shape, false);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d).toContain('H 342'); // along the tab
    expect(d).toContain('L 382 39'); // the 45° chamfer, down to the body's top
    expect(d).toContain('V 187'); // …and the body's full height
  });

  it('puts the tab one pixel INTO the body, so there is no seam to hide', () => {
    expect(folderClipPath({ ...shape, tabHeight: 40 }, false)).toContain('39');
  });

  it('rounds the tab’s outer corner and the body’s, and no others', () => {
    const d = folderClipPath(shape, false);
    expect(d.match(/A 6 6/g)).toHaveLength(2);
  });

  it('takes the open body out to the full sheet, not the column', () => {
    const d = folderClipPath(shape, true);
    expect(d).toContain('V 130 H 1080'); // out of the column at the body's top
    expect(d).toContain('V 700 H 0'); // …and back along the bottom
    // The closed outline stops at the strip and never mentions the sheet width.
    expect(folderClipPath(shape, false)).not.toContain('1080');
  });

  it('keeps a right-hand folder in its own column', () => {
    const right = folderClipPath({ ...shape, left: 540, right: 1080 }, false);
    expect(right).toContain('M 546 0'); // starts at the column, not the sheet
    expect(right).toContain('H 882'); // its tab is the same width, further over
  });
});
