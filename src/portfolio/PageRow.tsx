import type { Ref } from 'react';
import { BlockView } from './blocks/Blocks';
import type { Block, Project } from './blocks/types';

/**
 * The row of pages. One `<article>` per page, laid out left to right at
 * `k * pageWidth` inside a row whose origin is the left gutter — so a page
 * translated by `-k * pageWidth` lands exactly centred.
 *
 * The whole arrangement is written imperatively by `Sheet` from a single call
 * to `pageTrack`'s `layout()`: per page, a `translateX`, a `scrollTop`, and the
 * `data-active` / `data-stacked` / `data-moving-horizontal` flags this file's
 * CSS hangs the preview fade and the z-order off. Nothing here re-renders while
 * you scroll.
 *
 * Each article is its OWN scroll container (`overflow: hidden`, driven by
 * `scrollTop`) rather than a transformed inner column: it keeps the page a real
 * 100vh window onto its content, which is what makes a stacked page hold at its
 * bottom, and what lets every block's visibility test resolve by ordinary
 * clipping.
 *
 * A stacked page is clickable anywhere — but only its sliver is reachable,
 * because the pages above it are opaque and sit higher, so the click naturally
 * lands on the topmost page at that point. Its own content is made inert while
 * stacked so a link in the visible strip can't steal the click. (Scrolling back
 * is the same gesture the wheel already does, so nothing here is the only route
 * to a page.)
 */

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

interface PageRowProps {
  project: Project;
  rowRef: Ref<HTMLDivElement>;
  /** A stacked page was clicked — scroll the track back to it. */
  onSliverClick: (index: number) => void;
}

export function PageRow({ project, rowRef, onSliverClick }: PageRowProps) {
  return (
    <div className="pv-row" ref={rowRef}>
      {project.pages.map((blocks, k) => (
        <article
          key={k}
          className="pv-page"
          data-k={k}
          style={{ left: `calc(${k} * var(--pv-page-w, 44vw))` }}
          // `data-stacked` is written by the scroll loop, not by React, so the
          // handler reads it off the element rather than closing over state.
          onClick={(e) => {
            if (e.currentTarget.dataset.stacked !== undefined) onSliverClick(k);
          }}
        >
          <div className="pv-page__inner">
            <div className="pv-page__column">
              {toSections(blocks).map((section, s) => (
                <section key={s} className="pv-section" data-reveal="">
                  {section.map((block, b) => (
                    <BlockView key={b} block={block} index={b} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
