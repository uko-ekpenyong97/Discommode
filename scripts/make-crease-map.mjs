/**
 * The detail view's crease map — `npm run creases`.
 *
 * One small greyscale texture of creased paper, which the detail cards' shader
 * (src/components/detailPaper/paperMaterial.ts) reads for two things: how far to
 * push the artwork's UVs (the green channel is a height), and how much to light
 * or shade it. It is 400×520 — the card's own 10:13, and small on purpose: it is
 * stretched over a card and rotated per card, never tiled, so its resolution is
 * the resolution of a fold, not of the artwork.
 *
 * TWO SOURCES, in this order:
 *
 *   1. A scan. If `~/Discommode-pages/textures/paper-creases.{png,jpg}` exists it
 *      is desaturated, its levels normalised (troughs → 0.08, ridges → 0.9, from
 *      the 1st and 99th percentiles so a speck of dust cannot set the range) and
 *      resized to 400×520. Sources live outside the repo, beside the reader's page
 *      scans, for the reason those do.
 *   2. Otherwise it is DRAWN: 6–10 fold lines — a few long diagonals across the
 *      sheet and some short branches running in from the edges — each a soft
 *      ridge (a bright core with a 2–4px gaussian falloff) on a dark ground, plus
 *      a faint fine noise. Seeded, so a re-run is byte-identical.
 *
 * Either way it writes `public/textures/paper-creases.webp`, which is committed,
 * and says which path made it. docs/detail-paper.md records which one shipped.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const W = 400;
const H = 520;
const TROUGH = 0.08;
const RIDGE = 0.9;
const SEED = 0x0c4ea5e;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public/textures/paper-creases.webp');
const SRC_DIR = join(homedir(), 'Discommode-pages/textures');
const SOURCES = ['paper-creases.png', 'paper-creases.jpg'].map((f) => join(SRC_DIR, f));

/** mulberry32 — small, seeded, good enough for a texture. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map every value so the `lo` percentile lands on TROUGH and `hi` on RIDGE. */
function normalise(values, lo = 0.01, hi = 0.99) {
  const sorted = Float32Array.from(values).sort();
  const a = sorted[Math.floor(lo * (sorted.length - 1))];
  const b = sorted[Math.floor(hi * (sorted.length - 1))];
  const span = b - a || 1;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const t = Math.min(1, Math.max(0, (values[i] - a) / span));
    out[i] = Math.round((TROUGH + t * (RIDGE - TROUGH)) * 255);
  }
  return out;
}

async function fromScan(src) {
  const { data } = await sharp(src)
    .greyscale()
    .resize(W, H, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return normalise(Float32Array.from(data, (v) => v / 255));
}

/** Distance from p to the segment a→b. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return Math.hypot(x, y);
}

/** A fold as a polyline: a straight line with a little lateral wander, the way
 *  a real crease never quite is. */
function foldLine(r, ax, ay, bx, by, kinks) {
  const pts = [[ax, ay]];
  const nx = -(by - ay);
  const ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  for (let k = 1; k < kinks; k++) {
    const t = k / kinks;
    const off = (r() - 0.5) * 0.04 * len;
    pts.push([ax + (bx - ax) * t + (nx / len) * off, ay + (by - ay) * t + (ny / len) * off]);
  }
  pts.push([bx, by]);
  return pts;
}

function procedural() {
  const r = rng(SEED);
  const edgePoint = () => {
    // A point on one of the four edges.
    const side = Math.floor(r() * 4);
    const t = r();
    return side === 0 ? [t * W, 0] : side === 1 ? [W, t * H] : side === 2 ? [t * W, H] : [0, t * H];
  };

  const folds = [];
  const count = 6 + Math.floor(r() * 5); // 6–10
  const long = 3 + Math.floor(r() * 2); // 3–4 long diagonals
  for (let i = 0; i < long; i++) {
    // Corner-ish to opposite corner-ish, so they read as the folds a sheet got
    // from being crumpled in a hand rather than as a ruled grid.
    const flip = r() < 0.5;
    const ax = flip ? r() * W * 0.35 : W - r() * W * 0.35;
    const bx = flip ? W - r() * W * 0.35 : r() * W * 0.35;
    const ay = r() < 0.5 ? 0 : r() * H * 0.3;
    const by = r() < 0.5 ? H : H - r() * H * 0.3;
    folds.push({ pts: foldLine(r, ax, ay, bx, by, 4), sigma: 2.4 + r() * 1.6, gain: 0.85 + r() * 0.15 });
  }
  for (let i = long; i < count; i++) {
    // Short branches running in from an edge, at an angle to it.
    const [ax, ay] = edgePoint();
    const cx = W / 2 + (r() - 0.5) * W * 0.6;
    const cy = H / 2 + (r() - 0.5) * H * 0.6;
    const reach = 0.18 + r() * 0.3;
    const bx = ax + (cx - ax) * reach;
    const by = ay + (cy - ay) * reach;
    folds.push({ pts: foldLine(r, ax, ay, bx, by, 2), sigma: 2 + r() * 1.2, gain: 0.5 + r() * 0.35 });
  }

  const values = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const f of folds) {
        let d = Infinity;
        for (let k = 0; k < f.pts.length - 1; k++) {
          const [ax, ay] = f.pts[k];
          const [bx, by] = f.pts[k + 1];
          d = Math.min(d, segDist(x + 0.5, y + 0.5, ax, ay, bx, by));
        }
        // Bright core, gaussian falloff: the ridge a fold leaves when the sheet
        // is opened out flat again.
        v = Math.max(v, f.gain * Math.exp(-(d * d) / (2 * f.sigma * f.sigma)));
      }
      values[y * W + x] = v + (r() - 0.5) * 0.03; // faint fine noise
    }
  }
  return { data: normalise(values, 0, 1), folds: folds.length, long };
}

async function run() {
  mkdirSync(dirname(OUT), { recursive: true });
  const scan = SOURCES.find((p) => existsSync(p));
  let data;
  if (scan) {
    data = await fromScan(scan);
    console.log(`creases: from the scan ${scan}`);
  } else {
    const made = procedural();
    data = made.data;
    console.log(
      `creases: no scan at ${SRC_DIR}/paper-creases.{png,jpg} — drawn procedurally ` +
        `(${made.folds} folds, ${made.long} long; seed 0x${SEED.toString(16)})`,
    );
  }
  await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 92, effort: 6 })
    .toFile(OUT);
  console.log(`  → ${OUT.replace(`${root}/`, '')} (${W}×${H})`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
