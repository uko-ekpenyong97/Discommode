/**
 * Placing an animated object on a face that has NO Figma rect for it, by
 * normalized cross-correlation.
 *
 * The cover's twenty objects each came with a rect from Figma, and
 * `cover-register.mjs` refines around that seed. The back cover's objects did
 * not, so this finds the seed from nothing: frame 1's alpha-cropped drawing is
 * searched for across the whole face, over scale and position, and the peak of
 * the NCC surface is the placement.
 *
 *   template   frame 1, cropped to its alpha bounds, flattened onto the face's
 *              own background colour (its modal colour) — the drawing's crop,
 *              rectangle and all, so an undersized match pays for the background
 *              it drags in and there is no small-scale bias.
 *   signal     luma, both sides.
 *   search     coarse-to-fine: every scale and offset at 1/16, then local
 *              refinement at 1/4, 1/2 and full resolution.
 *
 * It reports the best peak AND the best spatially distinct second peak (farther
 * than half the template from the best), each refined to full resolution. A
 * placement is only trusted when the best is ≥ 0.9 and beats the second by more
 * than 0.05 — otherwise the drawing on the face and the frame are not clearly
 * the same thing in one place, and a person should supply the rect.
 *
 *   node scripts/face-register-ncc.mjs <face.png> <frame-1.png>
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

export const NCC_ACCEPT = 0.9;
export const NCC_MARGIN = 0.05;

const ALPHA_INK = 8;

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

async function faceLuma(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  let bgKey = 0;
  let bgN = -1;
  for (const [k, n] of hist) if (n > bgN) [bgKey, bgN] = [k, n];
  const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
  return { w: info.width, h: info.height, bg, bgShare: bgN / (info.width * info.height) };
}

/** Luma plane of an image resized to (w, h). */
async function lumaPlane(input, w, h, raw) {
  const img = raw ? sharp(input, { raw }) : sharp(input);
  const buf = await img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const out = new Float64Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 3, j++) out[j] = luma(buf[i], buf[i + 1], buf[i + 2]);
  return out;
}

/** Frame 1 cropped to its alpha bounds and flattened onto `bg`, as RGB. */
async function templateOf(framePath, bg) {
  const { data, info } = await sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > ALPHA_INK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const rgb = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
    .raw()
    .toBuffer();
  return { box, rgb };
}

/** Integral images of the face (sum and sum of squares) for O(1) window stats. */
function integrals(f, w, h) {
  const S = new Float64Array((w + 1) * (h + 1));
  const Q = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < w; x++) {
      const v = f[y * w + x];
      rs += v;
      rq += v * v;
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + rs;
      Q[(y + 1) * (w + 1) + x + 1] = Q[y * (w + 1) + x + 1] + rq;
    }
  }
  return { S, Q };
}

function nccAt(face, fw, I, t, tw, th, tMean, tNorm, ox, oy) {
  const W = fw + 1;
  const n = tw * th;
  const at = (A, x, y) => A[y * W + x];
  const sum = at(I.S, ox + tw, oy + th) - at(I.S, ox, oy + th) - at(I.S, ox + tw, oy) + at(I.S, ox, oy);
  const sq = at(I.Q, ox + tw, oy + th) - at(I.Q, ox, oy + th) - at(I.Q, ox + tw, oy) + at(I.Q, ox, oy);
  const fVar = sq - (sum * sum) / n;
  if (fVar <= 1e-9 || tNorm <= 1e-9) return -1;
  let dot = 0;
  for (let y = 0; y < th; y++) {
    const fr = (oy + y) * fw + ox;
    const tr = y * tw;
    for (let x = 0; x < tw; x++) dot += face[fr + x] * t[tr + x];
  }
  // Σ f·(t − t̄) = Σ f·t − t̄·Σ f
  return (dot - tMean * sum) / Math.sqrt(fVar * tNorm);
}

async function level(facePath, face0, tpl, ds) {
  const fw = Math.round(face0.w / ds);
  const fh = Math.round(face0.h / ds);
  const face = await lumaPlane(facePath, fw, fh);
  return { ds, fw, fh, face, I: integrals(face, fw, fh), tplCache: new Map(), tpl };
}

async function tplAt(L, s) {
  const tw = Math.max(4, Math.round((L.tpl.box.w * s) / L.ds));
  const th = Math.max(4, Math.round((L.tpl.box.h * s) / L.ds));
  const key = `${tw}x${th}`;
  let hit = L.tplCache.get(key);
  if (!hit) {
    const t = await lumaPlane(L.tpl.rgb, tw, th, { width: L.tpl.box.w, height: L.tpl.box.h, channels: 3 });
    let mean = 0;
    for (const v of t) mean += v;
    mean /= t.length;
    let norm = 0;
    for (const v of t) norm += (v - mean) ** 2;
    hit = { t, tw, th, mean, norm };
    L.tplCache.set(key, hit);
  }
  return hit;
}

