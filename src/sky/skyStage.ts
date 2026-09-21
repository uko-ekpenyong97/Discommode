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
import { subscribeConfig } from '../config';
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
