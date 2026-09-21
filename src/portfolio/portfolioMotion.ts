/* ─────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Portfolio view (paper on a ground)
 *
 * OPEN
 *    0ms  stage 0  REST    detail view (or grid) as it was; nothing over it
 *    0ms  stage 1  SCRIM   the dark tint fades up over the whole page — the
 *                          hero card stays where it was, behind it
 *    0ms  stage 2  PANE    the ground and the sheet region fade in over it
 *  600ms  stage 3  READING handoff to the scroller, which runs section 0's
 *                          entrance from the negative track — on its own tween
 *                          and its own curve, `openDelayMs` after the track is
 *                          built and `openRiseMs` long. See `OPEN_TRACK`.
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
 * (`--pv-scrim`, `--pv-pane`), so per-frame work is two custom
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

/**
  * The two channels the open/close is expressed in. All 0 at REST.
  *
  * It was three. The third was the close pill's drop-in, and it went with the
  * pill — a channel that drives nothing is worse than no channel, because the
  * next person to read the storyboard has to work out which of its stages is
  * still on screen.
  */
export interface PortfolioValues {
  /** 0→1 the dark scrim over the page. → `--pv-scrim` */
  scrim: number;
  /** 0→1 the ground and the sheet region fading in. → `--pv-pane` */
  pane: number;
}

