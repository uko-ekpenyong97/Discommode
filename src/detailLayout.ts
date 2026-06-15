/**
 * Pure geometry for the detail view's true 3-card layout (Phase 14). Kept free
 * of React so it can be unit-tested.
 *
 * Three cards share the stage as a centred group: the active card in the middle
 * (largest, height `cardScale` of the viewport height, 3:4 preserved), flanked
 * by the previous/next cards at `sideScale` of the centre, separated by `gap`.
 * Every panel is rendered at the CENTRE size and scaled down to `sideScale` for
 * the sides (so the slide can interpolate the scale continuously); `panelStep`
 * is the centre-to-centre spacing that yields exactly `gap` between a centre and
 * a side card's edges. Side cards may extend partly off-screen — that's fine.
 *
 * On a narrow viewport the centre card is shrunk so it never overflows width.
 */
import { CARD_ASPECT_H, CARD_ASPECT_W } from './config';

export interface DetailLayout {
  /** Centre (full-size) panel dimensions in px — the base size every panel renders at. */
  panelW: number;
  panelH: number;
  /** Centre-to-centre spacing between adjacent panels in the strip. */
  panelStep: number;
}

export function computeDetailLayout(
  vw: number,
  vh: number,
  cardScale: number,
  sideScale: number,
  gap: number,
): DetailLayout {
  // Centre height from the scale, capped so it never exceeds the viewport.
  let panelH = Math.min(vh * cardScale, vh * 0.96);
  let panelW = (panelH * CARD_ASPECT_W) / CARD_ASPECT_H;

  // Narrow viewport: keep the centre card within the width (graceful shrink).
  const maxW = Math.max(120, vw * 0.9);
  if (panelW > maxW) {
    panelW = maxW;
    panelH = (panelW * CARD_ASPECT_H) / CARD_ASPECT_W;
  }

  // Spacing so a centre↔side edge gap equals `gap` (side rendered at sideScale).
  const sideW = panelW * sideScale;
  const panelStep = panelW / 2 + gap + sideW / 2;
  return { panelW, panelH, panelStep };
}
