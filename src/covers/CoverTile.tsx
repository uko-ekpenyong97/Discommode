import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { addPresenter, coverLiveAvailable, coverStageAvailable, sizeIdleTile } from './coverStage';
import { coverStill as clockStill, subscribeReducedMotion } from './coverClock';
import { coverStillUrl, riveCover, shaderCover } from './covers';
import { DomeSpring, heroDome } from './dome';
import { frameOf } from './frame';
import { rivePointer } from './rive/riveCover';
import type { RivePlayerRole, RivePointerKind } from './rive/riveCover';
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
  /** Draw live. False: the still only (the detail neighbours, "not live"). */
  live?: boolean;
  /**
   * Whose dome the pointer over this tile drives: 'own' (a grid tile — its own
   * spring, the others stay at rest), a shared spring (the hero's, which the
   * paper plane reads too), or null for none (the morph card).
   *
   * A Rive cover has no dome; the same prop says where its pointer goes: 'own'
   * is a grid tile (the card under the pointer moves the grid's one instance),
   * a spring is the hero (its whole panel), null is none. Hover only, both: a
   * click opens the card, and the hero's opens its project, as ever.
   */
  dome?: 'own' | DomeSpring | null;
  /** A Rive cover's player: the grid's artboard or the hero's (riveCover.ts). */
  role?: RivePlayerRole;
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
export function CoverTile({ coverId, live = true, dome = 'own', role = 'grid', className, style }: CoverTileProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [still, setStill] = useState(() => clockStill());
  useEffect(() => subscribeReducedMotion(() => setStill(clockStill())), []);

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
      role,
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
      const off = dome ? riveInput(coverId, role, host, dome === 'own' ? 'hover' : 'full') : null;
      return () => {
        off?.();
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
    const onMove = (e: PointerEvent) => {
      if (!spring || e.pointerType === 'touch') return;
      const r = host.getBoundingClientRect();
      const f = frameOf(coverId, r.width, r.height, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      spring.point(f[0], f[1]);
    };
    const onLeave = () => spring?.leave();
    // A click on a grid tile of a cover that keeps state per instance (card
    // 02's lava warmth) hands that state to the hero's dome, which the morph
    // card and the hero share: the warmth carries into the detail view and
    // eases out there, instead of the morph starting at rest.
    const def = shaderCover(coverId);
    const onDown = () => {
      if (spring && def?.instanceExtra && dome === 'own') heroDome.adopt(spring, performance.now(), def);
    };
    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerleave', onLeave);
    target.addEventListener('pointerdown', onDown);
    return () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointerdown', onDown);
      onLeave();
      remove();
      delete host.dataset.drawn;
    };
  }, [on, coverId, dome, role]);

  return (
    <div
      ref={hostRef}
      className={className ? `cover-tile ${className}` : 'cover-tile'}
      style={style}
      data-cover={coverId ?? undefined}
      data-role={coverId && riveCover(coverId) ? role : undefined}
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
 * through that crop (RivePlayer.pointer).
 *
 *   hover  a grid tile: moves while over it, an exit when it leaves — so the
 *          characters look at the hovered tile's pointer and go back to rest
 *          when there is none. No presses: a click on a tile opens the card.
 *          Read from the whole CARD, not the tile: the hover overlay's CTA
 *          sits over the tile and takes the pointer (`pointer-events: auto`),
 *          and over it the tile alone saw a leave — the characters went back
 *          to rest with the pointer still on the card.
 *   full   the hero: the same, read from the whole PANEL — under the paper
 *          the DOM face is `visibility: hidden` and takes no pointer events;
 *          its panel does. No presses here either: the cover's interactions
 *          are all hover (the headset's colour steps on pointer-ENTER), and a
 *          click on the hero opens its project, as on every portfolio card.
 */
function riveInput(id: string, role: RivePlayerRole, host: HTMLElement, mode: 'hover' | 'full'): () => void {
  const target = host.closest<HTMLElement>(mode === 'full' ? '.detail__panel' : '.grid-card') ?? host;
  const send = (kind: RivePointerKind, e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    rivePointer(id, role, kind, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width, r.height);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') send('move', e);
  };
  const onLeave = (e: PointerEvent) => send('exit', e);
  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('pointerleave', onLeave);
  return () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerleave', onLeave);
  };
}
