import { useEffect, useState, useSyncExternalStore } from 'react';
import App from '../App';
import ReaderPage from './ReaderPage';
import { clearOpener, hasOpener } from './readerNav';
import { consumeDoorwayReversed, resetDoorwayValues } from './doorway';
import { issueForSlug } from '../content';
import './ReaderGate.css';

const PREFIX = '#read-';
/** Fade-out duration before the reader layer unmounts (must match the CSS). */
const FADE_OUT_MS = 200;

/** The props the reader layer mounts with, parsed from the hash. */
interface ReaderTarget {
  issue: string;
  debug: boolean;
  intro: boolean;
  /** Dev `#item-NN?intro`: mounted OVER the detail view for doorway authoring. */
  authoring: boolean;
}

/**
 * The app entry point and reader layering. The app is ALWAYS mounted; the reader
 * mounts as a fixed layer ABOVE it (z-index 40) whenever the hash is `#read-…`,
 * and both layers paint together so the doorway entrance (4c-2) can choreograph
 * the crossover. While the reader is up the app is suspended (inert) but never
 * unmounts — so the WebGL sky and detail view are exactly as they were on close.
 *
 * Three mount flavours:
 *  - ENTRANCE  `#read-NN` opened from an item, motion allowed → the storyboarded
 *              doorway (driven in `ReaderPage`); the gate adds no crossfade.
 *  - PLAIN     direct `#read-NN` URL or reduced motion → the quick CSS crossfade.
 *  - AUTHORING dev `#item-NN?intro` → the DialKit doorway harness over the frozen
 *              detail view; no crossfade, no hash mutation.
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
 *  slash is ReaderPage's business; the gate only needs the issue id and flags.
 *  In DEV also recognises `#item-NN?intro` → the doorway authoring harness. */
function parseTarget(hash: string): ReaderTarget | null {
  if (hash.startsWith(PREFIX)) {
    const [path, query = ''] = hash.slice(PREFIX.length).split('?');
    const id = path.split('/')[0];
    const flags = query.split('&');
    return { issue: id, debug: flags.includes('debug'), intro: flags.includes('intro'), authoring: false };
  }
  if (import.meta.env.DEV && hash.startsWith('#')) {
    const [slug, query = ''] = hash.slice(1).split('?');
    const flags = query.split('&');
    if (flags.includes('intro')) {
      const issue = issueForSlug(slug);
      if (issue) return { issue, debug: flags.includes('debug'), intro: true, authoring: true };
    }
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ReaderGate() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const target = parseTarget(hash);

  // `shown` is what's in the DOM — set SYNCHRONOUSLY from the hash so the reader
  // mounts even in a background tab; it lingers through the fade-out. `exiting`
  // drives the fade-out; `animateIn` gates the fade-IN of the PLAIN path.
  const [shown, setShown] = useState<ReaderTarget | null>(target);
  const [exiting, setExiting] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [seenHash, setSeenHash] = useState(hash);

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

  // Leave the layer. When the doorway already reversed (an in-app Escape), the
  // cover is still opaque over the identical detail panel, so unmount at once
  // (0ms) — no fade over the cover, so it stays fully opaque on every exit frame
  // and the swap to the panel is invisible; the driver's own unmount resets the
  // vars. Otherwise (Back / hand-edited hash) restore the baseline now and
  // fast-fade over FADE_OUT_MS.
  useEffect(() => {
    if (!exiting) return;
    const reversed = consumeDoorwayReversed();
    if (!reversed) resetDoorwayValues();
    const t = window.setTimeout(
      () => {
        setShown(null);
        setExiting(false);
        clearOpener();
      },
      reversed ? 0 : FADE_OUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [exiting]);

  // The doorway entrance plays only when opened from an item with motion allowed;
  // authoring and direct/reduced-motion loads do not. The PLAIN crossfade runs
  // only when there is no doorway to own the appearance.
  const authoring = shown?.authoring ?? false;
  const entrance = !!shown && !authoring && hasOpener() && !prefersReducedMotion();
  const plain = !!shown && !authoring && !entrance;

  return (
    <>
      <App suspended={target !== null || shown !== null} />
      {shown && (
        <div
          className="reader-layer"
          data-enter={(animateIn && !exiting && plain) || undefined}
          data-exiting={exiting || undefined}
        >
          <ReaderPage
            issue={shown.issue}
            debug={shown.debug}
            intro={shown.intro}
            authoring={authoring}
            entrance={entrance}
          />
        </div>
      )}
    </>
  );
}
