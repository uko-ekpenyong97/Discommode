/* ─────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Portfolio view (paper on a ground)
 *
 * OPEN
 *    0ms  stage 0  REST    detail view (or grid) as it was; nothing over it
 *    0ms  stage 1  SCRIM   the dark tint fades up over the whole page — the
 *                          hero card stays where it was, behind it
 *    0ms  stage 2  PANE    the ground and the sheet region fade in over it
 *  150ms  stage 3  PILL    the close pill drops in from its corner offset
 *  600ms  stage 4  READING handoff to the scroller, which runs section 0's
 *                          entrance from the negative track
 *
 * CLOSE — NOT the open played backwards. The pane LEADS (it is the thing
 * leaving) and the scrim TRAILS it by 100ms, so the grid re-sharpens last and
 * the world never snaps back into focus before the paper is out of the way.
 * ─────────────────────────────────────────────────────────────
 *
 * ONE values shape, TWO drivers — the same arrangement as `doorway.ts`. Every
 * timing, easing and geometric constant below is the single source of truth:
 * DialKit (dev `#view-NN?intro`) samples it for a scrubbable authoring preview,
 * Motion (production) samples exactly the same thing. This file is where the
 * dock's Copy output is pasted back.
 *
 * The three animated channels are published as CSS variables on `:root`
 * (`--pv-scrim`, `--pv-pane`, `--pv-pill`), so per-frame work is three custom
 * property writes and no React state changes at all. The LOOK values below are
 * published the same way — plus a mutable `look` singleton for the handful of
 * them that CSS can't consume (the scroller's smoothing, every shader uniform)
 * — which is what lets the dock retune geometry, the page track, the sheet's
 * material and the reveal system live.
 *
 * The page track itself is NOT here: where everything is at a given scroll
 * position is geometry, not a storyboard, and lives in `pageTrack.ts`. What IS
 * here is the shape of the entrance and the exit, because those are a look.
 */

import type { PoseDials } from './pageTrack';

/** The three channels the open/close is expressed in. All 0 at REST. */
export interface PortfolioValues {
  /** 0→1 the dark scrim over the page. → `--pv-scrim` */
  scrim: number;
  /** 0→1 the ground and the sheet region fading in. → `--pv-pane` */
  pane: number;
  /** 0→1 the close pill's drop-in from its corner offset. → `--pv-pill` */
  pill: number;
}

/** Clip start (`at`) and length (`dur`) in ms — the storyboard, as data. */
export const TIMING = {
  enter: {
    scrim: { at: 0, dur: 350 },
    pane: { at: 0, dur: 600 },
    pill: { at: 150, dur: 250 },
  },
  exit: {
    // The pane leads; the scrim trails it by 100ms (see the header).
    pane: { at: 0, dur: 600 },
    pill: { at: 0, dur: 250 },
    scrim: { at: 100, dur: 350 },
  },
} as const;

/** Full open / close lengths (the last clip's end), in ms. */
export const ENTER_MS = 600;
export const EXIT_MS = 600;

/** Per-channel easing. DialKit clips use the same arrays, so the dock preview
 *  and production Motion sample one curve each. */
export const EASE = {
  /** ease-out — the tint arrives and stops. */
  scrim: [0, 0, 0.58, 1] as [number, number, number, number],
  /** The pane's own curve: a hard start, a long settle. */
  pane: [0.4, 0, 0.1, 1] as [number, number, number, number],
  pill: [0, 0, 0.58, 1] as [number, number, number, number],
};

/**
 * Everything that is a size, a colour or a duration rather than a channel: the
 * ground, the paper, the page geometry, the shader's every uniform, the
 * scroller's feel, and the whole scroll-reveal system. Written to `:root` by
 * {@link applyPortfolioLook} and read from there by the CSS, so the dock can
 * retune any of it live without a re-render.
 */
export interface PortfolioLook {
  /** The scrim's black alpha. TINT ONLY — the blur went with the frosted page,
   *  because a full-viewport backdrop root that nothing is seen through is a
   *  cost with nothing on the other side of it. */
  scrimAlpha: number;

  /* ── the ground ────────────────────────────────────────────────────────── */
  /** The opaque field the paper sits on. */
  groundColor: string;
  /**
   * Below 1 the grid shows through, for A/B only. SHIP AT 1 — paper on glass is
   * a contradiction, and every contrast figure in the docs is measured here.
   */
  groundAlpha: number;
  /** Film grain over the ground and over the paper. One dial for both: they are
   *  the same grain, and the sheet's texture has it baked in. */
  grainOpacity: number;
  /** The letterhead strip across the top of the ground, in px. */
  letterheadHPx: number;

