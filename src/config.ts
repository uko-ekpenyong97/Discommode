/**
 * Configuration.
 *
 * The feel- and layout-related values are a small **reactive store** so DialKit
 * (dev only) can retune them live: `config` is a mutable singleton that the rAF
 * loop and event handlers read directly each frame, and `useConfig()` lets React
 * components subscribe and re-render when a value changes. Production defaults
 * are `DEFAULTS`. Purely static visual constants stay as plain exports below.
 */
import { useSyncExternalStore } from 'react';

// --- Static visual constants (not dialed) ------------------------------------

/** CSS perspective applied to the grid container, in px. */
export const PERSPECTIVE = 1200;

/** HUD line + text colours and the left ruler. */
export const HUD_LINE_COLOR = 'rgba(255, 255, 255, 0.28)';
export const HUD_TEXT_COLOR = 'rgba(255, 255, 255, 0.5)';
export const RULER_TICK_COUNT = 24;
export const RULER_TICK_SPACING = 28;

/** Per-ring brightness used by the continuous dimming. */
export const DIM_BY_RING = [1, 0.45, 0.3];

/** Poster aspect ratio (width : height); card height derives from card width. */
export const CARD_ASPECT_W = 3;
export const CARD_ASPECT_H = 4;

/** Pointer travel (px) before a drag engages and locks an axis. */
/**
 * Pointer travel (px) before a drag "starts" — just a dead zone so a tap doesn't
 * micro-pan. (Phase 8 replaced axis-locked navigation with free 2D panning, so
 * the old `axisLockThresholdPx` axis-lock constant is gone; drags now move both
 * axes at once.)
 */
export const dragDeadZonePx = 4;
/** Upper bound on the settle-time scaling for long flicks. */
export const settleTauMaxScale = 2;

/**
 * World cell centred on a cold load with no hash — the grid's HOME.
 *
 * `contentIndex(col, row) = mod(row * wrapStride + col, N)`, so cell (0, 0) is
 * content index 0 for ANY wrap stride: the site always opens on the first card
 * in the manifest (01, Discommode) rather than wherever the lattice happened to
 * land. Deep links (`#item-NN`, `#read-NN`, `#view-NN`) are unaffected — they
 * centre on their own card via `nearestCellForContent`.
 */
export const START_COL = 0;
export const START_ROW = 0;

// --- Reactive (dialed) config ------------------------------------------------

