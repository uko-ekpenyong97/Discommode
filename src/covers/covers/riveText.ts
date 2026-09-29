/**
 * The rive-site cover's one texture: "Rive" in Inter Regular at 757.7px, as a
 * SIGNED DISTANCE FIELD, one strip of the marquee (1511 units, tiled).
 *
 * Drawn once to a 2D canvas and turned into distances on the CPU — Felzenszwalb
 * & Huttenlocher, as in Mapbox's TinySDF — because the rings need the distance
 * up to ~250 units from the glyphs and the particles read it at up to six
 * points a pixel: one texture tap each is the cheapest there is. ~100–140 ms,
 * once per `textTop`, shared by every renderer on the page (the grid's and the
 * detail paper's upload the same array) — in SLICES of a few ms, yielding
 * between them: in one task it was a 133–150 ms frame in the first second of
 * every page load, a direct #item-NN arrival's included (docs/detail-paper.md,
 * "The arrival").
 *
 * The font is SHIPPED (public/fonts/inter-latin-400.woff2, fontsource 4.5.15 =
 * Inter 3.19, OFL): it rasterises "Rive" pixel-identical to the Inter the cover
 * was tuned against, whose advance (1512.2) is Figma's strip spacing. Inter 4
 * (fontsource 5) does not: 1523.9, and 4.7% more ink.
 *
 * Plain TS, no three.js: the tuning bench (raw WebGL2) imports it too.
 */
export const STRIP_W = 1511;
/** The strip covers the glyphs plus the ~250 units the rings reach. */
export const STRIP_ABOVE = 300;
export const STRIP_H = 1300;
/** Figma's text box x for the copy that starts on the frame (the others are ±1511). */
export const TEXT_X = 40.5;
export const FONT_URL = '/fonts/inter-latin-400.woff2';
const FONT_PX = 757.7;
const FAMILY = 'CoverInter';

export interface RiveTextSdf {
  /** Signed distance, frame units, positive outside; row 0 = the strip's top. */
  data: Float32Array;
  width: number;
  height: number;
  /** Frame y of the strip's top row. */
  y0: number;
  /** Frame y of the baseline: the text box's top + Inter's ascent. */
  baseline: number;
  /** Where the R's stem starts, 300 units above the baseline (frame x). */
  stemX: number;
  advance: number;
}

let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  fontReady ??= new FontFace(FAMILY, `url(${FONT_URL})`, { weight: '400' })
    .load()
    .then((face) => {
      document.fonts.add(face);
    });
  return fontReady;
}

const cache = new Map<number, Promise<RiveTextSdf>>();

/** The strip for a text box whose top is at `textTop` (Figma's y, 204). Memoised. */
export function riveTextSdf(textTop: number): Promise<RiveTextSdf> {
  let p = cache.get(textTop);
  if (!p) {
    p = build(textTop);
    cache.set(textTop, p);
  }
  return p;
}

/** Main-thread ms per slice of the build before it yields a frame. */
const SLICE_MS = 6;
const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));

/** `fn(0) … fn(n − 1)`, yielding whenever a slice has run SLICE_MS. The same
 *  calls in the same order as one loop: the output does not change. */
export async function sliced(n: number, fn: (i: number) => void): Promise<void> {
  let t0 = performance.now();
  for (let i = 0; i < n; i++) {
    fn(i);
    if (performance.now() - t0 > SLICE_MS) {
      await yieldTask();
      t0 = performance.now();
    }
  }
}

async function build(textTop: number): Promise<RiveTextSdf> {
  await loadFont();
  const y0 = textTop - STRIP_ABOVE;
  const PAD = 320;
  const W = STRIP_W + 2 * PAD;
  const H = STRIP_H;
  const c2 = document.createElement('canvas');
  c2.width = W;
  c2.height = H;
  const ctx = c2.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `400 ${FONT_PX}px ${FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const m = ctx.measureText('Rive');
  const ascent = m.fontBoundingBoxAscent || 0.96875 * FONT_PX;
  const baseline = textTop + ascent;
  // Three copies, so the distance across the tile seam sees its neighbours.
  for (let k = -1; k <= 1; k++) ctx.fillText('Rive', PAD + k * STRIP_W, baseline - y0);
  const px = ctx.getImageData(0, 0, W, H).data;
  await yieldTask();

  let stemX = 0;
  const row = Math.round(baseline - 300 - y0);
  for (let x = PAD; x < PAD + 400; x++) {
    if (px[(row * W + x) * 4 + 3] >= 128) {
      stemX = TEXT_X + (x - PAD);
      break;
    }
  }

  const INF = 1e20;
  const N = W * H;
  const outer = new Float64Array(N);
  const inner = new Float64Array(N);
  await sliced(H, (y) => {
    for (let i = y * W; i < (y + 1) * W; i++) {
      const a = px[i * 4 + 3] / 255;
      if (a >= 1) {
        outer[i] = 0;
        inner[i] = INF;
      } else if (a <= 0) {
        outer[i] = INF;
        inner[i] = 0;
      } else {
        const d = 0.5 - a;
        outer[i] = d > 0 ? d * d : 0;
        inner[i] = d < 0 ? d * d : 0;
      }
    }
  });
  await edt(outer, W, H, INF);
  await edt(inner, W, H, INF);
  const data = new Float32Array(STRIP_W * H);
  await sliced(H, (y) => {
    for (let x = 0; x < STRIP_W; x++) {
      const i = y * W + x + PAD;
      data[y * STRIP_W + x] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
    }
  });
  return { data, width: STRIP_W, height: H, y0, baseline, stemX, advance: m.width };
}

async function edt(grid: Float64Array, w: number, h: number, INF: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Uint32Array(n);
  await sliced(w, (x) => edt1d(grid, x, w, h, f, v, z, INF));
  await sliced(h, (y) => edt1d(grid, y * w, 1, w, f, v, z, INF));
}

function edt1d(
  grid: Float64Array,
  offset: number,
  stride: number,
  length: number,
  f: Float64Array,
  v: Uint32Array,
  z: Float64Array,
  INF: number,
) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    let s: number;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
