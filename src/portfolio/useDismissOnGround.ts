import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) past which a press is a drag, not a click. Matches the
 *  grid's own dead zone (`dragDeadZonePx`), so the two feel the same. */
const DEAD_ZONE = 4;

/** What is NOT ground: the paper, and the letterhead strip. */
const NOT_GROUND = '.pv-page, .pv-letterhead';

/**
 * Click the ground to leave.
 *
 * "The ground" is the field around the paper: the margin around the page and
 * the dwell's empty screen. Two things are not ground. The PAGE is the
 * document — every block on it, every link inside one — and none of it
 * dismisses. The LETTERHEAD is the view's chrome, and none of it dismisses
 * either, dead space included.
 *
 * The letterhead used to count as ground, with its buttons stopping their own
 * pointer events so a press on a number did not also close the view. Its dead
 * space closed the view by design. That space is the 10px between two 21px
 * numbers and the 17px above and below them, so a press a few pixels off a
 * number left the view instead of scrolling. Measured with real mouse presses:
 * 0 closes in 240 presses inside the buttons, 9 in 120 aimed at them with a
 * hand's ±5px of scatter. Every one of the nine had its press and its release
 * on the same dead element, so the strip moving under the pointer, the number
 * being re-rendered, and a stray handler were all ruled out. The stopped
 * events also left `downRef` holding whatever press came before, so a press
 * that STARTED on a number and was released on the margin closed the view as
 * well.
 *
 * So the strip is chrome here, where the question is asked, and every press is
 * seen: a press that begins on chrome clears the state rather than leaving the
 * last one's behind.
 *
 * This used to live on the scrim, with NO hit-testing at all: the sheet covered
 * all of the scrim but a column down the left, so the only pointer events the
 * scrim ever received were the ones that landed on glass. That does not survive
 * the ground. The ground is full-viewport and the SCROLLER is over all of it,
 * because the wheel has to work wherever the pointer is — so the scrim beneath
 * hears nothing, and the question has to be asked one level up.
 *
 * It is still asked of the DOM rather than of geometry, which is the part worth
 * keeping: `closest()` stays right through a resize, a dial change, and
 * anything a project puts on the page later. A rectangle would need keeping up
 * to date with all of it.
 *
 * A drag is still a drag, though — a press that travels is someone selecting
 * text or changing their mind, not someone leaving.
 */
export function useDismissOnGround(onDismiss: () => void): {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
} {
  const downRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const onGround = (e: ReactPointerEvent): boolean =>
    !(e.target as Element | null)?.closest?.(NOT_GROUND);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // Every press replaces the last one, including a press on the page or the
    // strip. Otherwise a press that begins there leaves the previous press's
    // position behind for this press's release to be measured against.
    downRef.current = onGround(e) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down || down.id !== e.pointerId) return; // the press began off the ground
      if (!onGround(e)) return; // …and it has to end on the ground too
      if (Math.abs(e.clientX - down.x) > DEAD_ZONE || Math.abs(e.clientY - down.y) > DEAD_ZONE) {
        return;
      }
      // DEV: the letterhead soak in `pv-verify` listens for this, so a close it
      // did not ask for is attributed to THIS path rather than inferred from
      // the hash.
      if (import.meta.env.DEV) window.dispatchEvent(new CustomEvent('pv:dismiss'));
      onDismiss();
    },
    [onDismiss],
  );

  // A press the browser took away (a touch turned into a scroll, a window
  // switch) is not a press that ended anywhere.
  const onPointerCancel = useCallback(() => {
    downRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
