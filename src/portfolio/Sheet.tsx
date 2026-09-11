import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArticleStrip } from './ArticleStrip';
import { ScrollerContext } from './scroller';
import { useReveal } from './useReveal';

/**
 * The sheet: the full-viewport pane that slides in from the right, and the
 * VIRTUAL SCROLL inside it.
 *
 * The page cannot scroll — `body` is locked to one viewport and the grid must
 * not move an inch while a project is open — so the sheet brings its own
 * scroller: a 100vh box with a scrollbar-less overflow and an invisible spacer
 * behind it, sized to the current article's content. Scrolling it moves
 * nothing; the scroll POSITION is read and written as a translate on the
 * centred article's inner column. Wheel anywhere over the sheet therefore
 * scrolls the project, the neighbours stay pinned at their tops, and
 * `overscroll-behavior: contain` keeps a scroll past either end from leaking
 * out to the document.
 *
 * The article strip is `position: sticky` inside the scroller rather than a
 * sibling floating over it: that keeps it in the scroller's subtree, which is
 * what lets the wheel, the reveal observer's root and every block's
 * "am I on screen?" question all resolve against the same box.
 *
 * Scroll position, the column translate and the spacer's height are all
 * imperative — one transform write and one height write per change, never a
 * render. The only React state here is the scroller ELEMENT, which the reveal
 * observer and every block's visibility test need as their root.
 */
interface SheetProps {
  /** Continuous index of the centred article. */
  center: number;
  /** Step one column (a neighbour click, an arrow key, the nav arrows). */
  onStep: (direction: -1 | 1) => void;
}

export function Sheet({ center, onStep }: SheetProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  // The centred article's inner column — a DIFFERENT node after every step.
  const innerRef = useRef<HTMLDivElement>(null);
  // The same scroller, as a render input: the observers need it as their root,
  // and it only exists after the first commit.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScroller(el);
  }, []);

  // One observer for the whole sheet; it rescans when the window of rendered
  // articles moves.
  useReveal(scroller, String(center));

  /**
   * The spacer is what gives the scroller its range: the article's content
   * height minus the one viewport already on screen. Re-run by a
   * ResizeObserver, so an image or a video settling into its intrinsic size
   * extends the scroll instead of stranding the tail of the article.
   */
  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const inner = innerRef.current;
    const spacer = spacerRef.current;
    if (!sc || !inner || !spacer) return;
    const content = inner.getBoundingClientRect().height;
    spacer.style.height = `${Math.max(0, Math.round(content - sc.clientHeight))}px`;
  }, []);

  // A step is a new article at the centre: back to the top of it, remeasured,
  // and the scroll listener re-bound to the node that is now centred.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    const inner = innerRef.current;
    if (!sc || !inner) return;

    sc.scrollTop = 0;
    inner.style.transform = '';
    measure();

    const apply = () => {
      inner.style.transform = `translate3d(0, ${-sc.scrollTop}px, 0)`;
    };
    sc.addEventListener('scroll', apply, { passive: true });

    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    window.addEventListener('resize', measure);

    return () => {
      sc.removeEventListener('scroll', apply);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      inner.style.transform = ''; // this article is a neighbour now: back to its top
    };
  }, [center, measure]);

  // The element refs are attached during the same commit, so the first pass of
  // the effect above can run before `scroller` has been seen by a render; redo
  // the measurement once it has.
  useEffect(measure, [scroller, measure]);

  return (
    <div className="pv-sheet">
      <div className="pv-scroller" ref={attachScroller}>
        <ScrollerContext.Provider value={scroller}>
          <div className="pv-stage">
            <ArticleStrip center={center} onStep={onStep} innerRef={innerRef} />
          </div>
        </ScrollerContext.Provider>
        <div className="pv-spacer" ref={spacerRef} aria-hidden="true" />
      </div>
    </div>
  );
}
