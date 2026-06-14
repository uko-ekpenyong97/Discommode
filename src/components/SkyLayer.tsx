import { memo, useEffect, useRef, useState } from 'react';
import type { EnvState } from '../env';
import { config } from '../config';
import { createSkyEngine } from '../sky/skyEngine';
import type { SkyEngine, SkyTarget } from '../sky/skyEngine';
import { applyFieldWeather, fieldColorsAt, fieldFallbackCss } from '../sky/palette';
import './SkyLayer.css';

interface SkyLayerProps {
  /** Live sky state from `useEnvState()` (Phase 11). */
  env: EnvState;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Derive the continuous weather amounts the renderer lerps toward. Fog is the
 * SF hero state — `condition: 'fog'`, or very high cloudiness, drives it.
 */
function envToTarget(env: EnvState): SkyTarget {
  return {
    sun: env.sunElevation,
    dayPhase: env.dayPhase,
    fog: env.condition === 'fog' ? 1 : clamp01((env.cloudiness - 0.85) / 0.15),
    cloud: clamp01(env.cloudiness),
    storm: clamp01(Math.max(env.precipitation, env.condition === 'storm' ? 0.8 : 0)),
    wind: clamp01(env.windSpeed),
  };
}

/**
 * Layer 0 — the deepest layer, behind the grid. A full-screen WebGL2 fragment
 * shader draws a slowly-drifting atmospheric color field (no horizon, no sun
 * disc) driven by `EnvState`: time of day picks the palette, weather modifies it.
 *
 * React only feeds *targets* into the imperative {@link SkyEngine} (the per-frame
 * lerp + render happen there, off the React path), so the per-frame grid
 * re-renders never touch the sky. `memo`'d, and `env` is a stable reference from
 * the hook, so effects re-run only when data changes.
 *
 * If WebGL2 is unavailable, falls back to a static CSS gradient of the current
 * (weather-modified) palette so the background is never blank.
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
    engine.setEnv(envToTarget(env), true); // snap to the current state on first paint

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMq = () => engine.setReducedMotion(mq.matches);
    syncMq();
    mq.addEventListener('change', syncMq);

    return () => {
      mq.removeEventListener('change', syncMq);
      engine.dispose();
      engineRef.current = null;
    };
    // Run once: the first state is read here; later changes go via the effect
    // below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-fade toward the live EnvState whenever it changes.
  useEffect(() => {
    engineRef.current?.setEnv(envToTarget(env));
  }, [env]);

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
    const t = envToTarget(env);
    const field = applyFieldWeather(
      fieldColorsAt(t.sun, t.dayPhase),
      { fog: t.fog, cloud: t.cloud, storm: t.storm },
      {
        fogDesaturation: config.fogDesaturation,
        fogLift: config.fogLift,
        cloudMute: config.cloudMute,
        stormDarken: config.stormDarken,
      },
    );
    return <div className="sky-layer sky-layer--fallback" style={{ background: fieldFallbackCss(field) }} />;
  }

  return <canvas ref={canvasRef} className="sky-layer" />;
}

export default memo(SkyLayer);
