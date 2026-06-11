import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CELL_COUNT,
  GAP,
  GRID_SIZE,
  PERSPECTIVE,
} from '../config';
import {
  CENTER_COL,
  CENTER_ROW,
  brightnessForDistance,
  cellColRow,
  cellDistance,
} from '../grid';
import type { GridPos } from '../grid';
import './GridPlane.css';

/** Pixels spanned by one cell step (card + gap) on each axis. */
const CELL_SPAN_X = CARD_WIDTH + GAP;
const CELL_SPAN_Y = CARD_HEIGHT + GAP;

/** A distinct muted colour per cell, spread evenly around the hue wheel. */
function mutedColor(index: number): string {
  const hue = Math.round((index / CELL_COUNT) * 360);
  return `hsl(${hue}, 28%, 32%)`;
}

interface GridPlaneProps {
  position: GridPos;
  isDragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}

/**
 * Layer 2 — a 5x5 window of poster cards. The plane translates itself from the
 * continuous grid `position` (the card whose coordinate equals `position` sits
 * at the viewport centre). Each card's brightness is a continuous function of
 * its distance from that centre, so dimming flows as the plane moves. The grid
 * lives inside a `perspective` container reserved for tilt in a later phase.
 */
export function GridPlane({
  position,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: GridPlaneProps) {
  const translateX = -(position.col - CENTER_COL) * CELL_SPAN_X;
  const translateY = -(position.row - CENTER_ROW) * CELL_SPAN_Y;

  return (
    <div
      className={isDragging ? 'grid-plane grid-plane--dragging' : 'grid-plane'}
      style={{ perspective: `${PERSPECTIVE}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="grid-plane__grid"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${CARD_WIDTH}px)`,
          gap: `${GAP}px`,
          transform: `translate3d(${translateX}px, ${translateY}px, 0)`,
        }}
      >
        {Array.from({ length: CELL_COUNT }, (_, index) => {
          const { col, row } = cellColRow(index);
          const brightness = brightnessForDistance(cellDistance(col, row, position));
          const label = String(index + 1).padStart(2, '0');
          return (
            <div
              key={index}
              className="grid-card"
              style={{
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
                backgroundColor: mutedColor(index),
                filter: `brightness(${brightness})`,
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
