/* ─────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Reader entrance (card stays; the world changes)
 *
 *    0ms  stage 0  REST     detail view; cover panel centred, neighbours, chrome
 *    0ms  stage 1  CLEAR    neighbours + detail chrome fade & drift outward;
 *                          sky begins to darken
 *  200ms  stage 2  TABLE    the sky ground arrives beneath the cover: its washes
 *                          fade in over the same sky, and at 1 the reader takes
 *                          the sky's canvas (ReaderGround.tsx)
 *  450ms  stage 3  SETTLE   the cover's page contact shadow fades in (a small
 *                          "set down" onto the table)
 *  750ms  stage 4  BREATH   nothing moves
 * 1000ms  stage 5  CHROME   reader caption + ‹ › fade in
 * 1250ms  stage 6  OPEN     cover turns to 01|02 with the half-page slide
 *                          (marker progress → flip t); first visit per session
 * 2100ms  stage 7  READING  handoff to the normal reader
 *
 * EXIT: 6 → 1 reversed. Cover closes (slide back), chrome out, the ground's
 *       washes out and the canvas back to the app,
 *       neighbours and detail chrome return. Then history.back().
 * ─────────────────────────────────────────────────────────────
 *
 * ONE values shape, TWO drivers. Every timing and value below is a named
 * constant — the single source of truth. DialKit (dev `?intro`) samples this
 * schedule for a scrubbable authoring preview; Motion (production) samples the
 * exact same schedule so what Uko tunes here is what ships. This file is where
 * the dock's Copy output is pasted back.
 *
 * The reader layer OWNS the ground, the cover shadow, the reader chrome and the
 * flip. The neighbours and the detail chrome live in the app BENEATH it. The
 * bridge is CSS variables on `:root` (written here) plus the live `doorway`
 * singleton (read by DetailView's ticker). No React state changes per frame.
 *
 * The reader COVER is opaque for the whole entrance (and reverse): it coincides
 * with the detail panel exactly (hero.ts, 10:13), so it reads as the same rect
 * throughout. That is why the ground — which sits ABOVE the panel but BELOW the
 * cover in the reader layer — never blanks the magazine as it arrives. */

import type { FlipEngine } from './flipEngine';

/** The five channels the whole entrance is expressed in. All 0 at REST. */
export interface DoorwayValues {
  /** 0→1 neighbours + detail-chrome fade & drift outward. → `--doorway-clear` */
  clear: number;
  /** 0→1 the sky ground arriving (its washes; the canvas at 1). → `--doorway-table` */
  table: number;
  /** 0→1 the cover's contact-shadow strength (its "set down" onto the table).
   *  The cover itself is opaque throughout — it coincides with the detail panel
   *  exactly, so only the shadow arriving is visible. → `--doorway-settle` */
  settle: number;
  /** 0→1 reader caption / nav. → `--doorway-chrome` */
  chrome: number;
  /** 0→1 flip `t` for the cover turn (marker progress). Drives the engine. */
  open: number;
}

/** Clip start (`at`) and length (`dur`) in ms — the storyboard, as data. */
export const TIMING = {
  clear: { at: 0, dur: 220 }, // neighbours + detail chrome fade & drift out
  table: { at: 200, dur: 260 }, // the sky ground arrives
  settle: { at: 450, dur: 300 }, // the cover's contact shadow "sets down"
  chrome: { at: 1000, dur: 250 }, // reader caption + ‹ ›
  open: { at: 1250, dur: 850 }, // cover turn to 01|02 (flip t)
} as const;

/** Full entrance length (the last clip's end), in ms. */
export const TOTAL_MS = TIMING.open.at + TIMING.open.dur; // 2100

/** Shared easing for the four scalar channels. DialKit clips use the same
 *  `ease` array, so the dock preview and production Motion sample one curve. */
export const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Exit plays the schedule in reverse at this rate (a touch snappier than in). */
export const EXIT_RATE = 0.85;

/** How far (px) the detail neighbours drift outward as `clear` → 1. */
export const CLEAR_DRIFT_PX = 44;
/** How far (px) the detail chrome (back pill / bottom bar) drifts as `clear` → 1. */
export const CHROME_DRIFT_PX = 14;

/** sessionStorage flag: first reader open per session auto-opens the cover. */
const VISIT_KEY = 'discommode-reader-opened';

export function hasVisitedReader(): boolean {
  try {
    return sessionStorage.getItem(VISIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markReaderVisited(): void {
  try {
    sessionStorage.setItem(VISIT_KEY, '1');
  } catch {
    // best effort — private mode etc.
  }
}

// The auto-open decision is LATCHED per real open so a React StrictMode
// double-mount (dev) can't consume the first visit before the entrance runs:
// `openReader` arms it once, and `decideAutoOpen` reads sessionStorage exactly
// once per open, returning the same answer for the transient remount.
let autoOpenArmed = false;
let autoOpenLatched = false;

/** Arm the first-visit decision. Called once per real reader open. */
export function armAutoOpen(): void {
  autoOpenArmed = true;
}

/** Whether the cover should auto-open this open — stable across a StrictMode
 *  remount. Reads (and records) the session flag only on the armed open. */
export function decideAutoOpen(): boolean {
  if (autoOpenArmed) {
    autoOpenArmed = false;
    autoOpenLatched = !hasVisitedReader();
    markReaderVisited();
  }
  return autoOpenLatched;
}

/* ── the sampler (pure) ──────────────────────────────────────────────────── */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A cubic-bézier easing evaluator, matching DialKit's `type: 'easing'`. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const xe = sampleX(t) - x;
      if (Math.abs(xe) < 1e-4) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= xe / d;
    }
    return sampleY(t);
  };
}

