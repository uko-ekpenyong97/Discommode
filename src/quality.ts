/**
 * ADAPTIVE QUALITY — docs/perf/thirty-fps.md, "Adaptive quality".
 *
 * Only where it helps. A visitor whose browser caps the frame rate (Chrome's
 * Energy Saver: a steady 30) and whose frames are light is not slow, and
 * lowering quality cannot lift a cap — so the signal is the WORK in a frame
 * against the cadence the screen is actually running at, never the interval
 * alone (on intervals, a 30 fps cap looks like every other frame dropped).
 *
 *   busy     main-thread ms from the frame's start (the rAF timestamp) to a
 *            message posted from a rAF callback: the frame's script, style,
 *            layout, paint and commit. One postMessage a frame; Safari too.
 *   cadence  the 25th percentile of the frame intervals in a window, snapped
 *            to 8.3 / 11.1 / 16.7 / 33.3 ms. The budget B = max(cadence, 16.7).
 *   dropped  intervals over 1.5 × B.
 *
 * Windows of 2 s, scored only with ≥ 30 frames, none in the first 3 s after
 * load or the first 500 ms after a route change (a severe window: ≥ 3 frames).
 * A window is SLOW when busy p75
 * is over 0.8 × B, or more than 10% of its frames dropped (GPU-bound). Two slow
 * windows in a row step down ONE tier; the next step needs two more. Busy p50
 * over 100 ms, or a software renderer at startup, goes straight to tier 4.
 *
 * IT ONLY EVER STEPS DOWN, within a session (sessionStorage): it cannot
 * flicker between tiers. Tiers 2 and 3 wait for a settled page (activity.ts),
 * never mid-motion. Under reduced motion it does not run (the sky stops once
 * settled, the covers are stills); only the software-renderer test applies.
 *
 *   0  as shipped
 *   1  live side cards redraw at 20 fps
 *   2  WebGL backing stores at 1.5× at most: covers, Rive, the paper, the
 *      portfolio sheet; the sky at 4 MP at most
 *   3  the fluid (the wake) off, side cards as stills, the sky at half resolution
 *   4  a still sky, still covers, the detail view's DOM cards (no paper)
 *
 * `?tier=0..4` (in the query or the hash's query, production too) pins a tier
 * and turns the governor off; `?tier=auto` is the default — except under
 * automation (`navigator.webdriver`: the verify suites), where the governor is
 * off at tier 0 unless `?tier=auto` is given. The dev env readout
 * shows the tier and why; `window.__tier` (dev) is the checks' handle.
 */
import { useSyncExternalStore } from 'react';
import { whenSettled } from './activity';
import { webkitEngine } from './engine';

export type Tier = 0 | 1 | 2 | 3 | 4;
export const MAX_TIER: Tier = 4;

const WINDOW_MS = 2000;
const MIN_FRAMES = 30;
const START_GRACE_MS = 3000;
const ROUTE_GRACE_MS = 500;
const SLOW_BUSY = 0.8;
const SLOW_DROPPED = 0.1;
const SEVERE_BUSY_MS = 100;
const SEVERE_MIN_FRAMES = 3;
const STREAK = 2;
const CADENCES = [1000 / 120, 1000 / 90, 1000 / 60, 1000 / 30];
const STORE_KEY = 'discommode:tier';
const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

// ── scoring (pure) ───────────────────────────────────────────────────────

const pct = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};

/** The nearest of 8.3 / 11.1 / 16.7 / 33.3 ms. */
export function snapCadence(ms: number): number {
  let best = CADENCES[0];
  for (const c of CADENCES) if (Math.abs(c - ms) < Math.abs(best - ms)) best = c;
  return best;
}

export interface WindowScore {
  frames: number;
  cadence: number;
  budget: number;
  busyP50: number;
  busyP75: number;
  dropped: number;
  slow: boolean;
  severe: boolean;
}

