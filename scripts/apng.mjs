/**
 * Animated PNG (APNG), as Procreate exports one: its frames, their delays and
 * its loop count — the TIMING of an animation whose pictures are the
 * full-size `<Name>-<n>.png` frames beside it (Procreate's APNG is a small
 * preview, 480px on its long side).
 *
 * Procreate writes a hold as REPEATED IDENTICAL FRAMES, every one at the same
 * delay: 1/fps rounded DOWN to a whole ms (166 for 6fps, 83 for 12). So
 * `runsOf` collapses identical neighbours into one run each, and its delay is
 * the run's summed delays. A hold written as one longer delay comes out the
 * same way.
 *
 * Plain JS on sharp and node:zlib: each frame's data is re-wrapped as a PNG of
 * its own and decoded, then composited onto the canvas by the frame's
 * dispose and blend ops, so a sub-rectangle frame comes out whole too.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Chunks a re-wrapped frame needs besides its IHDR and data. */
const CARRIED = new Set(['PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT']);

function chunksOf(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) return null;
  const out = [];
  for (let o = 8; o + 12 <= buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    out.push({ type, data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** True if `buf` is a PNG with an animation control chunk before its image data. */
export function isApng(buf) {
  const chunks = chunksOf(buf);
  if (!chunks) return false;
  for (const c of chunks) {
    if (c.type === 'acTL') return true;
    if (c.type === 'IDAT') return false;
  }
  return false;
}

/**
 * Every frame of an APNG, composited to the full canvas.
 * @returns {Promise<{ w: number, h: number, plays: number,
 *   frames: { rgba: Buffer, delayMs: number }[] }>} `plays` 0 is forever.
 */
export async function readApng(path) {
  const buf = await readFile(path);
  const chunks = chunksOf(buf);
  if (!chunks) throw new Error(`${path}: not a PNG`);
  const ihdr = chunks.find((c) => c.type === 'IHDR')?.data;
  const actl = chunks.find((c) => c.type === 'acTL')?.data;
  if (!ihdr || !actl) throw new Error(`${path}: not an animated PNG`);
  const W = ihdr.readUInt32BE(0);
  const H = ihdr.readUInt32BE(4);
  const carried = chunks.filter((c) => CARRIED.has(c.type));

  // Each fcTL and the data chunks after it. An IDAT before the first fcTL is
  // the default image, not a frame.
  const raw = [];
  for (const c of chunks) {
    if (c.type === 'fcTL') {
      const d = c.data;
      const num = d.readUInt16BE(20);
      const den = d.readUInt16BE(22) || 100;
      raw.push({
        w: d.readUInt32BE(4),
        h: d.readUInt32BE(8),
        x: d.readUInt32BE(12),
        y: d.readUInt32BE(16),
        delayMs: (num / den) * 1000,
        dispose: d[24],
        blend: d[25],
        data: [],
      });
    } else if ((c.type === 'IDAT' || c.type === 'fdAT') && raw.length) {
      raw.at(-1).data.push(c.type === 'IDAT' ? c.data : c.data.subarray(4));
    }
  }

  const canvas = Buffer.alloc(W * H * 4);
  const frames = [];
  for (let i = 0; i < raw.length; i++) {
    const f = raw[i];
    const head = Buffer.from(ihdr);
    head.writeUInt32BE(f.w, 0);
    head.writeUInt32BE(f.h, 4);
    const png = Buffer.concat([
      SIGNATURE,
      chunk('IHDR', head),
      ...carried.map((c) => chunk(c.type, c.data)),
      ...f.data.map((d) => chunk('IDAT', d)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const px = await sharp(png).ensureAlpha().raw().toBuffer();
    // Dispose "previous" on the first frame is "background" (the spec).
    const dispose = i === 0 && f.dispose === 2 ? 1 : f.dispose;
    const saved = dispose === 2 ? Buffer.from(canvas) : null;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = (y * f.w + x) * 4;
        const d = ((f.y + y) * W + f.x + x) * 4;
        const a = px[s + 3];
        if (f.blend === 0 || a === 255) {
          px.copy(canvas, d, s, s + 4);
        } else if (a > 0) {
          // Source over, straight alpha.
          const da = canvas[d + 3] / 255;
          const sa = a / 255;
          const oa = sa + da * (1 - sa);
          for (let k = 0; k < 3; k++) canvas[d + k] = Math.round((px[s + k] * sa + canvas[d + k] * da * (1 - sa)) / oa);
          canvas[d + 3] = Math.round(oa * 255);
        }
      }
    }
    frames.push({ rgba: Buffer.from(canvas), delayMs: f.delayMs });
    if (dispose === 1) {
      for (let y = 0; y < f.h; y++) canvas.fill(0, ((f.y + y) * W + f.x) * 4, ((f.y + y) * W + f.x + f.w) * 4);
    } else if (dispose === 2) {
      saved.copy(canvas);
    }
  }
  return { w: W, h: H, plays: actl.readUInt32BE(4), frames };
}

/**
 * Identical neighbouring frames collapsed: one run per held picture.
 * @returns {{ rgba: Buffer, first: number, count: number, delayMs: number }[]}
 */
export function runsOf(frames) {
  const runs = [];
  frames.forEach((f, i) => {
    const last = runs.at(-1);
    if (last && last.rgba.equals(f.rgba)) {
      last.count++;
      last.delayMs += f.delayMs;
    } else {
      runs.push({ rgba: f.rgba, first: i, count: 1, delayMs: f.delayMs });
    }
  });
  return runs;
}

/** The fps an APNG was drawn at: Procreate writes each frame's delay as
 *  1/fps rounded down to a whole ms, so 166 → 6 and 83 → 12. */
export function fpsOfDelays(delaysMs) {
  const shortest = Math.min(...delaysMs.filter((d) => d > 0));
  return Number.isFinite(shortest) ? Math.round(1000 / shortest) : null;
}

/**
 * Ticks (1/fps s) each run is held. Rounded at each run's END in cumulative
 * time, not run by run, so rounding never adds up over a loop: the loop is
 * within half a tick of the APNG's.
 */
export function holdsOf(delaysMs, fps) {
  const holds = [];
  let t = 0;
  for (const d of delaysMs) {
    const from = Math.round((t * fps) / 1000);
    t += d;
    holds.push(Math.round((t * fps) / 1000) - from);
  }
  return holds;
}

/** `~/Discommode-pages/<issue>/anim/<id>/<file>` if it is on this machine,
 *  else null (the unit tests check against it where it is). */
export function sourceApngPath(issue, id, file) {
  const path = join(homedir(), 'Discommode-pages', issue, 'anim', id, file);
  return existsSync(path) ? path : null;
}
