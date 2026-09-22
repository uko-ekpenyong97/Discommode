/**
 * The paper's way OUT, as a module gate — so the paths that leave the detail
 * view (`useDetail.close`, the Read issue / Open project actions) can wait for
 * the DOM cards to come back without a callback threaded through the tree.
 *
 * Every one of those paths hands its card to something that needs the DOM: the
 * exit morph carries the DOM faces back to the grid, and the reader's doorway
 * settles its cover onto the DOM panel. So while the canvas is carrying the
 * cards, leaving is two steps — the reverse hand-off (DOM back over the canvas,
 * {@link HANDOFF_MS}), THEN the existing choreography, untouched.
 *
 * With no paper registered, or the paper already on the DOM, `afterHandOut`
 * runs its continuation synchronously, so nothing about the old paths changes
 * when the paper is off.
 */

/** The crossfade, both ways. The portfolio view's plate crossfade, and for the
 *  same reason: two surfaces showing the same pixels, one replacing the other. */
export const HANDOFF_MS = 120;

type HandOut = (then: () => void) => void;
let handOut: HandOut | null = null;

/** The paper layer registers its reverse hand-off here while it is mounted. */
export function registerHandOut(fn: HandOut): () => void {
  handOut = fn;
  return () => {
    if (handOut === fn) handOut = null;
  };
}

/** Run `then` once the DOM is carrying the cards again — at once if it already is. */
export function afterHandOut(then: () => void): void {
  if (handOut) handOut(then);
  else then();
}
