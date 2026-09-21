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
import { CUT_MS, JUMP, planRiffle } from './jump';

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

/**
 * What a riffle holds back from its budget so the WHOLE jump — click to the
 * turn layer coming off — fits in `JUMP.riffleTotalMs`, not just its leaves.
 * The landing plate's crossfade runs on past the last leaf's t=1 (it starts at
 * PLATE_T), measured at 50–84ms from commit to layer-off; the last leaf's tween
 * lands up to two frames after its nominal duration (the frame it starts on and
 * the one its completion is delivered on); and every inner leaf waits a frame
 * for React to paint the spread it landed on (FRAME_MS, per boundary).
 */
const LAND_RESERVE_MS = 120;
const FRAME_MS = 17;

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
  /**
   * True the instant a turn layer goes up, false the instant it comes down —
   * every path, since `clearTurn` is the single teardown (commit handoff,
   * cancel, a superseding turn, the doorway, destroy). Callers use it to get
   * things that sit ON a page out of the way before the leaf lifts; the cover's
   * hover-animation layer is the one that does today.
   */
  onTurnActive?: (active: boolean) => void;
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
   * Jump to any spread — a riffle of leaves or a cut, per `JUMP.mode`. False
   * (and nothing happens) if the book is busy: a turn, a drag or another jump
   * is in flight. A one-spread jump is a riffle of one leaf.
   */
  turnTo: (index: number) => boolean;
  /** True from a jump's first frame until its last leaf lands. */
  jumping: () => boolean;
  /**
   * Land a running jump NOW: drop whatever is in the air and hand React the
   * target. Returns whether there was one. Escape runs this before the exit.
   */
  finishJump: () => boolean;
  /** Fetch and decode the pages a jump to `index` would show, ahead of it —
   *  the Cover / Back cover buttons call this on hover and focus. */
  prepareJump: (index: number) => void;
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
  /** Book slide (Task 3), as a fraction of --bw, at t=0 and t=1: ∓0.25 on a
   *  cover/back turn (half a page), 0 otherwise. `applyTurn` lerps between them. */
  slideFromK: number;
  slideToK: number;
  /** False for a riffle's inner leaves: the next leaf lifts the moment this one
   *  lands, so there is no settle to dissolve and no plate is built. */
  plates: boolean;
}

/** A jump in progress. `leaf` is the index of the leaf in the air (or about to
 *  be); `stops[leaf]` is where it lands. */
interface Jump {
  target: number;
  stops: number[];
  durations: number[];
  leaf: number;
  /** performance.now() by which the jump must have landed. */
  deadline: number;
  /** Per stop: its pages decoded (or given up on). */
  ready: boolean[];
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
  /** Set for the whole of a jump, first frame to landing. Locks drag and turns. */
  let jump: Jump | null = null;
  /** True while a jump's next leaf is held for its pages to decode. */
  let waiting = false;
  /** A cut's fades — the plates in, the static slots out. Cancelled by clearTurn,
   *  which is what puts the static slots back to full opacity. */
  let cutFades: Animation[] = [];
  /** Whether a turn layer is currently up. Reported on edges only, so a caller
   *  can treat `onTurnActive` as a state change rather than a stream. */
  let turnActive = false;
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

    // Book slide, tied to t so it tracks a drag and springs back on cancel. Only
    // written for a cover/back turn; other turns leave the CSS data-pos value.
    if (state && (state.slideFromK !== 0 || state.slideToK !== 0)) {
      const k = state.slideFromK + (state.slideToK - state.slideFromK) * t;
      book.style.setProperty('--book-slide', `${(k * book.clientWidth).toFixed(2)}px`);
    }

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

  function setTurnActive(active: boolean): void {
    if (turnActive === active) return;
    turnActive = active;
    opts.onTurnActive?.(active);
  }

  function clearTurn(): void {
    fade?.cancel();
    fade = null;
    // A cut faded the static slots; they come back in the same step the plates
    // go, which is the step React has already put the target spread in them.
    for (const a of cutFades) a.cancel();
    cutFades = [];
    turnHost.replaceChildren(); // detaches the cached curl; it is reused as-is
    // Dropped in the SAME synchronous step as the layer, so the static page
    // reappears in the very frame the thing covering it goes away.
    book.classList.remove(LIFTING_CLASS.next, LIFTING_CLASS.prev);
    // Hand the slide back to CSS (the settled data-pos value for the new spread).
    book.style.removeProperty('--book-slide');
    strips = [];
    state = null;
    setTurnActive(false);
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
    const from = getSpread();
    return startTurnBetween(from, dir === 'next' ? from + 1 : from - 1);
  }

