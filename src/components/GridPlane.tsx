import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react';
import { CARD_ASPECT_H, CARD_ASPECT_W, PERSPECTIVE, useConfig } from '../config';
import { brightnessForDistance } from '../grid';
import type { GridPos } from '../grid';
import { CONTENT, contentIndex } from '../content';
import type { PosterItem } from '../content';
import type { CardFace, CellOffset } from '../hooks/usePanController';
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
  /** Collected card-face wrappers — the controller rotates them per cursor. */
  cardsRef: RefObject<CardFace[]>;
  /** Notify the controller after (re)collecting faces so it re-applies them. */
  markCardsChanged: () => void;
  /** The window cell currently showing its hover overlay (null = none). */
  overlayCell: CellOffset | null;
  /** Open a window cell's detail (overlay CTA) — glide to centre, then FLIP. */
  onRequestOpen: (dc: number, dr: number) => void;
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
  cardsRef,
  markCardsChanged,
  overlayCell,
  onRequestOpen,
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

  // Collect the per-card transform wrappers for the controller's imperative
  // scale/rotation/opacity. They are stable across window shifts (keyed by
  // offset), so we re-collect only when the window size (ring) changes — e.g. a
  // resize or card-size dial. `op: -1` flags the opacity as uninitialised so the
  // ticker snaps it to the correct value on the first frame (no fade-in).
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const faces = grid.querySelectorAll<HTMLElement>('.grid-card__transform');
    cardsRef.current = Array.from(faces, (el) => {
      el.style.transform = ''; // start flat; the ticker re-faces on next frame
      return { dc: Number(el.dataset.dc), dr: Number(el.dataset.dr), el, rx: 0, ry: 0, op: -1 };
    });
    markCardsChanged(); // apply the focus scale/opacity even on a settled grid
  }, [ring, cardsRef, markCardsChanged]);

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
          ref={gridRef}
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
            const isOverlay = !!overlayCell && overlayCell.dc === s.dc && overlayCell.dr === s.dr;
            // The hovered card dims slightly so its white overlay type reads.
            const brightness = brightnessForDistance(distance) * (isOverlay ? cfg.overlayCardDim : 1);
            return (
              // Outer cell: layout slot + per-card perspective. The transform
              // wrapper carries the imperatively-written scale/rotation/opacity
              // (so they don't fight layout); the inner face carries the
              // hue/image + brightness; the overlay (when hovered) is a sibling of
              // the face inside the wrapper, so it inherits the card's transform
              // but NOT its brightness filter.
              <div
                key={`${s.dc}|${s.dr}`}
                className="grid-card"
                // The focused card overlaps neighbours; the hovered card sits on top of all.
                style={{ width: `${cardW}px`, height: `${cardH}px`, zIndex: isOverlay ? 3 : isFocused ? 2 : 1 }}
              >
                <div className="grid-card__transform" data-dc={s.dc} data-dr={s.dr}>
                  <div
                    className="grid-card__face"
                    style={{
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
                  {isOverlay && <CardOverlay item={s.item} onOpen={() => onRequestOpen(s.dc, s.dr)} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
