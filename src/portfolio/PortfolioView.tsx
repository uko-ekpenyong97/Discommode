import { Suspense, lazy, useCallback, useEffect, useLayoutEffect } from 'react';
import { CONTENT, indexForProject } from '../content';
import { ClosePill } from './ClosePill';
import { Scrim } from './Scrim';
import { Scroller } from './Scroller';
import { logContrastProbe } from './contrastProbe';
import { applyPortfolioLook, applyPortfolioRest, subscribeLook } from './portfolioMotion';
import { closePortfolio, replacePortfolio } from './portfolioNav';
import { PROJECTS, projectById } from './projects';
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
 * The project view: the blurred `Scrim`, the sliding `Scroller` with its page
 * track, and the `ClosePill`.
 *
 * One project, its pages, and the way out — nothing else. The other projects
 * are never reachable from in here: you close the sheet and use the grid. (The
 * pages beside the one you are reading are this project's own, which is the
 * thing the reference is doing.)
 *
 * The channels are driven by one of two drivers writing the same `--pv-*`
 * variables: `usePortfolioMotion` (production open + close) or
 * `PortfolioDialKit` (dev authoring). Same arrangement as the reader's doorway.
 */
export default function PortfolioView({ project, section, intro = false }: PortfolioViewProps) {
  const authoring = import.meta.env.DEV && intro && PortfolioDialKit !== null;
  // An unknown id in the hash falls back to the first project rather than an
  // empty sheet; the gate has already matched it against the manifest.
  const current = projectById(project) ?? PROJECTS[0];

  // The dock is lazy — publish the look and pin REST synchronously so the layer
  // never paints a fully-open sheet for a frame before the dock takes over.
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

  // The page you are reading goes into the hash with replaceState, so a reload
  // keeps your place and Escape is still one step back — scrolling a project
  // must not pile a history entry per page.
  const onSectionChange = useCallback(
    (index: number) => replacePortfolio(current.id, index + 1),
    [current.id],
  );

  // DEV: measure the text against whatever the grid is actually showing through
  // the page glass, once the sheet has settled and again whenever a glass dial
  // moves. `pageAlpha` is the lever; this is what says whether it is far enough.
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
  // ours; the wheel belongs to the sheet's own scroller and nothing else.
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
      <Scrim onDismiss={close} />
      {/* Before the sheet in the DOM, not after: this is a modal, and the way
          out should be the first thing Tab reaches rather than something you
          arrive at after every link in the project. It paints above the sheet
          regardless (z-index). */}
      <ClosePill onClose={close} />
      <Scroller
        // A different project is a different track: remount rather than try to
        // carry a scroll position between two unrelated page lists.
        key={current.id}
        project={current}
        initialSection={section}
        onSectionChange={onSectionChange}
      />
      {authoring && PortfolioDialKit && (
        <Suspense fallback={null}>
          <PortfolioDialKit />
        </Suspense>
      )}
    </div>
  );
}
