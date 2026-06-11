import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  GAP,
  axisLockThresholdPx,
  rubberBandFactor,
  snapMs,
} from '../config';
import {
  CENTER_COL,
  CENTER_ROW,
  GRID_MAX,
  clampCell,
  focusedIndex,
} from '../grid';
import type { GridPos } from '../grid';
import { useTicker } from './useTicker';

/** Pixels spanned by one cell step, including the gap, on each axis. */
const CELL_SPAN_X = CARD_WIDTH + GAP;
const CELL_SPAN_Y = CARD_HEIGHT + GAP;

/**
 * A release-snap eases exponentially toward its target. We treat ~99% of the
 * distance as "settled", so the time constant is snapMs / ln(100).
 */
const SETTLE_DECAY = Math.log(100);

/** Once both axes are within this many cells of target, finish the snap. */
const SNAP_EPSILON = 0.0008;

type Axis = 'x' | 'y';

export interface PanController {
  /** Continuous grid position (source of truth), refreshed each frame in motion. */
  position: GridPos;
  /** Flat index of the focused (centre-nearest) card. */
  focused: number;
  /** True while a pointer drag gesture is in progress. */
  isDragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}

/** Like clamp, but movement past the bounds is damped instead of cut off. */
function rubberClamp(value: number, factor: number): number {
  if (value < 0) return 0 - (0 - value) * factor;
  if (value > GRID_MAX) return GRID_MAX + (value - GRID_MAX) * factor;
  return value;
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

const START: GridPos = { col: CENTER_COL, row: CENTER_ROW };

/**
 * Owns the continuous grid position and all of its motion. Drag and keyboard
 * input only record intent (into refs); the single rAF ticker reads that intent
 * and advances the position every frame — no CSS transitions, one loop.
 */
export function usePanController(): PanController {
  const [position, setPosition] = useState<GridPos>(START);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable, per-frame state. Kept in refs so the ticker reads live values
  // without re-subscribing and without forcing renders until the value moves.
  const posRef = useRef<GridPos>({ ...START });
  const syncedRef = useRef<GridPos>({ ...START });
  const targetRef = useRef<GridPos>({ ...START });

  const draggingRef = useRef(false);
  const settlingRef = useRef(false);
  const axisRef = useRef<Axis | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const originRef = useRef({ pointer: { x: 0, y: 0 }, pos: { ...START } });

  // Push the live position into React state only when it actually changed,
  // so a held-still finger or a settled plane stops re-rendering.
  const sync = useCallback(() => {
    const p = posRef.current;
    if (p.col !== syncedRef.current.col || p.row !== syncedRef.current.row) {
      syncedRef.current = { col: p.col, row: p.row };
      setPosition(syncedRef.current);
    }
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
      // right/below). Past the edge, the rubber band resists.
      if (axisRef.current === 'x') {
        const dx = pointerRef.current.x - originRef.current.pointer.x;
        posRef.current.col = rubberClamp(
          originRef.current.pos.col - deadZoned(dx) / CELL_SPAN_X,
          rubberBandFactor,
        );
      } else if (axisRef.current === 'y') {
        const dy = pointerRef.current.y - originRef.current.pointer.y;
        posRef.current.row = rubberClamp(
          originRef.current.pos.row - deadZoned(dy) / CELL_SPAN_Y,
          rubberBandFactor,
        );
      }
    } else if (settlingRef.current) {
      // Frame-rate-independent exponential ease-out toward the snap target.
      const tau = snapMs / 1000 / SETTLE_DECAY;
      const k = 1 - Math.exp(-dt / tau);
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
  });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nice-to-have; some environments reject it harmlessly.
    }
    draggingRef.current = true;
    settlingRef.current = false; // a new grab interrupts any in-flight snap
    axisRef.current = null;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    originRef.current = {
      pointer: { x: e.clientX, y: e.clientY },
      pos: { col: posRef.current.col, row: posRef.current.row },
    };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    // The ticker owns the math; the move only records the latest pointer.
    pointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    axisRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Snap to the nearest integer cell on both axes, clamped to bounds.
    targetRef.current = {
      col: clampCell(Math.round(posRef.current.col)),
      row: clampCell(Math.round(posRef.current.row)),
    };
    settlingRef.current = true;
    setIsDragging(false);
  }, []);

  // Keyboard: one cell per arrow press, same snap + clamping. Ignored mid-drag.
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
      // Step from the in-flight target if still settling, else from the
      // current rounded cell — so rapid presses chain cleanly.
      const base = settlingRef.current
        ? targetRef.current
        : { col: Math.round(posRef.current.col), row: Math.round(posRef.current.row) };
      targetRef.current = {
        col: clampCell(base.col + dCol),
        row: clampCell(base.row + dRow),
      };
      settlingRef.current = true;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    position,
    focused: focusedIndex(position),
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
