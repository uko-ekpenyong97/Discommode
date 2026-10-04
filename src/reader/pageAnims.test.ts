import { describe, expect, it } from 'vitest';
import { ANIMATED_PAGES, PAGE_ANIMS, PAGE_H, PAGE_W, animsOnPage } from './pageAnims';
import type { PageAnimManifest } from './pageAnimGeometry';
import { cellRect, frameAt, holdsOf, lockedH, pagesNear, restOf } from './pageAnimGeometry';
import type { AtlasEntry } from './pageAnimGeometry';
import { buildSpreads, issue01 } from './issue-01';
import { QUOTED_PAGES } from './quotes';
// The build's own geometry (plain JS, no browser): what seeded the rows.
import { fitInside, turnedBounds } from '../../scripts/page-anim-register.mjs';
// The build's APNG reader, for the sources when they are on this machine.
import { fpsOfDelays, holdsOf as holdsOfDelays, readApng, runsOf, sourceApngPath } from '../../scripts/apng.mjs';
// What `npm run anims` wrote.
import manifestJson from '../../public/issues/01/page-anim/manifest.json';

const manifest = manifestJson as PageAnimManifest;

/** How each row was placed (pageAnims.ts): registered against the baked page
 *  (`matched`; rotated ones at their turn), or the drawing fitted inside a
 *  box (`fitted`, the fallback — none since 2026-10-01; its geometry is
 *  tested below). Every row must hold its drawing's shape either way. */
const FITTED = new Set<string>();
const kindOf = (id: string) => (FITTED.has(id) ? 'fitted' : 'matched');

describe('pageAnims.ts', () => {
  it('animates exactly the pages that have plates', () => {
    expect(ANIMATED_PAGES).toEqual([3, 4, 8, 10, 11, 15, 17, 18, 24, 25, 27, 34, 35, 36, 37]);
    for (const p of ANIMATED_PAGES) expect(animsOnPage(p).length).toBeGreaterThan(0);
  });

  it('has one row per animation, on an inside page, near its page', () => {
    const ids = PAGE_ANIMS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of PAGE_ANIMS) {
      expect(r.page).toBeGreaterThanOrEqual(1);
      expect(r.page).toBeLessThanOrEqual(40);
      // On the page, or hanging off its edges (cuffs, the bottom; xolo, the left
      // and the bottom; hippo, the right).
      const c = turnedBounds(r, r.rotation);
      expect(c.x + c.w).toBeGreaterThan(0);
      expect(c.y + c.h).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(PAGE_W);
      expect(c.y).toBeLessThan(PAGE_H);
    }
  });

  it('every animated page carries its plate in the issue, and no other page does but a quoted one', () => {
    for (const p of issue01.pages) {
      expect(!!p.plate).toBe((ANIMATED_PAGES.includes(p.n) || QUOTED_PAGES.includes(p.n)) && !p.label);
      if (p.plate) expect(p.plate).toBe(`/issues/01/plates/${String(p.n).padStart(2, '0')}.webp`);
    }
  });

  it('is built: every row has an atlas, and the atlas has no row it lacks', () => {
    expect(Object.keys(manifest.anims).sort()).toEqual(PAGE_ANIMS.map((r) => r.id).sort());
    for (const r of PAGE_ANIMS) expect(manifest.anims[r.id].page).toBe(r.page);
  });

  describe('h is the drawing’s own shape', () => {
    for (const r of PAGE_ANIMS) {
      it(`${r.id} (${kindOf(r.id)}${r.rotation ? `, turned ${r.rotation}°` : ''}${r.flipX ? ', mirrored' : ''})`, () => {
        const { aspect } = manifest.anims[r.id];
        expect(Math.abs(r.h - r.w / aspect)).toBeLessThanOrEqual(1);
      });
    }
  });

  it('every rest is a drawn frame of its animation', () => {
    for (const r of PAGE_ANIMS) {
      const { frames } = manifest.anims[r.id];
      if (r.rest == null) continue;
      expect(Number.isInteger(r.rest)).toBe(true);
      expect(r.rest).toBeGreaterThanOrEqual(0);
      expect(r.rest).toBeLessThan(frames);
      expect(manifest.anims[r.id].rest).toBe(r.rest);
    }
    // The pages that print a later frame than the first drawn one rest on it.
    const rest = (id: string) => PAGE_ANIMS.find((r) => r.id === id)?.rest;
    expect(rest('badges')).toBe(2); // both badges; Badges-1 is blank, Badges-2 one badge
    expect(rest('ipad')).toBe(9);
    expect(rest('carrito')).toBe(9);
    expect(rest('hippo')).toBe(1); // Hippo-2 agrees 98.4% with 04; frames 1 and 3, 86.8% and 83.6%
  });

  it('seeds: sfmoma’s Figma box is its 518×699 turned 16.36°', () => {
    const b = turnedBounds({ x: 290, y: 759, w: 518, h: 699 }, 16.36);
    expect(b.x).toBeCloseTo(202, 0);
    expect(b.y).toBeCloseTo(700, 0);
    expect(b.w).toBeCloseTo(694, 0);
    expect(b.h).toBeCloseTo(817, 0);
  });

  it('the fallback: a fitted drawing sits inside its box, centred, at its own shape', () => {
    const tall = fitInside({ x: 931, y: 2234, w: 1013, h: 1110 }, 1.4288);
    expect(tall.w).toBe(1013);
    expect(tall.h).toBeCloseTo(1013 / 1.4288, 1);
    expect(tall.y + tall.h / 2).toBeCloseTo(2234 + 555, 1);
    const wide = fitInside({ x: 0, y: 0, w: 1000, h: 100 }, 2);
    expect(wide).toEqual({ x: 400, y: 0, w: 200, h: 100 });
  });
});

