import type { CSSProperties, MouseEvent } from 'react';
import { CARD_ASPECT_H, CARD_ASPECT_W, useConfig } from '../config';
import type { PosterItem } from '../content';
import './CardOverlay.css';

interface CardOverlayProps {
  item: PosterItem;
  /** Open the detail view for this item (CTA click). */
  onOpen: (contentIndex: number) => void;
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
export function CardOverlay({ item, onOpen }: CardOverlayProps) {
  const cfg = useConfig();
  const cardW = cfg.cardWidth;
  const cardH = (cardW * CARD_ASPECT_H) / CARD_ASPECT_W;

  const onCta = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'ease-out' },
    );
    onOpen(item.id);
  };

  const depth = (factor: number) => ({ '--depth-k': factor - 1 }) as CSSProperties;

  return (
    <div
      className="card-overlay"
      style={{
        width: `${cardW}px`,
        height: `${cardH}px`,
        // Match the focused card's focus scale so the type tracks its scaled
        // edges (the overlay only shows when settled, where that card is at
        // exactly focusScale). Keeps the centring translate.
        transform: `translate(-50%, -50%) scale(${cfg.focusScale})`,
        animationDuration: `${cfg.overlayFadeMs}ms`,
      }}
    >
      <div className="card-overlay__headline" style={depth(cfg.overlayDepthHeadline)}>
        {item.title}
      </div>

      <div className="card-overlay__captions" style={depth(cfg.overlayDepthCaptions)}>
        {item.captions.map((caption) => (
          <span key={caption} className="card-overlay__caption">
            {caption}
          </span>
        ))}
      </div>

      <div className="card-overlay__cta-wrap" style={depth(cfg.overlayDepthCta)}>
        <button
          type="button"
          className="card-overlay__cta"
          style={{ '--cta-hover-scale': cfg.ctaHoverScale } as CSSProperties}
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
