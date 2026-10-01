/**
 * COVER LIFE — what a cover does while the pointer is on it (docs/reader.md,
 * docs/detail-paper.md).
 *
 * Two things, both per FACE (the cover, the back cover):
 *
 *   all on hover   every object on the face plays its loop while the page is
 *                  hovered, not only the one under the pointer. Leaving, each
 *                  runs out its pass and fades back on the ordinary leave rule,
 *                  held a little longer each ({@link staggerMs}) so twenty
 *                  objects do not land on the same frame.
 *   boil           the face itself wobbles as hand-drawn animation does: a new
 *                  small offset and rotation every 1/boilFps s, held until the
 *                  next (stepped, never eased), the same on the plate and on
 *                  every sprite so they stay registered. Its AMPLITUDE ramps in
 *                  and out with the hover; its steps stay discrete.
 *
 * This module is the dials (a module store, the `paper` pattern), the boil
 * signal, and the registry through which the one CoverAnimLayer that drives a
 * face's boil publishes it to whatever else has to move with it — the detail
 * view's paper plane. Kept free of React so it can be unit-tested.
 */

export interface CoverLifeDials {
  /** Boil steps per second. 6 matches the sprites' own frame rate. */
  boilFps: number;
  /** Largest offset on either axis, in CSS px at the hero size (see HERO_REF_W). */
  boilPx: number;
  /** Largest rotation either way, in degrees. */
  boilDeg: number;
  /** Amplitude ramp on hover. */
  boilInMs: number;
  /** Amplitude ramp on leave. */
  boilOutMs: number;
  /** Most extra hold, in ms, before an object's fade on a page leave. */
  stagger: number;
  /** Page hover plays every object on the face. Off: only the object hovered. */
  allOnHover: boolean;
}

export const COVER_LIFE_DEFAULTS: CoverLifeDials = {
  boilFps: 6,
  boilPx: 1.5,
  boilDeg: 0.5,
  boilInMs: 250,
  boilOutMs: 400,
  stagger: 120,
  allOnHover: true,
};

export const coverLife: CoverLifeDials = { ...COVER_LIFE_DEFAULTS };

type DialListener = (d: CoverLifeDials) => void;
const dialListeners = new Set<DialListener>();

export function setCoverLife(next: Partial<CoverLifeDials>): void {
  Object.assign(coverLife, next);
  for (const fn of dialListeners) fn(coverLife);
}

export function subscribeCoverLife(fn: DialListener): () => void {
  dialListeners.add(fn);
  return () => {
    dialListeners.delete(fn);
  };
}

/**
 * The hero's width at the reference layout (1728×996, the dials as shipped),
 * which is what `boilPx` is measured against: at any other card size the boil
 * scales with the card, so it reads the same at every viewport.
 */
export const HERO_REF_W = 628.25;

// ── the stagger ─────────────────────────────────────────────────────────

/** 1/φ: successive multiples mod 1 are as evenly spread as any sequence gets. */
const GOLDEN = 0.6180339887498949;

/**
 * The extra hold for object `index` on a page leave, in [0, stagger). Spread
 * by the golden ratio, so neighbours in the list land well apart and no two of
 * twenty share a value.
 *
 * Why a hold, and why it is invisible: the leave rule stops a loop at the end
 * of its pass, where it is back on frame 1 — which is the still. Every object
 * on Issue 01 runs at 6fps, so frame 1 is on screen for 167ms at the top of
 * each pass; a hold under that keeps the loop on the very image the still is
 * about to fade in over. Only the moment of the fade moves.
 */
export function staggerMs(index: number, stagger: number): number {
  if (!(stagger > 0)) return 0;
  return ((index * GOLDEN) % 1) * stagger;
}

// ── the boil signal ─────────────────────────────────────────────────────

/**
 * How many whole steps at `fps` fit in `ms`: the stepped clock hand-drawn
 * animation runs on. The boil steps by it, and so do the inside pages' sprites
 * (pageAnimPlayer.ts), so a page loop and a boil at one rate change drawing on
 * the same beat.
 */
