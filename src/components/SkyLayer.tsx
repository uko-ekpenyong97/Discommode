import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import type { EnvState } from '../env';
import { claimSky, skyEngine, setSkyTarget, skyTarget, subscribeSky } from '../sky/skyStage';
import type { SkyTarget } from '../sky/skyEngine';
import { skyFallbackCss, skyGradientAt } from '../sky/palette';
import './SkyLayer.css';

interface SkyLayerProps {
  /**
   * Live sky state from `useEnvState()`. The layer that has it DRIVES the sky;
   * a layer without it (the project view's ground) only claims the canvas and
   * shows whatever the driver is showing.
   */
  env?: EnvState;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The EnvState → sky mapping, and the whole of it. Every condition gets its own
 * element and no two share a code path:
 *
 *   cloud  cloudiness, as coverage
 *   fog    the CONDITION, 0 or 1 — not a function of cloudiness
 *   rain   precipitation
 *   storm  the CONDITION, 0 or 1
 *   wind   normalized windspeed
 *
 * FOG AND OVERCAST ARE DIFFERENT STATES and that is the point of the change.
 * They used to be one: `fog = clamp01((cloudiness - 0.85) / 0.15)`, which gave
 * WMO 3 — plain overcast, the most ordinary sky San Francisco has — the full
 * fog treatment, and left every condition converging on the same grey.
 */
function envToTarget(env: EnvState): SkyTarget {
  return {
    sun: env.sunElevation,
    dayPhase: env.dayPhase,
    cloud: clamp01(env.cloudiness),
    fog: env.condition === 'fog' ? 1 : 0,
    rain: clamp01(env.precipitation),
    storm: env.condition === 'storm' ? 1 : 0,
    wind: clamp01(env.windSpeed),
  };
}

/**
 * The sky. A full-viewport WebGL2 fragment shader driven by `EnvState`: time of
 * day sets the gradient, and each weather condition is drawn as its own layer
 * over it (see `docs/sky.md`).
 *
 * This component is a HOST, not a canvas. The canvas is shared — one context for
 * the whole app, moved between hosts by `skyStage` — because the sky is drawn
 * both behind the grid and under the paper in the project view, and two
 * contexts for one sky is two of everything. The host paints a CSS gradient of
 * the current sky behind it, which covers both the moment a host does not hold
 * the canvas and the browser that has no WebGL2 at all.
 *
 * React only feeds *targets* in (the per-frame lerp + render happen in the
 * engine, off the React path), so the per-frame grid re-renders never touch the
 * sky. `memo`'d, and `env` is a stable reference from the hook, so effects
 * re-run only when the data changes.
 */
function SkyLayer({ env }: SkyLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Claim the shared canvas for as long as this host is mounted.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return claimSky(host);
  }, []);

  // Reduced motion: a static frame, and quick transitions. Only the driving
  // layer sets it — it is a property of the one engine, not of a host.
  useEffect(() => {
    if (!env) return;
    const engine = skyEngine();
    if (!engine) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => engine.setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [env]);

  // Cross-fade toward the live EnvState whenever it changes. The first push
  // snaps, so the first paint is the real sky rather than a fade up from night.
  const firstRef = useRef(true);
  useEffect(() => {
    if (!env) return;
    setSkyTarget(envToTarget(env), firstRef.current);
    firstRef.current = false;
  }, [env]);

  // Test hook for `scripts/sky-perf.mjs`. Dev only; the whole branch is
  // constant-folded away in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV || !env) return;
    const w = window as unknown as {
      __skyBenchmark?: (n?: number, b?: number) => number[];
      __skyRenderer?: () => string;
    };
    w.__skyBenchmark = (n, b) => skyEngine()?.benchmark(n, b) ?? [];
    w.__skyRenderer = () => skyEngine()?.renderer() ?? 'none';
  }, [env]);

  // The fallback wash under the canvas, in the current sky's own colours.
  const live = useSyncExternalStore(subscribeSky, skyTarget, skyTarget);
  const gradient = skyGradientAt(live.sun, live.dayPhase === 'setting' ? 1 : 0);

  return (
    <div
      ref={hostRef}
      className="sky-layer"
      aria-hidden="true"
      style={{ background: skyFallbackCss(gradient, live.cloud) }}
    />
  );
}

export default memo(SkyLayer);
