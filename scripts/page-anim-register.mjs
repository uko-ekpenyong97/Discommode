/**
 * Where an inside page's animation sits on its baked page — a SUGGESTION.
 *
 * The page animations' placement is `src/reader/pageAnims.ts`, edited by a
 * person (the align tool in the READER NAV dock writes its rows). This module
 * only proposes a row: it runs the cover's registration (scripts/cover-register
 * .mjs — the agreement score, coarse to fine, then polished) of the animation's
 * frames against the BAKED page, which prints the drawing, seeded from the
 * current row. `npm run anims` prints what it finds beside the row in the file
 * and never writes it.
 *
 * A row is the box of every frame's drawing together (the atlas cell), in page
 * px, turned `rotation` degrees clockwise about its centre and mirrored first if
 * `flipX`. So its h is always `w / aspect`: the scale is one number for both
 * axes.
 *
 * The registration has no rotation or mirror axis of its own. A row that is
 * rotated or mirrored is registered at THAT rotation and mirror: the frames are
 * mirrored and turned first, registered as they are, and the result mapped
 * back. It cannot find an angle; a person sets that with the align tool.
 *
 * Every frame is tried, and the one that agrees best is the frame the page
 * prints: the row's `rest`.
 *
 * The fallback, for a match that is not confident, is the drawing fitted inside
 * the seed box, centred.
 */
import sharp from 'sharp';
import { frameFromRaw, mapBox, peakMargin, registerFrame } from './cover-register.mjs';

/** The cover's floors: a match is trusted when it agrees well OR peaks sharply
 *  (lacy or partly covered art agrees less while still being pinned down). */
const AGREE_FLOOR = 0.8;
const MARGIN_FLOOR = 0.15;
/** ...and only if it stays near its seed: a match more than this far off in
 *  scale, or whose centre moved by more than this share of the seed's diagonal,
 *  found something else on the page. */
const SCALE_TOLERANCE = 0.25;
const CENTRE_TOLERANCE = 0.15;

const round2 = (n) => Math.round(n * 100) / 100;
const RAD = Math.PI / 180;

/** The drawing (`aspect` = w/h) fitted inside `box`, centred. */
export function fitInside(box, aspect) {
  const w = box.w / box.h > aspect ? box.h * aspect : box.w;
  const h = w / aspect;
  return { x: round2(box.x + (box.w - w) / 2), y: round2(box.y + (box.h - h) / 2), w: round2(w), h: round2(h) };
}

/** The axis-aligned box a row covers once turned about its centre. */
export function turnedBounds(box, deg) {
  const c = Math.abs(Math.cos(deg * RAD));
  const s = Math.abs(Math.sin(deg * RAD));
  const w = box.w * c + box.h * s;
  const h = box.w * s + box.h * c;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

/**
 * The frames mirrored (`flipX`) then turned `deg` clockwise, each on a canvas
 * grown to hold it (sharp mirrors before it rotates, and keeps the centre at
 * the centre), and a map from an original canvas point to the new canvas.
 */
async function transformFrames(frames, deg, flipX) {
  const out = [];
  for (const f of frames) {
    let img = sharp(f.rgba, { raw: { width: f.w, height: f.h, channels: 4 } });
    if (flipX) img = img.flop();
    if (deg) img = img.rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    out.push(frameFromRaw(f.path, data, info.width, info.height));
  }
  const { w: W, h: H } = frames[0];
  const { w: W2, h: H2 } = out[0];
  const cos = Math.cos(deg * RAD);
  const sin = Math.sin(deg * RAD);
  const map = (x, y) => {
    const dx = (flipX ? W - x : x) - W / 2;
    const dy = y - H / 2;
    return { x: dx * cos - dy * sin + W2 / 2, y: dx * sin + dy * cos + H2 / 2 };
  };
  return { frames: out, map };
}

/**
 * Every drawn frame registered against the page at its own best transform,
 * seeded from `rect`; the frame that agrees best wins. That frame is the one
 * the page prints, and so the one the page should REST on.
 */
async function registerEveryFrame(page, frames, rect) {
  let best = null;
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].box) continue;
    const fit = await registerFrame(page, frames[i], rect);
    if (fit && (!best || fit.agree > best.fit.agree)) best = { still: i, fit };
  }
  if (!best) return null;
  return { ...best, qc: await peakMargin(page, frames[best.still], best.fit) };
}