export function stepsIn(ms: number, fps: number): number {
  return Math.floor((ms * Math.max(0, fps)) / 1000);
}

/** One boil step, each component in [-1, 1]: offset x, offset y, rotation. */
export interface BoilStep {
  x: number;
  y: number;
  r: number;
}

/** The smallest change between consecutive steps, in the unit square (offset)
 *  and unit range (rotation): a step the eye cannot tell from the last is a
 *  dropped frame, not a boil. */
export const MIN_STEP_OFFSET = 0.5;
export const MIN_STEP_ROT = 0.25;

/** mulberry32: small, fast, and the same sequence for the same seed everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A face's boil steps, in order: seeded, so the same face boils the same way
 * every time, and built so that NO two consecutive steps are the same — each
 * is redrawn until it is at least {@link MIN_STEP_OFFSET} from the last in
 * offset and {@link MIN_STEP_ROT} in rotation.
 */
export class BoilSequence {
  private readonly rand: () => number;
  private readonly steps: BoilStep[] = [];

  constructor(seed: number) {
    this.rand = mulberry32(seed);
  }

  at(n: number): BoilStep {
    const i = Math.max(0, Math.floor(n));
    while (this.steps.length <= i) this.steps.push(this.next(this.steps[this.steps.length - 1]));
    return this.steps[i];
  }

  private next(prev: BoilStep | undefined): BoilStep {
    const u = () => this.rand() * 2 - 1;
    for (;;) {
      const s = { x: u(), y: u(), r: u() };
      if (!prev) return s;
      if (Math.hypot(s.x - prev.x, s.y - prev.y) >= MIN_STEP_OFFSET && Math.abs(s.r - prev.r) >= MIN_STEP_ROT) {
        return s;
      }
    }
  }
}

/** What the face is displaced by right now: CSS px (in the layer's own,
 *  unscaled space) and degrees. All zero at rest — exactly zero, not small. */
export interface BoilSample {
  dx: number;
  dy: number;
  deg: number;
  /** The ramp, 0–1. */
  amp: number;
  /** Which step is showing (for the probe and the verify suite). */
  step: number;
}

export const BOIL_REST: BoilSample = { dx: 0, dy: 0, deg: 0, amp: 0, step: -1 };

/** A linear ramp from `from` to `to` over `ms`, starting at `start`. */
interface Ramp {
  from: number;
  to: number;
  start: number;
  ms: number;
}

const rampAt = (r: Ramp, now: number): number => {
  if (r.ms <= 0) return r.to;
  const k = Math.min(1, Math.max(0, (now - r.start) / r.ms));
  return r.from + (r.to - r.from) * k;
};

/**
 * One face's boil over time. `hover(on, now)` retargets the amplitude from
 * wherever it is; `sample(now, scale)` says where the face is.
 *
 * The step clock starts when the amplitude leaves 0 and runs until it is back
 * at 0; the next hover continues the SEQUENCE from where the last one stopped
 * (so no two boils open on the same drawing) but restarts the clock, so the
 * first step lasts a full 1/boilFps.
 */
export class Boil {
  private readonly seq: BoilSequence;
  private ramp: Ramp = { from: 0, to: 0, start: 0, ms: 0 };
  private clock = 0;
  private base = 0;
  private lastStep = -1;
  private running = false;

  constructor(seed: number) {
    this.seq = new BoilSequence(seed);
  }

  hover(on: boolean, now: number, d: CoverLifeDials = coverLife): void {
    const to = on ? 1 : 0;
    if (this.ramp.to === to) return;
    const from = rampAt(this.ramp, now);
    if (on && from === 0) {
      this.clock = now;
      this.base = this.lastStep + 1;
      this.running = true;
    }
    this.ramp = { from, to, start: now, ms: on ? d.boilInMs : d.boilOutMs };
  }