/** Clip start (`at`) and length (`dur`) in ms — the storyboard, as data. */
export const TIMING = {
  enter: {
    scrim: { at: 0, dur: 350 },
    pane: { at: 0, dur: 600 },
  },
  exit: {
    // The pane leads; the scrim trails it by 100ms (see the header).
    pane: { at: 0, dur: 600 },
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
  /**
   * THE OPEN TWEEN's rhythm: a soft start and a long settle. It is the tween's
   * TIME curve; what that time is spent on is {@link OPEN_TRACK}.
   *
   * MEASURED, and the measurement is why it is not the (0.22, 0.6, 0.2, 1) it
   * was specified as. That curve leaves the origin at a slope of 2.7 — a fast
   * start, not a soft one — and the tube is gone 0.87s after the click. This
   * one leaves at 1.17 and the tube is unrolling until 1.06s, against the ~1.3s
   * that was wanted. It cannot go much further: the sheet has to be MOSTLY FLAT
   * by 1.0s, which is the next thing down the same list, and the two meet here.
   */
  open: [0.3, 0.35, 0.2, 1] as [number, number, number, number],
  /**
   * …and the curve the open finishes on when a wheel arrives during it.
   *
   * IT LEAVES THE ORIGIN AT ZERO SLOPE, and it is an ease-IN-out for that
   * reason rather than the ease-out it was asked to be.
   *
   * A retarget joins a tween that is already running, and at the join the open
   * is barely moving in TRACK terms — the rise is carried by its own channel, so
   * phase 1 spends only 0.04 of the track and the position is doing 2px a
   * frame. An ease-out has its maximum velocity at the start by definition, so
   * whatever else it is, it is a step: measured, `(0, 0, 0.2, 1)` puts **147px
   * into the first frame** and 337px in practice. Accelerating out of the join
   * and settling into the dock costs nothing and reads as one move — modelled
   * across six candidates, this is the only one under 100px at its peak.
   *
   * | curve | first frame | worst frame |
   * | --- | --- | --- |
   * | `(0, 0, 0.2, 1)` ease-out | 147px | 147px |
   * | `(0.65, 0, 0.35, 1)` easeInOutCubic | 2px | 118px |
   * | `(0.4, 0, 0.6, 1)` **shipped** | **4px** | **69px** |
   */
  openSkip: [0.4, 0, 0.6, 1] as [number, number, number, number],
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
  /**
   * What the ground is when there is no sky on it: the flat field under the sky
   * layer, which shows only while WebGL2 is unavailable or in the frame before
   * the shared canvas has been claimed. It used to BE the ground.
   */
  groundColor: string;
  /**
   * Below 1 the grid shows through, for A/B only. SHIP AT 1 — paper on glass is
   * a contradiction, and every contrast figure in the docs is measured here.
   */
  groundAlpha: number;
  /**
   * THE SCRIM OVER THE SKY, as a black alpha. The ground is the sky now, and a
   * sky is a picture: it has a sun in it, it has a bright fog bank in it, and at
   * clear noon it is the brightest thing the site ever paints. The paper has to
   * read as paper on it and the letterhead has to clear 7:1 against its worst
   * patch, which is what set this number — see `docs/portfolio-view.md`.
   *
   * MEASURED, NOT CHOSEN, the same way `groundColor` was: the sweep is in the
   * doc, and 0.78 is the first value at which the way out clears the bar with
   * any margin at all (7.71:1, against 6.97 at 0.74 and 4.31 at 0.55).
   */
  groundScrim: number;
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
  /**
   * The page rect: ONE MARGIN, on all four sides — the top is the letterhead's
   * height plus this, and the other three are this.
   *
   * There used to be a deeper `pageFootPx` (144) at the bottom, reserving a
   * band for the close pill so a page never ran under it. The pill is gone and
   * so is the band: the page is 96px taller at 1728×996 and 96px taller at
   * 1440×900, which is a viewport's worth of prose over a long section.
   */
  pageMarginPx: number;
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
  /**
   * THE THREE GAPS IN THE PAGE'S HEADER, which is the block every section opens
   * with and therefore the first thing in every capture.
   *
   * They are dials rather than constants because the header is the one piece of
   * the page that is read as a MASTHEAD rather than as prose — the air in it is
   * doing the same job the type is, and the right amount of it is a thing you
   * find by moving it with the page in front of you. Sizes are not here on
   * purpose: `letterheadTitlePx` is the only type dial, and these move the
   * spacing around it without touching it.
   *
   * `headEyebrowGapPx` is SECTION NN to the title; `headTitleGapPx` is the
   * title to the reference line; `headRuleGapPx` is the air on EACH side of the
   * hairline that closes the header off from the first block.
   */
  headEyebrowGapPx: number;
  headTitleGapPx: number;
  headRuleGapPx: number;

  /* ── the sheet's material (PV PAPER) ───────────────────────────────────── */
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
  /**
   * THE BACK OF THE SHEET: the paper colour times this, with its own grain and
   * no texture. Paper is opaque — fold a page over and what you see is the
   * blank reverse, not the type read backwards.
   */
  backShade: number;
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
  /**
   * THE ENTRANCE, as staggered windows of its own progress. It is a ROLL — curl
   * mode 0, the cone wrap — and `enterCurl` is how rolled it arrives: −1 a full
   * tube, 0 flat.
   */
  enterCurl: number;
  /** How much of the sheet the roll reaches AT FULL AMOUNT. 1 is all of it, and
   *  1 is what a tube means. The front is `amount × reach`, so the roll lets go
   *  of the sheet as the amount comes off. */
  enterRollReach: number;
  /**
   * Which edge it rolls from: 0 the BOTTOM, 1 the top.
   *
   * The bottom, as the first release had it. At reach 1 the whole sheet is in
   * the tube either way, so this is which end of it is the free one — and the
   * free end wants to be the leading edge as the sheet rises into place.
   */
  enterRollEdge: number;
  /**
   * HOW HARD THE TUBE TAPERS: the cone's half-angle mixing from π/2 — a
   * cylinder — toward its tight end. **It is not what makes the roll a tube.**
   * The tube's radius is derived from a fixed number of turns, so at any value
   * of this the entrance is a tube; this only says whether it coils evenly or
   * tapers along its length.
   *
   * It lives here and not on `PV PAPER` because it belongs to the GESTURE: one
   * dial for both shapes is how a tube became a crease across the whole peel,
   * and then how it became no tube at all. See `curlMaterial.ts`.
   */
  enterCurlTightness: number;
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
  /** The bend's RADIUS through the peel: a wide arc, so the flap reads as a
   *  sheet coming away rather than as a crease travelling across one. */
  peelCurlTightness: number;
  /**
   * The least the peeled part of a TEAR must wrap, in radians — the radius
   * tightens to meet it while the peel is short, so the free corner creases and
   * comes off the surface instead of bulging. 0 is off, which is what the
   * entrance wants: see `curlMaterial.ts`.
   */
  peelWrapMin: number;
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
  /**
   * THE OPEN TWEEN — the entrance TO THE VIEW: how long after the click
   * section 0's sheet starts unrolling, and how long it then takes.
   *
   * It is long on purpose. The unroll is the one gesture that says what a
   * section IS in this view, and at the 1.4s it used to run the tube was gone
   * before the eye had found it. The delay covers the storyboard's pane fade,
   * so the first thing that moves under it is the sheet.
   *
   * These are the OPEN's alone. Every other entrance is scroll-driven and takes
   * exactly as long as the reader's wheel takes.
   */
  openDelayMs: number;
  openRiseMs: number;
  /**
   * HOW FAR BELOW THE FRAME the open's sheet starts, in px — the gap between
   * the bottom of the viewport and the top edge of the rolled sheet at rest
   * before the tween moves.
   *
   * The depth itself is COMPUTED, not dialled: it is whatever puts the sheet's
   * start pose this far under the frame at the live page rect, so it survives a
   * resize and it survived the page getting 96px taller when the close pill
   * went. See `openStartDepth` in `pageTrack.ts`. This is the one number in it
   * that is a taste.
   */
  openStartBelowPx: number;
  /**
   * HOW LONG THE OPEN TAKES ONCE THE READER HAS ASKED IT TO HURRY.
   *
   * The open is nearly three seconds and the reader cannot scroll through it —
   * every position it holds is below the scroller's floor, so there is nothing
   * to hand a wheel to mid-tween. What there IS is the rest of the tween, run
   * fast: the first wheel or touch retargets it to finish in this, on the same
   * `OPEN_TRACK` mapping from wherever it had got to. The tube completes its
   * unroll and docks; nothing jumps, because nothing has moved except the
   * clock.
   */
  openSkipMs: number;

  /* ── the scroller ──────────────────────────────────────────────────────── */
  /** Lenis: smoothing factor on the scroller, and the wheel gain. */
  lenisLerp: number;
  wheelMultiplier: number;
  /** How long a letterhead number takes to scroll the track to its section. */
  letterheadClickMs: number;

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
  groundScrim: 0.78,
  grainOpacity: 0.08,
  letterheadHPx: 56,

  paperColor: '#f4efe6',
  inkColor: '#14120f',
  pageMarginPx: 48,
  pageInsetPx: 40,
  gridGapPx: 52,
  textMeasureCh: 0,
  letterheadTitlePx: 96,
  // Was one 10px flex gap doing both of the first two, 24px before the rule and
  // the block grid's own 28px after it. Roughly 1.5x, and the rule now has the
  // same air on both sides rather than less above than below.
  headEyebrowGapPx: 15,
  headTitleGapPx: 15,
  headRuleGapPx: 36,

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
  backShade: 0.86,
  edgeAlpha: 0.18,
  mouseTiltDeg: 1.5,
  mouseLerp: 0.06,

  enterDistancePx: 900,
  exitDistancePx: 700,
  dwellVh: 0.5,
  handoffMs: 120,
  // THE ROLL: the tube the sheet arrives as, and the first release's numbers.
  // `enterCurl`, `enterCurlTightness`, `startRotationDeg` and `curlOutAt` are
  // `ENTRANCE_BENDS.roll` below; the softer, partial roll is `held` beside it.
  enterCurl: -1,
  enterRollReach: 1,
  enterRollEdge: 0,
  enterCurlTightness: 1,
  startRotationDeg: -45,
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
  // A wide, soft arc — a sheet coming away, rather than a crease travelling
  // across one. The entrance is a different shape entirely and has its own.
  peelCurlTightness: 0.35,
  peelWrapMin: 2.4,
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
  openDelayMs: 400,
  // 2600 rather than 2200: the sheet now climbs the better part of a viewport
  // before it starts to open, and the extra travel has to be paid for.
  openRiseMs: 2600,
  openStartBelowPx: 40,
  openSkipMs: 350,

  lenisLerp: 0.1,
  wheelMultiplier: 1,
  letterheadClickMs: 1100,

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

/**
 * THE TWO ENTRANCES, as presets — the four dials that say which one it is.
 *
 * BOTH ARE THE ROLL (curl mode 0). They differ in how much of the sheet is
 * wound and how hard the tube tapers, not in what shape it is: `roll` ships the
 * first release's full tube, and `held` is a looser, partial one — the sheet
 * curled at its leading edge rather than wound end to end.
 *
 * `held` is NOT the arc the entrance briefly used. That shape is the tear's and
 * stays the tear's; putting the entrance back on it is what took the tube away.
 *
 * `curlOutAt` is the same in both and is here anyway: it is the constraint the
 * entrance has, not a taste, and a preset that left it out would look like one
 * more number free to move. The roll has to be OUT before the hand-off, because
 * a shape still resolving at the swap is a shape the flat HTML cannot match.
 *
 * `PV PAPER` offers them as a select; the dock writes the four dials on
 * `PV MOTION` from whichever is chosen, so the sliders stay live underneath.
 */
export const ENTRANCE_BENDS = {
  roll: { enterCurl: -1, enterCurlTightness: 1, startRotationDeg: -45, curlOutAt: 0.6 },
  held: { enterCurl: -0.55, enterCurlTightness: 0.35, startRotationDeg: -28, curlOutAt: 0.6 },
} as const satisfies Record<string, Pick<
  PortfolioLook,
  'enterCurl' | 'enterCurlTightness' | 'startRotationDeg' | 'curlOutAt'
>>;

export type EntranceBend = keyof typeof ENTRANCE_BENDS;

/** Which preset a look's four entrance dials are, or `null` for a hand-tuned
 *  set that is neither. What the dock's select shows when the sliders move. */
export function entranceBendOf(from: PortfolioLook): EntranceBend | null {
  const names = Object.keys(ENTRANCE_BENDS) as EntranceBend[];
  return (
    names.find((name) =>
      (Object.entries(ENTRANCE_BENDS[name]) as [keyof PortfolioLook, number][]).every(
        ([k, v]) => from[k] === v,
      ),
    ) ?? null
  );
}

/** The pose dials the track needs, pulled out of whatever look is live. */
export function poseDials(from: PortfolioLook = look): PoseDials {
  return {
    enterCurl: from.enterCurl,
    enterRollReach: from.enterRollReach,
    enterRollEdge: from.enterRollEdge,
    enterCurlTightness: from.enterCurlTightness,
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
    peelCurlTightness: from.peelCurlTightness,
    peelWrapMin: from.peelWrapMin,
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
const easeOpen = cubicBezier(...EASE.open);

/* ── the open tween's curve ──────────────────────────────────────────────── */

/**
 * WHAT THE OPEN SPENDS ITS TIME ON: eased tween progress → how far through
 * section 0's ENTRANCE the track has come, 0…1.
 *
 * The open is the one entrance that is not the reader's wheel, so it is the one
 * place the view chooses the pace, and left to itself the pace was wrong: the
 * entrance's channels are staggered for a scroll, where the reader controls how
 * long they look at each part. Run on a clock, that stagger puts the tube —
 * which is the whole idea of the thing — into the first few frames and the flat
 * sheet into most of the tween.
 *
 * So the clock is re-mapped, in three phases:
 *
 *   0 → 0.30   THE RISE, AND THE HOLD. The sheet climbs into frame from below
 *              it while the track barely moves — so `uCurlAmount` stays within
 *              a few per cent of −1 and what travels up the screen is
 *              unmistakably a TUBE, at its full −45°.
 *   → 0.75     THE UNROLL. The track runs to `curlOutAt`, which is where the
 *              entrance's own table has the bend fully out. The un-tilt and the
 *              growth to full size happen at the head of this, which is what
 *              makes the tube square up just before it opens.
 *   → 1        THE SETTLE. A flat sheet rising the last of the way into the
 *              page's rect, where the hand-off takes it.
 *
 * THE RISE IS NOT THE TRACK, and it cannot be. `y` and `curl` are both driven
 * by the entrance's own progress in a table this must not touch, and they are
 * driven at different rates: by the time `y` has carried the sheet a viewport
 * upward, `curl` is long since 0. A tube cannot travel while holding its shape
 * if the only thing moving is the track position. So the rise is a SECOND
 * channel — an extra depth, below whatever `riseFrom` already gives, paid off
 * over phase 1 — and it exists only while the open owns the position. The
 * track's own arithmetic never sees it.
 *
 * WHAT IS RE-MAPPED IS TIME, and nothing here is a second pose table. The
 * entrance's poses are shared with every scroll-driven entrance between
 * sections; changing them to pace the open would have paced all of those too.
 * This changes which track position a given millisecond of the OPEN lands on,
 * and adds a depth no other entrance is given.
 */
export const OPEN_TRACK: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.3, 0.04],
  [0.75, 0.6],
  [1, 1],
];

/** Where phase 1 ends — the rise is paid off across `[0, this]` of eased
 *  progress. Read off {@link OPEN_TRACK} so the two cannot drift. */
const OPEN_RISE_END = OPEN_TRACK[1][0];

/** Walk {@link OPEN_TRACK}. Linear inside each phase: the rhythm is already in
 *  {@link EASE.open}, and easing each phase as well would put a dead spot at
 *  every joint — an unroll that stops twice on its way out. */
function openTrack(progress: number): number {
  const p = clamp01(progress);
  for (let i = 0; i + 1 < OPEN_TRACK.length; i++) {
    const [xa, ya] = OPEN_TRACK[i];
    const [xb, yb] = OPEN_TRACK[i + 1];
    if (p <= xb) return ya + ((yb - ya) * (p - xa)) / (xb - xa);
  }
  return 1;
}

/** One frame of the open: where on the track, and how much of the extra depth
 *  is still owed. */
export interface OpenFrame {
  /** 0…1 through section 0's entrance. */
  track: number;
  /** 1 at the start, 0 once the sheet has climbed into frame — a multiplier on
   *  the extra depth `openExtraDepth` computed from the page rect. */
  lift: number;
}

/**
 * THE OPEN TWEEN, end to end: linear tween time → the two numbers a frame of it
 * needs.
 *
 * Time is eased FIRST and then spent, in that order: {@link EASE.open} says how
 * the 2.6s is paid out, {@link OPEN_TRACK} says what it buys, and the lift
 * decays across phase 1 of the same eased clock — so the rise decelerates into
 * the unroll rather than gliding to a stop at a constant speed.
 */
export function openFrame(progress: number): OpenFrame {
  const eased = easeOpen(clamp01(progress));
  return {
    track: openTrack(eased),
    lift: 1 - clamp01(eased / OPEN_RISE_END),
  };
}

/** The track half of {@link openFrame}, for the callers that only want it. */
export function openEase(progress: number): number {
  return openFrame(progress).track;
}

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
  };
}

