import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import { installDockPanels } from './dockPanels';

// Before any panel is shown: which open, which stay folded (dockPanels.ts).
installDockPanels();

/**
 * The app's dev dock: DialKit's UI over the panels DevPanels registers (and
 * every other host's — the COVER panels, DIALS). Mounted by App only with
 * `?intro` in the query (`/?intro`, `/?intro#item-NN`), and not while the
 * reader or the portfolio view is up. Without it the panels still apply their
 * saved values; there is just nothing on screen to re-render.
 *
 * Dev-only: behind App's `import.meta.env.DEV` import, with `dialkit`.
 */
export default function DevDock() {
  return <DialRoot position="top-right" />;
}
