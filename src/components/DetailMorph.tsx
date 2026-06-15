import { memo, useLayoutEffect, useRef } from 'react';
import type { PosterItem } from '../content';
import type { Rect } from '../detailLayout';
import './DetailMorph.css';

/** One card morphing from its `from` rect to its `to` rect. */
export interface MorphCard {
  item: PosterItem;
  from: Rect;
  to: Rect;
}

interface DetailMorphProps {
  cards: MorphCard[];
  durationMs: number;
  /** Fired the instant the travel animation finishes (WAAPI `finished`), so the
   *  handoff to the static layout happens on the exact frame the cards land. */
  onFinished?: () => void;
}

/**
 * The grid↔detail transition layer (Phase 15): the three participating cards
 * (centre + L/R neighbours) physically TRAVEL and SCALE between their grid rects
 * and their detail rects — a true positional FLIP, NO cross-fade on these cards.
 *
 * Each card is laid out at its `to` rect; a single transform animation plays it
 * from the inverted `from` rect to identity (`to`) via the Web Animations API
 * (robust timing — no paint-then-change race). Both rects preserve the 3:4
 * aspect, so a uniform `scale(from.w/to.w)` matches width and height. The rects
 * are flat (the controller neutralises the hero cards' tilt at both seams), so
 * FROM exactly matches the grid card and TO the detail panel — no pop at either
 * end.
 */
function DetailMorph({ cards, durationMs, onFinished }: DetailMorphProps) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const anims = cards
      .map((c, i) => {
        const el = refs.current[i];
        if (!el) return null;
        const invert = `translate(${c.from.cx - c.to.cx}px, ${c.from.cy - c.to.cy}px) scale(${c.from.w / c.to.w})`;
        return el.animate(
          [{ transform: invert }, { transform: 'none' }],
          { duration: durationMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
        );
      })
      .filter((a): a is Animation => a !== null);

    // Hand off the instant the travel lands (all three finish together) — the
    // caller reveals the static layout on this exact frame.
    // `onFinished` is captured at mount — the morph mounts fresh per direction
    // (enter vs exit), so the mount-time callback is the right one.
    let done = false;
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (!done) onFinished?.();
      })
      .catch(() => {});
    return () => {
      done = true;
      anims.forEach((a) => a.cancel());
    };
    // Run once on mount with the FROM/TO + onFinished captured at transition
    // start; the cards don't change mid-transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="detail-morph" aria-hidden="true">
      {cards.map((c, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="detail-morph__card"
          style={{ left: c.to.cx - c.to.w / 2, top: c.to.cy - c.to.h / 2, width: c.to.w, height: c.to.h }}
        >
          {c.item.image ? (
            <img className="detail-morph__media" src={c.item.image} alt="" draggable={false} />
          ) : (
            <div className="detail-morph__media" style={{ background: `hsl(${c.item.hue}, 28%, 32%)` }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(DetailMorph);
