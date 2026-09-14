import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) past which a press is a drag, not a click. Matches the
 *  grid's own dead zone (`dragDeadZonePx`), so the two feel the same. */
const DEAD_ZONE = 4;

/**
 * Click the ground to leave.
 *
 * "The ground" is everything the paper is not: the margin around the page, the
 * foot the close pill sits in, the letterhead's strip. Everything else — the
 * page, every block on it, every link inside one — is the document, and none of
 * it dismisses.
 *
 * This used to live on the scrim, with NO hit-testing at all: the sheet covered
 * all of the scrim but a column down the left, so the only pointer events the
 * scrim ever received were the ones that landed on glass. That does not survive
 * the ground. The ground is full-viewport and the SCROLLER is over all of it,
 * because the wheel has to work wherever the pointer is — so the scrim beneath
 * hears nothing, and the question has to be asked one level up.
 *
 * It is still asked of the DOM rather than of geometry, which is the part worth
 * keeping: `closest('.pv-page')` stays right through a resize, a dial change,
 * an exit that shrinks the page to 58%, and anything a project puts on the page
 * later. A rectangle would need keeping up to date with all four.
 *
 * A drag is still a drag, though — a press that travels is someone selecting
 * text or changing their mind, not someone leaving.
 */
export function useDismissOnGround(onDismiss: () => void): {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
} {
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const onGround = (e: ReactPointerEvent): boolean =>
    !(e.target as Element | null)?.closest?.('.pv-page');

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    downRef.current = onGround(e) ? { x: e.clientX, y: e.clientY } : null;
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return; // the press began on the page
      if (!onGround(e)) return; // …and it has to end on the ground too
      if (Math.abs(e.clientX - down.x) > DEAD_ZONE || Math.abs(e.clientY - down.y) > DEAD_ZONE) {
        return;
      }
      onDismiss();
    },
    [onDismiss],
  );

  return { onPointerDown, onPointerUp };
}