export interface LiveConfig {
  // MOTION
  snapMs: number;
  flickThreshold: number;
  momentumFactor: number;
  maxFlickCells: number;
  velocityWindowMs: number;
  settleTauPerCell: number;
  // GRID
  /** Cap (ms) on the click-to-centre glide before a card opens its detail (Phase 14). */
  clickCenterMaxMs: number;
  // DEPTH — global plane tilt (Phase 5)
  maxTiltDeg: number;
  parallaxShiftPx: number;
  tiltLerpMs: number;
  overlayDepthHeadline: number;
  overlayDepthCaptions: number;
  overlayDepthCta: number;
  // DEPTH — per-card cursor-facing rotation (Phase 8)
  /** Distance (px) the cursor "floats" in front of the plane; bigger = gentler. */
  cursorDepthPx: number;
  /** Multiplier on the facing angle before clamping. */
  cardFaceStrength: number;
  /** Clamp on a single card's facing rotation, in degrees. */
  maxCardTiltDeg: number;
  /** Per-card facing ease time constant, in ms. */
  cardTiltLerpMs: number;
  // LAYOUT
  cardWidth: number;
  gap: number;
  /**
   * Wrap stride: the number of columns after which a content row wraps in the
   * tiling formula `index = mod(row * wrapStride + col, N)`. It controls the
   * pattern in which the N items tile across the infinite plane — a larger
   * stride shears the diagonal repeat differently.
   */
  wrapStride: number;
  // OVERLAY
  overlayFadeMs: number;
  overlayCardDim: number;
  ctaHoverScale: number;
  /**
   * How far in front of the card face the hover overlay plate floats, in the
   * card's local CSS-px depth scale. Unitless on purpose: the plate is
   * counter-scaled by `(perspective - z) / perspective` so it still registers
   * pixel-exactly with the cover at rest, and that maths needs a bare number.
   * Bigger = more parallax as the card turns under the cursor. 0 = flush.
   */
  overlayZ: number;
  /**
   * Fade time (ms) for the overlay plate appearing on hover. 0 is the default
   * and matches the halfof8 reference — a hard switch, no tween. Distinct from
   * `overlayFadeMs`, which times the *text* overlay and the card opacity lift.
   */
  overlayLayerFadeMs: number;
  // FOCUS — emphasis on the focused (centre-nearest) card (Phase 9)
  /** Scale of the focused card; eases to 1.0 by one cell of distance. */
  focusScale: number;
  /** Opacity one cell from centre (1.0 at centre). */
  unfocusedOpacity: number;
  /** Opacity two or more cells from centre. */
  farOpacity: number;
  /** Hovered card's opacity is lifted toward this so its overlay reads (Phase 13). */
  hoverLiftOpacity: number;
  /** Mini-map: number of items shown on each side of the current item. */
  miniMapSpan: number;
  // DETAIL — grid ↔ detail transition + in-detail slide (Phase 10) + 3-card layout (13/14)
  /** Grid ↔ detail expand/collapse duration, in ms. */
  detailTransitionMs: number;
  /** Centre detail card height as a fraction of viewport height (3:4 preserved). */
  detailCardScale: number;
  /** Side detail card size as a fraction of the centre card (the 3-up look). */
  detailSideScale: number;
  /** Side detail cards' resting opacity (distinct from the hover-isolate dim). */
  detailSideOpacity: number;
  /** Horizontal gap (px) between adjacent detail cards. */
  detailGap: number;
  /** Non-hovered detail panels dim to this while another is hovered. */
  detailHoverDim: number;
  /** Opacity of the bottom scrim behind the detail text (0 = none). */
  detailScrimOpacity: number;
  /** Fade time (ms) for the detail chrome (bar/title/mini-map) around the morph. */
  detailChromeFadeMs: number;
  /** Time constant (ms) for the prev/next panel slide settle. */
  detailSlideMs: number;
  // SKY — the WebGL sky driven by EnvState. See `docs/sky.md`; these are the
  // prototype's five FEEL dials plus the transition, and nothing else: the old
  // weather modifiers (fogDesaturation / fogLift / cloudMute / stormDarken)
  // went with the tint model, because weather is drawn now rather than mixed
  // into a colour.
  /** Cross-fade time constant (ms) when the sky's EnvState target changes. */
  skyTransitionMs: number;
  /** Multiplier on every motion in the sky: the deck, the bank, the warp. */
  skyDrift: number;
  /** Noise frequency of the cloud deck — bigger is smaller, busier cloud. */
  cloudScale: number;
  /** How far up the screen the fog bank reaches, as a fraction of the height. */
  fogHeight: number;
  /** Final saturation multiplier over the whole sky. */
  skySaturation: number;
  /**
   * Star disc radius, as a multiple of the one-device-pixel dot the field
   * started as. 2 ships. The disc is a bright core over its inner 45% and a
   * faint halo out to the rest; the PEAK does not change with it, so what
   * the dial grows is the light around a star and not the star.
   */
  starSize: number;
  /**
   * The moon's disc radius, as a multiple of the flat disc it replaced. 1
   * ships, and at 1 a FULL moon is the same pixels the flat one was — what
   * changed is every other night of the month.
   */
  moonSize: number;
  /**
   * Earthshine: what the unlit side of the moon still gives back, as a
   * fraction of the lit side. Sunlight off the Earth, and the reason a
   * crescent reads as a whole sphere with a sliver lit rather than as a
   * sliver floating on its own. 0 is a crescent and nothing else.
   */
  moonEarthshine: number;
  /**
   * How soft the terminator is, measured in COSINE OF INCIDENCE and not in
   * disc radius — see the shader. At a quarter the two are the same thing;
   * at the ends of the month measuring in cosine is what stops a full moon
   * having a dim rim down its left side.
   */
  moonTerminatorSoft: number;
  /**
   * MOONLIGHT: how much a moon that is up lifts the sky round it — a broad,
   * cool brightening, scaled by the lit fraction and by sin(altitude), which
   * also washes out the stars near it. One dial for the lot. 0 is a moon
   * that lights nothing but itself.
   */
  moonGlow: number;
  /** Additive grain over the sky, which is also what hides `skyResolution`. */
  skyGrain: number;
  /**
   * Backing-store scale, on top of the DPR cap of 2. Below 1 the sky renders
   * small and the compositor upscales it — the grain covers the softening. See
   * the frame-time table in `docs/sky.md` for what set the shipped value.
   */
  skyResolution: number;
  /**
   * The most pixels the sky's backing store may have, in millions; above it the
   * store is scaled down (after `skyResolution`). 0 = no cap, which ships: it is
   * the lever for a machine slower than the one in "Frame time" in `docs/sky.md`.
   */
  skyMaxMegapixels: number;
  // SKY · FLUID — the wake the pointer and the page's moving cards leave in the
  // weather. See "The wake" in `docs/sky.md`; the solver is `src/sky/fluid.ts`.
  /** Master switch. Off, the sky is exactly the sky without a wake. */
  fluidOn: boolean;
  /** Splat radius, as a fraction of the viewport height (the gaussian's 1/e). */
  fluidRadius: number;
  /** Multiplier on what the POINTER puts in — its push and its density. */
  fluidStrength: number;
  /** Vorticity confinement: how much the wake curls into eddies. */
  fluidCurl: number;
  /** Velocity kept per 60 Hz frame. 0.98 ≈ a wake that lives a few seconds. */
  velocityDissipation: number;
  /** Density kept per 60 Hz frame. 0.94 ≈ a parting that closes in about one. */
  densityDissipation: number;
  /** How far every noise sample (deck, bank, base warp) moves with the wake. */
  fluidWarp: number;
  /** How far the stars are carried along the wake on a clear night. */
  starPush: number;
  /** How much brighter, and harder-twinkling, a star in the wake gets. */
  starGlow: number;
  /** How much of the cloud deck the wake's density parts. */
  cloudPart: number;
  /** How much of the fog bank the wake's density clears. */
  fogPart: number;
  /** How far a gust bends the rain streaks. */
  rainBend: number;
  /**
   * How far the wake drags the BASE GRADIENT — the point it is sampled at,
   * and the position along the zenith→horizon ramp that point reads, so the
   * two compound. Much larger than `fluidWarp`, which only moves noise: this
   * is the paint-in-water term, and at dusk it pulls the warm horizon up
   * into the zenith blue. Seen only where the gradient is — clear and partly
   * skies, and the sky above the bank in fog; the deck paints over it
   * everywhere else.
   */
  gradientPush: number;
  /** How far the wake's DENSITY drifts the gradient's hue toward the horizon
   *  colour: the stain the drag leaves behind it. */
  gradientSwirl: number;
  /** Multiplier on what the PAGE puts in (a sliding card, the sheet, the
   *  doorway). 0 turns the page's splats off and leaves the pointer's. */
  pageSplat: number;
  /** Dev: draw the fluid texture in the bottom-left corner (F in the dock). */
  fluidDebug: boolean;
}

