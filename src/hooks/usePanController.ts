import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  START_COL,
  START_ROW,
  cardHeight,
  cellSpanX,
  cellSpanY,
  config,
  dragDeadZonePx,
  subscribeConfig,
} from '../config';
import type { GridPos } from '../grid';
import { focusScaleForDistance, mod } from '../grid';
import { CONTENT_COUNT } from '../content';
import { releaseVelocity, settleTauSeconds } from '../motion';
import type { PointerSample } from '../motion';
import { useTicker } from './useTicker';

/** Once both axes are within this many cells of target, finish the snap. */
const SNAP_EPSILON = 0.0008;

/** "Settled" threshold for the tilt ease (its time constant is config.tiltLerpMs). */
const TILT_EPSILON = 0.0005;

/** Per-card facing rotation is considered at rest under this many degrees. */
const CARD_TILT_EPSILON = 0.01;

const RAD2DEG = 180 / Math.PI;
const clampDeg = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** Normalized cursor offset from viewport centre, each in [-1, 1]. */
interface Tilt {
  nx: number;
  ny: number;
}

/** A rendered card's facing wrapper + its eased rotation state. GridPlane fills
 *  in `dc/dr/el` per window; the ticker maintains `rx/ry` and writes the transform. */
export interface CardFace {
  dc: number;
  dr: number;
  el: HTMLElement;
  rx: number;
  ry: number;
}

/** Continuous position plus the integer window centre it rounds to. Bundled in
 *  one state object so the plane transform and the recycled content always
 *  commit together — no one-frame mismatch at a window shift. */
interface View {
  col: number;
  row: number;
  cc: number; // round(col) — window centre column (world cell)
  cr: number; // round(row) — window centre row (world cell)
}

export interface PanController {
  /** Continuous grid position (source of truth), refreshed each frame in motion. */
  position: GridPos;
  /** Integer window centre (the focused world cell); changes only on a shift. */
  world: GridPos;
  /** True while a pointer drag gesture is in progress. */
  isDragging: boolean;
  /** True when the focused card's hover overlay should be shown. */
  overlayVisible: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  /** Attach to the plane's tilt wrapper; the ticker writes its transform. */
  tiltRef: RefObject<HTMLDivElement | null>;
  /** Attach to the background layer; the ticker writes its parallax transform. */
  bgRef: RefObject<HTMLDivElement | null>;
  /** GridPlane fills this with the rendered card faces; the ticker rotates them. */
  cardsRef: RefObject<CardFace[]>;
  /** GridPlane calls this after (re)collecting faces so the ticker re-applies them. */
  markCardsChanged: () => void;
  /** Glide the grid to the world cell with this content index nearest the
   *  current position (shortest euclidean travel). Used by the mini-map. */
  navigateToContent: (contentIndex: number) => void;
  /** Glide the grid so a specific world cell is centred. */
  navigateToCell: (col: number, row: number) => void;
}

interface PanOptions {
  /** When this returns true (e.g. detail view open), arrow keys are ignored. */
  isSuspended?: () => boolean;
  /** A clean mouse click on a card: the tapped world cell + whether it's focused. */
  onTap?: (col: number, row: number, focused: boolean) => void;
}

/** Whether a viewport point is over the focused card (centred when settled). */
function isOverFocusedCard(x: number, y: number): boolean {
  return (
    Math.abs(x - window.innerWidth / 2) <= config.cardWidth / 2 &&
    Math.abs(y - window.innerHeight / 2) <= cardHeight() / 2
  );
}

const START: View = {
  col: START_COL,
  row: START_ROW,
  cc: Math.round(START_COL),
  cr: Math.round(START_ROW),
};

/**
 * Owns the continuous grid position and all of its motion. Drag and keyboard
 * input only record intent (into refs); the single rAF ticker reads that intent
 * and advances the position every frame — no CSS transitions, one loop.
 *
 * The grid is unbounded: drags, flicks, and arrows travel forever in any
 * direction with no clamping and no edge rubber-band.
 */
