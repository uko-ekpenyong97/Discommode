/**
 * Any CSS colour the dials emit (hex, rgb(), oklch() …) as sRGB 0–1, read back
 * off a 1×1 canvas. Dials change rarely; the answer is cached per string.
 */
let probe: CanvasRenderingContext2D | null = null;
const cache = new Map<string, [number, number, number]>();

export function cssRgb(css: string): [number, number, number] {
  const hit = cache.get(css);
  if (hit) return hit;
  if (!probe) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    probe = c.getContext('2d', { willReadFrequently: true })!;
  }
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [d[0] / 255, d[1] / 255, d[2] / 255];
  cache.set(css, rgb);
  return rgb;
}
