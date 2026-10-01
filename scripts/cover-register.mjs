/**
 * Registering an object's animation frames onto the illustrated cover.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cover-anim-placements.json` gives each object a `rect` from Figma, in
 * 2000x2600 cover space. The original plan was to derive the frame->cover
 * transform from that rect alone: the rect's aspect would match either the
 * source canvas (untrimmed image fill) or the alpha bounding box of frame 1
 * (trimmed fill), and the scale would fall out as `rect.w / sourceBox.w`.
 *
 * Measured against the real exports, that test fails for 15 of the 20 objects,
 * and the four "clean" ones turn out to be coincidences: registering the art
 * against the cover shows the drawn artwork is ~11% SMALLER than the rect and
 * inset from its top-left by a per-object margin (14px for shark, 21px for
 * lucero, in cover px). Whatever produces that margin in Figma — a Fit-mode
 * fill, an effect expanding the bounding box — the rect is not a tight box
 * around the art, so it cannot be the scale reference.
 *
 * So the cover itself is the ground truth. The animation frames and the cover
 * are the SAME drawing, so where the transform is right their pixels AGREE.
 * That gives a blunt, very legible objective:
 *
 *     score(s, ox, oy) = sum over candidate-opaque pixels of
 *                          |cover - art| < TAU ? +1 : -1
 *
 * Shrinking the candidate loses agreeing pixels; growing it collects
 * disagreeing ones. So the optimum is stationary in scale, unlike a ratio
 * (maximised by shrinking onto flat background) or a masked correlation (same
 * bias — that is what an earlier attempt got wrong, landing every object 6-12%
 * small). Occlusion by a higher-z object caps the attainable score but does not
 * move the optimum, which matters: these objects overlap on the cover.
 *
 * `rect` keeps two jobs: it seeds the search, and it stays the hit rectangle
 * (it IS the region Figma considers the layer, so it is the right hover target).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/** Per-channel tolerance for calling two pixels "the same colour" (0-255). */
const TAU = 28;
/** Alpha above which a source pixel counts as part of the artwork. */
const ALPHA_INK = 8;
/** Alpha above which a candidate pixel votes (excludes antialiased fringes). */
const ALPHA_VOTE = 220;
/** Frame 1 is taken as the still unless it registers worse than this. */
export const STILL_ACCEPT = 0.9;

/**
 * The search pyramid. Each level's span must cover the previous level's step,
 * and each level's offset span must cover the previous level's offset step —
 * otherwise a coarse level's quantisation error is unrecoverable. Sizes are
 * chosen so every level costs roughly the same: the patch area grows 4x per
 * level, so the scale and offset counts shrink to match.
 */
const LEVELS = [
  //  ds   scale span  steps   offset span (cover px)  offset step
  { ds: 8, span: 0.25, steps: 8, off: 96, step: 8 },
  { ds: 4, span: 0.06, steps: 5, off: 24, step: 4 },
  { ds: 2, span: 0.02, steps: 4, off: 8, step: 2 },
  { ds: 1, span: 0.006, steps: 3, off: 3, step: 1 },
];

// ── decoding ──────────────────────────────────────────────────────────────

/**
 * The illustrated cover, flattened onto white and pre-shrunk at every pyramid
 * level. Flattening matters: the export carries an alpha channel that is opaque
 * throughout, and leaving it on would make the raw buffer 4 channels here and 3
 * elsewhere.
 */
export async function loadCover(path, coverW, coverH) {
  const { width, height } = await sharp(path).metadata();
  if (width !== coverW || height !== coverH) {
    throw new Error(`cover is ${width}x${height}, expected ${coverW}x${coverH}`);
  }
  const levels = new Map();
  for (const { ds } of LEVELS) {
    if (levels.has(ds)) continue;
    const w = Math.round(coverW / ds);
    const h = Math.round(coverH / ds);
    const data = await sharp(path).resize(w, h).flatten({ background: '#ffffff' })
      .removeAlpha().raw().toBuffer();
    levels.set(ds, { w, h, rgb: data });
  }
  return { w: coverW, h: coverH, levels };
}

