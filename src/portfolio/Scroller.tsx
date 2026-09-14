import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Lenis from 'lenis';
import { animate } from 'motion';
import { SectionPage } from './SectionPage';
import { SheetCanvas } from './SheetCanvas';
import type { CornerLift, SheetCanvasHandle } from './SheetCanvas';
import { look, poseDials, subscribeLook } from './portfolioMotion';
import {
  bottomOf,
  buildTrack,
  dwellStart,
  enterWindow,
  layout,
  maxPosition,
  minPosition,
  positionAt,
  positionOf,
  resolve,
  settleAt,
  sheetPose,
  tearPose,
} from './pageTrack';
import type { SheetKind, Track, TrackLayout, TrackPosition } from './pageTrack';
import type { ScreenRect } from './fitPlaneToRect';
import { ScrollerContext } from './scrollerContext';
import { useReveal } from './useReveal';
import type { Project } from './blocks/types';

/**
 * THE SCROLLER: the one scroll container, and the thing that turns a position
 * into a frame.
 *
 * The document cannot scroll — `body` is locked to a single viewport and the
 * grid must not move while a project is open — so this brings its own: a
 * full-viewport box with a hidden scrollbar and a spacer sized to the track's
 * length. That scroller's position IS the track position. Every tick it goes
 * through `pageTrack`'s `layout()` and comes back out as at most one page pose
 * and at most one sheet pose, which is how one wheel gesture carries you down a
 * page, tilts it away, unrolls the next one and carries on down that, with no
 * mode and no state machine in between.
 *
 * Everything here is imperative on purpose: scrolling writes geometry straight
 * to the DOM and one `render` call to the canvas. The only React state is the
 * scroller ELEMENT (the observers need it as a root) and the armed flag.
 *
 * Smoothing is Lenis, scoped to this scroller via its `wrapper`/`content`
 * options — the grid keeps its own feel entirely. Lenis honours
 * `prefers-reduced-motion` itself by dropping to 1:1.
 *
 * THE POSITION IS NOT THE SCROLLTOP. It usually is, but the track starts at
 * `-enterDistance` — section 0's sheet fully rolled and out of frame — and a
 * scroller cannot go negative. So the position lives in `positionRef`, the
 * scroller is one way of driving it, and the intro tween is another.
 *
 * TWO RULES keep the track honest, and both exist because it is derived from
 * MEASURED page heights:
 *
 *  1. The scroller stays LOCKED until the first layout is real — fonts ready
 *     and every page measured at least once. Before that the heights are a
 *     guess, and a guess you can scroll is a guess that throws you onto the
 *     wrong section. The TEXTURES are deliberately not part of that gate:
 *     `sheet.webp` decoding affects no layout, and waiting on it would put a
 *     WebGL asset on the critical path of a scroll lock.
 *  2. A rebuild preserves the SEMANTIC position (section, segment, how far
 *     through), never the pixel one. See `positionAt` / `resolve`.
 *
 * Neither should ever have to do any work: the blocks reserve their media boxes
 * from intrinsic sizes, so a page's height is the same before and after its
 * assets load. They are here because "should" is not a guarantee.
 */

/** The settle's and the letterhead click's curve — decelerating, so a long
 *  rewind arrives slowly. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * THE TWO FLAT STATES, which are what each hand-off crossfades against.
 *
 * An entrance ends with the sheet flat at the page's rect showing the section's
 * FIRST viewport; a tear begins with it flat at the same rect showing the
 * section's LAST. Both are poses the choreography already passes through — the
 * end of `sheetPose` and the start of `tearPose` — so they are taken from there
 * rather than written out again, and neither can drift from the frame beside it.
 */
const flatOf = (kind: SheetKind) =>
  kind === 'tail' ? tearPose(0, poseDials()) : sheetPose(1, poseDials());

/**
 * Round to the device's pixel grid.
 *
 * The page rect comes out of a viewport size and two dials, so it lands
 * wherever it lands, and half a device pixel of offset re-rasterises every run
 * of type on it. Snapping both edges costs at most half a pixel of position and
 * buys type that holds still through a resize.
 *
 * It is the RECT that is snapped, not a transform. The exit IS a transform, and
 * the text inside a transformed box does lose subpixel antialiasing — that is
 * acceptable there and only there, because the page is leaving and shrinking
 * and nobody is reading it.
 */
