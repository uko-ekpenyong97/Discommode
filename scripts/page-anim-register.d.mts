/** Types for the parts of page-anim-register.mjs the unit tests use. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function fitInside(box: Box, aspect: number): Box;
export function turnedBounds(box: Box, deg: number): Box;