  /** True while there is anything to draw, or a ramp still to run. */
  active(now: number): boolean {
    return this.running && (this.ramp.to > 0 || rampAt(this.ramp, now) > 0);
  }

  /**
   * `scale` is the card's width over {@link HERO_REF_W}. `hold` (dev) pins the
   * step and the amplitude, for the verify suite's side-by-side.
   */
  sample(now: number, scale: number, d: CoverLifeDials = coverLife, hold?: BoilHold | null): BoilSample {
    let amp = rampAt(this.ramp, now);
    if (amp <= 0 && this.ramp.to === 0) this.running = false;
    let step = this.lastStep;
    if (this.running) {
      // max: a dial lowering the rate mid-boil must not walk the sequence back.
      step = Math.max(step, this.base + stepsIn(now - this.clock, d.boilFps));
      this.lastStep = step;
    }
    if (hold) {
      step = hold.step ?? step;
      amp = hold.amp ?? amp;
    }
    if (amp <= 0 || step < 0) return BOIL_REST;
    const st = this.seq.at(step);
    const px = d.boilPx * scale * amp;
    return { dx: st.x * px, dy: st.y * px, deg: st.r * d.boilDeg * amp, amp, step };
  }
}

/** DEV: pin a face's boil at a step and an amplitude (either may be left free). */
export interface BoilHold {
  step?: number;
  amp?: number;
}

const holds = new Map<string, BoilHold>();
const holdListeners = new Set<() => void>();

/** DEV: the hold on a face, if the verify suite has set one. */
export const boilHoldFor = (face: string): BoilHold | null => holds.get(face) ?? null;

export function holdBoil(face: string, h: BoilHold | null): void {
  if (h) holds.set(face, h);
  else holds.delete(face);
  for (const fn of holdListeners) fn();
}

export function subscribeBoilHold(fn: () => void): () => void {
  holdListeners.add(fn);
  return () => {
    holdListeners.delete(fn);
  };
}

/** The sample each face last showed, for the dev probe. */
export const lastBoil = new Map<string, BoilSample>();

// ── the registry ────────────────────────────────────────────────────────

/**
 * The boil each hover layer is showing, keyed by the element it listens to —
 * in the detail view that is the centre PANEL, which is exactly what the paper
 * layer has in hand for each plane. A layer publishes on every change, in the
 * same task it writes its own DOM transform, and listeners run synchronously:
 * so the paper repaints the plate with the value the sprites were just given,
 * on the same frame.
 */
const published = new Map<Element, BoilSample>();
type BoilListener = () => void;
const boilListeners = new Set<BoilListener>();

export function publishBoil(host: Element, s: BoilSample | null): void {
  if (s && s.amp > 0) published.set(host, s);
  else if (!published.delete(host)) return;
  for (const fn of boilListeners) fn();
}

export function boilFor(host: Element): BoilSample {
  return published.get(host) ?? BOIL_REST;
}

export function subscribeBoil(fn: BoilListener): () => void {
  boilListeners.add(fn);
  return () => {
    boilListeners.delete(fn);
  };
}

/** The DOM half of a boil: CSS's individual `translate` / `rotate`, which
 *  compose with (and never overwrite) whatever `transform` the element has,
 *  about the element's own centre. Cleared outright at rest, so rest is the
 *  element exactly as it was. */
export function applyBoilStyle(el: HTMLElement, s: BoilSample): void {
  if (s.amp > 0) {
    el.style.translate = `${s.dx}px ${s.dy}px`;
    el.style.rotate = `${s.deg}deg`;
  } else {
    el.style.removeProperty('translate');
    el.style.removeProperty('rotate');
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __coverLife?: unknown }).__coverLife = {
    dials: () => ({ ...coverLife }),
    set: setCoverLife,
    hold: holdBoil,
    sample: (face = 'cover') => lastBoil.get(face) ?? BOIL_REST,
    seq: (seed: number, n: number) => {
      const q = new BoilSequence(seed);
      return Array.from({ length: n }, (_, i) => q.at(i));
    },
  };
}
