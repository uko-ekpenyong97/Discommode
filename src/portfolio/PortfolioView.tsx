import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONTENT, indexForProject } from '../content';
import { ClosePill } from './ClosePill';
import { Ground } from './Ground';
import { Scrim } from './Scrim';
import { Scroller } from './Scroller';
import type { ScrollerHandle } from './Scroller';
import { logContrastProbe } from './contrastProbe';
import { applyPortfolioLook, applyPortfolioRest, subscribeLook } from './portfolioMotion';
import { closePortfolio, replacePortfolio } from './portfolioNav';
import { PROJECTS, projectById } from './projects';
import { useDismissOnGround } from './useDismissOnGround';
import { usePortfolioMotion } from './usePortfolioMotion';
import './portfolio.css';
import './reveal.css';

// Dev-only: the DialKit authoring dock is behind an `import.meta.env.DEV`
// dynamic import, so it and `dialkit` tree-shake out of production entirely.
const PortfolioDialKit = import.meta.env.DEV ? lazy(() => import('./PortfolioDialKit')) : null;

interface PortfolioViewProps {
  /** Project id from the `#view-NN` hash. */
  project: string;
  /** 0-based section from `#view-NN/<section>` (the hash itself is 1-based). */
  section: number;
  /** Dev `#view-NN?intro`: mount the DialKit dock and hand it the channels. */
  intro?: boolean;
}

/**
 * The project view: the `Scrim`, the `Ground` the paper sits on, the `Scroller`
 * that drives the track, and the `ClosePill`.
 *
 * One project, its sections, and the way out — nothing else. The other projects
 * are never reachable from in here: you close the view and use the grid.
 *
 * The channels are driven by one of two drivers writing the same `--pv-*`
 * variables: `usePortfolioMotion` (production open + close) or
 * `PortfolioDialKit` (dev authoring). Same arrangement as the reader's doorway.
 *
 * The one piece of state here is the SECTION, which the ground's letterhead
 * needs and the hash follows. It commits at the hand-off, so it changes once
 * per section rather than once per frame — a render per scroll tick is exactly
 * what the rest of this directory is arranged to avoid.
 */
export default function PortfolioView({ project, section, intro = false }: PortfolioViewProps) {
  const authoring = import.meta.env.DEV && intro && PortfolioDialKit !== null;
  // An unknown id in the hash falls back to the first project rather than an
  // empty view; the gate has already matched it against the manifest.
  const current = projectById(project) ?? PROJECTS[0];
  const scrollerRef = useRef<ScrollerHandle>(null);
  const [active, setActive] = useState(section);

  // The dock is lazy — publish the look and pin REST synchronously so the layer
  // never paints a fully-open view for a frame before the dock takes over.
  useLayoutEffect(() => {
    if (!authoring) return;
    applyPortfolioLook();
    applyPortfolioRest();
  }, [authoring]);

  // Production driver. Inert while the dock owns the values.
  const { requestExit } = usePortfolioMotion({ play: authoring ? 'none' : 'enter' });

  const close = useCallback(() => {
    const item = CONTENT[indexForProject(project)];
    requestExit(() => closePortfolio(item ? item.slug : 'item-01'));
  }, [project, requestExit]);

  // The section you are reading goes into the hash with replaceState, so a
  // reload keeps your place and Escape is still one step back — scrolling a
  // project must not pile a history entry per section.
  const onSectionChange = useCallback(
    (index: number) => {
      setActive(index);
      replacePortfolio(current.id, index + 1);
    },
    [current.id],
  );

  const selectSection = useCallback((index: number) => {
    scrollerRef.current?.scrollToSection(index);
  }, []);

  const dismiss = useDismissOnGround(close);

  // DEV: measure the ink against the paper and the letterhead against the
  // ground, once the view has settled and again whenever a dial moves.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const first = window.setTimeout(logContrastProbe, 900);
    const off = subscribeLook(() => logContrastProbe());
    return () => {
      window.clearTimeout(first);
      off();
    };
  }, []);

  // Escape closes. The app beneath is suspended, so the key is unambiguously
  // ours; the wheel belongs to the scroller and nothing else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!authoring) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authoring, close]);

  return (
    <div className="pv">
      <Scrim />
      {/* Before the paper in the DOM, not after: this is a modal, and the way
          out should be the first thing Tab reaches rather than something you
          arrive at after every link in the project. It paints above the paper
          regardless (z-index). */}
      <ClosePill onClose={close} />
      <div className="pv-pane" {...dismiss}>
        <Ground project={current} activeIndex={active} onSelect={selectSection} />
        <Scroller
          // A different project is a different track: remount rather than try
          // to carry a scroll position between two unrelated section lists.
          key={current.id}
          ref={scrollerRef}
          project={current}
          initialSection={section}
          onSectionChange={onSectionChange}
        />
      </div>
      {authoring && PortfolioDialKit && (
        <Suspense fallback={null}>
          <PortfolioDialKit />
        </Suspense>
      )}
    </div>
  );
}
