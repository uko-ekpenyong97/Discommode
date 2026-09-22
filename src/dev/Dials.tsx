import { memo, useCallback, useEffect, useMemo } from 'react';
import { DialRoot, DialStore, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import { DEFAULTS, config, setConfig } from '../config';
import type { LiveConfig } from '../config';
import { useDetailPaperDials } from './detailPaperDials';
import { useCoverLifeDials } from './coverLifeDials';

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

  const grid = useDialKit('GRID', {
    clickCenterMaxMs: [start.clickCenterMaxMs, 150, 1200],
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
    hoverLiftOpacity: [start.hoverLiftOpacity, 0.1, 1],
  });

  const detail = useDialKit('DETAIL', {
    detailTransitionMs: [start.detailTransitionMs, 150, 900],
    detailCardScale: [start.detailCardScale, 0.3, 1],
    detailSideScale: [start.detailSideScale, 0.3, 1],
    detailSideOpacity: [start.detailSideOpacity, 0.1, 1],
    detailGap: [start.detailGap, 0, 160],
    detailHoverDim: [start.detailHoverDim, 0, 1],
    detailScrimOpacity: [start.detailScrimOpacity, 0, 0.8],
    detailChromeFadeMs: [start.detailChromeFadeMs, 50, 600],
    detailSlideMs: [start.detailSlideMs, 150, 900],
  });

  // SKY — the sky's FEEL, and only its feel. Six dials, which is the whole
  // panel: the prototype's five (`docs/prototypes/sky-prototype.html`) plus the
  // transition. The old panel also carried the weather modifiers and a preview
  // sweep; the modifiers went with the tint model, and the preview moved to the
  // EnvReadout, where the six conditions are six buttons instead of a slider
  // you have to count clicks on.
  const sky = useDialKit('SKY', {
    skyTransitionMs: [start.skyTransitionMs, 150, 4000],
    skyDrift: [start.skyDrift, 0, 3, 0.05],
    cloudScale: [start.cloudScale, 0.8, 4, 0.05],
    fogHeight: [start.fogHeight, 0.3, 1.2, 0.01],
    skySaturation: [start.skySaturation, 0.4, 1.6, 0.01],
    skyGrain: [start.skyGrain, 0, 0.1, 0.005],
    skyResolution: [start.skyResolution, 0.5, 1, 0.05],
    skyMaxMegapixels: [start.skyMaxMegapixels, 0, 16, 0.5],
  });

  // SKY · FLUID — the wake (docs/sky.md, "The wake"). The solver's five, then
  // what each layer does with it, then the page's share. `fluidDebug` is on F:
  // it draws the field itself in the bottom-left corner.
  const fluid = useDialKit(
    'SKY · FLUID',
    {
      fluidOn: start.fluidOn,
      fluidRadius: [start.fluidRadius, 0.02, 0.25, 0.005],
      fluidStrength: [start.fluidStrength, 0, 3, 0.05],
      fluidCurl: [start.fluidCurl, 0, 50, 1],
      velocityDissipation: [start.velocityDissipation, 0.9, 0.999, 0.001],
      densityDissipation: [start.densityDissipation, 0.85, 0.999, 0.001],
      fluidWarp: [start.fluidWarp, 0, 0.1, 0.001],
      starPush: [start.starPush, 0, 2, 0.05],
      starGlow: [start.starGlow, 0, 4, 0.05],
      cloudPart: [start.cloudPart, 0, 1, 0.01],
      fogPart: [start.fogPart, 0, 1, 0.01],
      rainBend: [start.rainBend, 0, 0.6, 0.01],
      pageSplat: [start.pageSplat, 0, 3, 0.05],
      fluidDebug: start.fluidDebug,
    },
    { shortcuts: { fluidDebug: { key: 'f' } } },
  );

  // The detail cards' paper has its own store (paperDials.ts), not LiveConfig.
  useDetailPaperDials();
  useCoverLifeDials();

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
      // Explicit steps: DialKit infers a coarse step from the range otherwise
      // (0-120 snaps to multiples of 10, which quietly rewrote the 24 default to
      // 20 and persisted it), and both of these want finer resolution than that.
      overlayZ: [start.overlayZ, 0, 120, 1],
      overlayLayerFadeMs: [start.overlayLayerFadeMs, 0, 200, 5],
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
      clickCenterMaxMs: grid.clickCenterMaxMs,
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
      overlayZ: overlay.overlayZ,
      overlayLayerFadeMs: overlay.overlayLayerFadeMs,
      focusScale: focus.focusScale,
      unfocusedOpacity: focus.unfocusedOpacity,
      farOpacity: focus.farOpacity,
      hoverLiftOpacity: focus.hoverLiftOpacity,
      miniMapSpan: start.miniMapSpan,
      detailTransitionMs: detail.detailTransitionMs,
      detailCardScale: detail.detailCardScale,
      detailSideScale: detail.detailSideScale,
      detailSideOpacity: detail.detailSideOpacity,
      detailGap: detail.detailGap,
      detailHoverDim: detail.detailHoverDim,
      detailScrimOpacity: detail.detailScrimOpacity,
      detailChromeFadeMs: detail.detailChromeFadeMs,
      detailSlideMs: detail.detailSlideMs,
      skyTransitionMs: sky.skyTransitionMs,
      skyDrift: sky.skyDrift,
      cloudScale: sky.cloudScale,
      fogHeight: sky.fogHeight,
      skySaturation: sky.skySaturation,
      skyGrain: sky.skyGrain,
      skyResolution: sky.skyResolution,
      skyMaxMegapixels: sky.skyMaxMegapixels,
      fluidOn: fluid.fluidOn,
      fluidRadius: fluid.fluidRadius,
      fluidStrength: fluid.fluidStrength,
      fluidCurl: fluid.fluidCurl,
      velocityDissipation: fluid.velocityDissipation,
      densityDissipation: fluid.densityDissipation,
      fluidWarp: fluid.fluidWarp,
      starPush: fluid.starPush,
      starGlow: fluid.starGlow,
      cloudPart: fluid.cloudPart,
      fogPart: fluid.fogPart,
      rainBend: fluid.rainBend,
      pageSplat: fluid.pageSplat,
      fluidDebug: fluid.fluidDebug,
    };
    setConfig(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best effort
    }
  }, [motion, grid, depth, layout, focus, detail, overlay, sky, fluid, start.miniMapSpan]);

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