  /**
   * Build a turn layer from spread `from` to spread `to`. Adjacent for every
   * ordinary turn; a riffle's first leaf may skip spreads, lifting the current
   * page and landing on one further on — the chain does not care which two pages
   * it carries.
   */
  function startTurnBetween(from: number, to: number, plates = true): boolean {
    killTween();
    clearTurn();
    const spreads = getSpreads();
    if (to === from || to < 0 || to >= spreads.length) return false; // no wraparound
    const dir: TurnDir = to > from ? 'next' : 'prev';

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

    // Slide profile: the cover (spread 0) and back (last spread) rest half a page
    // off-centre; every spread between rests centred. A turn touching either end
    // slides between that offset and 0, tied to t.
    const lastSpread = spreads.length - 1;
    const slideK = (i: number): number => (i === 0 ? -0.25 : i === lastSpread ? 0.25 : 0);

    turnSeq++;
    state = {
      dir, from, to, t: 0, committed: false, plated: false,
      liftSrc: lift?.src ?? null, backSrc: back?.src ?? null,
      slideFromK: slideK(from), slideToK: slideK(to), plates,
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

    setTurnActive(true);
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
    const { to, dir, backSrc, plates } = state;
    // The leaf lands on the FAR half, showing its back page.
    const side = dir === 'next' ? 'left' : 'right';
    tweenTo(
      1,
      duration,
      () => {
        if (!state) return;
        state.committed = true;
        if (plates) plateOnce(side, backSrc); // no-op if the tween already handed over
        // The last leaf of a jump has landed: from here the book is an ordinary
        // book again, and a drag may take the handoff over like any other.
        if (jump && jump.leaf === jump.stops.length - 1) jump = null;
        pendingCommit = to;
        opts.onSpreadChange(to);
      },
      (t) => {
        if (plates && t >= PLATE_T) plateOnce(side, backSrc);
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
    // a snap-back. Drags are different: they take the running turn OVER. A jump
    // owns the book outright until it lands.
    if (tween || jump) return;
    if (!startTurn(dir)) return;
    commitTurn(duration);
  }

  // --- jumps --------------------------------------------------------------
  /**
   * Busy is anything that owns the layer: a tween, a drag, a live turn held by
   * something else (the doorway's cover turn drives applyTurn with no tween), a
   * commit React has not painted yet, or another jump.
   */
  function busy(): boolean {
    return !!(tween || drag || jump || pendingCommit !== null || (state && !state.committed));
  }

  /** Decodes in flight or done, by src. A page decoded once is warm in the
   *  image cache for the next jump that needs it. */
  const decodes = new Map<string, Promise<void>>();
  function decode(src: string): Promise<void> {
    const cached = decodes.get(src);
    if (cached) return cached;
    const img = new Image();
    img.src = src;
    // A failed decode is not cached (the next jump retries) and does not hold
    // the riffle: the leaf goes, as an ordinary turn would on a cold page.
    const p = img.decode().catch(() => {
      decodes.delete(src);
    });
    decodes.set(src, p);
    return p;
  }

  function planFor(from: number, index: number) {
    // Leaves are planned net of the landing tail; `leafOf` then re-fits each one
    // to the time actually left, which absorbs decode waits and frame boundaries.
    return planRiffle(
      from,
      index,
      JUMP.riffleTotalMs - LAND_RESERVE_MS,
      JUMP.riffleMinLeafMs,
      TURN_S * 1000,
    );
  }

  /** The pages stop `i` puts on screen. */
  function stopPages(i: number): string[] {
    return getSpreads()[i].flatMap((page) => (page ? [page.src] : []));
  }

  function prepareJump(index: number): void {
    const spreads = getSpreads();
    const from = getSpread();
    if (JUMP.mode === 'cut' || index === from || index < 0 || index >= spreads.length) return;
    for (const i of planFor(from, index).stops) for (const src of stopPages(i)) void decode(src);
  }

  function turnTo(index: number): boolean {
    const spreads = getSpreads();
    const from = getSpread();
    if (busy() || index === from || index < 0 || index >= spreads.length) return false;
    if (JUMP.mode === 'cut') return cutTo(from, index);

    const plan = planFor(from, index);
    const j: Jump = {
      target: index,
      stops: plan.stops,
      durations: plan.durations,
      leaf: 0,
      deadline: performance.now() + JUMP.riffleTotalMs,
      ready: plan.stops.map(() => false),
    };
    jump = j;

    // Every page the riffle will put on screen is decoded before the leaf that
    // shows it lifts. The ordinary turn relies on the ±1 preload in FlipBook; a
    // riffle lands on spreads nobody preloaded, and each inner leaf lifts the
    // instant React has painted the last one, with no decode gate between. All
    // of them start now, in parallel; only the first leaf's two wait up front.
    plan.stops.forEach((stop, k) => {
      void Promise.all(stopPages(stop).map(decode)).then(() => {
        if (jump !== j) return;
        j.ready[k] = true;
        // A leaf that was waiting on these pages goes now.
        if (j.leaf === k && waiting) {
          waiting = false;
          leafOf(j);
        }
      });
    });
    waiting = true;
    return true;
  }

  /** Lift the jump's current leaf, or hold it until its pages are decoded. */
  function leafOf(j: Jump): void {
    if (!j.ready[j.leaf]) {
      waiting = true;
      return;
    }
    const from = j.leaf === 0 ? getSpread() : j.stops[j.leaf - 1];
    const last = j.leaf === j.stops.length - 1;
    // Only the last leaf plates: it is the one the eye sees come to rest.
    if (!startTurnBetween(from, j.stops[j.leaf], last)) {
      jump = null;
      return;
    }
    // Re-fit this leaf to what is left of the budget: the leaves still to come
    // keep their proportions, and share whatever time the decode and the frame
    // boundaries have not already spent. Never stretched past the plan.
    const left = j.stops.length - j.leaf;
    const budget = j.deadline - performance.now() - LAND_RESERVE_MS - FRAME_MS * (left - 1);
    const planned = j.durations.slice(j.leaf).reduce((a, b) => a + b, 0);
    const ms = j.durations[j.leaf] * Math.min(1, Math.max(0, budget) / planned);
    commitTurn(Math.max(ms, FRAME_MS) / 1000);
  }

  /**
   * The cut: the target spread fades in over the current one. The plates sit
   * where the target spread will rest — offset by the change in book slide, since
   * the cover and back spreads rest half a page off-centre — and the static slots
   * fade out under them on an ease-in, so the pair never dips far below opaque
   * where they overlap. Landing is an ordinary commit: React is handed the
   * target, and the handoff drops the plates in the frame it paints.
   */
  function cutTo(from: number, to: number): boolean {
    killTween();
    clearTurn();
    const spreads = getSpreads();
    const lastSpread = spreads.length - 1;
    const slideK = (i: number): number => (i === 0 ? -0.25 : i === lastSpread ? 0.25 : 0);
    jump = { target: to, stops: [to], durations: [CUT_MS], leaf: 0, deadline: 0, ready: [true] };

    const layer = document.createElement('div');
    layer.className = 'book__turn';
    const dx = (slideK(to) - slideK(from)) * book.clientWidth;
    if (dx !== 0) layer.style.transform = `translateX(${dx.toFixed(2)}px)`;
    const [left, right] = spreads[to];
    const plates = [buildPlate('left', left?.src ?? null), buildPlate('right', right?.src ?? null)];
    for (const plate of plates) {
      // Not a landing plate: these cast the table shadow, since the static slots
      // (and their shadows) are fading out underneath.
      plate.classList.replace('book__page--plate', 'book__page--cut');
      layer.append(plate);
    }
    turnHost.append(layer);
    turnSeq++;
    setTurnActive(true);

    const current = jump;
    const timing = { duration: CUT_MS, fill: 'forwards' as const };
    const incoming = layer.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, easing: 'linear' });
    cutFades = [incoming];
    for (const slot of book.querySelectorAll<HTMLElement>(':scope > .book__page')) {
      cutFades.push(
        slot.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' }),
      );
    }
    void incoming.finished
      .then(() => {
        if (destroyed || jump !== current) return;
        jump = null;
        pendingCommit = to;
        opts.onSpreadChange(to);
      })
      .catch(() => {});
    return true;
  }

  function finishJump(): boolean {
    const j = jump;
    if (!j) return false;
    killTween();
    clearTurn();
    jump = null;
    waiting = false;
    pendingCommit = null;
    if (getSpread() !== j.target) opts.onSpreadChange(j.target);
    return true;
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

    // A riffle's inner leaf: React has painted the spread it landed on, so the
    // next leaf lifts from it now — in the same task, before anything paints the
    // bare static spread. Every page involved was decoded before the riffle began.
    if (jump && jump.leaf < jump.stops.length - 1) {
      jump.leaf++;
      leafOf(jump);
      return;
    }

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
    if (!e.isPrimary || e.button !== 0 || drag || jump) return;

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
    } else if (e.key === 'Home') {
      e.preventDefault();
      turnTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      turnTo(getSpreads().length - 1);
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
    jump = null;
    curls.next = null;
    curls.prev = null;
    pendingCommit = null;
    book.style.removeProperty('--bw');
    book.style.removeProperty('--tt');
    book.style.removeProperty('--td');
    book.style.removeProperty('--shade');
  }

  return {
    startTurn,
    applyTurn,
    clearTurn,
    commitTurn,
    cancelTurn,
    turn,
    turnTo,
    jumping: () => jump !== null,
    finishJump,
    prepareJump,
    handoff,
    destroy,
  };
}
