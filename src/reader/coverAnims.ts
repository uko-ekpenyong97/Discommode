/**
 * The hover animations that live on an issue's illustrated cover.
 *
 * Twenty objects are drawn into `cover-illustrated.png`; each also exists as a
 * hand-drawn loop exported from Procreate. `npm run anims` registers each loop
 * onto the cover and writes `/issues/<issue>/anim/manifest.json` — this module
 * loads that manifest and does the two bits of geometry the layer needs.
 *
 * Two rectangles per object, both in 2000x2600 COVER SPACE, and they are not the
 * same rectangle:
 *
 *   hitRect      what the pointer is tested against. Straight from Figma, so it
 *                is the region the artwork "occupies" as far as the layout is
 *                concerned — a little larger than the ink.
 *   displayRect  where the animation is actually painted. Derived from the alpha
 *                union across every frame, so it can be LARGER than hitRect when
 *                the animation moves outside the resting pose.
 *
 * Cover space is converted to screen pixels once per frame of geometry change,
 * not per object: the cover is rendered `object-fit: contain`, so one uniform
 * scale and one offset describe the whole mapping.
 */

export interface CoverRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `'loop'` runs forever; `'once'` plays through and holds its last frame. */
export type CoverAnimMode = 'loop' | 'once';

/**
 * Which frame the cover rests on. `'first'` — nearly everything — means the
 * resting image IS the animation's first frame, so starting the loop changes
 * nothing. `'last'` is for a build-up that should read as finished at rest: the
 * shelf of books rests full, and hovering empties it and rebuilds. There the
 * still and frame 1 differ on purpose, so the loop has to be faded in.
 */
export type CoverAnimRest = 'first' | 'last';

/** Cross-fade into the loop when the still and frame 1 differ by design. */
export const ENTER_FADE_MS = 150;
/** Cross-fade the still back over the loop when returning to rest. */
export const LEAVE_FADE_MS = 120;

/** Which face of the issue an object is drawn on. */
export type CoverAnimFace = 'cover' | 'back';

export interface CoverAnim {
  id: string;
  /** The face it lives on. Manifests from before the back cover had objects
   *  carry none, which means the cover. */
  face?: CoverAnimFace;
  /** Figma stack order. Higher wins when two hit rects overlap. */
  z: number;
  /** Animated WebP, starting on FRAME 1 — which is also the still. */
  src: string;
  /** Frame 1, in the same crop: the resting image. */
  still: string;
  displayRect: CoverRect;
  hitRect: CoverRect;
  frames: number;
  fps: number;
  mode: CoverAnimMode;
  restFrame: CoverAnimRest;
  /** One pass in ms (`frames × 1000/fps`). Drives the leave timing. */
  durationMs: number;
  /** Encoded size of `src`, for the preload budget. */
  bytes: number;
}

export interface CoverAnimManifest {
  issue: string;
  coverW: number;
  coverH: number;
  /** The cover with every animated object hidden — what the layer draws onto. */
  plate: string;
  /** The same thing with every frame 1 composited back on, pre-flattened. */
  rest: string;
  /** The back cover's pair, when the issue has back-cover objects. */
  back?: { backW: number; backH: number; plate: string; rest: string };
  objects: CoverAnim[];
}

/** One face of a manifest, as the layer draws it: its space, its backdrop, and
 *  its objects (z-sorted, as stored). Null when the face has nothing to draw. */
export interface FaceAnims {
  w: number;
  h: number;
  plate: string;
  objects: CoverAnim[];
}

export function faceOf(m: CoverAnimManifest, face: CoverAnimFace): FaceAnims | null {
  const objects = m.objects.filter((o) => (o.face ?? 'cover') === face);
  if (objects.length === 0) return null;
  if (face === 'cover') return { w: m.coverW, h: m.coverH, plate: m.plate, objects };
  if (!m.back) return null;
  return { w: m.back.backW, h: m.back.backH, plate: m.back.plate, objects };
}

/** How the cover is laid into a box: uniform scale + letterbox offset. */
export interface CoverFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * `object-fit: contain` for a cover in a box. In practice the hero rect is
 * exactly 10:13 and the cover is 2000x2600, so the offsets come out zero and the
 * scale is `boxW / coverW` — but deriving it properly means the layer stays
 * correct if either ratio ever moves, instead of silently drifting.
 */
