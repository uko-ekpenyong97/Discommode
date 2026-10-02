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
import { registerBusy } from '../activity';
import { animate } from 'motion';
import type { Page, Spread } from './issue-01';
import { CUT_MS, INNER_LEAF_EASE, JUMP, LAST_LEAF_EASE, cubicBezier, planRiffle } from './jump';
import type { RiffleLeaf } from './jump';
import { flipWake } from './flipWake';
import type { BookGeometry } from './flipWake';

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
   * Dev-only probe for the riffle checks: `hold(ms)` renders the running riffle
   * at `ms` from its start and freezes it there (`null` resumes the clock);
   * `colours` paints each leaf a flat hue so their order can be read off the
   * pixels; `leaves` reports every leaf's phase, t, chain angle and z-index.
   */
  probe: {
    hold: (ms: number | null) => void;
    colours: (on: boolean) => void;
    leaves: () => { k: number; from: number; to: number; phase: string; t: number; tt: number; z: string }[];
  };
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
}

/** A jump in progress: from its first frame until it has landed. */
interface Jump {
  target: number;
}

/** One leaf of a riffle, as the engine runs it. */
interface LiveLeaf extends RiffleLeaf {
  k: number;
  phase: 'pending' | 'air' | 'landed';
  curl: Curl | null;
  ease: (x: number) => number;
  /** The leaf's current t and chain angle, for ordering and the dev probe. */
  t: number;
  tt: number;
}

/**
 * A riffle: its own turn layer, driven by one clock. The layer holds two page
 * slots — `near`, the page showing under the stack still to lift, and `far`, the
 * top of the landed stack — and one strip chain per leaf in the air.
 */
interface Riffle {
  dir: TurnDir;
  origin: number;
  target: number;
  leaves: LiveLeaf[];
  layer: HTMLDivElement;
  near: HTMLDivElement;
  far: HTMLDivElement;
  t0: number | null;
  raf: number;
  /** Dev probe: render this ms and hold, instead of the clock. */
  held: number | null;
  frame: number;
  /** A near-slot swap waiting for its leaf's faces to have painted. */
  pendingNear: { src: string | null; frame: number } | null;
  plated: boolean;
  done: boolean;
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
  /** The riffle in flight, if the jump is one. */
  let riffle: Riffle | null = null;
  /** Spare strip chains for riffle leaves, per direction — each already in its
   *  own `.flip-leaf` wrapper (see `takeCurl`). */
  const pool: Record<TurnDir, Curl[]> = { next: [], prev: [] };
  const wraps = new WeakMap<Curl, HTMLDivElement>();
  /** Dev probe: paint riffle leaves as flat colours, to check their order. */
  let debugColours = false;
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
  /** The book's laid-out size, CSS px — read here, on a resize, and nowhere
   *  per frame (see {@link geometry}). */
  let bookW = 0;
  let bookH = 0;
  const syncWidth = (): void => {
    bookW = book.clientWidth;
    bookH = book.clientHeight;
    book.style.setProperty('--bw', `${bookW}px`);
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
    const tt = bend(book, strips, t);

    // Book slide, tied to t so it tracks a drag and springs back on cancel. Only
    // written for a cover/back turn; other turns leave the CSS data-pos value.
    if (state && (state.slideFromK !== 0 || state.slideToK !== 0)) {
      const k = state.slideFromK + (state.slideToK - state.slideFromK) * t;
      book.style.setProperty('--book-slide', `${(k * book.clientWidth).toFixed(2)}px`);
    }

    // The air the leaf pushes — for a turn the engine is running (a tween or a
    // drag). A curl driven from outside with neither is the doorway's cover
    // turn, which makes its own wake, or the dev scrub, which should make none.
    if (state && (tween || drag)) flipWake('flip:turn', geometry(), state.dir, tt);
  }

