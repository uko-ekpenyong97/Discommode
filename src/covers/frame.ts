import { COVERS } from './covers';
import { coverCropOf } from './coverRenderer';
import type { Crop } from './types';

const crop: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
const out: [number, number] = [0, 0];

/**
 * A point at (u, v) across a `w × h` instance box, in the cover's frame
 * units. Every instance is an object-fit: cover crop of the frame, so its box
 * maps onto the crop. Returns a reused pair.
 */
export function frameOf(coverId: string, w: number, h: number, u: number, v: number): [number, number] {
  const def = COVERS[coverId];
  coverCropOf(def.frame.w, def.frame.h, w, h, crop);
  out[0] = crop.x0 + u * crop.w;
  out[1] = crop.y0 + v * crop.h;
  return out;
}