describe('atlas geometry and timing', () => {
  const e: AtlasEntry = {
    page: 8, src: '', frames: 6, fps: 6, mode: 'loop', rest: 1,
    cols: 3, rows: 2, cellW: 100, cellH: 50, gutter: 2, aspect: 2,
  };

  it('finds each frame’s cell past the gutters', () => {
    expect(cellRect(e, 0)).toEqual({ sx: 0, sy: 0, sw: 100, sh: 50 });
    expect(cellRect(e, 2)).toEqual({ sx: 204, sy: 0, sw: 100, sh: 50 });
    expect(cellRect(e, 4)).toEqual({ sx: 102, sy: 52, sw: 100, sh: 50 });
  });

  it('starts on the rest frame, steps at fps, and loops', () => {
    expect(frameAt(e, -500)).toBe(1); // before the loop starts: the rest frame
    expect(frameAt(e, 0)).toBe(1);
    expect(frameAt(e, 166)).toBe(1);
    expect(frameAt(e, 167)).toBe(2);
    expect(frameAt(e, 4 * 1000 / 6 + 1)).toBe(5);
    expect(frameAt(e, 5 * 1000 / 6 + 1)).toBe(0); // wraps through the blank frame
    expect(frameAt(e, 1000 + 1)).toBe(1);
  });

  it('starts on the row’s rest when it has one', () => {
    expect(frameAt(e, 0, 4)).toBe(4);
    expect(frameAt(e, 167, 4)).toBe(5);
    expect(frameAt(e, 334, 4)).toBe(0);
    expect(restOf(e, 4)).toBe(4);
    expect(restOf(e, undefined)).toBe(1);
    expect(restOf(e, 9)).toBe(1); // not a frame: the atlas's
  });

  it('a once animation holds its last frame', () => {
    expect(frameAt({ ...e, mode: 'once' }, 10_000)).toBe(5);
  });

  it('locks h to the shape', () => {
    expect(lockedH(723.84, 0.841514)).toBeCloseTo(860.16, 1);
  });

  it('keeps the open spread and one either side', () => {
    const spreads = buildSpreads(issue01);
    expect([...pagesNear(spreads, 9)].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20]);
    expect([...pagesNear(spreads, 0)].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });
});

