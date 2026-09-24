import { riveSite } from './covers/rive-site';
import type { CoverDef } from './types';

/**
 * THE COVER REGISTRY — cover id → shader, dials and uniform code. A card
 * names its cover in the manifest (`cover: { kind: 'shader', id }`,
 * content.ts); adding one (Nosey's, say) is a GLSL file, a dial JSON, a
 * `CoverDef` beside them, and one line here. Nothing else changes.
 */
export const COVERS: Record<string, CoverDef> = {
  [riveSite.id]: riveSite,
};

export function coverDef(id: string): CoverDef | undefined {
  return COVERS[id];
}

/**
 * A cover's still, written by `npm run covers` (scripts/make-cover-stills.mjs):
 * 'full' (900 px, ~1 MB) where the still IS what shows — the detail neighbours,
 * reduced motion, no WebGL; 'sm' (360 px) under a live tile, for its first
 * paint only.
 */
export function coverStillUrl(id: string, size: 'full' | 'sm' = 'full'): string {
  return size === 'sm' ? `/projects/${id}/cover-still-sm.webp` : `/projects/${id}/cover-still.webp`;
}
