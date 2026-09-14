import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { animate } from 'motion';
import { FolderStack } from './FolderStack';
import { look, subscribeLook } from './portfolioMotion';
import {
  bottomOf,
  buildTrack,
  cabinetTop,
  columnOf,
  folderClipPath,
  layout,
  maxPosition,
  minPosition,
  pageTop,
  positionAt,
  positionOf,
  resolve,
  rowOf,
} from './pageTrack';
import type { FootRun, Track, TrackLayout, TrackPosition } from './pageTrack';
import { ScrollerContext } from './scroller';
import { useReveal } from './useReveal';
import type { Project } from './blocks/types';

/**
 * The sheet: the pane that slides in from the right, and the ONE scroller that
 * drives the whole project.
 *
 * The page itself cannot scroll — `body` is locked to a single viewport and the
 * grid must not move while a project is open — so the sheet brings its own: a
 * full-height box with a hidden scrollbar and a spacer sized to the track's
 * length. That scroller's position IS the track position. Every tick it goes
 * through `pageTrack`'s `layout()` and comes back out as a top, a height and a
 * z-index per folder, which is how one wheel gesture carries you down a folder,
 * brings the next one over or up, and carries on down that, with no mode and no
 * state machine in between.
 *
 * Everything here is imperative on purpose: scrolling writes geometry straight
 * to the DOM. The only React state is the scroller ELEMENT (the observers need
 * it as a root) and the armed flag.
 *
 * Smoothing is Lenis, scoped to this scroller via its `wrapper`/`content`
 * options — the grid keeps its own feel entirely. Lenis honours
 * `prefers-reduced-motion` itself by dropping to 1:1.
 *
 * THE POSITION IS NOT THE SCROLLTOP. It usually is, but the entrance runs the
 * track from `-turnDistance` to 0 — the first row rising out of the pile before
 * there is anything to scroll — and a scroller cannot go negative. So the
 * position lives in `positionRef`, the scroller is one way of driving it, and
 * the intro tween is another.
 *
 * TWO RULES keep the track honest, and both exist because it is derived from
 * MEASURED folder heights:
 *
 *  1. The scroller stays LOCKED until the first layout is real — fonts ready
 *     and every folder measured at least once. Before that the heights are a
 *     guess, and a guess you can scroll is a guess that throws you onto the
 *     wrong folder.
 *  2. A rebuild preserves the SEMANTIC position (folder, offset, turn
 *     progress), never the pixel one. A folder growing moves every start behind
 *     it, so the same `y` is a different place; `positionAt` → `resolve`
 *     carries the reader across instead, in the same frame as the change.
 *
 * Neither should ever have to do any work: the blocks reserve their media boxes
 * from intrinsic sizes, so a folder's height is the same before and after its
 * assets load. They are here because "should" is not a guarantee.
 */

/**
 * What a folder's strip spends on things other than the title: the air above
 * and below the line. Fixed rather than scaled — scaled, it would vanish on a
 * laptop — which is why the title has to be FITTED to what is left of the strip
 * rather than simply scaled with everything else.
 */
const STRIP_CHROME = 8;

/** Smallest a folder's title may be fitted to before legibility beats layout. */
const MIN_TITLE_PX = 12;

/** The tab-click tween's curve — decelerating, so a long rewind settles. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Which of a folder's three outlines it is wearing. The page's foot depends on
 * what is still in the pile, and a turn takes one folder out of it, so the
 * folder UNDER a rising one needs an outline of its own — see `measure`.
 */
type ShapeState = 'closed' | 'open' | 'turning';

/**
 * Round to the device's pixel grid.
 *
 * A folder's top is a fraction of a scaled row pitch, so it lands wherever it
 * lands, and the strip's title and the page's first lines re-rasterise at a
 * different subpixel offset on every frame of a rise: the type crawls. Snapping
 * the slot's top AND bottom to real pixels costs at most half a device pixel of
 * position and buys type that holds still.
 *
 * It is the TOP that is snapped, not a transform. Moving the folder by
 * `translateY` instead was measured: the glass survives it, but the text inside
 * a transformed box loses subpixel antialiasing and every run of type on the
 * sheet comes back lighter. The height has to be written per frame either way,
 * so there is no layout saved to pay for that.
 */
const snap = (v: number, dpr: number): number => Math.round(v * dpr) / dpr;

/** A folder's current outline, as the DOM records it. */
function shapeStateOf(el: HTMLElement): ShapeState {
  return (el.dataset.shape as ShapeState) ?? 'closed';
}

