/**
 * Plane size and position from a camera and a target rect, so that at scale 1
 * the plane's screen rect IS the HTML page's rect — to the pixel.
 *
 * That equality is the invariant the whole view rests on: the hand-off is a
 * crossfade between two surfaces showing the same pixels, and a crossfade
 * cannot hide a geometry change. `pv-verify` asserts it; a dev warning fires if
 * the two rects are ever more than a pixel apart at the moment of the fade.
 *
 * It is EXACT rather than approximate, and the reason is worth knowing: the
 * plane sits at z = 0 and the camera looks at z = 0 from `distance` away, so
 * the plane lies on the focal plane and the perspective divide is the same
 * constant for every one of its points. A flat plane there projects to a
 * rectangle at ANY field of view.
 *
 * What the narrow `fov` (20°) buys is the CURL. The rolled part of the sheet
 * leaves z = 0 by a good fraction of the page's height, and at a wide angle
 * that excursion splays: the near end of the roll grows, the far end shrinks,
 * and the tube reads as a cone nobody asked for. At 20° the divide across that
 * excursion is small enough that the roll keeps its own shape.
 */

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlaneFit {
  /** The plane's size in world units. */
  width: number;
  height: number;
  /** Where its CENTRE goes, in world units, so it lands on the rect's centre. */
  x: number;
  y: number;
  /** `width / height`. The shader's `uAspect` — from here, never from the
   *  viewport: the sheet's proportions are the page's, not the window's. */
  aspect: number;
  /** World units per CSS pixel on the focal plane. */
  unitsPerPixel: number;
}

/** World units per CSS pixel at `distance` from a camera of `fovDeg` vertical
 *  field of view, in a canvas `canvasHeight` px tall. */
export function unitsPerPixel(fovDeg: number, distance: number, canvasHeight: number): number {
  if (canvasHeight <= 0) return 0;
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / canvasHeight;
}

/**
 * Fit a plane to `rect`, both measured in the canvas's own CSS pixels. `rect`
 * is the page's rect relative to the canvas's top-left corner.
 */
export function fitPlaneToRect(
  fovDeg: number,
  distance: number,
  canvas: { width: number; height: number },
  rect: ScreenRect,
): PlaneFit {
  const u = unitsPerPixel(fovDeg, distance, canvas.height);
  return {
    width: rect.width * u,
    height: rect.height * u,
    x: (rect.left + rect.width / 2 - canvas.width / 2) * u,
    // Screen y runs down, world y runs up.
    y: -(rect.top + rect.height / 2 - canvas.height / 2) * u,
    aspect: rect.height > 0 ? rect.width / rect.height : 1,
    unitsPerPixel: u,
  };
}

/**
 * The inverse: where a fitted plane lands on screen. The round trip is what the
 * unit test holds to zero and what `pv-verify` holds to a pixel in the browser
 * — there against three.js's own projection rather than against this.
 */
export function projectPlaneRect(
  fovDeg: number,
  distance: number,
  canvas: { width: number; height: number },
  plane: Pick<PlaneFit, 'width' | 'height' | 'x' | 'y'>,
  scale = 1,
): ScreenRect {
  const u = unitsPerPixel(fovDeg, distance, canvas.height);
  if (u === 0) return { left: 0, top: 0, width: 0, height: 0 };
  const width = (plane.width * scale) / u;
  const height = (plane.height * scale) / u;
  return {
    left: canvas.width / 2 + plane.x / u - width / 2,
    top: canvas.height / 2 - plane.y / u - height / 2,
    width,
    height,
  };
}
