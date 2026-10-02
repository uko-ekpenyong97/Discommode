import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { subscribeConfig } from '../config';
import { computeHeroLayout } from '../layout/hero';
import { CHROME, subscribeChrome } from './chromeDials';

function write(line: HTMLElement, k: number): void {
  const s = line.style;
  if (k === 1) {
    s.removeProperty('--chrome-fit');
    s.removeProperty('--chrome-line-margin');
    return;
  }
  // Rounded UP: the floor puts the smallest face at exactly 44px, and a fit
  // rounded down would leave it a hair under.
  s.setProperty('--chrome-fit', String(Math.ceil(k * 1e5) / 1e5));
  s.setProperty('--chrome-line-margin', `${(CHROME.chromeMargin * k).toFixed(2)}px`);
}

/**
 * THE BOOK YIELDS TO THE CHROME (layout/hero.ts). The band over the book and
 * under it is reserved for the chrome before the hero is sized, so at its
 * natural size the chrome always clears the book. Only on a short screen does
 * the whole band shrink, by the hero layout's `k` (never under the 44px face
 * floor): this puts that `k` on the row and the top shape — their size, their
 * margin and the row's gaps — recomputed on resize and whenever a dial that
 * moves it changes. Nothing is measured from layout.
 */
export function useChromeFit(row: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const { k } = computeHeroLayout(window.innerWidth, window.innerHeight);
      for (const line of [row.current, top.current]) if (line) write(line, k);
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
