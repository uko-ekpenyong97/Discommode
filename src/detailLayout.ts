/**
 * Pure geometry for the detail view's hero carousel (Phase 13). Kept free of
 * React so it can be unit-tested.
 *
 * The centre card is a large hero (its height is `cardScale` of the viewport
 * height, 3:4 preserved); the side cards peek by `peek` px at the viewport
 * edges. `gap` is the minimum horizontal space between the centre card and a
 * side card: when the viewport is too narrow to fit `card + gap + peek` on each
 * side, the card is shrunk gracefully so the gap is preserved.
 */
import { CARD_ASPECT_H, CARD_ASPECT_W } from './config';

export interface DetailLayout {
  /** Centre/side panel size in px (all panels share it). */
  panelW: number;
  panelH: number;
  /** Centre-to-centre spacing between adjacent panels in the strip. */
  panelStep: number;
}

export function computeDetailLayout(
  vw: number,
  vh: number,
  cardScale: number,
  gap: number,
  peek: number,
): DetailLayout {
  // Hero height from the scale, capped so it never exceeds the viewport.
  let panelH = Math.min(vh * cardScale, vh * 0.96);
  let panelW = (panelH * CARD_ASPECT_W) / CARD_ASPECT_H;

  // Keep a `gap + peek` margin on each side; if the card is too wide for the
  // viewport, shrink it (graceful narrow-viewport handling).
  const maxW = Math.max(120, vw - 2 * (gap + peek));
  if (panelW > maxW) {
    panelW = maxW;
    panelH = (panelW * CARD_ASPECT_H) / CARD_ASPECT_W;
  }

  // Side cards sit so exactly `peek` of each shows at the viewport edge.
  const panelStep = vw / 2 + panelW / 2 - peek;
  return { panelW, panelH, panelStep };
}
