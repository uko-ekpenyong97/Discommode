import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { MIN_TARGET, computeHeroLayout, subscribeHeroInputs } from '../layout/hero';
import { CHROME } from './chromeDials';

function write(line: HTMLElement, k: number, hit: number, margin: number): void {
  const s = line.style;
  if (hit === MIN_TARGET) s.removeProperty('--chrome-hit');
  else s.setProperty('--chrome-hit', `${hit}px`);
  if (k === 1 && margin === CHROME.chromeMargin) {
    s.removeProperty('--chrome-fit');
    s.removeProperty('--chrome-line-margin');
    return;
  }
  // Rounded UP: the floor puts the smallest face at exactly its floor, and a fit
  // rounded down would leave it a hair under.
  s.setProperty('--chrome-fit', String(Math.ceil(k * 1e5) / 1e5));
  s.setProperty('--chrome-line-margin', `${margin.toFixed(2)}px`);
}

/**
 * THE STUDIO DISPLAY'S GAPS ARE THE MOST THERE IS (layout/hero.ts). The band
 * over the book and under it is reserved for the chrome before the hero is
 * sized, so the chrome always clears the book. On a smaller screen the band
 * shrinks: this puts the hero layout's face fit `k` (never under the face
 * floor) on the row and the top shape — their size and the row's gaps — with
 * the least hit area (`--chrome-hit`: 44 on a touch screen, the face floor
 * with a fine pointer) and the margin, recomputed on resize and whenever a
 * dial that moves them changes.
 * Nothing is measured from layout.
 */
export function useChromeFit(row: RefObject<HTMLElement | null>, top: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const { k, hit, margin } = computeHeroLayout(window.innerWidth, window.innerHeight);
      for (const line of [row.current, top.current]) if (line) write(line, k, hit, margin);
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
