import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  GAP,
  axisLockThresholdPx,
  backgroundParallaxFactor,
  maxTiltDeg,
  parallaxShiftPx,
  tiltLerpMs,
  velocityWindowMs,
} from '../config';
import { CENTER_COL, CENTER_ROW } from '../grid';
import type { GridPos } from '../grid';
import { contentIndex } from '../content';
import { flickTarget, releaseVelocity, settleTauSeconds } from '../motion';
import type { PointerSample } from '../motion';
import { useTicker } from './useTicker';

/** Pixels spanned by one cell step, including the gap, on each axis. */
const CELL_SPAN_X = CARD_WIDTH + GAP;
const CELL_SPAN_Y = CARD_HEIGHT + GAP;

/** Once both axes are within this many cells of target, finish the snap. */
const SNAP_EPSILON = 0.0008;

/** Tilt ease time constant (seconds) and the "settled" threshold. */
const TILT_TAU = tiltLerpMs / 1000;
const TILT_EPSILON = 0.0005;

type Axis = 'x' | 'y';

/** Normalized cursor offset from viewport centre, each in [-1, 1]. */
interface Tilt {
  nx: number;
  ny: number;
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
  /** Content index of the focused card ("14 / 25"), wrapped onto the list. */
  focused: number;
  /** True while a pointer drag gesture is in progress. */
  isDragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  /** Attach to the plane's tilt wrapper; the ticker writes its transform. */
  tiltRef: RefObject<HTMLDivElement | null>;
  /** Attach to the background layer; the ticker writes its parallax transform. */
  bgRef: RefObject<HTMLDivElement | null>;
}

/**
 * Remove the axis-lock dead-zone from a raw pointer delta: the first
 * `axisLockThresholdPx` of travel engages the gesture and produces no motion,
 * so the plane starts moving cleanly from the lock point without a jump. Only a
 * constant is subtracted, so a fast flick keeps the rest of its delta.
 */
function deadZoned(delta: number): number {
  if (delta > axisLockThresholdPx) return delta - axisLockThresholdPx;
  if (delta < -axisLockThresholdPx) return delta + axisLockThresholdPx;
  return 0;
}

const START: View = {
  col: CENTER_COL,
  row: CENTER_ROW,
  cc: Math.round(CENTER_COL),
  cr: Math.round(CENTER_ROW),
};

/**
 * Owns the continuous grid position and all of its motion. Drag and keyboard
 * input only record intent (into refs); the single rAF ticker reads that intent
 * and advances the position every frame — no CSS transitions, one loop.
 *
 * The grid is unbounded: drags, flicks, and arrows travel forever in any
 * direction with no clamping and no edge rubber-band.
 */
