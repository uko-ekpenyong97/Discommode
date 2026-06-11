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
