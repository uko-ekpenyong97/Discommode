import { memo } from 'react';
import type { CSSProperties } from 'react';
import {
  CARD_ASPECT_H,
  CARD_ASPECT_W,
  HUD_LINE_COLOR,
  HUD_TEXT_COLOR,
  RULER_TICK_COUNT,
  RULER_TICK_SPACING,
  useConfig,
} from '../config';
import { CONTENT_COUNT, contentIndex } from '../content';
import { MiniMap } from './MiniMap';
import './FrameHUD.css';

/** Colour tokens exposed to the stylesheet as CSS custom properties. */
const hudVars = {
  '--hud-line': HUD_LINE_COLOR,
  '--hud-text': HUD_TEXT_COLOR,
} as CSSProperties;

interface FrameHUDProps {
  /** Focused world cell coordinates: drive both the counter and the readout. */
  worldCol: number;
  worldRow: number;
  /** Navigate to a content index (mini-map square clicks). */
  onNavigate: (contentIndex: number) => void;
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
export const FrameHUD = memo(function FrameHUD({ worldCol, worldRow, onNavigate }: FrameHUDProps) {
  const cfg = useConfig();
  // Focused content index derived here from the world cell + live wrap stride,
  // so retuning the stride updates the counter (this component subscribes to it).
  const focusedIndex = contentIndex(worldCol, worldRow);
  const counter = `${String(focusedIndex + 1).padStart(2, '0')} / ${CONTENT_COUNT}`;

  // Crosshairs sit at the corners of the focused card (live size).
  const halfW = cfg.cardWidth / 2;
  const halfH = (cfg.cardWidth * CARD_ASPECT_H) / CARD_ASPECT_W / 2;
  const corners = [
    { id: 'tl', x: -halfW, y: -halfH },
    { id: 'tr', x: halfW, y: -halfH },
    { id: 'bl', x: -halfW, y: halfH },
    { id: 'br', x: halfW, y: halfH },
  ];

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
      {corners.map((c) => (
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

      {/* bottom-left: interactive mini-map position indicator */}
      <MiniMap focusedIndex={focusedIndex} onNavigate={onNavigate} />
    </div>
  );
});
