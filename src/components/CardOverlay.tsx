import type { CSSProperties, MouseEvent } from 'react';
import { useConfig } from '../config';
import type { PosterItem } from '../content';
import './CardOverlay.css';

interface CardOverlayProps {
  item: PosterItem;
  /** Open this card's detail (CTA click) — same glide-to-centre-then-FLIP path. */
  onOpen: () => void;
}

/**
 * Hover overlay for whichever card the cursor is over: a headline, caption
 * fragments, and a CTA arranged around the card edges, each floating at a
 * different depth. Rendered as a child of the hovered card's transform wrapper,
 * so it inherits that card's scale + cursor-facing rotation automatically (it
 * tracks the card without doubling or drifting) — it fills the card (inset: 0)
 * and adds no transform of its own.
 *
 * Depth parallax is done with CSS variables, not `translateZ`. The controller
 * writes the cursor-tilt shift to `--tsx`/`--tsy` on the tilt wrapper each frame;
 * each layer here multiplies it by its own `--depth-k` (= depthFactor − 1) in a
 * `calc()` transform, so layers slide *more* than the card and read as floating
 * above it. Falls back to flat when the vars are absent (reduced motion) — the
 * overlay still fades, it just doesn't parallax.
 */
export function CardOverlay({ item, onOpen }: CardOverlayProps) {
  const cfg = useConfig();

  const onCta = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'ease-out' },
    );
    onOpen();
  };

  const depth = (factor: number) => ({ '--depth-k': factor - 1 }) as CSSProperties;

  return (
    <div className="card-overlay" style={{ animationDuration: `${cfg.overlayFadeMs}ms` }}>
      {/* The card's NUMBER, on every card: the one place the grid shows it. */}
      <div className="card-overlay__headline" style={depth(cfg.overlayDepthHeadline)}>
        <span className="card-overlay__number">{item.title}</span>
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
