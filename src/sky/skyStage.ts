/**
 * The sky stage — ONE canvas, ONE WebGL2 context, for the whole app.
 *
 * The sky is drawn in two places now: behind the grid, and under the paper in
 * the project view (which is a layer ABOVE the grid, so it cannot simply be the
 * same element left showing through). The obvious way to do that is two
 * `<canvas>` elements, and it is the wrong way: two contexts is two programs,
 * two rAF loops and two five-octave fbm passes for one sky, on a machine that
 * is also running a three.js sheet.
 *
 * So there is one canvas, created here, and the components that want it CLAIM
 * it. A claim appends the element to the claimant's host; releasing it hands it
 * back to whoever claimed it before. Moving a canvas in the DOM does not touch
 * its drawing buffer — the context, the program and the eased state all survive
 * the move, and the sky the project view opens onto is mid-drift exactly where
 * the grid's was.
 *
 * The claim stack is LAST IN WINS, which is also paint order: the project view
 * mounts over the app, so its host is on top and takes the canvas; closing the
 * view pops it and the grid's host has it back.
 *
 * Every host keeps a CSS fallback gradient of the current sky painted behind
 * the canvas (see `skyFallbackCss`), so a host that does not currently hold it
 * — or a browser with no WebGL2 at all — still paints the right colours in the
 * right places instead of a hole.
 */
import { config, subscribeConfig } from '../config';
import { createSkyEngine } from './skyEngine';
import type { SkyEngine, SkyTarget } from './skyEngine';

let canvas: HTMLCanvasElement | null = null;
let engine: SkyEngine | null = null;
let started = false;

/** The hosts that have claimed the canvas, oldest first. The last one has it. */
const hosts: HTMLElement[] = [];

/** The last target pushed in, so a host that only paints the fallback — and the
 *  contrast probe — can read the sky without owning it. */
let target: SkyTarget = {
  sun: 0,
  dayPhase: 'rising',
  cloud: 0,
  fog: 0,
  rain: 0,
  storm: 0,
  wind: 0,
  // No moon until the data layer says otherwise, which is also what the shader
  // draws below its 0.02 gate: nothing.
  moonFraction: 0,
  moonWaxing: true,
};
const listeners = new Set<() => void>();

function start(): void {
  if (started) return;
  started = true;
  const el = document.createElement('canvas');
  el.className = 'sky-layer__canvas';
  el.setAttribute('aria-hidden', 'true');
  const made = createSkyEngine(el);
  if (!made) {
    console.warn('[sky] WebGL2 unavailable — using the CSS gradient fallback.');
    return;
  }
  canvas = el;
  engine = made;
  // REPLAY THE TARGET INTO IT. The engine is built lazily by whichever host
  // claims first, and it is born at zeros — which is a clear midnight. Nothing
  // guarantees that a target has not already been pushed by the time that
  // happens (a cold load straight into the project view claims from two hosts
  // in one commit), and an engine that missed the push has no way to ask for
  // it. Snapping rather than easing: this is a first paint, not a change.
  made.setEnv(target, true);
  // The resolution dial changes the backing-store size, which only `resize`
  // knows how to do — and it only runs on a window resize otherwise.
  subscribeConfig(() => made.syncSize());
}

function attach(): void {
  if (!canvas) return;
  const top = hosts[hosts.length - 1];
  if (!top) {
    canvas.remove();
    return;
  }
  // SWEEP OUT ANYTHING THAT IS NOT OURS. There is exactly one sky, so a second
  // `.sky-layer__canvas` in a host is a ghost — in dev a hot swap builds a new
  // stage module, and hence a new canvas, while the previous module's element
  // is still sitting in the DOM with a live loop behind it. Left alone it is
  // the thing on screen, frozen at whatever it last drew, and no target will
  // ever reach it again.
  for (const stale of top.querySelectorAll('canvas.sky-layer__canvas')) {
    if (stale !== canvas) stale.remove();
  }
  if (canvas.parentElement !== top) top.append(canvas);
}

/**
 * Claim the shared canvas into `host`. IDEMPOTENT: claiming a host that already
 * holds the claim re-asserts it and re-attaches, which is what makes it safe to
 * call on every render — see the note in `SkyLayer`.
 */
export function claimSky(host: HTMLElement): void {
  start();
  if (!hosts.includes(host)) hosts.push(host);
  attach();
}

/** Give the canvas back to whoever claimed before `host` (or detach it). */
export function releaseSky(host: HTMLElement): void {
  const i = hosts.lastIndexOf(host);
  if (i < 0) return;
  hosts.splice(i, 1);
  attach();
}

/** The shared engine, or null when WebGL2 is unavailable. */
export function skyEngine(): SkyEngine | null {
  start();
  return engine;
}

/**
 * Push the EnvState-derived target into the engine and publish it.
 *
 * IT COMPARES BEFORE IT PUBLISHES, and that is load-bearing rather than an
 * optimisation. `SkyLayer` pushes on every render (see the note there) and it
 * also subscribes here for its fallback gradient, so publishing a new object
 * unconditionally would be a render → push → notify → render loop. Holding the
 * old object when nothing has moved keeps `useSyncExternalStore`'s snapshot
 * stable and the cycle closes after one pass.
 */
