import { describe, expect, it } from 'vitest';
import { CHROME } from '../chrome/chromeDials';
import { config } from '../config';
import {
  CHROME_LINE,
  MIN_TARGET,
  PAGE_ASPECT_H,
  PAGE_ASPECT_W,
  REF_VW,
  chromeFloor,
  chromeHitMin,
  computeHeroLayout,
  computeHeroRect,
  referenceBand,
  viewportScale,
} from './hero';
import { SIZE, SIZE_DEFAULTS, setSize } from './sizeDials';

/**
 * The hero rect is the ONE rect shared by the detail centre panel, the FLIP
 * morph endpoint, and the reader cover. Its width must follow the reader's page
 * ratio (10:13) — not the grid card's 3:4 — so the reader cover coincides with
 * the detail panel exactly and the doorway entrance (step 4c-2) can hold the
 * cover opaque over the panel with only its contact shadow arriving.
 *
 * Its height is what the chrome leaves: the band over and under it is the
 * Studio Display's (2560×1440), and shrinks with a narrower or shorter screen,
 * to floors: the faces' are 32px with a fine pointer, 44px on a touch screen.
 * Vitest has no matchMedia, so a call without `coarse` is a fine pointer.
 */
const VIEWPORTS: Array<[number, number]> = [
  [2560, 1440],
  [1920, 1080],
  [1728, 1117],
  [1512, 982],
  [1440, 900],
  [1280, 720],
];

describe('computeHeroRect', () => {
  it.each(VIEWPORTS)('is 10:13 at %ix%i', (vw, vh) => {
    const { w, h } = computeHeroRect(vw, vh);
    expect(w).toBeCloseTo((h * PAGE_ASPECT_W) / PAGE_ASPECT_H, 6);
    // 10:13 ≈ 0.769 — wider than the old 3:4 (0.75).
    expect(w / h).toBeCloseTo(10 / 13, 6);
  });

  it.each(VIEWPORTS)('stays centred on the viewport centre at %ix%i', (vw, vh) => {
    const r = computeHeroRect(vw, vh);
    expect(r.x + r.w / 2).toBeCloseTo(vw / 2, 6);
    expect(r.y + r.h / 2).toBeCloseTo(vh / 2, 6);
  });

  it('matches the reader page width the CSS derives from --hero-h', () => {
    // flipbook.css derives the reader page from --hero-h at the same 10:13, so
    // the reader cover width must equal the hero rect width for the same height.
    const { w, h } = computeHeroRect(2560, 1440);
    const readerPageWidth = (h * PAGE_ASPECT_W) / PAGE_ASPECT_H;
    expect(w).toBeCloseTo(readerPageWidth, 6);
  });
});