export function usePanController(): PanController {
  const [view, setView] = useState<View>(START);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable, per-frame state. Kept in refs so the ticker reads live values
  // without re-subscribing and without forcing renders until the value moves.
  const posRef = useRef<GridPos>({ col: START.col, row: START.row });
  const viewRef = useRef<View>(START);
  const targetRef = useRef<GridPos>({ col: START.col, row: START.row });
  const settleTauRef = useRef(settleTauSeconds(1));

  const draggingRef = useRef(false);
  const settlingRef = useRef(false);
  const axisRef = useRef<Axis | null>(null);
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

  // Begin (or retarget) an exponential glide to an integer cell. The settle
  // time scales with how far this glide travels from the current position.
  const startSettle = useCallback((col: number, row: number) => {
    targetRef.current = { col, row };
    const travel = Math.max(
      Math.abs(col - posRef.current.col),
      Math.abs(row - posRef.current.row),
    );
    settleTauRef.current = settleTauSeconds(travel);
    settlingRef.current = true;
  }, []);

  useTicker((dt) => {
    if (draggingRef.current) {
      // Lock the dominant axis once total travel passes the threshold.
      if (!axisRef.current) {
        const dx = pointerRef.current.x - originRef.current.pointer.x;
        const dy = pointerRef.current.y - originRef.current.pointer.y;
        if (Math.hypot(dx, dy) >= axisLockThresholdPx) {
          axisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
      }

      // Follow the finger 1:1 on the locked axis, less the lock dead-zone
      // (content-follows-finger: dragging left/up reveals cards to the
      // right/below). No bounds — the plane travels freely.
      if (axisRef.current === 'x') {
        const dx = pointerRef.current.x - originRef.current.pointer.x;
        posRef.current.col = originRef.current.pos.col - deadZoned(dx) / CELL_SPAN_X;
      } else if (axisRef.current === 'y') {
        const dy = pointerRef.current.y - originRef.current.pointer.y;
        posRef.current.row = originRef.current.pos.row - deadZoned(dy) / CELL_SPAN_Y;
      }
    } else if (settlingRef.current) {
      // Frame-rate-independent exponential ease-out toward the target.
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
    }

    sync();

    // Tilt + layered parallax — eased in this same loop, written straight to the
    // DOM. Only runs while the tilt is moving, so a still cursor does no work.
    if (tiltDirtyRef.current && !reducedMotionRef.current) {
      const cur = curTiltRef.current;
      const tgt = targetTiltRef.current;
      const k = 1 - Math.exp(-dt / TILT_TAU);
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
      const rotY = cur.nx * maxTiltDeg;
      const rotX = -cur.ny * maxTiltDeg;
      const shiftX = -parallaxShiftPx * cur.nx;
      const shiftY = -parallaxShiftPx * cur.ny;
      if (tiltRef.current) {
        tiltRef.current.style.transform =
          `translate3d(${shiftX}px, ${shiftY}px, 0) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      }
      if (bgRef.current) {
        bgRef.current.style.transform =
          `translate3d(${backgroundParallaxFactor * shiftX}px, ${backgroundParallaxFactor * shiftY}px, 0)`;
      }
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
    settlingRef.current = false;
    axisRef.current = null;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    originRef.current = {
      pointer: { x: e.clientX, y: e.clientY },
      pos: { col: posRef.current.col, row: posRef.current.row },
    };
    samplesRef.current = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
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
    const cutoff = e.timeStamp - velocityWindowMs;
    while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const axis = axisRef.current;
      axisRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      // Default: snap both axes to the nearest cell. On the locked axis,
      // flickTarget upgrades that to a momentum glide when the release is fast.
      let targetCol = Math.round(posRef.current.col);
      let targetRow = Math.round(posRef.current.row);
      if (axis) {
        samplesRef.current.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        const cellSpan = axis === 'x' ? CELL_SPAN_X : CELL_SPAN_Y;
        const velocity = releaseVelocity(samplesRef.current, e.timeStamp, axis, cellSpan);
        const axisPos = axis === 'x' ? posRef.current.col : posRef.current.row;
        const landed = flickTarget(axisPos, velocity);
        if (axis === 'x') targetCol = landed;
        else targetRow = landed;
      }
      samplesRef.current = [];

      startSettle(targetCol, targetRow);
      setIsDragging(false);
    },
    [startSettle],
  );

  // Keyboard: one cell per arrow press. Ignored mid-drag, but a press during a
  // glide retargets from the in-flight target (lands one cell past it). No clamp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draggingRef.current) return;
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

  // Cursor-follow tilt: track the pointer over the whole viewport (independent
  // of dragging), ignoring touch (no hover) and honouring reduced-motion.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const flatten = () => {
      curTiltRef.current = { nx: 0, ny: 0 };
      targetTiltRef.current = { nx: 0, ny: 0 };
      tiltDirtyRef.current = false;
      if (tiltRef.current) tiltRef.current.style.transform = '';
      if (bgRef.current) bgRef.current.style.transform = '';
    };
    const syncMq = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches) flatten();
    };
    syncMq();

    const onMove = (e: PointerEvent) => {
      if (reducedMotionRef.current || e.pointerType === 'touch') return;
      targetTiltRef.current = {
        nx: (e.clientX / window.innerWidth) * 2 - 1,
        ny: (e.clientY / window.innerHeight) * 2 - 1,
      };
      tiltDirtyRef.current = true;
    };
    const onLeave = () => {
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
  }, []);

  return {
    position: { col: view.col, row: view.row },
    world: { col: view.cc, row: view.cr },
    focused: contentIndex(view.cc, view.cr),
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    tiltRef,
    bgRef,
  };
}
