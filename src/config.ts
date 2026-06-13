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

/** Near-black page background. */
export const BG_COLOR = '#0d0d0d';
/** Dot matrix spacing / radius / opacity. */
export const DOT_SPACING = 24;
export const DOT_RADIUS = 1;
export const DOT_OPACITY = 0.06;

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
  // DEPTH — global plane tilt (Phase 5)
  maxTiltDeg: number;
  parallaxShiftPx: number;
  tiltLerpMs: number;
  backgroundParallaxFactor: number;
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
  // FOCUS — emphasis on the focused (centre-nearest) card (Phase 9)
  /** Scale of the focused card; eases to 1.0 by one cell of distance. */
  focusScale: number;
  /** Opacity one cell from centre (1.0 at centre). */
  unfocusedOpacity: number;
  /** Opacity two or more cells from centre. */
  farOpacity: number;
  /** Mini-map: number of items shown on each side of the current item. */
  miniMapSpan: number;
}

/** Production defaults — also the starting point for every dial. */
export const DEFAULTS: LiveConfig = {
  snapMs: 600,
  flickThreshold: 1.5,
  momentumFactor: 0.28,
  maxFlickCells: 4,
  velocityWindowMs: 120,
  settleTauPerCell: 0.15,
  // Global plane tilt reduced to 2° so the per-card facing leads (Phase 8).
  maxTiltDeg: 2,
  parallaxShiftPx: 12,
  tiltLerpMs: 200,
  backgroundParallaxFactor: 0.3,
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
  focusScale: 1.12,
  unfocusedOpacity: 0.55,
  farOpacity: 0.4,
  miniMapSpan: 3,
};

// --- Mini-map static sizes (px) ----------------------------------------------
/** Centre-to-centre spacing of mini-map squares. */
export const MINIMAP_PITCH = 26;
/** Base square edge (the current square renders at full scale, neighbours shrink). */
export const MINIMAP_SQUARE = 20;

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
