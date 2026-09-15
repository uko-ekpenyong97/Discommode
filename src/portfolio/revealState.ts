/**
 * PUTTING A REVEAL IN ITS FINAL STATE WITHOUT PLAYING IT.
 *
 * The rule this file exists for: **a hand-off never happens mid-reveal.**
 *
 * Both hand-offs are a crossfade between two surfaces showing the same pixels,
 * and one of those surfaces is a CAPTURE — a screenshot of a settled page. The
 * live page is the half that moves: a reveal is 800ms of opacity, blur and
 * offset, and a page caught part-way through one is not the page the capture
 * was taken from. It is the same document at a different moment, and the
 * crossfade has no way to hide that.
 *
 * So at every moment a page is about to swap with a sheet, whatever is on
 * screen is put into its finished state FIRST, and put there with no animation
 * at all. The reveal is still the reveal everywhere else — a block scrolled
 * into view plays exactly as it always did. What changes is that it never plays
 * across a swap.
 *
 * `is-instant` is what "with no animation" means, and it is permanent rather
 * than one frame. A class that came off again would let the animation start on
 * the frame it was removed — `animation` runs when the declaration appears, and
 * re-declaring it is re-starting it. An element that was settled was never
 * animated, and stays that way.
 */

/** The reveal machinery's own selectors. Everything `useReveal` observes, plus
 *  the run wrapper, whose hairline is a transition on a pseudo-element. */
const REVEAL_SELECTOR = '[data-reveal]';

/**
 * THE REVEAL'S OWN ANIMATIONS, and nothing else in the subtree.
 *
 * A block is allowed to contain animations that have nothing to do with the
 * reveal — the Rive placeholder's spinner is one, and it is infinite. Finishing
 * whatever happens to be running inside a block would stop things this file has
 * no business stopping, and `finish()` on an infinite animation throws anyway.
 */
function isRevealAnimation(a: Animation): boolean {
  const name = (a as CSSAnimation).animationName;
  if (name === 'pv-reveal' || name === 'pv-flip') return true;
  const property = (a as CSSTransition).transitionProperty;
  const target = a.effect && 'target' in a.effect ? (a.effect.target as Element | null) : null;
  if (!property || !target) return false;
  return target.classList.contains('reveal-char') || target.classList.contains('pv-run');
}

/**
 * Finish every reveal animation inside `root`, in ONE pass.
 *
 * One `getAnimations` call for the whole subtree rather than one per block. The
 * sweep this serves runs on the frame a tear BEGINS, which is inside the 20ms
 * budget, and the per-element version forced a style resolution per block; a
 * 33ms frame was seen there once and has not reproduced, so this is insurance
 * rather than a fix for something proven. It is also simply the right shape.
 *
 * Completed rather than cancelled: a cancelled transition snaps back to where
 * it started, which is the opposite of what is wanted.
 */
function finishRevealsIn(root: Element): void {
  for (const animation of root.getAnimations({ subtree: true })) {
    if (isRevealAnimation(animation)) animation.finish();
  }
}

/** Every reveal in `page`, settled. Used when a page hands over to a sheet:
 *  the tail capture is of the whole page, so the whole page has to match it. */
export function settleAllReveals(page: HTMLElement): void {
  finishRevealsIn(page);
  for (const el of page.querySelectorAll(REVEAL_SELECTOR)) el.classList.add('is-in', 'is-instant');
}

/** One element into its finished state, now. For the banded sweeps, which are
 *  choosing elements one at a time anyway. */
function settle(el: Element): void {
  finishRevealsIn(el);
  el.classList.add('is-in', 'is-instant');
}

/**
 * Every reveal in `page` that is on screen, or within `aheadPx` of coming on
 * screen, settled. Everything further down is left alone and will play its
 * reveal the way it always has when it is scrolled to.
 *
 * `aheadPx` is what lets the LAST blocks of a section be settled before the
 * reader has actually reached them: past 80% of a run there is not enough page
 * left for an 800ms reveal to finish in, and the tear is what is on the other
 * side of it.
 */
export function settleRevealsInView(page: HTMLElement, aheadPx = 0): void {
  const scroll = page.querySelector<HTMLElement>('.pv-page__scroll');
  if (!scroll) return;
  const box = scroll.getBoundingClientRect();
  // The page's own window, in viewport coordinates, grown downward. Measured
  // from rects rather than from `offsetTop` because the offset parent inside a
  // page is not something this file should have an opinion about.
  const top = box.top;
  const bottom = box.bottom + aheadPx;
  for (const el of scroll.querySelectorAll(REVEAL_SELECTOR)) {
    if (el.classList.contains('is-instant')) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom >= top && r.top <= bottom) settle(el);
  }
}

/**
 * Every reveal within `withinPx` of the END of the page's content, settled.
 *
 * The companion to {@link settleRevealsInView} and a different question: that
 * one is about what the reader can see, this one is about what the TEAR will
 * see. The last screen of a run is what the tail capture is a picture of, and a
 * reader moving fast reaches the tear before a reveal that started down there
 * could have finished.
 */
export function settleRevealsNearEnd(page: HTMLElement, withinPx: number): void {
  const scroll = page.querySelector<HTMLElement>('.pv-page__scroll');
  if (!scroll) return;
  const box = scroll.getBoundingClientRect();
  // Where the content ends, in viewport coordinates — the scroll height read
  // against where the container currently is.
  const end = box.top + scroll.scrollHeight - scroll.scrollTop;
  for (const el of scroll.querySelectorAll(REVEAL_SELECTOR)) {
    if (el.classList.contains('is-instant')) continue;
    if (el.getBoundingClientRect().bottom >= end - withinPx) settle(el);
  }
}

/**
 * Whether `page` is close enough to its end that a reveal starting now would
 * still be running when the tear begins.
 *
 * It is a fraction of the run and not a distance, because a run's length is the
 * section's and the reveal's length is fixed: on a short section the whole page
 * is inside the window, which is correct.
 */
export function nearPageEnd(offset: number, pageScroll: number, at = 0.8): boolean {
  return pageScroll <= 0 || offset >= pageScroll * at;
}
