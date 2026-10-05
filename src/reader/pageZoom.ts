/**
 * ZOOM TO READ, ON A TOUCH SCREEN (docs/mobile.md). A pinch, or a double tap,
 * zooms the page in; one finger pans it while it is zoomed; a pinch back out,
 * or another double tap, returns it. While it is zoomed no page turns. Only
 * touch pointers ever reach any of it: a mouse, a pen and a trackpad's pinch
 * are as they were (zoom-to-read stays dropped on the desktop).
 *
 * The zoom is a transform on a wrapper around the book's stage (`.book-zoom`,
 * whose box is the reader's: the viewport), `translate(t) scale(z)` about its
 * top-left corner, so a point p of the unzoomed screen is drawn at p·z + t.
 *
 * Two ways a touch reaches the book while it is NOT zoomed:
 *
 *   - the open spread (and the closed cover and back): the engine's own drag,
 *     unchanged, so a page still curls under the finger. Its taps are claimed
 *     through the engine's `tapTarget` ({@link PageZoom.deferTap}) and wait
 *     out the double tap before they turn.
 *   - one page at a time, an open spread (`claimAll`): every touch is this
 *     module's. A tap waits out the double tap and is the caller's
 *     (`onTap`: the other page, or a turn); a swipe is the caller's
 *     (`onSwipe`), at once.
 *
 * A second finger landing is a pinch, whichever way the first came in: a
 * press the engine holds without a turn is let go first (`releasePress`); a
 * page already turning under the first finger is left to finish, and the
 * pinch waits for the next.
 */

/** A double tap: the second tap's press this soon after the first's release… */
export const DOUBLE_TAP_MS = 300;
/** …and this near it, px. */
export const DOUBLE_TAP_PX = 40;
/** A tap moves less than this, px. */
const TAP_MOVE_PX = 10;
/** A swipe moves at least this far, px, and more across than down. */
const SWIPE_PX = 40;
/** What a double tap zooms to. */
export const DOUBLE_TAP_ZOOM = 2.4;
/** The most a pinch zooms. */
export const MAX_ZOOM = 4;
/** Under this, a released pinch goes back to 1. */
const SNAP_BACK = 1.08;
/** The ease to a new zoom (a double tap, a snap back), ms. */
const EASE_MS = 240;

