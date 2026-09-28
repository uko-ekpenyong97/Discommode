import { riveSite } from './covers/rive-site';
import { nosey } from './covers/nosey';
import type { AnyCoverDef, CoverDef, RiveCoverDef } from './types';

/**
 * THE COVER REGISTRY — cover id → its definition. A card names its cover in
 * the manifest (content.ts):
 *
 *   `{ kind: 'shader', id }`  a GLSL file, a dial JSON and a `CoverDef` beside
 *                            them (rive-site, card 02)
 *   `{ kind: 'rive', id, src, artboard, stateMachine }`  a .riv, and a
 *                            `RiveCoverDef` here for its frame and dials
 *                            (nosey, card 04; src/covers/rive/)
 *
 * Adding one is those files and one line here. The stage, the tiles, the morph,
 * the paper and the stills take either kind.
 */
export const COVERS: Record<string, AnyCoverDef> = {
  [riveSite.id]: riveSite,
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
 * A cover's still, written by `npm run covers` (scripts/make-cover-stills.mjs):
 * 'full' (900 px) where the still IS what shows — the detail neighbours,
 * reduced motion, no WebGL (a shader cover) or no runtime (a Rive one); 'sm'
 * (360 px) under a live tile, for its first paint only.
 */
export function coverStillUrl(id: string, size: 'full' | 'sm' = 'full'): string {
  return size === 'sm' ? `/projects/${id}/cover-still-sm.webp` : `/projects/${id}/cover-still.webp`;
}
