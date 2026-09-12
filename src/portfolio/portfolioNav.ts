/**
 * Portfolio open/close navigation — the `#view-NN` twin of `readerNav.ts`, and
 * for the same reason: the detail view opens the project view and the project
 * view closes itself back to wherever it was opened from, with no callbacks
 * threaded through the tree.
 *
 * Opening writes `#view-NN` by assigning `location.hash`, which BOTH pushes a
 * history entry (so Back closes the view) AND fires `hashchange` (so
 * `PortfolioGate` mounts the layer and `useDetail` sees it — and ignores it,
 * keeping the detail view frozen, blurred, underneath).
 */

const VIEW_PREFIX = 'view-';

/** The hash (slug, no leading '#') the view was opened from, or null when it was
 *  opened directly by URL. Used to land Escape back on the opener. */
let opener: string | null = null;

/** True when the view was opened from an item (vs a direct URL). */
export function hasOpener(): boolean {
  return opener !== null;
}

/** Open the project view, remembering the item it was opened from. */
export function openPortfolio(project: string): void {
  const current = window.location.hash.replace(/^#/, '');
  opener = current && !current.startsWith(VIEW_PREFIX) ? current : null;
  window.location.hash = `${VIEW_PREFIX}${project}`;
}

/**
 * Record the page being read INSIDE the view: replaceState, so scrolling a
 * project doesn't pile a history entry per page (Escape is still one step back,
 * whichever page you ended on) while a reload still keeps your place.
 *
 * The page in the hash is 1-BASED — `#view-02/3` is the third page — because it
 * is a thing a person reads and types, not an index.
 */
export function replacePortfolio(project: string, page: number): void {
  const next = page > 1 ? `#${VIEW_PREFIX}${project}/${page}` : `#${VIEW_PREFIX}${project}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}

/**
 * Close the view. Opened from an item, walk history back — that pops the pushed
 * `#view-NN` entry and lands on the opener with a clean stack. Opened directly
 * by URL there is nothing to pop, so fall back to the item the project belongs
 * to, which puts you in the detail view for it.
 */
export function closePortfolio(fallbackSlug: string): void {
  if (opener) {
    opener = null;
    window.history.back();
  } else {
    window.location.hash = fallbackSlug;
  }
}

/** Forget the opener — called when the view unmounts, so a later Escape never
 *  acts on a stale entry (e.g. after the view was closed via Back). */
export function clearPortfolioOpener(): void {
  opener = null;
}
