import type { CSSProperties, Ref } from 'react';
import { BlockView } from './blocks/Blocks';
import { Tab } from './Tab';
import type { Block, Project } from './blocks/types';

/**
 * The notebook: one page surface with the project's sections stacked in it, and
 * a tab per section down the left edge.
 *
 * The book is `tabWidth + pageWidth` wide and centred; the tabs occupy the left
 * `tabWidth` and the sections the right `pageWidth`. Nothing here moves on its
 * own — `Sheet` writes the whole arrangement imperatively from a single call to
 * `pageTrack`'s `layout()`: per section a `translateX`, a `scrollTop`, a
 * `zIndex` and a visibility, and per tab whether it is the flush one. No React
 * render happens while you scroll.
 *
 * Each section is its OWN scroll container (`overflow-y: hidden`, driven by
 * `scrollTop`) rather than a transformed inner column. That keeps a section a
 * real 100vh window onto its content, which is what lets a buried section hold
 * at the line you left it at, and what lets every block's visibility test
 * resolve by ordinary clipping.
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

interface NotebookProps {
  project: Project;
  bookRef: Ref<HTMLDivElement>;
  /** A tab was clicked — rewind the track to that section. */
  onSelect: (index: number) => void;
}

export function Notebook({ project, bookRef, onSelect }: NotebookProps) {
  return (
    <div className="pv-book" ref={bookRef}>
      {/* Tabs first in the DOM as well as lowest in z: they are the table of
          contents, and they are what a keyboard should reach before the prose. */}
      <div className="pv-tabs">
        {project.sections.map((section, k) => (
          <Tab key={k} index={k} title={section.title} hue={section.hue} onSelect={onSelect} />
        ))}
      </div>

      {/* The page area. It CLIPS on the right, at the page's own edge, so a
          section waiting its turn is off-stage rather than peeking beside the
          one you are reading — the notebook is one page surface, not a row. The
          clip is open to the left so the top section's shadow still falls
          across the tab column. */}
      <div className="pv-pages">
        {project.sections.map((section, k) => (
          <article
            key={k}
            className="pv-section"
            data-k={k}
            data-hue={section.hue}
            style={{ '--pv-hue': section.hue } as CSSProperties}
          >
            <div className="pv-section__inner">
              <div className="pv-section__column">
                {toRuns(section.blocks).map((run, r) => (
                  <div key={r} className="pv-run" data-reveal="">
                    {run.map((block, b) => (
                      <BlockView key={b} block={block} index={b} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
