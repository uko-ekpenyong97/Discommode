import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FlipBook } from './FlipBook';
import type { FlipEngine } from './flipEngine';
import { ISSUES, buildSpreads, folioText, issue01, issueAnims, issuePageAnims, spreadFolios } from './issue-01';
import { closeReader } from './readerNav';
import { applyDoorwayRest } from './doorway';
import { useDoorwayMotion } from './useDoorwayMotion';
// The chrome is the detail view's too — the same paper shapes, the same sky
// colour, the same rules (src/chrome) — so the two cannot drift.
import { PillFace, ShapeFace } from '../chrome/Paper';
import { useSkyChrome } from '../chrome/useSkyChrome';
import { useChromeFit } from '../chrome/useChromeFit';
import './ReaderPage.css';

interface ReaderPageProps {
  /** Issue id from the `#read-NN` hash. */
  issue: string;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
  /** Dev-only: `#item-NN?intro` is doorway authoring; `#read-NN?intro` mounts
   *  the READER NAV dock. */
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
const ReaderNavDialKit = import.meta.env.DEV ? lazy(() => import('./ReaderNavDialKit')) : null;

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
 * The reader stage: the magazine on the sky. The spread index lives in
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
  const folios = useMemo(() => spreadFolios(data), [data]);
  const lastSpread = spreads.length - 1;
  const [spread, setSpread] = useState(() => clamp(parseHash().spread, lastSpread));

  // The engine is always handed up: the chrome drives it, and so does the
  // doorway (OPEN is the cover turn) in production and in the authoring harness.
  const authoringActive = import.meta.env.DEV && authoring && intro && DoorwayDialKit !== null;
  const navDockActive = import.meta.env.DEV && !authoring && intro && ReaderNavDialKit !== null;
  const [engine, setEngine] = useState<FlipEngine | null>(null);
  const resetToCover = useCallback(() => setSpread(0), []);

  // The DialKit harness is lazy — pin REST synchronously so the reader starts
  // transparent (detail view showing through) rather than flashing the full ground.
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
  // Only while the hash is still the reader's: Escape during a jump lands it and
  // closes in one handler, and the render that lands it must not write
  // `#read-01/21` back over the `#item-01` the close has just set.
  useEffect(() => {
    if (authoring || !window.location.hash.startsWith(HASH_PREFIX)) return;
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

  // The one way out, however it is asked for — Escape or the pill. A jump in the
  // air lands first (instantly), then the exit plays: the reversed doorway, or an
  // immediate close for the plain path.
  const exit = useCallback(() => {
    engine?.finishJump();
    requestExit(() => closeReader());
  }, [engine, requestExit]);

  // Escape: authoring uses the dock's own transport.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (authoring) return;
      exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authoring, exit]);

  const goto = useCallback((index: number) => setSpread(index), []);

  const folio = folios[spread] ?? { kind: 'cover' as const };
  const atCover = spread === 0;
  const atBack = spread === lastSpread;

  // The chrome's paper takes its colour from the sky under it.
  const rootRef = useRef<HTMLDivElement>(null);
  useSkyChrome(rootRef, !authoring);
  // …and gives way to the book where the band under or over it is too small.
  const backRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLElement>(null);
  useChromeFit(barRef, backRef, !authoring);
  const tilt = (t: number) => ({ '--tilt': t }) as CSSProperties;

  return (
    <div className="reader" ref={rootRef}>
      {/* The way out is first in the DOM, so it is the first thing Tab reaches:
          this is a modal. None of the chrome exists while authoring over
          `#item-NN?intro` — the dock owns that screen. */}
      {!authoring && (
        <button
          type="button"
          ref={backRef}
          className="paper chrome-top reader__back"
          data-chrome="back"
          style={tilt(-1)}
          onClick={exit}
          aria-label="Back"
        >
          <ShapeFace shape="prev" flip />
        </button>
      )}
      <FlipBook
        spreads={spreads}
        spread={spread}
        onSpreadChange={goto}
        debug={debug}
        onEngineReady={setEngine}
        anims={issueAnims(issue)}
        pageAnims={issuePageAnims(issue)}
      />
      {!authoring && (
        <nav ref={barRef} className="chrome-row reader__bar" aria-label="Pages">
          <button
            type="button"
            className="paper"
            data-chrome="cover"
            style={tilt(-1)}
            disabled={atCover}
            onClick={() => engine?.turnTo(0)}
            onPointerEnter={() => engine?.prepareJump(0)}
            onFocus={() => engine?.prepareJump(0)}
            aria-label="Jump to the cover"
          >
            <ShapeFace shape="cover" />
          </button>
          <button
            type="button"
            className="paper"
            data-chrome="prev"
            style={tilt(1)}
            disabled={atCover}
            onClick={() => engine?.turn('prev')}
            aria-label="Previous spread"
          >
            <ShapeFace shape="prev" />
          </button>
          {/* The printed page numbers of the open pages, "07 | 08" — or "Cover"
              and "Back" with the book closed (issue-01.ts, spreadFolios). Not a
              control: no hover, no focus. */}
          <p
            className="paper paper--static reader__caption"
            data-chrome="spread"
            data-spread={spread + 1}
            data-spreads={spreads.length}
            data-folio={folioText(folio)}
          >
            {folio.kind === 'pages' ? (
              <PillFace numbers={folio.folios} />
            ) : (
              <PillFace fixed>{folio.kind === 'cover' ? 'Cover' : 'Back'}</PillFace>
            )}
            <span className="visually-hidden">
              {folio.kind === 'pages'
                ? `${folio.folios.length > 1 ? 'Pages' : 'Page'} ${folio.folios.map(Number).join(' and ')}`
                : folio.kind === 'cover'
                  ? 'The cover'
                  : 'The back cover'}
            </span>
          </p>
          <button
            type="button"
            className="paper"
            data-chrome="next"
            style={tilt(-1)}
            disabled={atBack}
            onClick={() => engine?.turn('next')}
            aria-label="Next spread"
          >
            <ShapeFace shape="next" />
          </button>
          <button
            type="button"
            className="paper"
            data-chrome="back-cover"
            style={tilt(1)}
            disabled={atBack}
            onClick={() => engine?.turnTo(lastSpread)}
            onPointerEnter={() => engine?.prepareJump(lastSpread)}
            onFocus={() => engine?.prepareJump(lastSpread)}
            aria-label="Jump to the back cover"
          >
            <ShapeFace shape="back-cover" />
          </button>
        </nav>
      )}
      {navDockActive && ReaderNavDialKit && (
        <Suspense fallback={null}>
          <ReaderNavDialKit />
        </Suspense>
      )}
      {authoringActive && DoorwayDialKit && (
        <Suspense fallback={null}>
          <DoorwayDialKit engine={engine} onResetToCover={resetToCover} />
        </Suspense>
      )}
    </div>
  );
}
