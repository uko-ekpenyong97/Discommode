import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { CARD_ASPECT_H, CARD_ASPECT_W, PERSPECTIVE, useConfig } from '../config';
import { brightnessForDistance } from '../grid';
import type { GridPos } from '../grid';
import { CONTENT, contentIndex } from '../content';
import type { PosterItem } from '../content';
import { CardOverlay } from './CardOverlay';
import './GridPlane.css';

/**
 * Smallest window ring radius whose first *unrendered* card stays offscreen for
 * this viewport, so recycled content only ever changes out of view. Sized to the
 * viewport AND the live card/gap (re-derived when either changes), with one full
 * ring beyond the furthest visible cell. 5x5 (ring 2) is too tight horizontally
 * on wide viewports; a 1440px viewport at default sizes resolves to ring 3 (7x7).
 */
function requiredRing(vw: number, vh: number, cardW: number, cardH: number, gap: number): number {
  const spanX = cardW + gap;
  const spanY = cardH + gap;
  const halfVisX = (vw / 2 + cardW / 2) / spanX;
  const halfVisY = (vh / 2 + cardH / 2) / spanY;
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
  /** Whether the focused card's hover overlay is shown. */
  overlayVisible: boolean;
}

interface Slot {
  dc: number;
  dr: number;
  item: PosterItem;
  /** Eager-load images on the focused card and its immediate ring; lazy beyond. */
  eager: boolean;
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
 * Layout (card width / gap / wrap stride) is read from the live config via
 * `useConfig`, so DialKit retuning re-lays-out around the same focused world
 * cell. A tilt wrapper between the perspective container and the grid carries
 * the cursor-follow 3D transform (written imperatively by the controller).
 */
export function GridPlane({
  position,
  world,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  tiltRef,
  overlayVisible,
}: GridPlaneProps) {
  const cfg = useConfig();
  const cardW = cfg.cardWidth;
  const cardH = (cardW * CARD_ASPECT_H) / CARD_ASPECT_W;
  const gap = cfg.gap;

  // Re-derive the window on viewport resize. Layout-config changes flow through
  // `cfg` (a render input), so the ring below recomputes on those automatically.
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const ring = requiredRing(viewport.w, viewport.h, cardW, cardH, gap);
  const cols = 2 * ring + 1;

  // Content for the current window. Recomputes only when the window centre, ring,
  // or wrap stride changes — not every frame. `stride` is read by contentIndex
  // (live config), so it's named here to keep the dependency honest + visible.
  const stride = cfg.wrapStride;
  const slots = useMemo<Slot[]>(() => {
    void stride; // contentIndex(...) reads config.wrapStride internally
    const out: Slot[] = [];
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        out.push({
          dc,
          dr,
          item: CONTENT[contentIndex(world.col + dc, world.row + dr)],
          eager: Math.max(Math.abs(dc), Math.abs(dr)) <= 1,
        });
      }
    }
    return out;
  }, [world.col, world.row, ring, stride]);

  // Per frame: translate the plane by the fractional offset only (translate3d).
  // The focused world cell is preserved through layout changes, so it stays
  // centred (when settled, frac is 0 and the transform is identity).
  const fracCol = position.col - world.col;
  const fracRow = position.row - world.row;
  const tx = -fracCol * (cardW + gap);
  const ty = -fracRow * (cardH + gap);

  // The focused (centre) card backs the overlay; it is dimmed while it shows.
  const focusedItem = CONTENT[contentIndex(world.col, world.row)];

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
            gridTemplateColumns: `repeat(${cols}, ${cardW}px)`,
            gap: `${gap}px`,
            transform: `translate3d(${tx}px, ${ty}px, 0)`,
          }}
        >
          {slots.map((s) => {
            const distance = Math.max(Math.abs(s.dc - fracCol), Math.abs(s.dr - fracRow));
            const isFocused = s.dc === 0 && s.dr === 0;
            const brightness =
              brightnessForDistance(distance) * (isFocused && overlayVisible ? cfg.overlayCardDim : 1);
            return (
              <div
                key={`${s.dc}|${s.dr}`}
                className="grid-card"
                style={{
                  width: `${cardW}px`,
                  height: `${cardH}px`,
                  backgroundColor: `hsl(${s.item.hue}, 28%, 32%)`,
                  filter: `brightness(${brightness})`,
                }}
              >
                {s.item.image && (
                  <img
                    className="grid-card__img"
                    src={s.item.image}
                    alt=""
                    draggable={false}
                    loading={s.eager ? 'eager' : 'lazy'}
                  />
                )}
                <span className="grid-card__index">{s.item.title}</span>
              </div>
            );
          })}
        </div>
        {overlayVisible && <CardOverlay item={focusedItem} />}
      </div>
    </div>
  );
}
