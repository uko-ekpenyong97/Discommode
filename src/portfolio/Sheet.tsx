import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { PageRow } from './PageRow';
import { look, subscribeLook } from './portfolioMotion';
import { bottomOf, buildTrack, layout, maxPosition } from './pageTrack';
import type { Track } from './pageTrack';
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
  // Only read on the FIRST measure of a project; after that the position is
  // carried across from the previous track (see `measure`).
  const initialPageRef = useRef(initialPage);

  // The scroller as a render input: the reveal observer and every block's
  // "am I on screen?" test need it as their root, and it only exists after the
  // first commit.
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
   * The position is carried across: whatever page you were reading, and how far
   * down it, survives a resize or a re-measure instead of being thrown back to
   * the top.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const row = rowRef.current;
    const probe = probeRef.current;
    const spacer = spacerRef.current;
    const pages = pagesRef.current;
    if (!sc || !row || !probe || !spacer || pages.length === 0) return;

    const previous = trackRef.current;
    const held = previous
      ? (() => {
          const l = layout(previous, sc.scrollTop);
          return { index: l.activeIndex, offset: l.scrollTop[l.activeIndex] };
        })()
      : { index: initialPageRef.current, offset: 0 };

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

    const index = Math.min(held.index, track.start.length - 1);
    const position = Math.min(
      track.start[index] + Math.min(held.offset, track.pageScroll[index]),
      maxPosition(track),
    );
    const lenis = lenisRef.current;
    if (lenis) {
      lenis.resize();
      lenis.scrollTo(position, { immediate: true, force: true });
    } else {
      sc.scrollTop = position; // the first measure runs before Lenis is created
    }
    apply(position);
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

  // Collect the page elements and keep them measured. Re-runs when the project
  // changes, which is the only time the page count can change.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const pages = Array.from(row.querySelectorAll<HTMLElement>('.pv-page'));
    pagesRef.current = pages;
    trackRef.current = null; // a different project: nothing to carry across
    activeRef.current = initialPageRef.current;
    measure();

    const ro = new ResizeObserver(measure);
    for (const page of pages) {
      const inner = page.firstElementChild;
      if (inner) ro.observe(inner);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      pagesRef.current = [];
    };
  }, [project.id, measure]);

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
      <div className="pv-scroller" ref={attachScroller}>
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
