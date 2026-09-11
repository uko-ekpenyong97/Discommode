/**
 * The glass. A full-viewport blurred scrim over EVERYTHING the app is showing —
 * the grid and the detail view both — so the hero card the project was opened
 * from stays where it was, visibly out of focus behind the sheet, rather than
 * being replaced by a page.
 *
 * It is `backdrop-filter`, not a painted colour: what you see through it is the
 * live app, still rendering. Opacity is driven by `--pv-scrim` (see
 * `portfolioMotion.ts`); clicking it closes, the way the detail view's backdrop
 * does.
 */
export function Scrim({ onDismiss }: { onDismiss: () => void }) {
  return <div className="pv-scrim" onClick={onDismiss} aria-hidden="true" />;
}
