import { memo } from 'react';
import type { CSSProperties } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CELL_COUNT,
  HUD_LINE_COLOR,
  HUD_TEXT_COLOR,
  RULER_TICK_COUNT,
  RULER_TICK_SPACING,
} from '../config';
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
  /** Flat index (0-based) of the focused card, reflected in the counter. */
  focusedIndex: number;
}

/**
 * Layer 3 — a fixed, full-viewport overlay that never moves and ignores
 * pointer events. Holds placeholder instrumentation: a left-edge tick ruler,
 * crosshairs at the corners of the center cell, an index counter (top-left)
 * that tracks the focused card, and a coordinates readout (bottom-right).
 * Memoised on `focusedIndex` so the per-frame plane motion doesn't re-render it.
 */
export const FrameHUD = memo(function FrameHUD({ focusedIndex }: FrameHUDProps) {
  const counter = `${String(focusedIndex + 1).padStart(2, '0')} / ${CELL_COUNT}`;

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

      {/* bottom-right: coordinates readout (placeholder values) */}
      <div className="hud-coords">X&nbsp;+000.0&ensp;Y&nbsp;+000.0</div>
    </div>
  );
});
