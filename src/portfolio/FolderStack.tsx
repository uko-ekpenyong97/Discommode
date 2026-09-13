import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { BlockView } from './blocks/Blocks';
import { rowOf } from './pageTrack';
import type { Block, Project } from './blocks/types';

/**
 * The cabinet. One `<article>` per section, all of them absolutely positioned
 * in the same box; `Sheet` writes each one's `top`, `height` and `zIndex` every
 * frame from a single call to `pageTrack`'s `layout()`. Nothing here re-renders
 * while you scroll.
 *
 * A FOLDER IS FOUR LAYERS, and the order matters:
 *
 *   __shape    one glass element carrying the tint and the `backdrop-filter`,
 *              clipped to the folder's outline: tab, chamfer, body — and, when
 *              the folder is the open one, the full-width page below. ONE
 *              element for all of it, because two adjacent ones do not join:
 *              each blurs its own backdrop with its own edge clamping and the
 *              junction seams however exactly the tints match.
 *   __thumbs   a slot for the thumbnails that pop above the tab on hover.
 *              Empty and hidden until there is content to put in it.
 *   __strip    the way back — every folder in either pile is a link to itself.
 *              Sized to the whole visible face, so the hit area is what you can
 *              see; the __label inside it is the STRIP proper, the number and
 *              the title riding across the tab and the sliver of body under it.
 *   __content  the page, and the scroll container: `Sheet` writes `scrollTop`
 *              here. It opens with the same number and title again, large.
 *
 * The `<article>` itself clips (`overflow: hidden`) and its height is the
 * folder's share of the screen. That is the entire painting rule: filed, a
 * folder runs from its own tab down to the BODY of the row in front of it, so
 * the row in front covers the overlap and this one's body fills the notch
 * beside that row's tab — no glass between two rows, and the overlap is what
 * makes a stack of paper look like a stack of paper. Open, it runs from its tab
 * to the top of the pile, and everything under the strip is its page.
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

/**
 * Hover, written straight to the DOM rather than held in state: pointing at a
 * folder lifts it and fades every other folder down, and neither is worth a
 * render of the whole project. The open folder is exempt — it is the thing you
 * are reading, not one of the things you might go to.
 *
 * The handlers are on the FACE, not on the folder. The folder's element spans
 * the whole sheet whatever column it is drawn in — the open page needs that
 * width — so a folder in the right column would otherwise swallow the pointer
 * over its neighbour in the left. The face is the part you can actually see,
 * and is exactly the part that should answer.
 */
function onEnter(e: ReactPointerEvent<HTMLElement>): void {
  const folder = e.currentTarget.closest<HTMLElement>('.pv-folder');
  if (!folder || folder.hasAttribute('data-open')) return;
  folder.toggleAttribute('data-hover', true);
  folder.parentElement?.toggleAttribute('data-hovering', true);
}

function onLeave(e: ReactPointerEvent<HTMLElement>): void {
  const folder = e.currentTarget.closest<HTMLElement>('.pv-folder');
  folder?.toggleAttribute('data-hover', false);
  folder?.parentElement?.toggleAttribute('data-hovering', false);
}

interface FolderStackProps {
  project: Project;
  stackRef: Ref<HTMLDivElement>;
  /** A folder was clicked — scroll the track to it. */
  onSelect: (index: number) => void;
}

export function FolderStack({ project, stackRef, onSelect }: FolderStackProps) {
  return (
    <div className="pv-stack" ref={stackRef}>
      {project.sections.map((section, k) => {
        const no = String(k + 1).padStart(2, '0');
        return (
          <article
            key={k}
            className="pv-folder"
            data-k={k}
            data-side={k % 2 === 0 ? 'left' : 'right'}
            data-row={rowOf(k)}
            style={{ '--pv-hue': section.hue } as CSSProperties}
          >
            <div className="pv-folder__shape" />
            {/* Three thumbnails, tilted, popping above the tab on hover. The
                slot is here so the geometry around it is settled; it stays
                hidden until a project has images to put in it. */}
            <div className="pv-folder__thumbs" aria-hidden="true">
              <span /> <span /> <span />
            </div>
            <button
              type="button"
              className="pv-folder__strip"
              onClick={() => onSelect(k)}
              onPointerEnter={onEnter}
              onPointerLeave={onLeave}
            >
              <span className="pv-folder__label">
                <span className="pv-folder__no">{no}</span>
                <span className="pv-folder__title">{section.title}</span>
              </span>
            </button>
            <div className="pv-folder__content">
              <div className="pv-folder__inner">
                <header className="pv-folder__header">
                  <span className="pv-folder__no">{no}</span>
                  <h2 className="pv-folder__heading">{section.title}</h2>
                </header>
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
        );
      })}
    </div>
  );
}
