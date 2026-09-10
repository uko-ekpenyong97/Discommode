/**
 * The hero page rect — the ONE source of truth for where the detail view's
 * centre panel and the reader's page live. Both views derive their geometry from
 * this rect, so opening the reader over the detail view is continuous: the cover
 * sits exactly where the card was.
 *
 * The rect is the detail panel's existing sizing rule (`computeDetailLayout`'s
 * centre height, still the `detailCardScale` dial), 3:4, centred horizontally AND
 * vertically — so its centre is always the viewport centre and the top/bottom
 * bands are equal. `useHeroRect` publishes it as CSS variables on `:root`
 * (`--hero-x/y/w/h`) for CSS consumers (the reader, a sibling of `.app`) and
 * returns the numeric rect for JS consumers (the detail panel + the FLIP morph).
 */
import { useLayoutEffect, useState } from 'react';
import { config, subscribeConfig } from '../config';
import { computeDetailLayout } from '../detailLayout';

/**
 * The reader's page ratio (10:13), NOT the grid card's 3:4. The hero rect uses
 * this so the detail panel and the reader cover are the same rect (see below).
 */
export const PAGE_ASPECT_W = 10;
export const PAGE_ASPECT_H = 13;

/** Detail chrome that must fit inside each band (spec 4c-1b Task 2). */
export const HERO_MARGIN = 24;
export const HERO_CHROME = 40;
/** Never let a band get smaller than this, clamping the hero height if needed. */
const MIN_BAND = HERO_MARGIN + HERO_CHROME + 16;

export interface HeroRect {
  /** Top-left corner + size, in viewport px. Centre is always (vw/2, vh/2). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeHeroRect(vw: number, vh: number): HeroRect {
  // Height from the detail panel's current rule (keeps the dial + narrow cap).
  const { panelH } = computeDetailLayout(
    vw,
    vh,
    config.detailCardScale,
    config.detailSideScale,
    config.detailGap,
  );
  // Clamp so each band (vh - h)/2 stays >= MIN_BAND for the chrome.
  const h = Math.min(panelH, Math.max(120, vh - 2 * MIN_BAND));
  // The hero deliberately diverges from the grid's shared 3:4 (CARD_ASPECT_*):
  // it is 10:13, the reader's page ratio. With this the detail centre panel and
  // the FLIP endpoint land on the reader cover's rect to the pixel, so the reader
  // cover coincides with the detail panel exactly — the doorway entrance (step
  // 4c-2) can hold the cover opaque over the panel with only its contact shadow
  // arriving. The grid stays 3:4 (CARD_ASPECT_* is unchanged).
  const w = (h * PAGE_ASPECT_W) / PAGE_ASPECT_H;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

function writeVars(r: HeroRect): void {
  const s = document.documentElement.style;
  s.setProperty('--hero-x', `${r.x}px`);
  s.setProperty('--hero-y', `${r.y}px`);
  s.setProperty('--hero-w', `${r.w}px`);
  s.setProperty('--hero-h', `${r.h}px`);
}

const same = (a: HeroRect, b: HeroRect): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Subscribe to the live hero rect: writes the CSS variables (before paint) and
 * returns the numeric rect, recomputing on resize and on any config change (so
 * the `detailCardScale` / `detailGap` / `detailSideScale` dials feed it live).
 */
export function useHeroRect(): HeroRect {
  const [rect, setRect] = useState<HeroRect>(() =>
    computeHeroRect(window.innerWidth, window.innerHeight),
  );
  useLayoutEffect(() => {
    const update = () => {
      const next = computeHeroRect(window.innerWidth, window.innerHeight);
      writeVars(next);
      setRect((prev) => (same(prev, next) ? prev : next));
    };
    update();
    window.addEventListener('resize', update);
    const unsub = subscribeConfig(update);
    return () => {
      window.removeEventListener('resize', update);
      unsub();
    };
  }, []);
  return rect;
}
