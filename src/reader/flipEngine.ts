/**
 * The page-turn engine: plain TS, no React. React renders the STATIC spread and
 * an empty host div; everything inside that host — the revealed page underneath
 * and the nested strip chain that forms the curl — is built, animated and torn
 * down here, by writing CSS custom properties and inline styles directly. No
 * React state changes per frame; the only thing that crosses back into React is
 * the spread index, once per completed turn.
 *
 * The curl is a chain of `STRIP_COUNT` divs where strip i+1 is a CHILD of strip
 * i, each hinged to its parent by `--td`. Per-strip rotations accumulate down
 * the chain, so a single scalar `t` bends the whole leaf into a curve.
 */
import { animate } from 'motion';
import type { Spread } from './issue-01';

export type TurnDir = 'next' | 'prev';

/** Strips per curl. More = smoother curve, more nodes. */
export const STRIP_COUNT = 28;
/** Peak overshoot of the chain past its own half-turn, in radians. */
const BETA = 0.55;
/** Strips within this many of the tip fade their shading toward flat paper. */
const EDGE_TAPER = 5;
const DEG = 180 / Math.PI;

/** Tween durations, in SECONDS (motion's unit). */
const COMMIT_S = 0.3;
const CANCEL_S = 0.26;
const TURN_S = 0.85;
const EASE: [number, number, number, number] = [0.42, 0.05, 0.25, 1];

/**
 * Point in a tween where the chain hands over to a flat landing plate.
 *
 * A 28-strip leaf is composited through a 3D transform; a flat `<img>` is not.
 * Even in perfect register the two rasterise high-contrast edges differently, so
 * swapping them at t=1 — when the leaf has visibly stopped — reads as a settle.
 * Swapping while the leaf is still moving trades that settle for a geometric
 * jump, and the trade is a real one — the leaf is NOT within a pixel of landed
 * here. Measured tip displacement against the landed position:
 *
 *   t=0.980  9.6px      t=0.990  4.6px      t=0.997  1.1px
 * > t=0.985  7.0px <    t=0.995  2.3px      t=1.000  0.0px
 *
 * The jump is not snapped: the plate CROSSFADES in over the still-running chain
 * (PLATE_FADE_MS), so the residual is dissolved across several frames. That is
 * why the earlier, larger-jump threshold is the right one here — more motion to
 * dissolve under.
 *
 * (at t=0.985 the tip is still ~28px out of plane, ~1% perspective scale). The
 * later the swap, the smaller the jump — but also the less motion there is to
 * hide it, since the tip only moves ~0.4px per frame by t=0.999. This constant
 * is the whole trade-off; tune it by eye.
 *
 * Only the COMMIT and CANCEL tweens plate. A drag held past this t still shows
 * the real leaf, because the pointer path calls applyTurn directly.
 */
const PLATE_T = 0.985;

/** Crossfade from the chain to the flat plate, in ms. */
const PLATE_FADE_MS = 80;

/** Fraction of the book's width that a full 0->1 drag covers. */
const DRAG_SPAN = 0.62;
/** Movement below this reads as a tap, which flips. */
const TAP_PX = 6;
/** Release past this completes; before it, springs back. */
const COMMIT_T = 0.42;

/** Hides the STATIC copy of the page currently in the air. See flipbook.css. */
const LIFTING_CLASS: Record<TurnDir, string> = {
  next: 'book--lifting-right',
  prev: 'book--lifting-left',
};
/** Ceiling on the wait for the new spread to decode before the layer comes off. */
const HANDOFF_TIMEOUT_MS = 400;

export interface FlipEngineOptions {
  /** The `.book` element — owns `--bw`, `--tt`, `--td`, `--shade`. */
  book: HTMLElement;
  /** React-rendered, permanently empty. The turn layer lives inside it. */
  turnHost: HTMLElement;
  getSpreads: () => Spread[];
  getSpread: () => number;
  onSpreadChange: (index: number) => void;
}

