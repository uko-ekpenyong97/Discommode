import { memo, useEffect, useRef, useState } from 'react';
import { MINIMAP_PITCH, useConfig } from '../config';
import { CONTENT, CONTENT_COUNT } from '../content';
import './MiniMap.css';

interface MiniMapProps {
  /** Content index (0-based) of the currently focused item. */
  focusedIndex: number;
  /** Navigate the grid to the world cell holding this content index. */
  onNavigate: (contentIndex: number) => void;
}

/**
 * A tiny position carousel at bottom-left: a strip of squares for the content
 * sequence, centred on the focused item. The current square is larger, framed,
 * and labelled; neighbours shrink and fade with distance. It re-centres with an
 * eased slide on every focus change (CSS-transitioned track translate). A
 * continuous `carousel` index accumulates the signed shortest step on each focus
 * change, so the strip slides in the direction of travel even across the wrap.
 *
 * Lives in the HUD layer but is interactive — `pointer-events: auto` only on the
 * strip; squares are real buttons (focusable, Enter/click navigates).
 */
function MiniMapBase({ focusedIndex, onNavigate }: MiniMapProps) {
  const cfg = useConfig();
  const span = cfg.miniMapSpan;
  const N = CONTENT_COUNT;

  const [carousel, setCarousel] = useState(focusedIndex);
  const prevRef = useRef(focusedIndex);
  useEffect(() => {
    const prev = prevRef.current;
    if (focusedIndex === prev) return;
    let step = focusedIndex - prev;
    if (step > N / 2) step -= N;
    else if (step < -N / 2) step += N;
    prevRef.current = focusedIndex;
    setCarousel((c) => c + step);
  }, [focusedIndex, N]);

  // A buffered window of squares around the carousel centre.
  const lo = carousel - span - 1;
  const hi = carousel + span + 1;
  const squares = [];
  for (let i = lo; i <= hi; i++) {
    const idx = ((i % N) + N) % N;
    const distance = Math.abs(i - carousel);
    squares.push({ i, idx, distance });
  }

  // Width shows 2*span+1 squares; translate so `carousel` sits at the centre.
  const stripWidth = (2 * span + 1) * MINIMAP_PITCH;

  return (
    <div className="mini-map" style={{ width: `${stripWidth}px` }} aria-label="Position">
      <div
        className="mini-map__track"
        style={{ transform: `translateX(${stripWidth / 2 - carousel * MINIMAP_PITCH}px)` }}
      >
        {squares.map((sq) => {
          const isCurrent = sq.distance < 0.5;
          const scale = isCurrent ? 1 : Math.max(0.5, 1 - sq.distance * 0.16);
          const opacity = isCurrent ? 1 : Math.max(0.22, 1 - sq.distance * 0.24);
          return (
            <button
              key={sq.i}
              type="button"
              className={isCurrent ? 'mini-map__sq mini-map__sq--current' : 'mini-map__sq'}
              style={{
                left: `${sq.i * MINIMAP_PITCH}px`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                opacity,
              }}
              onClick={() => onNavigate(sq.idx)}
              aria-label={`Item ${sq.idx + 1} of ${N}`}
              aria-current={isCurrent ? 'true' : undefined}
              title={CONTENT[sq.idx].title}
            >
              {isCurrent ? String(sq.idx + 1).padStart(2, '0') : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const MiniMap = memo(MiniMapBase);
