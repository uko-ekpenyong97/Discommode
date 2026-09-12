import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) past which a press is a drag, not a click. Matches the
 *  grid's own dead zone (`dragDeadZonePx`), so the two feel the same. */
const DEAD_ZONE = 4;

/** True when the point is over none of the sheet's pages. */
function isOnGlass(e: ReactPointerEvent): boolean {
  const sheet = e.currentTarget as HTMLElement;
  for (const page of sheet.querySelectorAll<HTMLElement>('.pv-page')) {
    const r = page.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) {
      return false;
    }
  }
  return true;
}

/**
 * Click the glass to leave.
 *
 * "The glass" is everything in the sheet that is not a page: the left gutter
 * the sliver stack lives in, the band to the right of the last page, and the
 * gaps between pages mid-slide. The pages themselves are the document, and the
 * close pill and the slivers are the deliberate affordances — none of them
 * dismiss.
 *
 * The test is GEOMETRIC, against each page's current rect, rather than a fixed
 * region or an event target:
 *
 *  - the row moves. During the horizontal segment a page is somewhere between
 *    two columns, and a static "gutter" region would either swallow clicks on a
 *    page that had slid over it or dismiss on one that had slid away.
 *  - a page is `overflow: hidden` and full of its own content; asking "is this
 *    point inside a page" answers for the page, its links, its video and
 *    anything a project adds later at once, with nothing to remember to opt
 *    out of.
 *
 * Both ends of the press have to be on glass: pressing on a page and releasing
 * on the gutter is a slip, not a dismissal, and a drag is a drag.
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
