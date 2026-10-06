import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { addPresenter, coverLiveAvailable, coverStageAvailable, sizeIdleTile, subscribeStage } from './coverStage';
import { coverStill as clockStill, subscribeReducedMotion } from './coverClock';
import { coverStillUrl, riveCover, shaderCover } from './covers';
import { DomeSpring, detailDome } from './dome';
import { frameOf } from './frame';
import { rivePointer } from './rive/riveCover';
import type { RivePointerKind } from './rive/riveCover';
import type { Presenter } from './coverStage';
import './CoverTile.css';

interface CoverTileProps {
  /**
   * The cover, or null: a grid slot showing a card with no live cover (card
   * 01). Its tile stays mounted, canvas and all — sized, hidden — so that when
   * the grid recycles a cover into the slot mid-drag there is no canvas to
   * make or size (GridPlane).
   */
  coverId: string | null;
  /** Draw live. False: the still only (a detail side card whose cover is not
   *  live there — `coverSideLive` — and the folded cards beyond). */
  live?: boolean;
  /**
   * The instance's dome: 'own' (a grid tile — its own spring, the others stay
   * at rest), a shared spring (the cover's detail dome, `detailDome`, which
   * the paper plane reads too: the morph card, the centre card, a live side
   * card), or null for none — always at rest.
   *
   * A Rive cover has no dome; the same prop says where its pointer goes: 'own'
   * is a grid tile (the card under the pointer), a spring is the centre card
   * (its whole panel), null is none (the morph card, a side card). All of
   * them reach the cover's one instance. Hover only: a click opens the card,
   * and the centre card's opens its project, as ever.
   */
  dome?: 'own' | DomeSpring | null;
  /**
   * Whether the pointer drives it (default true). False: a detail SIDE card —
   * it shows its dome (easing back to rest, if it was the centre card a moment
   * ago) and nothing the pointer does reaches it. The pointer only ever moves
   * the centre card (docs/covers.md, "The live side card").
   */
  input?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * One on-screen instance of a live cover in the DOM: a 2D canvas the cover
 * stage copies its draw into every frame (src/covers/coverStage.ts — no
 * context of its own), over the cover's STILL. The still is what shows under
 * prefers-reduced-motion, without WebGL (a shader cover) or its runtime (a
 * Rive one), and on the first paint until the stage's first frame lands on the
 * canvas; then it is hidden.
 *
 * Transparent all the way down: whatever is behind the tile (the SkyLayer)
 * shows through the cover's ground.
 *
 * The canvas shows only once it holds a frame of THIS cover: `data-drawn` on
 * the host, set by the stage in the same task as the copy (CoverTile.css) —
 * not React state, which would show it a frame later. The stage primes a new
 * instance before the browser paints (coverStage `flushPrimes`), so a
 * recycled tile goes straight from one cover's frame to the other's; if there
 * was nothing to prime from, the still shows until its next copy lands.
 */
export function CoverTile({ coverId, live = true, dome = 'own', input = true, className, style }: CoverTileProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState(() => clockStill());
  useEffect(() => subscribeReducedMotion(() => setStill(clockStill())), []);

  // The stage is made after the first paint; if that fails, the still.
  useSyncExternalStore(subscribeStage, coverStageAvailable);
  // A canvas whenever a cover COULD be live here, so it outlives the cover in
  // it; a presenter only while this one is.
  const canvasOn = live && !still && (coverId ? coverLiveAvailable(coverId) : coverStageAvailable());
  const on = canvasOn && !!coverId && coverLiveAvailable(coverId);

  // No cover: keep the canvas a tile's size, for the next one.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (coverId || !canvasOn || !host || !canvas) return;
    sizeIdleTile(canvas, host);
  }, [coverId, canvasOn]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!on || !coverId || !host || !canvas) return;
    delete host.dataset.drawn;
    const rive = !!riveCover(coverId);
    const spring = rive ? null : dome === 'own' ? new DomeSpring() : dome;
    const p: Presenter = {
      coverId,
      host,
      canvas,
      dome: spring,
      onDrawn: () => {
        host.dataset.drawn = '';
      },
      ctx: null,
      visible: false,
      onScreen: false,
      pxW: 0,
      pxH: 0,
      drawW: 0,
      drawH: 0,
      capped: false,
      drawn: false,
      rx: 0,
      ry: 0,
      rw: 0,
      copied: -1,
    };
    const remove = addPresenter(p);
    if (rive) {
      const off = dome && input ? riveInput(coverId, host, dome === 'own' ? 'hover' : 'full') : null;
      return () => {
        off?.();
        remove();
        delete host.dataset.drawn;
      };
    }
    if (!input) {
      // A side card: its dome is drawn, never pointed. (Its last centre
      // effect's cleanup let go of it — `onLeave` below — so it eases out.)
      return () => {
        remove();
        delete host.dataset.drawn;
      };
    }
    // The pointer, in frame units: the host is an object-fit: cover crop of the
    // frame, so its box maps onto the crop. Read from the whole CARD (a grid
    // tile) or PANEL (the hero), as a Rive cover's is (riveInput, below): the
    // hover overlay's CTA sits over a tile and takes the pointer, and under
    // the paper the hero's DOM face is `visibility: hidden` and takes none.
    const target = (dome === 'own' ? host.closest<HTMLElement>('.grid-card') : host.closest<HTMLElement>('.detail__panel')) ?? host;
    // A finger is a pointer only while it is down: touch moves drive the dome
    // as a hovering mouse does, and lifting it is leaving (below), so the
    // cover eases back to rest rather than holding the last touch.
    const onMove = (e: PointerEvent) => {
      if (!spring) return;
      const r = host.getBoundingClientRect();
      const f = frameOf(coverId, r.width, r.height, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      spring.point(f[0], f[1]);
    };
    const onLeave = () => spring?.leave();
    const onLift = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') spring?.leave();
    };
    // A press on a grid tile hands its dome — card 02's lava warmth, card 03's
    // light where the pointer is — to the cover's detail dome, which the morph
    // card and the centre card share: the state carries into the detail view
    // and eases out there, instead of the morph starting at rest. (Until
    // 2026-10-06 only a cover with per-instance state handed over, and card
    // 03's light jumped to its rest as the morph began.)
    const def = shaderCover(coverId);
    const onDown = () => {
      if (spring && def && dome === 'own') detailDome(coverId).adopt(spring, performance.now(), def);
    };
    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerleave', onLeave);
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onLift);
    target.addEventListener('pointercancel', onLift);
    return () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onLift);
      target.removeEventListener('pointercancel', onLift);
      onLeave();
      remove();
      delete host.dataset.drawn;
    };
  }, [on, coverId, dome, input]);

  return (
    <div
      ref={hostRef}
      className={className ? `cover-tile ${className}` : 'cover-tile'}
      style={style}
      data-cover={coverId ?? undefined}
    >
      {coverId && (
        <img
          className="cover-tile__still"
          src={coverStillUrl(coverId, on ? 'sm' : 'full')}
          alt=""
          draggable={false}
        />
      )}
      {canvasOn && (
        <canvas ref={canvasRef} className="cover-tile__canvas" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * A Rive instance's pointer, in artboard space: the host box is an
 * `object-fit: cover` crop of the artboard, so a point across it maps back
 * through that crop (RiveInstance.pointer).
 *
 *   hover  a grid tile: moves while over it, an exit when it leaves. (Card
 *          04's file ignores the pointer while unfocused — the grid's face
 *          does not follow it, for now — but it gets every event, as a
 *          focused card would.) No presses: a click on a tile opens the card.
 *          Read from the whole CARD, not the tile: the hover overlay's CTA
 *          sits over the tile and takes the pointer (`pointer-events: auto`),
 *          and over it the tile alone saw a leave with the pointer still on
 *          the card.
 *   full   the centre card: the same, read from the whole PANEL — under the paper
 *          the DOM face is `visibility: hidden` and takes no pointer events;
 *          its panel does. No presses here either: the cover's interactions
 *          are all hover, and a click on the centre card opens its project,
 *          as on every portfolio card.
 */
function riveInput(id: string, host: HTMLElement, mode: 'hover' | 'full'): () => void {
  const target = host.closest<HTMLElement>(mode === 'full' ? '.detail__panel' : '.grid-card') ?? host;
  const send = (kind: RivePointerKind, e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    rivePointer(id, mode === 'hover' ? 'tile' : 'centre', kind, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width, r.height);
  };
  // A finger moves the characters while it is down, and lifting it is an exit.
  const onMove = (e: PointerEvent) => send('move', e);
  const onLeave = (e: PointerEvent) => send('exit', e);
  const onLift = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') send('exit', e);
  };
  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerup', onLift);
  target.addEventListener('pointercancel', onLift);
  return () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerup', onLift);
    target.removeEventListener('pointercancel', onLift);
  };
}
