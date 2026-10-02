import { DialStore } from 'dialkit';
import { CONTENT } from '../content';
import { whenSettled } from '../activity';

/**
 * WHICH PANELS ARE OPEN in a dev dock — every dock (the app's at `?intro`, the
 * doorway's at `#item-NN?intro`, READER NAV at `#read-NN?intro`, the
 * portfolio view's at `#view-NN?intro`).
 *
 * Collapsed, every panel, except:
 *   - a dock's OWN panels: DOORWAY, READER NAV, and the portfolio view's PV …;
 *   - the panels of the VIEW on screen: in a detail view (`#item-NN`, with or
 *     without the doorway over it) DETAIL PAPER, plus LAVA at card 02 and
 *     COVER LIFE at card 01.
 *
 * Why: DialKit's dock is one tree, and its root folder re-renders whenever its
 * content's height changes (a ResizeObserver). With every panel open that was
 * ~15,000 px of controls — 85 animated subtrees — and 50 ms commits, four in a
 * row, each time a readout's text wrapped differently or a key was pressed. A
 * collapsed panel renders its header only, so a re-render of the dock is a
 * list of headers.
 *
 * On a change of view the view's panels open and the last view's close, once
 * the move has settled (nothing mounts controls under an arrival or a slide).
 * A panel opened or closed BY HAND is left as it was put from then on.
 *
 * Dev-only: imported by the docks, all behind `import.meta.env.DEV` imports.
 */

const OWN = (name: string) => name === 'DOORWAY' || name === 'READER NAV' || name.startsWith('PV ');

/** The panels the view on screen opens. */
function viewPanels(): Set<string> {
  const slug = window.location.hash.replace(/^#/, '').split('?')[0];
  const item = CONTENT.find((c) => c.slug === slug);
  const out = new Set<string>();
  if (!item) return out;
  out.add('DETAIL PAPER');
  if (item.issue === '01') out.add('COVER LIFE');
  if (item.cover?.id === 'rive-site') out.add('LAVA');
  return out;
}

const wantOpen = (name: string, view: Set<string>) => OWN(name) || view.has(name);

let installed = false;
const byHand = new Set<string>();
let applying = false;

function set(id: string, open: boolean) {
  if (DialStore.getPanelOpen(id) === open) return;
  applying = true;
  try {
    DialStore.setPanelOpen(id, open);
  } finally {
    applying = false;
  }
}

/** Decide every panel with no open state yet: at registration, before any
 *  dock has rendered it (so no panel ever mounts its controls only to fold
 *  them). A panel without a stable id loses its state when it unregisters —
 *  StrictMode's double mount, a host remounting — and is decided again. */
function decideNew() {
  const view = viewPanels();
  for (const p of DialStore.getPanels()) {
    if (DialStore.getPanelOpen(p.id) !== undefined) continue;
    byHand.delete(p.id);
    set(p.id, wantOpen(p.name, view));
  }
}

let cancelSettle: (() => void) | null = null;
function onRoute() {
  cancelSettle?.();
  // Not in the navigation's own task: the arrival or the slide it starts is
  // not busy yet (its phase lands with the next render). Look a moment later,
  // then wait for the move to settle, then for an idle moment.
  let cancelled = false;
  let cancelWait = () => {};
  const t = window.setTimeout(() => {
    cancelWait = whenSettled(() => {
      const id = window.requestIdleCallback(() => {
        if (cancelled) return;
        cancelSettle = null;
        const view = viewPanels();
        for (const p of DialStore.getPanels()) {
          if (byHand.has(p.id)) continue;
          set(p.id, wantOpen(p.name, view));
        }
      });
      cancelWait = () => window.cancelIdleCallback(id);
    });
  }, 250);
  cancelSettle = () => {
    cancelled = true;
    window.clearTimeout(t);
    cancelWait();
  };
}

/** Install the policy (idempotent). Called by each dock as its module loads,
 *  before its panels register. */
export function installDockPanels(): void {
  if (installed) return;
  installed = true;
  DialStore.subscribeGlobal(decideNew);
  DialStore.subscribePanelOpen((id) => {
    if (!applying) byHand.add(id);
  });
  // The app moves between views with pushState, which fires neither
  // `hashchange` nor `popstate`; the Navigation API sees every change.
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  if (nav) nav.addEventListener('currententrychange', onRoute);
  else {
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
  }
  decideNew();
}