const ease = cubicBezier(EASE[0], EASE[1], EASE[2], EASE[3]);

/** Eased 0→1 progress of one clip at time `ms`. */
function channel(ms: number, clip: { at: number; dur: number }): number {
  return ease(clamp01((ms - clip.at) / clip.dur));
}

/**
 * The entrance at time `ms` (0…TOTAL_MS). `open` is the LINEAR marker progress
 * (the flip engine applies its own curl geometry to it); it stays 0 unless the
 * cover is set to auto-open this visit.
 */
export function sampleDoorway(ms: number, autoOpen: boolean): DoorwayValues {
  return {
    clear: channel(ms, TIMING.clear),
    table: channel(ms, TIMING.table),
    settle: channel(ms, TIMING.settle),
    chrome: channel(ms, TIMING.chrome),
    open: autoOpen ? clamp01((ms - TIMING.open.at) / TIMING.open.dur) : 0,
  };
}

/* ── applying values ─────────────────────────────────────────────────────── */

/**
 * The live values, read every frame by DetailView's ticker (the app beneath the
 * reader). Defaults are the NORMAL reader / NORMAL detail state: `clear: 0`
 * (neighbours shown). The CSS `--doorway-*` fallbacks match (see below).
 */
export const doorway: DoorwayValues = { clear: 0, table: 1, settle: 1, chrome: 1, open: 0 };

/** Write the four scalar channels to `:root` and mirror them into the singleton.
 *  `open` is not a CSS var — it drives the flip engine directly. */
export function applyDoorwayValues(v: DoorwayValues): void {
  const s = document.documentElement.style;
  s.setProperty('--doorway-clear', v.clear.toFixed(4));
  s.setProperty('--doorway-table', v.table.toFixed(4));
  s.setProperty('--doorway-settle', v.settle.toFixed(4));
  s.setProperty('--doorway-chrome', v.chrome.toFixed(4));
  doorway.clear = v.clear;
  doorway.table = v.table;
  doorway.settle = v.settle;
  doorway.chrome = v.chrome;
  doorway.open = v.open;
}

/** Pin everything to REST (all channels 0): the reader layer is transparent, so
 *  the detail view + sky show straight through. Set before a driver takes over so
 *  a lazy-loaded harness never flashes the full reader over the detail view. */
export function applyDoorwayRest(): void {
  applyDoorwayValues({ clear: 0, table: 0, settle: 0, chrome: 0, open: 0 });
}

/**
 * Return everything to the normal reader / normal detail baseline: REMOVE the
 * `--doorway-*` properties so the CSS fallbacks (table/settle/chrome = 1,
 * clear = 0) take over, and reset the singleton to match. Called when the reader
 * layer closes externally (Back / hand-edited hash) and on unmount.
 */
export function resetDoorwayValues(): void {
  const s = document.documentElement.style;
  s.removeProperty('--doorway-clear');
  s.removeProperty('--doorway-table');
  s.removeProperty('--doorway-settle');
  s.removeProperty('--doorway-chrome');
  doorway.clear = 0;
  doorway.table = 1;
  doorway.settle = 1;
  doorway.chrome = 1;
  doorway.open = 0;
}

/**
 * Set by the motion driver when an in-app Escape has just played the exit in
 * reverse (leaving everything at REST) right before `history.back()`. ReaderGate
 * consumes it so it doesn't re-reset the vars and pop the reader back to full
 * during the (now invisible) unmount fade. External closes (Back / hand-edited
 * hash) never set it, so those still get the baseline restore.
 */
let reversed = false;
export function markDoorwayReversed(): void {
  reversed = true;
}
export function consumeDoorwayReversed(): boolean {
  const r = reversed;
  reversed = false;
  return r;
}

/* ── OPEN: driving the real flip engine ──────────────────────────────────── */

/** Mutable arming state for {@link driveFlipOpen}, one per driver instance. */
export interface FlipDriveState {
  armed: boolean;
  committed: boolean;
}

export function makeFlipDriveState(): FlipDriveState {
  return { armed: false, committed: false };
}

/**
 * Drive the cover turn from the `open` channel — the model shared by both
 * drivers. `startTurn` when the marker begins, `applyTurn` every frame, and
 * COMMIT only when a FORWARD-played playhead completes it. Scrubbing/reversing
 * back across the start cancels (or resets a committed turn), so any time shows
 * the curl at the corresponding `t`.
 */
export function driveFlipOpen(
  engine: FlipEngine | null,
  open: number,
  forward: boolean,
  enabled: boolean,
  state: FlipDriveState,
  onResetToCover: () => void,
): void {
  if (!engine || !enabled) {
    if (state.armed) {
      engine?.clearTurn();
      state.armed = false;
      state.committed = false;
    }
    return;
  }

  if (open > 0) {
    if (!state.armed) {
      state.armed = engine.startTurn('next');
      state.committed = false;
    }
    if (state.armed && !state.committed) {
      const p = Math.min(open, 1);
      engine.applyTurn(p);
      if (p >= 0.999 && forward) {
        engine.commitTurn(0); // finalises the spread via onSpreadChange
        state.committed = true;
      }
    }
  } else if (state.armed) {
    // Scrubbed / reversed back before the turn began — undo cleanly.
    if (state.committed) onResetToCover();
    else engine.clearTurn();
    state.armed = false;
    state.committed = false;
  }
}
