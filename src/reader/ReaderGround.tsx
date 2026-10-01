import { useEffect, useState } from 'react';
import SkyLayer from '../components/SkyLayer';
import { READER_GROUND, setReaderGround } from './ground';
import './ReaderGround.css';

interface ReaderGroundProps {
  /**
   * True when a doorway driver owns `--doorway-table` for this mount — the
   * production entrance, or the dev authoring dock. The ground then waits for
   * the TABLE channel to arrive before it takes the canvas. False for the
   * plain reader (direct URL, reduced motion), which has no TABLE channel and
   * takes it at once.
   */
  doorwayDriven: boolean;
}

/** `--doorway-table` at 1 — or unset, which the stylesheet reads as 1. */
function tableArrived(): boolean {
  const v = document.documentElement.style.getPropertyValue('--doorway-table');
  return v === '' || Number(v) >= 1;
}

/**
 * THE READER'S GROUND IS THE SKY. The magazine used to lie on a wooden table;
 * it now lies on the same live weather as the grid, the detail view and the
 * project view — the same sky, not a copy: the app's one WebGL2 canvas, claimed
 * off the grid the way the project view's ground claims it (`skyStage.ts`), and
 * handed back on the way out. No second context, no second shader.
 *
 * Over it, one wash: `readerScrim`, a look that sets how far back the sky sits
 * behind the book. (There were two, as in the project view; the second held the
 * chrome's type to 4.5:1 in two bands, and the chrome carries its own contrast
 * now — src/chrome.)
 *
 * WHEN IT TAKES THE CANVAS is the part worth reading. The canvas can only be in
 * one place, and a crossfade between two layers that both show the sky needs
 * the sky in both. So through the doorway it does not cross-fade at all:
 *
 *   TABLE < 1   the ground holds NOTHING. It is transparent, so what is under
 *               it is the app's own sky — the live canvas, where it has always
 *               been — with the washes arriving over it at TABLE. By the time
 *               TABLE starts, CLEAR has taken the detail view's neighbours and
 *               chrome away and the cover is lying over the panel; what the
 *               wood used to cover as it arrived — the panel's drop shadow, the
 *               MiniMap — goes at 1 − TABLE (`ReaderGate.css`). What is on
 *               screen is sky, washes, book.
 *   TABLE = 1   the ground CLAIMS the canvas. Under the ground at that moment is
 *               sky and nothing else, and it is the same canvas with the same
 *               drawing buffer moving from one parent to another at the same
 *               place on screen — so the move is invisible, and from then on
 *               the reader owns its sky and covers the app completely.
 *
 * On the way out it is the same thing reversed: the first frame TABLE is under
 * 1, the canvas goes back to the app.
 *
 * The plain reader has no TABLE channel (it reads as 1), so it claims at once
 * and its layer cross-fades over the app — which, for those 250ms, shows the
 * CSS fallback of the sky where the canvas was. That is exactly what the
 * project view does on every open, and it is the price of one canvas.
 */
export default function ReaderGround({ doorwayDriven }: ReaderGroundProps) {
  // Not derived from TABLE on the first render: the doorway's driver
  // pins TABLE to 0 in a layout effect that runs after this render, so the
  // value here would still be the previous mount's (or the default 1).
  const [held, setHeld] = useState(!doorwayDriven);

  // Follow TABLE. Both drivers write it to `:root` through `applyDoorwayValues`
  // (and the reset removes it), so a mutation observer on `:root`'s style hears
  // every change in the same frame it is made, without a loop of its own. It
  // reads the VARIABLE, not the `doorway` singleton: the variable is what the
  // ground's own opacity is painted from, so the two cannot disagree.
  useEffect(() => {
    const sync = () => setHeld(tableArrived());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);

  // DEV: the dials, for the verify scripts (`reader-verify` and
  // `sky-fluid-verify` turn the flip's splat off and on through this).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __readerGround?: { dials: typeof READER_GROUND; set: typeof setReaderGround } };
    w.__readerGround = { dials: READER_GROUND, set: setReaderGround };
    return () => {
      delete w.__readerGround;
    };
  }, []);

  return (
    <div className="reader-ground" data-held={held || undefined} aria-hidden="true">
      {held && <SkyLayer />}
      <div className="reader-ground__scrim" />
    </div>
  );
}
