import { memo, useCallback, useEffect, useMemo } from 'react';
import { DialStore, useDialKit } from 'dialkit';
import { DEFAULTS, config, setConfig } from '../config';
import type { LiveConfig } from '../config';
import { useDetailPaperDials } from './detailPaperDials';
import { useCoverLifeDials } from './coverLifeDials';
import { useChromeDials } from './chromeDials';
import { useSizeDials } from './sizeDials';
import { clampDial, loadAppDials, saveAppDials } from './dialState';

/**
 * The app's dev dials for live feel/layout tuning — the PANELS, with no UI:
 * the dock that shows them is DevDock.tsx, mounted only at `?intro` (App).
 * Mounted on every dev URL (except `?nodials`), so saved dial values and the
 * `__setConfig` / `__dialStore` hooks are the same with the dock up or not,
 * and kept mounted while the reader or the portfolio view is up: a remount
 * re-registered a dozen panels and re-rendered the dock for ~200 ms on every
 * return to the app. This whole module is loaded behind an
 * `import.meta.env.DEV` dynamic import (see App), so it and the `dialkit`
 * dependency are tree-shaken out of production builds entirely.
 *
 * Dial values flow into the reactive config store ([setConfig]) so every change
 * propagates live; they also persist to localStorage so a tuning session
 * survives reloads, and "Copy config" emits a paste-ready snippet for promoting
 * the final numbers into DEFAULTS.
 *
 * Memoised (no props) so the per-frame App re-renders don't re-run the effect;
 * it re-renders only when DialKit's own store changes a value.
 */

