import { memo, useEffect, useRef, useState } from 'react';
import type { EnvState } from '../env';
import { config } from '../config';
import { createSkyEngine } from '../sky/skyEngine';
import type { SkyEngine } from '../sky/skyEngine';
import { gradientCss, paletteAt } from '../sky/palette';
import './SkyLayer.css';

interface SkyLayerProps {
  /** Live sky state from `useEnvState()` (Phase 11). */
  env: EnvState;
}

/**
 * Layer 0 — the deepest layer, behind the grid. A full-screen WebGL2 fragment
 * shader draws a day-night gradient + sun disc driven by `env.sunElevation`.
 * Replaces the old dot-matrix BackgroundLayer.
 *
 * React only feeds *targets* into the imperative {@link SkyEngine} (the per-frame
 * lerp + render happen there, off the React path), so the per-frame grid
 * re-renders never touch the sky. The component is `memo`'d and `env` is a
 * stable reference from the hook, so it re-runs effects only when data changes.
 *
 * Optional cursor parallax (default off, `skyParallax` 0) feeds `uParallax` via
 * the engine — the sky's reuse of the old background cursor-parallax idea, now
 * as a uniform instead of a DOM transform (the canvas can't be translated).
 *
 * If WebGL2 is unavailable, falls back to a static CSS linear-gradient of the
 * current palette so the background is never blank.
 */
function SkyLayer({ env }: SkyLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SkyEngine | null>(null);
  const [fallback, setFallback] = useState(false);

  // Create the engine once. On WebGL2 failure, flip to the CSS fallback.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createSkyEngine(canvas);
    if (!engine) {
      console.warn('[sky] WebGL2 unavailable — using CSS gradient fallback.');
      setFallback(true);
      return;
    }
    engineRef.current = engine;
    // Snap to the current elevation on first paint (no cross-fade from 0).
    engine.setSun(env.sunElevation, true);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMq = () => engine.setReducedMotion(mq.matches);
    syncMq();
    mq.addEventListener('change', syncMq);

    return () => {
      mq.removeEventListener('change', syncMq);
      engine.dispose();
      engineRef.current = null;
    };
    // Run once: the first elevation is read here; later changes go via the effect
    // below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-fade toward the live elevation whenever EnvState changes.
  useEffect(() => {
    engineRef.current?.setSun(env.sunElevation);
  }, [env.sunElevation]);

  // Optional cursor-Y parallax (off by default). Tracks the pointer and feeds
  // the eased target; the engine lerps + renders it.
  useEffect(() => {
    if (fallback) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const ny = (e.clientY / window.innerHeight) * 2 - 1; // -1 top, +1 bottom
      engineRef.current?.setParallax(-ny * config.skyParallax);
    };
    const onLeave = () => engineRef.current?.setParallax(0);
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [fallback]);

  if (fallback) {
    return (
      <div
        className="sky-layer sky-layer--fallback"
        style={{ background: gradientCss(paletteAt(env.sunElevation)) }}
      />
    );
  }

  return <canvas ref={canvasRef} className="sky-layer" />;
}

export default memo(SkyLayer);