/** One window's frames: their intervals and their busy ms. */
export function scoreWindow(intervals: number[], busy: number[]): WindowScore {
  const cadence = snapCadence(pct(intervals, 0.25));
  const budget = Math.max(cadence, 1000 / 60);
  const busyP50 = pct(busy, 0.5);
  const busyP75 = pct(busy, 0.75);
  const dropped = intervals.length ? intervals.filter((d) => d > 1.5 * budget).length / intervals.length : 0;
  return {
    frames: intervals.length,
    cadence,
    budget,
    busyP50,
    busyP75,
    dropped,
    slow: busyP75 > SLOW_BUSY * budget || dropped > SLOW_DROPPED,
    severe: busyP50 > SEVERE_BUSY_MS,
  };
}

/**
 * The governor's rule, apart from any clock: fed scored windows, it says the
 * tier to step to (or null). Step-down only; two slow windows per step.
 */
export class Governor {
  streak = 0;
  tier: Tier;
  constructor(tier: Tier = 0) {
    this.tier = tier;
  }
  feed(w: WindowScore): Tier | null {
    // A window of a few frames is a slow one by itself: at 1–4 fps it never
    // reaches MIN_FRAMES, and busy p50 over 100 ms needs no more evidence.
    if (w.frames < MIN_FRAMES && !(w.severe && w.frames >= SEVERE_MIN_FRAMES)) return null;
    if (w.severe && this.tier < MAX_TIER) {
      this.streak = 0;
      return (this.tier = MAX_TIER);
    }
    this.streak = w.slow ? this.streak + 1 : 0;
    if (this.streak < STREAK || this.tier >= MAX_TIER) return null;
    this.streak = 0;
    return (this.tier = (this.tier + 1) as Tier);
  }
}

// ── the live tier ────────────────────────────────────────────────────────

let tier: Tier = 0;
let mode: 'auto' | 'pinned' | 'reduced' | 'automation' = 'auto';
const listeners = new Set<() => void>();
export interface TierStep {
  tier: Tier;
  at: number;
  why: string;
}
const history: TierStep[] = [];
let lastScore: WindowScore | null = null;

export const qualityTier = (): Tier => tier;