describe("computeHeroLayout: the Studio Display's gaps are the maximums", () => {
  const gap0 = 136.8 - CHROME.chromeMargin - CHROME_LINE;

  it('is the signed-off layout at the reference, 2560×1440', () => {
    const l = computeHeroLayout(2560, 1440);
    expect(l.k).toBe(1);
    expect(l.margin).toBe(CHROME.chromeMargin);
    expect(l.band).toBeCloseTo(136.8, 6);
    expect(l.rect.h).toBeCloseTo(1440 * config.detailCardScale, 6);
    expect(l.rect.h).toBeCloseTo(1166.4, 6);
    expect(l.rect.y).toBeCloseTo(136.8, 6);
    expect(l.gap).toBeCloseTo(config.detailGap, 6);
    // The band less the margin and the tallest line (58): the gap to the book.
    expect(l.sideGap).toBeCloseTo(gap0, 6);
  });

  // The Studio Display with a browser's toolbars: 2560 wide, less tall.
  it.each([1600, 1440, 1300])('keeps the reference band at 2560×%i', (vh) => {
    for (const coarse of [false, true]) {
      const l = computeHeroLayout(2560, vh, false, coarse);
      expect(l.k).toBe(1);
      expect(l.band).toBeCloseTo(referenceBand(), 6);
      expect(l.rect.y).toBeCloseTo(referenceBand(), 6);
    }
  });

  it.each([1200, 1000, 912])('shrinks with the height under heightRef, at 2560×%i', (vh) => {
    const s = vh / SIZE_DEFAULTS.heightRef;
    expect(viewportScale(2560, vh)).toBeCloseTo(s, 9);
    const l = computeHeroLayout(2560, vh, false);
    expect(l.k).toBeCloseTo(s, 9);
    expect(l.margin).toBeCloseTo(CHROME.chromeMargin * s, 9);
    expect(l.band).toBeCloseTo(referenceBand() * s, 9);
  });

  it('shrinks every gap in proportion to the width, faces to their floor', () => {
    const l = computeHeroLayout(1728, 1117, false, false);
    const s = 1728 / REF_VW;
    expect(viewportScale(1728, 1117)).toBeCloseTo(s, 9);
    // The 46s at 32px, the 58s at 40.3.
    expect(l.k).toBeCloseTo(chromeFloor(1, false), 9);
    expect(l.k * 46).toBeCloseTo(32, 9);
    expect(l.hit).toBe(32);
    expect(l.margin).toBeCloseTo(CHROME.chromeMargin * s, 9);
    expect(l.sideGap).toBeCloseTo(gap0 * s, 9);
    expect(l.band).toBeCloseTo(CHROME.chromeMargin * s + CHROME_LINE * l.k + gap0 * s, 9);
  });

  it('keeps the touch floors on a touch screen: faces and hit areas 44', () => {
    const l = computeHeroLayout(1180, 820, false, true);
    expect(l.k).toBeCloseTo(chromeFloor(1, true), 9);
    expect(l.k * 46).toBeCloseTo(44, 9);
    expect(l.hit).toBe(MIN_TARGET);
    // The same screen with a trackpad gets the smaller chrome, and the bigger book.
    const fine = computeHeroLayout(1180, 820, false, false);
    expect(fine.k * 46).toBeCloseTo(32, 9);
    expect(fine.rect.h).toBeGreaterThan(l.rect.h);
  });

  it('holds the gaps at their floors on a tablet', () => {
    for (const [vw, vh] of [[820, 1180], [1024, 1366]]) {
      const l = computeHeroLayout(vw, vh, false, true);
      expect(l.margin).toBe(SIZE.marginMin);
      expect(l.sideGap).toBeGreaterThanOrEqual(SIZE.sideMin);
      expect(l.band).toBeGreaterThanOrEqual(SIZE.marginMin + MIN_TARGET + SIZE.gapMin);
    }
  });

  const SCREENS: Array<[number, number]> = [...VIEWPORTS, [1366, 1024], [1024, 1366], [1180, 820], [820, 1180], [1133, 744], [744, 1133], [2560, 800]];

  it.each(SCREENS)('never gives more than the reference, and keeps every face at its floor, at %ix%i', (vw, vh) => {
    for (const coarse of [false, true]) {
      const l = computeHeroLayout(vw, vh, false, coarse);
      expect(l.band).toBeLessThanOrEqual(referenceBand() + 1e-9);
      expect(l.margin).toBeLessThanOrEqual(CHROME.chromeMargin);
      expect(l.sideGap).toBeLessThanOrEqual(gap0 + 1e-9);
      expect(l.k * 46).toBeGreaterThanOrEqual((coarse ? 44 : 32) - 1e-9);
      expect(l.hit).toBe(coarse ? 44 : 32);
    }
  });

  it.each(SCREENS)('never lets the chrome reach the book at %ix%i', (vw, vh) => {
    for (const single of [false, true]) {
      for (const coarse of [false, true]) {
        const l = computeHeroLayout(vw, vh, single, coarse);
        // The top line (margin, face or hit area) and the bottom row end before the book.
        expect(l.margin + Math.max(CHROME_LINE * l.k, l.hit)).toBeLessThan(l.rect.y);
        expect(l.rect.y).toBeGreaterThanOrEqual(l.band - 1e-9);
        const pages = single ? 1 : 2;
        expect(pages * l.rect.w).toBeLessThanOrEqual(vw - 2 * l.sideGap + 1e-9);
      }
    }
  });

  it.each([
    [1728, 1117, 843.4],
    [1440, 900, 630],
    [1366, 1024, 750.4],
    [1180, 820, 558.3],
  ])('gives a bigger book than the fixed band did at %ix%i', (vw, vh, before) => {
    expect(computeHeroLayout(vw, vh, false, true).rect.h).toBeGreaterThan(before + 40);
  });

  // The 44px floor (2026-10-05) against the 32px one with a fine pointer.
  it.each([
    [1728, 1117, 899.6],
    [1512, 982, 777.8],
    [1440, 900, 700.2],
  ])('gives a bigger book with a fine pointer than the 44px floor did at %ix%i', (vw, vh, before) => {
    expect(computeHeroLayout(vw, vh, false, false).rect.h).toBeGreaterThan(before + 25);
  });

  it('sizes for one page, reading a page at a time', () => {
    const spread = computeHeroLayout(820, 1180, false);
    const single = computeHeroLayout(820, 1180, true);
    expect(2 * spread.rect.w).toBeCloseTo(820 - 2 * spread.sideGap, 6);
    expect(single.rect.h).toBeGreaterThan(1.8 * spread.rect.h);
    expect(single.rect.w).toBeLessThanOrEqual(820 - 2 * single.sideGap + 1e-9);
    // Landscape: the height binds either way.
    expect(computeHeroLayout(1180, 820, true).rect.h).toBeCloseTo(computeHeroLayout(1180, 820, false).rect.h, 9);
  });

  it('shrinks further on a short screen, past its height', () => {
    try {
      // Under the height's own scale (800 / 1300), the share binds first.
      expect(viewportScale(2560, 800)).toBeCloseTo(800 / SIZE_DEFAULTS.heightRef, 9);
      // With the height out of it, the hero's least share is what binds.
      setSize({ heightRef: 1 });
      expect(viewportScale(2560, 800)).toBeCloseTo((0.3 * 800) / (2 * 136.8), 9);
      expect(computeHeroLayout(2560, 800).band).toBeLessThan(referenceBand());
    } finally {
      setSize(SIZE_DEFAULTS);
    }
  });

  it.each(VIEWPORTS)('keeps the reference neighbour gap ratio at %ix%i', (vw, vh) => {
    const ref = computeHeroLayout(2560, 1440);
    const l = computeHeroLayout(vw, vh);
    expect(l.gap / l.rect.w).toBeCloseTo(ref.gap / ref.rect.w, 9);
  });

  it('takes READER SIZE and DETAIL SIZE as shares of the space, the smaller winning', () => {
    const full = computeHeroLayout(1180, 820, false).rect.h;
    try {
      setSize({ readerFill: 0.9 });
      expect(computeHeroLayout(1180, 820, false).rect.h).toBeCloseTo(full * 0.9, 6);
      setSize({ readerFill: 1, detailFill: 0.8 });
      expect(computeHeroLayout(1180, 820, false).rect.h).toBeCloseTo(full * 0.8, 6);
      // Nothing moves at the reference while the fills are 1.
      setSize({ detailFill: 1, marginMin: 30, gapMin: 30, sideMin: 30 });
      expect(computeHeroLayout(2560, 1440).rect.h).toBeCloseTo(1166.4, 6);
    } finally {
      setSize(SIZE_DEFAULTS);
    }
  });

  it('follows detailCardScale: the reference band is the dial', () => {
    expect(referenceBand()).toBeCloseTo(136.8, 6);
    expect(referenceBand(0.81)).toBeCloseTo(136.8, 6);
    expect(referenceBand(0.82)).toBeCloseTo(129.6, 6);
    expect(referenceBand(0.9)).toBeCloseTo(72, 6);
  });

  it('never floors above 1, and floors at the 32px face (44px on touch) at chromeScale 1', () => {
    expect(chromeFloor(1, false)).toBeCloseTo(32 / 46, 9);
    expect(chromeFloor(1, true)).toBeCloseTo(44 / 46, 9);
    expect(chromeFloor(0.5, true)).toBe(1);
    expect(chromeHitMin(false)).toBe(32);
    expect(chromeHitMin(true)).toBe(44);
  });
});
