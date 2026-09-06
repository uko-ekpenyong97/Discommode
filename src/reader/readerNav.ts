/**
 * Reader open/close navigation — a tiny module store (like `setEnvOverride` /
 * `config`) so the detail view can open the reader and the reader can close
 * itself back to wherever it was opened from, without threading callbacks
 * through the whole tree.
 *
 * Opening writes `#read-NN` by assigning `location.hash`, which BOTH pushes a
 * history entry (so the browser Back button closes the reader) AND fires
 * `hashchange` (so `ReaderGate` mounts the layer and `useDetail` sees it — and
 * ignores it, keeping the detail view frozen underneath).
 */

const READ_PREFIX = 'read-';

/** The hash (slug, no leading '#') the reader was opened from, or null when it
 *  was opened directly by URL. Used to land Escape back on the opener. */
let opener: string | null = null;

/** Open the reader for an issue, remembering the item it was opened from. */
export function openReader(issue: string): void {
  const current = window.location.hash.replace(/^#/, '');
  opener = current && !current.startsWith(READ_PREFIX) ? current : null;
  // Assigning location.hash pushes a history entry + fires hashchange.
  window.location.hash = `${READ_PREFIX}${issue}`;
}

/**
 * Close the reader. If it was opened from an item we walk history back — that
 * pops the pushed `#read-NN` entry and lands on the opener with a clean stack
 * (spread changes inside the reader are replaceState, so nothing else piled up).
 * Opened directly by URL, there is nothing to pop, so fall back to `#item-01`.
 */
export function closeReader(): void {
  if (opener) {
    opener = null;
    window.history.back();
  } else {
    window.location.hash = 'item-01';
  }
}

/** Forget the opener — called when the reader layer unmounts, so a later Escape
 *  never acts on a stale entry (e.g. after the reader was closed via Back). */
export function clearOpener(): void {
  opener = null;
}