  /**
   * The curl at `t`, written onto `host` (whose descendants read `--tt`, `--td`
   * and `--shade`) and the chain's own strips. An ordinary turn writes onto the
   * book; a riffle writes onto each leaf's own chain root, since several are in
   * the air at once. Returns the chain angle.
   */
  function bend(host: HTMLElement, strips: HTMLDivElement[], t: number): number {
    const th = Math.PI * t; // true half-turn
    const beta = BETA * Math.sin(Math.PI * t); // overshoot: 0 at both ends
    const tt = th + beta; // chain rotation, runs past 180deg and back
    const td = (2 * beta) / STRIP_COUNT; // per-strip hinge

    host.style.setProperty('--tt', `${(tt * DEG).toFixed(2)}deg`);
    host.style.setProperty('--td', `${(td * DEG).toFixed(3)}deg`);
    host.style.setProperty('--shade', Math.sin(Math.PI * t).toFixed(3));

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
    return tt;
  }

  /**
   * Where the book is on screen, for the leaf's wake (`flipWake.ts`), without a
   * layout read: `.book-stage` centres the book on the viewport, and the only
   * thing that moves it is the half-page slide — inline while a turn or a
   * riffle owns it, else the CSS `data-pos` value (a quarter of the book either
   * way at the cover and the back).
   */
  function geometry(): BookGeometry {
    const inline = book.style.getPropertyValue('--book-slide');
    const pos = book.dataset.pos;
    const slide = inline ? Number.parseFloat(inline) : pos === 'cover' ? -bookW / 4 : pos === 'back' ? bookW / 4 : 0;
    const cy = window.innerHeight / 2;
    return { spineX: window.innerWidth / 2 + slide, pageW: bookW / 2, top: cy - bookH / 2, bottom: cy + bookH / 2 };
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
    if (riffle) {
      cancelAnimationFrame(riffle.raf);
      riffle.done = true;
      for (const l of riffle.leaves) if (l.curl) giveCurl(riffle.dir, l.curl);
      riffle = null;
    }
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
  function startTurnBetween(from: number, to: number): boolean {
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
      slideFromK: slideK(from), slideToK: slideK(to),
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

  const slideKOf = (i: number): number =>
    i === 0 ? -0.25 : i === getSpreads().length - 1 ? 0.25 : 0;

  /**
   * Which leaves draw their pages from the half-resolution riffle set
   * (`Page.riffle`, 1000px wide): those scheduled to cross in under
   * `JUMP.riffleHalfResBelowMs` — too fast to be seen at any resolution. Every
   * slower leaf, and the page the book comes to rest on, is full size, so there
   * is no softness anywhere the eye can follow. With the shipped dials on 20→0
   * that is the middle nine leaves (107–143ms); the first five and last six —
   * 925ms down to 169ms, and the last two at 1283ms — are full size.
   *
   * The cost of full size is a page decoded at a new scale while other leaves
   * are moving; see docs/reader.md for what that costs in frames.
   */
  const isFast = (l: RiffleLeaf): boolean => l.duration < JUMP.riffleHalfResBelowMs;

  /** The image a leaf should use for `page`. */
  const srcFor = (page: Page | null, fast: boolean): string | null =>
    page ? (fast && page.riffle ? page.riffle : page.src) : null;

  /** The pages a riffle leaf puts on screen: its back and what it reveals. */
  function leafPages(l: RiffleLeaf): string[] {
    const fast = isFast(l);
    const s = getSpreads()[l.to];
    return [srcFor(s[0], fast), srcFor(s[1], fast)].filter((x): x is string => !!x);
  }

  /** How many leaves ahead of the one lifting are decoded in advance. */
  const DECODE_AHEAD = 6;

  function prepareJump(index: number): void {
    const from = getSpread();
    if (JUMP.mode === 'cut' || index === from || index < 0 || index >= getSpreads().length) return;
    for (const l of planRiffle(from, index, JUMP).slice(0, DECODE_AHEAD)) for (const src of leafPages(l)) void decode(src);
  }

  function turnTo(index: number): boolean {
    const spreads = getSpreads();
    const from = getSpread();
    if (busy() || index === from || index < 0 || index >= spreads.length) return false;
    if (JUMP.mode === 'cut') return cutTo(from, index);

    const plan = planRiffle(from, index, JUMP);
    const dir: TurnDir = index > from ? 'next' : 'prev';
    const near = dir === 'next' ? 1 : 0; // the side leaves lift from
    const nearSide = near === 1 ? 'right' : 'left';
    const farSide = near === 1 ? 'left' : 'right';
    const inner = cubicBezier(INNER_LEAF_EASE);
    const lastEase = cubicBezier(LAST_LEAF_EASE);

    killTween();
    clearTurn();
    const layer = document.createElement('div');
    layer.className = 'book__turn';
    const nearSlot = buildPlate(nearSide, spreads[from][near]?.src ?? null);
    const farSlot = buildPlate(farSide, spreads[from][1 - near]?.src ?? null);
    // Slots, not landing plates: under every leaf, and casting the contact shadow.
    for (const slot of [nearSlot, farSlot]) slot.classList.replace('book__page--plate', 'book__page--slot');
    layer.append(nearSlot, farSlot);
    turnHost.append(layer);
    turnSeq++;
    setTurnActive(true);

    const r: Riffle = {
      dir,
      origin: from,
      target: index,
      leaves: plan.map((l, k) => ({ ...l, k, phase: 'pending', curl: null, ease: l.last ? lastEase : inner, t: 0, tt: 0 })),
      layer,
      near: nearSlot,
      far: farSlot,
      t0: null,
      raf: 0,
      held: null,
      frame: 0,
      pendingNear: null,
      plated: false,
      done: false,
    };
    jump = { target: index };
    riffle = r;
    // The chains the riffle will need, built now — in the decode wait — rather
    // than as leaves lift: 196 nodes each is not something to allocate mid-run.
    const want = Math.max(1, Math.round(JUMP.riffleMaxInAir)) + 1;
    for (let i = pool[dir].length; i < want; i++) giveCurl(dir, takeCurl(dir));

    // The static spread goes under the slots once they have painted — they show
    // exactly what it shows, so until then it is what the reader sees.
    const seq = turnSeq;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (destroyed || turnSeq !== seq) return;
        book.classList.add(LIFTING_CLASS.next, LIFTING_CLASS.prev);
      }),
    );

