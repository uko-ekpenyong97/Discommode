/**
 * The close affordance: a circular pill on the left edge, vertically centred,
 * its own blurred glass. It enters from `translate(-73px, -73px)` — up and out
 * toward the corner — so it reads as arriving with the sheet rather than
 * fading in on the spot. `--pv-pill` drives both the offset and the opacity.
 */
export function ClosePill({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="pv-close" onClick={onClose} aria-label="Close project">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
