import type { PointerEvent as ReactPointerEvent } from 'react';
import SkyLayer from '../components/SkyLayer';
import type { Project } from './blocks/types';

/**
 * THE GROUND — the field the paper sits on, and the only thing in the view
 * that never moves.
 *
 * IT IS THE SKY NOW. It used to be one flat ink blue, and the argument for that
 * was that it is opaque: the grid behind it is still rendering and the scrim
 * still tints it, so the card you opened from is where you left it, but nothing
 * shows through, because paper on glass is a contradiction. All of that still
 * holds — the sky layer here is an opaque canvas, and the grid is as covered by
 * it as it was by the blue. What changed is what the opaque thing IS. A page
 * about a project is a page you put down somewhere, and the somewhere the rest
 * of the site has is San Francisco's weather.
 *
 * It is the SAME sky, not a copy of it: one WebGL2 context for the whole app,
 * whose canvas this layer claims off the grid while the view is open and hands
 * back when it closes (see `skyStage.ts`). So the sky you scroll a project on
 * is the sky you left, mid-drift, and opening a project costs no second
 * shader.
 *
 * Over it goes the SCRIM, a flat black wash at `groundScrim`. The sky is a
 * picture and the paper has to sit on it rather than in front of it; the number
 * is what the letterhead's 7:1 needs at clear noon, which is the brightest the
 * sky ever gets. See `contrastProbe.ts`.
 *
 * Then the GRAIN, which is a compositor-only transform loop over a tile of
 * turbulence — a repaint per step of a full-viewport layer would cost frames
 * under a page of type, and the whole point of the vertical run is that nothing
 * is costing frames during it. And the LETTERHEAD, a mono strip
 * across the top: the project, the section numbers as links, the section you
 * are on, and a dateline. It goes UNDER the paper rather than over it — see
 * `portfolio.css`, which is where that decision is written down.
 *
 * The number of the section ON ITS WAY is marked pending — dim, and named in
 * the strip beside the numbers — from the moment the ground empties to the
 * moment that section's page arrives. Through a dwell it is the only thing on
 * screen, and without it half a screen of bare ground reads as the view having
 * stopped rather than as a beat between two sheets.
 *
 * THE NUMBERS ARE THE ONLY NAVIGATION THE VIEW HAS. Clicking one is
 * `lenis.scrollTo(start[k])` with the dial's duration — the same call a deep
 * link resolves to, so there is one way to arrive at a section and it is used
 * by both. The strip sits on the ground rather than on the paper, so it does
 * not move when a sheet does and it never has to be part of a texture.
 *
 * AND THE WAY OUT, at the right end. It replaced a 96px ring in the bottom-left
 * corner, which cost the page a 144px band it was not allowed to use — a piece
 * of chrome with its own colour, its own blur and seven dials, to say a thing
 * the keyboard already did. It is a word in the strip's own mono now: the two
 * ways out that are not a browser button, named where the view already names
 * itself.
 *
 * IT IS FIRST IN THE DOM AND LAST ON SCREEN, and that is deliberate. This is a
 * modal: the way out should be the first thing Tab reaches, not something you
 * arrive at after every section number and every link in the project — which is
 * the arrangement the pill had, for the same reason. `order` puts it back on
 * the right where it reads as a footnote to the strip rather than as the first
 * thing in it.
 *
 * EVERY BUTTON IN HERE STOPS ITS POINTER EVENTS. The strip is ground, and
 * clicking the ground leaves the view (`useDismissOnGround`) — so without this
 * a click on a section number scrolls to that section AND closes the view on
 * the way. That was already true before this item existed and nothing caught
 * it: the suite clicks with `element.click()`, which dispatches a bare `click`
 * and no pointer events at all. The dead parts of the strip still dismiss,
 * which is what the hook is for.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Pointer events on a control inside the strip are the control's, not the
 *  ground's — see the note above. */
const keepPointer = {
  onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
  onPointerUp: (e: ReactPointerEvent) => e.stopPropagation(),
};

interface GroundProps {
  project: Project;
  /** The section whose page is live. Commits at the hand-off, so this changes
   *  once per section rather than continuously. */
  activeIndex: number;
  /** The section on its way — from the moment the ground empties to the moment
   *  its page arrives. Null the rest of the time. */
  pendingIndex: number | null;
  /** A number was clicked — scroll the track to that section. */
  onSelect: (index: number) => void;
  /** Leave the view: the same close the Escape key and the ground both run, so
   *  there is one exit and it plays the same storyboard however it was asked
   *  for. It ends in `history.back()` when the view was opened from an item. */
  onClose: () => void;
}

export function Ground({ project, activeIndex, pendingIndex, onSelect, onClose }: GroundProps) {
  const total = project.sections.length;
  const current = project.sections[Math.min(activeIndex, total - 1)];
  const pending = pendingIndex === null ? null : project.sections[pendingIndex];
  return (
    <div className="pv-ground">
      <SkyLayer />
      <div className="pv-ground__scrim" aria-hidden="true" />
      <div className="pv-grain" aria-hidden="true" />
      <header className="pv-letterhead">
        {/* First in the DOM, last on screen. A button, so Enter and Space
            close it without a line of code. */}
        <button
          type="button"
          className="pv-letterhead__back"
          onClick={onClose}
          {...keepPointer}
        >
          ESC / &larr; BACK
        </button>
        <span className="pv-letterhead__project">{project.title}</span>
        <nav className="pv-letterhead__nav" aria-label="Sections">
          {project.sections.map((section, k) => (
            <button
              key={k}
              type="button"
              className="pv-letterhead__no"
              data-current={k === activeIndex || undefined}
              data-pending={k === pendingIndex || undefined}
              aria-current={k === activeIndex ? 'true' : undefined}
              onClick={() => onSelect(k)}
              {...keepPointer}
            >
              <span className="pv-sr">{section.title}</span>
              <span aria-hidden="true">{pad(k + 1)}</span>
            </button>
          ))}
        </nav>
        {/* While the ground is empty and while the next sheet unrolls, the
            strip names what is COMING rather than what has gone — dim, because
            it is not there yet. It is the only thing on screen during a dwell
            that says the view has not simply stopped. */}
        <span className="pv-letterhead__section" data-pending={pending ? '' : undefined}>
          {pending
            ? `${pending.title} — ${pad(pendingIndex! + 1)} / ${pad(total)}`
            : `${current?.title} — ${pad(activeIndex + 1)} / ${pad(total)}`}
        </span>
        <span className="pv-letterhead__ref">{project.ref}</span>
      </header>
    </div>
  );
}