export interface FlipEngine {
  /** Build a turn layer for `dir` and hold it at t=0. False if out of range. */
  startTurn: (dir: TurnDir) => boolean;
  /** Drive the curl. t runs 0 -> 1. */
  applyTurn: (t: number) => void;
  /** Tear the turn layer down without changing the spread. */
  clearTurn: () => void;
  /** Tween to 1 and hand the new spread to React. */
  commitTurn: (duration?: number) => void;
  /** Tween back to 0 and drop the layer. The spread never changes. */
  cancelTurn: (duration?: number) => void;
  /** Start and complete a turn in one call (buttons, arrow keys). */
  turn: (dir: TurnDir, duration?: number) => void;
  /**
   * Called from a layout effect once React has committed the new spread, with
   * the newly-mounted static <img> elements. Removal is deferred until those
   * have decoded — see the implementation.
   */
  handoff: (images: HTMLImageElement[]) => void;
  destroy: () => void;
}

interface TurnState {
  dir: TurnDir;
  from: number;
  to: number;
  t: number;
  /** True once the tween has landed and React has been handed the new spread.
   *  The layer is still up (waiting on decode) but the turn is no longer live. */
  committed: boolean;
  /** The page on the leaf's front — where it came from. Used by the cancel plate. */
  liftSrc: string | null;
  /** The page on the leaf's back — where it lands. Used by the commit plate. */
  backSrc: string | null;
  /** True once the chain has handed over to the flat plate (see PLATE_T). */
  plated: boolean;
}

/** A built strip chain, cached per direction and reused across turns. */
interface Curl {
  root: HTMLDivElement;
  strips: HTMLDivElement[];
  fronts: HTMLDivElement[];
  backs: HTMLDivElement[];
}

interface DragState {
  id: number;
  x0: number;
  w: number;
  /** t at grab time — a drag that takes over a running tween resumes from it. */
  t0: number;
  moved: number;
}

/**
 * `.flip-face` is drawn FACE_OVERLAP wider than its strip (`right: -1.6px`) so
 * neighbouring strips overlap and the seam between them is hidden.
 *
 * On the FRONT face that extra width is harmless: the face is not mirrored, so
 * the overhang simply shows the page's true continuation and the offset needs no
 * correction. The BACK face is mirrored by `rotateY(180deg)` about the FACE's
 * centre — and the face is wider than the strip, so the mirror maps the visible
 * window from image region [FACE_OVERLAP, faceWidth] instead of [0, stripWidth],
 * displacing its content by exactly FACE_OVERLAP.
 *
 * Measured with a single-marker sheet at deviceScaleFactor 2, strips unpromoted:
 *   front face   next +0.00px   prev +0.15px   (no correction needed)
 *   back  face   next -1.35px   prev -1.60px   (needs +FACE_OVERLAP)
 *
 * The last strip has no neighbour, so `.flip-strip--edge .flip-face` clamps its
 * overhang to 0 and it takes no term — confirmed by the markers landing on it
 * (next back, outer edge +0.00px; prev back, outer edge -0.50px).
 */
const FACE_OVERLAP = 1.6;

/**
 * Background offsets for strip `i`, as calc() strings in terms of `--bw` so they
 * stay correct across a resize without being rewritten.
 *
 *  A = -(i * sw)            — slice starting at the strip's own offset
 *  B = (i + 1) * sw - pw    — the same slice measured from the far edge, which is
 *                             what a face mirrored by rotateY(180deg) needs
 *
 * where pw = --bw * 0.5 (one page) and sw = pw / STRIP_COUNT (one strip).
 * `overlap` is FACE_OVERLAP on a mirrored (back) face, 0 otherwise.
 */
function offsetA(i: number, overlap: number): string {
  return `calc(-1 * ${i} * var(--bw) * 0.5 / ${STRIP_COUNT} + ${overlap}px)`;
}
function offsetB(i: number, overlap: number): string {
  return `calc(${i + 1} * var(--bw) * 0.5 / ${STRIP_COUNT} - var(--bw) * 0.5 + ${overlap}px)`;
}

function makeFace(side: 'front' | 'back', posX: string): HTMLDivElement {
  const face = document.createElement('div');
  face.className = `flip-face flip-face--${side}`;
  face.style.backgroundPositionX = posX;
  const sh = document.createElement('div');
  sh.className = 'flip-sh';
  const gl = document.createElement('div');
  gl.className = 'flip-gl';
  face.append(sh, gl);
  return face;
}