export function usePanController(options: PanOptions = {}): PanController {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const [view, setView] = useState<View>(START);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable, per-frame state. Kept in refs so the ticker reads live values
  // without re-subscribing and without forcing renders until the value moves.
  const posRef = useRef<GridPos>({ col: START.col, row: START.row });
  const viewRef = useRef<View>(START);
  const targetRef = useRef<GridPos>({ col: START.col, row: START.row });
  const settleTauRef = useRef(settleTauSeconds(1));

  const draggingRef = useRef(false);
  const draggedRef = useRef(false); // crossed the dead zone (a real drag, not a tap)
  const settlingRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const originRef = useRef({ pointer: { x: 0, y: 0 }, pos: { col: START.col, row: START.row } });
  const samplesRef = useRef<PointerSample[]>([]);

  // Tilt: applied imperatively to DOM refs in the ticker, so cursor-follow tilt
  // animates without React re-renders (even over a settled grid). targetTilt is
  // the cursor; curTilt eases toward it. Refs, not state, so the only thing
  // moving is the transform of two DOM nodes.
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const targetTiltRef = useRef<Tilt>({ nx: 0, ny: 0 });
  const curTiltRef = useRef<Tilt>({ nx: 0, ny: 0 });
  const tiltDirtyRef = useRef(false);
  const reducedMotionRef = useRef(false);

  // Per-card cursor-facing rotation. The raw cursor (viewport px) plus the card
  // faces GridPlane registers; the ticker eases each card toward facing the
  // cursor and writes its transform. Also driven during pan/glide so cards turn
  // as they pass under a stationary cursor.
  const cardsRef = useRef<CardFace[]>([]);
  const cursorRef = useRef({ x: 0, y: 0 });
  const cursorActiveRef = useRef(false);
  const cardFaceDirtyRef = useRef(false);

  // Hover overlay on the focused card. overCard tracks the mouse; touchToggle is
  // the tap state on touch. Visibility (settled + over/toggled) is computed in
  // the ticker so every transition — drag, glide, settle, hover — is caught.
  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayVisibleRef = useRef(false);
  const overCardRef = useRef(false);
  const touchToggleRef = useRef(false);

  // Push the live position into React state only when it actually changed (so a
  // held-still finger or a settled plane stops re-rendering). The integer
  // window centre rides along, but content only remaps when it crosses a cell.
  const sync = useCallback(() => {
    const p = posRef.current;
    const cc = Math.round(p.col);
    const cr = Math.round(p.row);
    const v = viewRef.current;
    if (p.col !== v.col || p.row !== v.row || cc !== v.cc || cr !== v.cr) {
      viewRef.current = { col: p.col, row: p.row, cc, cr };
      setView(viewRef.current);
    }
  }, []);

  // Begin (or retarget) an exponential glide to an integer cell. Both axes share
  // one settle (one tau), so a diagonal glide is one eased 2D motion that lands
  // on both axes together. The settle time scales with the euclidean distance.
  const startSettle = useCallback((col: number, row: number) => {
    targetRef.current = { col, row };
    const travel = Math.hypot(col - posRef.current.col, row - posRef.current.row);
    settleTauRef.current = settleTauSeconds(travel);
    settlingRef.current = true;
  }, []);

  // Zero each card's facing rotation, then mark dirty so the loop re-applies the
  // focus scale with a flat rotation next frame (the scale emphasis stays under
  // reduced motion; only the cursor-facing rotation is removed).
  const flattenCards = useCallback(() => {
    for (const c of cardsRef.current) {
      c.rx = 0;
      c.ry = 0;
    }
    cardFaceDirtyRef.current = true;
  }, []);

  // GridPlane calls this after (re)collecting the faces, so the ticker applies
  // the focus scale to the (possibly new) faces even on a settled grid.
  const markCardsChanged = useCallback(() => {
    cardFaceDirtyRef.current = true;
  }, []);

  // The per-card scale/rotation are written imperatively (read live config), so a
  // dial change while settled must re-run the loop once to take effect.
  useEffect(() => subscribeConfig(() => { cardFaceDirtyRef.current = true; }), []);

  useTicker((dt) => {
    if (draggingRef.current) {
      // Free 2D pan: follow the finger 1:1 on both axes at once (no axis lock),
      // less a small dead zone subtracted along the travel direction so a tap
      // doesn't micro-pan and motion starts cleanly from the dead-zone edge.
      const dx = pointerRef.current.x - originRef.current.pointer.x;
      const dy = pointerRef.current.y - originRef.current.pointer.y;
      const len = Math.hypot(dx, dy);
      if (len > dragDeadZonePx) {
        draggedRef.current = true;
        const scale = (len - dragDeadZonePx) / len;
        posRef.current.col = originRef.current.pos.col - (dx * scale) / cellSpanX();
        posRef.current.row = originRef.current.pos.row - (dy * scale) / cellSpanY();
      }
      cardFaceDirtyRef.current = true; // grid moves under the cursor
    } else if (settlingRef.current) {
      // One eased 2D motion: both axes lerp with the same k (same tau), so a
      // diagonal glide lands on both axes together.
      const k = 1 - Math.exp(-dt / settleTauRef.current);
      posRef.current.col += (targetRef.current.col - posRef.current.col) * k;
      posRef.current.row += (targetRef.current.row - posRef.current.row) * k;

      if (
        Math.abs(targetRef.current.col - posRef.current.col) < SNAP_EPSILON &&
        Math.abs(targetRef.current.row - posRef.current.row) < SNAP_EPSILON
      ) {
        posRef.current.col = targetRef.current.col;
        posRef.current.row = targetRef.current.row;
        settlingRef.current = false;
      }
      cardFaceDirtyRef.current = true; // grid moves under the cursor
    }

    sync();

    // Tilt + layered parallax — eased in this same loop, written straight to the
    // DOM. Only runs while the tilt is moving, so a still cursor does no work.
    if (tiltDirtyRef.current && !reducedMotionRef.current) {
      const cur = curTiltRef.current;
      const tgt = targetTiltRef.current;
      const k = 1 - Math.exp(-dt / (config.tiltLerpMs / 1000));
      cur.nx += (tgt.nx - cur.nx) * k;
      cur.ny += (tgt.ny - cur.ny) * k;
      if (Math.abs(tgt.nx - cur.nx) < TILT_EPSILON && Math.abs(tgt.ny - cur.ny) < TILT_EPSILON) {
        cur.nx = tgt.nx;
        cur.ny = tgt.ny;
        tiltDirtyRef.current = false;
      }

      // Final plane transform: a parallax shift (opposite the cursor) then the
      // tilt rotation. The pan offset lives on the inner grid (pre-rotation
      // space), so pan and tilt compose without fighting.
      const rotY = cur.nx * config.maxTiltDeg;
      const rotX = -cur.ny * config.maxTiltDeg;
      const shiftX = -config.parallaxShiftPx * cur.nx;
      const shiftY = -config.parallaxShiftPx * cur.ny;
      if (tiltRef.current) {
        tiltRef.current.style.transform =
          `translate3d(${shiftX}px, ${shiftY}px, 0) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        // Expose the shift to the overlay so its layers can parallax further.
        tiltRef.current.style.setProperty('--tsx', `${shiftX}px`);
        tiltRef.current.style.setProperty('--tsy', `${shiftY}px`);
      }
      if (bgRef.current) {
        bgRef.current.style.transform =
          `translate3d(${config.backgroundParallaxFactor * shiftX}px, ${config.backgroundParallaxFactor * shiftY}px, 0)`;
      }
    }

    // Per-card transforms: focus scale (focused card grows, easing to 1.0 by one
    // cell — a continuous function of distance, like the brightness) composed
    // with the cursor-facing rotation (each card turns to face a cursor floating
    // `cursorDepthPx` in front: under-cursor ≈ flat, farther cards turn more).
    // Both written to the face wrapper as `scale() rotateX() rotateY()`. Runs
    // while the cursor or the grid moves. Rotation is disabled (forced flat) for
    // touch / reduced motion / pointer-left; the scale stays.
    if (cardFaceDirtyRef.current) {
      const cards = cardsRef.current;
      const rotate = cursorActiveRef.current && !reducedMotionRef.current;
      const fcol = posRef.current.col - viewRef.current.cc;
      const frow = posRef.current.row - viewRef.current.cr;
      const spanX = cellSpanX();
      const spanY = cellSpanY();
      const hw = window.innerWidth / 2;
      const hh = window.innerHeight / 2;
      const px = cursorRef.current.x;
      const py = cursorRef.current.y;
      const depth = config.cursorDepthPx;
      const strength = config.cardFaceStrength;
      const maxDeg = config.maxCardTiltDeg;
      const kc = 1 - Math.exp(-dt / (config.cardTiltLerpMs / 1000));
      let maxDelta = 0;

      for (const c of cards) {
        const dist = Math.max(Math.abs(c.dc - fcol), Math.abs(c.dr - frow));
        const scale = focusScaleForDistance(dist);
        let targetY = 0;
        let targetX = 0;
        if (rotate) {
          const cx = hw + (c.dc - fcol) * spanX;
          const cy = hh + (c.dr - frow) * spanY;
          targetY = clampDeg(Math.atan2(px - cx, depth) * RAD2DEG * strength, maxDeg);
          targetX = clampDeg(-Math.atan2(py - cy, depth) * RAD2DEG * strength, maxDeg);
        }
        maxDelta = Math.max(maxDelta, Math.abs(targetY - c.ry), Math.abs(targetX - c.rx));
        // Per-frame eased rotation state, advanced imperatively in the rAF loop
        // (not during render) — mutating the ticker-owned card is intentional.
        /* eslint-disable react-hooks/immutability */
        c.ry += (targetY - c.ry) * kc;
        c.rx += (targetX - c.rx) * kc;
        /* eslint-enable react-hooks/immutability */
        if (c.el) {
          c.el.style.transform = `scale(${scale}) rotateX(${c.rx}deg) rotateY(${c.ry}deg)`;
        }
      }

      // Stop once the rotation has reached rest and nothing is moving the grid
      // (the scale is static while settled, so the last write holds it).
      if (maxDelta < CARD_TILT_EPSILON && !draggingRef.current && !settlingRef.current) {
        cardFaceDirtyRef.current = false;
      }
    }

    // Overlay shows only on the focused card, only when the grid is settled
    // (not dragging, not gliding), while the mouse is over it or it has been
    // tapped (touch). Computed here so every transition is caught on the frame
    // it happens; setState fires only on an actual change.
    const settled = !draggingRef.current && !settlingRef.current;
    const wantOverlay = settled && (overCardRef.current || touchToggleRef.current);
    if (wantOverlay !== overlayVisibleRef.current) {
      overlayVisibleRef.current = wantOverlay;
      setOverlayVisible(wantOverlay);
    }
  });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nice-to-have; some environments reject it harmlessly.
    }
    // A new grab interrupts any in-flight glide and continues from exactly
    // where the plane is now — no jump, the old animation does not complete.
    draggingRef.current = true;
    draggedRef.current = false;
    settlingRef.current = false;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    originRef.current = {
      pointer: { x: e.clientX, y: e.clientY },
      pos: { col: posRef.current.col, row: posRef.current.row },
    };
    samplesRef.current = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    // The overlay vanishes the instant a drag begins (don't wait for the ticker).
    if (overlayVisibleRef.current) {
      overlayVisibleRef.current = false;
      setOverlayVisible(false);
    }
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    // The ticker owns the math; the move records the pointer plus a timestamped
    // sample for velocity, pruning anything older than the window.
    const x = e.clientX;
    const y = e.clientY;
    pointerRef.current = { x, y };
    const samples = samplesRef.current;
    samples.push({ t: e.timeStamp, x, y });
    const cutoff = e.timeStamp - config.velocityWindowMs;
    while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const dragged = draggedRef.current;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      // Default: snap both axes to the nearest cell. A fast release upgrades that
      // to a 2D momentum glide projected from the release velocity vector.
      let targetCol = Math.round(posRef.current.col);
      let targetRow = Math.round(posRef.current.row);
      if (dragged) {
        samplesRef.current.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        const vCol = releaseVelocity(samplesRef.current, e.timeStamp, 'x', cellSpanX());
        const vRow = releaseVelocity(samplesRef.current, e.timeStamp, 'y', cellSpanY());
        if (Math.hypot(vCol, vRow) >= config.flickThreshold) {
          let offCol = vCol * config.momentumFactor;
          let offRow = vRow * config.momentumFactor;
          // Cap total travel to maxFlickCells by scaling the vector (keep direction).
          const offLen = Math.hypot(offCol, offRow);
          if (offLen > config.maxFlickCells) {
            const s = config.maxFlickCells / offLen;
            offCol *= s;
            offRow *= s;
          }
          targetCol = Math.round(posRef.current.col + offCol);
          targetRow = Math.round(posRef.current.row + offRow);
          // Guarantee at least one cell of travel along the dominant axis.
          if (Math.abs(vCol) >= Math.abs(vRow)) {
            if (targetCol === Math.round(posRef.current.col)) {
              targetCol += vCol >= 0 ? 1 : -1;
            }
          } else if (targetRow === Math.round(posRef.current.row)) {
            targetRow += vRow >= 0 ? 1 : -1;
          }
        }
      }
      samplesRef.current = [];

      // Touch: a press that never crossed the dead zone is a tap, not a drag. A
      // tap on the focused card toggles its overlay; a tap elsewhere (or any
      // drag) clears it. (Mouse uses hover — overCardRef — instead.)
      if (e.pointerType === 'touch') {
        touchToggleRef.current =
          !dragged && isOverFocusedCard(e.clientX, e.clientY)
            ? !touchToggleRef.current
            : false;
      }

      // Mouse click (no drag): report which cell was tapped so the app can open
      // the detail view (focused card) or navigate the grid to it (others).
      if (e.pointerType !== 'touch' && !dragged && !optionsRef.current.isSuspended?.()) {
        const offCol = Math.round((e.clientX - window.innerWidth / 2) / cellSpanX());
        const offRow = Math.round((e.clientY - window.innerHeight / 2) / cellSpanY());
        const col = Math.round(posRef.current.col) + offCol;
        const row = Math.round(posRef.current.row) + offRow;
        optionsRef.current.onTap?.(col, row, offCol === 0 && offRow === 0);
      }

      startSettle(targetCol, targetRow);
      setIsDragging(false);
    },
    [startSettle],
  );

  // Glide to the world cell holding a given content index with the least
  // euclidean travel from the current position. Cells with this index lie on a
  // lattice (row*stride + col ≡ idx mod N); for each nearby row the matching col
  // is col ≡ idx - row*stride (mod N), and we take the nearest copy to the
  // current col, then pick the closest row.
  const navigateToContent = useCallback(
    (contentIndex: number) => {
      const N = CONTENT_COUNT;
      const stride = config.wrapStride;
      const pCol = posRef.current.col;
      const pRow = posRef.current.row;
      const r0 = Math.round(pRow);
      let best: GridPos | null = null;
      let bestDist = Infinity;
      for (let row = r0 - N; row <= r0 + N; row++) {
        const base = mod(contentIndex - row * stride, N);
        const col = base + Math.round((pCol - base) / N) * N;
        const d = Math.hypot(col - pCol, row - pRow);
        if (d < bestDist) {
          bestDist = d;
          best = { col, row };
        }
      }
      if (best) startSettle(best.col, best.row);
    },
    [startSettle],
  );

  const navigateToCell = useCallback((col: number, row: number) => startSettle(col, row), [startSettle]);

  // Keyboard: one cell per arrow press. Ignored mid-drag, but a press during a
  // glide retargets from the in-flight target (lands one cell past it). No clamp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draggingRef.current || optionsRef.current.isSuspended?.()) return;
      let dCol = 0;
      let dRow = 0;
      switch (e.key) {
        case 'ArrowLeft':
          dCol = -1;
          break;
        case 'ArrowRight':
          dCol = 1;
          break;
        case 'ArrowUp':
          dRow = -1;
          break;
        case 'ArrowDown':
          dRow = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const base = settlingRef.current
        ? targetRef.current
        : { col: Math.round(posRef.current.col), row: Math.round(posRef.current.row) };
      startSettle(base.col + dCol, base.row + dRow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startSettle]);

  // Cursor tracking: the global plane tilt and the per-card facing rotation both
  // follow the pointer over the whole viewport (independent of dragging),
  // ignoring touch (no hover) and honouring reduced-motion.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const flatten = () => {
      curTiltRef.current = { nx: 0, ny: 0 };
      targetTiltRef.current = { nx: 0, ny: 0 };
      tiltDirtyRef.current = false;
      if (tiltRef.current) tiltRef.current.style.transform = '';
      if (bgRef.current) bgRef.current.style.transform = '';
      flattenCards();
    };
    const syncMq = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches) flatten();
    };
    syncMq();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Hover detection drives the overlay even under reduced motion.
      overCardRef.current = isOverFocusedCard(e.clientX, e.clientY);
      cursorRef.current = { x: e.clientX, y: e.clientY };
      cursorActiveRef.current = true;
      if (reducedMotionRef.current) return;
      targetTiltRef.current = {
        nx: (e.clientX / window.innerWidth) * 2 - 1,
        ny: (e.clientY / window.innerHeight) * 2 - 1,
      };
      tiltDirtyRef.current = true;
      cardFaceDirtyRef.current = true;
    };
    const onLeave = () => {
      overCardRef.current = false;
      cursorActiveRef.current = false;
      cardFaceDirtyRef.current = true; // ease all cards back to flat
      if (reducedMotionRef.current) return;
      targetTiltRef.current = { nx: 0, ny: 0 };
      tiltDirtyRef.current = true;
    };

    mq.addEventListener('change', syncMq);
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      mq.removeEventListener('change', syncMq);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [flattenCards]);

  return {
    position: { col: view.col, row: view.row },
    world: { col: view.cc, row: view.cr },
    isDragging,
    overlayVisible,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    tiltRef,
    bgRef,
    cardsRef,
    markCardsChanged,
    navigateToContent,
    navigateToCell,
  };
}