export interface ZoomState {
  z: number;
  tx: number;
  ty: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The pan held so the content box `c` (unzoomed screen px) never pulls in
 * from the viewport's edge: larger than the viewport along an axis, its edges
 * stay outside it; smaller, it stays inside it.
 */
export function clampPan(s: ZoomState, c: Box, vw: number, vh: number): ZoomState {
  const axis = (t: number, lo: number, hi: number, size: number): number => {
    const a = lo * s.z + t;
    const b = hi * s.z + t;
    if (b - a >= size) return Math.min(Math.max(t, size - hi * s.z), -lo * s.z);
    return Math.min(Math.max(t, -lo * s.z), size - hi * s.z);
  };
  return { z: s.z, tx: axis(s.tx, c.left, c.right, vw), ty: axis(s.ty, c.top, c.bottom, vh) };
}

/** The zoom `z` about the screen point (x, y): that point stays put. */
export function zoomAbout(s: ZoomState, z: number, x: number, y: number): ZoomState {
  const k = z / s.z;
  return { z, tx: x - (x - s.tx) * k, ty: y - (y - s.ty) * k };
}

/**
 * A pinch's state from where it started: the content point under the
 * starting midpoint `m0` follows the midpoint `m`, at the start's zoom × the
 * fingers' spread over their starting spread.
 */
export function pinchState(start: ZoomState, d0: number, d: number, m0: [number, number], m: [number, number]): ZoomState {
  const z = Math.min(MAX_ZOOM, Math.max(1, (start.z * d) / Math.max(1, d0)));
  const cx = (m0[0] - start.tx) / start.z;
  const cy = (m0[1] - start.ty) / start.z;
  return { z, tx: m[0] - cx * z, ty: m[1] - cy * z };
}

export interface PageZoomOptions {
  /** The element that zooms. */
  wrapper: HTMLElement;
  /** What may be panned to: the book as it is on screen, or null. Asked as a
   *  zoom starts from 1, so it is the unzoomed book. */
  content: () => Box | null;
  /** True while every touch is this module's (one page at a time, open). */
  claimAll: () => boolean;
  /** A single tap, once the double tap has been waited out (claimAll). The
   *  press's own claim, if something on the page took it (a quote). */
  onTap: (x: number, y: number, claimed: (() => void) | null) => void;
  /** A swipe (claimAll): +1 toward the end of the book, −1 back. */
  onSwipe: (dir: 1 | -1) => void;
  /** Something on the page that takes a tap, asked at each press (claimAll). */
  tapTarget: (e: PointerEvent) => (() => void) | null;
  /** Let go of the engine's press without a turn; false if a page is turning. */
  releasePress: () => boolean;
  /** Zoomed or not, as it changes. */
  onZoomed?: (zoomed: boolean) => void;
}

export interface PageZoom {
  /** For the engine's `tapTarget`, on a touch press it would take: claims it,
   *  and returns its tap, which waits out the double tap before `action`. */
  deferTap: (e: PointerEvent, action: () => void) => (() => void) | null;
  zoomed: () => boolean;
  /** Back to 1 (eased, unless `now`). */
  reset: (now?: boolean) => void;
  destroy: () => void;
}

interface Touch {
  x: number;
  y: number;
  x0: number;
  y0: number;
  t0: number;
  /** Ours from its press (not the engine's). */
  own: boolean;
  claimed: (() => void) | null;
}

export function createPageZoom(opts: PageZoomOptions): PageZoom {
  const { wrapper } = opts;
  let s: ZoomState = { z: 1, tx: 0, ty: 0 };
  const touches = new Map<number, Touch>();
  let pinch: { start: ZoomState; d0: number; m0: [number, number] } | null = null;
  /** The last tap's release, for the double tap; `armed` once a press lands
   *  near it in time, so that press's tap is the second. */
  let lastTap: { x: number; y: number; at: number } | null = null;
  let armed = false;
  let pending: number | null = null;
  let settleTimer: number | null = null;
  /** A gesture that is spent: a pinch's leftover finger pans, it never taps. */
  let spent = false;
  /** The book on screen, clipped to it, as the zoom started from 1. */
  let box: Box | null = null;
  const measure = () => {
    const c = opts.content();
    box = c && { left: Math.max(0, c.left), top: Math.max(0, c.top), right: Math.min(window.innerWidth, c.right), bottom: Math.min(window.innerHeight, c.bottom) };
  };

  const isZoomed = () => s.z > 1.001;

  function write(eased: boolean): void {
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
    const st = wrapper.style;
    if (eased) {
      st.transition = `transform ${EASE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`;
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        st.transition = '';
        if (!isZoomed()) st.transform = '';
      }, EASE_MS + 30);
    } else {
      st.transition = '';
    }
    st.transform = isZoomed() || eased ? `translate(${s.tx}px, ${s.ty}px) scale(${s.z})` : '';
    const was = wrapper.dataset.zoomed === 'true';
    if (was !== isZoomed()) {
      if (isZoomed()) wrapper.dataset.zoomed = 'true';
      else delete wrapper.dataset.zoomed;
      opts.onZoomed?.(isZoomed());
    }
  }

  function set(next: ZoomState, eased = false): void {
    s = box ? clampPan(next, box, window.innerWidth, window.innerHeight) : next;
    if (s.z <= 1.001) s = { z: 1, tx: 0, ty: 0 };
    write(eased);
  }

  function cancelPending(): void {
    if (pending !== null) window.clearTimeout(pending);
    pending = null;
  }

  /** A tap's release at (x, y): the second of a double tap toggles the zoom;
   *  a first waits, then is `single` (if it is still not zoomed). */
  function tap(x: number, y: number, single: () => void): void {
    const now = performance.now();
    if (armed && lastTap && Math.hypot(x - lastTap.x, y - lastTap.y) < DOUBLE_TAP_PX) {
      lastTap = null;
      armed = false;
      cancelPending();
      if (isZoomed()) set({ z: 1, tx: 0, ty: 0 }, true);
      else {
        measure();
        set(zoomAbout(s, DOUBLE_TAP_ZOOM, x, y), true);
      }
      return;
    }
    lastTap = { x, y, at: now };
    armed = false;
    cancelPending();
    if (isZoomed()) return; // zoomed, a single tap does nothing
    pending = window.setTimeout(() => {
      pending = null;
      if (!isZoomed()) single();
    }, DOUBLE_TAP_MS);
  }

  function startPinch(): void {
    const [a, b] = [...touches.values()];
    cancelPending();
    lastTap = null;
    armed = false;
    if (!isZoomed()) measure();
    pinch = { start: { ...s }, d0: Math.hypot(a.x - b.x, a.y - b.y), m0: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
  }

  function onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    // A press soon after a tap, and near it: the first tap waits no longer
    // (its single would land in the middle of the double), and this one's
    // tap is the second.
    if (touches.size === 0 && lastTap) {
      armed = performance.now() - lastTap.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
      if (armed) cancelPending();
      else lastTap = null;
    }
    const own = isZoomed() || touches.size > 0 || opts.claimAll();
    if (touches.size === 1 && !isZoomed()) {
      // A second finger: a pinch — unless the first is turning a page.
      const [first] = touches.values();
      if (!first.own && !opts.releasePress()) return;
    }
    const claimed = own && !isZoomed() && touches.size === 0 ? opts.tapTarget(e) : null;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), own, claimed });
    if (own) {
      // Nothing under the zoom hears it: no turn, no other page.
      e.stopPropagation();
      e.preventDefault();
    }
    if (touches.size === 2) {
      for (const t of touches.values()) t.own = true;
      spent = true;
      startPinch();
    } else if (touches.size === 1) {
      spent = false;
      if (settleTimer !== null && isZoomed()) write(false); // catch an ease mid-way
    }
  }

  function onMove(e: PointerEvent): void {
    const t = touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (!t.own) return;
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      set(pinchState(pinch.start, pinch.d0, Math.hypot(a.x - b.x, a.y - b.y), pinch.m0, [(a.x + b.x) / 2, (a.y + b.y) / 2]));
    } else if (isZoomed() && touches.size === 1) {
      set({ z: s.z, tx: s.tx + dx, ty: s.ty + dy });
    }
  }

  function onEnd(e: PointerEvent): void {
    const t = touches.get(e.pointerId);
    if (!t) return;
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) {
        pinch = null;
        if (s.z < SNAP_BACK) set({ z: 1, tx: 0, ty: 0 }, true);
      }
      return;
    }
    if (!t.own || spent || e.type !== 'pointerup') return;
    const moved = Math.hypot(t.x - t.x0, t.y - t.y0);
    if (moved < TAP_MOVE_PX) {
      const claimed = t.claimed;
      tap(t.x, t.y, () => opts.onTap(t.x, t.y, claimed));
      return;
    }
    const dx = t.x - t.x0;
    if (!isZoomed() && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(t.y - t.y0)) {
      lastTap = null;
      opts.onSwipe(dx < 0 ? 1 : -1);
    }
  }

  // Under everything on the page: the press is decided before the engine (on
  // the book) or the one-page pan (on the stage) hear it.
  wrapper.addEventListener('pointerdown', onDown, { capture: true });
  window.addEventListener('pointermove', onMove, { capture: true });
  window.addEventListener('pointerup', onEnd, { capture: true });
  window.addEventListener('pointercancel', onEnd, { capture: true });
  // Safari's own pinch of the page, which `touch-action` alone does not stop.
  const noGesture = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', noGesture);

  // DEV: the checks read the zoom.
  if (import.meta.env.DEV) (window as unknown as { __pageZoom?: () => ZoomState }).__pageZoom = () => ({ ...s });

  return {
    deferTap(e, action) {
      if (e.pointerType !== 'touch') return null;
      const x0 = e.clientX;
      const y0 = e.clientY;
      return () => tap(x0, y0, action);
    },
    zoomed: isZoomed,
    reset(now = false) {
      cancelPending();
      lastTap = null;
      armed = false;
      pinch = null;
      if (isZoomed() || wrapper.style.transform) set({ z: 1, tx: 0, ty: 0 }, !now);
    },
    destroy() {
      cancelPending();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      wrapper.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('pointerup', onEnd, { capture: true });
      window.removeEventListener('pointercancel', onEnd, { capture: true });
      document.removeEventListener('gesturestart', noGesture);
      wrapper.style.transform = '';
      wrapper.style.transition = '';
      delete wrapper.dataset.zoomed;
    },
  };
}
