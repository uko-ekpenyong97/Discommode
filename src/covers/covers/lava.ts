import type { DialValues } from '../dialValues';
import type { Dome, InstanceExtra } from '../types';

/**
 * CARD 02's LAVA — where stage 5's blobs (the slug lenses) are, every draw.
 *
 * The blobs are an explicit list of up to MAX_BLOBS bent capsules, the same
 * shapes the slugs always were (rive-site.glsl, `slugs`), smooth-min'd into
 * one field on the GPU so they merge and split. Here, on the CPU, is how
 * they move, from the shared clock:
 *
 *   rise and fall   each blob has a home on a jittered grid of `count`
 *                   cells (as the slugs did: so they read as separate blobs,
 *                   not one mass), and climbs and sinks about it by one to
 *                   two cells' height on its own period and phase, lingering
 *                   at either end (a tanh of a sine): never in sync, and a
 *                   column's blobs meet now and then, merge, and part;
 *   stretch         it is longer and thinner the faster it goes, and stands
 *                   up straighter;
 *   wobble          its width breathes, its bend flexes, it sways sideways,
 *                   each on a period of its own.
 *
 * At rest that is a pure function of the clock's time, so every instance of
 * the cover shows the same moment (the grid's one shared draw, the clock
 * check, the morph, the stills). An instance under the pointer (its dome up)
 * keeps a `LavaInstance` beside its dome: the WARMTH of the pointer, which
 * swells the blobs near it (on the GPU, `uLavaPtr`), drifts them toward or
 * away from it, and speeds them up — the last as extra phase per blob, which
 * relaxes back to the shared timeline once the pointer has gone, so the
 * instance rejoins the shared draw without a jump.
 *
 * No allocation per draw: `LavaModel.fill` writes into the uniforms' own arrays.
 */

export const MAX_BLOBS = 16;

/** The LAVA panel's dials (rive-site.json, `lava`). */
export interface LavaDials {
  count: number;
  size: number;
  /** Mean vertical speed, frame units a second. */
  riseSpeed: number;
  wobble: number;
  /** The smooth-min's width, frame units: 0 is a plain min (no merging). */
  mergeSoftness: number;
  /** Frame units. */
  cursorRadius: number;
  cursorStrength: number;
  cursorSign: string;
  background: string;
}

/** The blobs' shapes: refraction5's slug dials. */
export interface LavaShape {
  slugWidthMin: number;
  slugWidthMax: number;
  slugLengthMin: number;
  slugLengthMax: number;
  /** Degrees: the spread of their tilt off upright. */
  slugTilt: number;
  /** Frame units: how far the ends bow off the chord, at most. */
  slugBend: number;
  slugSeed: number;
}

/** The frame the blobs live in (card 02's, 900 × 1326). */
const FW = 900;
const FH = 1326;
/** The band the blobs' homes are spread over, frame units. */
const Y_TOP = 150;
const Y_BOT = FH - 150;
/** No blob's centre goes nearer the frame's top or bottom than this. */
const Y_EDGE = 60;
/** How long a blob lingers at the top and bottom: tanh(K · sin φ). */
const K = 1.8;
const TANH_K = Math.tanh(K);
/** At full speed a blob is this much longer, and as much thinner: its
 *  length × width (its area, but for the caps) is kept. */
const STRETCH = 0.3;
/** Wobble's own periods, seconds (each blob's is 0.8–1.4× these). */
const SWAY_S = 9;
const BREATHE_S = 5.5;
const FLEX_S = 7;

/** The pointer's effects, at `cursorStrength` 1. */
export const WARM = {
  /** Phase speed added at full warmth: 1.5 → 2.5× as fast. */
  speed: 1.5,
  /** Share of the way to (or from) the pointer a blob drifts. */
  drift: 0.8,
  /** Field level dropped at the pointer, × the mean blob width (GPU). */
  swell: 0.45,
  /** Seconds: the warmth eases in, and out. */
  easeIn: 0.25,
  easeOut: 0.45,
  /** Seconds: the extra phase relaxes back to the shared timeline. */
  relax: 0.35,
} as const;

