/**
 * The scrim: a dark tint over EVERYTHING the app is showing — the grid and the
 * detail view both — so the card the project was opened from stays where it
 * was, behind it.
 *
 * A TINT, and nothing else. The `backdrop-filter` went with the frosted page:
 * the ground is opaque and full-viewport, so past the 600ms of the open there is
 * nothing to see through the scrim, and a backdrop root maintained for the whole
 * time the view is open is a cost with nothing on the other side of it.
 *
 * It is no longer the thing you click to leave. The ground is full-viewport and
 * the scroller has to hear the wheel over all of it, so the scrim gets no
 * pointer events at all — the dismiss moved onto the pane, where one DOM test
 * separates the ground from the page. See `useDismissOnGround`.
 */
export function Scrim() {
  return <div className="pv-scrim" aria-hidden="true" />;
}