export function subscribeQuality(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setTier(next: Tier, why: string): void {
  if (next === tier) return;
  tier = next;
  history.push({ tier: next, at: Math.round(performance.now()), why });
  if (mode === 'auto') {
    try {
      sessionStorage.setItem(STORE_KEY, String(next));
    } catch {
      /* private mode: the tier lasts the page */
    }
  }
  for (const fn of listeners) fn();
}

/** The tier, for a component that renders by it. */
export const useQualityTier = (): Tier => useSyncExternalStore(subscribeQuality, qualityTier, () => 0);

/** The cap tier 2 puts on a WebGL backing store's DPR (Infinity: none). */
export const qualityDprCap = (): number => (tier >= 2 ? 1.5 : Infinity);

/** Tier 3: the sky's wake (the fluid) is off. */
export const qualityFluidOff = (): boolean => tier >= 3;

/** Tier 3: side cards show their stills. */
export const qualitySideStill = (): boolean => tier >= 3;

/** Tier 4: the covers and the sky are stills, the detail view's cards DOM. */
export const qualityStill = (): boolean => tier >= 4;

// Side cards at 20 fps from tier 1: one decision per frame, as ambient.ts.
const SIDE_MS = 50;
let sideStamp = -1;
let sideDue = true;
let sideLast = -Infinity;

/**
 * WebKit's live side cards at 20 fps too, whatever the tier (src/engine.ts):
 * there each new frame of card 04 into the paper is a ~8 ms upload. Its face
 * steps at ~12 fps of its own, so 20 shows every step. The shader side cards
 * (02, 03) upload nothing; they keep the full rate unless this is set.
 */
const WEBKIT_SIDE: Record<'rive' | 'shader', boolean> = { rive: true, shader: false };

/** Whether this kind of side card is held to 20 fps here and now. */
export const sideCapped = (kind: 'rive' | 'shader'): boolean => tier >= 1 || (WEBKIT_SIDE[kind] && webkitEngine());

/** Whether a live SIDE card of this kind draws on this frame. Ask in each
 *  rAF callback; every kind shares the one 20 fps schedule. */
export function sideFrame(kind: 'rive' | 'shader' = 'rive'): boolean {
  if (!sideCapped(kind)) return true;
  const t = document.timeline?.currentTime;
  const now = typeof t === 'number' ? t : performance.now();
  if (Math.abs(now - sideStamp) < 1) return sideDue;
  sideStamp = now;
  // Half an 8.3 ms frame of slack, so 120 Hz draws every 6th and 60 every 3rd.
  sideDue = now - sideLast >= SIDE_MS - 4;
  if (sideDue) sideLast = now;
  return sideDue;
}

/**
 * WebKit's CENTRE card 04 at 30 fps (src/engine.ts). Measured in real Safari
 * 27.0 after the draw print and the side cards' 20 fps (2026-10-07): the side
 * card's upload went from ~8 ms a frame to ~1.4, but the hero after its burst
 * changes on nearly every frame and stayed at ~8 — over the 4 ms Uko set, so
 * its upload (and its draw into the paper's canvas) is held to every other
 * 60 Hz frame. Chrome and Firefox: every frame, as before.
 */
const CENTRE_MS = 1000 / 30;
let centreStamp = -1;
let centreDue = true;
let centreLast = -Infinity;

/** Whether card 04 as the CENTRE card draws into the paper on this frame. */
export function centreFrame(): boolean {
  if (!webkitEngine()) return true;
  const t = document.timeline?.currentTime;
  const now = typeof t === 'number' ? t : performance.now();
  if (Math.abs(now - centreStamp) < 1) return centreDue;
  centreStamp = now;
  // Half an 8.3 ms frame of slack: 60 Hz draws every 2nd frame, 120 every 4th.
  centreDue = now - centreLast >= CENTRE_MS - 4;
  if (centreDue) centreLast = now;
  return centreDue;
}

/** `?tier=` in the query or the hash's query: a tier, 'auto', or null. */
export function tierQuery(search: string, hash: string): Tier | 'auto' | null {
  for (const q of [search.replace(/^\?/, ''), hash.split('?')[1] ?? '']) {
    const m = /(?:^|&)tier=([^&]*)/.exec(q);
    if (!m) continue;
    if (m[1] === 'auto') return 'auto';
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_TIER) return n as Tier;
  }
  return null;
}

// ── the loop ─────────────────────────────────────────────────────────────

let started = false;

/**
 * Start the governor: once, at boot. `rendererString` reads the sky's GL
 * renderer once it exists (null until then).
 */