const TAU = Math.PI * 2;
const PHI = 0.6180339887498949;

/** A blob's constants, from the seed and the shape dials. */
interface Blob {
  hx: number;
  ymid: number;
  amp: number;
  /** Its period's share of the mean (0.75–1.3): spread by the golden ratio,
   *  so no two blobs share one. */
  periodJ: number;
  phase0: number;
  w: number;
  l: number;
  tilt: number;
  bend0: number;
  bendMax: number;
  taper: number;
  bulge: number;
  sway: [number, number];
  breathe: [number, number];
  flex: [number, number];
}

/** mulberry32: a small deterministic PRNG, so the arrangement is the seed's. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** `count` blobs' constants (`count` 1–MAX_BLOBS), their homes on a
 *  jittered grid of as many cells over the frame. */
export function lavaBlobs(shape: LavaShape, size: number, count: number): Blob[] {
  const out: Blob[] = [];
  const n = Math.max(1, Math.min(MAX_BLOBS, Math.round(count)));
  const cols = Math.max(1, Math.round(Math.sqrt((n * FW) / (Y_BOT - Y_TOP))));
  const rows = Math.ceil(n / cols);
  const cw = FW / cols;
  const ch = (Y_BOT - Y_TOP) / rows;
  for (let i = 0; i < n; i++) {
    const r = rng(Math.round(shape.slugSeed) * 7919 + i * 104729 + 17);
    const r1 = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r(), r6 = r(), r7 = r(), r8 = r(), r9 = r(), r10 = r();
    // the last row's few are spread across it
    const inRow = i < (rows - 1) * cols ? cols : n - (rows - 1) * cols;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = FW / inRow;
    const ymid = Y_TOP + (row + 0.5) * ch + (r2 - 0.5) * 0.4 * ch;
    const amp = Math.min(ch * (0.5 + 0.5 * r1), ymid - Y_EDGE, FH - Y_EDGE - ymid);
    const l = mix(shape.slugLengthMin, shape.slugLengthMax, r6) * size;
    out.push({
      hx: (col + 0.3 + 0.4 * r()) * (row === rows - 1 ? w : cw),
      ymid,
      amp,
      periodJ: 0.75 + 0.55 * ((r3 * 0.02 + i * PHI) % 1),
      phase0: TAU * r4,
      // the long ones are the thick ones, as the slugs had it
      w: mix(shape.slugWidthMin, shape.slugWidthMax, 0.5 * r5 + 0.5 * r6) * size,
      l,
      tilt: (r7 - 0.5) * ((shape.slugTilt * TAU) / 180),
      bend0: (r8 - 0.5) * 2,
      bendMax: Math.min(shape.slugBend, 0.4 * l),
      taper: (r9 - 0.5) * 0.6,
      bulge: r10 * 0.5,
      sway: [SWAY_S * (0.8 + 0.6 * r()), TAU * r()],
      breathe: [BREATHE_S * (0.8 + 0.6 * r()), TAU * r()],
      flex: [FLEX_S * (0.8 + 0.6 * r()), TAU * r()],
    });
  }
  return out;
}

/** The mean blob's rise (and its fall), frame units. */
const MEAN_TRAVEL = 500;

/** Seconds for blob `b` to rise and sink once at `riseSpeed` (the mean
 *  blob's speed; a blob with less far to go goes slower); Infinity at 0. */
export function blobPeriod(b: Pick<Blob, 'periodJ'>, riseSpeed: number): number {
  return riseSpeed > 0 ? ((2 * MEAN_TRAVEL) / riseSpeed) * b.periodJ : Infinity;
}

/** The output of one blob, frame units. */
export interface BlobPose {
  x: number;
  y: number;
  /** Length, width. */
  l: number;
  w: number;
  /** The long axis's angle, radians (π/2 = upright). */
  ang: number;
  /** -1..1 of its bend. */
  bend: number;
}