const snap = (v: number, dpr: number): number => Math.round(v * dpr) / dpr;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * DEV: the handle `scripts/pv-verify.mjs` drives the view through.
 *
 * The checks that matter here are ones only a browser can answer — do the
 * sheet's flat rect and the page's rect agree, does the swap show, is the
 * canvas really idle — and every one of them needs the track PARKED at an exact
 * position while it measures and screenshots. There is no other way in: the
 * position is not the scrollTop, and Lenis owns the scrollTop.
 *
 * `import.meta.env.DEV` is a literal, so the whole block leaves a production
 * build with the rest of the dead branch.
 */
export interface PortfolioProbe {
  track: () => Track | null;
  position: () => number;
  layout: () => TrackLayout | null;
  armed: () => boolean;
  /** The stretch of track section `k`'s sheet unrolls over, which is exactly its
   *  `enter` segment now that nothing overlaps. */
  enterWindow: (k: number) => { from: number; to: number } | null;
  /** …and the stretch of empty ground after section `k`'s tear. */
  dwellWindow: (k: number) => { from: number; to: number } | null;
  /** The tear's free corner, against where a flat sheet would put it. */
  cornerLift: () => CornerLift | null;
  /** Where the shader put the vertex at `(u, v)`, in screen pixels. */
  sheetPoint: (u: number, v: number) => { x: number; y: number } | null;
  /** Park the track at `y` and hold it there — the same lock the entrance uses,
   *  so neither the scroller nor Lenis moves it under the camera. */
  seek: (y: number) => void;
  /** Put the SCROLLER at `y` and let go. Unlike `seek` this is a real scroll,
   *  so the settle's idle timer starts counting exactly as it would after a
   *  wheel — which is the only way to check that a sheet left in mid-air
   *  finishes its entrance. */
  park: (y: number) => void;
  /** Whether Lenis is still moving the scroll — its own smoothing runs on well
   *  past the last wheel event, and the settle waits for it. */
  scrolling: () => boolean;
  /** Hand the position back to the scroller. */
  release: () => void;
  /** THE HAND-OFF INVARIANT: the flat plane's screen rect as three.js projects
   *  it, and the live page's own rect. They must agree to a pixel. */
  sheetRect: () => ScreenRect | null;
  pageRect: () => ScreenRect | null;
  /** Frames the canvas has painted. Must not move during a vertical run. */
  canvasFrames: () => number;
}

declare global {
  interface Window {
    __pv?: PortfolioProbe;
  }
}

export interface ScrollerHandle {
  /** Scroll the track to a section's page — what a letterhead number does, and
   *  what a deep link resolves to. */
  scrollToSection: (index: number) => void;
}

interface ScrollerProps {
  project: Project;
  /** 0-based section to open on (from `#view-NN/<section>`). */
  initialSection: number;
  /** The section being read changed — the hash and the letterhead follow it. */
  onSectionChange: (index: number) => void;
  /** The section on its way changed: the one the letterhead names dim while the
   *  ground is empty and while its sheet unrolls. Null once it has arrived. */
  onPendingChange: (index: number | null) => void;
}

