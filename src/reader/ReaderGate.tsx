import { useEffect, useState, useSyncExternalStore } from 'react';
import App from '../App';
import ReaderPage from './ReaderPage';
import { clearOpener } from './readerNav';
import './ReaderGate.css';

const PREFIX = '#read-';
/** Fade-out duration before the reader layer unmounts (must match the CSS). */
const FADE_OUT_MS = 200;

/** The props the reader layer mounts with, parsed from the hash. */
interface ReaderTarget {
  issue: string;
  debug: boolean;
  intro: boolean;
}

/**
 * The app entry point and reader layering (Step 4c-1). The app is ALWAYS
 * mounted; the reader mounts as a fixed layer ABOVE it (z-index 40, over the
 * detail/morph/minimap stack) whenever the hash is `#read-…`, and both layers
 * paint together during the crossfade so 4c-2 can replace it with a storyboarded
 * entrance. While the reader is up the app is suspended (inert) but never
 * unmounts — so the WebGL sky and detail view are exactly as they were on close.
 *
 * This is a subscription rather than a one-shot read of `location.hash`: nothing
 * else re-reads the hash for a `read-` value, so without it Escape / Back / a
 * hand-edited hash would all be dead.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

// NB: unlike useDetail's hashSlug(), this keeps the leading '#'.
function getHash(): string {
  return window.location.hash;
}

/** `#read-01/5?debug&intro` → the reader's mount props. The spread after the
 *  slash is ReaderPage's business; the gate only needs the issue id and flags. */
function parseTarget(hash: string): ReaderTarget | null {
  if (!hash.startsWith(PREFIX)) return null;
  const [path, query = ''] = hash.slice(PREFIX.length).split('?');
  const id = path.split('/')[0];
  const flags = query.split('&');
  return { issue: id, debug: flags.includes('debug'), intro: flags.includes('intro') };
}

export default function ReaderGate() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const target = parseTarget(hash);

  // `shown` is what's in the DOM — set SYNCHRONOUSLY from the hash so the reader
  // mounts even in a background tab (no requestAnimationFrame in the path); it
  // lingers through the fade-out. `exiting` drives the fade-out; `animateIn` gates
  // the fade-IN so a direct load at `#read-…` appears instantly, not over a
  // mounting app. The fade itself is a CSS animation (see ReaderGate.css).
  const [shown, setShown] = useState<ReaderTarget | null>(target);
  const [exiting, setExiting] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [seenHash, setSeenHash] = useState(hash);

  // Adjust state during render on a hash change (React's sanctioned pattern — it
  // re-renders before paint, so the mount is synchronous). Opening mounts the
  // reader now; closing keeps it mounted and flags the fade-out.
  if (hash !== seenHash) {
    setSeenHash(hash);
    if (target) {
      setShown(target);
      setExiting(false);
      setAnimateIn(true);
    } else if (shown) {
      setExiting(true);
    }
  }

  // Unmount after the fade-out (timer, not rAF, so it still fires in a hidden
  // tab). A re-open flips `exiting` false, whose cleanup cancels the timer.
  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => {
      setShown(null);
      setExiting(false);
      clearOpener();
    }, FADE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [exiting]);

  // Suspend the app the instant the hash says `#read-…` (target present) and keep
  // it suspended while the layer lingers through its fade-out — no input gap.
  return (
    <>
      <App suspended={target !== null || shown !== null} />
      {shown && (
        <div
          className="reader-layer"
          data-enter={(animateIn && !exiting) || undefined}
          data-exiting={exiting || undefined}
        >
          <ReaderPage issue={shown.issue} debug={shown.debug} intro={shown.intro} />
        </div>
      )}
    </>
  );
}
