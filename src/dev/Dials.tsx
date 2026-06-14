import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { DialRoot, DialStore, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import { DEFAULTS, config, setConfig } from '../config';
import type { LiveConfig } from '../config';
import { setEnvOverride } from '../env';
import type { Condition, EnvState } from '../env';

/** Conditions in WMO-ish order, indexed by the `previewCondition` dial. */
const CONDITIONS: Condition[] = ['clear', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

/** Build a forced EnvState for the sky preview (Phase 12). */
function previewEnv(sunElevation: number, condition: Condition): EnvState {
  return {
    sunElevation,
    isDay: sunElevation > 0.15,
    condition,
    cloudiness: 0,
    precipitation: 0,
    windSpeed: 0,
    rawWeatherCode: -1,
    fetchedAt: Date.now(),
  };
}

/**
 * Dev-only DialKit panel for live feel/layout tuning. This whole module is
 * loaded behind an `import.meta.env.DEV` dynamic import (see App), so it and the
 * `dialkit` dependency are tree-shaken out of production builds entirely.
 *
 * Dial values flow into the reactive config store ([setConfig]) so every change
 * propagates live; they also persist to localStorage so a tuning session
 * survives reloads, and "Copy config" emits a paste-ready snippet for promoting
 * the final numbers into DEFAULTS.
 *
 * Memoised (no props) so the per-frame App re-renders don't re-run the effect;
 * it re-renders only when DialKit's own store changes a value.
 */
const STORAGE_KEY = 'discommode-dials';

function loadPersisted(): Partial<LiveConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<LiveConfig>) : {};
  } catch {
    return {};
  }
}

