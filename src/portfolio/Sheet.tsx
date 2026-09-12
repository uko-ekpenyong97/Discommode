import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { Notebook } from './Notebook';
import { look, subscribeLook } from './portfolioMotion';
import {
  bottomOf,
  buildTrack,
  fitTabHeight,
  glassClipPath,
  layout,
  positionAt,
  positionOf,
  resolve,
  tabTopFor,
} from './pageTrack';
import type { Track, TrackPosition } from './pageTrack';
import { ScrollerContext } from './scroller';
import { useDismissOnGlass } from './useDismissOnGlass';
import { useReveal } from './useReveal';
import type { Project } from './blocks/types';

/**
 * The sheet: the pane that slides in from the right, and the ONE scroller that
 * drives the whole project.
 *
 * The page itself cannot scroll — `body` is locked to a single viewport and the
 * grid must not move while a project is open — so the sheet brings its own: a
 * 100vh box with a hidden scrollbar and a spacer sized to the track's length.
 * That scroller's position IS the track position. Every tick it goes through
 * `pageTrack`'s `layout()` and comes back out as a `scrollTop`, a `translateX`
 * and a z-index per section, which is how one wheel gesture carries you down a
 * section, turns the next one in over it, and carries on down that, with no
 * mode and no state machine in between.
 *
 * Everything here is imperative on purpose: scrolling writes transforms and
 * scroll offsets straight to the DOM. The only React state is the scroller
 * ELEMENT (the observers need it as a root) and the armed flag.
 *
 * Smoothing is Lenis, scoped to this scroller via its `wrapper`/`content`
 * options — the grid keeps its own feel entirely. Lenis honours
 * `prefers-reduced-motion` itself by dropping to 1:1.
 *
 * TWO RULES keep the track honest, and both exist because the track is derived
 * from MEASURED section heights:
 *
 *  1. The scroller stays LOCKED until the first layout is real — fonts ready
 *     and every section measured at least once. Before that the heights are a
 *     guess, and a guess you can scroll is a guess that throws you onto the
 *     wrong section.
 *  2. A rebuild preserves the SEMANTIC position (section, offset, turn
 *     progress), never the pixel one. A section growing moves every start
 *     behind it, so the same `y` is a different place; `positionAt` → `resolve`
 *     carries the reader across instead, in the same frame as the change.
 *
 * Neither should ever have to do any work: the blocks reserve their media boxes
 * from intrinsic sizes, so a section's height is the same before and after its
 * assets load. They are here because "should" is not a guarantee.
 */

/** The tab-click tween's curve — decelerating, so a long rewind settles. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * DEV: the tuck seam, checked rather than assumed.
 *
 * Every tab must be BELOW every section, always — that is what lets a tab run
 * under the page's edge and read as a divider going into the book instead of a
 * button sitting on it. The rule is two `z-index` declarations (`.pv-tabs` at 0,
 * `.pv-pages` at 1), which is easy to keep true and easy to break from a
 * distance with a stray stacking context. So this asks the browser: a couple of
 * pixels INSIDE the page edge, at each tab's own height, what is on top?
 */
function assertTabsBehind(book: HTMLElement): void {
  const pages = book.querySelector<HTMLElement>('.pv-pages');
  if (!pages) return;
  const seam = pages.getBoundingClientRect();

  for (const tab of book.querySelectorAll<HTMLElement>('.pv-tab')) {
    const r = tab.getBoundingClientRect();
    if (r.height === 0) continue; // hidden: this section is carrying its flap
    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
    if (document.elementFromPoint(seam.left + 2, y)?.closest('.pv-tab')) {
      console.error(`[pv:tabs] tab ${tab.dataset.k} is painting OVER the page at the tuck seam`);
      return;
    }
  }

  // And the junction the flap makes with its page: both sides of the page's
  // left edge have to be the SAME section, or they are two surfaces pretending.
  const flap = book.querySelector<HTMLElement>('.pv-section[data-top] .pv-flap');
  if (!flap) return;
  const f = flap.getBoundingClientRect();
  const y = Math.min(Math.max(f.top + f.height / 2, 1), window.innerHeight - 1);
  const left = document.elementFromPoint(seam.left - 2, y)?.closest('.pv-section');
  const right = document.elementFromPoint(seam.left + 2, y)?.closest('.pv-section');
  if (!left || left !== right) {
    console.error('[pv:tabs] the flap and its page are not the same section at the junction');
  }
}