/** Local refinement of a (scale, x, y) candidate in FACE px through finer levels. */
async function refine(levels, cand) {
  let { s, x, y } = cand;
  let score = -1;
  for (const L of levels) {
    const sSpan = L.ds >= 4 ? 0.04 : L.ds === 2 ? 0.012 : 0.004;
    const sSteps = 6;
    const pSpan = 2 * L.ds * (L.ds >= 4 ? 3 : 2);
    let best = { score: -2, s, x, y };
    for (let k = -sSteps; k <= sSteps; k++) {
      const sk = s * (1 + (sSpan * k) / sSteps);
      const T = await tplAt(L, sk);
      const cx = Math.round(x / L.ds);
      const cy = Math.round(y / L.ds);
      const r = Math.ceil(pSpan / L.ds);
      for (let oy = cy - r; oy <= cy + r; oy++) {
        for (let ox = cx - r; ox <= cx + r; ox++) {
          if (ox < 0 || oy < 0 || ox + T.tw > L.fw || oy + T.th > L.fh) continue;
          const v = nccAt(L.face, L.fw, L.I, T.t, T.tw, T.th, T.mean, T.norm, ox, oy);
          if (v > best.score) best = { score: v, s: sk, x: ox * L.ds, y: oy * L.ds };
        }
      }
    }
    ({ s, x, y, score } = best);
  }
  return { s, x, y, score };
}

/**
 * Register `framePath`'s drawing onto `facePath`. Returns the best and second
 * peaks at full resolution, the placement rect in face px, and the face's
 * background (which the caller uses to judge whether a plate can be derived).
 */
export async function registerByNcc(facePath, framePath, { sMin = 0.08, sMax = 1, sStep = 1.03 } = {}) {
  const face0 = await faceLuma(facePath);
  const tpl = await templateOf(framePath, face0.bg);
  const coarse = await level(facePath, face0, tpl, 16);

  // Exhaustive coarse pass: every scale, every offset. Keep each scale's
  // local maxima as peak candidates.
  const peaks = [];
  for (let s = sMin; s <= sMax; s *= sStep) {
    const T = await tplAt(coarse, s);
    if (T.tw >= coarse.fw || T.th >= coarse.fh) break;
    const mw = coarse.fw - T.tw + 1;
    const mh = coarse.fh - T.th + 1;
    const map = new Float64Array(mw * mh);
    for (let oy = 0; oy < mh; oy++) {
      for (let ox = 0; ox < mw; ox++) {
        map[oy * mw + ox] = nccAt(coarse.face, coarse.fw, coarse.I, T.t, T.tw, T.th, T.mean, T.norm, ox, oy);
      }
    }
    for (let oy = 0; oy < mh; oy++) {
      for (let ox = 0; ox < mw; ox++) {
        const v = map[oy * mw + ox];
        let isMax = true;
        for (let dy = -1; dy <= 1 && isMax; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = ox + dx, yy = oy + dy;
            if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue;
            if (map[yy * mw + xx] > v) { isMax = false; break; }
          }
        }
        if (isMax) peaks.push({ s, x: ox * 16, y: oy * 16, score: v });
      }
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  const fine = [await level(facePath, face0, tpl, 4), await level(facePath, face0, tpl, 2), await level(facePath, face0, tpl, 1)];
  const best = await refine(fine, peaks[0]);
  const bw = tpl.box.w * best.s;
  const bh = tpl.box.h * best.s;
  // The runner-up: the strongest coarse peak whose centre is more than half the
  // template away from the winner's, refined the same way. A few are refined
  // because coarse order and fine order need not agree.
  const far = (p) =>
    Math.hypot(p.x + (tpl.box.w * p.s) / 2 - (best.x + bw / 2), p.y + (tpl.box.h * p.s) / 2 - (best.y + bh / 2)) >
    Math.max(bw, bh) / 2;
  const rivals = peaks.filter(far).slice(0, 5);
  let second = { score: -1 };
  for (const p of rivals) {
    const r = await refine(fine, p);
    if (far(r) && r.score > second.score) second = r;
  }

  return {
    best,
    second,
    template: tpl.box,
    rect: { x: Math.round(best.x), y: Math.round(best.y), w: Math.round(bw), h: Math.round(bh) },
    bg: face0.bg,
    bgShare: face0.bgShare,
    face: { w: face0.w, h: face0.h },
    accepted: best.score >= NCC_ACCEPT && best.score - second.score > NCC_MARGIN,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [facePath, framePath] = process.argv.slice(2);
  const t0 = Date.now();
  const r = await registerByNcc(facePath, framePath);
  const f = (n) => n.toFixed(4);
  console.log(`template (frame alpha bounds)  ${r.template.w}x${r.template.h} at ${r.template.x},${r.template.y}`);
  console.log(`best    NCC ${f(r.best.score)}  scale ${f(r.best.s)}  at ${r.best.x},${r.best.y}  →  rect ${JSON.stringify(r.rect)}`);
  console.log(`second  NCC ${f(r.second.score)}${r.second.s ? `  scale ${f(r.second.s)}  at ${r.second.x},${r.second.y}` : ''}`);
  console.log(`margin  ${f(r.best.score - r.second.score)}   (accept: best ≥ ${NCC_ACCEPT} and margin > ${NCC_MARGIN}) → ${r.accepted ? 'ACCEPTED' : 'REJECTED'}`);
  console.log(`face background rgb(${r.bg.join(',')}) covers ${(r.bgShare * 100).toFixed(1)}%   ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
