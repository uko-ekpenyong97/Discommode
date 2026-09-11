import { createContext, useContext } from 'react';

/**
 * The sheet's scroller element, shared down the block tree.
 *
 * Everything in the project view that asks "is this on screen?" — the reveal
 * observer, a video's play/pause, a Rive artboard's lazy mount — must ask it
 * against the SCROLLER, not the window: the page itself never scrolls, so the
 * window's viewport says every block is permanently visible. One context rather
 * than prop-drilling a ref through nine block components.
 */
export const ScrollerContext = createContext<HTMLElement | null>(null);

export function useScroller(): HTMLElement | null {
  return useContext(ScrollerContext);
}
