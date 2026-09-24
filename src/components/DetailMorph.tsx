import { memo, useLayoutEffect, useRef } from 'react';
import { itemFace, itemHeroFace } from '../content';
import type { PosterItem } from '../content';
import type { Rect } from '../detailLayout';
import { CoverTile } from '../covers/CoverTile';
import './DetailMorph.css';

/** One card morphing from its `from` rect to its `to` rect. */
export interface MorphCard {
  item: PosterItem;
  from: Rect;
  to: Rect;
}

/** How long the centre card takes to change face. Short relative to the travel:
 *  it is covering a substitution, not performing a transition of its own. */
const FACE_CROSSFADE_MS = 200;

/** The travel's easing. The chrome of a shader cover fades on it too, so the
 *  chrome is always as far gone as the card is from the grid. */
const TRAVEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** A card's chrome (DetailMorph.css) and a shader cover's in the detail view:
 *  none — the detail panel is `.detail__panel--bare` (docs/covers.md). The
 *  shadow keeps its geometry and loses its alpha, so it fades, not shrinks. */
const CHROME = { borderRadius: '6px', boxShadow: '0 24px 70px rgba(0, 0, 0, 0.55)' };
const BARE = { borderRadius: '0px', boxShadow: '0 24px 70px rgba(0, 0, 0, 0)' };

interface DetailMorphProps {
  cards: MorphCard[];
  durationMs: number;
  /** True for grid → detail, false for the way back. Decides which face the
   *  cross-fade starts from. */
  entering: boolean;
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
 *
 * A card whose grid face and hero face DIFFER also cross-fades between them
 * while it travels. That is the issue cover: the grid shows the photograph and
 * the detail panel shows the drawing, and cutting between them on the frame this
 * layer mounts was visible. Cards whose two faces are the same — every sample
 * poster and hue placeholder — render a single image and are untouched, so this
 * costs nothing for them.
 */
function DetailMorph({ cards, durationMs, entering, onFinished }: DetailMorphProps) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const faceRefs = useRef<(HTMLImageElement | null)[]>([]);

  useLayoutEffect(() => {
    const anims = cards
      .map((c, i) => {
        const el = refs.current[i];
        if (!el) return null;
        const invert = `translate(${c.from.cx - c.to.cx}px, ${c.from.cy - c.to.cy}px) scale(${c.from.w / c.to.w})`;
        return el.animate(
          [{ transform: invert }, { transform: 'none' }],
          { duration: durationMs, easing: TRAVEL_EASING, fill: 'both' },
        );
      })
      .filter((a): a is Animation => a !== null);

    // A shader cover sheds the card's chrome on the way in and takes it back on
    // the way out, over the travel: the grid tile keeps its chrome and the detail
    // view has none, and neither end snaps.
    const chrome = cards
      .map((c, i) => {
        const el = refs.current[i];
        if (!el || c.item.cover?.kind !== 'shader') return null;
        return el.animate(entering ? [CHROME, BARE] : [BARE, CHROME], {
          duration: durationMs,
          easing: TRAVEL_EASING,
          fill: 'both',
        });
      })
      .filter((a): a is Animation => a !== null);

    // The incoming face dissolves over the outgoing one. Driven by WAAPI on the
    // same clock as the travel, and never longer than it, so the substitution is
    // finished by the time the card lands.
    const faces = faceRefs.current
      .filter((el): el is HTMLImageElement => el !== null)
      .map((el) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: Math.min(FACE_CROSSFADE_MS, durationMs),
          easing: 'linear',
          fill: 'both',
        }),
      );

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
      faces.forEach((a) => a.cancel());
      chrome.forEach((a) => a.cancel());
    };
    // Run once on mount with the FROM/TO + onFinished captured at transition
    // start; the cards don't change mid-transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="detail-morph" aria-hidden="true">
      {cards.map((c, i) => {
        const gridFace = itemFace(c.item);
        const heroFace = itemHeroFace(c.item);
        // Only an issue cover has two different faces; everything else renders
        // one image and skips the cross-fade entirely.
        const changes = gridFace !== heroFace && !!gridFace && !!heroFace;
        const from = entering ? gridFace : heroFace;
        const to = entering ? heroFace : gridFace;
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="detail-morph__card"
            style={{ left: c.to.cx - c.to.w / 2, top: c.to.cy - c.to.h / 2, width: c.to.w, height: c.to.h }}
          >
            {c.item.cover ? (
              // A live cover travels live — the centre card, on the shared cover
              // clock, so it lands on the hero's frame and needs no cross-fade.
              // The neighbours are the still, as the detail view shows them.
              <CoverTile coverId={c.item.cover.id} live={i === 1} dome={null} className="detail-morph__media" />
            ) : to ? (
              <>
                {changes && <img className="detail-morph__media" src={from} alt="" draggable={false} />}
                <img
                  className="detail-morph__media"
                  ref={(el) => {
                    if (changes) faceRefs.current[i] = el;
                  }}
                  src={to}
                  alt=""
                  draggable={false}
                />
              </>
            ) : (
              <div className="detail-morph__media" style={{ background: `hsl(${c.item.hue}, 28%, 32%)` }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(DetailMorph);
