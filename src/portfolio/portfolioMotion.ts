/* ─────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Portfolio view (glass over the world, sheet from the right)
 *
 * OPEN
 *    0ms  stage 0  REST    detail view (or grid) as it was; nothing over it
 *    0ms  stage 1  SCRIM   the blurred glass fades up over the whole page —
 *                          the hero card stays visible, out of focus, behind it
 *    0ms  stage 2  SHEET   the project sheet slides in from the right edge
 *  150ms  stage 3  PILL    the close pill drops in from its corner offset
 *  600ms  stage 4  READING handoff to the scroller
 *
 * CLOSE — NOT the open played backwards. The sheet LEADS (it is the thing
 * leaving) and the scrim TRAILS it by 100ms, so the grid re-sharpens last and
 * the world never snaps back into focus before the sheet is out of the way.
 * ─────────────────────────────────────────────────────────────
 *
 * ONE values shape, TWO drivers — the same arrangement as `doorway.ts`. Every
 * timing, easing and geometric constant below is the single source of truth:
 * DialKit (dev `#view-NN?intro`) samples it for a scrubbable authoring preview,
 * Motion (production) samples exactly the same thing. This file is where the
 * dock's Copy output is pasted back.
 *
 * The three animated channels are published as CSS variables on `:root`
 * (`--pv-scrim`, `--pv-sheet`, `--pv-pill`), so per-frame work is three custom
 * property writes and no React state changes at all. The LOOK values below are
 * published the same way — plus a mutable `look` singleton for the handful of
 * them that CSS can't consume (the scroller's smoothing) — which is what lets
 * the dock retune geometry, the page track and the reveal system live.
 *
 * The page track itself is NOT here: where each page sits at a given scroll
 * position is geometry, not a storyboard, and lives in `pageTrack.ts`.
 */

/** The three channels the open/close is expressed in. All 0 at REST. */
export interface PortfolioValues {
  /** 0→1 the blurred scrim over the page. → `--pv-scrim` */
  scrim: number;
  /** 0→1 the sheet's slide from the right edge (0 = offscreen). → `--pv-sheet` */
  sheet: number;
  /** 0→1 the close pill's drop-in from its corner offset. → `--pv-pill` */
  pill: number;
}

