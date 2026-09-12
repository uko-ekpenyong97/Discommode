import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { PageRow } from './PageRow';
import { look, subscribeLook } from './portfolioMotion';
import { bottomOf, buildTrack, layout, positionAt, resolve } from './pageTrack';
import type { Track, TrackPosition } from './pageTrack';
import { ScrollerContext } from './scroller';
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
 * `pageTrack`'s `layout()` and comes back out as a `scrollTop` and a
 * `translateX` per page, which is how one wheel gesture carries you down a
 * page, across to the next, and down that one, with no mode and no state
 * machine in between.
 *
 * Everything here is imperative on purpose: scrolling writes transforms and
 * scroll offsets straight to the DOM. The only React state is the scroller
 * ELEMENT (the observers need it as a root) and the active page index, which
 * changes once per page, not once per frame.
 *
 * Smoothing is Lenis, scoped to this scroller via its `wrapper`/`content`
 * options — the grid keeps its own feel entirely. Lenis honours
 * `prefers-reduced-motion` itself by dropping to 1:1.
 *
 * TWO RULES keep the track honest, and both exist because the track is derived
 * from MEASURED page heights:
 *
 *  1. The scroller stays LOCKED until the first layout is real — fonts ready
 *     and every page measured at least once. Before that the heights are a
 *     guess, and a guess you can scroll is a guess that throws you onto the
 *     wrong page.
 *  2. A rebuild preserves the SEMANTIC position (page, offset, slide progress),
 *     never the pixel one. A page growing moves every start behind it, so the
 *     same `y` is a different place; `positionAt` → `resolve` carries the
 *     reader across instead, in the same frame as the height change.
 *
 * Neither should ever have to do any work: the blocks reserve their media boxes
 * from intrinsic sizes, so a page's height is the same before and after its
 * assets load. They are here because "should" is not a guarantee.
 */
interface SheetProps {
  project: Project;
  /** 0-based page to open on (from `#view-NN/<page>`). */
  initialPage: number;
  /** The page being read changed — the hash follows it. */
  onPageChange: (index: number) => void;
}