/**
 * One frame: full-resolution RGBA, its alpha bounding box, and a lazily built
 * shrunk copy per pyramid level so the search never re-decodes the PNG.
 */
export async function loadFrame(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return frameFromRaw(path, data, info.width, info.height);
}

/** A frame from RGBA already in memory (the page animations register mirrored
 *  and rotated copies of their frames). */
export function frameFromRaw(path, data, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * 4 + 3] > ALPHA_INK) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const box = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { path, w, h, rgba: data, box, shrunk: new Map() };
}

/** The frame pre-shrunk by `ds`, so patch renders at that level are cheap. */
async function shrunk(frame, ds) {
  if (ds === 1) return { w: frame.w, h: frame.h, rgba: frame.rgba, ds: 1 };
  if (frame.shrunk.has(ds)) return frame.shrunk.get(ds);
  const w = Math.max(1, Math.round(frame.w / ds));
  const h = Math.max(1, Math.round(frame.h / ds));
  const rgba = await sharp(frame.rgba, { raw: { width: frame.w, height: frame.h, channels: 4 } })
    .resize(w, h).raw().toBuffer();
  const v = { w, h, rgba, ds };
  frame.shrunk.set(ds, v);
  return v;
}

/** The art box rendered at `outW x outH`, sampled from the level-`ds` copy. */
async function patch(frame, box, ds, outW, outH) {
  const src = await shrunk(frame, ds);
  const k = 1 / (src.ds ?? ds);
  const left = Math.max(0, Math.min(src.w - 1, Math.round(box.x * k)));
  const top = Math.max(0, Math.min(src.h - 1, Math.round(box.y * k)));
  const width = Math.max(1, Math.min(src.w - left, Math.round(box.w * k)));
  const height = Math.max(1, Math.min(src.h - top, Math.round(box.h * k)));
  const rgba = await sharp(src.rgba, { raw: { width: src.w, height: src.h, channels: 4 } })
    .extract({ left, top, width, height })
    .resize(outW, outH, { fit: 'fill' })
    .raw().toBuffer();
  return { w: outW, h: outH, rgba };
}

// ── scoring ───────────────────────────────────────────────────────────────

/** Net agreement votes with the patch's top-left at (px,py), in level space. */
function vote(cov, p, px, py) {
  let net = 0;
  let hit = 0;
  let n = 0;
  const x0 = Math.max(px, 0);
  const x1 = Math.min(px + p.w, cov.w);
  const y0 = Math.max(py, 0);
  const y1 = Math.min(py + p.h, cov.h);
  for (let y = y0; y < y1; y++) {
    const pr = (y - py) * p.w - px;
    const cr = y * cov.w;
    for (let x = x0; x < x1; x++) {
      const pi = (pr + x) * 4;
      if (p.rgba[pi + 3] < ALPHA_VOTE) continue;
      const ci = (cr + x) * 3;
      n++;
      if (
        Math.abs(p.rgba[pi] - cov.rgb[ci]) < TAU &&
        Math.abs(p.rgba[pi + 1] - cov.rgb[ci + 1]) < TAU &&
        Math.abs(p.rgba[pi + 2] - cov.rgb[ci + 2]) < TAU
      ) {
        net++;
        hit++;
      } else {
        net--;
      }
    }
  }
  return { net, agree: n ? hit / n : 0, n };
}

/** One pyramid level: search scale x offset around a seed, return the best. */
async function refine(cover, frame, box, level, seed) {
  const { ds, span, steps, off, step } = level;
  const cov = cover.levels.get(ds);
  let best = null;
  for (let k = -steps; k <= steps; k++) {
    const s = seed.s * (1 + (k / steps) * span);
    const outW = Math.max(2, Math.round((box.w * s) / ds));
    const outH = Math.max(2, Math.round((box.h * s) / ds));
    const p = await patch(frame, box, ds, outW, outH);
    for (let dy = -off; dy <= off; dy += step) {
      for (let dx = -off; dx <= off; dx += step) {
        const ox = seed.ox + dx;
        const oy = seed.oy + dy;
        const v = vote(cov, p, Math.round(ox / ds), Math.round(oy / ds));
        if (!best || v.net > best.net) best = { net: v.net, agree: v.agree, s, ox, oy };
      }
    }
  }
  return best;
}

