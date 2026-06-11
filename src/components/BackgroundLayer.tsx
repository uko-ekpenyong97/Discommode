import { memo } from 'react';
import type { Ref } from 'react';
import { BG_COLOR, DOT_OPACITY, DOT_RADIUS, DOT_SPACING } from '../config';
import './BackgroundLayer.css';

interface BackgroundLayerProps {
  /** Parallax ref — the controller writes a small translate to it each frame. */
  parallaxRef: Ref<HTMLDivElement>;
}

/**
 * Layer 1 — fills the viewport with a near-black background and a subtle,
 * repeating dot matrix. The matrix is a single radial-gradient "dot" tiled
 * across the layer via `background-size`, so it repeats without any image
 * assets. Static and memoised: the per-frame plane motion never re-renders it;
 * its only movement is the imperative parallax translate the controller writes
 * (the layer is oversized so that shift never reveals an edge).
 */
export const BackgroundLayer = memo(function BackgroundLayer({
  parallaxRef,
}: BackgroundLayerProps) {
  const dot = `rgba(255, 255, 255, ${DOT_OPACITY})`;

  return (
    <div
      ref={parallaxRef}
      className="background-layer"
      style={{
        backgroundColor: BG_COLOR,
        backgroundImage: `radial-gradient(circle, ${dot} ${DOT_RADIUS}px, transparent ${DOT_RADIUS}px)`,
        backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
      }}
    />
  );
});
