import type { CSSProperties, MouseEvent } from 'react';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ctaHoverScale,
  overlayDepthCaptions,
  overlayDepthCta,
  overlayDepthHeadline,
  overlayFadeMs,
} from '../config';
import type { ContentItem } from '../content';
import './CardOverlay.css';

interface CardOverlayProps {
  item: ContentItem;
}

/**
 * Hover overlay for the focused card: a headline, caption fragments, and a CTA
 * arranged around the card edges, each floating at a different depth.
 *
 * Depth parallax is done with CSS variables, not `translateZ`. The controller
 * writes the cursor-tilt shift to `--tsx`/`--tsy` on the tilt wrapper each frame;
 * each layer here multiplies it by its own `--depth-k` (= depthFactor − 1) in a
 * `calc()` transform, so layers slide *more* than the card and read as floating
 * above it. This keeps the parallax on the existing imperative tilt path (no
 * per-element refs), composes cleanly with the slot/pan transforms (which
 * `translateZ` would not), and falls back to flat when the vars are absent
 * (reduced motion) — the overlay still fades, it just doesn't parallax.
 */
export function CardOverlay({ item }: CardOverlayProps) {
  const onCta = (e: MouseEvent<HTMLButtonElement>) => {
    // Detail view is wired in a later phase; for now log + pulse.
    console.log(`[overlay] open item ${item.id}`);
    e.currentTarget.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'ease-out' },
    );
  };

  const depth = (factor: number) => ({ '--depth-k': factor - 1 }) as CSSProperties;

  return (
    <div
      className="card-overlay"
      style={{
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        animationDuration: `${overlayFadeMs}ms`,
      }}
    >
      <div className="card-overlay__headline" style={depth(overlayDepthHeadline)}>
        {item.title}
      </div>

      <div className="card-overlay__captions" style={depth(overlayDepthCaptions)}>
        {item.captions.map((caption) => (
          <span key={caption} className="card-overlay__caption">
            {caption}
          </span>
        ))}
      </div>

      <div className="card-overlay__cta-wrap" style={depth(overlayDepthCta)}>
        <button
          type="button"
          className="card-overlay__cta"
          style={{ '--cta-hover-scale': ctaHoverScale } as CSSProperties}
          aria-label={`${item.cta} ${item.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCta}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
