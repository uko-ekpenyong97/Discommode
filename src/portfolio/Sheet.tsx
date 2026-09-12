import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { animate } from 'motion';
import { FolderStack } from './FolderStack';
import { look, subscribeLook } from './portfolioMotion';
import {
  bottomOf,
  buildTrack,
  folderClipPath,
  layout,
  maxPosition,
  minPosition,
  positionAt,
  positionOf,
  resolve,
} from './pageTrack';
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

/** The tab-click tween's curve — decelerating, so a long rewind settles. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * DEV: the painting invariant, checked rather than assumed.
 *
 * Every folder gets its own slot and nothing may paint over anything else — on
 * glass that is not an optimisation but the difference between a stack and a
 * smear, because a `backdrop-filter` samples whatever is behind it. The
 * geometry is unit-tested; this asks the browser whether the geometry made it
 * to the screen intact.
 */
function assertSlotsTile(stack: HTMLElement): void {
  const rects = Array.from(stack.querySelectorAll<HTMLElement>('.pv-folder')).map((el) => ({
    k: el.dataset.k,
    side: el.dataset.side,
    r: el.getBoundingClientRect(),
  }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      // Two folders of the same row share a band by design: the tab halves sit
      // side by side in it and their outlines tile (see `folderClipPath`).
      if (a.side !== b.side) continue;
      const overlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (overlap > 1) {
        console.error(`[pv:stack] folders ${a.k} and ${b.k} overlap by ${Math.round(overlap)}px`);
        return;
      }
    }
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
  /** Per folder, the parts the scroll loop writes to. Collected once rather
   *  than queried per frame. */
  const partsRef = useRef<{ body: HTMLElement; inner: HTMLElement; shape: HTMLElement }[]>([]);
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
    for (let k = 0; k < folders.length; k++) {
      const el = folders[k];
      const f = l.folders[k];
      el.style.top = `${f.top.toFixed(2)}px`;
      el.style.height = `${f.clipHeight.toFixed(2)}px`;
      el.style.zIndex = String(f.zIndex);
      el.toggleAttribute('data-top', k === l.topIndex);
      el.toggleAttribute('data-active', k === l.activeIndex);
      el.toggleAttribute('data-open', f.bodyVisible);

      const body = parts[k]?.body;
      if (!body) continue;
      if (body.scrollTop !== f.scrollTop) body.scrollTop = f.scrollTop;
      // A folder showing only its tab is clipped to it anyway, but `overflow`
      // is not something IntersectionObserver notices — a video in a folder
      // that had gone back into the pile would keep decoding behind it.
      const shown = f.bodyVisible;
      if (shown !== (body.style.visibility !== 'hidden')) {
        body.style.visibility = shown ? '' : 'hidden';
        if (shown) body.dispatchEvent(new CustomEvent('pv:shown', { bubbles: false }));
        else for (const video of body.querySelectorAll('video')) video.pause();
      }
    }

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

    const track = buildTrack({
      heights: partsRef.current.map(({ inner }) => inner.getBoundingClientRect().height),
      viewportHeight: sc.clientHeight,
      rowPitch: look.rowPitchPx,
      tabHeight: look.tabHeightPx,
      turnDistance: look.turnDistancePx,
      easeRise: look.easeRise,
    });
    trackRef.current = track;

    // The two heights every folder is laid out against. Published rather than
    // recomputed in CSS so the DOM and the track cannot disagree by a rounding
    // step — `openBodyHeight` in particular IS what `pageScroll` was built on.
    stack.style.setProperty('--pv-body-h', `${track.openBodyHeight}px`);
    stack.style.setProperty('--pv-slot-h', `${track.openBodyHeight + track.tabHeight}px`);

    // The folder outline, re-cut here rather than per frame: it only moves when
    // the geometry does.
    const sheetWidth = stack.getBoundingClientRect().width;
    const tabWidth = (look.tabWidthPct / 100) * sheetWidth;
    partsRef.current.forEach(({ shape }, k) => {
      shape.style.clipPath = folderClipPath({
        side: k % 2 === 0 ? 'left' : 'right',
        sheetWidth,
        tabWidth,
        tabHeight: look.chamferPx,
        height: track.openBodyHeight + track.tabHeight,
      });
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
      const heights = track.pageScroll.map((v) => Math.round(v + track.openBodyHeight));
      const was = previous.pageScroll.map((v) => Math.round(v + previous.openBodyHeight));
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

  /** Hand the position over to the scroller and let the wheel move it. */
  const unlock = useCallback(() => {
    introRef.current = false;
    readyRef.current.armed = true;
    setArmed(true);
    lenisRef.current?.start();
    if (import.meta.env.DEV) {
      const stack = stackRef.current;
      if (stack) assertSlotsTile(stack);
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
      const heights = trackRef.current?.pageScroll.map((v) =>
        Math.round(v + (trackRef.current?.openBodyHeight ?? 0)),
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
      body: folder.querySelector<HTMLElement>('.pv-folder__body')!,
      inner: folder.querySelector<HTMLElement>('.pv-folder__inner')!,
      shape: folder.querySelector<HTMLElement>('.pv-folder__shape')!,
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
    };
    sc.addEventListener('scroll', onScroll, { passive: true });

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
      sc.removeEventListener('scroll', onScroll);
    };
  }, [apply, smoothing]);

  /**
   * A tab was clicked: scroll the track to that folder's TOP.
   *
   * Which is the whole navigation, and it needs no special casing in either
   * direction — the track between here and there is the same track. Clicking a
   * tab in the unread pile runs forward through every folder in between, rows
   * rising and bodies unfolding in sequence; clicking one in the read pile runs
   * the same thing backwards.
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
