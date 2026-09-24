import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { addPresenter, coverStageAvailable } from './coverStage';
import { coverStill as clockStill, subscribeReducedMotion } from './coverClock';
import { coverStillUrl } from './covers';
import { DomeSpring } from './dome';
import { frameOf } from './frame';
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
   */
  dome?: 'own' | DomeSpring | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * One on-screen instance of a live cover in the DOM: a 2D canvas the cover
 * stage copies its draw into every frame (src/covers/coverStage.ts — no
 * context of its own), over the cover's STILL. The still is what shows under
 * prefers-reduced-motion, without WebGL, and on the first paint until the
 * stage's first frame lands on the canvas; then it is hidden.
 *
 * Transparent all the way down: whatever is behind the tile (the SkyLayer)
 * shows through the cover's ground.
 */
export function CoverTile({ coverId, live = true, dome = 'own', className, style }: CoverTileProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [still, setStill] = useState(() => clockStill());
  useEffect(() => subscribeReducedMotion(() => setStill(clockStill())), []);

  const on = live && !still && coverStageAvailable();

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!on || !host || !canvas) return;
    const spring = dome === 'own' ? new DomeSpring() : dome;
    const p: Presenter = {
      coverId,
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
  }, [on, coverId, dome]);

  return (
    <div ref={hostRef} className={className ? `cover-tile ${className}` : 'cover-tile'} style={style}>
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

