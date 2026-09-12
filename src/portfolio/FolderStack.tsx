import type { CSSProperties, Ref } from 'react';
import { BlockView } from './blocks/Blocks';
import { rowOf } from './pageTrack';
import type { Block, Project } from './blocks/types';

/**
 * The pile of folders. One `<article>` per section, all of them absolutely
 * positioned in the same box; `Sheet` writes each one's `top`, `height` and
 * `zIndex` every frame from a single call to `pageTrack`'s `layout()`. Nothing
 * here re-renders while you scroll.
 *
 * A FOLDER IS FOUR LAYERS, and the order matters:
 *
 *   __shape  one glass element carrying the tint and the `backdrop-filter`,
 *            clipped to the folder's outline — tab, 45° chamfer, then full
 *            width. One element for the whole outline, because two adjacent
 *            ones do not join: each blurs its own backdrop with its own edge
 *            clamping and the junction seams.
 *   __band   the lighter wash across the tab, which is what makes the outline
 *            read against the folder's own body. Inside the shape, so the
 *            chamfer clips it for free.
 *   __tab    the label, and the way back — every tab in either pile is a link
 *            to its section.
 *   __body   the content, and the scroll container: `Sheet` writes `scrollTop`
 *            here. Its height is the same for every folder (`--pv-body-h`), so
 *            a folder's content height — the thing the whole track is built
 *            from — does not depend on where in the pile it happens to be.
 *
 * The `<article>` itself clips (`overflow: hidden`) and its height is the
 * folder's share of the screen. That is the entire painting rule: a folder
 * shows its tab when it is piled, its tab and the sliver of body edge that
 * makes a stack read as a stack when it is docked, and everything down to the
 * next row when it is the one you are reading.
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

interface FolderStackProps {
  project: Project;
  stackRef: Ref<HTMLDivElement>;
  /** A tab was clicked — scroll the track to that folder. */
  onSelect: (index: number) => void;
}

export function FolderStack({ project, stackRef, onSelect }: FolderStackProps) {
  return (
    <div className="pv-stack" ref={stackRef}>
      {project.sections.map((section, k) => (
        <article
          key={k}
          className="pv-folder"
          data-k={k}
          data-side={k % 2 === 0 ? 'left' : 'right'}
          data-row={rowOf(k)}
          style={{ '--pv-hue': section.hue } as CSSProperties}
        >
          <div className="pv-folder__shape">
            <div className="pv-folder__band" />
          </div>
          <button type="button" className="pv-folder__tab" onClick={() => onSelect(k)}>
            <span className="pv-folder__no">{String(k + 1).padStart(2, '0')}</span>
            <span className="pv-folder__title">{section.title}</span>
          </button>
          <div className="pv-folder__body">
            <div className="pv-folder__inner">
              <div className="pv-folder__column">
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
  );
}