export function createFlipEngine(opts: FlipEngineOptions): FlipEngine {
  const { book, turnHost, getSpreads, getSpread } = opts;

  let state: TurnState | null = null;
  let strips: HTMLDivElement[] = [];
  let drag: DragState | null = null;
  let tween: { stop: () => void } | null = null;
  /** The chain -> plate crossfade, while it is running. */
  let fade: Animation | null = null;
  /** Set when a turn has been committed and React has yet to paint the result. */
  let pendingCommit: number | null = null;
  /** Bumped by every startTurn, so a deferred handoff can tell it was superseded. */
  let turnSeq = 0;
  let destroyed = false;
  // 196 nodes per curl is too much to allocate at pointerdown — the worst
  // possible moment. Both curls are built once, then detached and reattached;
  // only the two background images differ between turns, and every offset is
  // expressed against --bw so a resize needs no rebuild either.
  const curls: { next: Curl | null; prev: Curl | null } = { next: null, prev: null };

  // --- sizing -------------------------------------------------------------
  const syncWidth = (): void => {
    book.style.setProperty('--bw', `${book.clientWidth}px`);
  };
  syncWidth();
  const ro = new ResizeObserver(syncWidth);
  ro.observe(book);

  // --- curl construction --------------------------------------------------
  function buildCurl(dir: TurnDir): Curl {
    const root = document.createElement('div');
    root.className = `flip-curl flip-curl--${dir}`;
    const built: Curl = { root, strips: [], fronts: [], backs: [] };

    let parent: HTMLElement = root;
    for (let i = 0; i < STRIP_COUNT; i++) {
      const strip = document.createElement('div');
      strip.className = i === STRIP_COUNT - 1 ? 'flip-strip flip-strip--edge' : 'flip-strip';
      // 'next' lifts the RIGHT page: its front reads left-to-right from the
      // spine (A) and its mirrored back reads from the far edge (B). 'prev'
      // lifts the LEFT page, whose strips nest the other way, so the pair swaps.
      // Only the mirrored back face carries the overlap term, and only where the
      // face actually overhangs — the edge strip's is clamped to 0 in CSS.
      const back0 = i === STRIP_COUNT - 1 ? 0 : FACE_OVERLAP;
      const front = makeFace('front', dir === 'next' ? offsetA(i, 0) : offsetB(i, 0));
      const back = makeFace('back', dir === 'next' ? offsetB(i, back0) : offsetA(i, back0));
      strip.append(front, back);
      parent.append(strip);
      built.strips.push(strip);
      built.fronts.push(front);
      built.backs.push(back);
      parent = strip;
    }
    return built;
  }

  function getCurl(dir: TurnDir): Curl {
    const cached = curls[dir];
    if (cached) return cached;
    const built = buildCurl(dir);
    curls[dir] = built;
    return built;
  }

  function paintCurl(curl: Curl, liftSrc: string | null, backSrc: string | null): void {
    const lift = liftSrc ? `url("${liftSrc}")` : 'none';
    const back = backSrc ? `url("${backSrc}")` : 'none';
    for (let i = 0; i < curl.fronts.length; i++) curl.fronts[i].style.backgroundImage = lift;
    for (let i = 0; i < curl.backs.length; i++) curl.backs[i].style.backgroundImage = back;
  }

  // --- the curl math ------------------------------------------------------
  function applyTurn(t: number): void {
    if (state) state.t = t;

    const th = Math.PI * t; // true half-turn
    const beta = BETA * Math.sin(Math.PI * t); // overshoot: 0 at both ends
    const tt = th + beta; // chain rotation, runs past 180deg and back
    const td = (2 * beta) / STRIP_COUNT; // per-strip hinge

    book.style.setProperty('--tt', `${(tt * DEG).toFixed(2)}deg`);
    book.style.setProperty('--td', `${(td * DEG).toFixed(3)}deg`);
    book.style.setProperty('--shade', Math.sin(Math.PI * t).toFixed(3));

    const last = strips.length - 1;
    for (let i = 0; i < strips.length; i++) {
      // cos^2, not |cos|: same 0..1 range with no cusp as a strip crosses edge-on.
      const c1 = Math.cos(tt - i * td);
      const c2 = Math.cos(tt - (i + 1) * td);
      const l1 = c1 * c1;
      const l2 = c2 * c2;
      const distFromTip = last - i;
      const taper = distFromTip < EDGE_TAPER ? distFromTip / EDGE_TAPER : 1;
      const st = strips[i].style;
      st.setProperty('--lit', Math.sqrt(l1).toFixed(3));
      st.setProperty('--a1', ((1 - l1) * 0.55 * taper).toFixed(3));
      st.setProperty('--a2', ((1 - l2) * 0.55 * taper).toFixed(3));
    }
  }

  // --- turn control -------------------------------------------------------
  function killTween(): void {
    tween?.stop();
    tween = null;
  }

  function clearTurn(): void {
    fade?.cancel();
    fade = null;
    turnHost.replaceChildren(); // detaches the cached curl; it is reused as-is
    // Dropped in the SAME synchronous step as the layer, so the static page
    // reappears in the very frame the thing covering it goes away.
    book.classList.remove(LIFTING_CLASS.next, LIFTING_CLASS.prev);
    strips = [];
    state = null;
  }

  /**
   * Build the flat landing plate — exactly as React builds a static slot, so it
   * is pixel-identical to what the turn lands on (verified 0/468000 differing).
   */
  function buildPlate(side: 'left' | 'right', src: string | null): HTMLDivElement {
    const plate = document.createElement('div');
    plate.className = `book__page book__page--${side} book__page--plate`;
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.draggable = false;
      plate.append(img);
    }
    return plate;
  }

  /**
   * Hand the chain over to the plate, once per turn, by CROSSFADE rather than a
   * swap.
   *
   * A 28-strip leaf is composited through a 3D transform and its strips are
   * promoted, so their quads snap independently; a flat <img> has neither
   * property. The two can never rasterise identically, and cutting between them
   * — at any t — reads as a settle. Fading instead spreads that residual across
   * PLATE_FADE_MS while the chain is still running its own tween underneath, so
   * there is no single frame where it all resolves at once.
   *
   * The chain is dropped when the fade lands; if the turn finishes first, the
   * handoff waits for the fade rather than cutting it short.
   */
  function plateOnce(side: 'left' | 'right', src: string | null): void {
    if (!state || state.plated) return;
    const layer = turnHost.firstElementChild;
    if (!layer) return;
    state.plated = true;

    const plate = buildPlate(side, src);
    plate.style.opacity = '0';
    layer.append(plate); // above the chain via .book__page--plate's z-index

    const seq = turnSeq;
    const anim = plate.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: PLATE_FADE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    fade = anim;
    void anim.finished
      .then(() => {
        if (fade === anim) fade = null;
        if (destroyed || turnSeq !== seq) return;
        layer.querySelector('.flip-curl')?.remove(); // cached curl, reused as-is
        strips = [];
      })
      .catch(() => {
        if (fade === anim) fade = null;
      });
  }

  /** Run `fn` once the crossfade has landed, or immediately if none is running. */
  function afterFade(fn: () => void): void {
    if (!fade) {
      fn();
      return;
    }
    const seq = turnSeq;
    const done = () => {
      if (!destroyed && turnSeq === seq) fn();
    };
    void fade.finished.then(done).catch(done);
  }

  function startTurn(dir: TurnDir): boolean {
    killTween();
    clearTurn();
    const spreads = getSpreads();
    const from = getSpread();
    const to = dir === 'next' ? from + 1 : from - 1;
    if (to < 0 || to >= spreads.length) return false; // no wraparound

    // next: lift the current right page, its back is the new left, and the new
    // right is revealed underneath. prev is the mirror of that.
    const lift = dir === 'next' ? spreads[from][1] : spreads[from][0];
    const back = dir === 'next' ? spreads[to][0] : spreads[to][1];
    const under = dir === 'next' ? spreads[to][1] : spreads[to][0];

    const layer = document.createElement('div');
    layer.className = 'book__turn';

    const slot = document.createElement('div');
    slot.className = `book__page book__page--${dir === 'next' ? 'right' : 'left'}`;
    // The curl's faces need a frame or two to rasterise their background images.
    // Until they do they are transparent, and the revealed page shows straight
    // through the leaf. Hide it until the curl has actually painted; what shows
    // underneath meanwhile is the STATIC page, which at t=0 is the very page the
    // curl's front face carries — so this is invisible when it works.
    slot.style.visibility = 'hidden';
    if (under) {
      const img = document.createElement('img');
      img.src = under.src;
      img.alt = '';
      img.draggable = false;
      slot.append(img);
    }
    layer.append(slot);

    const curl = getCurl(dir);
    paintCurl(curl, lift?.src ?? null, back?.src ?? null);
    layer.append(curl.root);

    turnSeq++;
    state = {
      dir, from, to, t: 0, committed: false, plated: false,
      liftSrc: lift?.src ?? null, backSrc: back?.src ?? null,
    };
    strips = curl.strips;
    turnHost.append(layer);

    applyTurn(0);

    // Two frames guarantees at least one fully painted one. `turnSeq` catches a
    // superseded turn; `isConnected` catches a cancelled one, which tears the
    // layer down via clearTurn() WITHOUT bumping the token.
    //
    // The same callback hides the STATIC copy of the page now in the air. It has
    // to happen here rather than at startTurn: for those first two frames the
    // static page is precisely what the user should see while the curl's faces
    // rasterise. From here on the curl carries that page, and leaving the flat
    // copy underneath leaks a hairline at the spine — or, when the revealed slot
    // is null and nothing covers it, leaves the page looking flat while its own
    // curl lifts away.
    const seq = turnSeq;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (destroyed || turnSeq !== seq || !slot.isConnected) return;
        slot.style.visibility = '';
        book.classList.add(LIFTING_CLASS[dir]);
      });
    });

    return true;
  }

  /**
   * Tween t to `target`. `onArrive` runs after an explicit applyTurn(target):
   * motion's onUpdate is not guaranteed to deliver the exact endpoint, and a
   * curl left at t=0.997 shows a visible sliver.
   */
  function tweenTo(
    target: number,
    duration: number,
    onArrive: () => void,
    onFrame?: (t: number) => void,
  ): void {
    killTween();
    const from = state ? state.t : 0;
    if (duration <= 0 || from === target) {
      applyTurn(target);
      onFrame?.(target);
      onArrive();
      return;
    }
    tween = animate(from, target, {
      duration,
      ease: EASE,
      onUpdate: (t: number) => {
        applyTurn(t);
        onFrame?.(t);
      },
      onComplete: () => {
        tween = null;
        applyTurn(target);
        onFrame?.(target);
        onArrive();
      },
    });
  }

  /**
   * The spread swap and the layer removal are deliberately SPLIT:
   * `onSpreadChange` only asks React to re-render, and `handoff()` — called from
   * a layout effect once that render has committed — removes the layer. Doing
   * both here would drop the layer a frame before the new spread paints.
   */
  function commitTurn(duration = COMMIT_S): void {
    if (!state) return;
    const { to, dir, backSrc } = state;
    // The leaf lands on the FAR half, showing its back page.
    const side = dir === 'next' ? 'left' : 'right';
    tweenTo(
      1,
      duration,
      () => {
        if (!state) return;
        state.committed = true;
        plateOnce(side, backSrc); // no-op if the tween already handed over
        pendingCommit = to;
        opts.onSpreadChange(to);
      },
      (t) => {
        if (t >= PLATE_T) plateOnce(side, backSrc);
      },
    );
  }

  /**
   * Nothing is committed on a cancel, so the layer goes directly — but the leaf
   * settles back onto the page it came from, which is the same chain-vs-flat
   * mismatch in reverse. Hand over to a plate on the leaf's ORIGINAL side near
   * t=0; `clearTurn` then drops the plate and un-hides the identical static page
   * in one synchronous step.
   */
  function cancelTurn(duration = CANCEL_S): void {
    if (!state) return;
    const { dir, liftSrc } = state;
    const side = dir === 'next' ? 'right' : 'left';
    tweenTo(
      0,
      duration,
      () => afterFade(clearTurn),
      (t) => {
        if (t <= 1 - PLATE_T) plateOnce(side, liftSrc);
      },
    );
  }

  function turn(dir: TurnDir, duration = TURN_S): void {
    // A turn already completing owns the layer — restarting it from t=0 reads as
    // a snap-back. Drags are different: they take the running turn OVER.
    if (tween) return;
    if (!startTurn(dir)) return;
    commitTurn(duration);
  }

  /**
   * Removing the layer synchronously here flashed intermittently: React has
   * committed the new <img> src values, but a full-page bitmap is not necessarily
   * decoded yet, so for a frame there was nothing painted underneath. Decoding a
   * separate `new Image()` ahead of time does not reliably keep a bitmap of this
   * size resident, so the wait has to be on the ACTUAL mounted elements.
   *
   * The layer being held a little longer is invisible — it is already showing
   * the correct final frame of the turn.
   */
  function handoff(images: HTMLImageElement[]): void {
    if (pendingCommit === null) return;
    pendingCommit = null;

    // Warm path. The layer is now a PLATE that is pixel-identical to what React
    // has just committed, and every incoming image is already loaded — the
    // preload guarantees that for any ordinary turn, and both pages have been on
    // screen inside the layer for the whole tween. So drop it in this very frame:
    // no window in which the leaf sits on top of the finished spread.
    if (images.length > 0 && images.every((img) => img.complete)) {
      afterFade(clearTurn); // never cut the crossfade short
      return;
    }

    // Cold path (deep link, throttled network): the incoming pages may not have
    // pixels yet, so keep the decode gate that stops the first-frame flash.
    // If a new turn starts while we wait, its startTurn has already cleared this
    // layer and built its own; bumping turnSeq is what tells us to stand down.
    const seq = turnSeq;
    const decoded = Promise.allSettled(images.map((img) => img.decode()));
    const deadline = new Promise<void>((resolve) => {
      window.setTimeout(resolve, HANDOFF_TIMEOUT_MS);
    });

    void Promise.race([decoded, deadline]).then(() => {
      requestAnimationFrame(() => {
        if (destroyed || turnSeq !== seq) return;
        clearTurn();
      });
    });
  }

  // --- pointer ------------------------------------------------------------
  function onPointerDown(e: PointerEvent): void {
    if (!e.isPrimary || e.button !== 0 || drag) return;

    const rect = book.getBoundingClientRect();
    const dir: TurnDir = e.clientX - rect.left > rect.width / 2 ? 'next' : 'prev';

    if (state && !state.committed) {
      // A LIVE turn is in the DOM (tweening, or parked by the debug scrub).
      // Grabbing it in the same direction takes over from the CURRENT t rather
      // than restarting; grabbing the other way is ignored until it settles.
      if (state.dir !== dir) return;
      // Past PLATE_T the chain has been replaced by a flat plate, so there is
      // nothing left to drag — the turn is a frame from completing. Let it.
      if (state.plated) return;
      killTween();
    } else if (!startTurn(dir)) {
      return; // out of range: no capture, so the rest of the gesture is inert
    }

    drag = { id: e.pointerId, x0: e.clientX, w: rect.width, t0: state?.t ?? 0, moved: 0 };
    book.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id || !state) return;
    const dx = e.clientX - drag.x0;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    const raw = (state.dir === 'next' ? -dx : dx) / (drag.w * DRAG_SPAN);
    applyTurn(Math.min(1, Math.max(0, drag.t0 + raw)));
  }

  function onPointerEnd(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = drag.moved < TAP_PX;
    if (book.hasPointerCapture(drag.id)) book.releasePointerCapture(drag.id);
    drag = null;
    if (!state) return;
    if (tap || state.t > COMMIT_T) commitTurn();
    else cancelTurn();
  }

  function onDragStart(e: Event): void {
    e.preventDefault(); // native image drag would hijack the gesture
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (drag || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      turn('next');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      turn('prev');
    }
  }

  book.addEventListener('pointerdown', onPointerDown);
  book.addEventListener('pointermove', onPointerMove);
  book.addEventListener('pointerup', onPointerEnd);
  book.addEventListener('pointercancel', onPointerEnd);
  book.addEventListener('dragstart', onDragStart);
  window.addEventListener('keydown', onKeyDown);

  function destroy(): void {
    destroyed = true;
    book.removeEventListener('pointerdown', onPointerDown);
    book.removeEventListener('pointermove', onPointerMove);
    book.removeEventListener('pointerup', onPointerEnd);
    book.removeEventListener('pointercancel', onPointerEnd);
    book.removeEventListener('dragstart', onDragStart);
    window.removeEventListener('keydown', onKeyDown);
    if (drag && book.hasPointerCapture(drag.id)) book.releasePointerCapture(drag.id);
    drag = null;
    ro.disconnect();
    killTween();
    fade?.cancel();
    fade = null;
    clearTurn();
    curls.next = null;
    curls.prev = null;
    pendingCommit = null;
    book.style.removeProperty('--bw');
    book.style.removeProperty('--tt');
    book.style.removeProperty('--td');
    book.style.removeProperty('--shade');
  }

  return { startTurn, applyTurn, clearTurn, commitTurn, cancelTurn, turn, handoff, destroy };
}