/**
 * Register at a given rotation and mirror, every frame tried, no judgement:
 * the row that transform gives, its agreement, peak margin and rest frame.
 * `seedRect` is where the turned drawing is expected on the page (its
 * axis-aligned bounds).
 */
export async function registerAt(page, frames, union, seedRect, deg = 0, flipX = false) {
  const aspect = union.w / union.h;
  const plain = !deg && !flipX;
  const t = plain ? { frames, map: (x, y) => ({ x, y }) } : await transformFrames(frames, deg, flipX);
  const result = await registerEveryFrame(page, t.frames, seedRect);
  if (!result) return null;
  const { still, fit, qc } = result;
  // Where the union's centre landed: through the transform, then the fit.
  const c = t.map(union.x + union.w / 2, union.y + union.h / 2);
  const m = mapBox({ x: c.x, y: c.y, w: 0, h: 0 }, t.frames[still].box, fit);
  const w = union.w * fit.s;
  const h = w / aspect;
  const row = {
    x: round2(m.x - w / 2),
    y: round2(m.y - h / 2),
    w: round2(w),
    h: round2(h),
    rotation: deg,
    ...(flipX ? { flipX: true } : {}),
    rest: still,
  };
  // `fitBox`: where the rest frame's own turned drawing landed — the seed for a
  // finer search at a neighbouring angle.
  const b = t.frames[still].box;
  const fitBox = { x: fit.ox, y: fit.oy, w: b.w * fit.s, h: b.h * fit.s };
  return { row, agree: fit.agree, margin: qc.margin, rest: still, fitBox };
}

/**
 * Register one animation against its baked page, at the row's own rotation
 * and mirror, every frame tried (the best is the rest frame).
 *
 *   page    loadCover() of the page PNG
 *   frames  loadFrame() of every frame, in order
 *   union   unionOf(frames) — the atlas cell's source box
 *   seed    { x, y, w, h, rotation, flipX } in page px — the row as it stands
 *
 * Returns { row, by: 'match' | 'fit', agree, margin, rest, reason }.
 */
export async function suggestRow(page, frames, union, seed) {
  const aspect = union.w / union.h;
  const deg = seed.rotation ?? 0;
  const flipX = !!seed.flipX;
  const keep = { rotation: deg, ...(flipX ? { flipX: true } : {}), ...(seed.rest != null ? { rest: seed.rest } : {}) };
  const fallback = (reason, extra = {}) => ({ row: { ...fitInside(seed, aspect), ...keep }, by: 'fit', reason, ...extra });

  const r = await registerAt(page, frames, union, deg ? turnedBounds(seed, deg) : seed, deg, flipX);
  if (!r) return fallback('no frame registered');
  const { row } = r;
  const stats = { agree: r.agree, margin: r.margin, rest: r.rest };

  const pinned = r.agree >= AGREE_FLOOR || r.margin >= MARGIN_FLOOR;
  if (!pinned) return fallback('not pinned down', stats);
  const fitted = fitInside(seed, aspect);
  const scale = row.w / fitted.w;
  if (Math.abs(scale - 1) > SCALE_TOLERANCE) return fallback(`scale ${scale.toFixed(2)}× the seed's`, stats);
  const dc = Math.hypot(row.x + row.w / 2 - (seed.x + seed.w / 2), row.y + row.h / 2 - (seed.y + seed.h / 2));
  if (dc > CENTRE_TOLERANCE * Math.hypot(seed.w, seed.h)) return fallback(`centre ${dc.toFixed(0)}px from the seed's`, stats);
  return { row, by: 'match', reason: '', ...stats };
}

/** A row as `pageAnims.ts` writes it. */
export function rowSource(page, id, r) {
  return `{ page: ${page}, id: '${id}', x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}, rotation: ${r.rotation ?? 0}${r.flipX ? ', flipX: true' : ''}${r.rest != null ? `, rest: ${r.rest}` : ''} }`;
}