/** Production defaults — also the starting point for every dial. */
export const DEFAULTS: LiveConfig = {
  snapMs: 600,
  flickThreshold: 1.5,
  momentumFactor: 0.28,
  maxFlickCells: 4,
  velocityWindowMs: 120,
  settleTauPerCell: 0.15,
  clickCenterMaxMs: 500,
  // Global plane tilt reduced to 2° so the per-card facing leads (Phase 8).
  maxTiltDeg: 2,
  parallaxShiftPx: 12,
  tiltLerpMs: 200,
  overlayDepthHeadline: 1.6,
  overlayDepthCaptions: 1.3,
  overlayDepthCta: 1.15,
  cursorDepthPx: 600,
  cardFaceStrength: 0.6,
  maxCardTiltDeg: 10,
  cardTiltLerpMs: 250,
  cardWidth: 300,
  gap: 120,
  wrapStride: 5,
  overlayFadeMs: 180,
  overlayCardDim: 0.75,
  ctaHoverScale: 1.08,
  overlayZ: 24,
  overlayLayerFadeMs: 0,
  focusScale: 1.12,
  unfocusedOpacity: 0.55,
  farOpacity: 0.4,
  hoverLiftOpacity: 0.9,
  miniMapSpan: 3,
  detailTransitionMs: 450,
  detailCardScale: 0.82,
  detailSideScale: 0.85,
  detailSideOpacity: 0.85,
  detailGap: 40,
  detailHoverDim: 0.45,
  detailScrimOpacity: 0.2,
  detailChromeFadeMs: 200,
  detailSlideMs: 420,
  skyTransitionMs: 1500,
  skyDrift: 1,
  cloudScale: 2,
  fogHeight: 0.85,
  skySaturation: 1,
  skyGrain: 0.03,
  starSize: 2,
  moonSize: 1,
  moonEarthshine: 0.06,
  moonTerminatorSoft: 0.03,
  moonGlow: 0.12,
  skyResolution: 1,
  skyMaxMegapixels: 0,
  fluidOn: true,
  fluidRadius: 0.08,
  fluidStrength: 1,
  fluidCurl: 20,
  velocityDissipation: 0.98,
  densityDissipation: 0.94,
  fluidWarp: 0.02,
  starPush: 0.6,
  starGlow: 1.5,
  cloudPart: 0.5,
  fogPart: 0.7,
  rainBend: 0.15,
  gradientPush: 0.35,
  gradientSwirl: 0.15,
  pageSplat: 1,
  fluidDebug: false,
};