interface SheetProps {
  project: Project;
  /** 0-based section to open on (from `#view-NN/<section>`). */
  initialSection: number;
  /** The section being read changed — the hash follows it. */
  onSectionChange: (index: number) => void;
  /** A click landed on glass rather than on the book: leave the view. */
  onDismiss: () => void;
}

export function Sheet({ project, initialSection, onSectionChange, onDismiss }: SheetProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const trackRef = useRef<Track | null>(null);
  const sectionsRef = useRef<HTMLElement[]>([]);
  /** Per section, the parts the scroll loop writes to. Collected once rather
   *  than queried per frame. */
  const partsRef = useRef<{ scroll: HTMLElement; inner: HTMLElement; glass: HTMLElement }[]>([]);
  const tabsRef = useRef<HTMLElement[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const activeRef = useRef(initialSection);
  /** The first-layout gate (rule 1 above). `armed` unlocks the scroller. */
  const readyRef = useRef({ fonts: false, measured: new Set<Element>(), armed: false, at: 0 });
  // Only read on the FIRST measure of a project; after that the position is
  // carried across from the previous track (see `measure`).
  const initialRef = useRef(initialSection);

  // False until the first layout is real. Rendered as `data-locked`, which
  // takes the scroller out of overflow entirely: stopping Lenis is not enough
  // on its own, because Lenis is created in a passive effect and the scroller
  // scrolls NATIVELY in the frames before that.
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
  const dismiss = useDismissOnGlass(onDismiss);

  /** One frame: the track position in, the notebook's whole arrangement out. */
  const apply = useCallback((position: number) => {
    const track = trackRef.current;
    const sections = sectionsRef.current;
    if (!track || sections.length === 0) return;

    const l = layout(track, position);
    const parts = partsRef.current;
    for (let j = 0; j < sections.length; j++) {
      const el = sections[j];
      const scroll = parts[j]?.scroll;
      if (scroll && scroll.scrollTop !== l.scrollTop[j]) scroll.scrollTop = l.scrollTop[j];
      el.style.transform = `translate3d(${l.translateX[j].toFixed(3)}%, 0, 0)`;
      // `j + 1`, so every section clears the tabs, which sit at 0. That is the
      // hard rule the whole tuck depends on: a tab is never above a page.
      el.style.zIndex = String(j + 1);
      el.toggleAttribute('data-top', j === l.topIndex);
      el.toggleAttribute('data-active', j === l.activeIndex);

      // A covered section must not paint at all. Its glass would otherwise be
      // blurred into the page above it — see `TrackLayout.visible`.
      const hidden = !l.visible[j];
      if (hidden !== (el.style.visibility === 'hidden')) {
        el.style.visibility = hidden ? 'hidden' : '';
        // Says out loud that a covered section is out of the picture entirely,
        // which the CSS uses to take its `backdrop-filter` off. Chrome turns
        // out to skip a hidden element's backdrop-filter already (measured:
        // identical frames either way), but that is not a thing to rely on —
        // the filter is an operation on the backdrop rather than on the
        // element, and an engine that applied it would have the page sampling
        // a grid blurred once per section you had read.
        el.toggleAttribute('data-hidden', hidden);
        // `visibility` is not something IntersectionObserver notices, so a clip
        // that was playing when its section went under would keep decoding
        // behind a page nobody can see through.
        if (hidden) for (const video of el.querySelectorAll('video')) video.pause();
        else el.dispatchEvent(new CustomEvent('pv:shown', { bubbles: false }));
      }

      // The flush tab is the section's own flap, so the tab column's copy of it
      // stands down — in the SAME frame, which is what makes the swap at the
      // end of a turn neither flicker nor double.
      const tab = tabsRef.current[j];
      if (tab) tab.style.visibility = l.visible[j] ? 'hidden' : '';
    }

    if (l.activeIndex !== activeRef.current) {
      activeRef.current = l.activeIndex;
      changeRef.current(l.activeIndex);
    }
  }, []);

  /**
   * Re-derive the track: section heights, the viewport and the turn distance,
   * all measured or dialled rather than assumed. Runs on a resize AND whenever
   * a section's content settles — a late image extending one has to extend the
   * track with it.
   *
   * The position is carried across SEMANTICALLY — the section, how far down it,
   * and how far through a turn — never as a pixel offset. See `positionAt` /
   * `resolve`. It should never have to do anything (the blocks reserve their
   * media boxes), but a rebuild that moves the reader is the one failure this
   * whole path exists to prevent, so the dev log below shouts about it.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const book = bookRef.current;
    const spacer = spacerRef.current;
    const sections = sectionsRef.current;
    if (!sc || !book || !spacer || sections.length === 0) return;

    const previous = trackRef.current;
    const wasY = sc.scrollTop;
    // Where the reader is, in the project's terms — not in pixels, which the
    // rebuild is about to redefine.
    const held: TrackPosition = previous
      ? positionAt(previous, wasY)
      : { section: initialRef.current, offset: 0, turn: null };

    // The tab column has to fit the viewport without scrolling a second thing,
    // so with more sections than it holds the tabs get shorter. Published as a
    // variable because both the tab's height and its `top` are laid out from it.
    const tabHeight = fitTabHeight(
      look.tabHeightPx,
      sections.length,
      sc.clientHeight,
      look.tabTopPx,
      look.tabGapPx,
    );
    book.style.setProperty('--pv-tab-h', `${tabHeight}px`);

    // One sheet of glass per section, clipped to the union of the page and that
    // section's own tab slot. Re-cut here rather than per frame: it only moves
    // when the geometry does.
    const pageWidth = sections[0].getBoundingClientRect().width;
    partsRef.current.forEach(({ glass }, j) => {
      glass.style.clipPath = glassClipPath({
        tabWidth: look.tabWidthPx,
        pageWidth,
        viewportHeight: sc.clientHeight,
        flapTop: tabTopFor(j, look.tabTopPx, tabHeight, look.tabGapPx),
        flapHeight: tabHeight,
      });
    });

    const track = buildTrack({
      heights: partsRef.current.map(({ inner }) => inner.getBoundingClientRect().height),
      viewportHeight: sc.clientHeight,
      turnDistance: look.turnDistancePx,
    });
    trackRef.current = track;

    // The spacer is the only reason the scroller has anywhere to go: the track's
    // length minus the one viewport the sticky stage already occupies.
    spacer.style.height = `${Math.max(0, track.length - track.viewportHeight)}px`;

    // Back into pixels against the NEW track, synchronously — there must be no
    // frame that paints the new starts against the old position.
    const position = resolve(track, held);
    const lenis = lenisRef.current;
    lenis?.resize();
    if (Math.abs(sc.scrollTop - position) > 0.5) {
      // Only when it actually moved: an unconditional `scrollTo` would kill the
      // in-flight smooth scroll on every no-op re-measure.
      if (lenis) lenis.scrollTo(position, { immediate: true, force: true });
      else sc.scrollTop = position; // the first measure runs before Lenis exists
    }
    apply(position);

    if (import.meta.env.DEV && previous) {
      const before = layout(previous, wasY).activeIndex;
      const after = layout(track, position).activeIndex;
      const heights = track.pageScroll.map((v) => Math.round(v + track.viewportHeight));
      const was = previous.pageScroll.map((v) => Math.round(v + previous.viewportHeight));
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
  // from — the turn distance, the tab column — so it has to re-derive. The two
  // values CSS cannot carry rebuild the Lenis instance as well.
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

  /**
   * Open the gate: the first layout is real, so build the track from it and let
   * the scroller move. Everything before this point was a guess with the
   * scroller locked — a guess you can scroll is a guess that throws you onto
   * the wrong section halfway through reading the first one.
   */
  const arm = useCallback(() => {
    const ready = readyRef.current;
    if (ready.armed || !ready.fonts || ready.measured.size < sectionsRef.current.length) return;
    if (sectionsRef.current.length === 0) return;
    ready.armed = true;
    setArmed(true);
    measure();
    lenisRef.current?.start();
    if (import.meta.env.DEV) {
      // After the entrance, not during it: the sheet is still most of a screen
      // to the right at this point, and `elementFromPoint` would be asking
      // about the scrim.
      const book = bookRef.current;
      if (book) window.setTimeout(() => assertTabsBehind(book), 1000);
      const heights = trackRef.current?.pageScroll.map((v) =>
        Math.round(v + (trackRef.current?.viewportHeight ?? 0)),
      );
      console.log(
        `[pv:track] armed in ${Math.round(performance.now() - ready.at)}ms  heights ${heights}`,
      );
    }
  }, [measure]);

  // Collect the section and tab elements and keep them measured. Re-runs when
  // the project changes, the only time the section count can change.
  useLayoutEffect(() => {
    const book = bookRef.current;
    if (!book) return;
    const sections = Array.from(book.querySelectorAll<HTMLElement>('.pv-section'));
    sectionsRef.current = sections;
    partsRef.current = sections.map((section) => ({
      scroll: section.querySelector<HTMLElement>('.pv-section__scroll')!,
      inner: section.querySelector<HTMLElement>('.pv-section__inner')!,
      glass: section.querySelector<HTMLElement>('.pv-section__glass')!,
    }));
    tabsRef.current = Array.from(book.querySelectorAll<HTMLElement>('.pv-tab'));
    trackRef.current = null; // a different project: nothing to carry across
    activeRef.current = initialRef.current;
    readyRef.current = { fonts: false, measured: new Set(), armed: false, at: performance.now() };
    measure(); // provisional: arranges the book, but the scroller stays locked

    // The gate: fonts resolved AND every section through at least one layout
    // pass. With the blocks reserving their media boxes this is a frame or two,
    // but a gate that can never open is worse than a slightly stale track, so
    // it also gives up after a second and arms anyway.
    void document.fonts.ready.then(() => {
      readyRef.current.fonts = true;
      arm();
    });
    const fallback = window.setTimeout(() => {
      if (readyRef.current.armed) return;
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
      sectionsRef.current = [];
      partsRef.current = [];
      tabsRef.current = [];
    };
  }, [project.id, measure, arm]);

  // Smoothing + the scroll tick. The native listener is kept alongside Lenis's
  // so a programmatic `scrollTop` (the re-measure above) is applied too.
  useEffect(() => {
    const sc = scrollerRef.current;
    const content = contentRef.current;
    if (!sc || !content) return;

    const onScroll = () => apply(sc.scrollTop);
    sc.addEventListener('scroll', onScroll, { passive: true });

    const lenis = new Lenis({
      wrapper: sc,
      content,
      lerp: smoothing.lerp,
      wheelMultiplier: smoothing.wheel,
      autoRaf: true,
    });
    lenisRef.current = lenis;
    // Locked until the first layout is real — Lenis swallows the wheel while
    // stopped, so there is no scroll to mis-resolve against a guessed track.
    if (!readyRef.current.armed) lenis.stop();
    const offScroll = lenis.on('scroll', onScroll);

    return () => {
      offScroll();
      lenis.destroy();
      lenisRef.current = null;
      sc.removeEventListener('scroll', onScroll);
    };
  }, [apply, smoothing]);

  /**
   * A tab was clicked: scroll the track back to that section's TOP, so the
   * sections above it turn back out to the right in order and the one you
   * asked for arrives at its title. The return is the outward scroll run
   * backwards, not a cut to it — which is why it is a position and not an
   * animation: the same `layout()` mapping, read at a smaller number.
   *
   * `sliverReturn: 'bottom'` lands on the line you left instead. Shorter, less
   * of a performance; the dial is there to A/B them.
   */
  const scrollToSection = useCallback((index: number) => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    const sc = scrollerRef.current;
    if (!track) return;
    const target =
      look.sliverReturn === 'bottom' ? bottomOf(track, index) : positionOf(track, index);
    if (lenis) {
      lenis.scrollTo(target, {
        duration: look.sliverClickMs / 1000,
        // The dial's curve, not Lenis's default: a long rewind wants to arrive
        // slowly, and this is the one tween in the view a person watches.
        easing: easeOutCubic,
      });
    } else if (sc) {
      sc.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="pv-sheet" {...dismiss}>
      <div className="pv-scroller" ref={attachScroller} data-locked={armed ? undefined : ''}>
        <ScrollerContext.Provider value={scroller}>
          <div className="pv-content" ref={contentRef}>
            <div className="pv-stage">
              <Notebook project={project} bookRef={bookRef} onSelect={scrollToSection} />
            </div>
            <div className="pv-spacer" ref={spacerRef} aria-hidden="true" />
          </div>
        </ScrollerContext.Provider>
      </div>
    </div>
  );
}