export const Scroller = forwardRef<ScrollerHandle, ScrollerProps>(function Scroller(
  { project, initialSection, onSectionChange, onPendingChange },
  handleRef,
) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SheetCanvasHandle>(null);

  const trackRef = useRef<Track | null>(null);
  const pagesRef = useRef<HTMLElement[]>([]);
  /** Per page, the two parts the scroll loop writes to. Collected once rather
   *  than queried per frame. */
  const partsRef = useRef<{ scroll: HTMLElement; inner: HTMLElement }[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const activeRef = useRef(initialSection);
  /** The track position, which is NOT always the scroller's: the entrance runs
   *  it negative while the scroller sits at 0. */
  const positionRef = useRef(0);
  const introRef = useRef(false);
  const pageRectRef = useRef<ScreenRect | null>(null);
  /** The first-layout gate (rule 1 above). `armed` unlocks the scroller. */
  const readyRef = useRef({ fonts: false, measured: new Set<Element>(), armed: false, at: 0 });
  // Only read on the FIRST measure of a project; after that the position is
  // carried across from the previous track (see `measure`).
  const initialRef = useRef(initialSection);
  const reducedRef = useRef(false);
  /**
   * The 120ms crossfade at either end of a vertical run: which page, which way
   * round, which capture the sheet under it is wearing, and how far in. Null
   * when no swap is running.
   */
  const handoffRef = useRef<{
    index: number;
    into: 'page' | 'sheet';
    kind: SheetKind;
    scrollTop: number;
    alpha: number;
    raf: number;
  } | null>(null);
  /** What the last frame showed, so a hand-off fires once when it changes.
   *  `shown: -1` is "none — a sheet has it"; `-2` is "nothing has been painted
   *  yet", which must not count as a change. */
  const lastRef = useRef<{ shown: number; segment: string }>({ shown: -2, segment: 'page' });
  /** The section the letterhead is naming as pending, so it changes once. */
  const pendingRef = useRef<number | null>(null);

  const [armed, setArmed] = useState(false);
  // The scroller as a render input: the reveal observer and every block's
  // "am I on screen?" test need it as their root, and it only exists after the
  // first commit.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScroller(el);
  }, []);

  const changeRef = useRef(onSectionChange);
  const pendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    changeRef.current = onSectionChange;
    pendingChangeRef.current = onPendingChange;
    initialRef.current = initialSection;
  });

  // The two look values CSS cannot carry. A change to either means rebuilding
  // the Lenis instance, so they are the one piece of the dock's tuning that
  // goes through React rather than through a custom property.
  const [smoothing, setSmoothing] = useState({
    lerp: look.lenisLerp,
    wheel: look.wheelMultiplier,
  });

  useReveal(scroller, project.id);

  /**
   * Show one page, or none, and put the canvas where the track says.
   *
   * `visibility`, not `opacity`, for the page that is not showing: a
   * transparent page still composites and still runs its own animations, and
   * the whole claim of this view is that ONE SURFACE PAINTS AT A TIME — except
   * for `handoffMs` and the exit overlap.
   */
  const paint = useCallback(
    (showIndex: number, scrollTop: number, opacity: number, exiting: boolean) => {
      const pages = pagesRef.current;
      const parts = partsRef.current;
      for (let k = 0; k < pages.length; k++) {
        const el = pages[k];
        const live = k === showIndex && opacity > 0;
        const wasShown = el.style.visibility !== 'hidden';
        const wasExiting = el.hasAttribute('data-exiting');
        if (live) {
          el.style.visibility = '';
          el.style.opacity = opacity >= 1 ? '' : String(opacity);
          el.toggleAttribute('data-exiting', exiting);
          const scroll = parts[k]?.scroll;
          if (scroll && scroll.scrollTop !== scrollTop) scroll.scrollTop = scrollTop;
        } else if (wasShown) {
          el.style.visibility = 'hidden';
          el.style.opacity = '';
          el.toggleAttribute('data-exiting', false);
        }
        // A page that is out of the paint order is not out of an
        // IntersectionObserver's reckoning — `visibility` is not something it
        // notices — so a video under a sheet would keep decoding. Videos and
        // Rive listen for this and stop, and they stop at `p = 0` of a tear:
        // the page is still on screen for the 120ms of the swap, but nobody is
        // reading it.
        if (live !== wasShown || (live && exiting !== wasExiting)) {
          el.dispatchEvent(new CustomEvent('pv:shown', { bubbles: false }));
          if (!live || exiting) for (const v of el.querySelectorAll('video')) v.pause();
        }
      }
    },
    [],
  );

  /** One frame: the track position in, the whole view out. */
  const apply = useCallback(
    (position: number) => {
      const track = trackRef.current;
      const canvas = canvasRef.current;
      if (!track || pagesRef.current.length === 0) return;
      positionRef.current = position;

      const d = poseDials();
      const l = layout(track, position, d);
      const handoff = handoffRef.current;
      let shown: number;

      if (reducedRef.current) {
        // Reduced motion lands every section FLAT and keeps only the opacity of
        // the hand-off. No unroll, no peel, no dwell to speak of: the stretch
        // between one page and the next swaps at its midpoint and the 120ms
        // crossfade is all that covers the swap. Fading the two halves in and
        // out instead leaves the seam between them showing bare ground, which
        // is a worse thing to do to someone who asked for less movement.
        const at = positionAt(track, position);
        let scrollTop = at.offset;
        if (at.segment === 'page') {
          shown = at.section;
        } else if (at.segment === 'enter' && at.section === 0) {
          shown = 0;
          scrollTop = 0;
        } else {
          const from = at.segment === 'enter' ? at.section - 1 : at.section;
          const to = Math.min(from + 1, track.start.length - 1);
          const a = bottomOf(track, from);
          const b = track.start[to];
          const q = b > a ? clamp01((position - a) / (b - a)) : 1;
          shown = q < 0.5 ? from : to;
          scrollTop = shown === from ? track.pageScroll[from] : 0;
        }
        paint(shown, scrollTop, handoff ? handoff.alpha : 1, false);
        canvas?.hide();
      } else {
        shown = l.page ? l.page.index : -1;
        let scrollTop = l.page ? l.page.pose.scrollTop : 0;
        let opacity = l.page ? l.page.pose.opacity : 0;
        let exiting = false;

        if (handoff) {
          if (handoff.into === 'page') {
            // The ENTRANCE's swap: the page arrives over a flat sheet.
            opacity = handoff.alpha;
          } else {
            // The TEAR's swap, and the entrance's run backwards: the page
            // leaves over a flat sheet showing the same pixels. It is the
            // forward swap with the alpha the other way up, which is the only
            // honest way to reverse a crossfade — fading BOTH surfaces would
            // let the ground through between them.
            shown = handoff.index;
            scrollTop = handoff.scrollTop;
            opacity = 1 - handoff.alpha;
            exiting = true;
          }
        }
        paint(shown, scrollTop, opacity, exiting);

        if (handoff) canvas?.show(handoff.index, flatOf(handoff.kind));
        else if (l.sheet) canvas?.show(l.sheet.index, l.sheet.pose);
        else canvas?.hide();
      }

      if (l.activeIndex !== activeRef.current) {
        activeRef.current = l.activeIndex;
        changeRef.current(l.activeIndex);
      }
      if (l.pendingIndex !== pendingRef.current) {
        pendingRef.current = l.pendingIndex;
        pendingChangeRef.current(l.pendingIndex);
      }

      // THE TWO HAND-OFFS fire when the page being shown changes. Going
      // forward that is the moment an entrance ends and the moment a tear
      // begins; going back it is both of those in reverse. The first paint of
      // all is not a change.
      const last = lastRef.current;
      const nowShown = handoff ? last.shown : shown;
      if (!handoff && last.shown !== -2 && nowShown !== last.shown) {
        const kind: SheetKind = (l.segment === 'exit' || last.segment === 'exit') ? 'tail' : 'sheet';
        if (nowShown >= 0) startHandoffRef.current(nowShown, 'page', kind, 0);
        else if (last.shown >= 0) {
          startHandoffRef.current(last.shown, 'sheet', kind, track.pageScroll[last.shown]);
        }
      }
      if (!handoff) lastRef.current = { shown, segment: l.segment };
    },
    [paint],
  );

  /**
   * THE HAND-OFFS. The one trick the whole view rests on, and there are two of
   * them now — one at either end of a vertical run.
   *
   * FORWARD, at the end of an entrance: the HTML page fades in over the sheet
   * across `handoffMs` at the identical rect. REVERSE, at the start of a tear:
   * the same page fades out over a sheet wearing the section's LAST viewport,
   * and the peel takes over from there. Rewinding runs each of them the other
   * way. All four are the same plate-crossfade the reader uses for a page turn,
   * and they work for the same reason: two surfaces showing the same pixels,
   * one replacing the other, with no geometry in between.
   *
   * ONLY THE PAGE'S ALPHA MOVES. It would be tidier to describe this as "the
   * page fades out while the sheet fades in", and it would be wrong: two
   * surfaces at half alpha over a ground let a quarter of the ground through
   * between them, which is a flash of blue in the middle of the swap. The sheet
   * sits underneath at full alpha and the page dissolves off it.
   *
   * Which means the invariant has to hold BEFORE the fade starts. If the two
   * rects disagree the swap shows as a jump, and it shows at the corners, where
   * a one-pixel step against the ground is visible. The dev warning below fires
   * then, because a silent miss here looks like a rendering bug anywhere else
   * in the view.
   */
  const startHandoff = useCallback(
    (index: number, into: 'page' | 'sheet', kind: SheetKind, scrollTop: number) => {
      const canvas = canvasRef.current;
      if (handoffRef.current) cancelAnimationFrame(handoffRef.current.raf);

      const el = pagesRef.current[index];
      if (import.meta.env.DEV && el) {
        const sheet = canvas?.screenRect();
        const page = el.getBoundingClientRect();
        if (sheet && page) {
          const dx = Math.max(
            Math.abs(sheet.left - page.left),
            Math.abs(sheet.top - page.top),
            Math.abs(sheet.width - page.width),
            Math.abs(sheet.height - page.height),
          );
          if (dx > 1) {
            console.warn(
              `[pv:handoff] the sheet's flat rect and the page's are ${dx.toFixed(2)}px apart — ` +
                `the swap will show at the corners`,
            );
          }
        }
      }

      const ms = Math.max(1, look.handoffMs);
      const t0 = performance.now();
      const state = { index, into, kind, scrollTop, alpha: 0, raf: 0 };
      handoffRef.current = state;
      const frame = (now: number): void => {
        state.alpha = Math.min(1, (now - t0) / ms);
        if (state.alpha < 1) {
          state.raf = requestAnimationFrame(frame);
          apply(positionRef.current);
        } else {
          handoffRef.current = null;
          apply(positionRef.current);
        }
      };
      state.raf = requestAnimationFrame(frame);
      apply(positionRef.current);
    },
    [apply],
  );
  // `apply` starts a hand-off and the hand-off drives `apply`; one of the two
  // has to reach the other through a ref.
  const startHandoffRef = useRef(startHandoff);
  startHandoffRef.current = startHandoff;

  /**
   * Re-derive the track: the page rect from the viewport and two dials, the
   * page heights from the DOM. Runs on a resize AND whenever a page's content
   * settles — a late image extending one has to extend the track with it.
   *
   * The position is carried across SEMANTICALLY, never as a pixel offset. It
   * should never have to do anything (the blocks reserve their media boxes),
   * but a rebuild that moves the reader is the one failure this whole path
   * exists to prevent, so the dev log below shouts about it.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const stage = stageRef.current;
    const spacer = spacerRef.current;
    const parts = partsRef.current;
    if (!sc || !stage || !spacer || parts.length === 0) return;

    const previous = trackRef.current;
    const wasY = positionRef.current;
    const held: TrackPosition = previous
      ? positionAt(previous, wasY)
      : { section: initialRef.current, segment: 'page', offset: 0, p: 0 };

    // THE PAGE RECT: the viewport, less a margin on the sides, the letterhead
    // and a margin at the top, and a deeper FOOT at the bottom — the band the
    // close pill lives in. Both edges land on the device pixel grid.
    const dpr = window.devicePixelRatio || 1;
    const box = sc.getBoundingClientRect();
    const top = look.letterheadHPx + look.pageMarginPx;
    const left = snap(look.pageMarginPx, dpr);
    const right = snap(box.width - look.pageMarginPx, dpr);
    const head = snap(top, dpr);
    const foot = snap(box.height - look.pageFootPx, dpr);
    const rect: ScreenRect = {
      left,
      top: head,
      width: Math.max(1, right - left),
      height: Math.max(1, foot - head),
    };
    pageRectRef.current = rect;
    stage.style.setProperty('--pv-page-x', `${rect.left}px`);
    stage.style.setProperty('--pv-page-y', `${rect.top}px`);
    stage.style.setProperty('--pv-page-w', `${rect.width}px`);
    stage.style.setProperty('--pv-page-h', `${rect.height}px`);
    // The canvas takes the rect in viewport coordinates, so the fit is against
    // where the page actually is rather than where the stage thinks it is.
    canvasRef.current?.fit({
      left: box.left + rect.left,
      top: box.top + rect.top,
      width: rect.width,
      height: rect.height,
    });

    const track = buildTrack({
      heights: parts.map(({ inner }) => inner.getBoundingClientRect().height),
      pageHeight: rect.height,
      enterDistance: look.enterDistancePx,
      exitDistance: look.exitDistancePx,
      // Half a screen of empty ground, and the screen is the SCROLLER's, not
      // the page's: the dwell is a beat in the viewport's terms rather than a
      // proportion of whatever rect the page happens to have been given.
      dwellDistance: look.dwellVh * box.height,
    });
    trackRef.current = track;

    // The spacer is the only reason the scroller has anywhere to go: the whole
    // forward extent, since the sticky stage already occupies one viewport.
    spacer.style.height = `${Math.max(0, maxPosition(track))}px`;

    // Back into pixels against the NEW track, synchronously — there must be no
    // frame that paints the new starts against the old position.
    const position = resolve(track, held);
    const lenis = lenisRef.current;
    lenis?.resize();
    // Never touch the scroller while the entrance owns the position: it is at 0
    // and the track is somewhere behind it.
    if (!introRef.current && Math.abs(sc.scrollTop - position) > 0.5) {
      // Only when it actually moved: an unconditional `scrollTo` would kill the
      // in-flight smooth scroll on every no-op re-measure.
      if (lenis) lenis.scrollTo(position, { immediate: true, force: true });
      else sc.scrollTop = position; // the first measure runs before Lenis exists
    }
    apply(position);

    if (import.meta.env.DEV && previous) {
      const d = poseDials();
      const before = layout(previous, wasY, d).activeIndex;
      const after = layout(track, position, d).activeIndex;
      const heights = track.heights.map(Math.round);
      const was = previous.heights.map(Math.round);
      if (String(heights) !== String(was) || before !== after) {
        const line = `[pv:track] heights ${was} → ${heights}  section ${before} → ${after}`;
        // A rebuild that changes which section you are on is THE bug this is
        // here to catch: it means the reader was moved by something loading.
        if (before !== after) console.warn(`${line}  ← ACTIVE SECTION MOVED`);
        else console.log(line);
      }
    }
  }, [apply]);

  // Retuning the look in the dev dock changes the geometry the track was built
  // from — the page rect, the two distances, the overlap — so it has to
  // re-derive. The two values CSS cannot carry rebuild Lenis as well.
  useEffect(
    () =>
      subscribeLook((next) => {
        setSmoothing((current) =>
          current.lerp === next.lenisLerp && current.wheel === next.wheelMultiplier
            ? current
            : { lerp: next.lenisLerp, wheel: next.wheelMultiplier },
        );
        measure();
      }),
    [measure],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__pv = {
      track: () => trackRef.current,
      position: () => positionRef.current,
      layout: () =>
        trackRef.current ? layout(trackRef.current, positionRef.current, poseDials()) : null,
      armed: () => readyRef.current.armed,
      enterWindow: (k: number) => (trackRef.current ? enterWindow(trackRef.current, k) : null),
      cornerLift: () => canvasRef.current?.cornerLift() ?? null,
      sheetPoint: (u: number, v: number) => canvasRef.current?.sheetPoint(u, v) ?? null,
      dwellWindow: (k: number) => {
        const t = trackRef.current;
        if (!t) return null;
        const from = dwellStart(t, k);
        return { from, to: from + t.dwellDistance };
      },
      seek: (y: number) => {
        if (!trackRef.current) return;
        introRef.current = true;
        lenisRef.current?.stop();
        apply(y);
      },
      park: (y: number) => {
        introRef.current = false;
        lenisRef.current?.start();
        lenisRef.current?.scrollTo(y, { immediate: true, force: true });
      },
      scrolling: () => Boolean(lenisRef.current?.isScrolling),
      release: () => {
        introRef.current = false;
        if (readyRef.current.armed) lenisRef.current?.start();
      },
      sheetRect: () => canvasRef.current?.screenRect() ?? null,
      pageRect: () => {
        const live = pagesRef.current.find((el) => el.style.visibility !== 'hidden');
        if (!live) return null;
        const r = live.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      },
      canvasFrames: () => canvasRef.current?.frames() ?? 0,
    };
    return () => {
      delete window.__pv;
    };
  }, [apply]);

  /**
   * THE SETTLE. A sheet must never come to rest in mid-air.
   *
   * The position is 1:1 with the scroll, which is the whole point — the sheet
   * is exactly where the wheel put it — but it means the wheel can leave it
   * anywhere, including halfway off the ground with a fold across it, which is
   * not a state the view has. So when the scroll has been quiet for
   * `settleIdleMs`, `settleAt` says what move is part done and where it should
   * finish, and the track tweens there.
   *
   * WHICH END depends on the move, and `settleAt` is where that is decided: a
   * tear goes to its nearer end, a dwell and the entrance after it always go
   * forward. A rewind is the same mapping run backwards, so this catches those
   * too, at no cost.
   *
   * FOUR THINGS IT MUST NOT DO. It must not fire while the reader is still
   * scrolling — the idle timer is armed from the scroll itself, and Lenis emits
   * every frame while its own smoothing runs out, so the timer cannot fire
   * until the wheel and the lerp have both finished. It must not fire during
   * the entrance to the view (`introRef`), which owns the position. It must not
   * fire on top of a letterhead click, which is a tween with somewhere to be —
   * Lenis carries the `userData` of whatever asked for the scroll, so the click
   * tags itself and this reads the tag. And it must not fight the reader
   * afterwards: Lenis replaces a running `scrollTo` with the wheel's own the
   * moment one arrives.
   */
  const settleTimerRef = useRef(0);
  const trySettle = useCallback(() => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    if (!track || !lenis || introRef.current || !readyRef.current.armed) return;
    if (lenis.isScrolling) return;
    if ((lenis.userData as { pv?: string } | undefined)?.pv === 'letterhead') return;

    const plan = settleAt(track, positionRef.current);
    if (!plan) return;
    if (plan.p <= look.settleLow || plan.p >= look.settleHigh) return;

    lenis.scrollTo(Math.min(plan.target, maxPosition(track)), {
      duration: look.settleMs / 1000,
      easing: easeOutCubic,
      userData: { pv: 'settle' },
    });
  }, []);

  /** Restart the quiet-scroll countdown. Called from the scroll tick and from
   *  the wheel, so a gesture that moves nothing still counts as input. */
  const armSettle = useCallback(() => {
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(trySettle, look.settleIdleMs);
  }, [trySettle]);

  /** Hand the position over to the scroller and let the wheel move it. */
  const unlock = useCallback(() => {
    introRef.current = false;
    readyRef.current.armed = true;
    setArmed(true);
    lenisRef.current?.start();
  }, []);

  /**
   * Open the gate. The first layout is real, so build the track from it — and
   * then, on a fresh open, run the ENTRANCE: the track starts one entrance
   * BEFORE zero, which is section 0's sheet fully rolled and out of frame, and
   * the tween carries it up to the hand-off. Expressed as a position rather
   * than as an animation of its own, so the unroll you see on the way in is the
   * same unroll the wheel gives you later.
   *
   * A deep link skips it: `#view-02/3` is a request for a section, not for the
   * opening of a project, and lands flat on it with no entrance replay. So does
   * `prefers-reduced-motion`.
   */
  const arm = useCallback(() => {
    const ready = readyRef.current;
    if (ready.armed || introRef.current || !ready.fonts) return;
    if (partsRef.current.length === 0 || ready.measured.size < partsRef.current.length) return;
    measure();

    if (import.meta.env.DEV) {
      console.log(
        `[pv:track] armed in ${Math.round(performance.now() - ready.at)}ms  ` +
          `heights ${trackRef.current?.heights.map(Math.round)}`,
      );
    }

    const track = trackRef.current;
    if (!track || initialRef.current !== 0 || reducedRef.current) {
      unlock();
      return;
    }
    introRef.current = true;
    apply(minPosition(track));
    animate(minPosition(track), 0, {
      duration: look.riseMs / 1000,
      delay: look.riseDelayMs / 1000,
      ease: [0, 0, 0.2, 1],
      onUpdate: apply,
      onComplete: unlock,
    });
  }, [apply, measure, unlock]);

  // Collect the page elements and keep them measured. Re-runs when the project
  // changes, the only time the section count can change.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pages = Array.from(stage.querySelectorAll<HTMLElement>('.pv-page'));
    pagesRef.current = pages;
    partsRef.current = pages.map((page) => ({
      scroll: page.querySelector<HTMLElement>('.pv-page__scroll')!,
      inner: page.querySelector<HTMLElement>('.pv-page__inner')!,
    }));
    trackRef.current = null; // a different project: nothing to carry across
    activeRef.current = initialRef.current;
    positionRef.current = 0;
    introRef.current = false;
    lastRef.current = { shown: -2, segment: 'page' };
    pendingRef.current = null;
    readyRef.current = { fonts: false, measured: new Set(), armed: false, at: performance.now() };
    measure(); // provisional: lays the pages out, but the scroller stays locked

    // The gate: fonts resolved AND every page through at least one layout pass.
    // With the blocks reserving their media boxes this is a frame or two, but a
    // gate that can never open is worse than a slightly stale track, so it also
    // gives up after a second and arms anyway.
    void document.fonts.ready.then(() => {
      readyRef.current.fonts = true;
      arm();
    });
    const fallback = window.setTimeout(() => {
      if (readyRef.current.armed || introRef.current) return;
      if (import.meta.env.DEV) console.warn('[pv:track] first layout timed out — arming anyway');
      readyRef.current.fonts = true;
      readyRef.current.measured = new Set(partsRef.current.map((p) => p.inner));
      arm();
    }, 1000);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) readyRef.current.measured.add(entry.target);
      measure();
      arm();
    });
    for (const { inner } of partsRef.current) ro.observe(inner);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(fallback);
      if (handoffRef.current) cancelAnimationFrame(handoffRef.current.raf);
      handoffRef.current = null;
      ro.disconnect();
      window.removeEventListener('resize', measure);
      pagesRef.current = [];
      partsRef.current = [];
    };
  }, [project.id, measure, arm]);

  // Smoothing + the scroll tick. The native listener is kept alongside Lenis's
  // so a programmatic `scrollTop` (the re-measure above) is applied too.
  useEffect(() => {
    const sc = scrollerRef.current;
    const content = contentRef.current;
    if (!sc || !content) return;

    const onScroll = () => {
      if (!introRef.current) apply(sc.scrollTop);
      armSettle();
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    // A gesture that moves nothing — the wheel at either end of the track, a
    // trackpad's dying momentum — is still the reader's hand on the controls.
    sc.addEventListener('wheel', armSettle, { passive: true });
    sc.addEventListener('touchmove', armSettle, { passive: true });
    sc.addEventListener('keydown', armSettle);

    const lenis = new Lenis({
      wrapper: sc,
      content,
      lerp: smoothing.lerp,
      wheelMultiplier: smoothing.wheel,
      autoRaf: true,
    });
    lenisRef.current = lenis;
    // Locked until the first layout is real and the entrance has landed — Lenis
    // swallows the wheel while stopped, so there is no scroll to mis-resolve
    // against a guessed track or to fight the entrance for the position.
    if (!readyRef.current.armed) lenis.stop();
    const offScroll = lenis.on('scroll', onScroll);

    return () => {
      offScroll();
      lenis.destroy();
      lenisRef.current = null;
      window.clearTimeout(settleTimerRef.current);
      sc.removeEventListener('scroll', onScroll);
      sc.removeEventListener('wheel', armSettle);
      sc.removeEventListener('touchmove', armSettle);
      sc.removeEventListener('keydown', armSettle);
    };
  }, [apply, armSettle, smoothing]);

  /**
   * A letterhead number was clicked: scroll the track to that section's page.
   *
   * Which is the whole navigation, and it needs no special casing in either
   * direction — the track between here and there is the same track. Clicking a
   * number ahead runs forward through every page in between, each one tilting
   * away as the next unrolls; clicking one behind runs the same thing
   * backwards.
   */
  const scrollToSection = useCallback((index: number) => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    const sc = scrollerRef.current;
    if (!track || introRef.current) return;
    const target = Math.min(positionOf(track, index), maxPosition(track));
    if (lenis) {
      lenis.scrollTo(target, {
        duration: look.letterheadClickMs / 1000,
        // The dial's curve, not Lenis's default: a long rewind wants to arrive
        // slowly, and this is the one tween in the view a person watches.
        easing: easeOutCubic,
        // Tagged so the settle leaves it alone. Lenis clears `userData` when
        // the tween lands and replaces it when anything else — the reader's
        // wheel included — takes the scroll over, so the tag cannot get stuck.
        userData: { pv: 'letterhead' },
      });
    } else if (sc) {
      sc.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, []);

  useImperativeHandle(handleRef, () => ({ scrollToSection }), [scrollToSection]);

  return (
    <>
      {/* Before the scroller in the DOM, so the page paints OVER it: at the
          hand-off the page fades in on top of the sheet, and a canvas above it
          would hide the very thing arriving. */}
      <SheetCanvas
        ref={canvasRef}
        captures={project.sections.map((s) => ({ sheet: s.sheets, tail: s.tails }))}
      />
      <div className="pv-scroller" ref={attachScroller} data-locked={armed ? undefined : ''}>
        <ScrollerContext.Provider value={scroller}>
          <div className="pv-content" ref={contentRef}>
            <div className="pv-stage" ref={stageRef}>
              {project.sections.map((section, k) => (
                <SectionPage key={k} section={section} index={k} />
              ))}
            </div>
            <div className="pv-spacer" ref={spacerRef} aria-hidden="true" />
          </div>
        </ScrollerContext.Provider>
      </div>
    </>
  );
});
