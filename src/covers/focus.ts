/**
 * WHICH CARD IS FOCUSED — the detail view's centre card, as a live cover is
 * told it (docs/covers.md, "Focus"). A Rive cover with a `focusInput` (card
 * 04) sets that view-model boolean from this: true while its card is the
 * centre card, false the moment it is not. What the cover does with it is the
 * file's (card 04: the face finishes its clip, errors, and the characters
 * burst out; false cuts back to the looping face).
 *
 *   enter, by the morph   the clicked card, from the morph's START or its
 *                         LANDING: `riveFocusAt` on the cover's COVER panel
 *   enter, by a fade      the card at once — a deep link (#item-04 on load) is
 *                         focused before its instance's first advance
 *   active                the active card, once the strip has LANDED on it:
 *                         a slide (Prev/Next, arrows, swipe, a side click, the
 *                         dropdown) focuses as it lands, so a card the strip
 *                         only passes through is never focused and cut
 *   exit                  none: the card cuts back as the morph starts
 */
export type FocusAt = 'start' | 'landing';

export interface FocusState {
  phase: 'enter' | 'active' | 'exit';
  transition: 'morph' | 'fade';
  activeIndex: number;
  /** The strip is at rest on the active card. */
  landed: boolean;
  focusAt: FocusAt;
}

/** The dial's value out of a Rive cover's dial values (anything else: start). */
export function riveFocusAt(values: { rive?: { riveFocusAt?: unknown } } | undefined): FocusAt {
  return values?.rive?.riveFocusAt === 'landing' ? 'landing' : 'start';
}

/** The index of the focused card, or null for none. */
export function focusedIndex(s: FocusState): number | null {
  if (s.phase === 'exit') return null;
  if (s.phase === 'enter') {
    if (s.transition === 'fade') return s.activeIndex;
    return s.focusAt === 'start' ? s.activeIndex : null;
  }
  return s.landed ? s.activeIndex : null;
}

/** How near the strip's position has to be to its target to have landed. */
export const LANDED_EPS = 0.02;
