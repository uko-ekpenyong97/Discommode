import { BlockView } from './blocks/Blocks';
import type { Block, Section } from './blocks/types';

/**
 * THE PAGE — live HTML on an opaque paper surface, and the thing you read.
 *
 * One per section, all of them in the same rect, all of them in the DOM from
 * the first frame: the track is built from MEASURED heights, so every page has
 * to be laid out whether or not it is the one showing. `Scroller` decides which
 * one paints, writes its `scrollTop`, and puts it through its exit.
 *
 * THREE LAYERS, and the order is the point:
 *
 *   .pv-page          the rect. Paper, the pixel-snapped box, and the element
 *                     the EXIT transforms. It does not scroll.
 *   .pv-page__scroll  inset over it, and the scroll container for the section's
 *                     vertical run. `Scroller` writes `scrollTop` here.
 *   .pv-page__grain   over both, and outside the scroller, so the grain holds
 *                     still while the type moves under it — which is what grain
 *                     on paper does. Inside the page, so it tilts away with it.
 *
 * A page is NOT a column. It is the page rect less `pageInsetPx` each side, and
 * a twelve-column grid on a `gridGapPx` gutter inside what is left. The grid is
 * on the RUN rather than on the page: a run is what carries the hairline and
 * the vertical rhythm, and putting the grid one level down leaves both
 * untouched and gives every block a grid area without a wrapper.
 */

/** Consecutive blocks group into one run; `newRun` starts a fresh one. A run is
 *  a paragraph-level grouping with a hairline above it — not a section. */
function toRuns(blocks: Block[]): Block[][] {
  const runs: Block[][] = [];
  for (const block of blocks) {
    if (runs.length === 0 || block.newRun) runs.push([]);
    runs[runs.length - 1].push(block);
  }
  return runs;
}

export function SectionPage({ section, index }: { section: Section; index: number }) {
  return (
    <article className="pv-page" data-k={index} aria-label={section.title}>
      <div className="pv-page__scroll">
        <div className="pv-page__inner">
          {toRuns(section.blocks).map((run, r) => (
            <div key={r} className="pv-run" data-reveal="">
              {run.map((block, b) => (
                <BlockView key={b} block={block} index={b} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pv-page__grain" aria-hidden="true" />
    </article>
  );
}
