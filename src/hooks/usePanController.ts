import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  GAP,
  axisLockThresholdPx,
  rubberBandFactor,
  velocityWindowMs,
} from '../config';
import {
  CENTER_COL,
  CENTER_ROW,
  GRID_MAX,
  clampCell,
  focusedIndex,
} from '../grid';
import type { GridPos } from '../grid';
import { flickTarget, releaseVelocity, settleTauSeconds } from '../motion';
import type { PointerSample } from '../motion';
import { useTicker } from './useTicker';

/** Pixels spanned by one cell step, including the gap, on each axis. */
const CELL_SPAN_X = CARD_WIDTH + GAP;
const CELL_SPAN_Y = CARD_HEIGHT + GAP;

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
 *
 * Phase 3 adds momentum: a rolling window of pointer samples gives a release
 * velocity, and pointerup either snaps (slow) or projects a multi-cell glide
 * (fast). Everything still settles through the same exponential ease-out.
 */
export function usePanController(): PanController {
  const [position, setPosition] = useState<GridPos>(START);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable, per-frame state. Kept in refs so the ticker reads live values
  // without re-subscribing and without forcing renders until the value moves.
  const posRef = useRef<GridPos>({ ...START });
  const syncedRef = useRef<GridPos>({ ...START });
  const targetRef = useRef<GridPos>({ ...START });
  const settleTauRef = useRef(settleTauSeconds(1));

  const draggingRef = useRef(false);
  const settlingRef = useRef(false);
  const axisRef = useRef<Axis | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const originRef = useRef({ pointer: { x: 0, y: 0 }, pos: { ...START } });
  const samplesRef = useRef<PointerSample[]>([]);

  // Push the live position into React state only when it actually changed,
  // so a held-still finger or a settled plane stops re-rendering.
  const sync = useCallback(() => {
    const p = posRef.current;
    if (p.col !== syncedRef.current.col || p.row !== syncedRef.current.row) {
      syncedRef.current = { col: p.col, row: p.row };
      setPosition(syncedRef.current);
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
      let targetCol = clampCell(Math.round(posRef.current.col));
      let targetRow = clampCell(Math.round(posRef.current.row));
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

  // Keyboard: one cell per arrow press, same snap + clamping. Ignored mid-drag,
  // but a press during a glide retargets from the in-flight target (so it lands
  // one cell past where the flick was heading).
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
      startSettle(clampCell(base.col + dCol), clampCell(base.row + dRow));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startSettle]);

  return {
    position,
    focused: focusedIndex(position),
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
