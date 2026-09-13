/**
 * The close affordance: a large hairline ring, centred in the left gutter and
 * vertically in the viewport — the one piece of chrome the view has, sitting in
 * the band the sliver stack also lives in and over it.
 *
 * TWO elements, not one, and for a specific reason: the outer button carries
 * the ENTRANCE (a `--pv-pill`-driven offset written per frame by the motion
 * driver, with no transition on it), and the inner disc carries the HOVER (a
 * 0.25s transition on transform, background and colour). One element would have
 * to transition the same `transform` the driver is writing every frame, which
 * drags the entrance 250ms behind the rest of the sheet.
 *
 * Ring and glyph share `currentColor`, so hovering brightens both together.
 */
export function ClosePill({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="pv-close" onClick={onClose} aria-label="Close project">
      <span className="pv-close__disc">
        <svg
          className="pv-close__x"
          viewBox="0 0 55 55"
          width="55"
          height="55"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M14 14 L41 41 M41 14 L14 41"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </span>
    </button>
  );
}
