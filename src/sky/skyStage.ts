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
  if (canvas.parentElement !== top) top.append(canvas);
}

/**
 * Claim the shared canvas into `host`. Returns the release function; releasing
 * hands the canvas back to the previous claimant (or detaches it).
 */
export function claimSky(host: HTMLElement): () => void {
  start();
  hosts.push(host);
  attach();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = hosts.lastIndexOf(host);
    if (i >= 0) hosts.splice(i, 1);
    attach();
  };
}

/** The shared engine, or null when WebGL2 is unavailable. */
export function skyEngine(): SkyEngine | null {
  start();
  return engine;
}

/** Push the EnvState-derived target into the engine and publish it. */
export function setSkyTarget(next: SkyTarget, immediate = false): void {
  start();
  target = next;
  engine?.setEnv(next, immediate);
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