// --- Mini-map / pagination squares static sizes (px) -------------------------
/** Centre-to-centre spacing of the pagination squares. */
export const MINIMAP_PITCH = 24;
/** Square size (portrait, page-like): width × height. */
export const MINIMAP_SQUARE_W = 16;
export const MINIMAP_SQUARE_H = 20;

/** Live values. Mutated in place so imperative readers (the rAF loop, event
 *  handlers) always see the current value without re-subscribing. */
export const config: LiveConfig = { ...DEFAULTS };

let version = 0;
const listeners = new Set<() => void>();

/** Merge a partial update into the live config and notify subscribers. */
export function setConfig(patch: Partial<LiveConfig>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof LiveConfig)[]) {
    const next = patch[key];
    if (next !== undefined && config[key] !== next) {
      (config as unknown as Record<string, unknown>)[key] = next;
      changed = true;
    }
  }
  if (changed) {
    version += 1;
    listeners.forEach((fn) => fn());
  }
}

/** Subscribe to any live config change. Returns an unsubscribe function. Used by
 *  `useConfig` (React) and by the controller to re-apply imperative effects. */
export function subscribeConfig(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Subscribe a component to live config changes. Returns the live `config`
 * singleton; the component re-renders whenever any value changes (the version
 * counter is the snapshot), so reading `config.cardWidth` in render is always
 * current — values are never captured once at mount.
 */
export function useConfig(): LiveConfig {
  useSyncExternalStore(
    subscribeConfig,
    () => version,
    () => version,
  );
  return config;
}

// --- Derived layout helpers (read live values) -------------------------------

/** Card height from the live card width and the fixed 3:4 aspect ratio. */
export function cardHeight(): number {
  return (config.cardWidth * CARD_ASPECT_H) / CARD_ASPECT_W;
}

/** Pixels spanned by one cell step (card + gap) on each axis, live. */
export function cellSpanX(): number {
  return config.cardWidth + config.gap;
}
export function cellSpanY(): number {
  return cardHeight() + config.gap;
}