  /* ── the paper ─────────────────────────────────────────────────────────── */
  /** The page's surface, and the sheet's albedo where no texture has decoded. */
  paperColor: string;
  /** The ink, as a colour the alphas below are taken of. */
  inkColor: string;
  /** The page rect: a margin on the sides, and a deeper FOOT — the band the
   *  close pill lives in, which is the one piece of chrome the view has. The
   *  top is the letterhead's height plus `pageMarginPx`. */
  pageMarginPx: number;
  pageFootPx: number;
  /**
   * A page is the page rect less an inset each side; the twelve columns of its
   * grid divide what is left. `pageInsetPx` is a margin on a page and margins
   * do not grow with the paper the way type does, so it does not scale.
   */
  pageInsetPx: number;
  gridGapPx: number;
  /**
   * A cap on the body's line length, in `ch`. Zero is off, and off is the
   * default: a page's text runs to the right inset like everything else. 90 is
   * the figure to try if a full-width measure reads too long.
   */
  textMeasureCh: number;
  /** The page's own letterhead block: the size of the title on it. */
  letterheadTitlePx: number;

  /* ── the sheet's material (PV PAPER) ───────────────────────────────────── */
  /**
   * THE BEND'S RADIUS: 0 is the widest the shader will draw, 1 the tightest.
   *
   * It used to mix a cone's half-angle, which is a different thing with the same
   * name — the bend is an arc with a straight flap behind it now, and the only
   * number that says how it looks is how tight the arc is. See
   * `curlMaterial.ts`.
   */
  curlTightness: number;
  /** How much the radius grows along the FOLD LINE, so the bend is wider at the
   *  free corner than at the pinned one. 0 is a cylinder; this is what the cone
   *  was for. */
  curlTaper: number;
  /**
   * How much of the bend's lift leaves the plane, 0…1.
   *
   * Below 1 the bend is an ellipse rather than a circle, and it is below 1
   * because of the camera: at fov 20 from 50 units away, a bend that lifts a
   * whole page height comes a third of the way to the lens and takes the
   * projection up by half. A peel that balloons as it lifts reads as a zoom.
   */
  curlDepth: number;
  /** The two point lights, in the reference's world units. */
  lightA: number;
  lightAX: number;
  lightAY: number;
  lightAZ: number;
  lightB: number;
  lightBX: number;
  lightBY: number;
  lightBZ: number;
  /** Matte, with a small reflective term. */
  paperRoughness: number;
  paperReflect: number;
  /** What a face turned away from both lights still shows of the paper. The
   *  flap does exactly that as it folds back, and the reference's two-light rig
   *  has nothing to say about the back of a sheet. */
  paperAmbient: number;
  /** The hairline along the sheet's edge, and the page's inset ring — ONE dial,
   *  because an edge that only one of them has is an edge the hand-off's
   *  crossfade would have to hide. */
  edgeAlpha: number;
  /** Pointer tilt: how far, and how fast it follows. Rides on the curl, so a
   *  flat sheet is exactly flat — see `curlMaterial.ts`. */
  mouseTiltDeg: number;
  mouseLerp: number;

  /* ── the track, and the shape of an entrance and a tear (PV MOTION) ─────── */
  /** Scroll spent on one entrance and one tear (px). A feel, not a length. */
  enterDistancePx: number;
  exitDistancePx: number;
  /** Scroll spent on empty ground after a tear, as a fraction of the VIEWPORT's
   *  height. Half a screen: the beat that makes a tear read as a thing that
   *  finished rather than as a cut. */
  dwellVh: number;
  /** The crossfade at each hand-off (ms). There are two now, one at either end
   *  of a vertical run. */
  handoffMs: number;
  /** THE ENTRANCE, as staggered windows of its own progress. The bend it
   *  arrives with, and where that bend sits — near the bottom edge, so the rest
   *  of the sheet is flat and a line of type is readable across the curve. */
  enterCurl: number;
  enterCurlOrigin: number;
  /**
   * Which edge the entrance's curve is on, as the direction the fold TRAVELS —
   * 270° runs down the sheet from the TOP edge, 90° up from the bottom.
   *
   * The top, and it has to be: the sheet rises into place from below
   * (`riseFromH`), so its bottom edge is off the frame for the whole entrance
   * and a curve there is a curve nobody sees. The top edge is the leading one.
   */
  enterCurlAxisDeg: number;
  startRotationDeg: number;
  rotationEndAt: number;
  scaleBase: number;
  scaleTargetAt: number;
  curlOutAt: number;
  /** Where the sheet rises from, in page heights. Negative is below. */
  riseFromH: number;

