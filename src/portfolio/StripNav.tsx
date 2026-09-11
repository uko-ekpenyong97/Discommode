/**
 * The bar at the foot of the sheet: which project you are in, and the arrows
 * that walk the neighbour ring. It is the keyboard arrows made visible — the
 * peeking neighbours are clickable too, but only the ones either side, and on
 * a narrow viewport they barely show.
 *
 * Portfolio cards only: the magazine is never a neighbour here. You leave the
 * view to reach it.
 */
interface StripNavProps {
  /** Id of the project currently centred. */
  project: string;
  onStep: (direction: -1 | 1) => void;
}

export function StripNav({ project, onStep }: StripNavProps) {
  return (
    <div className="pv-nav">
      <button
        type="button"
        className="pv-nav__btn"
        onClick={() => onStep(-1)}
        aria-label="Previous project"
      >
        ‹
      </button>
      <span className="pv-nav__label">PROJECT {project}</span>
      <button
        type="button"
        className="pv-nav__btn"
        onClick={() => onStep(1)}
        aria-label="Next project"
      >
        ›
      </button>
    </div>
  );
}
