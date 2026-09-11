import { useLayoutEffect } from 'react';

/**
 * The scroll reveal: ONE IntersectionObserver for the whole sheet, adding
 * `is-in` to every `[data-reveal]` block the first time it comes into view.
 *
 * One-way on purpose — the class stays once seen, so scrolling back up shows
 * settled content rather than re-playing the entrance, and a block can never
 * flicker at the boundary. Once switched on, an element is unobserved: the
 * observer's work shrinks as you read.
 *
 * The root is the SHEET SCROLLER, never the window. The page itself does not
 * scroll — the scroller is one viewport tall with a spacer behind it — so
 * against the window every block in every article would count as permanently
 * visible and the whole system would fire at once on mount.
 *
 * `scanKey` is the identity of the rendered article window: when the strip
 * steps a column, new articles mount and the observer rescans.
 */
export function useReveal(root: HTMLElement | null, scanKey: string): void {
  useLayoutEffect(() => {
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { root, threshold: 0 },
    );
    for (const el of root.querySelectorAll('[data-reveal]:not(.is-in)')) io.observe(el);
    return () => io.disconnect();
  }, [root, scanKey]);
}
