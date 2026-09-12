import { useDismissOnGlass } from './useDismissOnGlass';

/**
 * The glass. A full-viewport blurred scrim over EVERYTHING the app is showing —
 * the grid and the detail view both — so the card the project was opened from
 * stays where it was, visibly out of focus behind the sheet, rather than being
 * replaced by a page.
 *
 * It is `backdrop-filter`, not a painted colour: what you see through it is the
 * live app, still rendering. Opacity is driven by `--pv-scrim` (see
 * `portfolioMotion.ts`).
 *
 * It is also the thing you click to leave. The sheet covers all of it but the
 * left column, so the only pointer events it ever gets are the ones that landed
 * on glass — which makes "click outside to close" a fact about the DOM rather
 * than a rectangle someone has to keep up to date.
 */
export function Scrim({ onDismiss }: { onDismiss: () => void }) {
  const dismiss = useDismissOnGlass(onDismiss);
  return <div className="pv-scrim" {...dismiss} aria-hidden="true" />;
}