  /** THE TEAR. The fold line's angle, clockwise from horizontal the way a CSS
   *  rotation is; the peel travels at right angles to it. */
  peelAngleDeg: number;
  /** The three joints: the corner has lifted, the fold has crossed the sheet,
   *  the pin has let go. */
  peelLiftAt: number;
  peelTravelAt: number;
  peelFreeAt: number;
  /** Where the fold starts, and how far it travels, along the roll direction. */
  peelOriginFrom: number;
  peelTravel: number;
  /** The bend: at the lift, at its peak, and what it springs back to. */
  peelCurlLift: number;
  peelCurlPeak: number;
  peelCurlPeakAt: number;
  peelCurlRelax: number;
  /** The turn about the pinned corner, at the travel's end and at the end. */
  peelRotateDeg: number;
  peelRotateEndDeg: number;
  /** The lift, in page heights, at the travel's end and at the end. */
  peelLiftH: number;
  peelRiseH: number;
  /** How far it recedes once it is free, and where its opacity starts to go. */
  peelScaleEnd: number;
  peelFadeFrom: number;

  /**
   * THE SETTLE. A sheet must never come to rest in mid-air, so when the scroll
   * stops partway through a TURN — an exit and the entrance that overlaps it,
   * taken as one move — the track tweens to the nearer end of it.
   *
   * `settleLow`/`settleHigh` bound the part of a turn worth finishing: below the
   * first the page has barely left, above the second the sheet has all but
   * landed, and in both cases moving it is a twitch rather than a resolution.
   * `settleIdleMs` is how long the scroll must have been quiet — Lenis's own
   * smoothing has to have run out first, or the settle fights the wheel.
   */
  settleLow: number;
  settleHigh: number;
  settleMs: number;
  settleIdleMs: number;
  /** The entrance TO THE VIEW: how long after the pane arrives section 0's
   *  sheet starts unrolling, and how long it takes. */
  riseDelayMs: number;
  riseMs: number;

  /* ── the scroller ──────────────────────────────────────────────────────── */
  /** Lenis: smoothing factor on the scroller, and the wheel gain. */
  lenisLerp: number;
  wheelMultiplier: number;
  /** How long a letterhead number takes to scroll the track to its section. */
  letterheadClickMs: number;

  /* ── chrome ────────────────────────────────────────────────────────────── */
  /** Close pill: diameter, its inset from the bottom-left corner, the offset it
   *  enters from, its own backdrop blur, and the ink alpha at rest vs hover
   *  (the ring and the X share one colour). */
  pillDiameterPx: number;
  pillInsetPx: number;
  pillOffsetPx: number;
  pillBlurPx: number;
  pillInkRest: number;
  pillInkHover: number;
  pillHoverScale: number;

  /* ── the reveal system ─────────────────────────────────────────────────── */
  /** `.reveal`: duration, starting blur, starting offset, per-sibling stagger. */
  revealMs: number;
  revealBlurPx: number;
  revealOffsetPx: number;
  revealStaggerMs: number;
  /** `.reveal-char`: the decelerating per-character ramp's scale (see
   *  {@link charDelayMs}) and the character fade duration. */
  charRampMs: number;
  charMs: number;
  /** `.reveal-flip`: how far back the frame starts and how far it is turned. */
  flipDepthPx: number;
  flipAngleDeg: number;
  flipMs: number;
  flipDelayMs: number;
}

