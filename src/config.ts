/**
 * Central configuration for the interactive portfolio grid.
 *
 * Every layout, sizing, and visual constant lives here so the whole scene can
 * be re-tuned from one place. Components import from this file rather than
 * baking in magic numbers.
 */

// --- Grid geometry -----------------------------------------------------------

/** Cells per row / column in the visible window (5 x 5 = 25 cells). */
export const GRID_SIZE = 5;

/** Total number of cells rendered. */
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** Width of a single poster card, in px. */
export const CARD_WIDTH = 300;

/** Poster aspect ratio, expressed as width : height. */
export const CARD_ASPECT_W = 3;
export const CARD_ASPECT_H = 4;

/** Card height derived from the 3:4 aspect ratio (300 -> 400). */
export const CARD_HEIGHT = (CARD_WIDTH * CARD_ASPECT_H) / CARD_ASPECT_W;

/** Gap between adjacent cells, in px. */
export const GAP = 120;

/**
 * CSS perspective applied to the grid container. Unused for now (no rotation
 * yet) but in place so a later phase can tilt cards in 3D.
 */
export const PERSPECTIVE = 1200;

/** 0-based index of the focused (center) cell. For a 5x5 grid this is 12 ("13 of 25"). */
export const CENTER_INDEX = Math.floor(CELL_COUNT / 2);

/**
 * Brightness multiplier per ring (Chebyshev) distance from the center cell.
 * Index 0 = focused center, 1 = first ring, 2 = second ring. Distances beyond
 * the last entry clamp to the final value.
 */
export const DIM_BY_RING = [1, 0.45, 0.3];

// --- BackgroundLayer ---------------------------------------------------------

/** Near-black page background. */
export const BG_COLOR = '#0d0d0d';

/** Spacing of the dot matrix, in px. */
export const DOT_SPACING = 24;

/** Dot radius of the matrix, in px. */
export const DOT_RADIUS = 1;

/** Opacity of the white matrix dots (kept low for subtlety). */
export const DOT_OPACITY = 0.06;

// --- FrameHUD ----------------------------------------------------------------

/** Thin-line colour for HUD rulers and crosshairs. */
export const HUD_LINE_COLOR = 'rgba(255, 255, 255, 0.28)';

/** Text colour for HUD labels. */
export const HUD_TEXT_COLOR = 'rgba(255, 255, 255, 0.5)';

/** Number of tick marks down the left-hand ruler. */
export const RULER_TICK_COUNT = 24;

/** Vertical spacing between ruler ticks, in px. */
export const RULER_TICK_SPACING = 28;

// --- Motion / feel -----------------------------------------------------------
// Phase 2: drag + keyboard navigation. All feel-related numbers live here.

/**
 * Total pointer travel (px) required before a drag engages. At that moment the
 * dominant axis is locked for the rest of the gesture.
 */
export const axisLockThresholdPx = 10;

/**
 * Time for a release-snap to visually settle, in ms. Drives the exponential
 * ease-out that lerps the plane toward the nearest cell.
 */
export const snapMs = 600;

// Phase 4 removed the grid bounds, so the old `rubberBandFactor` (edge
// resistance) was deleted — there are no edges to resist against anymore.

// --- Momentum (Phase 3) ------------------------------------------------------
// A fast flick coasts several cells before settling; a slow drag still snaps to
// the adjacent cell.

/**
 * Rolling window (ms) of recent pointer samples used to measure release
 * velocity. A windowed average (oldest→newest in the window) makes the flick
 * robust to a finger that pauses before releasing: pause = zero velocity.
 */
export const velocityWindowMs = 120;

/**
 * Minimum release speed (cells/sec) that counts as a flick. Below this the grid
 * just snaps to the nearest cell, exactly as a slow drag (no behaviour change).
 */
export const flickThreshold = 1.5;

/**
 * How far a flick coasts: projected landing = position + velocity *
 * momentumFactor. Effectively the seconds of velocity carried into the glide.
 */
export const momentumFactor = 0.28;

/** Maximum number of cells a single flick may travel from the release cell. */
export const maxFlickCells = 4;

/**
 * Settle time grows mildly with flick distance so longer glides decelerate over
 * a little more time: tau scale = 1 + settleTauPerCell * (cellsTravelled - 1).
 */
export const settleTauPerCell = 0.15;

/** Upper bound on the settle-time scaling, so very long flicks don't crawl. */
export const settleTauMaxScale = 2;

// --- Tilt / parallax (Phase 5) -----------------------------------------------
// Cursor-follow 3D tilt of the grid plane, with layered parallax for depth.
// Purely visual: it never affects pan, snap, focus, or recycling.

/** Maximum plane tilt at the viewport edges, in degrees. Subtle by design. */
export const maxTiltDeg = 4;

/** Plane translate (px) at the edges, opposite the cursor, to deepen parallax. */
export const parallaxShiftPx = 12;

/** Time constant (ms) of the tilt ease — the plane glides toward the cursor's
 *  target tilt, never snaps. */
export const tiltLerpMs = 200;

/** Background dot-matrix shift as a fraction of the plane's shift (same
 *  direction, weaker) so it reads as the deepest layer. */
export const backgroundParallaxFactor = 0.3;

// --- Hover overlay (Phase 6) -------------------------------------------------
// Typographic overlay on the focused card, its layers floating at different
// depths so cursor movement separates them spatially.

/** Fade-in duration (ms) of the overlay. (Fade-out is immediate.) */
export const overlayFadeMs = 180;

/**
 * Depth factor per overlay layer (card itself = 1.0). Each layer parallaxes by
 * its factor times the cursor-tilt shift, so higher factors float further above
 * the card.
 */
export const overlayDepthHeadline = 1.6;
export const overlayDepthCaptions = 1.3;
export const overlayDepthCta = 1.15;

/** Scale the CTA button grows to on hover (eased in CSS). */
export const ctaHoverScale = 1.08;

/** Brightness multiplier applied to the focused card while the overlay shows,
 *  so the white type reads. Neighbours are unaffected. */
export const overlayCardDim = 0.75;
