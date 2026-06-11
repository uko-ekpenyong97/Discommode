import { memo } from 'react';
import type { CSSProperties } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  HUD_LINE_COLOR,
  HUD_TEXT_COLOR,
  RULER_TICK_COUNT,
  RULER_TICK_SPACING,
} from '../config';
import { CONTENT_COUNT } from '../content';
import './FrameHUD.css';

/** The four corners of the center cell, as offsets from the viewport center. */
const HALF_W = CARD_WIDTH / 2;
const HALF_H = CARD_HEIGHT / 2;
const CORNERS = [
  { id: 'tl', x: -HALF_W, y: -HALF_H },
  { id: 'tr', x: HALF_W, y: -HALF_H },
  { id: 'bl', x: -HALF_W, y: HALF_H },
  { id: 'br', x: HALF_W, y: HALF_H },
];

/** Colour tokens exposed to the stylesheet as CSS custom properties. */
const hudVars = {
  '--hud-line': HUD_LINE_COLOR,
  '--hud-text': HUD_TEXT_COLOR,
} as CSSProperties;

interface FrameHUDProps {
  /** Content index (0-based) of the focused card, reflected in the counter. */
  focusedIndex: number;
  /** Focused world cell coordinates, shown in the world-coordinate readout. */
  worldCol: number;
  worldRow: number;
}

/**
 * Layer 3 — a fixed, full-viewport overlay that never moves and ignores
 * pointer events. Holds placeholder instrumentation: a left-edge tick ruler,
 * crosshairs at the corners of the center cell, an index counter (top-left)
 * that tracks the focused card's content, a placeholder coordinates readout and
 * a live world-coordinate readout (bottom-right). Memoised on its props (all
 * numbers that change only when the window shifts), so the per-frame plane
 * motion never re-renders it.
 */
export const FrameHUD = memo(function FrameHUD({
  focusedIndex,
  worldCol,
  worldRow,
}: FrameHUDProps) {
  const counter = `${String(focusedIndex + 1).padStart(2, '0')} / ${CONTENT_COUNT}`;

  return (
    <div className="frame-hud" style={hudVars}>
      {/* top-left: index counter */}
      <div className="hud-index">{counter}</div>

      {/* left edge: tick-mark ruler */}
      <div
        className="hud-ruler"
        style={{ height: `${(RULER_TICK_COUNT - 1) * RULER_TICK_SPACING}px` }}
      >
        {Array.from({ length: RULER_TICK_COUNT }, (_, i) => (
          <div
            key={i}
            className={
              i % 5 === 0 ? 'hud-ruler__tick hud-ruler__tick--major' : 'hud-ruler__tick'
            }
            style={{ top: `${i * RULER_TICK_SPACING}px` }}
          />
        ))}
      </div>

      {/* crosshairs at the corners of the center cell */}
      {CORNERS.map((c) => (
        <div
          key={c.id}
          className="hud-crosshair"
          style={{ left: `calc(50% + ${c.x}px)`, top: `calc(50% + ${c.y}px)` }}
        >
          <span className="hud-crosshair__h" />
          <span className="hud-crosshair__v" />
        </div>
      ))}

      {/* bottom-right: world coordinate readout + placeholder coordinates */}
      <div className="hud-world">
        c:{worldCol}&ensp;r:{worldRow}
      </div>
      <div className="hud-coords">X&nbsp;+000.0&ensp;Y&nbsp;+000.0</div>
    </div>
  );
});
