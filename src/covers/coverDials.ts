import { COVERS } from './covers';
import { dialDefaults } from './dialValues';
import type { DialValues } from './dialValues';

/**
 * The covers' live dial values — a module store, like the paper's
 * (paperDials.ts). Each cover starts at its JSON's defaults (the tuned values);
 * the dev COVER panel (src/dev/coverDials.ts, at #item-02?intro) writes here and
 * every renderer on the page rebinds.
 *
 * Plus two dials that belong to the SITE rather than to a cover:
 *
 *   coverBackdrop  'sky' (default): nothing is drawn behind a cover — its ground
 *                  is 44% opaque and the SkyLayer shows through it, with no
 *                  scrim and no darkening between them. 'solid': one colour,
 *                  `coverBackdropColor`, laid under it.
 *   coverMaxDpr    the cap on a cover's backing store (2).
 */
export interface SiteCoverDials {
  coverBackdrop: 'sky' | 'solid';
  coverBackdropColor: string;
  coverMaxDpr: number;
}

export const SITE_COVER_DEFAULTS: SiteCoverDials = {
  coverBackdrop: 'sky',
  coverBackdropColor: '#0b0b0e',
  coverMaxDpr: 2,
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