function DevPanels() {
  // Restore saved values as each dial's starting point (defaults otherwise):
  // only this version's, only keys DEFAULTS has, of the right type (dialState.ts).
  const start = useMemo<LiveConfig>(() => ({ ...DEFAULTS, ...loadAppDials(DEFAULTS) }), []);
  // A slider starting at its saved value clamped into its range: a value saved
  // under another range (another branch on this port) lands inside this one.
  type NumKey = { [K in keyof LiveConfig]: LiveConfig[K] extends number ? K : never }[keyof LiveConfig];
  const n = (k: NumKey, min: number, max: number, step?: number) =>
    (step === undefined
      ? [clampDial(start[k], DEFAULTS[k], min, max), min, max]
      : [clampDial(start[k], DEFAULTS[k], min, max), min, max, step]) as [number, number, number, number?];

  const motion = useDialKit('MOTION', {
    snapMs: n('snapMs', 100, 1500),
    flickThreshold: n('flickThreshold', 0.3, 4),
    momentumFactor: n('momentumFactor', 0.05, 0.8),
    maxFlickCells: n('maxFlickCells', 1, 8, 1),
    velocityWindowMs: n('velocityWindowMs', 40, 300),
    settleTauPerCell: n('settleTauPerCell', 0, 0.5),
  });

  const grid = useDialKit('GRID', {
    clickCenterMaxMs: n('clickCenterMaxMs', 150, 1200),
  });

  const depth = useDialKit('DEPTH', {
    maxTiltDeg: n('maxTiltDeg', 0, 12),
    parallaxShiftPx: n('parallaxShiftPx', 0, 40),
    tiltLerpMs: n('tiltLerpMs', 50, 600),
    overlayDepthHeadline: n('overlayDepthHeadline', 1, 2.5),
    overlayDepthCaptions: n('overlayDepthCaptions', 1, 2),
    overlayDepthCta: n('overlayDepthCta', 1, 1.5),
    cursorDepthPx: n('cursorDepthPx', 200, 1500),
    cardFaceStrength: n('cardFaceStrength', 0, 1.5),
    maxCardTiltDeg: n('maxCardTiltDeg', 0, 20),
    cardTiltLerpMs: n('cardTiltLerpMs', 50, 800),
  });

  const layout = useDialKit('LAYOUT', {
    cardWidth: n('cardWidth', 180, 480),
    gap: n('gap', 40, 240),
    wrapStride: n('wrapStride', 3, 8, 1),
  });

  const focus = useDialKit('FOCUS', {
    focusScale: n('focusScale', 1, 1.4),
    unfocusedOpacity: n('unfocusedOpacity', 0.1, 1),
    farOpacity: n('farOpacity', 0.05, 1),
    hoverLiftOpacity: n('hoverLiftOpacity', 0.1, 1),
  });

  const detail = useDialKit('DETAIL', {
    detailTransitionMs: n('detailTransitionMs', 150, 900),
    detailCardScale: n('detailCardScale', 0.3, 1),
    detailSideScale: n('detailSideScale', 0.3, 1),
    detailSideOpacity: n('detailSideOpacity', 0.1, 1),
    detailGap: n('detailGap', 0, 160),
    detailHoverDim: n('detailHoverDim', 0, 1),
    detailScrimOpacity: n('detailScrimOpacity', 0, 0.8),
    detailChromeFadeMs: n('detailChromeFadeMs', 50, 600),
    detailSlideMs: n('detailSlideMs', 150, 900),
  });

  // SKY — the sky's FEEL, and only its feel. Six dials, which is the whole
  // panel: the prototype's five (`docs/prototypes/sky-prototype.html`) plus the
  // transition. The old panel also carried the weather modifiers and a preview
  // sweep; the modifiers went with the tint model, and the preview moved to the
  // EnvReadout, where the six conditions are six buttons instead of a slider
  // you have to count clicks on.
  const sky = useDialKit('SKY', {
    skyTransitionMs: n('skyTransitionMs', 150, 4000),
    skyDrift: n('skyDrift', 0, 3, 0.05),
    cloudScale: n('cloudScale', 0.8, 4, 0.05),
    fogHeight: n('fogHeight', 0.3, 1.2, 0.01),
    skySaturation: n('skySaturation', 0.4, 1.6, 0.01),
    skyGrain: n('skyGrain', 0, 0.1, 0.005),
    starSize: n('starSize', 0.5, 4, 0.05),
    moonSize: n('moonSize', 0.3, 3, 0.05),
    moonEarthshine: n('moonEarthshine', 0, 0.3, 0.005),
    moonTerminatorSoft: n('moonTerminatorSoft', 0.002, 0.2, 0.002),
    moonGlow: n('moonGlow', 0, 0.5, 0.005),
    skyResolution: n('skyResolution', 0.5, 1, 0.05),
    skyMaxMegapixels: n('skyMaxMegapixels', 0, 16, 0.5),
  });

  // SKY · FLUID — the wake (docs/sky.md, "The wake"). The solver's five, then
  // what each layer does with it, then the page's share. `fluidDebug` is on F:
  // it draws the field itself in the bottom-left corner.
  const fluid = useDialKit(
    'SKY · FLUID',
    {
      fluidOn: start.fluidOn,
      fluidRadius: n('fluidRadius', 0.02, 0.25, 0.005),
      fluidStrength: n('fluidStrength', 0, 3, 0.05),
      fluidCurl: n('fluidCurl', 0, 50, 1),
      velocityDissipation: n('velocityDissipation', 0.9, 0.999, 0.001),
      densityDissipation: n('densityDissipation', 0.85, 0.999, 0.001),
      fluidWarp: n('fluidWarp', 0, 0.1, 0.001),
      starPush: n('starPush', 0, 2, 0.05),
      starGlow: n('starGlow', 0, 4, 0.05),
      cloudPart: n('cloudPart', 0, 1, 0.01),
      fogPart: n('fogPart', 0, 1, 0.01),
      rainBend: n('rainBend', 0, 0.6, 0.01),
      gradientPush: n('gradientPush', 0, 1, 0.01),
      gradientSwirl: n('gradientSwirl', 0, 0.6, 0.01),
      pageSplat: n('pageSplat', 0, 3, 0.05),
      fluidDebug: start.fluidDebug,
    },
    { shortcuts: { fluidDebug: { key: 'f' } } },
  );

  // The detail cards' paper has its own store (paperDials.ts), not LiveConfig.
  useDetailPaperDials();
  useCoverLifeDials();
  useChromeDials();

  // How big the book and the detail card get off the Studio Display.
  useSizeDials();

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
      overlayFadeMs: n('overlayFadeMs', 0, 600),
      overlayCardDim: n('overlayCardDim', 0.2, 1),
      ctaHoverScale: n('ctaHoverScale', 1, 1.4),
      // Explicit steps: DialKit infers a coarse step from the range otherwise
      // (0-120 snaps to multiples of 10, which quietly rewrote the 24 default to
      // 20 and persisted it), and both of these want finer resolution than that.
      overlayZ: n('overlayZ', 0, 120, 1),
      overlayLayerFadeMs: n('overlayLayerFadeMs', 0, 200, 5),
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
      // No dial: a saved value could only be another branch's.
      miniMapSpan: DEFAULTS.miniMapSpan,
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
      starSize: sky.starSize,
      moonSize: sky.moonSize,
      moonEarthshine: sky.moonEarthshine,
      moonTerminatorSoft: sky.moonTerminatorSoft,
      moonGlow: sky.moonGlow,
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
      gradientPush: fluid.gradientPush,
      gradientSwirl: fluid.gradientSwirl,
      pageSplat: fluid.pageSplat,
      fluidDebug: fluid.fluidDebug,
    };
    setConfig(next);
    saveAppDials(next);
  }, [motion, grid, depth, layout, focus, detail, overlay, sky, fluid]);

  // Test hooks (dev only; this module never ships to production).
  useEffect(() => {
    const w = window as unknown as {
      __setConfig?: typeof setConfig;
      __dialStore?: typeof DialStore;
    };
    w.__setConfig = setConfig;
    w.__dialStore = DialStore;
  }, []);

  return null;
}

export default memo(DevPanels);
