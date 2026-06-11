import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CELL_COUNT,
  DIM_BY_RING,
  GAP,
  GRID_SIZE,
  PERSPECTIVE,
} from '../config';
import './GridPlane.css';

/** Centre row/column coordinate of the grid (2 for a 5x5 window). */
const CENTER = (GRID_SIZE - 1) / 2;

/** Chebyshev (chessboard) ring distance of a cell from the centre. */
function ringDistance(index: number): number {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  return Math.max(Math.abs(row - CENTER), Math.abs(col - CENTER));
}

/** Brightness multiplier for a cell, derived from its ring distance. */
function brightnessFor(index: number): number {
  const ring = ringDistance(index);
  return DIM_BY_RING[Math.min(ring, DIM_BY_RING.length - 1)];
}

/** A distinct muted colour per cell, spread evenly around the hue wheel. */
function mutedColor(index: number): string {
  const hue = Math.round((index / CELL_COUNT) * 360);
  return `hsl(${hue}, 28%, 32%)`;
}

/**
 * Layer 2 — a 5x5 window of poster cards centred in the viewport. The center
 * card (index 12 of 0..24, i.e. "13") is at full brightness; every other card
 * is dimmed by its ring distance from center. The grid lives inside a
 * `perspective` container so a later phase can tilt it; no rotation is applied
 * yet.
 */
export function GridPlane() {
  return (
    <div className="grid-plane" style={{ perspective: `${PERSPECTIVE}px` }}>
      <div
        className="grid-plane__grid"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CARD_WIDTH}px)`,
          gap: `${GAP}px`,
        }}
      >
        {Array.from({ length: CELL_COUNT }, (_, index) => {
          const label = String(index + 1).padStart(2, '0');
          return (
            <div
              key={index}
              className="grid-card"
              style={{
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
                backgroundColor: mutedColor(index),
                filter: `brightness(${brightnessFor(index)})`,
              }}
            >
              <span className="grid-card__index">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
