/**
 * The mapping math, against a SYNTHETIC frame set.
 *
 * A real object cannot be a fixture — the whole point of registration is that we
 * do not know the true transform for the real ones. So this builds a cover with
 * a known object composited at a known scale and origin, hands the registrar the
 * kind of rect Figma actually produces (too large, and offset), and checks that
 * it recovers the transform it was never told.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  folderOptions,
  loadCover,
  loadFrame,
  mapBox,
  orderFrames,
  registerObject,
  unionOf,
} from './cover-register.mjs';

const COVER_W = 2000;
const COVER_H = 2600;
/** Source canvas, standing in for a Procreate export. */
const CANVAS_W = 400;
const CANVAS_H = 300;
/** Where the artwork sits on that canvas — the alpha box the registrar finds. */
const ART = { x: 50, y: 40, w: 200, h: 150 };
/** The truth the registrar has to recover. */
const TRUE_SCALE = 0.5;
const TRUE_X = 600;
const TRUE_Y = 800;

/**
 * Artwork with enough structure to register against. A flat rectangle would give
 * a genuinely flat objective — every offset inside it scores the same — so the
 * fixture carries asymmetric bands, like the real drawings do.
 */
function artwork(shift = 0) {
  const bands = [
    `<rect x="0" y="0" width="${ART.w}" height="${ART.h}" fill="#c8443a"/>`,
    `<rect x="20" y="${18 + shift}" width="60" height="40" fill="#12306b"/>`,
    `<rect x="110" y="30" width="70" height="24" fill="#e8d64a"/>`,
    `<rect x="30" y="95" width="150" height="18" fill="#1d7a4c"/>`,
    `<circle cx="${150 + shift}" cy="115" r="22" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${ART.w}" height="${ART.h}" fill="none" stroke="#101010" stroke-width="6"/>`,
  ].join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ART.w}" height="${ART.h}">${bands}</svg>`,
  );
}

/** One frame: the artwork on a transparent canvas at ART's offset. */
async function frame(path, shift) {
  await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await sharp(artwork(shift)).png().toBuffer(), left: ART.x, top: ART.y }])
    .png()
    .toFile(path);
}

