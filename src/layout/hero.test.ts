import { describe, expect, it } from 'vitest';
import { PAGE_ASPECT_H, PAGE_ASPECT_W, computeHeroRect } from './hero';

/**
 * The hero rect is the ONE rect shared by the detail centre panel, the FLIP
 * morph endpoint, and the reader cover. Its width must follow the reader's page
 * ratio (10:13) — not the grid card's 3:4 — so the reader cover coincides with
 * the detail panel exactly and the doorway entrance (step 4c-2) can hold the
 * cover opaque over the panel with only its contact shadow arriving.
 */
describe('computeHeroRect', () => {
  const viewports: Array<[number, number]> = [
    [2560, 1440],
    [1920, 1080],
    [1440, 810],
  ];

  it.each(viewports)('is 10:13 at %ix%i', (vw, vh) => {
    const { w, h } = computeHeroRect(vw, vh);
    expect(w).toBeCloseTo((h * PAGE_ASPECT_W) / PAGE_ASPECT_H, 6);
    // 10:13 ≈ 0.769 — wider than the old 3:4 (0.75).
    expect(w / h).toBeCloseTo(10 / 13, 6);
  });

  it('stays centred on the viewport centre', () => {
    const vw = 2560;
    const vh = 1440;
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