/** The CLOSE at time `ms` (0…EXIT_MS) — its own storyboard, 1 → 0. */
export function samplePortfolioExit(ms: number): PortfolioValues {
  return {
    scrim: 1 - channel(ms, TIMING.exit.scrim, easeScrim),
    pane: 1 - channel(ms, TIMING.exit.pane, easePane),
  };
}

/* ── applying values ─────────────────────────────────────────────────────── */

/** The live channel values. Defaults are REST — nothing over the page. */
export const portfolio: PortfolioValues = { scrim: 0, pane: 0 };

/** Write the three channels to `:root` and mirror them into the singleton. */
export function applyPortfolioValues(v: PortfolioValues): void {
  const s = document.documentElement.style;
  s.setProperty('--pv-scrim', v.scrim.toFixed(4));
  s.setProperty('--pv-pane', v.pane.toFixed(4));
  portfolio.scrim = v.scrim;
  portfolio.pane = v.pane;
}

/** Pin every channel to REST. Set before a driver takes over so a lazy-loaded
 *  dock never flashes a fully-open view over the page. */
export function applyPortfolioRest(): void {
  applyPortfolioValues({ scrim: 0, pane: 0 });
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
  s.setProperty('--pv-ground-scrim', String(look.groundScrim));
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
  s.setProperty('--pv-head-eyebrow-gap', `${look.headEyebrowGapPx}px`);
  s.setProperty('--pv-head-title-gap', `${look.headTitleGapPx}px`);
  s.setProperty('--pv-head-rule-gap', `${look.headRuleGapPx}px`);
  s.setProperty('--pv-handoff-ms', `${look.handoffMs}ms`);
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
  '--pv-scrim-alpha',
  '--pv-ground',
  '--pv-ground-alpha',
  '--pv-ground-scrim',
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
  '--pv-head-eyebrow-gap',
  '--pv-head-title-gap',
  '--pv-head-rule-gap',
  '--pv-handoff-ms',
  '--pv-page-x',
  '--pv-page-y',
  '--pv-page-w',
  '--pv-page-h',
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
