import { useLayoutEffect } from 'react';

/**
 * The scroll reveal: one IntersectionObserver PER PAGE, adding `is-in` to every
 * `[data-reveal]` block the first time it comes into view.
 *
 * One-way on purpose — the class stays once seen, so scrolling back up shows
 * settled content rather than re-playing the entrance, and a block can never
 * flicker at the boundary. Once switched on, an element is unobserved: the
 * observer's work shrinks as you read.
 *
 * The root is each PAGE's own scroll container, and that is the one thing that
 * changed with the sheets. Every page of a project now occupies the SAME RECT,
 * all of them laid out from the first frame so the track can be built from
 * measured heights — so an observer rooted on the scroller would report every
 * page's first viewport as on screen at mount, and a project would reveal
 * itself all at once before you had read a line of it. `visibility: hidden`
 * does not help: an IntersectionObserver does not notice it.
 *
 * Rooted on the page, the question is the one actually being asked — is this
 * block within its own page's viewport — and it stays right whether that page
 * is the one showing or the one three sheets away.
 *
 * `scanKey` is the identity of what is rendered: a different project mounts a
 * different set of pages, and the observers are rebuilt.
 */
export function useReveal(root: HTMLElement | null, scanKey: string): void {
  useLayoutEffect(() => {
    if (!root) return;
    const observers: IntersectionObserver[] = [];
    for (const page of root.querySelectorAll<HTMLElement>('.pv-page__scroll')) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        },
        { root: page, threshold: 0 },
      );
      for (const el of page.querySelectorAll('[data-reveal]:not(.is-in)')) io.observe(el);
      observers.push(io);
    }
    return () => {
      for (const io of observers) io.disconnect();
    };
  }, [root, scanKey]);
}
