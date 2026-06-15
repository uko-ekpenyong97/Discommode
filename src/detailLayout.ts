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

/** A card's on-screen rect as a centre point + size (px). */
export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A trio of card rects: the previous (left), active (centre), next (right). */
export interface CardTrio {
  left: Rect;
  center: Rect;
  right: Rect;
}

/** Vertical centre of the detail strip as a fraction of viewport height (= CSS `top`). */
export const PANEL_CY_RATIO = 0.44;

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

/**
 * The on-screen rects of the three detail cards (prev/active/next) in the settled
 * 3-card layout — the FLIP transition's "detail" endpoints. The centre card sits
 * at the strip centre; the sides flank it at `panelStep`, scaled by `sideScale`.
 */
export function detailCardRects(
  vw: number,
  vh: number,
  layout: DetailLayout,
  sideScale: number,
): CardTrio {
  const cy = vh * PANEL_CY_RATIO;
  const sideW = layout.panelW * sideScale;
  const sideH = layout.panelH * sideScale;
  return {
    center: { cx: vw / 2, cy, w: layout.panelW, h: layout.panelH },
    left: { cx: vw / 2 - layout.panelStep, cy, w: sideW, h: sideH },
    right: { cx: vw / 2 + layout.panelStep, cy, w: sideW, h: sideH },
  };
}

/**
 * The on-screen rects of the centred grid card and its left/right neighbours —
 * the FLIP transition's "grid" endpoints. Valid only when the grid is settled
 * with the active card centred (which Phase 14's glide-to-centre guarantees):
 * the centre card sits at the viewport centre scaled by `focusScale`, the
 * neighbours one cell-span away at scale 1. Computed (not measured) so the rects
 * are flat — tilt is neutralised by construction.
 */
export function gridCardRects(
  vw: number,
  vh: number,
  cardW: number,
  cardH: number,
  cellSpanX: number,
  focusScale: number,
): CardTrio {
  const cy = vh / 2;
  return {
    center: { cx: vw / 2, cy, w: cardW * focusScale, h: cardH * focusScale },
    left: { cx: vw / 2 - cellSpanX, cy, w: cardW, h: cardH },
    right: { cx: vw / 2 + cellSpanX, cy, w: cardW, h: cardH },
  };
}
