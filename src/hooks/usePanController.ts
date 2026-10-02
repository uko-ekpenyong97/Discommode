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
import { focusOpacityForDistance, focusScaleForDistance, mod } from '../grid';
import { CONTENT_COUNT } from '../content';
import { releaseVelocity, settleTauSeconds } from '../motion';
import type { PointerSample } from '../motion';
import type { FlipOrigin } from './useDetail';
import { useTicker } from './useTicker';
import { rectEdges, skyWake } from '../sky/skyStage';
import { registerBusy } from '../activity';

/** Once both axes are within this many cells of target, finish the snap. */
const SNAP_EPSILON = 0.0008;

/** Time constants to reach SNAP_EPSILON — so the click-centre cap bounds the
 *  real (wall-clock) settle, not a looser 1% one. */
const SNAP_DECAY = Math.log(1 / SNAP_EPSILON);

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

/** A rendered card's transform wrapper + its eased state. GridPlane fills in
 *  `dc/dr/el/fade` per window; the ticker maintains `rx/ry/op` and writes the
 *  transform + opacity. `op` starts < 0 (uninitialised) so it snaps on first use. */
export interface CardFace {
  dc: number;
  dr: number;
  /** `.grid-card__transform` — takes the scale + cursor-facing rotation. */
  el: HTMLElement;
  /**
   * `.grid-card__fade` — its parent, and where the opacity goes.
   *
   * The two are deliberately separate elements: `opacity < 1` forces
   * `transform-style` to compute as `flat`, which would silently collapse the
   * `translateZ` on the hover overlay plate inside `el`. Keeping the fade one
   * level up leaves `el` free to `preserve-3d` while the whole card still fades
   * as a single group.
   */
  fade: HTMLElement;
  rx: number;
  ry: number;
  op: number;
}

/** A window-relative cell offset from the centre slot. */
export interface CellOffset {
  dc: number;
  dr: number;
}

/**
 * The hovered cell, as a tiny external store rather than React state: a hover
 * re-renders the two cards whose overlay changes (GridPlane's `GridCard`
 * subscribes), not App and the whole grid.
 */
export interface OverlayStore {
  get: () => CellOffset | null;
  subscribe: (fn: () => void) => () => void;
}

