import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { addPresenter, coverLiveAvailable } from './coverStage';
import { coverStill as clockStill, subscribeReducedMotion } from './coverClock';
import { coverStillUrl, riveCover } from './covers';
import { DomeSpring } from './dome';
import { frameOf } from './frame';
import { rivePlayer } from './rive/riveCover';
import type { RivePlayerRole, RivePointerKind } from './rive/riveCover';
import type { Presenter } from './coverStage';
import './CoverTile.css';

interface CoverTileProps {
  coverId: string;
  /** Draw live. False: the still only (the detail neighbours, "not live"). */
  live?: boolean;
  /**
   * Whose dome the pointer over this tile drives: 'own' (a grid tile — its own
   * spring, the others stay at rest), a shared spring (the hero's, which the
   * paper plane reads too), or null for none (the morph card).
   *
   * A Rive cover has no dome; the same prop says where its pointer goes: 'own'
   * is a grid tile (hover only: the tile under the pointer moves the grid's one
   * instance, and a click opens the card as ever), a spring is the hero (move,
   * press and release, from the whole panel), null is none.
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
 */
export function CoverTile({ coverId, live = true, dome = 'own', role = 'grid', className, style }: CoverTileProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [still, setStill] = useState(() => clockStill());
  useEffect(() => subscribeReducedMotion(() => setStill(clockStill())), []);

  const on = live && !still && coverLiveAvailable(coverId);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!on || !host || !canvas) return;
    const rive = !!riveCover(coverId);
    const spring = rive ? null : dome === 'own' ? new DomeSpring() : dome;
    const p: Presenter = {
      coverId,
      role,
      host,
      canvas,
      dome: spring,
      onDrawn: () => setDrawn(true),
      ctx: null,
      visible: false,
      onScreen: false,
      pxW: 0,
      pxH: 0,
      drawn: false,
    };
    const remove = addPresenter(p);
    if (rive) {
      const off = dome ? riveInput(coverId, role, host, dome === 'own' ? 'hover' : 'full') : null;
      return () => {
        off?.();
        remove();
      };
    }
    // The pointer, in frame units: the host is an object-fit: cover crop of the
    // frame, so its box maps onto the crop.
    const onMove = (e: PointerEvent) => {
      if (!spring || e.pointerType === 'touch') return;
      const r = host.getBoundingClientRect();
      const f = frameOf(coverId, r.width, r.height, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      spring.point(f[0], f[1]);
    };
    const onLeave = () => spring?.leave();
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      onLeave();
      remove();
    };
  }, [on, coverId, dome, role]);

  return (
    <div ref={hostRef} className={className ? `cover-tile ${className}` : 'cover-tile'} style={style} data-cover={coverId} data-role={riveCover(coverId) ? role : undefined}>
      <img
        className="cover-tile__still"
        src={coverStillUrl(coverId, on ? 'sm' : 'full')}
        alt=""
        draggable={false}
        style={on && drawn ? { visibility: 'hidden' } : undefined}
      />
      {on && <canvas ref={canvasRef} className="cover-tile__canvas" aria-hidden="true" />}
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
 *   full   the hero: moves, presses and releases (the headset's click), read
 *          from the whole PANEL. Under the paper the DOM face is
 *          `visibility: hidden` and takes no pointer events; its panel does.
 */
function riveInput(id: string, role: RivePlayerRole, host: HTMLElement, mode: 'hover' | 'full'): () => void {
  const target = mode === 'full' ? (host.closest<HTMLElement>('.detail__panel') ?? host) : host;
  const send = (kind: RivePointerKind, e: PointerEvent) => {
    const player = rivePlayer(id, role);
    if (!player) return;
    const r = host.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    player.pointer(kind, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width, r.height);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') send('move', e);
  };
  const onLeave = (e: PointerEvent) => send('exit', e);
  const onDown = (e: PointerEvent) => send('down', e);
  const onUp = (e: PointerEvent) => send('up', e);
  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('pointerleave', onLeave);
  if (mode === 'full') {
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onUp);
  }
  return () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointerup', onUp);
  };
}
