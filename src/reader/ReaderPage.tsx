import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlipBook } from './FlipBook';
import type { FlipEngine } from './flipEngine';
import { ISSUES, buildSpreads, issue01, pageLabel } from './issue-01';
import { closeReader } from './readerNav';
import { applyDoorwayRest } from './doorway';
import { useDoorwayMotion } from './useDoorwayMotion';
import './ReaderPage.css';

interface ReaderPageProps {
  /** Issue id from the `#read-NN` hash. */
  issue: string;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
  /** Dev-only doorway authoring, from `#item-NN?intro`. */
  intro?: boolean;
  /** True when mounted over the detail view for doorway authoring (dev): the
   *  hash is `#item-NN?intro`, so this page must not mutate or follow it. */
  authoring?: boolean;
  /** True when the storyboarded doorway entrance should play (opened from an
   *  item, motion allowed). Direct-URL / reduced-motion loads pass false. */
  entrance?: boolean;
}

// Dev-only: the DialKit doorway harness is behind an `import.meta.env.DEV`
// dynamic import, so it and `dialkit` tree-shake out of production entirely.
const DoorwayDialKit = import.meta.env.DEV ? lazy(() => import('./DoorwayDialKit')) : null;

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
 * The reader stage: the magazine on the wooden table. The spread index lives in
 * the hash (`#read-01/5`) so a reload keeps your place; this component owns that
 * sync in both directions (replaceState, which fires neither hashchange nor
 * popstate). During doorway authoring (`#item-NN?intro`) that sync is disabled so
 * the harness never rewrites the item hash it is mounted over.
 *
 * The doorway itself is driven by one of two drivers writing the same values:
 * `useDoorwayMotion` (production entrance + exit) or `DoorwayDialKit` (dev
 * authoring). Both write the `--doorway-*` variables consumed by this stage, the
 * cover, the reader chrome, and — beneath the reader — the detail view.
 */
export default function ReaderPage({
  issue,
  debug = false,
  intro = false,
  authoring = false,
  entrance = false,
}: ReaderPageProps) {
  const data = ISSUES[issue] ?? issue01;
  const spreads = useMemo(() => buildSpreads(data), [data]);
  const lastSpread = spreads.length - 1;
  const [spread, setSpread] = useState(() => clamp(parseHash().spread, lastSpread));

  // The doorway needs the flip engine (OPEN drives the cover turn) whenever a
  // driver will run: the production entrance or the dev authoring harness.
  const authoringActive = import.meta.env.DEV && authoring && intro && DoorwayDialKit !== null;
  const needsEngine = authoringActive || entrance;
  const [engine, setEngine] = useState<FlipEngine | null>(null);
  const resetToCover = useCallback(() => setSpread(0), []);

  // The DialKit harness is lazy — pin REST synchronously so the reader starts
  // transparent (detail view showing through) rather than flashing full wood.
  useLayoutEffect(() => {
    if (authoringActive) applyDoorwayRest();
  }, [authoringActive]);

  // Production driver. Inert (`play: 'none'`) for authoring and direct/reduced
  // loads; it still hands back `requestExit` (which then closes immediately).
  const { requestExit } = useDoorwayMotion({
    engine,
    resetToCover,
    play: entrance ? 'entrance' : 'none',
  });

  // Mirror the current spread into the hash (not while authoring over #item-NN).
  useEffect(() => {
    if (authoring) return;
    const next = `${HASH_PREFIX}${issue}/${spread}${parseHash().query}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [issue, spread, authoring]);

  // Follow the hash when it is edited by hand or walked with back/forward.
  useEffect(() => {
    if (authoring) return;
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
  }, [lastSpread, authoring]);

  // Escape: authoring uses the dock's own transport; otherwise play the exit
  // (reversed doorway, or an immediate close for the plain path) then leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (authoring) return;
      requestExit(() => closeReader());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authoring, requestExit]);

  const goto = useCallback((index: number) => setSpread(index), []);

  const [left, right] = spreads[spread] ?? [null, null];
  const labels = [left, right].filter((p) => p !== null).map(pageLabel);

  return (
    <div className="reader">
      <FlipBook
        spreads={spreads}
        spread={spread}
        onSpreadChange={goto}
        debug={debug}
        onEngineReady={needsEngine ? setEngine : undefined}
      />
      <p className="reader__caption">
        <span>
          ISSUE {data.id} — SPREAD {spread + 1} / {spreads.length}
        </span>
        <span aria-hidden="true">·</span>
        <span className="reader__pages">{labels.join(' – ')}</span>
      </p>
      {authoringActive && DoorwayDialKit && (
        <Suspense fallback={null}>
          <DoorwayDialKit engine={engine} onResetToCover={resetToCover} />
        </Suspense>
      )}
    </div>
  );
}
