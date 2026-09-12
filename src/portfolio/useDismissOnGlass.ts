import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) past which a press is a drag, not a click. Matches the
 *  grid's own dead zone (`dragDeadZonePx`), so the two feel the same. */
const DEAD_ZONE = 4;

/** True when the point is outside the book — tabs and page both. */
function isOnGlass(e: ReactPointerEvent): boolean {
  const sheet = e.currentTarget as HTMLElement;
  const book = sheet.querySelector<HTMLElement>('.pv-book');
  if (!book) return true;
  const r = book.getBoundingClientRect();
  return !(e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom);
}

/**
 * Click the glass to leave.
 *
 * "The glass" is everything in the sheet outside the BOOK — the bands either
 * side of it, and above and below. The book is the document: its page is what
 * you are reading, its tabs are how you move around it, and neither dismisses.
 *
 * The test is GEOMETRIC, against the book's CURRENT rect, rather than a fixed
 * region or an event target. Asking "is this point in the book" answers for the
 * page, the tabs, a link, a video and anything a project adds later all at
 * once, with nothing to remember to opt out of — and it keeps working when the
 * book is re-laid-out by a dial or a resize.
 *
 * Both ends of the press have to be on glass: pressing on the book and
 * releasing beside it is a slip, not a dismissal, and a drag is a drag.
 */
export function useDismissOnGlass(onDismiss: () => void): {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
} {
  const downRef = useRef<{ x: number; y: number; onGlass: boolean } | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY, onGlass: isOnGlass(e) };
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down || !down.onGlass) return;
      if (Math.abs(e.clientX - down.x) > DEAD_ZONE || Math.abs(e.clientY - down.y) > DEAD_ZONE) {
        return; // a drag, not a click
      }
      if (!isOnGlass(e)) return; // released over a page
      onDismiss();
    },
    [onDismiss],
  );

  return { onPointerDown, onPointerUp };
}