export function fitCover(
  boxW: number,
  boxH: number,
  coverW: number,
  coverH: number,
): CoverFit {
  if (boxW <= 0 || boxH <= 0 || coverW <= 0 || coverH <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(boxW / coverW, boxH / coverH);
  return {
    scale,
    offsetX: (boxW - coverW * scale) / 2,
    offsetY: (boxH - coverH * scale) / 2,
  };
}

/** A cover-space rect as CSS pixels within the box. */
export function toScreen(rect: CoverRect, fit: CoverFit) {
  return {
    left: rect.x * fit.scale + fit.offsetX,
    top: rect.y * fit.scale + fit.offsetY,
    width: rect.w * fit.scale,
    height: rect.h * fit.scale,
  };
}

/** A point in box pixels back to cover space. */
export function toCover(x: number, y: number, fit: CoverFit): { x: number; y: number } | null {
  if (fit.scale <= 0) return null;
  return { x: (x - fit.offsetX) / fit.scale, y: (y - fit.offsetY) / fit.scale };
}

/**
 * The object under a cover-space point, or null. Objects overlap on the cover
 * (the shark lies on the bed), so the Figma stack order decides: highest z wins,
 * exactly as it does visually.
 */
export function hitTest(objects: CoverAnim[], x: number, y: number): CoverAnim | null {
  let found: CoverAnim | null = null;
  for (const o of objects) {
    const r = o.hitRect;
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
    if (!found || o.z > found.z) found = o;
  }
  return found;
}

/**
 * How long to keep playing after the pointer leaves, so the loop finishes rather
 * than cutting mid-gesture.
 *
 * A `loop` object has been running `elapsed % duration` into its current pass,
 * so the remainder of that pass is what is left; the wait can never exceed one
 * pass. A `once` object has stopped on its last frame, so the wait is whatever
 * is left of its single pass, and zero once it is over.
 */
export function timeToLoopEnd(
  elapsedMs: number,
  durationMs: number,
  mode: CoverAnimMode = 'loop',
): number {
  if (!(durationMs > 0)) return 0;
  const elapsed = Math.max(0, elapsedMs);
  if (mode === 'once') return Math.max(0, durationMs - elapsed);
  const into = elapsed % durationMs;
  return into === 0 ? 0 : durationMs - into;
}

/**
 * How long the still takes to get out of the way when the loop starts.
 *
 * Zero for a `'first'` object: the animation's opening frame is the very image
 * already on screen, so anything but an instant swap would be a cross-fade
 * between two identical pictures. A `'last'` object rests on a DIFFERENT frame,
 * so cutting would snap the shelf from full to empty; that one dissolves.
 */
export function enterFadeMs(o: Pick<CoverAnim, 'restFrame'>): number {
  return o.restFrame === 'last' ? ENTER_FADE_MS : 0;
}

/** What happens after the pointer leaves: how long to keep playing, then how
 *  long to cross-fade the still back in. */
export interface LeavePlan {
  wait: number;
  fade: number;
}

/**
 * The return to rest.
 *
 * `wait` finishes the pass in flight rather than cutting a hand-drawn loop mid
 * gesture. `fade` then dissolves the still back over it — except in the one case
 * where there is provably nothing to dissolve: a `once` animation that has
 * already run out is FROZEN on its last frame, and for a `'last'` object that
 * frame is the still. Swapping is then a no-op, so it happens immediately.
 */
export function leavePlan(
  elapsedMs: number,
  o: Pick<CoverAnim, 'durationMs' | 'mode' | 'restFrame'>,
): LeavePlan {
  const wait = timeToLoopEnd(elapsedMs, o.durationMs, o.mode);
  const frozenOnStill =
    o.mode === 'once' && o.restFrame === 'last' && elapsedMs >= o.durationMs;
  return { wait, fade: frozenOnStill ? 0 : LEAVE_FADE_MS };
}

/** Total encoded bytes the layer will pull for an issue (stills excluded). */
export function manifestBytes(m: CoverAnimManifest): number {
  return m.objects.reduce((n, o) => n + o.bytes, 0);
}

/**
 * Manifests are fetched once per URL and shared. The promise itself is cached,
 * so the detail view and the reader mounting in the same tick make one request
 * between them rather than two. A failed fetch is not cached — the layer simply
 * renders nothing and a later mount can retry.
 */
const cache = new Map<string, Promise<CoverAnimManifest>>();

export function loadCoverAnims(url: string): Promise<CoverAnimManifest> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<CoverAnimManifest>;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });
  cache.set(url, p);
  return p;
}

/** Test seam: drop the memoised manifests. */
export function clearCoverAnimCache(): void {
  cache.clear();
}
