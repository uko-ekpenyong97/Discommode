import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) past which a press is a drag, not a click. Matches the
 *  grid's own dead zone (`dragDeadZonePx`), so the two feel the same. */
const DEAD_ZONE = 4;

/**
 * Click the glass to leave.
 *
 * "The glass" is the band down the left that the sheet does not cover, where
 * the grid is just the grid. Everything else — every folder, every tab, every
 * link inside one — is the document, and none of it dismisses.
 *
 * Which is why this goes on the SCRIM rather than on the sheet, and why there
 * is no hit-testing here at all. The scrim is the full viewport with the sheet
 * over most of it, so the only pointer events it ever receives are the ones
 * that landed on glass. Asking the DOM is both simpler and more honest than
 * asking geometry: it stays right through a resize, a dial change, the sheet
 * sliding in, and anything a project puts on the page later.
 *
 * A drag is still a drag, though — a press that travels is someone selecting
 * text or changing their mind, not someone leaving.
 */
export function useDismissOnGlass(onDismiss: () => void): {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
} {
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return; // the press began somewhere else — on a folder, say
      if (Math.abs(e.clientX - down.x) > DEAD_ZONE || Math.abs(e.clientY - down.y) > DEAD_ZONE) {
        return;
      }
      onDismiss();
    },
    [onDismiss],
  );

  return { onPointerDown, onPointerUp };
}