export function Sheet({ project, initialPage, onPageChange }: SheetProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  // A zero-height box sized to the PREFERRED sliver width, so the vw the dock
  // dials is resolved to px by the browser rather than re-derived in JS.
  const probeRef = useRef<HTMLDivElement>(null);

  const trackRef = useRef<Track | null>(null);
  const pagesRef = useRef<HTMLElement[]>([]);
  const lenisRef = useRef<Lenis | null>(null);
  const activeRef = useRef(initialPage);
  /** The first-layout gate (rule 1 above). `armed` unlocks the scroller. */
  const readyRef = useRef({ fonts: false, measured: new Set<Element>(), armed: false, at: 0 });
  // Only read on the FIRST measure of a project; after that the position is
  // carried across from the previous track (see `measure`).
  const initialPageRef = useRef(initialPage);

  // The scroller as a render input: the reveal observer and every block's
  // "am I on screen?" test need it as their root, and it only exists after the
  // first commit.
  // False until the first layout is real. Rendered as `data-locked`, which
  // takes the scroller out of overflow entirely: stopping Lenis is not enough
  // on its own, because Lenis is created in a passive effect and the scroller
  // scrolls NATIVELY in the frames before that.
  const [armed, setArmed] = useState(false);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScroller(el);
  }, []);

  const pageChangeRef = useRef(onPageChange);
  useEffect(() => {
    pageChangeRef.current = onPageChange;
    initialPageRef.current = initialPage;
  });

  // The two look values CSS cannot carry. A change to either means rebuilding
  // the Lenis instance, so they are the one piece of the dock's tuning that
  // goes through React rather than through a custom property.
  const [smoothing, setSmoothing] = useState({
    lerp: look.lenisLerp,
    wheel: look.wheelMultiplier,
  });

  useReveal(scroller, project.id);

  /** One frame: the track position in, the row's whole arrangement out. */
  const apply = useCallback((position: number) => {
    const track = trackRef.current;
    const pages = pagesRef.current;
    if (!track || pages.length === 0) return;

    const l = layout(track, position);
    const top = pages.length + 1;
    for (let j = 0; j < pages.length; j++) {
      const el = pages[j];
      if (el.scrollTop !== l.scrollTop[j]) el.scrollTop = l.scrollTop[j];
      el.style.transform = `translate3d(${l.translateX[j].toFixed(2)}px, 0, 0)`;
      // Active > stacked > not yet reached. A later stacked page sits over an
      // earlier one (z = its own index), and the active page over all of them.
      el.style.zIndex = String(j === l.activeIndex ? top : j);
      el.toggleAttribute('data-active', j === l.activeIndex);
      el.toggleAttribute('data-stacked', j < l.activeIndex);
      el.toggleAttribute('data-moving-horizontal', l.movingHorizontal);
    }

    if (l.activeIndex !== activeRef.current) {
      activeRef.current = l.activeIndex;
      pageChangeRef.current(l.activeIndex);
    }
  }, []);

  /**
   * Re-derive the track: page heights, the viewport, the page width and the
   * preferred sliver, all measured rather than assumed (the dock can retune any
   * of them live). Runs on a resize AND whenever a page's content settles — a
   * late image extending page 1 has to extend the track with it.
   *
   * The position is carried across SEMANTICALLY — the page, how far down it,
   * and how far through a slide — never as a pixel offset. A page that grew
   * moves every start behind it, so the same `y` is a different place; see
   * `positionAt` / `resolve`. It should never have to do anything (the blocks
   * reserve their media boxes), but a rebuild that moves the reader is the one
   * failure this whole path exists to prevent, so the dev log below shouts
   * about it.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const row = rowRef.current;
    const probe = probeRef.current;
    const spacer = spacerRef.current;
    const pages = pagesRef.current;
    if (!sc || !row || !probe || !spacer || pages.length === 0) return;

    const previous = trackRef.current;
    const wasY = sc.scrollTop;
    // Where the reader is, in the project's terms — not in pixels, which the
    // rebuild is about to redefine.
    const held: TrackPosition = previous
      ? positionAt(previous, wasY)
      : { page: initialPageRef.current, offset: 0, slide: null };

    const track = buildTrack({
      heights: pages.map((page) => {
        const inner = page.firstElementChild as HTMLElement | null;
        return inner ? inner.getBoundingClientRect().height : 0;
      }),
      viewportWidth: sc.clientWidth,
      viewportHeight: sc.clientHeight,
      pageWidth: pages[0].getBoundingClientRect().width,
      sliverWidth: probe.getBoundingClientRect().width,
    });
    trackRef.current = track;

    // The spacer is the only reason the scroller has anywhere to go: the track's
    // length minus the one viewport the sticky stage already occupies.
    spacer.style.height = `${Math.max(0, track.length - track.viewportHeight)}px`;
    // The row's origin is the left gutter. Published from here rather than
    // recomputed in CSS so the two can't disagree by a rounding step.
    row.style.setProperty('--pv-gutter', `${track.gutter}px`);

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
        const line = `[pv:track] heights ${was} → ${heights}  page ${before} → ${after}`;
        // A rebuild that changes which page you are on is THE bug this is here
        // to catch: it means the reader was moved by something loading.
        if (before !== after) console.warn(`${line}  ← ACTIVE PAGE MOVED`);
        else console.log(line);
      }
    }
  }, [apply]);

  // Retuning the look in the dev dock changes the geometry the track was built
  // from — the page width, the preferred sliver — so it has to re-derive. The
  // two values CSS cannot carry rebuild the Lenis instance as well.
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
   * the wrong page halfway through reading the first one.
   */
  const arm = useCallback(() => {
    const ready = readyRef.current;
    if (ready.armed || !ready.fonts || ready.measured.size < pagesRef.current.length) return;
    if (pagesRef.current.length === 0) return;
    ready.armed = true;
    setArmed(true);
    measure();
    lenisRef.current?.start();
    if (import.meta.env.DEV) {
      const heights = trackRef.current?.pageScroll.map((v) =>
        Math.round(v + (trackRef.current?.viewportHeight ?? 0)),
      );
      console.log(
        `[pv:track] armed in ${Math.round(performance.now() - ready.at)}ms  heights ${heights}`,
      );
    }
  }, [measure]);

  // Collect the page elements and keep them measured. Re-runs when the project
  // changes, which is the only time the page count can change.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const pages = Array.from(row.querySelectorAll<HTMLElement>('.pv-page'));
    pagesRef.current = pages;
    trackRef.current = null; // a different project: nothing to carry across
    activeRef.current = initialPageRef.current;
    readyRef.current = { fonts: false, measured: new Set(), armed: false, at: performance.now() };
    measure(); // provisional: positions the row, but the scroller stays locked

    // The gate: fonts resolved AND every page through at least one layout pass.
    // With the blocks reserving their media boxes this is a frame or two, but a
    // gate that can never open is worse than a slightly stale track, so it also
    // gives up after a second and arms anyway.
    let fallback = 0;
    void document.fonts.ready.then(() => {
      readyRef.current.fonts = true;
      arm();
    });
    fallback = window.setTimeout(() => {
      if (readyRef.current.armed) return;
      if (import.meta.env.DEV) console.warn('[pv:track] first layout timed out — arming anyway');
      readyRef.current.fonts = true;
      readyRef.current.measured = new Set(pages.map((p) => p.firstElementChild!));
      arm();
    }, 1000);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) readyRef.current.measured.add(entry.target);
      measure();
      arm();
    });
    for (const page of pages) {
      const inner = page.firstElementChild;
      if (inner) ro.observe(inner);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(fallback);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      pagesRef.current = [];
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

  /** A stacked sliver was clicked: scroll the track back to that page's BOTTOM —
   *  the line you stopped reading, which is what the sliver is showing you. The
   *  row un-stacks through the same `layout()` mapping on the way; there is no
   *  separate animation, only a different position. */
  const scrollToPage = useCallback((index: number) => {
    const track = trackRef.current;
    const lenis = lenisRef.current;
    const sc = scrollerRef.current;
    if (!track) return;
    const target = bottomOf(track, index);
    if (lenis) {
      lenis.scrollTo(target, {
        duration: look.sliverClickMs / 1000,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
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
              <div className="pv-probe" ref={probeRef} aria-hidden="true" />
              <PageRow project={project} rowRef={rowRef} onSliverClick={scrollToPage} />
            </div>
            <div className="pv-spacer" ref={spacerRef} aria-hidden="true" />
          </div>
        </ScrollerContext.Provider>
      </div>
    </div>
  );
}
