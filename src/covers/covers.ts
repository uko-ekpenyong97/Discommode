import { qualitySideStill } from '../quality';
import { riveSite } from './covers/rive-site';
import { drex } from './covers/drex';
import { nosey } from './covers/nosey';
import { coverFault } from './faults';
import type { AnyCoverDef, CoverDef, CoverRef, RiveCoverDef } from './types';

/**
 * THE COVER REGISTRY — cover id → its definition. A card names its cover in
 * the manifest (content.ts):
 *
 *   `{ kind: 'shader', id }`  a GLSL file, a dial JSON and a `CoverDef` beside
 *                            them (rive-site, card 02; drex, card 03, whose
 *                            pass A is cached)
 *   `{ kind: 'rive', id, src, artboard, stateMachine, focusInput }`  a .riv, and a
 *                            `RiveCoverDef` here for its frame and dials
 *                            (nosey, card 04; src/covers/rive/)
 *
 * Adding one is those files and one line here. The stage, the tiles, the morph,
 * the paper and the stills take either kind.
 */
export const COVERS: Record<string, AnyCoverDef> = {
  [riveSite.id]: riveSite,
  [drex.id]: drex,
  [nosey.id]: nosey,
};

export function coverDef(id: string): AnyCoverDef | undefined {
  return COVERS[id];
}

/** A shader cover's definition, or undefined for any other kind. */
export function shaderCover(id: string): CoverDef | undefined {
  const def = COVERS[id];
  return def && def.kind !== 'rive' ? def : undefined;
}

/** A Rive cover's definition, or undefined for any other kind. */
export function riveCover(id: string): RiveCoverDef | undefined {
  const def = COVERS[id];
  return def && def.kind === 'rive' ? def : undefined;
}

/**
 * Is this cover live as a detail SIDE card (its ref's `side`)? Read by the
 * detail view's panels, the morph's side cards and the paper alike, so the
 * three always agree (docs/covers.md, "The live side card"). DEV: a cover id in
 * `window.__coversSideLive` is live there too (verify:cover's `sidelive`), and
 * the `sidestill` fault turns every one off.
 */
export function coverSideLive(ref: CoverRef | undefined): boolean {
  if (!ref) return false;
  // Adaptive quality's tier 3 shows the stills (src/quality.ts).
  if (qualitySideStill()) return false;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    if (coverFault('sidestill')) return false;
    const forced = (window as unknown as { __coversSideLive?: string[] }).__coversSideLive;
    if (forced?.includes(ref.id)) return true;
  }
  return ref.side === 'live';
}

/**
 * A cover's still, written by `npm run covers` (scripts/make-cover-stills.mjs):
 * 'full' (900 px) where the still IS what shows — the detail neighbours,
 * reduced motion, no WebGL (a shader cover) or no runtime (a Rive one); 'sm'
 * (360 px) under a live tile, for its first paint only.
 */
export function coverStillUrl(id: string, size: 'full' | 'sm' = 'full'): string {
  return size === 'sm' ? `/projects/${id}/cover-still-sm.webp` : `/projects/${id}/cover-still.webp`;
}