export const LOOK: PortfolioLook = {
  scrimAlpha: 0.4,

  // Deep ink blue, and DARKER than it looks like it needs to be. The paper
  // reads as paper against it either way; what set the value is that mono type
  // on it is held to the same 7:1 bar the ink on the paper is, and the ground's
  // grain is source-over — so its worst patch is a lighter field, and a lighter
  // field is where the letterhead's 11px type runs out of room. Measured, not
  // chosen: see `docs/portfolio-view.md`.
  groundColor: '#142a63',
  groundAlpha: 1,
  grainOpacity: 0.08,
  letterheadHPx: 56,

  paperColor: '#f4efe6',
  inkColor: '#14120f',
  pageMarginPx: 48,
  // Deeper than the sides, and not for taste: the close pill is 96px at a 40px
  // inset, and a page that ran under it would put chrome over content.
  pageFootPx: 144,
  pageInsetPx: 40,
  gridGapPx: 52,
  textMeasureCh: 0,
  letterheadTitlePx: 96,

  // A wide, soft arc. At 1 this is a tube; at 0.35 it is a sheet held in a
  // hand, which is what the reference's paper does and what leaves a line of
  // type readable across the bend.
  curlTightness: 0.35,
  curlTaper: 0.35,
  curlDepth: 0.5,
  // The reference's constants, in the reference's world units. They transfer
  // because the camera does — see `curlMaterial.ts`.
  lightA: 1.14,
  lightAX: 13,
  lightAY: 5,
  lightAZ: 10,
  lightB: 0.8,
  lightBX: 8,
  lightBY: 5,
  lightBZ: 10,
  paperRoughness: 0.25,
  paperReflect: 0.37,
  paperAmbient: 0.34,
  edgeAlpha: 0.18,
  mouseTiltDeg: 1.5,
  mouseLerp: 0.06,

  enterDistancePx: 900,
  exitDistancePx: 700,
  dwellVh: 0.5,
  handoffMs: 120,
  enterCurl: -0.55,
  enterCurlOrigin: 0.15,
  enterCurlAxisDeg: 270,
  startRotationDeg: -28,
  rotationEndAt: 0.16,
  scaleBase: 0.41,
  scaleTargetAt: 0.22,
  curlOutAt: 0.6,
  riseFromH: -0.51,

  peelAngleDeg: -35,
  peelLiftAt: 0.15,
  peelTravelAt: 0.6,
  peelFreeAt: 0.8,
  peelOriginFrom: 0.08,
  peelTravel: 0.45,
  peelCurlLift: 0.45,
  peelCurlPeak: 0.6,
  peelCurlPeakAt: 0.4,
  peelCurlRelax: 0.2,
  peelRotateDeg: -12,
  peelRotateEndDeg: -18,
  peelLiftH: 0.12,
  peelRiseH: 0.9,
  peelScaleEnd: 0.85,
  peelFadeFrom: 0.9,

  settleLow: 0.15,
  settleHigh: 0.85,
  settleMs: 450,
  settleIdleMs: 120,
  riseDelayMs: 500,
  riseMs: 900,

  lenisLerp: 0.1,
  wheelMultiplier: 1,
  letterheadClickMs: 1100,

  pillDiameterPx: 96,
  pillInsetPx: 40,
  pillOffsetPx: 73,
  pillBlurPx: 8,
  pillInkRest: 0.35,
  pillInkHover: 1,
  pillHoverScale: 0.92,

  revealMs: 800,
  revealBlurPx: 10,
  revealOffsetPx: 10,
  revealStaggerMs: 30,
  charRampMs: 200,
  charMs: 500,
  flipDepthPx: 500,
  flipAngleDeg: 45,
  flipMs: 500,
  flipDelayMs: 300,
};

/** The pose dials the track needs, pulled out of whatever look is live. */
export function poseDials(from: PortfolioLook = look): PoseDials {
  return {
    enterCurl: from.enterCurl,
    enterCurlOrigin: from.enterCurlOrigin,
    enterCurlAxis: from.enterCurlAxisDeg,
    startRotation: from.startRotationDeg,
    rotationEndAt: from.rotationEndAt,
    scaleBase: from.scaleBase,
    scaleTargetAt: from.scaleTargetAt,
    curlOutAt: from.curlOutAt,
    riseFrom: from.riseFromH,
    peelAngle: from.peelAngleDeg,
    peelLiftAt: from.peelLiftAt,
    peelTravelAt: from.peelTravelAt,
    peelFreeAt: from.peelFreeAt,
    peelOriginFrom: from.peelOriginFrom,
    peelOriginTo: from.peelOriginFrom + from.peelTravel,
    peelCurlLift: from.peelCurlLift,
    peelCurlPeak: from.peelCurlPeak,
    peelCurlPeakAt: from.peelCurlPeakAt,
    peelCurlRelax: from.peelCurlRelax,
    peelRotateMid: from.peelRotateDeg,
    peelRotateEnd: from.peelRotateEndDeg,
    peelLiftMid: from.peelLiftH,
    peelRiseEnd: from.peelRiseH,
    peelScaleEnd: from.peelScaleEnd,
    peelFadeFrom: from.peelFadeFrom,
  };
}

