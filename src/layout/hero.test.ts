import { describe, expect, it } from 'vitest';
import { CHROME } from '../chrome/chromeDials';
import { config } from '../config';
import {
  CHROME_LINE,
  HERO_MIN_SHARE,
  MIN_TARGET,
  PAGE_ASPECT_H,
  PAGE_ASPECT_W,
  chromeFloor,
  computeHeroLayout,
  computeHeroRect,
  referenceBand,
} from './hero';

/**
 * The hero rect is the ONE rect shared by the detail centre panel, the FLIP
 * morph endpoint, and the reader cover. Its width must follow the reader's page
 * ratio (10:13) — not the grid card's 3:4 — so the reader cover coincides with
 * the detail panel exactly and the doorway entrance (step 4c-2) can hold the
 * cover opaque over the panel with only its contact shadow arriving.
 *
 * Its height is what the chrome leaves: the band over and under it is the
 * Studio Display's (2560×1440), in px, on every screen.
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

describe('computeHeroLayout: the book yields to the chrome', () => {
  it('is the signed-off layout at the reference, 2560×1440', () => {
    const l = computeHeroLayout(2560, 1440);
    expect(l.k).toBe(1);
    expect(l.band).toBeCloseTo(129.6, 6);
    expect(l.rect.h).toBeCloseTo(1440 * config.detailCardScale, 6);
    expect(l.rect.y).toBeCloseTo(129.6, 6);
    expect(l.gap).toBeCloseTo(config.detailGap, 6);
    // The band less the margin and the tallest line (58): the gap to the book.
    expect(l.sideGap).toBeCloseTo(129.6 - CHROME.chromeMargin - CHROME_LINE, 6);
  });

  it.each(VIEWPORTS.filter(([, vh]) => vh >= 900))('keeps the reference band in px at %ix%i', (vw, vh) => {
    const l = computeHeroLayout(vw, vh);
    expect(l.k).toBe(1);
    expect(l.rect.y).toBeCloseTo(referenceBand(), 6);
    expect(vh - (l.rect.y + l.rect.h)).toBeCloseTo(referenceBand(), 6);
    expect(l.rect.h / vh).toBeGreaterThanOrEqual(HERO_MIN_SHARE);
  });

  it.each(VIEWPORTS)('keeps the reference neighbour gap ratio at %ix%i', (vw, vh) => {
    const ref = computeHeroLayout(2560, 1440);
    const l = computeHeroLayout(vw, vh);
    expect(l.gap / l.rect.w).toBeCloseTo(ref.gap / ref.rect.w, 9);
  });

  it('shrinks the whole band on a short screen, down to the face floor', () => {
    // 1280×720: the reference band would leave the hero 64% — under the share.
    const l = computeHeroLayout(1280, 720);
    expect(l.k).toBeCloseTo(chromeFloor(), 9);
    expect(l.k).toBeCloseTo(MIN_TARGET / 46, 9);
    expect(l.band).toBeCloseTo(referenceBand() * l.k, 6);
    expect(l.rect.y).toBeCloseTo(l.band, 6);
    // Past the floor, the hero gives way, not the chrome.
    expect(l.rect.h / 720).toBeLessThan(HERO_MIN_SHARE);
  });

  it('shrinks only as far as the share needs, between the floor and 1', () => {
    // Where the share binds above the floor: k from (1 − share)·vh = 2·band·k.
    const band = referenceBand();
    const vh = Math.round((2 * band * 0.98) / (1 - HERO_MIN_SHARE));
    const l = computeHeroLayout(vh * 2, vh);
    expect(l.k).toBeCloseTo(((1 - HERO_MIN_SHARE) * vh) / (2 * band), 9);
    expect(l.rect.h / vh).toBeCloseTo(HERO_MIN_SHARE, 6);
  });

  it('fits the open book (two pages) inside the side gaps on a narrow screen', () => {
    const l = computeHeroLayout(1200, 1440);
    expect(2 * l.rect.w).toBeCloseTo(1200 - 2 * l.sideGap, 6);
    expect(l.rect.h).toBeLessThan(1440 - 2 * l.band);
  });

  it('follows detailCardScale: the reference band is the dial', () => {
    expect(referenceBand(0.82)).toBeCloseTo(129.6, 6);
    expect(referenceBand(0.9)).toBeCloseTo(72, 6);
  });

  it('never floors above 1, and floors at the 44px face at chromeScale 1', () => {
    expect(chromeFloor(1)).toBeCloseTo(44 / 46, 9);
    expect(chromeFloor(0.5)).toBe(1);
  });
});