function Dials() {
  // Restore persisted values as each dial's starting point (defaults otherwise).
  const start = useMemo<LiveConfig>(() => ({ ...DEFAULTS, ...loadPersisted() }), []);

  const motion = useDialKit('MOTION', {
    snapMs: [start.snapMs, 100, 1500],
    flickThreshold: [start.flickThreshold, 0.3, 4],
    momentumFactor: [start.momentumFactor, 0.05, 0.8],
    maxFlickCells: [start.maxFlickCells, 1, 8, 1],
    velocityWindowMs: [start.velocityWindowMs, 40, 300],
    settleTauPerCell: [start.settleTauPerCell, 0, 0.5],
  });

  const depth = useDialKit('DEPTH', {
    maxTiltDeg: [start.maxTiltDeg, 0, 12],
    parallaxShiftPx: [start.parallaxShiftPx, 0, 40],
    tiltLerpMs: [start.tiltLerpMs, 50, 600],
    overlayDepthHeadline: [start.overlayDepthHeadline, 1, 2.5],
    overlayDepthCaptions: [start.overlayDepthCaptions, 1, 2],
    overlayDepthCta: [start.overlayDepthCta, 1, 1.5],
    cursorDepthPx: [start.cursorDepthPx, 200, 1500],
    cardFaceStrength: [start.cardFaceStrength, 0, 1.5],
    maxCardTiltDeg: [start.maxCardTiltDeg, 0, 20],
    cardTiltLerpMs: [start.cardTiltLerpMs, 50, 800],
  });

  const layout = useDialKit('LAYOUT', {
    cardWidth: [start.cardWidth, 180, 480],
    gap: [start.gap, 40, 240],
    wrapStride: [start.wrapStride, 3, 8, 1],
  });

  const focus = useDialKit('FOCUS', {
    focusScale: [start.focusScale, 1, 1.4],
    unfocusedOpacity: [start.unfocusedOpacity, 0.1, 1],
    farOpacity: [start.farOpacity, 0.05, 1],
  });

  const detail = useDialKit('DETAIL', {
    detailTransitionMs: [start.detailTransitionMs, 150, 900],
    detailPeekPx: [start.detailPeekPx, 0, 200],
    detailSlideMs: [start.detailSlideMs, 150, 900],
  });

  // SKY preview: the "Toggle sky preview" action forces an EnvState via
  // setEnvOverride so the `previewSun`/`previewCondition` dials sweep
  // night→dawn→day live without waiting for real time. Toggling it off clears
  // the override. `skyRef` holds the latest dial values for the action callback
  // (which is memoised and can't read the not-yet-defined `sky`).
  const previewOnRef = useRef(false);
  const skyRef = useRef({ sun: 0.5, condition: 0 });
  const onSkyAction = useCallback((action: string) => {
    if (action !== 'previewSky') return;
    previewOnRef.current = !previewOnRef.current;
    const { sun, condition } = skyRef.current;
    setEnvOverride(previewOnRef.current ? previewEnv(sun, CONDITIONS[Math.round(condition)]) : null);
  }, []);

  const sky = useDialKit(
    'SKY',
    {
      skyTransitionMs: [start.skyTransitionMs, 150, 4000],
      skyParallax: [start.skyParallax, 0, 0.2],
      previewSun: [0.5, 0, 1],
      previewCondition: [0, 0, CONDITIONS.length - 1, 1],
      previewSky: { type: 'action', label: 'Toggle sky preview' },
    },
    { onAction: onSkyAction },
  );

  // Track the latest dial values; while preview is on, keep the forced EnvState
  // in sync as the dials move.
  useEffect(() => {
    skyRef.current = { sun: sky.previewSun, condition: sky.previewCondition };
    if (previewOnRef.current) {
      setEnvOverride(previewEnv(sky.previewSun, CONDITIONS[Math.round(sky.previewCondition)]));
    }
  }, [sky.previewSun, sky.previewCondition]);

  // "Copy config" → a paste-ready DEFAULTS snippet built from the live values.
  // Reads the live `config` singleton directly, so it needs no stale-closure ref.
  const onAction = useCallback((action: string) => {
    if (action !== 'copy') return;
    const body = (Object.keys(DEFAULTS) as (keyof LiveConfig)[])
      .map((k) => `  ${k}: ${config[k]},`)
      .join('\n');
    const snippet = `// tuned values — paste over DEFAULTS in src/config.ts\n{\n${body}\n}`;
    navigator.clipboard?.writeText(snippet).catch(() => {});
    console.log(snippet);
  }, []);

  const overlay = useDialKit(
    'OVERLAY',
    {
      overlayFadeMs: [start.overlayFadeMs, 0, 600],
      overlayCardDim: [start.overlayCardDim, 0.2, 1],
      ctaHoverScale: [start.ctaHoverScale, 1, 1.4],
      copy: { type: 'action', label: 'Copy config' },
    },
    { onAction },
  );

  // Propagate dial values to the live config store + persist them.
  useEffect(() => {
    const next: LiveConfig = {
      snapMs: motion.snapMs,
      flickThreshold: motion.flickThreshold,
      momentumFactor: motion.momentumFactor,
      maxFlickCells: Math.round(motion.maxFlickCells),
      velocityWindowMs: motion.velocityWindowMs,
      settleTauPerCell: motion.settleTauPerCell,
      maxTiltDeg: depth.maxTiltDeg,
      parallaxShiftPx: depth.parallaxShiftPx,
      tiltLerpMs: depth.tiltLerpMs,
      overlayDepthHeadline: depth.overlayDepthHeadline,
      overlayDepthCaptions: depth.overlayDepthCaptions,
      overlayDepthCta: depth.overlayDepthCta,
      cursorDepthPx: depth.cursorDepthPx,
      cardFaceStrength: depth.cardFaceStrength,
      maxCardTiltDeg: depth.maxCardTiltDeg,
      cardTiltLerpMs: depth.cardTiltLerpMs,
      cardWidth: layout.cardWidth,
      gap: layout.gap,
      wrapStride: Math.round(layout.wrapStride),
      overlayFadeMs: overlay.overlayFadeMs,
      overlayCardDim: overlay.overlayCardDim,
      ctaHoverScale: overlay.ctaHoverScale,
      focusScale: focus.focusScale,
      unfocusedOpacity: focus.unfocusedOpacity,
      farOpacity: focus.farOpacity,
      miniMapSpan: start.miniMapSpan,
      detailTransitionMs: detail.detailTransitionMs,
      detailPeekPx: detail.detailPeekPx,
      detailSlideMs: detail.detailSlideMs,
      skyTransitionMs: sky.skyTransitionMs,
      skyParallax: sky.skyParallax,
    };
    setConfig(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best effort
    }
  }, [motion, depth, layout, focus, detail, overlay, sky, start.miniMapSpan]);

  // Test hooks (dev only; this module never ships to production).
  useEffect(() => {
    const w = window as unknown as {
      __setConfig?: typeof setConfig;
      __dialStore?: typeof DialStore;
    };
    w.__setConfig = setConfig;
    w.__dialStore = DialStore;
  }, []);

  return <DialRoot position="top-right" />;
}

export default memo(Dials);