export function startQuality(rendererString: () => string | null): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const q = tierQuery(location.search, location.hash);
  if (q !== null && q !== 'auto') {
    mode = 'pinned';
    setTier(q, '?tier');
    exposeDev();
    return;
  }
  // AUTOMATION (Playwright, WebDriver): the verify suites measure the site
  // as shipped, and their probes and GPU benches are slow frames on purpose —
  // the governor would step down under them. Off at tier 0 unless the page
  // asks for it with `?tier=auto` (verify:tier does). No visitor has this flag.
  if (navigator.webdriver && q !== 'auto') {
    mode = 'automation';
    exposeDev();
    return;
  }
  let stored: Tier = 0;
  try {
    const v = Number(sessionStorage.getItem(STORE_KEY));
    if (Number.isInteger(v) && v > 0 && v <= MAX_TIER) stored = v as Tier;
  } catch {
    /* none */
  }
  if (stored > 0) setTier(stored, 'this session');
  const gov = new Governor(tier);

  // A software renderer: tier 4, whatever else is true. Read once the sky's
  // context exists (it is made after the first paint).
  let tries = 0;
  const probe = () => {
    const r = rendererString();
    if (r === null) {
      if (++tries < 20) window.setTimeout(probe, 250);
      return;
    }
    if (SOFTWARE_RE.test(r) && tier < MAX_TIER) {
      gov.tier = MAX_TIER;
      setTier(MAX_TIER, `software renderer (${r})`);
    }
  };
  window.setTimeout(probe, 250);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) mode = 'reduced';
  reduced.addEventListener('change', () => {
    if (mode !== 'pinned') mode = reduced.matches ? 'reduced' : 'auto';
  });

  let graceUntil = performance.now() + START_GRACE_MS;
  window.addEventListener('hashchange', () => {
    graceUntil = Math.max(graceUntil, performance.now() + ROUTE_GRACE_MS);
    reset();
  });

  let intervals: number[] = [];
  let busy: number[] = [];
  let windowStart = -1;
  let prev = -1;
  let pendingStep: (() => void) | null = null;
  const reset = () => {
    intervals = [];
    busy = [];
    windowStart = -1;
    prev = -1;
  };
  document.addEventListener('visibilitychange', reset);

  const channel = new MessageChannel();
  let frameStart = 0;
  channel.port1.onmessage = () => {
    const ms = performance.now() - frameStart;
    if (windowStart >= 0) busy.push(ms);
  };

  const step = (to: Tier, why: string) => {
    // Tier 1 and 4 at once; 2 and 3 resize backing stores: on a settled page.
    if (to === 1 || to === MAX_TIER) {
      setTier(to, why);
      return;
    }
    pendingStep?.();
    pendingStep = whenSettled(() => {
      pendingStep = null;
      setTier(to, why);
    });
  };

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (import.meta.env.DEV && injectMs > 0) {
      const until = performance.now() + injectMs;
      while (performance.now() < until) {
        /* the checks' long frames */
      }
    }
    if (mode !== 'auto' || document.hidden || now < graceUntil || gov.tier >= MAX_TIER) {
      reset();
      return;
    }
    frameStart = now;
    channel.port2.postMessage(null);
    if (prev >= 0) intervals.push(now - prev);
    prev = now;
    if (windowStart < 0) windowStart = now;
    if (now - windowStart < WINDOW_MS) return;
    const score = scoreWindow(intervals, busy);
    lastScore = score;
    intervals = [];
    busy = [];
    windowStart = now;
    const to = gov.feed(score);
    if (to !== null) {
      const why = score.severe
        ? `busy p50 ${score.busyP50.toFixed(0)} ms`
        : `busy p75 ${score.busyP75.toFixed(1)} / B ${score.budget.toFixed(1)}, dropped ${(score.dropped * 100).toFixed(0)}%`;
      step(to, why);
    }
  };
  requestAnimationFrame(frame);
  exposeDev();
}

// ── dev ──────────────────────────────────────────────────────────────────

let injectMs = 0;

/** The readout's line. */
export function qualityReadout(): string {
  const s = lastScore;
  const last = history[history.length - 1];
  const parts = [`tier ${tier}`, mode];
  if (s) {
    parts.push(`cadence ${s.cadence.toFixed(1)}${s.cadence > 20 ? ' (cap)' : ''}`);
    parts.push(`busy p75 ${s.busyP75.toFixed(1)}/B ${s.budget.toFixed(1)}`);
    parts.push(`drop ${(s.dropped * 100).toFixed(0)}%`);
  }
  if (last) parts.push(`${last.tier} at ${(last.at / 1000).toFixed(1)} s: ${last.why}`);
  return parts.join(' · ');
}

function exposeDev(): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __tier?: unknown }).__tier = {
    get: () => ({ tier, mode, score: lastScore }),
    history: () => [...history],
    /** Pin a tier (the governor stops), or 'auto' to let it run from here. */
    force: (t: Tier | 'auto') => {
      if (t === 'auto') mode = 'auto';
      else {
        mode = 'pinned';
        setTier(t, 'forced');
      }
    },
    /** Burn this many ms in every frame (0 stops): the checks' slow machine. */
    inject: (ms: number) => {
      injectMs = Math.max(0, ms);
    },
  };
}
