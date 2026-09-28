import { useDialKit } from 'dialkit';
import { resetDials } from './dialState';

/**
 * The DIALS panel: one button, "Reset dials" — every saved dial on this origin
 * deleted (every panel's, and the app's own) and the page reloaded on the
 * defaults (dialState.ts). The first thing to try when a feature looks dead on
 * one port and alive on another: saved dials are per port, and every
 * workspace's dev server takes the ports in turn.
 *
 * Registered from the COVER host (coverDials.tsx), which App mounts in dev
 * whether or not the view is suspended, so it shows in every dock.
 */
export function useResetDialsPanel(): void {
  useDialKit(
    'DIALS',
    { reset: { type: 'action', label: 'Reset dials' } },
    {
      onAction: (action) => {
        if (action === 'reset' && confirm('Reset every saved dial on this port to its default, and reload?')) resetDials();
      },
    },
  );
}