function createOverlayStore(): OverlayStore & { set: (c: CellOffset | null) => void } {
  let cur: CellOffset | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => cur,
    set: (c) => {
      cur = c;
      for (const fn of listeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** A hit-tested card: its window offset, on-screen centre, and scaled size. */
interface CardHit extends CellOffset {
  cx: number;
  cy: number;
  w: number;
  h: number;
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
  /** The window cell currently showing its hover overlay (settled + hovered),
   *  or null — a store, so a hover never re-renders the controller's owner. */
  overlay: OverlayStore;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  /** Attach to the plane's tilt wrapper; the ticker writes its transform. */
  tiltRef: RefObject<HTMLDivElement | null>;
  /** GridPlane fills this with the rendered card faces; the ticker rotates them. */
  cardsRef: RefObject<CardFace[]>;
  /** GridPlane calls this after (re)collecting faces so the ticker re-applies them. */
  markCardsChanged: () => void;
  /** Glide the grid to the world cell with this content index nearest the
   *  current position (shortest euclidean travel). Used by the mini-map. */
  navigateToContent: (contentIndex: number) => void;
  /** Centre a content index instantly (no glide) + flatten the hero cards (detail exit). */
  centerContentInstant: (contentIndex: number) => void;
  /** Open the detail view for a window cell: glide it to centre (if needed), then FLIP. */
  requestCardOpen: (dc: number, dr: number) => void;
}

interface PanOptions {
  /** When this returns true (e.g. detail view open), arrow keys are ignored. */
  isSuspended?: () => boolean;
  /** A clean tap on a card: its world cell + the card's on-screen rect (FLIP origin). */
  onTap?: (col: number, row: number, origin: FlipOrigin) => void;
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
  // Phase 14: a card tap glides the card to centre, THEN opens detail. While a
  // glide-to-open is pending, input is locked and the ticker fires the open the
  // instant the glide settles.
  const pendingOpenRef = useRef<GridPos | null>(null);
  // A drag and its settle are motion a person is watching: the idle warm-up
  // (src/warmup.ts) waits them out rather than land a paper step in them.
  useEffect(() => registerBusy(() => draggingRef.current || settlingRef.current), []);
  const pointerRef = useRef({ x: 0, y: 0 });
  const originRef = useRef({ pointer: { x: 0, y: 0 }, pos: { col: START.col, row: START.row } });
  const samplesRef = useRef<PointerSample[]>([]);

  // Tilt: applied imperatively to DOM refs in the ticker, so cursor-follow tilt
  // animates without React re-renders (even over a settled grid). targetTilt is
  // the cursor; curTilt eases toward it. Refs, not state, so the only thing
  // moving is the transform of two DOM nodes.
  const tiltRef = useRef<HTMLDivElement | null>(null);
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

  // Hover overlay on ANY card: the card under the cursor, shown only when the
  // grid is settled. The hovered cell is hit-tested each frame from the cursor +
  // live position (so it tracks the grid sliding under a still cursor); the
  // visible cell is published to the cards' store when it changes.
  const [overlay] = useState(createOverlayStore);
  const setOverlayCell = overlay.set;
  const overlayCellRef = useRef<CellOffset | null>(null);
  const hoverCellRef = useRef<CardHit | null>(null);

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
  const startSettle = useCallback((col: number, row: number, maxMs?: number) => {
    targetRef.current = { col, row };
    const travel = Math.hypot(col - posRef.current.col, row - posRef.current.row);
    let tau = settleTauSeconds(travel);
    // Cap the settle so a far click-to-centre glide stays snappy (≈ maxMs total).
    if (maxMs) tau = Math.min(tau, maxMs / 1000 / SNAP_DECAY);
    settleTauRef.current = tau;
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

  // Hit-test a viewport point to the card under it (or null if it lands in a
  // gap). Returns the card's window offset, on-screen centre, and scaled size —
  // used both for the hover overlay and for a tap's FLIP origin. Layout-based
  // (ignores the small per-card facing tilt), which is plenty for both uses.
  const cardHitAt = useCallback((px: number, py: number): CardHit | null => {
    const spanX = cellSpanX();
    const spanY = cellSpanY();
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const fcol = posRef.current.col - viewRef.current.cc;
    const frow = posRef.current.row - viewRef.current.cr;
    const dc = Math.round(fcol + (px - hw) / spanX);
    const dr = Math.round(frow + (py - hh) / spanY);
    const cx = hw + (dc - fcol) * spanX;
    const cy = hh + (dr - frow) * spanY;
    const dist = Math.max(Math.abs(dc - fcol), Math.abs(dr - frow));
    const scale = focusScaleForDistance(dist);
    const w = config.cardWidth * scale;
    const h = cardHeight() * scale;
    if (Math.abs(px - cx) <= w / 2 && Math.abs(py - cy) <= h / 2) {
      return { dc, dr, cx, cy, w, h };
    }
    return null;
  }, []);

  // The FLIP origin for the centred (focused) card — where a card lands after the
  // click-to-centre glide, so the detail expands from the viewport centre.
  const centeredCardOrigin = useCallback(
    (): FlipOrigin => ({
      cx: window.innerWidth / 2,
      cy: window.innerHeight / 2,
      w: config.cardWidth * config.focusScale,
      h: cardHeight() * config.focusScale,
    }),
    [],
  );

  // Flatten the three "hero" cards (centred card + immediate L/R neighbours) to a
  // pure scale — no cursor-facing rotation — so the grid↔detail FLIP starts/ends
  // from clean, flat rects (Phase 15). The grid is hidden/fading during the morph,
  // so the ticker re-tilting them next frame is invisible.
  const flattenHeroCards = useCallback(() => {
    for (const c of cardsRef.current) {
      if (c.dr === 0 && (c.dc === -1 || c.dc === 0 || c.dc === 1)) {
        // Imperative ticker-owned state, mutated outside render — intentional.
        /* eslint-disable react-hooks/immutability */
        c.rx = 0;
        c.ry = 0;
        /* eslint-enable react-hooks/immutability */
        if (c.el) c.el.style.transform = `scale(${focusScaleForDistance(Math.abs(c.dc))})`;
      }
    }
  }, []);

  // Open a card's detail (Phase 14 sequence): if the card is already centred,
  // FLIP immediately; otherwise glide it to centre (snappy, capped) and mark the
  // open pending — the ticker fires it the instant the glide settles. Ignored
  // while another open is already pending or the detail is open (input lock).
  const requestCardOpen = useCallback(
    (dc: number, dr: number) => {
      if (pendingOpenRef.current || optionsRef.current.isSuspended?.()) return;
      const col = viewRef.current.cc + dc;
      const row = viewRef.current.cr + dr;
      const atRest =
        Math.abs(posRef.current.col - Math.round(posRef.current.col)) < 0.01 &&
        Math.abs(posRef.current.row - Math.round(posRef.current.row)) < 0.01;
      const centered =
        atRest && col === Math.round(posRef.current.col) && row === Math.round(posRef.current.row);
      if (centered) {
        flattenHeroCards(); // clean flat FROM rects for the morph
        optionsRef.current.onTap?.(col, row, centeredCardOrigin());
      } else {
        pendingOpenRef.current = { col, row };
        startSettle(col, row, config.clickCenterMaxMs);
      }
    },
    [startSettle, centeredCardOrigin, flattenHeroCards],
  );

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
        // The card under the finger drags air with it: its edges splat into
        // the sky's wake at the speed they are moving. Keyed by the card's
        // absolute cell, so crossing onto the next card starts a new wake
        // rather than splatting the jump between them.
        const hit = cardHitAt(pointerRef.current.x, pointerRef.current.y);
        if (hit) {
          skyWake(
            `grid:${hit.dc + viewRef.current.cc},${hit.dr + viewRef.current.cr}`,
            rectEdges(hit.cx, hit.cy, hit.w, hit.h),
          );
        }
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

    // Grid is "settled" when neither dragging nor gliding — the only time the
    // hover overlay shows.
    const settled = !draggingRef.current && !settlingRef.current;

    // Phase 14: a click-to-centre glide has just settled → chain into the detail
    // FLIP (begin it as the glide lands, so it reads as one continuous motion).
    if (pendingOpenRef.current && settled) {
      const { col, row } = pendingOpenRef.current;
      pendingOpenRef.current = null;
      flattenHeroCards(); // clean flat FROM rects for the morph
      optionsRef.current.onTap?.(col, row, centeredCardOrigin());
    }

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
      const kOp = 1 - Math.exp(-dt / (config.overlayFadeMs / 1000));
      let maxDelta = 0;
      let opMoving = false;

      // The card under the cursor (null in a gap); hit-tested each frame so it
      // tracks the grid sliding beneath a still cursor. Drives the hover overlay
      // (when settled) and the per-card opacity lift.
      const hover = cursorActiveRef.current ? cardHitAt(px, py) : null;
      hoverCellRef.current = hover;
      const overlayActive = settled && hover !== null;
      const liftOp = config.hoverLiftOpacity;

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
        // Opacity: the focus-distance dimming, lifted toward `hoverLiftOpacity`
        // while this card is the hovered (overlay) card so its overlay reads.
        const isHover = overlayActive && hover.dc === c.dc && hover.dr === c.dr;
        const baseOp = focusOpacityForDistance(dist);
        const targetOp = isHover ? Math.max(baseOp, liftOp) : baseOp;

        maxDelta = Math.max(maxDelta, Math.abs(targetY - c.ry), Math.abs(targetX - c.rx));
        if (Math.abs(targetOp - c.op) > 0.001) opMoving = true;
        // Per-frame eased state, advanced imperatively in the rAF loop (not during
        // render) — mutating the ticker-owned card is intentional.
        /* eslint-disable react-hooks/immutability */
        c.ry += (targetY - c.ry) * kc;
        c.rx += (targetX - c.rx) * kc;
        c.op = c.op < 0 ? targetOp : c.op + (targetOp - c.op) * kOp;
        /* eslint-enable react-hooks/immutability */
        if (c.el) c.el.style.transform = `scale(${scale}) rotateX(${c.rx}deg) rotateY(${c.ry}deg)`;
        if (c.fade) c.fade.style.opacity = String(c.op);
      }

      // Stop once rotation + opacity have reached rest and nothing moves the grid
      // (the scale is static while settled, so the last write holds it).
      if (maxDelta < CARD_TILT_EPSILON && !opMoving && !draggingRef.current && !settlingRef.current) {
        cardFaceDirtyRef.current = false;
      }
    }

    // Publish the hover-overlay cell: the hovered card when settled, else none.
    // Computed every frame so drag/glide/settle/hover transitions are all caught;
    // setState fires only on an actual change.
    const hoverCell = hoverCellRef.current;
    const wantCell = settled && hoverCell ? { dc: hoverCell.dc, dr: hoverCell.dr } : null;
    const curCell = overlayCellRef.current;
    const sameCell =
      (!wantCell && !curCell) ||
      (!!wantCell && !!curCell && wantCell.dc === curCell.dc && wantCell.dr === curCell.dr);
    if (!sameCell) {
      overlayCellRef.current = wantCell;
      setOverlayCell(wantCell);
    }
  });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // Input is locked while a click-to-centre glide+open is in flight.
    if (pendingOpenRef.current) return;
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
    if (overlayCellRef.current) {
      overlayCellRef.current = null;
      setOverlayCell(null);
    }
    setIsDragging(true);
  }, [setOverlayCell]);

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

      // A clean tap (no drag, mouse or touch) on a card opens its detail view:
      // glide it to centre, then FLIP (Phase 14). A tap in a gap just snaps.
      if (!dragged && !optionsRef.current.isSuspended?.()) {
        const hit = cardHitAt(e.clientX, e.clientY);
        if (hit) {
          requestCardOpen(hit.dc, hit.dr);
          setIsDragging(false);
          return;
        }
      }

      startSettle(targetCol, targetRow);
      setIsDragging(false);
    },
    [startSettle, cardHitAt, requestCardOpen],
  );

  // The world cell holding a given content index with the least euclidean travel
  // from the current position. Cells with this index lie on a lattice
  // (row*stride + col ≡ idx mod N); for each nearby row the matching col is
  // col ≡ idx - row*stride (mod N) — take the nearest copy to the current col,
  // then pick the closest row.
  const nearestCellForContent = useCallback((contentIndex: number): GridPos => {
    const N = CONTENT_COUNT;
    const stride = config.wrapStride;
    const pCol = posRef.current.col;
    const pRow = posRef.current.row;
    const r0 = Math.round(pRow);
    let best: GridPos = { col: Math.round(pCol), row: r0 };
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
    return best;
  }, []);

  // Glide the grid so the nearest cell with this content index is centred.
  const navigateToContent = useCallback(
    (contentIndex: number) => {
      const cell = nearestCellForContent(contentIndex);
      startSettle(cell.col, cell.row);
    },
    [startSettle, nearestCellForContent],
  );

  // Centre the grid on a content index INSTANTLY (no glide) and flatten the hero
  // cards — used on detail exit so the grid is settled-centred and flat the
  // moment the FLIP lands the cards back into their slots.
  const centerContentInstant = useCallback(
    (contentIndex: number) => {
      const cell = nearestCellForContent(contentIndex);
      posRef.current.col = cell.col;
      posRef.current.row = cell.row;
      targetRef.current = { col: cell.col, row: cell.row };
      settlingRef.current = false;
      sync();
      flattenHeroCards();
    },
    [nearestCellForContent, sync, flattenHeroCards],
  );

  // Keyboard: one cell per arrow press. Ignored mid-drag, but a press during a
  // glide retargets from the in-flight target (lands one cell past it). No clamp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draggingRef.current || pendingOpenRef.current || optionsRef.current.isSuspended?.()) return;
      // Enter opens the focused (centred) card — unless a focusable control (e.g.
      // a card's CTA) has focus and should handle Enter itself.
      if (e.key === 'Enter') {
        const ae = document.activeElement;
        if (ae && /^(BUTTON|SELECT|INPUT|TEXTAREA|A)$/.test(ae.tagName)) return;
        e.preventDefault();
        requestCardOpen(0, 0);
        return;
      }
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
  }, [startSettle, requestCardOpen]);

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
      flattenCards();
    };
    const syncMq = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches) flatten();
    };
    syncMq();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Reader open (or any suspend) ⇒ don't drive tilt/facing on the inert grid.
      if (optionsRef.current.isSuspended?.()) return;
      cursorRef.current = { x: e.clientX, y: e.clientY };
      cursorActiveRef.current = true;
      // Re-run the card loop to re-hit-test the hover overlay + opacity lift,
      // even under reduced motion (where the rotation stays flat).
      cardFaceDirtyRef.current = true;
      if (reducedMotionRef.current) return;
      targetTiltRef.current = {
        nx: (e.clientX / window.innerWidth) * 2 - 1,
        ny: (e.clientY / window.innerHeight) * 2 - 1,
      };
      tiltDirtyRef.current = true;
    };
    const onLeave = () => {
      cursorActiveRef.current = false;
      cardFaceDirtyRef.current = true; // ease cards flat + clear the hover overlay
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
    overlay,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    tiltRef,
    cardsRef,
    markCardsChanged,
    navigateToContent,
    centerContentInstant,
    requestCardOpen,
  };
}