describe('frame holds', () => {
  // badges as built: frame 1 blank, rests on frame 3.
  const e: AtlasEntry = {
    page: 8, src: '', frames: 6, fps: 6, holds: [2, 2, 1, 2, 5, 2], mode: 'loop', rest: 2,
    cols: 3, rows: 2, cellW: 100, cellH: 50, gutter: 2, aspect: 2,
  };
  const tick = 1000 / 6;
  const at = (ticks: number, rest?: number) => frameAt(e, ticks * tick + 1, rest);

  it('holds each frame its ticks, from the start of the rest frame’s hold, and loops', () => {
    // From rest (frame 2): 2 ×1, 3 ×2, 4 ×5, 5 ×2, 0 ×2, 1 ×2 — then round again.
    const want = [2, 3, 3, 4, 4, 4, 4, 4, 5, 5, 0, 0, 1, 1, 2, 3];
    expect(want.map((_, t) => at(t))).toEqual(want);
    expect(frameAt(e, -500)).toBe(2);
    expect(frameAt(e, 0)).toBe(2);
  });

  it('keeps time from the clock: a thousand loops later it is on the same frame', () => {
    const loop = 14;
    for (let t = 0; t < loop; t++) expect(at(t + 1000 * loop)).toBe(at(t));
  });

  it('starts from the row’s rest when it has one', () => {
    expect(at(0, 4)).toBe(4);
    expect(at(4, 4)).toBe(4);
    expect(at(5, 4)).toBe(5);
    expect(at(7, 4)).toBe(0);
  });

  it('a once animation holds its last frame after its last hold', () => {
    const once = { ...e, mode: 'once' as const, rest: 0 };
    expect(frameAt(once, 11 * tick + 1)).toBe(4);
    expect(frameAt(once, 12 * tick + 1)).toBe(5);
    expect(frameAt(once, 100_000)).toBe(5);
  });

  it('holds that do not fit the atlas fall back to one tick a frame', () => {
    expect(holdsOf({ ...e, holds: [2, 2] })).toBeNull();
    expect(holdsOf({ ...e, holds: [2, 2, 0, 2, 5, 2] })).toBeNull();
    expect(frameAt({ ...e, holds: [2, 2] }, tick + 1)).toBe(3);
  });

  it('an animation without holds steps exactly as before', () => {
    const plain = { ...e, holds: undefined, rest: 1 };
    for (let t = 0; t < 20; t++) expect(frameAt(plain, t * tick + 1)).toBe((1 + t) % 6);
  });
});

describe('Procreate holds as built', () => {
  /** What Procreate's APNG exports say (2026-10-03): 166ms frames, 6fps. */
  const PROCREATE: Record<string, { file: string; holds: number[]; apngMs: number }> = {
    cuffs: { file: 'Golden_Cuffs.png', holds: [5, 5], apngMs: 1660 },
    badges: { file: 'Badges.png', holds: [2, 2, 1, 2, 5, 2], apngMs: 2324 },
  };

  for (const [id, want] of Object.entries(PROCREATE)) {
    it(`${id}: holds ${want.holds.join(',')}, its loop within a frame of the APNG’s`, () => {
      const e = manifest.anims[id];
      expect(e.fps).toBe(6);
      expect(e.holds).toEqual(want.holds);
      expect(e.apngMs).toBe(want.apngMs);
      const ticks = e.holds!.reduce((a, b) => a + b, 0);
      expect(Math.abs((ticks / e.fps) * 1000 - want.apngMs)).toBeLessThanOrEqual(1000 / e.fps);
    });
  }

  it('no other animation has holds (each plays as before)', () => {
    for (const [id, e] of Object.entries(manifest.anims)) if (!(id in PROCREATE)) expect(e.holds).toBeUndefined();
  });

  // The sources live outside the repo; where they are, the manifest must be
  // what their APNGs say now.
  for (const [id, want] of Object.entries(PROCREATE)) {
    const path = sourceApngPath('01', id, want.file);
    it.skipIf(!path)(`${id}: the manifest’s holds are its APNG’s delays`, async () => {
      const apng = await readApng(path!);
      const delays = runsOf(apng.frames).map((r) => r.delayMs);
      const fps = fpsOfDelays(apng.frames.map((f) => f.delayMs));
      const e = manifest.anims[id];
      expect(fps).toBe(e.fps);
      expect(holdsOfDelays(delays, fps!)).toEqual(e.holds);
      expect(Math.round(delays.reduce((a, b) => a + b, 0))).toBe(e.apngMs);
      // Each run is held exactly its delay, in whole ticks.
      for (let i = 0; i < delays.length; i++) expect(e.holds![i]).toBe(Math.round((delays[i] * e.fps) / 1000));
      expect(apng.plays).toBe(0);
    });
  }
});
