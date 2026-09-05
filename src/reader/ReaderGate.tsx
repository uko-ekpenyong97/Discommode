import { useSyncExternalStore } from 'react';
import App from '../App';
import ReaderPage from './ReaderPage';

const PREFIX = '#read-';

/**
 * The app entry branch. `#read-NN` renders the reader INSTEAD of the app, so
 * the grid unmounts entirely — otherwise `usePanController`'s window-level
 * arrow-key handler and `useEnvState`'s polling would both keep running under
 * the reader.
 *
 * This has to be a subscription rather than a one-shot read of `location.hash`:
 * nothing else in the app re-reads the hash for a `read-` value, so without it
 * both Escape (which clears the hash) and the browser Back button are dead.
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

export default function ReaderGate() {
  const hash = useSyncExternalStore(subscribe, getHash);
  if (!hash.startsWith(PREFIX)) return <App />;

  // `#read-01`, `#read-01/5`, `#read-01/5?debug`. The spread after the slash is
  // ReaderPage's business; the gate only needs the issue id and the flags.
  const [path, query = ''] = hash.slice(PREFIX.length).split('?');
  const id = path.split('/')[0];
  const debug = query.split('&').includes('debug');
  return <ReaderPage issue={id} debug={debug} />;
}
