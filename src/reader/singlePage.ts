import { useSyncExternalStore } from 'react';

/**
 * ONE PAGE AT A TIME, for a tall screen (docs/mobile.md). A dial (READER NAV ›
 * READER PAGE, dev), OFF by default: off, nothing about the reader changes.
 * On, and only while the screen is in portrait, the book's stage is shown at
 * twice its size, centred on one page of the spread (FlipBook.tsx,
 * flipbook.css `[data-single]`). Turning is the engine's, as ever: it decides
 * Next or Prev by the half of the book that is pressed, and only one half is
 * on screen. A tap on the screen's other side, toward the spread's other page,
 * moves to that page instead of turning. Whether portrait reading should be
 * this at all is Uko's to decide.
 */
let on = false;
const listeners = new Set<() => void>();

export function setSinglePage(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const mq = window.matchMedia('(orientation: portrait)');
  mq.addEventListener('change', fn);
  return () => {
    listeners.delete(fn);
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