/** The state a folder's outline should be in this frame. */
function shapeStateFor(l: TrackLayout, k: number): ShapeState {
  if (!l.folders[k].bodyVisible) return 'closed';
  // The one in the air wears its own outline; the one it is rising off wears
  // the outline that fills the slot being vacated.
  return l.turning && k !== l.topIndex ? 'turning' : 'open';
}

/**
 * DEV: the painting invariant, checked rather than assumed.
 *
 * Every folder paints its own slot and nothing else — on glass that is not an
 * optimisation but the difference between a stack and a smear, because a
 * `backdrop-filter` samples whatever is behind it. Slots in a column now
 * OVERLAP by exactly one tab: a folder runs down to the body of the row in
 * front so that its own body fills the notch beside that row's tab rather than
 * leaving glass there, and the row in front (higher index, higher z) covers the
 * rest. Any more than a tab of overlap is two folders sharing a band, which is
 * the smear. The geometry is unit-tested; this asks the browser whether it made
 * it to the screen intact.
 */
function assertSlotsTile(stack: HTMLElement, tabHeight: number): void {
  // The outline is a `clip-path`, and an invalid one is not an error — the
  // declaration is simply dropped and every folder paints as a full-width
  // rectangle. Only the browser can say whether the string it was given was
  // one it would take, so ask it; a unit test on the string cannot.
  for (const shape of stack.querySelectorAll<HTMLElement>('.pv-folder__shape')) {
    if (getComputedStyle(shape).clipPath === 'none') {
      console.error(
        `[pv:stack] folder ${shape.parentElement?.dataset.k} has no clip — the browser ` +
          `rejected ${JSON.stringify(shape.style.clipPath)}`,
      );
      break;
    }
  }

  // `offsetTop`/`offsetHeight`, not the client rect: a hovered folder is lifted
  // by a transform, and a lift is not an overlap.
  const rects = Array.from(stack.querySelectorAll<HTMLElement>('.pv-folder')).map((el) => ({
    k: el.dataset.k,
    side: el.dataset.side,
    r: { top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight },
  }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      // Two folders of the same row share a band by design: the tab halves sit
      // side by side in it and their outlines tile (see `folderClipPath`).
      if (a.side !== b.side) continue;
      const overlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      // `offsetTop`/`offsetHeight` are integers and the geometry is not, so the
      // slack is two: one for each rounded edge of the band.
      if (overlap > tabHeight + 2) {
        console.error(
          `[pv:stack] folders ${a.k} and ${b.k} overlap by ${Math.round(overlap)}px — ` +
            `a tab (${Math.round(tabHeight)}px) is the most a row may reach into the next`,
        );
        return;
      }
    }
  }
}

/**
 * DEV: the handle `scripts/pv-verify.mjs` drives the view through.
 *
 * The checks that matter here are ones only a browser can answer — did the clip
 * take, is there glass between two rows, is the page where it will be a frame
 * before it lands — and every one of them needs the track PARKED at an exact
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
  /** Park the track at `y` and hold it there — the same lock the entrance uses,
   *  so neither the scroller nor Lenis moves it under the camera. */
  seek: (y: number) => void;
  /** Put the SCROLLER at `y` and let go. Unlike `seek` this is a real scroll,
   *  so the settle's idle timer starts counting exactly as it would after a
   *  wheel — which is the only way to check that a folder left in mid-air
   *  finishes its turn. */
  park: (y: number) => void;
  /** Whether Lenis is still moving the scroll — its own smoothing runs on well
   *  past the last wheel event, and the settle waits for it. */
  scrolling: () => boolean;
  /** Hand the position back to the scroller. */
  release: () => void;
}

declare global {
  interface Window {
    __pv?: PortfolioProbe;
  }
}

interface SheetProps {
  project: Project;
  /** 0-based folder to open on (from `#view-NN/<section>`). */
  initialSection: number;
  /** The folder being read changed — the hash follows it. */
  onSectionChange: (index: number) => void;
}