    // The first leaves' pages decoded before the clock starts; the rest follow
    // ahead of the lifts as the riffle runs (see `render`).
    void Promise.all(plan.slice(0, DECODE_AHEAD).flatMap(leafPages).map(decode)).then(() => {
      if (destroyed || riffle !== r || r.held !== null) return;
      r.raf = requestAnimationFrame(tickOf(r));
    });
    return true;
  }

  function tickOf(r: Riffle): FrameRequestCallback {
    const tick = (now: number) => {
      if (riffle !== r || r.done || r.held !== null) return;
      r.t0 ??= now;
      render(r, now - r.t0);
      if (!r.done) r.raf = requestAnimationFrame(tick);
    };
    return tick;
  }

  const probe: FlipEngine['probe'] = {
    hold(ms) {
      const r = riffle;
      if (!import.meta.env.DEV || !r) return;
      cancelAnimationFrame(r.raf);
      if (ms === null) {
        const at = r.held ?? 0;
        r.held = null;
        r.t0 = performance.now() - at;
        r.raf = requestAnimationFrame(tickOf(r));
        return;
      }
      r.held = ms;
      // Twice: a near-slot swap waits one render for its leaf's faces.
      render(r, ms);
      if (!r.done) render(r, ms);
    },
    colours(on) {
      if (import.meta.env.DEV) debugColours = on;
    },
    leaves() {
      return (riffle?.leaves ?? []).map((l) => ({
        k: l.k,
        from: l.from,
        to: l.to,
        phase: l.phase,
        t: l.t,
        tt: l.tt,
        z: l.curl ? wrapOf(l.curl).style.zIndex : '',
      }));
    },
  };

  /**
   * A spare chain for a riffle leaf. The pool grows to the most ever in the air.
   *
   * Each chain lives in its own `.flip-leaf` wrapper, which carries the book's
   * perspective and is itself FLAT. That is load-bearing: with every chain in
   * the book's one 3D rendering context, Chrome depth-sorts the curled strips
   * of leaves that share a hinge and gets some of it wrong. Measured on 20→0
   * with each leaf painted a flat hue and its coverage taken from renders of it
   * alone: 2,499 (1x) and 13,075 (2x) overlap pixels drew the lower leaf on top,
   * worst as the last two leaves come down together. Wrapped, each leaf renders
   * its curl in 3D inside its own box and the boxes composite as coplanar
   * layers, where z-index decides — and `render` sets it by the physical rule:
   * 55 and 0, all of them on the shared hinge.
   */
  function takeCurl(dir: TurnDir): Curl {
    const curl = pool[dir].pop() ?? buildCurl(dir);
    if (!wraps.has(curl)) {
      const wrap = document.createElement('div');
      wrap.className = 'flip-leaf';
      wrap.append(curl.root);
      wraps.set(curl, wrap);
    }
    return curl;
  }
  const wrapOf = (curl: Curl): HTMLDivElement => wraps.get(curl)!;
  function giveCurl(dir: TurnDir, curl: Curl): void {
    const wrap = wrapOf(curl);
    wrap.remove();
    wrap.style.zIndex = '';
    pool[dir].push(curl);
  }

  const DEBUG_HUES = ['#e02020', '#20b040', '#2050e0', '#e0c020', '#c020c0', '#20c0c0'];

  /** Swap a slot's page for another, on top of the old one until it decodes. */
  function swapSlot(slot: HTMLDivElement, src: string | null): void {
    const old = [...slot.querySelectorAll('img')];
    if (!src) {
      for (const img of old) img.remove();
      return;
    }
    if (old.at(-1)?.getAttribute('src') === src) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    slot.append(img);
    const drop = () => old.forEach((o) => o.remove());
    void img.decode().then(drop, drop);
  }

  /**
   * The riffle at `ms` from its start. Pure in the schedule — every leaf's t is
   * a function of `ms` — so the dev probe can hold any moment of it; the side
   * effects (lifting, landing) happen in leaf order, once each, as `ms` passes
   * them.
   */
  function render(r: Riffle, ms: number): void {
    r.frame++;
    const spreads = getSpreads();
    const near = r.dir === 'next' ? 1 : 0;
    const farSide = near === 1 ? 'left' : 'right';

    // A near swap waits one frame after its leaf lifted, so the leaf's faces
    // have painted over the page before the page under it changes.
    if (r.pendingNear && r.frame > r.pendingNear.frame) {
      swapSlot(r.near, r.pendingNear.src);
      r.pendingNear = null;
    }

    for (const l of r.leaves) {
      if (l.phase === 'landed') continue;
      const local = (ms - l.start) / l.duration;
      if (local <= 0) continue;
      if (l.phase === 'pending') {
        l.phase = 'air';
        l.curl = takeCurl(r.dir);
        const fast = isFast(l);
        // The lifting page is whatever the near slot showed — so it is fast only
        // if the leaf before this one was (the slot swapped to it at that size).
        const prev = r.leaves[l.k - 1];
        const liftFast = prev ? isFast(prev) : false;
        const lift = srcFor(spreads[l.from][near], liftFast && fast);
        const back = srcFor(spreads[l.to][1 - near], fast);
        if (import.meta.env.DEV && debugColours) {
          const hue = DEBUG_HUES[l.k % DEBUG_HUES.length];
          for (const f of [...l.curl.fronts, ...l.curl.backs]) {
            f.style.backgroundImage = 'none';
            f.style.backgroundColor = hue;
          }
        } else {
          for (const f of [...l.curl.fronts, ...l.curl.backs]) f.style.backgroundColor = '';
          paintCurl(l.curl, lift, back);
        }
        r.layer.append(wrapOf(l.curl));
        r.pendingNear = { src: srcFor(spreads[l.to][near], fast), frame: r.frame };
        // Keep the decode ahead of the lifts.
        for (const ahead of r.leaves.slice(l.k + 1, l.k + 1 + DECODE_AHEAD)) {
          for (const src of leafPages(ahead)) void decode(src);
        }
      }
      if (local < 1) {
        l.t = l.ease(local);
        l.tt = bend(l.curl!.root, l.curl!.strips, l.t);
        if (l.last && l.t >= PLATE_T) plateRiffle(r, farSide, spreads[l.to][1 - near]?.src ?? null);
        continue;
      }
      // Landed.
      l.t = 1;
      l.phase = 'landed';
      if (l.last) {
        bend(l.curl!.root, l.curl!.strips, 1);
        plateRiffle(r, farSide, spreads[l.to][1 - near]?.src ?? null);
        r.done = true;
        jump = null;
        // An ordinary commit from here: React is handed the target, and the
        // handoff drops the layer (after the plate's crossfade) in the frame it
        // paints — exactly as a Prev/Next turn lands.
        pendingCommit = r.target;
        opts.onSpreadChange(r.target);
        continue;
      }
      // An inner leaf lies flat on the landed stack: the far slot takes its page
      // and the chain goes back to the pool. React hears the spread, so the
      // caption and the hash count along with the pages.
      swapSlot(r.far, srcFor(spreads[l.to][1 - near], isFast(l)));
      giveCurl(r.dir, l.curl!);
      l.curl = null;
      opts.onSpreadChange(l.to);
    }

    // Front to back: the leaf standing more upright is higher off the table,
    // whichever side of the spine it leans to — sin of its chain angle.
    const air = r.leaves.filter((l) => l.phase === 'air' && l.curl);
    air.sort((a, b) => Math.sin(a.tt) - Math.sin(b.tt));
    air.forEach((l, i) => {
      wrapOf(l.curl!).style.zIndex = String(10 + i);
    });

    // The book slides with whichever leaf leaves or reaches a closed end.
    let slide: number | null = null;
    for (const l of r.leaves) {
      const a = slideKOf(l.from);
      const b = slideKOf(l.to);
      if (a === b || l.phase === 'pending') continue;
      slide = a + (b - a) * (l.phase === 'landed' ? 1 : l.t);
    }
    if (slide !== null) book.style.setProperty('--book-slide', `${(slide * book.clientWidth).toFixed(2)}px`);

    // Each leaf in the air pushes its own air, keyed by leaf so each has its
    // own velocity. Not while the dev probe holds the riffle still.
    if (r.held === null) {
      const geo = geometry();
      for (const l of air) flipWake(`flip:leaf:${l.k}`, geo, r.dir, l.tt);
    }
  }

  /** The last leaf's landing plate, crossfaded in over it exactly as a turn's. */
  function plateRiffle(r: Riffle, side: 'left' | 'right', src: string | null): void {
    if (r.plated) return;
    r.plated = true;
    const plate = buildPlate(side, src);
    plate.style.zIndex = '50';
    plate.style.opacity = '0';
    r.layer.append(plate);
    const anim = plate.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: PLATE_FADE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    fade = anim;
    void anim.finished.then(
      () => {
        if (fade === anim) fade = null;
      },
      () => {
        if (fade === anim) fade = null;
      },
    );
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
    jump = { target: to };

    const layer = document.createElement('div');
    layer.className = 'book__turn';
    const dx = (slideK(to) - slideK(from)) * book.clientWidth;
    if (dx !== 0) layer.style.transform = `translateX(${dx.toFixed(2)}px)`;
    const [left, right] = spreads[to];
    const plates = [buildPlate('left', left?.src ?? null), buildPlate('right', right?.src ?? null)];
    for (const plate of plates) {
      // Not a landing plate: these cast the contact shadow, since the static slots
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

  // A turn, a drag or a jump is motion the idle warm-up waits for.
  const unbusy = registerBusy(busy);

  function destroy(): void {
    destroyed = true;
    unbusy();
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
    pool.next = [];
    pool.prev = [];
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
    probe,
    handoff,
    destroy,
  };
}
