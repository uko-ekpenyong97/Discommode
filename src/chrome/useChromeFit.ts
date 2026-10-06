import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { computeHeroLayout, subscribeHeroInputs } from '../layout/hero';
import { CHROME } from './chromeDials';

function write(line: HTMLElement, k: number, margin: number): void {
  const s = line.style;
  if (k === 1 && margin === CHROME.chromeMargin) {
    s.removeProperty('--chrome-fit');
    s.removeProperty('--chrome-line-margin');
    return;
  }
  // Rounded UP: the floor puts the smallest face at exactly 44px, and a fit
  // rounded down would leave it a hair under.
  s.setProperty('--chrome-fit', String(Math.ceil(k * 1e5) / 1e5));
  s.setProperty('--chrome-line-margin', `${margin.toFixed(2)}px`);
}

/**
 * THE STUDIO DISPLAY'S GAPS ARE THE MOST THERE IS (layout/hero.ts). The band
 * over the book and under it is reserved for the chrome before the hero is
 * sized, so the chrome always clears the book. On a smaller screen the band
 * shrinks: this puts the hero layout's face fit `k` (never under the 44px face
 * floor) on the row and the top shape — their size and the row's gaps — and
 * its margin, recomputed on resize and whenever a dial that moves it changes.
 * Nothing is measured from layout.
 */
export function useChromeFit(row: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const { k, margin } = computeHeroLayout(window.innerWidth, window.innerHeight);
      for (const line of [row.current, top.current]) if (line) write(line, k, margin);
    };
    apply();
    window.addEventListener('resize', apply);
    const unsubscribe = subscribeHeroInputs(apply);
    return () => {
      window.removeEventListener('resize', apply);
      unsubscribe();
    };
  }, [row, top, enabled]);
}