/** Clip start (`at`) and length (`dur`) in ms — the storyboard, as data. */
export const TIMING = {
  enter: {
    scrim: { at: 0, dur: 350 },
    sheet: { at: 0, dur: 600 },
    pill: { at: 150, dur: 250 },
  },
  exit: {
    // The sheet leads; the scrim trails it by 100ms (see the header).
    sheet: { at: 0, dur: 600 },
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
  /** ease-out — the glass arrives and stops. */
  scrim: [0, 0, 0.58, 1] as [number, number, number, number],
  /** The sheet's own curve: a hard start, a long settle. */
  sheet: [0.4, 0, 0.1, 1] as [number, number, number, number],
  pill: [0, 0, 0.58, 1] as [number, number, number, number],
};

/**
 * Everything that is a size, a colour or a duration rather than a channel: the
 * page geometry, the scroller's feel, and the whole scroll-reveal system. Written
 * to `:root` by {@link applyPortfolioLook} and read from there by the CSS, so
 * the dock can retune any of it live without a re-render.
 */
import type { RiseEase } from './pageTrack';

/** Where a sliver click lands: the folder's title, or the line you left off at. */
export type SliverReturn = 'top' | 'bottom';

/** How a page is painted: live glass over the app, or flat black. */
export type PageSurface = 'frosted' | 'solid';

export interface PortfolioLook {
  /** Scrim blur radius (px) and black alpha. */
  scrimBlurPx: number;
  scrimAlpha: number;
  /** The band down the left of the viewport the sheet does not cover, in vw.
   *  The grid shows through it; only the close pill sits there. */
  glassColumnVw: number;
  /** The centred content column inside a folder's body (px). */
  columnPx: number;
  /**
   * The width the folder geometry below is measured AT. Everything from here to
   * `headerTitlePx` is a proportion of the sheet rather than a fixed size,
   * scaled by `sheetWidth / referenceSheetPx`, so the cabinet keeps its shape
   * at any viewport instead of becoming a different layout on a laptop.
   */
  referenceSheetPx: number;
  /** A folder: the height of the tab on top of it, the tab's width and the 45°
   *  chamfer at the tab's far end. */
  tabHPx: number;
  tabWPx: number;
  chamferPx: number;
  /** The STRIP: the labelled face, measured from the top of the tab. Taller than
   *  the tab, so the number and the title straddle the tab and the sliver of
   *  body under it — and it is where an open right folder's page begins, its
   *  partner's strip being what fills the column beside it. A folder has no
   *  height of its own beyond this: what it PAINTS is its slot, which the track
   *  runs down to the body of the row in front. */
  stripHPx: number;
  /** Vertical step between rows, in the cabinet and the pile alike. LESS than
   *  the slot a folder paints, which is what makes rows overlap and a pile read
   *  as a pile; what is left between the two piles is the open page. */
  rowPitchPx: number;
  /** Where the columns divide, as a percentage of the sheet. Even rows use the
   *  first, odd rows the second, so the cabinet never reads as a table. */
  splitA: number;
  splitB: number;
  /** The title on a folder's strip — fitted to it, never taller than it — and
   *  the much larger one its open page opens with. */
  titleSizePx: number;
  headerTitlePx: number;
  /** Hover: how far the folder under the pointer lifts, and how far every other
   *  folder fades while it is up. */
  hoverLiftPx: number;
  dimOpacity: number;
  /** Scroll spent on one turn (px). Its own dial, not a width: how far the
   *  wheel travels to turn a folder is a feel, not a length. */
  turnDistancePx: number;
  /** Curve for a rising row's POSITION; the scroll stays 1:1 either way. */
  easeRise: RiseEase;
  /** The entrance: how long after the sheet starts sliding the first row leaves
   *  the pile, and how long it takes to dock. */
  riseDelayMs: number;
  riseMs: number;
  /** Alpha of the shadow the open folder casts back over the read pile. */
  sectionShadowAlpha: number;
  /** Lenis: smoothing factor on the sheet scroller, and the wheel gain. */
  lenisLerp: number;
  wheelMultiplier: number;
  /** How long clicking a sliver takes to scroll the track back (ms). */
  sliverClickMs: number;
  /** Where a sliver click lands — see {@link SliverReturn}. */
  sliverReturn: SliverReturn;
  /** How a page is painted — see {@link PageSurface}. */
  pageSurface: PageSurface;
  /** The page glass: its black tint, its backdrop blur, and how much it lifts
   *  the colour coming through. Only used by `pageSurface: 'frosted'`. */
  pageAlpha: number;
  pageBlurPx: number;
  pageSaturate: number;
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
  scrimBlurPx: 16,
  scrimAlpha: 0.4,
  glassColumnVw: 25,
  columnPx: 656,
  // The folder geometry below is measured off the reference, and the reference
  // is a whole page at 2560 where this is a sheet beside a glass column. Taken
  // literally — scaling against the 1920 a 2560 viewport leaves for the sheet —
  // a laptop gets none of the reference's legibility, only its proportions.
  // 1600 is the width the proportions are treated as being for: at the 1296
  // sheet a 1728 viewport gives, a 45px row and a 23px title.
  referenceSheetPx: 1600,
  // Compact rows: a folder in either pile is its tab and a sliver, so six of
  // them cost a fifth of the sheet and the page you are reading gets the rest.
  tabHPx: 22,
  tabWPx: 608,
  chamferPx: 40,
  stripHPx: 40,
  rowPitchPx: 56,
  splitA: 50,
  splitB: 38,
  titleSizePx: 28,
  headerTitlePx: 160,
  hoverLiftPx: 12,
  dimOpacity: 0.1,
  turnDistancePx: 720,
  easeRise: 'easeOut',
  riseDelayMs: 500,
  riseMs: 900,
  sectionShadowAlpha: 0.45,
  lenisLerp: 0.1,
  wheelMultiplier: 1,
  // Longer than the 800ms of #10b: the click now rewinds the whole page, not
  // just the last frame of it, so the travel is a page's worth further.
  sliverClickMs: 1100,
  sliverReturn: 'top',
  pageSurface: 'frosted',
  // Measured, not chosen. 0.76 is where the 11px figure caption clears 7:1 on
  // the hardest backdrop the view has — a cold `#view-NN`, where the folders
  // are over the GRID and its four full-size covers rather than the detail
  // view's darker composition. It went up from the notebook's 0.68 because a
  // folder's tint is lighter than a page's was (34% 12% against 34% 8%), which
  // is what lets the hues tell the folders apart. Swept, not guessed:
  // 0.68 → 6.81:1, 0.74 → 7.19, 0.80 → 7.63. See `contrastProbe.ts`.
  pageAlpha: 0.76,
  pageBlurPx: 24,
  pageSaturate: 1.2,
  pillDiameterPx: 96,
  pillInsetPx: 40,
  pillOffsetPx: 73,
  pillBlurPx: 8,
  pillInkRest: 0.2,
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
const easeSheet = cubicBezier(...EASE.sheet);
const easePill = cubicBezier(...EASE.pill);

/** Eased 0→1 progress of one clip at time `ms`. */
function channel(ms: number, clip: { at: number; dur: number }, ease: (x: number) => number): number {
  return ease(clamp01((ms - clip.at) / clip.dur));
}

/** The OPEN at time `ms` (0…ENTER_MS). */
export function samplePortfolioEnter(ms: number): PortfolioValues {
  return {
    scrim: channel(ms, TIMING.enter.scrim, easeScrim),
    sheet: channel(ms, TIMING.enter.sheet, easeSheet),
    pill: channel(ms, TIMING.enter.pill, easePill),
  };
}

/** The CLOSE at time `ms` (0…EXIT_MS) — its own storyboard, 1 → 0. */
export function samplePortfolioExit(ms: number): PortfolioValues {
  return {
    scrim: 1 - channel(ms, TIMING.exit.scrim, easeScrim),
    sheet: 1 - channel(ms, TIMING.exit.sheet, easeSheet),
    pill: 1 - channel(ms, TIMING.exit.pill, easePill),
  };
}

/* ── applying values ─────────────────────────────────────────────────────── */

/** The live channel values. Defaults are REST — nothing over the page. */
export const portfolio: PortfolioValues = { scrim: 0, sheet: 0, pill: 0 };

/** Write the three channels to `:root` and mirror them into the singleton. */
export function applyPortfolioValues(v: PortfolioValues): void {
  const s = document.documentElement.style;
  s.setProperty('--pv-scrim', v.scrim.toFixed(4));
  s.setProperty('--pv-sheet', v.sheet.toFixed(4));
  s.setProperty('--pv-pill', v.pill.toFixed(4));
  portfolio.scrim = v.scrim;
  portfolio.sheet = v.sheet;
  portfolio.pill = v.pill;
}

/** Pin every channel to REST. Set before a driver takes over so a lazy-loaded
 *  dock never flashes a fully-open sheet over the page. */
export function applyPortfolioRest(): void {
  applyPortfolioValues({ scrim: 0, sheet: 0, pill: 0 });
}

/**
 * The LIVE look. Mutated in place so imperative readers (the scroller's Lenis
 * options, the sliver-click duration) always see the current value, exactly as
 * `config` does for the grid. Everything CSS can consume is a variable instead.
 */
export const look: PortfolioLook = { ...LOOK };

type LookListener = (look: PortfolioLook) => void;
const lookListeners = new Set<LookListener>();

/** Subscribe to look changes — for the values that are NOT CSS variables and so
 *  need something torn down and rebuilt when they move. Returns an unsubscribe. */
export function subscribeLook(fn: LookListener): () => void {
  lookListeners.add(fn);
  return () => {
    lookListeners.delete(fn);
  };
}

/** Publish the look: CSS variables for everything CSS can use, the `look`
 *  singleton for the rest. Called once on mount and again on every dock change,
 *  so geometry, the track and the reveal system all retune live. */
export function applyPortfolioLook(next: PortfolioLook = LOOK): void {
  Object.assign(look, next);
  const s = document.documentElement.style;
  s.setProperty('--pv-scrim-blur', `${look.scrimBlurPx}px`);
  s.setProperty('--pv-scrim-alpha', String(look.scrimAlpha));
  s.setProperty('--pv-glass-col', `${look.glassColumnVw}vw`);
  s.setProperty('--pv-hover-lift', `${look.hoverLiftPx}px`);
  s.setProperty('--pv-dim', String(look.dimOpacity));
  s.setProperty('--pv-column', `${look.columnPx}px`);
  s.setProperty('--pv-section-shadow', String(look.sectionShadowAlpha));
  s.setProperty('--pv-page-alpha', String(look.pageAlpha));
  s.setProperty('--pv-page-blur', `${look.pageBlurPx}px`);
  s.setProperty('--pv-page-saturate', String(look.pageSaturate));
  s.setProperty('--pv-pill-d', `${look.pillDiameterPx}px`);
  s.setProperty('--pv-pill-inset', `${look.pillInsetPx}px`);
  s.setProperty('--pv-pill-offset', `${look.pillOffsetPx}px`);
  s.setProperty('--pv-pill-blur', `${look.pillBlurPx}px`);
  s.setProperty('--pv-pill-ink', String(look.pillInkRest));
  s.setProperty('--pv-pill-ink-hover', String(look.pillInkHover));
  s.setProperty('--pv-pill-hover-scale', String(look.pillHoverScale));
  // A mode, not a number: 'solid' has to take `backdrop-filter` off the page
  // entirely rather than set it to a no-op, which still costs a backdrop root.
  document.documentElement.dataset.pvSurface = look.pageSurface;
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
  '--pv-sheet',
  '--pv-pill',
  '--pv-scrim-blur',
  '--pv-scrim-alpha',
  '--pv-glass-col',
  '--pv-column',
  '--pv-tab-h',
  '--pv-row-pitch',
  '--pv-strip-h',
  '--pv-title',
  '--pv-header-title',
  '--pv-hover-lift',
  '--pv-dim',
  '--pv-section-shadow',
  '--pv-page-alpha',
  '--pv-page-blur',
  '--pv-page-saturate',
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
  delete document.documentElement.dataset.pvSurface;
  Object.assign(look, LOOK); // a dev tuning session must not outlive the view
  portfolio.scrim = 0;
  portfolio.sheet = 0;
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