const pose: BlobPose = { x: 0, y: 0, l: 0, w: 0, ang: 0, bend: 0 };

/** Blob `b` at time `t` with `extra` phase, before the pointer's drift. Writes
 *  into (and returns) one shared object: read it before the next call. */
export function blobPose(b: Blob, d: Pick<LavaDials, 'riseSpeed' | 'wobble'>, t: number, extra = 0): BlobPose {
  const T = blobPeriod(b, d.riseSpeed);
  const ph = (Number.isFinite(T) ? (TAU * t) / T : 0) + b.phase0 + extra;
  const s = Math.sin(ph);
  const th = Math.tanh(K * s);
  // speed along the path, 1 at its fastest (mid-travel)
  const vn = Math.abs(Math.cos(ph) * (1 - th * th));
  const stretch = 1 + STRETCH * (Number.isFinite(T) ? vn : 0);
  const wb = d.wobble;
  const sway = Math.sin((TAU * t) / b.sway[0] + b.sway[1]);
  const breathe = Math.sin((TAU * t) / b.breathe[0] + b.breathe[1]);
  const flex = Math.sin((TAU * t) / b.flex[0] + b.flex[1]);
  pose.x = b.hx + wb * 0.09 * FW * sway;
  pose.y = b.ymid - (b.amp * th) / TANH_K;
  pose.l = b.l * stretch;
  pose.w = (b.w / stretch) * (1 + wb * 0.2 * breathe);
  // the faster it goes the straighter it stands
  pose.ang = Math.PI / 2 + (b.tilt + wb * 0.25 * sway) * (1 - 0.5 * vn);
  pose.bend = Math.max(-1, Math.min(1, b.bend0 * (1 - 0.5 * wb) + wb * 0.8 * flex));
  return pose;
}

/** The warmth's falloff at distance `d` from the pointer: 1 → 0 at `r`. */
export function warmthAt(d: number, r: number): number {
  const q = Math.min(1, (d * d) / Math.max(1, r * r));
  return (1 - q) * (1 - q);
}

const signOf = (d: Pick<LavaDials, 'cursorSign'>) => (d.cursorSign === 'away' ? -1 : 1);

/** `x` wrapped into (-π, π]: the extra phase's distance from the timeline. */
const wrap = (x: number) => x - TAU * Math.round(x / TAU);

/**
 * One instance's warmth (beside its dome, dome.ts): how warm it is (eased
 * from its dome's height), and each blob's extra phase. Stepped once a frame;
 * settled when it is the rest state again.
 */
export class LavaInstance implements InstanceExtra {
  heat = 0;
  readonly extra = new Float64Array(MAX_BLOBS);
  /** The pointer, frame units (the dome's sprung centre). */
  px = FW / 2;
  py = FH / 2;
  private last = -1;
  private lastT = 0;
  private settled_ = true;
  private readonly modelOf: (v: DialValues) => LavaModel;
  /** `modelOf`: the model for the cover's dial values as they are now. */
  constructor(modelOf: (v: DialValues) => LavaModel) {
    this.modelOf = modelOf;
  }

  settled(): boolean {
    return this.settled_;
  }

  copyFrom(o: InstanceExtra) {
    if (!(o instanceof LavaInstance)) return;
    this.heat = o.heat;
    this.extra.set(o.extra);
    this.px = o.px;
    this.py = o.py;
    this.last = o.last;
    this.lastT = o.lastT;
    this.settled_ = o.settled_;
  }

  reset() {
    this.heat = 0;
    this.extra.fill(0);
    this.settled_ = true;
  }

