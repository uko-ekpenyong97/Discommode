import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { CARD_HEIGHT, CARD_WIDTH, GAP, PERSPECTIVE } from '../config';
import { brightnessForDistance } from '../grid';
import type { GridPos } from '../grid';
import { CONTENT, contentIndex } from '../content';
import './GridPlane.css';

/** Pixels spanned by one cell step (card + gap) on each axis. */
const CELL_SPAN_X = CARD_WIDTH + GAP;
const CELL_SPAN_Y = CARD_HEIGHT + GAP;

/**
 * Smallest window ring radius whose first *unrendered* card stays offscreen for
 * this viewport, so recycled content only ever changes out of view. The window
 * is sized to the viewport (not to how far the user has travelled), with one
 * full ring beyond the furthest visible cell. 5x5 (ring 2) is too tight
 * horizontally on wide viewports; a 1440px viewport resolves to ring 3 (7x7).
 */
function requiredRing(vw: number, vh: number): number {
  const halfVisX = (vw / 2 + CARD_WIDTH / 2) / CELL_SPAN_X;
  const halfVisY = (vh / 2 + CARD_HEIGHT / 2) / CELL_SPAN_Y;
  return Math.max(2, Math.ceil(Math.max(halfVisX, halfVisY)));
}

interface GridPlaneProps {
  position: GridPos;
  world: GridPos;
  isDragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  /** Tilt wrapper — the controller writes its 3D transform each frame. */
  tiltRef: Ref<HTMLDivElement>;
}

/**
 * Layer 2 — a fixed window of poster "slots" that recycles content to make the
 * grid feel infinite. Each slot is keyed by its window offset `(dc, dr)` and
 * holds a fixed layout position; only its *content* changes, and only when the
 * integer window centre (`world`) crosses a cell — which always happens
 * offscreen. The plane translates by just the fractional offset, so the jump in
 * transform at a shift is exactly cancelled by the content reassignment and
 * every on-screen card stays put. Brightness flows from each slot's continuous
 * distance to centre. DOM node count is constant no matter how far you travel.
 *
 * A tilt wrapper sits between the perspective container and the grid: the
 * controller writes its cursor-follow 3D transform imperatively, so tilt and
 * the React-driven pan (on the inner grid, in pre-rotation space) compose
 * cleanly without either re-rendering the other.
 */
export function GridPlane({
  position,
  world,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  tiltRef,
}: GridPlaneProps) {
  const [ring, setRing] = useState(() => requiredRing(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setRing(requiredRing(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cols = 2 * ring + 1;

  // Content for the current window. Recomputes only when the window centre or
  // ring changes — not every frame — so a settled or panning plane does no
  // content remapping work here.
  const slots = useMemo(() => {
    const out: { dc: number; dr: number; hue: number; title: string }[] = [];
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        const item = CONTENT[contentIndex(world.col + dc, world.row + dr)];
        out.push({ dc, dr, hue: item.hue, title: item.title });
      }
    }
    return out;
  }, [world.col, world.row, ring]);

  // Per frame: translate the plane by the fractional offset only (translate3d).
  const fracCol = position.col - world.col;
  const fracRow = position.row - world.row;
  const tx = -fracCol * CELL_SPAN_X;
  const ty = -fracRow * CELL_SPAN_Y;

  return (
    <div
      className={isDragging ? 'grid-plane grid-plane--dragging' : 'grid-plane'}
      style={{ perspective: `${PERSPECTIVE}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={tiltRef} className="grid-plane__tilt">
        <div
          className="grid-plane__grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${CARD_WIDTH}px)`,
            gap: `${GAP}px`,
            transform: `translate3d(${tx}px, ${ty}px, 0)`,
          }}
        >
          {slots.map((s) => {
            const distance = Math.max(Math.abs(s.dc - fracCol), Math.abs(s.dr - fracRow));
            return (
              <div
                key={`${s.dc}|${s.dr}`}
                className="grid-card"
                style={{
                  width: `${CARD_WIDTH}px`,
                  height: `${CARD_HEIGHT}px`,
                  backgroundColor: `hsl(${s.hue}, 28%, 32%)`,
                  filter: `brightness(${brightnessForDistance(distance)})`,
                }}
              >
                <span className="grid-card__index">{s.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
