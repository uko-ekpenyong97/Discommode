/**
 * The hero page rect — the ONE source of truth for where the detail view's
 * centre panel and the reader's page live. Both views derive their geometry from
 * this rect, so opening the reader over the detail view is continuous: the cover
 * sits exactly where the card was. The grid→detail morph and the doorway land on
 * it too.
 *
 * THE STUDIO DISPLAY'S GAPS ARE THE MOST THERE IS. The spacing was signed off
 * on the Studio Display (2560×1440): there the hero is `detailCardScale` of
 * the height and the band over it and under it — margin, chrome, gap — is
 * `REF_VH · (1 − detailCardScale) / 2` (136.8 at 0.81). On a narrower screen
 * every part of that band shrinks in proportion to the width (`s`, the
 * viewport's width over 2560): the margins and the gaps to the book down to
 * their floors in px (sizeDials.ts), the chrome's faces down to the face floor
 * (no face under 44px, ×0.957 for the 46 arrows). A short screen shrinks them
 * further, where the hero would otherwise fall under {@link HERO_MIN_SHARE} of
 * the height. The book never shrinks first: the band is reserved, and the
 * hero (10:13) takes the height that is left, the open book (two pages; one,
 * reading a page at a time) the width. `useChromeFit` puts the faces' fit and
 * the margin on the chrome lines.
 *
 * At 2560 wide (and 912 tall or more) `s` is 1, and the layout is the one
 * that was signed off, to the pixel.
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
import { singlePageAt, subscribeSinglePage } from '../reader/singlePage';
import { SIZE, subscribeSize } from './sizeDials';

/**
 * The reader's page ratio (10:13), NOT the grid card's 3:4. The hero rect uses
 * this so the detail panel and the reader cover are the same rect (see below).
 */
export const PAGE_ASPECT_W = 10;
export const PAGE_ASPECT_H = 13;

/** The reference viewport, CSS px: the Studio Display, 2560×1440, where the
 *  spacing was signed off. Its gaps are the most any screen gets. */
export const REF_VW = 2560;
export const REF_VH = 1440;
/** Past its width, a short screen shrinks the chrome further where the hero
 *  would otherwise get less than this share of the viewport's height. */
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
  /** The chrome faces' fit: 1, or less on a smaller screen (never under the
   *  face floor). The faces and the gaps between them in a row are × k. */
  k: number;
  /** The chrome's margin from the viewport's top and bottom, px. */
  margin: number;
  /** The band over the hero and under it, px: margin, the tallest line of
   *  chrome, and the gap to the book. */
  band: number;
  /** Least distance from the book (or the card) to the viewport's sides, px. */
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

/** The viewport's scale against the reference: its width over 2560, less on a
 *  short screen (where the reference band would leave the hero under its
 *  share), never over 1. */
export function viewportScale(vw: number, vh: number, band0: number = referenceBand()): number {
  const kShare = ((1 - HERO_MIN_SHARE) * vh) / (2 * band0);
  return Math.max(0, Math.min(1, vw / REF_VW, kShare));
}

/**
 * The hero layout for a viewport. `single`: the reader shows one page at a
 * time here (singlePage.ts), so the book that must fit the width is one page.
 */
export function computeHeroLayout(vw: number, vh: number, single: boolean = singlePageAt(vw, vh)): HeroLayout {
  const band0 = referenceBand();
  // The reference band's three parts: margin, the tallest line of chrome (or
  // its 44px hit area), and the gap between it and the book.
  const margin0 = CHROME.chromeMargin;
  const line0 = CHROME_LINE * CHROME.chromeScale;
  const gap0 = Math.max(0, band0 - margin0 - Math.max(line0, MIN_TARGET));
  const s = viewportScale(vw, vh, band0);
  // Each shrinks with the screen, to its floor (never over its reference).
  const floored = (ref: number, min: number) => Math.max(Math.min(ref, min), ref * s);
  const k = Math.min(1, Math.max(chromeFloor(), s));
  const margin = floored(margin0, SIZE.marginMin);
  const gapToBook = floored(gap0, SIZE.gapMin);
  const sideGap = floored(gap0, SIZE.sideMin);
  const band = margin + Math.max(line0 * k, MIN_TARGET) + gapToBook;
  // Height first; then the width: the open book (two pages, 20:13) for the
  // reader, or one page reading a page at a time, and one card for the detail.
  const byHeight = vh - 2 * band;
  const byWidth = (pages: number) => ((vw - 2 * sideGap) * PAGE_ASPECT_H) / (pages * PAGE_ASPECT_W);
  const reader = Math.min(byHeight, byWidth(single ? 1 : 2)) * SIZE.readerFill;
  const detail = Math.min(byHeight, byWidth(1)) * SIZE.detailFill;
  const h = Math.max(MIN_HERO_H, Math.min(reader, detail));
  // The hero deliberately diverges from the grid's shared 3:4 (CARD_ASPECT_*):
  // it is 10:13, the reader's page ratio. With this the detail centre panel and
  // the FLIP endpoint land on the reader cover's rect to the pixel, so the reader
  // cover coincides with the detail panel exactly — the doorway entrance (step
  // 4c-2) can hold the cover opaque over the panel with only its contact shadow
  // arriving. The grid stays 3:4 (CARD_ASPECT_* is unchanged).
  const w = (h * PAGE_ASPECT_W) / PAGE_ASPECT_H;
  const gap = (config.detailGap * h) / (REF_VH * config.detailCardScale);
  return { rect: { x: (vw - w) / 2, y: (vh - h) / 2, w, h }, k, margin, band, sideGap, gap };
}

export const computeHeroRect = (vw: number, vh: number): HeroRect => computeHeroLayout(vw, vh).rect;

/** Hear every input of the hero layout but the viewport's size: the config,
 *  chrome and size dials, and the single-page dial. */
export function subscribeHeroInputs(fn: () => void): () => void {
  const off = [subscribeConfig(fn), subscribeChrome(fn), subscribeSize(fn), subscribeSinglePage(fn)];
  return () => off.forEach((u) => u());
}

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
  a.margin === b.margin &&
  a.gap === b.gap;

/**
 * Subscribe to the live hero layout: writes the CSS variables (before paint)
 * and returns the numbers, recomputing on resize and on any config or chrome
 * change (so the `detailCardScale` / `detailGap` / `chromeScale` /
 * `chromeMargin` dials and READER SIZE / DETAIL SIZE feed it live), and when
 * the reader starts or stops showing one page at a time.
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
    const unsubscribe = subscribeHeroInputs(update);
    return () => {
      window.removeEventListener('resize', update);
      unsubscribe();
    };
  }, []);
  return layout;
}
