/**
 * The hero page rect — the ONE source of truth for where the detail view's
 * centre panel and the reader's page live. Both views derive their geometry from
 * this rect, so opening the reader over the detail view is continuous: the cover
 * sits exactly where the card was. The grid→detail morph and the doorway land on
 * it too.
 *
 * THE BOOK YIELDS TO THE CHROME. The spacing is the Studio Display's (2560×1440),
 * where it was signed off: there the hero is `detailCardScale` of the height
 * and the band over it and under it — margin, chrome, gap — is
 * `REF_VH · (1 − detailCardScale) / 2` (136.8 at 0.81). That band is reserved
 * FIRST, in px, on every screen; the hero (10:13) takes the height that is left,
 * and the open book (two pages) the width. So the chrome and the gaps between
 * it and the book are the same everywhere and the book is what shrinks.
 *
 * Only on a short screen, where the hero would fall under {@link HERO_MIN_SHARE}
 * of the height, does the chrome shrink: the whole band (margin, chrome, gap)
 * scales by `k`, so the proportions stay the Studio Display's — down to the
 * face floor (no face under 44px, ×0.957 for the 46 arrows). Past the floor the
 * hero gives way, not the chrome. `useChromeFit` puts `k` on the chrome lines.
 *
 * The neighbours keep the reference's hero-to-neighbour gap RATIO: `detailGap`
 * is the gap at the reference, scaled with the hero.
 *
 * `useHeroLayout` publishes the rect as CSS variables on `:root`
 * (`--hero-x/y/w/h`) for CSS consumers (the reader, a sibling of `.app`) and
 * returns the numbers for JS consumers (the detail panel + the FLIP morph).
 */
import { useLayoutEffect, useState } from 'react';
import { CHROME, subscribeChrome } from '../chrome/chromeDials';
import SHAPES from '../chrome/shapes.json';
import { config, subscribeConfig } from '../config';

/**
 * The reader's page ratio (10:13), NOT the grid card's 3:4. The hero rect uses
 * this so the detail panel and the reader cover are the same rect (see below).
 */
export const PAGE_ASPECT_W = 10;
export const PAGE_ASPECT_H = 13;

/** The reference viewport's height, CSS px: the Studio Display, 2560×1440,
 *  where the spacing was signed off. */
export const REF_VH = 1440;
/** The chrome only shrinks where the hero would otherwise get less than this
 *  share of the viewport's height. */
export const HERO_MIN_SHARE = 0.7;
/** Smallest a chrome face may get, CSS px (the 46 arrows stop at ×0.957). */
export const MIN_TARGET = 44;
/** The tallest line of chrome, Figma units: the 58 book icons in the reader's
 *  row, and the close X at the top. The band's gap is measured from it. */
export const CHROME_LINE = Math.max(SHAPES.cover.base.h, SHAPES.escape.base.h);
/** The smallest face, Figma units: the 46 arrows and pills. Sets the floor. */
export const CHROME_SMALLEST = Math.min(SHAPES.prev.base.h, SHAPES.next.base.h, SHAPES.pill.base.h);
/** Smallest the hero may ever get, px (a guard for absurd windows). */
const MIN_HERO_H = 120;

export interface HeroRect {
  /** Top-left corner + size, in viewport px. Centre is always (vw/2, vh/2). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeroLayout {
  rect: HeroRect;
  /** The chrome's shrink: 1, or less on a short screen (never under the face
   *  floor). Every band, margin, chrome size and gap is × k. */
  k: number;
  /** The band over the hero and under it, px (already × k): the viewport's
   *  edge to the hero's. */
  band: number;
  /** Least distance from the open book to the viewport's sides, px (× k):
   *  the band's gap, from the tallest line of chrome. */
  sideGap: number;
  /** Edge-to-edge gap between the hero and each neighbour card, px. */
  gap: number;
}

