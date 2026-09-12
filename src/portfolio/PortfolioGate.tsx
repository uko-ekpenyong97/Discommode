import { useEffect, useState, useSyncExternalStore } from 'react';
import PortfolioView from './PortfolioView';
import ReaderGate from '../reader/ReaderGate';
import { consumePortfolioReversed, resetPortfolioValues } from './portfolioMotion';
import { clearPortfolioOpener } from './portfolioNav';
import './PortfolioGate.css';

const PREFIX = '#view-';
/** Fade-out before the layer unmounts on an EXTERNAL close (must match the CSS). */
const FADE_OUT_MS = 200;

interface PortfolioTarget {
  project: string;
  /** 0-based page index, parsed from the 1-based `#view-NN/<page>`. */
  page: number;
  /** Dev `#view-NN?intro`: the DialKit authoring dock. */
  intro: boolean;
}

/**
 * The outermost gate, and the twin of `ReaderGate`: the app is ALWAYS mounted
 * (here, inside `ReaderGate`), and the project view mounts as a fixed layer
 * ABOVE it whenever the hash is `#view-…`. Both layers paint together, which is
 * the whole point — the scrim blurs a live grid or detail view, so the card the
 * project was opened from is still there behind the glass.
 *
 * While the view is up the app is suspended (inert) but never unmounted, so the
 * WebGL sky, the grid position and the detail view are exactly as they were on
 * close. `ReaderGate` takes that as a prop and ORs it into its own reason for
 * suspending; `#read-…` and `#view-…` are mutually exclusive hashes, so the two
 * layers are never both up.
 *
 * The view is a STATIC import, not a lazy one. It is small (the one heavy
 * dependency, the Rive runtime, is already behind its own dynamic import), and
 * the open is a storyboard that has to start on the click — a chunk fetch in
 * front of it reads as the button having done nothing.
 *
 * This is a subscription rather than a one-shot read of `location.hash`:
 * nothing else re-reads the hash for a `view-` value, so without it Escape /
 * Back / a hand-edited hash would all be dead.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

function getHash(): string {
  return window.location.hash;
}

/** `#view-02/3?intro` → the view's mount props. The page in the hash is 1-based
 *  (see `portfolioNav.ts`); anything unparseable reads as the first page. */
function parseTarget(hash: string): PortfolioTarget | null {
  if (!hash.startsWith(PREFIX)) return null;
  const [path, query = ''] = hash.slice(PREFIX.length).split('?');
  const [project, rawPage] = path.split('/');
  if (!project) return null;
  const page = Number.parseInt(rawPage ?? '', 10);
  return {
    project,
    page: Number.isFinite(page) && page > 1 ? page - 1 : 0,
    intro: query.split('&').includes('intro'),
  };
}

export default function PortfolioGate() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const target = parseTarget(hash);

  // `shown` is what's in the DOM — set SYNCHRONOUSLY from the hash so the view
  // mounts even in a background tab; it lingers through the fade-out.
  const [shown, setShown] = useState<PortfolioTarget | null>(target);
  const [exiting, setExiting] = useState(false);
  const [seenHash, setSeenHash] = useState(hash);

  if (hash !== seenHash) {
    setSeenHash(hash);
    if (target) {
      setShown(target);
      setExiting(false);
    } else if (shown) {
      setExiting(true);
    }
  }

  // Leave the layer. An in-app close has already played the CLOSE storyboard and
  // left everything at REST, so there is nothing on screen to fade — unmount at
  // once. An external close (Back, a hand-edited hash) skipped all of that, so
  // restore the baseline and fast-fade what is still painted.
  useEffect(() => {
    if (!exiting) return;
    const reversed = consumePortfolioReversed();
    const t = window.setTimeout(
      () => {
        setShown(null);
        setExiting(false);
        clearPortfolioOpener();
        resetPortfolioValues();
      },
      reversed ? 0 : FADE_OUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [exiting]);

  return (
    <>
      <ReaderGate suspended={target !== null || shown !== null} />
      {shown && (
        <div className="portfolio-layer" data-exiting={exiting || undefined}>
          <PortfolioView project={shown.project} page={shown.page} intro={shown.intro} />
        </div>
      )}
    </>
  );
}
