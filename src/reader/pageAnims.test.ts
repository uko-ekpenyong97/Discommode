import { describe, expect, it } from 'vitest';
import { ANIMATED_PAGES, PAGE_ANIMS, PAGE_H, PAGE_W, animsOnPage } from './pageAnims';
import type { PageAnimManifest } from './pageAnimGeometry';
import { cellRect, frameAt, lockedH, pagesNear, restOf } from './pageAnimGeometry';
import type { AtlasEntry } from './pageAnimGeometry';
import { buildSpreads, issue01 } from './issue-01';
// The build's own geometry (plain JS, no browser): what seeded the rows.
import { fitInside, turnedBounds } from '../../scripts/page-anim-register.mjs';
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

  it('every animated page carries its plate in the issue, and no other page does', () => {
    for (const p of issue01.pages) {
      expect(!!p.plate).toBe(ANIMATED_PAGES.includes(p.n) && !p.label);
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
