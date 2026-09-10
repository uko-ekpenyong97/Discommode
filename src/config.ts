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

/** World cell centred at startup (the initially focused card). */
export const START_COL = 2;
export const START_ROW = 2;

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
  // SKY — WebGL atmospheric color field driven by EnvState (Phase 12 / 12b)
  /** Cross-fade time constant (ms) when the sky's EnvState target changes. */
  skyTransitionMs: number;
  /** Cursor-Y parallax shift of the field (0 = off). Subtle when on. */
  skyParallax: number;
  /** Noise-domain drift per second — "alive but barely". */
  fieldDriftSpeed: number;
  /** Color-boundary diffuseness: 0 = crisp, 1 = watercolor bleed. */
  fieldSoftness: number;
  /** Subtle additive grain strength over the field. */
  fieldGrain: number;
  /** Fog: how strongly it desaturates the field toward gray (SF hero state). */
  fogDesaturation: number;
  /** Fog: how strongly it lifts/lightens the field toward soft gray. */
  fogLift: number;
  /** Cloudiness: saturation mute + slight darken strength. */
  cloudMute: number;
  /** Precip/storm: darken strength. */
  stormDarken: number;
  /** Precip/storm: extra drift agitation (multiplier on drift at storm=1). */
  stormDrift: number;
  /** Wind: additive drift-speed contribution per unit of normalized windSpeed. */
  windDriftFactor: number;
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
  skyParallax: 0,
  fieldDriftSpeed: 0.02,
  fieldSoftness: 0.6,
  fieldGrain: 0.03,
  fogDesaturation: 0.7,
  fogLift: 0.5,
  cloudMute: 0.5,
  stormDarken: 0.45,
  stormDrift: 1,
  windDriftFactor: 0.04,
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
      config[key] = next;
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