export function Sheet({ project, initialSection, onSectionChange }: SheetProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const trackRef = useRef<Track | null>(null);
  const foldersRef = useRef<HTMLElement[]>([]);
  /** Per folder, the parts the scroll loop writes to, and the two outlines it
   *  swaps between. Collected once rather than queried per frame; the outlines
   *  are re-cut on a measure, never on a frame. */
  const partsRef = useRef<
    {
      body: HTMLElement;
      inner: HTMLElement;
      shape: HTMLElement;
      strip: HTMLElement;
      closed: string;
      open: string;
      turning: string;
    }[]
  >([]);
  const lenisRef = useRef<Lenis | null>(null);
  const activeRef = useRef(initialSection);
  /** The track position, which is NOT always the scroller's: the entrance runs
   *  it negative while the scroller sits at 0. */
  const positionRef = useRef(0);
  const introRef = useRef(false);
  /** The first-layout gate (rule 1 above). `armed` unlocks the scroller. */
  const readyRef = useRef({ fonts: false, measured: new Set<Element>(), armed: false, at: 0 });
  // Only read on the FIRST measure of a project; after that the position is
  // carried across from the previous track (see `measure`).
  const initialRef = useRef(initialSection);

  // False until the first layout is real AND the entrance has landed. Rendered
  // as `data-locked`, which takes the scroller out of overflow entirely:
  // stopping Lenis is not enough on its own, because Lenis is created in a
  // passive effect and the scroller scrolls NATIVELY in the frames before that.
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
  useEffect(() => {
    changeRef.current = onSectionChange;
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

  /** One frame: the track position in, the pile's whole arrangement out. */
  const apply = useCallback((position: number) => {
    const track = trackRef.current;
    const folders = foldersRef.current;
    if (!track || folders.length === 0) return;
    positionRef.current = position;

    const l = layout(track, position);
    const parts = partsRef.current;
    const dpr = window.devicePixelRatio || 1;
    let hovering = false;
    for (let k = 0; k < folders.length; k++) {
      const el = folders[k];
      const f = l.folders[k];
      const part = parts[k];
      // Both edges on the pixel grid, and the height derived from the snapped
      // top rather than snapped on its own — the foot of a page is pinned to
      // the pile, and rounding the two independently would let it drift a
      // pixel off the tab it is supposed to meet.
      const top = snap(f.top, dpr);
      el.style.top = `${top}px`;
      el.style.height = `${snap(f.top + f.clipHeight, dpr) - top}px`;
      el.style.zIndex = String(f.zIndex);
      el.toggleAttribute('data-top', k === l.topIndex);
      el.toggleAttribute('data-active', k === l.activeIndex);

      // HOVER SURVIVES A FOLDER MOVING OUT FROM UNDER THE POINTER. A pointer
      // that has not moved gets no `pointerleave` when the thing beneath it
      // does, so a folder hovered as the entrance lifted it kept the flag and
      // left the whole pile dimmed behind a folder that was no longer a place
      // to go. Anything that has become a page is no longer hoverable, so the
      // flag comes off here; `data-hovering` follows whether ANY is left.
      if (el.hasAttribute('data-hover')) {
        if (f.bodyVisible) el.toggleAttribute('data-hover', false);
        else hovering = true;
      }

      // The outline gains the full-width page when the folder opens, changes
      // its foot when the folder above it leaves the pile, and loses the page
      // again when it files. Swapped here rather than re-cut per frame: the
      // page's HEIGHT is the wrapper's business, and only the shape changes.
      el.toggleAttribute('data-open', f.bodyVisible);
      const state = shapeStateFor(l, k);
      if (part && state !== shapeStateOf(el)) {
        el.dataset.shape = state;
        part.shape.style.clipPath = part[state];
      }

      const body = part?.body;
      if (!body) continue;
      if (body.scrollTop !== f.scrollTop) body.scrollTop = f.scrollTop;
      // A folder that is filed is clipped to its strip anyway, but `overflow`
      // is not something IntersectionObserver notices — a video in a folder
      // that had gone back into the pile would keep decoding behind it.
      const shown = f.bodyVisible;
      if (shown !== (body.style.visibility !== 'hidden')) {
        body.style.visibility = shown ? '' : 'hidden';
        if (shown) body.dispatchEvent(new CustomEvent('pv:shown', { bubbles: false }));
        else for (const video of body.querySelectorAll('video')) video.pause();
      }
    }

    stackRef.current?.toggleAttribute('data-hovering', hovering);

    if (l.activeIndex !== activeRef.current) {
      activeRef.current = l.activeIndex;
      changeRef.current(l.activeIndex);
    }
  }, []);

  /**
   * Re-derive the track: folder heights, the sheet's box, the row pitch and the
   * turn distance, all measured or dialled rather than assumed. Runs on a
   * resize AND whenever a folder's content settles — a late image extending one
   * has to extend the track with it.
   *
   * The position is carried across SEMANTICALLY — the folder, how far down it,
   * and how far through a turn — never as a pixel offset. See `positionAt` /
   * `resolve`. It should never have to do anything (the blocks reserve their
   * media boxes), but a rebuild that moves the reader is the one failure this
   * whole path exists to prevent, so the dev log below shouts about it.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const stack = stackRef.current;
    const spacer = spacerRef.current;
    const folders = foldersRef.current;
    if (!sc || !stack || !spacer || folders.length === 0) return;

    const previous = trackRef.current;
    const wasY = positionRef.current;
    // Where the reader is, in the project's terms — not in pixels, which the
    // rebuild is about to redefine.
    const held: TrackPosition = previous
      ? positionAt(previous, wasY)
      : { section: initialRef.current, offset: 0, turn: null };

    // The reference is measured at one width; everything about a folder — how
    // tall its body is, how wide its tab, how far the rows step — is a
    // proportion of the sheet rather than a fixed number of pixels, so the
    // cabinet keeps its shape at any size.
    const sheetWidth = stack.getBoundingClientRect().width;
    const scale = sheetWidth / look.referenceSheetPx;
    const g = {
      tabH: look.tabHPx * scale,
      tabW: look.tabWPx * scale,
      chamfer: look.chamferPx * scale,
      strip: look.stripHPx * scale,
      rowPitch: look.rowPitchPx * scale,
    };

    // The page's foot is per column now, so the track needs the column geometry
    // that used to live only down here.
    const splits: [number, number] = [look.splitA / 100, look.splitB / 100];

    const track = buildTrack({
      heights: partsRef.current.map(({ inner }) => inner.getBoundingClientRect().height),
      viewportHeight: sc.clientHeight,
      rowPitch: g.rowPitch,
      strip: g.strip,
      tabHeight: g.tabH,
      sheetWidth,
      splits,
      turnDistance: look.turnDistancePx,
      easeRise: look.easeRise,
    });
    trackRef.current = track;

    // Published rather than recomputed in CSS, so the DOM and the track cannot
    // disagree by a rounding step.
    stack.style.setProperty('--pv-row-pitch', `${g.rowPitch}px`);
    stack.style.setProperty('--pv-tab-h', `${g.tabH}px`);
    stack.style.setProperty('--pv-strip-h', `${g.strip}px`);
    // The title has to fit the STRIP, whatever the dial says: rows this compact
    // leave no room for a line that overflows, and the folder in front would
    // slice it in half.
    const titleSize = Math.max(
      MIN_TITLE_PX,
      Math.min(look.titleSizePx * scale, g.strip - STRIP_CHROME),
    );
    stack.style.setProperty('--pv-title', `${titleSize}px`);
    stack.style.setProperty(
      '--pv-header-title',
      `${look.headerTitlePx * scale * look.headerScale}px`,
    );
    // The page's gutter is a folder length like any other, so it scales; the
    // page's INSET is not, because the strip's text inset it lines up with is
    // a fixed number of pixels (see `portfolioMotion`).
    stack.style.setProperty('--pv-grid-gap', `${look.gridGapPx * scale}px`);

    // The columns alternate row by row — an even row splits evenly, an odd one
    // does not — so the cabinet never reads as a table.
    partsRef.current.forEach((part, k) => {
      const { left, right } = columnOf(k, folders.length, sheetWidth, splits);
      // Where this folder's page begins is a question of which column it is in
      // — see `pageTop` — and the answer has to be the same one the track used
      // to size the page, or the glass and the content disagree by a hair.
      const bodyTop = pageTop(g.tabH, g.strip, k);
      const top = cabinetTop(g.tabH, g.rowPitch, rowOf(k));
      /** The track's foot is in the SHEET's coordinates; the clip is in the
       *  folder's, and a docked folder's own top is where the two differ. */
      const local = (runs: FootRun[]): FootRun[] =>
        runs.map(({ x, y }) => ({ x, y: y - top }));
      const shape = {
        left,
        right,
        sheetWidth,
        tabWidth: g.tabW,
        tabHeight: g.tabH,
        chamfer: g.chamfer,
        // The element clips a folder to whatever slot the track gives it this
        // frame, so the closed outline only has to be long enough never to be
        // the shorter of the two — a column of the pile that runs out early
        // hands the folder above it everything down to the foot of the sheet.
        closedHeight: sc.clientHeight,
        bodyTop,
        foot: local(track.foot[k]),
      };
      // THREE outlines up front, because a page's foot depends on what is still
      // in the pile and a turn takes one folder out of it. `apply` swaps
      // between them once a turn rather than once a frame.
      part.closed = folderClipPath(shape, false);
      part.open = folderClipPath(shape, true);
      // The same folder while the next one is in the air: the pile it stops at
      // is the pile MINUS that folder, which is exactly the next folder's own
      // foot. This is what fills the column the riser vacates.
      part.turning =
        k + 1 < track.foot.length
          ? folderClipPath({ ...shape, foot: local(track.foot[k + 1]) }, true)
          : part.open;
      part.shape.style.clipPath = part[shapeStateOf(folders[k])];

      part.strip.style.left = `${left}px`;
      part.strip.style.width = `${right - left}px`;
      // As tall as the folder SHOWS, not as tall as it paints: the row in front
      // covers the notch below, and a hit area you cannot see is a trap. The
      // LABEL inside it is the strip proper (`--pv-strip-h`).
      part.strip.style.height = `${g.rowPitch}px`;
      part.body.style.top = `${bodyTop}px`;
      part.body.style.height = `${track.openBody[k]}px`;
    });
    // The spacer is the only reason the scroller has anywhere to go: the track's
    // length minus the one viewport the sticky stage already occupies.
    spacer.style.height = `${Math.max(0, track.length - track.viewportHeight)}px`;

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
      const before = layout(previous, wasY).activeIndex;
      const after = layout(track, position).activeIndex;
      const heights = track.pageScroll.map((v, i) => Math.round(v + track.openBody[i]));
      const was = previous.pageScroll.map((v, i) => Math.round(v + previous.openBody[i]));
      if (String(heights) !== String(was) || before !== after) {
        const line = `[pv:track] heights ${was} → ${heights}  folder ${before} → ${after}`;
        // A rebuild that changes which folder you are on is THE bug this is
        // here to catch: it means the reader was moved by something loading.
        if (before !== after) console.warn(`${line}  ← ACTIVE FOLDER MOVED`);
        else console.log(line);
      }
    }
  }, [apply]);

  // Retuning the look in the dev dock changes the geometry the track was built
  // from — the row pitch, the turn distance, the tab — so it has to re-derive.
  // The two values CSS cannot carry rebuild the Lenis instance as well.
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
      layout: () => (trackRef.current ? layout(trackRef.current, positionRef.current) : null),
      armed: () => readyRef.current.armed,
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
    };
    return () => {
      delete window.__pv;
    };
  }, [apply]);

  /**
   * THE SETTLE. A folder must never come to rest in mid-air.
   *
   * The rise is 1:1 with the scroll and linear, which is the whole point — the
   * folder is exactly where the wheel put it — but it means the wheel can leave
   * it anywhere, including halfway between the pile and the cabinet, which is
   * not a state the cabinet has. So when the scroll has been quiet for
   * `settleIdleMs` with a turn part done, the track tweens to the nearer end of
   * it: back to the foot of the page you were reading, or on to the top of the
   * next one.
   *
   * A rewind is a turn run backwards, so this catches those too, at no cost.
   *
   * FOUR THINGS IT MUST NOT DO. It must not fire while the reader is still
   * scrolling — the idle timer is armed from the scroll itself, and Lenis emits
   * every frame while its own smoothing runs out, so the timer cannot fire
   * until the wheel and the lerp have both finished. It must not fire during
   * the entrance (`introRef`), which owns the position. It must not fire on top
   * of a tab click, which is a tween with somewhere to be — Lenis carries the
   * `userData` of whatever asked for the scroll, so the click tags itself and
   * this reads the tag. And it must not fight the reader afterwards: Lenis
   * replaces a running `scrollTo` with the wheel's own the moment one arrives.
   */
  const settleTimerRef = useRef(0);
  const trySettle = useCallback(() => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    if (!track || !lenis || introRef.current || !readyRef.current.armed) return;
    if (lenis.isScrolling) return;
    if ((lenis.userData as { pv?: string } | undefined)?.pv === 'sliver') return;

    const at = positionAt(track, positionRef.current);
    const p = at.turn;
    if (p === null || at.section < 0) return;
    if (p <= look.settleLow || p >= look.settleHigh) return;

    const back = track.start[at.section] + track.pageScroll[at.section];
    const target = Math.min(p < 0.5 ? back : back + track.turnDistance, maxPosition(track));
    lenis.scrollTo(target, {
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
    if (import.meta.env.DEV) {
      const stack = stackRef.current;
      const track = trackRef.current;
      if (stack && track) assertSlotsTile(stack, track.tabHeight);
    }
  }, []);

  /**
   * Open the gate. The first layout is real, so build the track from it — and
   * then, on a fresh open, run the ENTRANCE: the track starts one turn BEFORE
   * zero, which is row 0 still down in the pile, and the tween carries it up to
   * its slot. Expressed as a position rather than as an animation of its own,
   * so the rise you see on the way in is the same rise the wheel gives you
   * later, and scrolling back up re-runs it.
   *
   * A deep link skips it: `#view-02/4` is a request for a particular folder,
   * not for the opening of the project.
   */
  const arm = useCallback(() => {
    const ready = readyRef.current;
    if (ready.armed || introRef.current || !ready.fonts) return;
    if (foldersRef.current.length === 0 || ready.measured.size < foldersRef.current.length) return;
    measure();

    if (import.meta.env.DEV) {
      const heights = trackRef.current?.pageScroll.map((v, i) =>
        Math.round(v + (trackRef.current?.openBody[i] ?? 0)),
      );
      console.log(
        `[pv:track] armed in ${Math.round(performance.now() - ready.at)}ms  heights ${heights}`,
      );
    }

    const track = trackRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!track || initialRef.current !== 0 || reduced) {
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

  // Collect the folder elements and keep them measured. Re-runs when the
  // project changes, the only time the folder count can change.
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const folders = Array.from(stack.querySelectorAll<HTMLElement>('.pv-folder'));
    foldersRef.current = folders;
    partsRef.current = folders.map((folder) => ({
      body: folder.querySelector<HTMLElement>('.pv-folder__content')!,
      inner: folder.querySelector<HTMLElement>('.pv-folder__inner')!,
      shape: folder.querySelector<HTMLElement>('.pv-folder__shape')!,
      strip: folder.querySelector<HTMLElement>('.pv-folder__strip')!,
      closed: '',
      open: '',
      turning: '',
    }));
    trackRef.current = null; // a different project: nothing to carry across
    activeRef.current = initialRef.current;
    positionRef.current = 0;
    introRef.current = false;
    readyRef.current = { fonts: false, measured: new Set(), armed: false, at: performance.now() };
    measure(); // provisional: arranges the pile, but the scroller stays locked

    // The gate: fonts resolved AND every folder through at least one layout
    // pass. With the blocks reserving their media boxes this is a frame or two,
    // but a gate that can never open is worse than a slightly stale track, so
    // it also gives up after a second and arms anyway.
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
      ro.disconnect();
      window.removeEventListener('resize', measure);
      foldersRef.current = [];
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
   * A tab was clicked: scroll the track to that folder's TOP.
   *
   * Which is the whole navigation, and it needs no special casing in either
   * direction — the track between here and there is the same track. Clicking a
   * tab in the unread pile runs forward through every folder in between, rows
   * rising and carrying their pages up in sequence; clicking one in the read
   * pile runs the same thing backwards.
   *
   * `sliverReturn: 'bottom'` lands on the line you left instead. Shorter, less
   * of a performance; the dial is there to A/B them.
   */
  const scrollToSection = useCallback((index: number) => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    const sc = scrollerRef.current;
    if (!track || introRef.current) return;
    const target =
      look.sliverReturn === 'bottom' ? bottomOf(track, index) : positionOf(track, index);
    if (lenis) {
      lenis.scrollTo(Math.min(target, maxPosition(track)), {
        duration: look.sliverClickMs / 1000,
        // The dial's curve, not Lenis's default: a long rewind wants to arrive
        // slowly, and this is the one tween in the view a person watches.
        easing: easeOutCubic,
        // Tagged so the settle leaves it alone. Lenis clears `userData` when
        // the tween lands and replaces it when anything else — the reader's
        // wheel included — takes the scroll over, so the tag cannot get stuck.
        userData: { pv: 'sliver' },
      });
    } else if (sc) {
      sc.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="pv-sheet">
      <div className="pv-scroller" ref={attachScroller} data-locked={armed ? undefined : ''}>
        <ScrollerContext.Provider value={scroller}>
          <div className="pv-content" ref={contentRef}>
            <div className="pv-stage">
              <FolderStack project={project} stackRef={stackRef} onSelect={scrollToSection} />
            </div>
            <div className="pv-spacer" ref={spacerRef} aria-hidden="true" />
          </div>
        </ScrollerContext.Provider>
      </div>
    </div>
  );
}
