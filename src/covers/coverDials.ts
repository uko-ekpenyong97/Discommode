import { COVERS } from './covers';
import { dialDefaults } from './dialValues';
import type { DialValues } from './dialValues';
import type { CoverBackdrop } from './types';

/**
 * The covers' live dial values — a module store, like the paper's
 * (paperDials.ts). Each cover starts at its JSON's defaults (the tuned values);
 * the dev COVER panel (src/dev/coverDials.ts, at #item-02?intro) writes here and
 * every renderer on the page rebinds.
 *
 * Plus dials that belong to the SITE rather than to a cover:
 *
 *   coverBackdrop  'sky' (default): nothing is drawn behind a cover — its ground
 *                  is 44% opaque and the SkyLayer shows through it, with no
 *                  scrim and no darkening between them. 'solid': one colour,
 *                  `coverBackdropColor`, laid under it. Only under a cover
 *                  whose own `coverBackdrop` is 'sky' (`backdropUnder`): a
 *                  'solid' cover has an opaque ground of its own.
 *   coverMaxDpr    the cap on a cover's backing store (2).
 *   coverRenderMax  the largest a GRID TILE's cover is rendered, px on its
 *                  long edge (896): the tile shown at rest at the old
 *                  `cardWidth` 300 — 400 tall, × 1.12 focused, × 2. A bigger
 *                  tile gets the same render, upscaled into its own canvas by
 *                  the 2D copy (coverStage.ts). Not the hero, not the morph
 *                  card: the detail view draws at its full size.
 *   coverPaperShade  in the detail view, how much of the paper's light (the
 *                  creases' screen-blend highlights and trough shading) a
 *                  cover takes, per unit of its own alpha: 1 (default) is the
 *                  full paper under opaque ink and none where the ground is
 *                  transparent; 0 is no paper light on the cover at all. The
 *                  dent, the squash and the fold are not light: unchanged.
 */
export interface SiteCoverDials {
  coverBackdrop: 'sky' | 'solid';
  coverBackdropColor: string;
  coverMaxDpr: number;
  coverRenderMax: number;
  coverPaperShade: number;
}

export const SITE_COVER_DEFAULTS: SiteCoverDials = {
  coverBackdrop: 'sky',
  coverBackdropColor: '#0b0b0e',
  coverMaxDpr: 2,
  coverRenderMax: 896,
  coverPaperShade: 1,
};

let site: SiteCoverDials = { ...SITE_COVER_DEFAULTS };
const values = new Map<string, DialValues>();
for (const [id, def] of Object.entries(COVERS)) values.set(id, dialDefaults(def.dials));

const listeners = new Set<() => void>();
let version = 0;

export function coverValues(id: string): DialValues {
  return values.get(id)!;
}

export function siteCoverDials(): SiteCoverDials {
  return site;
}

/** Cover `id`'s own backdrop (types.ts, `CoverBackdrop`): 'sky' unless its
 *  definition says 'solid'. */
export function coverBackdrop(id: string): CoverBackdrop {
  return COVERS[id]?.coverBackdrop ?? 'sky';
}

/** The colour laid under cover `id`, or null for none: the site's
 *  `coverBackdropColor` when the site dial is 'solid' and the cover lets the
 *  sky through; never under a 'solid' cover. */
export function backdropUnder(id: string): string | null {
  return site.coverBackdrop === 'solid' && coverBackdrop(id) === 'sky' ? site.coverBackdropColor : null;
}

export function setCoverValues(id: string, v: DialValues) {
  values.set(id, v);
  version++;
  for (const l of listeners) l();
}

export function setSiteCoverDials(next: Partial<SiteCoverDials>) {
  site = { ...site, ...next };
  version++;
  for (const l of listeners) l();
}

/** Bumped on every change: a renderer compares it to know when to rebind. */
export function coverDialsVersion(): number {
  return version;
}

export function subscribeCoverDials(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
