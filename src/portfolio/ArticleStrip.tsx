import type { CSSProperties, Ref } from 'react';
import { mod } from '../grid';
import { BlockView } from './blocks/Blocks';
import type { Block } from './blocks/types';
import { PROJECTS } from './projects';

/**
 * The row of articles. Three are ever on screen — the project you are reading,
 * centred, with the previous and next peeking at `--pv-neighbour-op` on either
 * side — but FIVE are rendered, one column of buffer past each edge. That
 * buffer is what makes a step look like a slide rather than a swap: the article
 * arriving at the right-hand peek already exists, one column further out, when
 * the strip starts moving. (The detail view's panel strip buffers for the same
 * reason.)
 *
 * Position is a single continuous index: each article sits at `i * step` and
 * the strip is translated so `center` lands in the middle of the viewport. A
 * step is therefore one number change, and CSS transitions both the strip's
 * translate and the per-article opacity over `--pv-crossfade` — no timers, no
 * commit frame, nothing to get out of sync if you click twice quickly.
 *
 * Each article is its own 100vh window onto its project: `overflow: hidden`,
 * with the content translated inside it by the scroller (see `Sheet`). Only the
 * centred one scrolls; the neighbours sit at their top.
 */

/** Columns rendered past each visible edge. */
const SLOT_BUFFER = 2;

/** Consecutive blocks group into one `<section>`; `newSection` starts a fresh
 *  one. Authored in the data rather than inferred from block types. */
function toSections(blocks: Block[]): Block[][] {
  const sections: Block[][] = [];
  for (const block of blocks) {
    if (sections.length === 0 || block.newSection) sections.push([]);
    sections[sections.length - 1].push(block);
  }
  return sections;
}

interface ArticleStripProps {
  /** Continuous index of the centred article (unbounded; wraps via `mod`). */
  center: number;
  /** Step the strip one column — a neighbour was clicked. */
  onStep: (direction: -1 | 1) => void;
  /** Receives the centred article's inner element; the scroller drives it. */
  innerRef: Ref<HTMLDivElement>;
}

export function ArticleStrip({ center, onStep, innerRef }: ArticleStripProps) {
  const count = PROJECTS.length;
  const slots = [];
  for (let i = center - SLOT_BUFFER; i <= center + SLOT_BUFFER; i++) {
    slots.push({ i, project: PROJECTS[mod(i, count)] });
  }

  return (
    <div
      className="pv-strip"
      style={{ transform: `translateX(calc(50% - ${center} * var(--pv-step)))` }}
    >
      {slots.map(({ i, project }) => {
        const offset = i - center;
        const active = offset === 0;
        const sections = toSections(project.blocks);
        return (
          <article
            // The continuous index, not the project id: stepping shifts the
            // window by one, so four of the five articles keep their node (and
            // everything they have already revealed) and one mounts at the edge.
            key={i}
            className="pv-article"
            data-active={active || undefined}
            style={{ left: `calc(${i} * var(--pv-step))` } as CSSProperties}
            aria-hidden={active ? undefined : true}
          >
            <div className="pv-article__inner" ref={active ? innerRef : undefined}>
              <div className="pv-article__column">
                {sections.map((blocks, s) => (
                  <section key={s} className="pv-section" data-reveal="">
                    {blocks.map((block, b) => (
                      <BlockView key={b} block={block} index={b} />
                    ))}
                  </section>
                ))}
              </div>
            </div>
            {/* A neighbour is a target, not a document: one hit area over the
                whole column, so its links and video are not reachable until it
                is the one you are reading. */}
            {!active && Math.abs(offset) === 1 && (
              <button
                type="button"
                className="pv-article__hit"
                onClick={() => onStep(offset as -1 | 1)}
                aria-label={`Open project ${project.id}`}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