/** The band at the reference (k = 1), from `detailCardScale`. */
export const referenceBand = (cardScale: number = config.detailCardScale): number =>
  (REF_VH * (1 - cardScale)) / 2;

/** The face floor as a k: no face under {@link MIN_TARGET}, never above 1. */
export const chromeFloor = (scale: number = CHROME.chromeScale): number =>
  Math.min(1, MIN_TARGET / (CHROME_SMALLEST * scale));

export function computeHeroLayout(vw: number, vh: number): HeroLayout {
  const band0 = referenceBand();
  // The gap between the tallest line of chrome and the book, at the reference.
  const sideGap0 = Math.max(0, band0 - CHROME.chromeMargin - Math.max(CHROME_LINE * CHROME.chromeScale, MIN_TARGET));
  // The largest k that leaves the hero its share, held to [floor, 1].
  const kShare = ((1 - HERO_MIN_SHARE) * vh) / (2 * band0);
  const k = Math.min(1, Math.max(chromeFloor(), kShare));
  const band = band0 * k;
  const sideGap = sideGap0 * k;
  // Height first; then the open book (two pages, 20:13) inside the side gaps.
  const byHeight = vh - 2 * band;
  const byWidth = ((vw - 2 * sideGap) * PAGE_ASPECT_H) / (2 * PAGE_ASPECT_W);
  const h = Math.max(MIN_HERO_H, Math.min(byHeight, byWidth));
  // The hero deliberately diverges from the grid's shared 3:4 (CARD_ASPECT_*):
  // it is 10:13, the reader's page ratio. With this the detail centre panel and
  // the FLIP endpoint land on the reader cover's rect to the pixel, so the reader
  // cover coincides with the detail panel exactly — the doorway entrance (step
  // 4c-2) can hold the cover opaque over the panel with only its contact shadow
  // arriving. The grid stays 3:4 (CARD_ASPECT_* is unchanged).
  const w = (h * PAGE_ASPECT_W) / PAGE_ASPECT_H;
  const gap = (config.detailGap * h) / (REF_VH * config.detailCardScale);
  return { rect: { x: (vw - w) / 2, y: (vh - h) / 2, w, h }, k, band, sideGap, gap };
}

export const computeHeroRect = (vw: number, vh: number): HeroRect => computeHeroLayout(vw, vh).rect;

function writeVars(r: HeroRect): void {
  const s = document.documentElement.style;
  s.setProperty('--hero-x', `${r.x}px`);
  s.setProperty('--hero-y', `${r.y}px`);
  s.setProperty('--hero-w', `${r.w}px`);
  s.setProperty('--hero-h', `${r.h}px`);
}

const same = (a: HeroLayout, b: HeroLayout): boolean =>
  a.rect.x === b.rect.x &&
  a.rect.y === b.rect.y &&
  a.rect.w === b.rect.w &&
  a.rect.h === b.rect.h &&
  a.k === b.k &&
  a.gap === b.gap;

/**
 * Subscribe to the live hero layout: writes the CSS variables (before paint)
 * and returns the numbers, recomputing on resize and on any config or chrome
 * change (so the `detailCardScale` / `detailGap` / `chromeScale` /
 * `chromeMargin` dials feed it live).
 */
export function useHeroLayout(): HeroLayout {
  const [layout, setLayout] = useState<HeroLayout>(() =>
    computeHeroLayout(window.innerWidth, window.innerHeight),
  );
  useLayoutEffect(() => {
    const update = () => {
      const next = computeHeroLayout(window.innerWidth, window.innerHeight);
      writeVars(next.rect);
      setLayout((prev) => (same(prev, next) ? prev : next));
    };
    update();
    window.addEventListener('resize', update);
    const unConfig = subscribeConfig(update);
    const unChrome = subscribeChrome(update);
    return () => {
      window.removeEventListener('resize', update);
      unConfig();
      unChrome();
    };
  }, []);
  return layout;
}
