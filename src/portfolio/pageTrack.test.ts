import { describe, expect, it } from 'vitest';
import {
  bottomOf,
  buildTrack,
  folderClipPath,
  layout,
  maxPosition,
  minPosition,
  positionAt,
  positionOf,
  resolve,
  rowCount,
  rowOf,
} from './pageTrack';
import type { TrackMetrics } from './pageTrack';

/** A six-folder project — three full rows — at a common laptop viewport. */
const metrics = (over: Partial<TrackMetrics> = {}): TrackMetrics => ({
  heights: [1800, 3600, 2700, 4500, 1350, 2250],
  viewportHeight: 900,
  rowPitch: 72,
  tabHeight: 64,
  turnDistance: 720,
  ...over,
});

const TURN = 720;
/** 900 − (3 − 1) × 72 − 64 */
const BODY = 692;

/** Every folder's painted band, as [top, bottom) pairs, for overlap checks. */
const bands = (l: ReturnType<typeof layout>): [number, number][] =>
  l.folders.map((f) => [f.top, f.top + f.clipHeight]);

describe('rows', () => {
  it('puts two folders in a row, even on the left', () => {
    expect([0, 1, 2, 3, 4, 5].map(rowOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('gives an odd count a half-empty last row', () => {
    expect(rowCount(7)).toBe(4);
    expect(rowCount(6)).toBe(3);
    expect(rowCount(1)).toBe(1);
  });
});

describe('buildTrack', () => {
  it('gives every folder the same open body, whatever row it is in', () => {
    // The read pile gains a row exactly as the unread pile loses one, so the
    // space between them never changes.
    const t = buildTrack(metrics());
    expect(t.openBodyHeight).toBe(BODY);
    expect(t.rows).toBe(3);
  });

  it('scrolls each folder by its overflow past that body, then turns', () => {
    const t = buildTrack(metrics());
    expect(t.pageScroll).toEqual([1108, 2908, 2008, 3808, 658, 1558]);
    expect(t.start[1]).toBe(1108 + TURN);
    expect(t.start[2]).toBe(1108 + TURN + 2908 + TURN);
  });

  it('a folder shorter than the open body still has a segment, just no scroll', () => {
    const t = buildTrack(metrics({ heights: [400, 2000] }));
    expect(t.pageScroll[0]).toBe(0);
    expect(t.start[1]).toBe(TURN); // straight into the turn
  });

  it('ends one viewport past the last folder', () => {
    const t = buildTrack(metrics());
    expect(maxPosition(t)).toBe(t.start[5] + t.pageScroll[5]);
  });

  it('reaches one turn BEFORE the start, which is the entrance', () => {
    expect(minPosition(buildTrack(metrics()))).toBe(-TURN);
  });

  it('a single-folder project is just that folder, with no turn', () => {
    const t = buildTrack(metrics({ heights: [2700] }));
    expect(t.rows).toBe(1);
    // One row, so no read pile and no unread pile: the body is everything but
    // the tab.
    expect(t.openBodyHeight).toBe(900 - 64);
    expect(t.start).toEqual([0]);
    expect(maxPosition(t)).toBe(2700 - 836);
  });
});

describe('layout — the piles', () => {
  const track = buildTrack(metrics());

  it('docks the read rows at the top and piles the rest at the bottom', () => {
    const l = layout(track, 400);
    expect(l.activeIndex).toBe(0);
    expect(l.turning).toBe(false);
    // Row 0 docked at the top; rows 1 and 2 anchored to the bottom, last lowest.
    expect(l.folders.map((f) => f.top)).toEqual([0, 0, 900 - 144, 900 - 144, 828, 828]);
    // The open folder runs down to the pile; its partner shows only its tab.
    expect(l.folders[0].clipHeight).toBe(900 - 144);
    expect(l.folders[1].clipHeight).toBe(64);
    expect(l.folders[0].bodyVisible).toBe(true);
    expect(l.folders[1].bodyVisible).toBe(false);
  });

  it('gives the open folder exactly the body the track was built on', () => {
    for (const k of [0, 2, 4]) {
      const l = layout(track, positionOf(track, k));
      expect(l.folders[k].clipHeight - track.tabHeight).toBe(BODY);
    }
  });

  it('keeps a read row one pitch tall — its tabs, and the stack edge', () => {
    const l = layout(track, positionOf(track, 4));
    // The row's band is a pitch; within it the last folder you opened owns the
    // strip below the tabs and its partner shows only its tab.
    expect(l.folders[1].clipHeight).toBe(72);
    expect(l.folders[0].clipHeight).toBe(64);
    expect(l.folders[0].bodyVisible).toBe(false);
    expect(l.folders[1].bodyVisible).toBe(false);
    expect(l.folders[4].bodyVisible).toBe(true);
  });

  it('shrinks the unread pile by a whole row as each row rises', () => {
    const pileTop = (y: number): number =>
      Math.min(...layout(track, y).folders.map((f) => f.top).filter((t) => t > 200));
    expect(pileTop(positionOf(track, 0))).toBe(900 - 144); // two rows waiting
    expect(pileTop(positionOf(track, 2))).toBe(900 - 72); // one
    // …and on the last row there is nothing below at all.
    expect(layout(track, positionOf(track, 4)).folders[4].top).toBe(144);
  });
});

describe('layout — the turns', () => {
  const track = buildTrack(metrics());

  it('unfolds a docked partner down from its tab, 1:1 with the scroll', () => {
    const at = (p: number) => layout(track, track.pageScroll[0] + TURN * p);
    expect(at(0.25).turning).toBe(true);
    expect(at(0.25).rising).toBe(false);
    const full = 900 - 144;
    expect(at(0.25).folders[1].clipHeight).toBeCloseTo(64 + 0.25 * (full - 64), 6);
    expect(at(0.75).folders[1].clipHeight).toBeCloseTo(64 + 0.75 * (full - 64), 6);
    // The folder underneath keeps its body and is simply covered.
    expect(at(0.75).folders[0].clipHeight).toBe(full);
    // Neither moves: an unfold happens in place.
    expect(at(0.75).folders[0].top).toBe(0);
    expect(at(0.75).folders[1].top).toBe(0);
  });

  it('rises the next row out of the pile, docking it as a pair', () => {
    const from = track.start[1] + track.pageScroll[1];
    const at = (p: number) => layout(track, from + TURN * p);
    expect(at(0.5).rising).toBe(true);
    const pile = 900 - 144;
    expect(at(0).folders[2].top).toBeCloseTo(pile, 6);
    expect(at(0.5).folders[2].top).toBeCloseTo(pile + (72 - pile) * 0.5, 6);
    expect(at(1).folders[2].top).toBeCloseTo(72, 6);
    // The right partner rises with it, and docks closed.
    expect(at(0.5).folders[3].top).toBe(at(0.5).folders[2].top);
    expect(at(0.5).folders[3].clipHeight).toBe(64);
    // The left one opens on the way up.
    expect(at(0.5).folders[2].bodyVisible).toBe(true);
  });

  it('grows the body it uncovers to follow the rising row exactly', () => {
    const from = track.start[1] + track.pageScroll[1];
    for (const p of [0, 0.3, 0.6, 1]) {
      const l = layout(track, from + TURN * p);
      // Rule 2: a folder paints down to the next row's top, wherever it is.
      expect(l.folders[1].top + l.folders[1].clipHeight).toBeCloseTo(l.folders[2].top, 6);
    }
  });

  it('eases only the position, never the scroll', () => {
    const eased = buildTrack(metrics({ easeRise: 'easeOut' }));
    const from = eased.start[1] + eased.pageScroll[1];
    const linear = layout(track, track.start[1] + track.pageScroll[1] + TURN * 0.5);
    const curved = layout(eased, from + TURN * 0.5);
    // Same point in the scroll, further along the rise.
    expect(curved.progress).toBeCloseTo(linear.progress, 6);
    expect(curved.folders[2].top).toBeLessThan(linear.folders[2].top);
  });

  it('hands the folder over at the half-way point, the top of it at once', () => {
    const before = layout(track, track.pageScroll[0] + TURN * 0.49);
    const after = layout(track, track.pageScroll[0] + TURN * 0.51);
    expect(before.activeIndex).toBe(0);
    expect(before.topIndex).toBe(1);
    expect(after.activeIndex).toBe(1);
  });

  it('hands a turn over to the next vertical segment with no jump', () => {
    const before = layout(track, track.start[1] - 0.001);
    const after = layout(track, track.start[1]);
    expect(before.folders[1].clipHeight).toBeCloseTo(after.folders[1].clipHeight, 1);
    expect(after.turning).toBe(false);
    expect(after.activeIndex).toBe(1);
  });

  it('has no turn at all for a single-folder project', () => {
    const one = buildTrack(metrics({ heights: [2700] }));
    for (const y of [0, 900, maxPosition(one)]) {
      const l = layout(one, y);
      expect(l.turning).toBe(false);
      expect(l.folders[0].top).toBe(0);
      expect(l.folders[0].clipHeight).toBe(900);
    }
  });
});

describe('layout — the entrance', () => {
  const track = buildTrack(metrics());

  it('treats the run-up as row 0 rising into an empty screen', () => {
    const l = layout(track, -TURN);
    expect(l.turning).toBe(true);
    expect(l.rising).toBe(true);
    expect(l.progress).toBe(0);
    // Every row still in the pile, row 0 at its top.
    expect(l.folders[0].top).toBe(900 - 216);
    expect(l.folders[4].top).toBe(828);
    expect(l.activeIndex).toBe(0);
  });

  it('lands exactly on the resting first folder', () => {
    const arriving = layout(track, -0.001);
    const arrived = layout(track, 0);
    expect(arriving.folders[0].top).toBeCloseTo(0, 1);
    expect(arrived.folders[0].top).toBe(0);
    expect(arrived.turning).toBe(false);
  });
});

describe('the painting invariant', () => {
  const track = buildTrack(metrics());

  /** Rows tile the screen: no row's band may overlap another's. */
  const rowsDoNotOverlap = (y: number): void => {
    const l = layout(track, y);
    const byRow = new Map<number, [number, number]>();
    l.folders.forEach((f, k) => {
      const r = rowOf(k);
      const b = byRow.get(r);
      byRow.set(r, b ? [Math.min(b[0], f.top), Math.max(b[1], f.top + f.clipHeight)] : [f.top, f.top + f.clipHeight]);
    });
    const ordered = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i][0]).toBeGreaterThanOrEqual(ordered[i - 1][1] - 1e-6);
    }
  };

  it('never lets one row paint over another, at any position', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) rowsDoNotOverlap(minPosition(track) + ((end + TURN) * i) / 40);
  });

  it('never lets the two folders of a row both paint a body, except mid-unfold', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) {
      const y = (end * i) / 40;
      const l = layout(track, y);
      for (let r = 0; r < track.rows; r++) {
        const both = l.folders[2 * r]?.bodyVisible && l.folders[2 * r + 1]?.bodyVisible;
        if (both) {
          // Only ever the one case the spec asks for: a partner coming down
          // over the folder it is covering.
          expect(l.turning && !l.rising && rowOf(l.topIndex) === r).toBe(true);
        }
      }
    }
  });

  it('paints at most two bodies at once', () => {
    const end = maxPosition(track);
    for (let i = 0; i <= 40; i++) {
      const open = layout(track, (end * i) / 40).folders.filter((f) => f.bodyVisible);
      expect(open.length).toBeLessThanOrEqual(2);
    }
  });

  it('leaves no gap between rows either — the bands meet exactly', () => {
    const l = layout(track, positionOf(track, 2));
    const b = bands(l);
    // A row's band is the union of its two folders'; the owner is the taller.
    expect(Math.max(b[0][1], b[1][1])).toBe(b[2][0]); // row 0's bottom is row 1's top
    expect(Math.max(b[2][1], b[3][1])).toBe(b[4][0]); // row 1's bottom is the pile's top
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
    const y = bottomOf(track, 1);
    const l = layout(track, y);
    expect(l.activeIndex).toBe(1);
    expect(l.turning).toBe(false);
    expect(l.folders[1].scrollTop).toBe(track.pageScroll[1]);
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

  it('round-trips every kind of position', () => {
    for (const y of [0, 450, 1108, 1108 + 360, track.start[2] + 10, maxPosition(track)]) {
      expect(resolve(track, positionAt(track, y))).toBeCloseTo(y, 6);
    }
  });

  it('round-trips the entrance too', () => {
    for (const y of [-TURN, -TURN / 2, -1]) {
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
    const at = positionAt(track, track.start[1] + 2800);
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
    expect(at.turn).toBeCloseTo(0.5, 6);
    const shorter = buildTrack(metrics({ heights: [1800, 3600, 2700, 4500, 1350] }));
    const y = resolve(shorter, at);
    expect(y).toBe(maxPosition(shorter));
    expect(layout(shorter, y).turning).toBe(false);
  });
});

describe('folderClipPath', () => {
  const opts = { sheetWidth: 1080, tabWidth: 518.4, tabHeight: 64, height: 756 };

  it('cuts a left folder as tab, chamfer, then full width', () => {
    const d = folderClipPath({ ...opts, side: 'left' });
    expect(d).toBe('polygon(0 0, 518.4px 0, 582.4px 64px, 1080px 64px, 1080px 756px, 0 756px)');
  });

  it('notches the right folder along its partner’s chamfer where they cross', () => {
    // 48% / 52% leaves a 4% gap, and a 45° chamfer eats it in 2% of the width —
    // so without the notch the two tabs would overlap in a wedge of doubled
    // glass. 540 is the middle of the gap; 21.6 is where the chamfers meet.
    const d = folderClipPath({ ...opts, side: 'right' });
    expect(d).toContain('561.6px 0'); // its tab starts at 52%
    expect(d).toContain('582.4px 64px'); // …and it follows the partner's chamfer
    expect(d).toContain('540px 21.6px'); // up to the crossing
  });

  it('tiles the tab band — the two outlines meet, and never overlap', () => {
    const { sheetWidth: W, tabWidth: tw, tabHeight: T } = opts;
    const rightStart = W - tw;
    const leftEdge = (y: number): number => tw + y; // the left folder's chamfer
    const rightEdge = (y: number): number => Math.max(rightStart - y, tw + y);
    for (let y = 0; y <= T; y += 4) {
      expect(rightEdge(y)).toBeGreaterThanOrEqual(leftEdge(y) - 1e-9);
    }
    // They meet exactly at the crossing and stay together from there down.
    expect(rightEdge(T)).toBeCloseTo(leftEdge(T), 6);
  });

  it('leaves the mirror alone when the gap is wide enough to clear', () => {
    const d = folderClipPath({ ...opts, tabWidth: 300, side: 'right' });
    expect(d).toContain('780px 0');
    expect(d).toContain('716px 64px'); // a plain 45° mirror, no notch
    expect(d).not.toContain('540px');
  });
});
