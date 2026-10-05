import { useSyncExternalStore } from 'react';

/**
 * ONE PAGE AT A TIME, for a tall screen (docs/mobile.md). A dial (READER NAV ›
 * READER PAGE, dev), ON by default on a touch screen (a coarse pointer: a
 * tablet) and off anywhere else; and whatever the dial says, only while the
 * screen is in portrait. Off, nothing about the reader changes.
 *
 * On, the hero is sized for ONE page, not the open book (layout/hero.ts), so
 * the page fills the screen and the open spread is wider than it; the stage is
 * moved so one page of the spread is centred (FlipBook.tsx, flipbook.css
 * `[data-single]`). The closed cover sits on the hero rect, as ever, so the
 * detail card (sized by the same rule) opens into it. Turning is the engine's:
 * it decides Next or Prev by the half of the book that is pressed, and only
 * one half is on screen. A tap on the screen's other side, toward the spread's
 * other page, moves to that page instead of turning.
 */
const coarse = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** The dial's default: on for a coarse pointer. */
export const singlePageDefault = (): boolean => coarse();

let on = singlePageDefault();
const listeners = new Set<() => void>();

export function setSinglePage(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn();
}

/** The dial, whatever the orientation. */
export const singlePageOn = (): boolean => on;

/** Whether a viewport of this size reads one page at a time: the dial is on
 *  and it is portrait (as `(orientation: portrait)`: height ≥ width). */
export const singlePageAt = (vw: number, vh: number): boolean => on && vh >= vw;

/** Hear the dial change (not the orientation: a resize is the caller's). */
export function subscribeSinglePage(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const subscribe = (fn: () => void) => {
  const unDial = subscribeSinglePage(fn);
  const mq = window.matchMedia('(orientation: portrait)');
  mq.addEventListener('change', fn);
  return () => {
    unDial();
    mq.removeEventListener('change', fn);
  };
};
const get = () => on && window.matchMedia('(orientation: portrait)').matches;

/** True while the dial is on and the screen is in portrait. */
export const useSinglePage = (): boolean => useSyncExternalStore(subscribe, get, () => false);

// DEV: the checks turn it on without the dock.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __singlePage?: typeof setSinglePage }).__singlePage = setSinglePage;
}