let dir;
let coverPath;
let frames;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cover-anim-'));
  coverPath = join(dir, 'cover.png');

  // Frame 1 is what gets drawn onto the cover; frame 2 moves, so the union box
  // is genuinely larger than the still's and `mapBox` has something to widen.
  const f1 = join(dir, 'Thing-1.png');
  const f2 = join(dir, 'Thing-2.png');
  await frame(f1, 0);
  await frame(f2, 14);

  // The cover: a textured field with the artwork composited at the true
  // transform. Flat colour would let a wrong offset score as well as the right
  // one, so the field carries structure the artwork must NOT match.
  const field = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}" height="${COVER_H}">
      <rect width="${COVER_W}" height="${COVER_H}" fill="#d7e84d"/>
      <rect x="0" y="1400" width="${COVER_W}" height="600" fill="#b9c94a"/>
      <circle cx="1500" cy="500" r="260" fill="#8a7fd0"/>
    </svg>`,
  );
  const placed = await sharp(await sharp(artwork(0)).png().toBuffer())
    .resize(Math.round(ART.w * TRUE_SCALE), Math.round(ART.h * TRUE_SCALE))
    .png()
    .toBuffer();
  await sharp(await sharp(field).png().toBuffer())
    .composite([{ input: placed, left: TRUE_X, top: TRUE_Y }])
    .png()
    .toFile(coverPath);

  frames = [await loadFrame(f1), await loadFrame(f2)];
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('orderFrames', () => {
  it('sorts by the trailing number, not lexically', () => {
    const files = ['Muebles_-10.png', 'Muebles_-2.png', 'Muebles_-1.png', 'Muebles_-11.png'];
    expect(orderFrames(files)).toEqual([
      'Muebles_-1.png',
      'Muebles_-2.png',
      'Muebles_-10.png',
      'Muebles_-11.png',
    ]);
  });

  it('ignores the prefix entirely, including one that ends in a number', () => {
    // `op1-animation/` really does contain OP-1-1.png … OP-1-3.png.
    expect(orderFrames(['OP-1-3.png', 'OP-1-1.png', 'OP-1-2.png'])).toEqual([
      'OP-1-1.png',
      'OP-1-2.png',
      'OP-1-3.png',
    ]);
  });

  it('drops anything that is not a numbered PNG', () => {
    expect(orderFrames(['fps.json', '.DS_Store', 'Thing-1.png', 'notes.txt'])).toEqual([
      'Thing-1.png',
    ]);
  });
});

describe('unionOf', () => {
  it('spans every frame, so an animation leaving the still is not clipped', () => {
    const u = unionOf([
      { box: { x: 10, y: 10, w: 20, h: 20 } },
      { box: { x: 25, y: 5, w: 20, h: 10 } },
    ]);
    expect(u).toEqual({ x: 10, y: 5, w: 35, h: 25 });
  });

  it('skips fully transparent frames instead of collapsing on them', () => {
    // `libros` frame 1 really is empty; it must not drag the union to the origin.
    const u = unionOf([{ box: null }, { box: { x: 40, y: 60, w: 10, h: 10 } }]);
    expect(u).toEqual({ x: 40, y: 60, w: 10, h: 10 });
  });
});

describe('mapBox', () => {
  const stillBox = { x: 50, y: 40, w: 200, h: 150 };
  const fit = { s: 0.5, ox: 600, oy: 800 };

  it('maps the still box back onto exactly where it was registered', () => {
    expect(mapBox(stillBox, stillBox, fit)).toEqual({ x: 600, y: 800, w: 100, h: 75 });
  });

  it('carries a wider union box outside the still, at the same scale', () => {
    // 10px left and 20px up of the still, in source px, is 5 and 10 in cover px.
    const union = { x: 40, y: 20, w: 230, h: 190 };
    expect(mapBox(union, stillBox, fit)).toEqual({ x: 595, y: 790, w: 115, h: 95 });
  });
});

describe('registerObject', () => {
  it('recovers the transform from a rect that is too large and offset', async () => {
    const cover = await loadCover(coverPath, COVER_W, COVER_H);
    // A rect shaped like the real ones: bigger than the ink and inset from it,
    // so neither its aspect nor its size can be used as the scale reference.
    const rect = { x: TRUE_X - 12, y: TRUE_Y - 9, w: 124, h: 92 };

    const result = await registerObject(cover, frames, rect);

    expect(result).not.toBeNull();
    expect(result.still).toBe(0); // frame 1 is the one on the cover
    expect(result.fit.s).toBeCloseTo(TRUE_SCALE, 2);
    // Within a pixel of the truth in cover space, which is the claim that
    // matters: at this scale a pixel is invisible on the rendered cover.
    expect(Math.abs(result.fit.ox - TRUE_X)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.fit.oy - TRUE_Y)).toBeLessThanOrEqual(1);
    expect(result.fit.agree).toBeGreaterThan(0.9);
  }, 60_000);

  it('finds the still among later frames when frame 1 is not the one drawn', async () => {
    // `libros` and friends: the cover carries a frame from the middle of the
    // loop, so trusting frame 1 would register the wrong artwork.
    const cover = await loadCover(coverPath, COVER_W, COVER_H);
    const rect = { x: TRUE_X - 12, y: TRUE_Y - 9, w: 124, h: 92 };
    const swapped = [frames[1], frames[0]];

    const result = await registerObject(cover, swapped, rect);

    expect(result.still).toBe(1); // the frame that IS on the cover
    expect(result.swept).toBe(true);
    expect(result.fit.s).toBeCloseTo(TRUE_SCALE, 2);
  }, 60_000);
});

describe('folderOptions', () => {
  const write = async (name, body) => {
    const d = join(dir, name);
    await mkdir(d, { recursive: true });
    if (body !== null) await writeFile(join(d, 'fps.json'), body);
    return d;
  };

  const DEFAULTS = { fps: null, mode: 'loop', rest: 'first' };

  it('defaults to no override, loop mode and resting on frame 1', async () => {
    expect(await folderOptions(await write('plain', null))).toEqual(DEFAULTS);
  });

  it('accepts a bare number as the rate', async () => {
    expect(await folderOptions(await write('bare', '8'))).toEqual({ ...DEFAULTS, fps: 8 });
  });

  it('accepts a rate, a mode and a rest frame together', async () => {
    // Exactly what libros/fps.json carries.
    expect(await folderOptions(await write('both', '{"fps":6,"mode":"once","rest":"last"}'))).toEqual({
      fps: 6,
      mode: 'once',
      rest: 'last',
    });
  });

  it('takes mode or rest alone, leaving the rest to the defaults', async () => {
    expect(await folderOptions(await write('modeonly', '{"mode":"once"}'))).toEqual({
      ...DEFAULTS,
      mode: 'once',
    });
    expect(await folderOptions(await write('restonly', '{"rest":"last"}'))).toEqual({
      ...DEFAULTS,
      rest: 'last',
    });
  });

  it('ignores a nonsense rate, mode or rest rather than encoding it', async () => {
    expect(
      await folderOptions(await write('bad', '{"fps":0,"mode":"backwards","rest":"middle"}')),
    ).toEqual(DEFAULTS);
    expect(await folderOptions(await write('neg', '{"fps":-4}'))).toEqual(DEFAULTS);
  });

  it('survives malformed JSON instead of failing the whole build', async () => {
    expect(await folderOptions(await write('broken', '{oops'))).toEqual(DEFAULTS);
  });
});
