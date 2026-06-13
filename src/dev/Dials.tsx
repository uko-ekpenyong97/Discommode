import { memo, useCallback, useEffect, useMemo } from 'react';
import { DialRoot, DialStore, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import { DEFAULTS, config, setConfig } from '../config';
import type { LiveConfig } from '../config';

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
    backgroundParallaxFactor: [start.backgroundParallaxFactor, 0, 1],
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
      backgroundParallaxFactor: depth.backgroundParallaxFactor,
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
    };
    setConfig(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best effort
    }
  }, [motion, depth, layout, focus, detail, overlay, start.miniMapSpan]);

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