export function setSkyTarget(next: SkyTarget, immediate = false): void {
  start();
  engine?.setEnv(next, immediate);
  const changed = (Object.keys(next) as (keyof SkyTarget)[]).some((k) => next[k] !== target[k]);
  if (!changed) return;
  target = next;
  listeners.forEach((fn) => fn());
}

/**
 * THE PAGE DISTURBS THE SKY. A sliding card, the portfolio sheet rolling in or
 * tearing off, the reader's doorway — anything on the page that moves pushes
 * air through the weather behind it, the way the pointer does.
 *
 * `(x, y)` in CSS px from the viewport's top-left, `(vx, vy)` its velocity in
 * CSS px / s; scaled by the `pageSplat` dial (0 turns the page's wake off and
 * leaves the pointer's). A no-op before the engine exists, with no WebGL2, and
 * wherever the engine drops splats (fluid off, reduced motion).
 */
export function skySplat(x: number, y: number, vx: number, vy: number, strength = 1): void {
  const k = config.pageSplat * strength;
  if (!engine || !(k > 0)) return;
  engine.splat(x, y, vx, vy, k);
}

/** Where each `skyWake` key was last seen: its points and when. */
const wakes = new Map<string, { pts: [number, number][]; t: number }>();
/** A key not seen for this long starts over rather than splatting a jump. */
const WAKE_STALE_MS = 100;

/**
 * {@link skySplat} for a thing that only knows where it IS: pass the same `key`
 * every frame with the points along its moving edge, and each point splats with
 * the velocity it has had since the last call. The first call for a key (or the
 * first after a gap) only records where it is.
 */
export function skyWake(key: string, pts: [number, number][], strength = 1): void {
  const now = performance.now();
  const prev = wakes.get(key);
  // Keys are cheap and callers mint them freely (one per grid card); forget
  // the ones that have gone quiet.
  if (!prev && wakes.size > 32) {
    for (const [k, w] of wakes) if (now - w.t > WAKE_STALE_MS) wakes.delete(k);
  }
  wakes.set(key, { pts, t: now });
  if (!prev || prev.pts.length !== pts.length) return;
  const dt = (now - prev.t) / 1000;
  if (dt <= 0 || dt * 1000 > WAKE_STALE_MS) return;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const vx = (x - prev.pts[i][0]) / dt;
    const vy = (y - prev.pts[i][1]) / dt;
    if (vx !== 0 || vy !== 0) skySplat(x, y, vx, vy, strength);
  }
}

/**
 * {@link skyWake} for a surface with several edges, only ONE of which is moving
 * into the air: pass every candidate edge as a list of points, and only the edge
 * furthest along the surface's own direction of travel splats. The sheet's roll
 * and tear use it — a sheet climbing the screen pushes with its top edge, one
 * leaving pushes with whichever edge is leading it out.
 */
export function skyWakeLeading(key: string, edges: [number, number][][], strength = 1): void {
  const now = performance.now();
  const flat = edges.flat();
  const prev = wakes.get(key);
  wakes.set(key, { pts: flat, t: now });
  if (!prev || prev.pts.length !== flat.length) return;
  const dt = (now - prev.t) / 1000;
  if (dt <= 0 || dt * 1000 > WAKE_STALE_MS) return;
  // The surface's velocity and centre, from every point on it.
  let vx = 0;
  let vy = 0;
  let cx = 0;
  let cy = 0;
  flat.forEach(([x, y], i) => {
    vx += x - prev.pts[i][0];
    vy += y - prev.pts[i][1];
    cx += x;
    cy += y;
  });
  const n = flat.length;
  vx /= n;
  vy /= n;
  cx /= n;
  cy /= n;
  if (vx === 0 && vy === 0) return;
  let best = 0;
  let bestAlong = -Infinity;
  edges.forEach((edge, e) => {
    let ex = 0;
    let ey = 0;
    for (const [x, y] of edge) {
      ex += x;
      ey += y;
    }
    const along = (ex / edge.length - cx) * vx + (ey / edge.length - cy) * vy;
    if (along > bestAlong) {
      bestAlong = along;
      best = e;
    }
  });
  let offset = 0;
  for (let e = 0; e < best; e++) offset += edges[e].length;
  edges[best].forEach(([x, y], i) => {
    const [px, py] = prev.pts[offset + i];
    skySplat(x, y, (x - px) / dt, (y - py) / dt, strength);
  });
}

/** The four edge midpoints of a CSS-px rect given by its centre and size —
 *  where a moving card pushes the air in front of it and pulls it in behind. */
export function rectEdges(cx: number, cy: number, w: number, h: number): [number, number][] {
  return [
    [cx - w / 2, cy],
    [cx + w / 2, cy],
    [cx, cy - h / 2],
    [cx, cy + h / 2],
  ];
}

export function skyTarget(): SkyTarget {
  return target;
}

export function subscribeSky(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// DEV: hand the engine back when this module is replaced.
//
// Without this, every hot update strands a live rAF loop rendering into a
// canvas that has been detached from the DOM — one more per edit, all of them
// drawing a five-octave fbm nobody can see. It is also half of a bug that was
// worth the trouble of finding: the other half was a new engine that never
// received a target, which is what `start` replaying it now fixes. See
// `docs/sky.md`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine?.dispose();
    canvas?.remove();
    engine = null;
    canvas = null;
    started = false;
    hosts.length = 0;
    listeners.clear();
  });
}
