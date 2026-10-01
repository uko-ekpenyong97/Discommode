/**
 * THE CHROME YIELDS TO THE BOOK. The book (and the detail view's hero card) is
 * the hero rect, `detailCardScale` of the viewport's height, and it is not the
 * chrome's to move. So when the band between the book and the viewport's edge
 * is too small for a line of chrome at its natural size, the chrome gives way:
 *
 *   1. it scales down (`chromeScale` × the fit) until its paper clears the
 *      book by {@link AIR} px;
 *   2. but never so far that its smallest face is under {@link MIN_TARGET} px —
 *      the buttons stay buttons a finger can find (the hit boxes are ≥ 44 in
 *      CSS whatever the face does; this keeps the FACE there too);
 *   3. and if that floor is reached and it still does not clear, the MARGIN
 *      gives up the rest — the line moves toward the viewport's edge, down to
 *      {@link MIN_MARGIN}.
 *
 * Pure: the geometry comes in as numbers (the faces' sizes in Figma units, from
 * the manifest via the faces' data attributes) and goes out as a fit and a
 * margin. `useChromeFit` measures and writes them; `chromeFit.test.ts`.
 */

/** Smallest a face may get, CSS px. */
export const MIN_TARGET = 44;
/** Clear air between the chrome's paper and the book, CSS px. Covers the
 *  hover lift (1.04 on a ~33-unit reach is ~1.3px) with a pixel to spare. */
export const AIR = 3;
/** Closest a line of chrome may come to the viewport's edge, CSS px. */
export const MIN_MARGIN = 8;

export interface FitFace {
  /** The face's base height, Figma units (58, 46). */
  base: number;
  /** The face's narrowest base side, Figma units (46 for a pill 131×46). */
  min: number;
  /** How far its paper reaches TOWARD THE BOOK from the base's centre, Figma
   *  units: the base's half plus the scallops' overhang on that side. */
  reach: number;
}

export interface Fit {
  /** × `chromeScale`: 1 at the natural size. */
  fit: number;
  /** The margin to use, px: `chromeMargin`, or less once the floor is hit. */
  margin: number;
  /** Where the paper's edge nearest the book ends up, px from the book (≥ AIR). */
  clearance: number;
  /** True when the face floor stopped the scaling and the margin gave way. */
  floored: boolean;
}

/**
 * One line of chrome — the row under the book, or the back shape over it —
 * against the band it sits in. `band` is the distance from the book's edge to
 * the viewport's edge, px; `margin` the line's distance from the viewport's
 * edge (`chromeMargin`); `scale` is `chromeScale`.
 *
 * The line's box is its tallest face's base, or the 44px hit box if that is
 * taller, centred on one line; its paper reaches `reach × u` from that centre
 * toward the book (u = px per Figma unit = scale × fit).
 */
export function chromeFit(band: number, margin: number, scale: number, faces: FitFace[]): Fit {
  const B = Math.max(...faces.map((f) => f.base));
  const R = Math.max(...faces.map((f) => f.reach));
  const smallest = Math.min(...faces.map((f) => f.min));
  // The book's side of the line, from the line's own edge: its box's half
  // (the larger of the face's half and the hit box's) plus the paper's reach.
  const extent = (u: number) => Math.max(B * u, MIN_TARGET) / 2 + R * u;
  const room = band - margin - AIR;

  // The largest u that fits, solved on both branches of the max().
  let u = scale;
  if (extent(u) > room) {
    const uFace = room / (B / 2 + R); // the face is taller than the hit box
    const uHit = (room - MIN_TARGET / 2) / R; // the hit box is taller
    u = B * uFace >= MIN_TARGET ? uFace : uHit;
  }
  // The floor: no face under MIN_TARGET px.
  const floor = Math.min(scale, MIN_TARGET / smallest);
  let floored = false;
  let m = margin;
  if (u < floor) {
    u = floor;
    floored = true;
    // …and the margin gives up what the faces could not.
    m = Math.max(MIN_MARGIN, band - AIR - extent(u));
  }
  return { fit: u / scale, margin: m, clearance: band - m - extent(u), floored };
}