/**
 * Local coordinate descent at full resolution. The pyramid lands within a step
 * of the optimum but its grid quantises both scale and offset; a 0.15% scale
 * error is worth a couple of points of agreement, which matters because the
 * agreement figure is also the quality gate. Walking downhill in each axis
 * until nothing improves removes that artefact for a handful of extra probes.
 */
async function polish(cover, frame, box, seed) {
  const cov = cover.levels.get(1);
  const probe = async (s, ox, oy) => {
    const outW = Math.max(2, Math.round(box.w * s));
    const outH = Math.max(2, Math.round(box.h * s));
    const p = await patch(frame, box, 1, outW, outH);
    return { ...vote(cov, p, Math.round(ox), Math.round(oy)), s, ox, oy };
  };
  let best = await probe(seed.s, seed.ox, seed.oy);
  for (let pass = 0; pass < 12; pass++) {
    const dS = best.s * 0.0015;
    const candidates = [
      [best.s + dS, best.ox, best.oy], [best.s - dS, best.ox, best.oy],
      [best.s, best.ox + 1, best.oy], [best.s, best.ox - 1, best.oy],
      [best.s, best.ox, best.oy + 1], [best.s, best.ox, best.oy - 1],
    ];
    let moved = false;
    for (const [s, ox, oy] of candidates) {
      const v = await probe(s, ox, oy);
      if (v.net > best.net) { best = v; moved = true; }
    }
    if (!moved) break;
  }
  return best;
}

/**
 * Register one frame: coarse-to-fine down the pyramid, seeded from the rect.
 * Returns { s, ox, oy, agree } in cover space — `s` is cover px per source px
 * and (ox,oy) is where the frame's alpha box lands.
 */
export async function registerFrame(cover, frame, rect) {
  if (!frame.box) return null;
  const s0 = rect.w / frame.box.w;
  let best = { s: s0, ox: rect.x, oy: rect.y + (rect.h - frame.box.h * s0) / 2 };
  for (const level of LEVELS) {
    const next = await refine(cover, frame, frame.box, level, best);
    if (!next) return null;
    best = next;
  }
  return polish(cover, frame, frame.box, best);
}

/**
 * How sharply the optimum peaks: agreement at the found transform minus the
 * mean agreement four small shifts away.
 *
 * Raw agreement alone is not a quality gate — it falls with the artwork's
 * spatial frequency and with occlusion, not with the registration error. Lacy
 * art (cherry blossoms, a shelf of titled book spines) cannot agree
 * pixel-for-pixel even when placed perfectly, and an object half-hidden behind a
 * higher-z neighbour disagrees everywhere it is covered. Both score low while
 * being placed exactly right.
 *
 * The margin is immune to that, because the shifted comparisons carry the same
 * artwork and the same occlusion: only the alignment differs. A large margin
 * means the placement is pinned down; a margin near zero means the objective is
 * flat there and the transform is a guess — which is the thing to flag.
 */
const MARGIN_SHIFT = 6;
export async function peakMargin(cover, frame, fit) {
  const cov = cover.levels.get(1);
  const box = frame.box;
  const outW = Math.max(2, Math.round(box.w * fit.s));
  const outH = Math.max(2, Math.round(box.h * fit.s));
  const p = await patch(frame, box, 1, outW, outH);
  const at = (dx, dy) =>
    vote(cov, p, Math.round(fit.ox) + dx, Math.round(fit.oy) + dy).agree;
  const peak = at(0, 0);
  const around =
    (at(MARGIN_SHIFT, 0) + at(-MARGIN_SHIFT, 0) + at(0, MARGIN_SHIFT) + at(0, -MARGIN_SHIFT)) / 4;
  return { peak, margin: peak - around };
}

/**
 * Register an object: try frame 1 first (the spec's assumption, and the common
 * case), and only fall back to searching every frame when frame 1 registers
 * badly — which is how `libros` (frame 1 is fully transparent; the shelf builds
 * up over 11 frames) and `patito` get resolved without paying for a full sweep
 * on the other eighteen.
 */
