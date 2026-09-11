import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { CONTENT, indexForProject } from '../content';
import { mod } from '../grid';
import { StripNav } from './StripNav';
import { ClosePill } from './ClosePill';
import { Scrim } from './Scrim';
import { Sheet } from './Sheet';
import { applyPortfolioLook, applyPortfolioRest } from './portfolioMotion';
import { closePortfolio, replacePortfolio } from './portfolioNav';
import { PROJECTS, projectIndex } from './projects';
import { usePortfolioMotion } from './usePortfolioMotion';
import './portfolio.css';
import './reveal.css';

// Dev-only: the DialKit authoring dock is behind an `import.meta.env.DEV`
// dynamic import, so it and `dialkit` tree-shake out of production entirely.
const PortfolioDialKit = import.meta.env.DEV ? lazy(() => import('./PortfolioDialKit')) : null;

interface PortfolioViewProps {
  /** Project id from the `#view-NN` hash. */
  project: string;
  /** Dev `#view-NN?intro`: mount the DialKit dock and hand it the channels. */
  intro?: boolean;
}

/**
 * The project view: three layers over the app — the blurred `Scrim`, the
 * sliding `Sheet` with its article strip, and the `ClosePill`.
 *
 * Position in the ring is ONE continuous index, unbounded, exactly like the
 * detail view's carousel: stepping adds ±1, and `mod` resolves it to a project.
 * That is what makes the strip slide in the direction you asked for even across
 * the wrap from 04 back to 02. The hash follows with `replaceState`, so walking
 * the neighbours never piles history entries between the opener and the close.
 *
 * The channels are driven by one of two drivers writing the same `--pv-*`
 * variables: `usePortfolioMotion` (production open + close) or
 * `PortfolioDialKit` (dev authoring). Same arrangement as the reader's doorway.
 */
export default function PortfolioView({ project, intro = false }: PortfolioViewProps) {
  const authoring = import.meta.env.DEV && intro && PortfolioDialKit !== null;

  const [center, setCenter] = useState(() => Math.max(0, projectIndex(project)));

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

  const step = useCallback((direction: -1 | 1) => {
    setCenter((c) => {
      const next = c + direction;
      replacePortfolio(PROJECTS[mod(next, PROJECTS.length)].id);
      return next;
    });
  }, []);

  // Follow the hash when it is edited by hand or walked with Back: move to the
  // NEAREST continuous index holding that project, so the strip still slides
  // the short way round. Adjusted during render rather than in an effect —
  // there is no external system to sync with, just state derived from a prop.
  const [seenProject, setSeenProject] = useState(project);
  if (project !== seenProject) {
    setSeenProject(project);
    const count = PROJECTS.length;
    const target = projectIndex(project);
    if (target >= 0 && mod(center, count) !== target) {
      let delta = target - mod(center, count);
      if (delta > count / 2) delta -= count;
      else if (delta < -count / 2) delta += count;
      setCenter(center + delta);
    }
  }

  // Escape closes; the arrows walk the neighbour ring. The app beneath is
  // suspended, so these keys are unambiguously ours.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!authoring) close();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authoring, close, step]);

  return (
    <div className="pv">
      <Scrim onDismiss={close} />
      <Sheet center={center} onStep={step} />
      <ClosePill onClose={close} />
      <StripNav project={PROJECTS[mod(center, PROJECTS.length)].id} onStep={step} />
      {authoring && PortfolioDialKit && (
        <Suspense fallback={null}>
          <PortfolioDialKit />
        </Suspense>
      )}
    </div>
  );
}
