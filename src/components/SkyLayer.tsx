import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import type { EnvState } from '../env';
import { claimSky, releaseSky, setSkyTarget, skyEngine, skyTarget, subscribeSky } from '../sky/skyStage';
import { envToTarget } from '../sky/envToTarget';
import type { MoonAt, SkyTarget } from '../sky/skyEngine';
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

  // Claim the shared canvas for as long as this host is mounted — and RE-ASSERT
  // that claim on every render, not only on mount.
  //
  // The canvas is not this component's. It can be replaced underneath a
  // component React has no reason to re-run an effect for, which is exactly
  // what a dev hot-swap of the stage does: a fresh module builds a fresh canvas
  // and a fresh engine, a mount-only claim never runs, and so the new canvas is
  // never put in the DOM. What stays on screen is the previous one — detached
  // from its driver, frozen on its last frame, while the readout beside it goes
  // on reporting the state nobody is drawing. `claimSky` is idempotent, so
  // saying it every render costs an `includes` and closes that hole.
  useEffect(() => {
    const host = hostRef.current;
    if (host) claimSky(host);
  });

  // …and hand it back on unmount, which is the only time it should move.
  useEffect(() => {
    const host = hostRef.current;
    return () => {
      if (host) releaseSky(host);
    };
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

  // Cross-fade toward the live EnvState. The first push snaps, so the first
  // paint is the real sky rather than a fade up from night.
  //
  // NO DEPENDENCY ARRAY, DELIBERATELY. The obvious form of this is keyed on
  // `[env]`, and it is wrong in one specific way: the engine is not owned by
  // this component. It is created lazily by whichever host claims the shared
  // canvas first, and it can be REPLACED underneath a component that React has
  // no reason to re-render — which is exactly what a dev hot-swap of the stage
  // does. The result is a live readout over a sky frozen at the engine's
  // constructor state, with the override reaching neither.
  //
  // So the invariant is stated rather than inferred: after any render, the
  // engine holds this layer's env. `setSkyTarget` compares before it publishes,
  // so a push that changes nothing costs an assignment and does not re-render.
  const firstRef = useRef(true);
  useEffect(() => {
    if (!env) return;
    setSkyTarget(envToTarget(env), firstRef.current);
    firstRef.current = false;
  });

  // Test hook for `scripts/sky-perf.mjs`. Dev only; the whole branch is
  // constant-folded away in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV || !env) return;
    const w = window as unknown as {
      __skyBenchmark?: (n?: number, b?: number, withFluid?: boolean) => number[];
      __skyRenderer?: () => string;
      __skyPinTime?: (s: number | null) => void;
      __skyFluidAwake?: () => boolean;
      __skyHoldFluid?: (hold: boolean) => void;
      __skySplat?: (x: number, y: number, dx: number, dy: number, strength?: number) => void;
      __skyMoonAt?: (at?: SkyTarget) => MoonAt | null;
    };
    w.__skyBenchmark = (n, b, f) => skyEngine()?.benchmark(n, b, f) ?? [];
    w.__skyRenderer = () => skyEngine()?.renderer() ?? 'none';
    // For `scripts/sky-fluid-verify.mjs`: a still clock, so two captures differ
    // only by what the wake did, and whether the wake has gone back to sleep.
    w.__skyPinTime = (s) => skyEngine()?.pinTime(s);
    w.__skyFluidAwake = () => skyEngine()?.fluidAwake() ?? false;
    w.__skyHoldFluid = (hold) => skyEngine()?.holdFluid(hold);
    w.__skySplat = (x, y, dx, dy, s) => skyEngine()?.splat(x, y, dx, dy, s);
    // Where the disc is, so a screenshot can be told where to look for it and
    // the contrast probe can centre its band on it. One constant, one owner.
    w.__skyMoonAt = (at) => skyEngine()?.moonAt(at) ?? null;
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