export async function registerObject(cover, frames, rect) {
  const first = frames.findIndex((f) => f.box);
  if (first === -1) return null;

  const tried = new Map();
  const fit0 = await registerFrame(cover, frames[first], rect);
  if (fit0) tried.set(first, fit0);
  if (fit0 && fit0.agree >= STILL_ACCEPT) {
    return { still: first, fit: fit0, qc: await peakMargin(cover, frames[first], fit0), tried, swept: false };
  }

  let bestIndex = first;
  let bestFit = fit0;
  for (let i = 0; i < frames.length; i++) {
    if (i === first || !frames[i].box) continue;
    const fit = await registerFrame(cover, frames[i], rect);
    if (!fit) continue;
    tried.set(i, fit);
    if (!bestFit || fit.agree > bestFit.agree) {
      bestFit = fit;
      bestIndex = i;
    }
  }
  if (!bestFit) return null;
  return {
    still: bestIndex,
    fit: bestFit,
    qc: await peakMargin(cover, frames[bestIndex], bestFit),
    tried,
    swept: true,
  };
}

// ── geometry ──────────────────────────────────────────────────────────────

/** Frames ordered by the trailing number, ignoring the prefix entirely. */
export function orderFrames(files) {
  return files
    .filter((f) => /\.png$/i.test(f))
    .map((f) => ({ f, n: Number(/-(\d+)\.png$/i.exec(f)?.[1] ?? NaN) }))
    .filter((e) => Number.isFinite(e.n))
    .sort((a, b) => a.n - b.n)
    .map((e) => e.f);
}

/** Union of every frame's alpha box — the animation may leave the still's box. */
export function unionOf(frames) {
  let u = null;
  for (const f of frames) {
    if (!f.box) continue;
    if (!u) {
      u = { ...f.box };
      continue;
    }
    const x = Math.min(u.x, f.box.x);
    const y = Math.min(u.y, f.box.y);
    u = {
      x,
      y,
      w: Math.max(u.x + u.w, f.box.x + f.box.w) - x,
      h: Math.max(u.y + u.h, f.box.y + f.box.h) - y,
    };
  }
  return u;
}

/**
 * Map a source-canvas box into cover space through the registered transform.
 * `origin` is where the STILL frame's alpha box landed, so the canvas origin is
 * that minus the still box's own offset — one transform shared by every frame,
 * which is what keeps the frames registered to each other.
 */
export function mapBox(box, stillBox, fit) {
  const canvasX = fit.ox - stillBox.x * fit.s;
  const canvasY = fit.oy - stillBox.y * fit.s;
  return {
    x: canvasX + box.x * fit.s,
    y: canvasY + box.y * fit.s,
    w: box.w * fit.s,
    h: box.h * fit.s,
  };
}


/**
 * Per-folder overrides in `fps.json`: either a bare number (the rate) or
 * `{ "fps": 6, "mode": "once", "rest": "last" }`.
 *
 * `mode` is `"loop"` (default) or `"once"`. A `once` object plays through and
 * holds its last frame for as long as the pointer stays on it; it is encoded
 * with `loop: 1` so the browser stops it there.
 *
 * `rest` is `"first"` (default) or `"last"`, and picks WHICH FRAME the cover
 * rests on. Most objects rest on frame 1 and animate away from it. A build-up
 * that should read as already-built at rest — the shelf of books full, emptying
 * and refilling on hover — rests on its last frame instead, which means the
 * resting image and the animation's first frame differ ON PURPOSE, and the layer
 * cross-fades into the loop rather than cutting.
 */
export async function folderOptions(dir) {
  const fallback = { fps: null, mode: 'loop', rest: 'first' };
  try {
    const raw = JSON.parse(await readFile(join(dir, 'fps.json'), 'utf8'));
    const n = typeof raw === 'number' ? raw : raw?.fps;
    const obj = typeof raw === 'object' && raw !== null ? raw : {};
    return {
      fps: Number.isFinite(n) && n > 0 ? n : null,
      mode: obj.mode === 'once' ? 'once' : 'loop',
      rest: obj.rest === 'last' ? 'last' : 'first',
    };
  } catch {
    return fallback;
  }
}