/**
 * Per-character reveal delay — a DECELERATING ramp, `charRampMs * sqrt(i)`:
 * 0, 200, 283, 346, 400… Characters leave in a rush and arrive spread out, so a
 * long title reads as one gesture rather than a metronome.
 */
export function charDelayMs(index: number, rampMs = LOOK.charRampMs): number {
  return Math.round(rampMs * Math.sqrt(index) * 10) / 10;
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

const easeScrim = cubicBezier(...EASE.scrim);
const easePane = cubicBezier(...EASE.pane);
const easePill = cubicBezier(...EASE.pill);

/** Eased 0→1 progress of one clip at time `ms`. */
function channel(
  ms: number,
  clip: { at: number; dur: number },
  ease: (x: number) => number,
): number {
  return ease(clamp01((ms - clip.at) / clip.dur));
}

/** The OPEN at time `ms` (0…ENTER_MS). */
export function samplePortfolioEnter(ms: number): PortfolioValues {
  return {
    scrim: channel(ms, TIMING.enter.scrim, easeScrim),
    pane: channel(ms, TIMING.enter.pane, easePane),
    pill: channel(ms, TIMING.enter.pill, easePill),
  };
}

/** The CLOSE at time `ms` (0…EXIT_MS) — its own storyboard, 1 → 0. */
export function samplePortfolioExit(ms: number): PortfolioValues {
  return {
    scrim: 1 - channel(ms, TIMING.exit.scrim, easeScrim),
    pane: 1 - channel(ms, TIMING.exit.pane, easePane),
    pill: 1 - channel(ms, TIMING.exit.pill, easePill),
  };
}

/* ── applying values ─────────────────────────────────────────────────────── */

/** The live channel values. Defaults are REST — nothing over the page. */
export const portfolio: PortfolioValues = { scrim: 0, pane: 0, pill: 0 };

/** Write the three channels to `:root` and mirror them into the singleton. */
export function applyPortfolioValues(v: PortfolioValues): void {
  const s = document.documentElement.style;
  s.setProperty('--pv-scrim', v.scrim.toFixed(4));
  s.setProperty('--pv-pane', v.pane.toFixed(4));
  s.setProperty('--pv-pill', v.pill.toFixed(4));
  portfolio.scrim = v.scrim;
  portfolio.pane = v.pane;
  portfolio.pill = v.pill;
}

/** Pin every channel to REST. Set before a driver takes over so a lazy-loaded
 *  dock never flashes a fully-open view over the page. */
export function applyPortfolioRest(): void {
  applyPortfolioValues({ scrim: 0, pane: 0, pill: 0 });
}

/**
 * The LIVE look. Mutated in place so imperative readers (the scroller's Lenis
 * options, the shader's uniforms, the track's dials) always see the current
 * value, exactly as `config` does for the grid. Everything CSS can consume is a
 * variable instead.
 */
export const look: PortfolioLook = { ...LOOK };

type LookListener = (look: PortfolioLook) => void;
const lookListeners = new Set<LookListener>();

/** Subscribe to look changes — for the values that are NOT CSS variables and so
 *  need something rebuilt when they move. Returns an unsubscribe. */
export function subscribeLook(fn: LookListener): () => void {
  lookListeners.add(fn);
  return () => {
    lookListeners.delete(fn);
  };
}

/** Publish the look: CSS variables for everything CSS can use, the `look`
 *  singleton for the rest. Called once on mount and again on every dock change,
 *  so the ground, the page, the track, the shader and the reveal system all
 *  retune live. */
export function applyPortfolioLook(next: PortfolioLook = LOOK): void {
  Object.assign(look, next);
  const s = document.documentElement.style;
  s.setProperty('--pv-scrim-alpha', String(look.scrimAlpha));
  s.setProperty('--pv-ground', look.groundColor);
  s.setProperty('--pv-ground-alpha', String(look.groundAlpha));
  s.setProperty('--pv-grain', String(look.grainOpacity));
  s.setProperty('--pv-letterhead-h', `${look.letterheadHPx}px`);
  s.setProperty('--pv-paper', look.paperColor);
  s.setProperty('--pv-ink', look.inkColor);
  s.setProperty('--pv-edge', String(look.edgeAlpha));
  s.setProperty('--pv-page-margin', `${look.pageMarginPx}px`);
  s.setProperty('--pv-inset', `${look.pageInsetPx}px`);
  s.setProperty('--pv-grid-gap', `${look.gridGapPx}px`);
  // `none`, not `0`: this is a max-width, and zero would collapse every
  // paragraph on the page rather than uncap it.
  s.setProperty('--pv-measure', look.textMeasureCh > 0 ? `${look.textMeasureCh}ch` : 'none');
  s.setProperty('--pv-letterhead-title', `${look.letterheadTitlePx}px`);
  s.setProperty('--pv-handoff-ms', `${look.handoffMs}ms`);
  s.setProperty('--pv-pill-d', `${look.pillDiameterPx}px`);
  s.setProperty('--pv-pill-inset', `${look.pillInsetPx}px`);
  s.setProperty('--pv-pill-offset', `${look.pillOffsetPx}px`);
  s.setProperty('--pv-pill-blur', `${look.pillBlurPx}px`);
  s.setProperty('--pv-pill-ink', String(look.pillInkRest));
  s.setProperty('--pv-pill-ink-hover', String(look.pillInkHover));
  s.setProperty('--pv-pill-hover-scale', String(look.pillHoverScale));
  s.setProperty('--pv-reveal-ms', `${look.revealMs}ms`);
  s.setProperty('--pv-reveal-blur', `${look.revealBlurPx}px`);
  s.setProperty('--pv-reveal-offset', `${look.revealOffsetPx}px`);
  s.setProperty('--pv-reveal-stagger', `${look.revealStaggerMs}ms`);
  s.setProperty('--pv-char-ms', `${look.charMs}ms`);
  s.setProperty('--pv-flip-depth', `${look.flipDepthPx}px`);
  s.setProperty('--pv-flip-angle', `${look.flipAngleDeg}deg`);
  s.setProperty('--pv-flip-ms', `${look.flipMs}ms`);
  s.setProperty('--pv-flip-delay', `${look.flipDelayMs}ms`);
  lookListeners.forEach((fn) => fn(look));
}

const VARS = [
  '--pv-scrim',
  '--pv-pane',
  '--pv-pill',
  '--pv-scrim-alpha',
  '--pv-ground',
  '--pv-ground-alpha',
  '--pv-grain',
  '--pv-letterhead-h',
  '--pv-paper',
  '--pv-ink',
  '--pv-edge',
  '--pv-page-margin',
  '--pv-inset',
  '--pv-grid-gap',
  '--pv-measure',
  '--pv-letterhead-title',
  '--pv-handoff-ms',
  '--pv-page-x',
  '--pv-page-y',
  '--pv-page-w',
  '--pv-page-h',
  '--pv-pill-d',
  '--pv-pill-inset',
  '--pv-pill-ink',
  '--pv-pill-ink-hover',
  '--pv-pill-hover-scale',
  '--pv-pill-offset',
  '--pv-pill-blur',
  '--pv-reveal-ms',
  '--pv-reveal-blur',
  '--pv-reveal-offset',
  '--pv-reveal-stagger',
  '--pv-char-ms',
  '--pv-flip-depth',
  '--pv-flip-angle',
  '--pv-flip-ms',
  '--pv-flip-delay',
];

/** Remove every `--pv-*` property so the CSS fallbacks take over, and reset the
 *  singleton. Called when the view unmounts. */
export function resetPortfolioValues(): void {
  const s = document.documentElement.style;
  for (const v of VARS) s.removeProperty(v);
  Object.assign(look, LOOK); // a dev tuning session must not outlive the view
  portfolio.scrim = 0;
  portfolio.pane = 0;
  portfolio.pill = 0;
}

/**
 * Set by the driver when an in-app close has just played the exit, leaving
 * everything at REST right before `history.back()`. `PortfolioGate` consumes it
 * so it doesn't add a second fade over an already-empty layer. External closes
 * (Back / a hand-edited hash) never set it, so those still get the quick fade.
 */
let reversed = false;
export function markPortfolioReversed(): void {
  reversed = true;
}
export function consumePortfolioReversed(): boolean {
  const r = reversed;
  reversed = false;
  return r;
}