  step(now: number, t: number, dome: Dome, values: DialValues) {
    if (now <= this.last) return;
    const dtw = this.last < 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
    const dtc = this.last < 0 ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.last = now;
    this.lastT = t;
    const target = Math.max(0, Math.min(1, dome.amp));
    if (this.settled_ && target === 0) return;
    this.settled_ = false;
    this.px = dome.x;
    this.py = dome.y;
    const tau = target > this.heat ? WARM.easeIn : WARM.easeOut;
    this.heat += (target - this.heat) * (1 - Math.exp(-dtw / tau));
    const model = this.modelOf(values);
    const d = model.dials;
    const s = Math.max(0, d.cursorStrength);
    const relax = (1 - Math.exp(-dtw / WARM.relax)) * (1 - this.heat);
    let off = 0;
    for (let i = 0; i < MAX_BLOBS; i++) {
      const b = model.blobs[i];
      const T = b ? blobPeriod(b, d.riseSpeed) : Infinity;
      if (Number.isFinite(T)) {
        const p = blobPose(b, d, t, this.extra[i]);
        const h = this.heat * warmthAt(Math.hypot(p.x - this.px, p.y - this.py), d.cursorRadius);
        this.extra[i] += ((TAU * WARM.speed * s * h) / T) * dtc;
      }
      this.extra[i] -= wrap(this.extra[i]) * relax;
      off = Math.max(off, Math.abs(wrap(this.extra[i])));
    }
    // below what can be seen (a third of a unit of swell): back to rest
    if (target === 0 && this.heat < 0.01 && off < 0.005) this.reset();
  }
}

/** Card 02's blobs for one set of dial values: the constants, and the poses
 *  at any moment, written into the shader's arrays. */
export class LavaModel {
  readonly blobs: Blob[];
  /** Mean blob width: the swell and the lens softness are relative to it. */
  readonly meanW: number;
  readonly minW: number;
  readonly dials: LavaDials;
  constructor(dials: LavaDials, shape: LavaShape) {
    this.dials = dials;
    this.blobs = lavaBlobs(shape, dials.size, dials.count);
    this.meanW = ((shape.slugWidthMin + shape.slugWidthMax) / 2) * dials.size;
    this.minW = shape.slugWidthMin * dials.size;
  }

  count(): number {
    return Math.max(0, Math.min(MAX_BLOBS, Math.round(this.dials.count)));
  }

  /**
   * Every blob at `t`, under `inst`'s warmth (at rest when null), into the
   * shader's arrays: A = centre xy, length, width; B = axis xy, curvature,
   * bounding radius; S = taper, bulge. Frame units.
   */
  fill(t: number, inst: LavaInstance | null, A: Float32Array, B: Float32Array, S: Float32Array) {
    const d = this.dials;
    const n = this.count();
    const warm = inst && inst.heat > 0 ? inst : null;
    const pull = warm ? signOf(d) * WARM.drift * Math.max(0, d.cursorStrength) : 0;
    for (let i = 0; i < n; i++) {
      const b = this.blobs[i];
      const p = blobPose(b, d, t, inst ? inst.extra[i] : 0);
      let x = p.x;
      let y = p.y;
      if (warm) {
        const dx = warm.px - x;
        const dy = warm.py - y;
        const h = warm.heat * warmthAt(Math.hypot(dx, dy), d.cursorRadius);
        x += pull * h * dx;
        y += pull * h * dy;
      }
      const bend = p.bend * b.bendMax;
      A[i * 4] = x;
      A[i * 4 + 1] = y;
      A[i * 4 + 2] = p.l;
      A[i * 4 + 3] = p.w;
      B[i * 4] = Math.cos(p.ang);
      B[i * 4 + 1] = Math.sin(p.ang);
      // the ends bow by `bend` off the chord: v = k u², at u = L/2
      B[i * 4 + 2] = (bend * 4) / Math.max(p.l * p.l, 1);
      B[i * 4 + 3] = 0.5 * p.l + 0.5 * p.w * (1 + Math.abs(b.taper) + b.bulge) + Math.abs(bend) + 2;
      S[i * 2] = b.taper;
      S[i * 2 + 1] = b.bulge;
    }
  }
}
