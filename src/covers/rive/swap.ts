/**
 * Which artboard a Rive cover's instance shows during the grid↔detail morph
 * (docs/covers.md, "The artboard swap"). The swap happens at one END of the
 * travel — `riveSwapAt` on the cover's COVER panel:
 *
 *   landing (default)  on the way in the morph card is the grid's artboard and
 *                      the hero is the detail one from the frame it lands on;
 *                      on the way out the card is the hero, carrying on, and
 *                      the tile is the grid's again once it has landed
 *   start              the card is already what it is going to be: the hero on
 *                      the way in, the grid's on the way out
 */
export type RivePlayerRole = 'grid' | 'hero';
export type RiveSwapAt = 'landing' | 'start';

/** The dial's value out of a Rive cover's dial values (anything else: landing). */
export function riveSwapAt(values: { rive?: { riveSwapAt?: unknown } } | undefined): RiveSwapAt {
  return values?.rive?.riveSwapAt === 'start' ? 'start' : 'landing';
}

/** The player the morph's centre card shows. */
export function morphRole(swapAt: RiveSwapAt, entering: boolean): RivePlayerRole {
  return entering === (swapAt === 'start') ? 'hero' : 'grid';
}
