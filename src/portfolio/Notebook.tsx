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
 * `pageTrack`'s `layout()`. No React render happens while you scroll.
 *
 * A SECTION IS THREE LAYERS, and the order matters:
 *
 *   __glass   one element carrying the tint and the `backdrop-filter`, spanning
 *             the tab column AND the page, clipped to the union of the page and
 *             this section's own tab slot (`glassClipPath`). One element,
 *             because two adjacent ones do not join: each blurs its own
 *             backdrop with its own edge clamping and the junction seams.
 *   __flap    the label for that tab slot. It has no surface of its own — the
 *             glass under it IS the surface — which is exactly why the active
 *             tab reads as part of the page rather than as something next to it.
 *   __scroll  the content, and the scroll container: `Sheet` writes `scrollTop`
 *             here. It clips, the section does not, so the flap can hang out
 *             past the page's left edge.
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
      {/* The tabs of the sections that are NOT flush: deeper in tone, tucked
          behind, and the way back. `Sheet` hides the one whose section is
          painting, because that section is carrying its own flap. */}
      <div className="pv-tabs">
        {project.sections.map((section, k) => (
          <Tab key={k} index={k} title={section.title} hue={section.hue} onSelect={onSelect} />
        ))}
      </div>

      {/* The page area. It CLIPS on the right, at the page's own edge, so a
          section waiting its turn is off-stage rather than peeking beside the
          one you are reading — the notebook is one page surface, not a row. The
          clip is open to the left by the width of the tab column, so the flaps
          and the top section's shadow are not cut off. */}
      <div className="pv-pages">
        {project.sections.map((section, k) => (
          <article
            key={k}
            className="pv-section"
            data-k={k}
            data-hue={section.hue}
            style={{ '--pv-hue': section.hue, '--pv-k': k } as CSSProperties}
          >
            <div className="pv-section__glass" />
            <div className="pv-flap" aria-hidden="true">
              <span className="pv-tab__label">{section.title}</span>
            </div>
            <div className="pv-section__scroll">
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
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
