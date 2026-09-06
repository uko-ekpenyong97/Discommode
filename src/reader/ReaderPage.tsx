import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlipBook } from './FlipBook';
import type { FlipEngine } from './flipEngine';
import { ISSUES, buildSpreads, issue01, pageLabel } from './issue-01';
import './ReaderPage.css';

interface ReaderPageProps {
  /** Issue id from the `#read-NN` hash. */
  issue: string;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
  /** Dev-only entrance prototype, from `#read-NN?intro`. */
  intro?: boolean;
}

// Dev-only: the entrance prototype and its `dialkit` timeline are behind an
// `import.meta.env.DEV` dynamic import, so both tree-shake out of production.
const ReaderIntro = import.meta.env.DEV ? lazy(() => import('./ReaderIntro')) : null;

const HASH_PREFIX = '#read-';

/** `#read-01/5?debug` -> { spread: 5, query: '?debug' }. Bad values read as 0. */
function parseHash(): { spread: number; query: string } {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return { spread: 0, query: '' };
  const q = hash.indexOf('?');
  const query = q === -1 ? '' : hash.slice(q);
  const path = (q === -1 ? hash : hash.slice(0, q)).slice(HASH_PREFIX.length);
  const slash = path.indexOf('/');
  if (slash === -1) return { spread: 0, query };
  const n = Number.parseInt(path.slice(slash + 1), 10);
  return { spread: Number.isFinite(n) && n >= 0 ? n : 0, query };
}

const clamp = (n: number, max: number): number => Math.min(Math.max(n, 0), max);

/**
 * Temporary full-screen stage for the reader. The real entry point later is the
 * detail-view panel; for now `#read-NN` swaps the whole app for this.
 *
 * The spread index lives in the hash (`#read-01/5`) so a reload keeps your place
 * and any spread is directly addressable. This component owns that sync in both
 * directions: it `replaceState`s on every change — which fires NEITHER
 * `hashchange` NOR `popstate`, so our own writes never bounce back through the
 * listener below, and no history entries pile up — while the listener picks up
 * the hash being edited by hand.
 */
export default function ReaderPage({ issue, debug = false, intro = false }: ReaderPageProps) {
  const data = ISSUES[issue] ?? issue01;
  const spreads = useMemo(() => buildSpreads(data), [data]);
  const lastSpread = spreads.length - 1;
  const [spread, setSpread] = useState(() => clamp(parseHash().spread, lastSpread));

  // Entrance prototype wiring (dev-only). The stage element gives the intro the
  // cover-slot rect and the LAND boundary; the engine handle lets OPEN drive the
  // real turn. Both stay inert unless `?intro` is set on a dev build.
  const introActive = import.meta.env.DEV && intro && ReaderIntro !== null;
  const stageRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<FlipEngine | null>(null);
  const resetToCover = useCallback(() => setSpread(0), []);

  // Mirror the current spread into the hash.
  useEffect(() => {
    const next = `${HASH_PREFIX}${issue}/${spread}${parseHash().query}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [issue, spread]);

  // Follow the hash when it is edited by hand or walked with back/forward.
  useEffect(() => {
    const sync = () => {
      if (!window.location.hash.startsWith(HASH_PREFIX)) return; // leaving the reader
      const next = clamp(parseHash().spread, lastSpread);
      setSpread((current) => (next === current ? current : next));
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [lastSpread]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.location.hash = '';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goto = useCallback((index: number) => setSpread(index), []);

  const [left, right] = spreads[spread] ?? [null, null];
  const labels = [left, right].filter((p) => p !== null).map(pageLabel);

  return (
    <div className="reader" ref={stageRef}>
      <FlipBook
        spreads={spreads}
        spread={spread}
        onSpreadChange={goto}
        debug={debug}
        onEngineReady={introActive ? setEngine : undefined}
      />
      <p className="reader__caption">
        <span>
          ISSUE {data.id} — SPREAD {spread + 1} / {spreads.length}
        </span>
        <span aria-hidden="true">·</span>
        <span className="reader__pages">{labels.join(' – ')}</span>
      </p>
      {introActive && ReaderIntro && (
        <Suspense fallback={null}>
          <ReaderIntro engine={engine} stageRef={stageRef} onResetToCover={resetToCover} />
        </Suspense>
      )}
    </div>
  );
}
