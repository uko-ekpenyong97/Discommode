import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { subscribeConfig } from '../config';
import { computeHeroRect } from '../layout/hero';
import { CHROME, subscribeChrome } from './chromeDials';
import { chromeFit } from './chromeFit';
import type { Fit, FitFace } from './chromeFit';

/** The faces of a line, from the data attributes the faces carry (Paper.tsx). */
function facesOf(line: HTMLElement): FitFace[] {
  return [...line.querySelectorAll<HTMLElement>('.paper__shape[data-base]')].map((el) => ({
    base: Number(el.dataset.base),
    min: Number(el.dataset.min),
    reach: Number(el.dataset.reach),
  }));
}

function write(line: HTMLElement, f: Fit | null): void {
  const s = line.style;
  if (!f || (f.fit === 1 && f.margin === CHROME.chromeMargin)) {
    s.removeProperty('--chrome-fit');
    s.removeProperty('--chrome-line-margin');
    return;
  }
  // Rounded UP: the floor puts the smallest face at exactly 44px, and a fit
  // rounded down would leave it a hair under.
  s.setProperty('--chrome-fit', String(Math.ceil(f.fit * 1e5) / 1e5));
  s.setProperty('--chrome-line-margin', `${f.margin.toFixed(2)}px`);
}

/**
 * THE CHROME YIELDS TO THE BOOK (chromeFit.ts). The row under the book and the
 * back shape over it each get a fit for the band between the book — the hero
 * rect, which is the book's and the detail card's — and the viewport's edge,
 * recomputed on resize and whenever a dial that moves either changes. Nothing
 * is measured from layout: the hero rect is computed, the faces' sizes are on
 * them as data.
 */
export function useChromeFit(row: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const vh = window.innerHeight;
      const hero = computeHeroRect(window.innerWidth, vh);
      const lines: [HTMLElement | null, number][] = [
        [row.current, vh - (hero.y + hero.h)],
        [top.current, hero.y],
      ];
      for (const [line, band] of lines) {
        if (!line) continue;
        const faces = facesOf(line);
        write(line, faces.length ? chromeFit(band, CHROME.chromeMargin, CHROME.chromeScale, faces) : null);
      }
    };
    apply();
    window.addEventListener('resize', apply);
    const unConfig = subscribeConfig(apply);
    const unChrome = subscribeChrome(apply);
    return () => {
      window.removeEventListener('resize', apply);
      unConfig();
      unChrome();
    };
  }, [row, top, enabled]);
}
