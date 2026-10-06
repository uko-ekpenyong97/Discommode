/**
 * THE PHONE DOOR'S LOGO AND DISCLAIMER, their assets (src/phone,
 * docs/mobile.md) — `npm run door`. Uko's Figma frame "Disclaimer"
 * (Discommode-Website, node 424:37, 812×1045) is set in the door as live type
 * over a photo, under his logo (node 430:41):
 *
 *   logo   ~/Discommode-pages/ui/door/logo.svg (read only), through svgo into
 *          src/phone/door-logo.svg, which the door inlines: the shapes'
 *          coordinates kept to the source's own 4 decimals (no shape is
 *          rewritten or merged), the drop shadow kept, the fill currentColor
 *          (the door's ink), named "Discommode". Checked here: the optimised
 *          logo draws the same pixels as the source.
 *   photo  ~/Discommode-pages/ui/door/disclaimer.png is the whole frame,
 *          flattened at 3× (2436×3135, the caption edits in it). The photo's
 *          own box, x88 y626 636×358 in the frame, is cropped out of it (read
 *          only; nothing is written there) into public/ui/door/, at 1× and 2× the frame (the photo is at most ~376 CSS px wide on a phone, 1128 device px at 3×).
 *   fonts  Frijole (the title) and Space Mono Bold (the body), cut to the
 *          glyphs the disclaimer sets, into public/fonts/door-*.woff2. Their
 *          family names are dropped from the subsets (the copyright and the
 *          licence stay): a subset is a modified font, and Frijole's name is
 *          reserved under the OFL. phone.css names them 'Door Display' and
 *          'Door Mono'. Frijole is fontsource's latin face, pinned; Space Mono
 *          is the site's own latin face (public/fonts).
 *
 * Change the disclaimer's words and run this again: a glyph the subset does
 * not have would fall back to another font.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';
import wawoff2 from 'wawoff2';
// Every glyph each face sets: the words the door sets.
import { BODY, TITLE } from '../src/phone/disclaimer.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE = join(homedir(), 'Discommode-pages/ui/door/disclaimer.png');
const LOGO = join(homedir(), 'Discommode-pages/ui/door/logo.svg');
const FRIJOLE = 'https://cdn.jsdelivr.net/npm/@fontsource/frijole@5.3.0/files/frijole-latin-400-normal.woff2';
const SPACE_MONO = join(ROOT, 'public/fonts/space-mono-latin-700.woff2');

/** The frame, and the photo's box in it (Figma units). */
const FRAME = { w: 812, h: 1045 };
const PHOTO = { x: 88, y: 626, w: 636, h: 358 };


async function photo() {
  const img = sharp(await readFile(SOURCE));
  const { width, height } = await img.metadata();
  const k = width / FRAME.w;
  if (Math.abs(height / k - FRAME.h) > 0.5) throw new Error(`${SOURCE}: ${width}×${height} is not the 812×1045 frame`);
  const box = { left: Math.round(PHOTO.x * k), top: Math.round(PHOTO.y * k), width: Math.round(PHOTO.w * k), height: Math.round(PHOTO.h * k) };
  const out = join(ROOT, 'public/ui/door');
  await mkdir(out, { recursive: true });
  for (const w of [PHOTO.w, PHOTO.w * 2]) {
    const file = join(out, `disclaimer-${w}.webp`);
    await sharp(await readFile(SOURCE)).extract(box).resize({ width: w }).webp({ quality: 78, effort: 6 }).toFile(file);
    console.log(`  ${file.replace(ROOT, '')}  ${w}×${Math.round((w * PHOTO.h) / PHOTO.w)}`);
  }
}

/** `woff2` cut to the code points of `text`, its family names dropped. */
async function subset(woff2, text) {
  const wasm = await readFile(join(ROOT, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'));
  const hb = (await WebAssembly.instantiate(wasm)).instance.exports;
  const ttf = await wawoff2.decompress(woff2);
  const ptr = hb.malloc(ttf.length);
  new Uint8Array(hb.memory.buffer).set(ttf, ptr);
  const blob = hb.hb_blob_create(ptr, ttf.length, 2 /* HB_MEMORY_MODE_WRITABLE */, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  const unicodes = hb.hb_subset_input_unicode_set(input);
  for (const ch of new Set(text)) hb.hb_set_add(unicodes, ch.codePointAt(0));
  // The names kept: 0 copyright, 13 licence, 14 its URL.
  const names = hb.hb_subset_input_set(input, 4 /* HB_SUBSET_SETS_NAME_ID */);
  hb.hb_set_clear(names);
  for (const id of [0, 13, 14]) hb.hb_set_add(names, id);
  const sub = hb.hb_subset_or_fail(face, input);
  if (!sub) throw new Error('subset failed');
  const out = hb.hb_face_reference_blob(sub);
  const at = hb.hb_blob_get_data(out, 0);
  const bytes = new Uint8Array(hb.memory.buffer).slice(at, at + hb.hb_blob_get_length(out));
  return Buffer.from(await wawoff2.compress(bytes));
}

async function fonts() {
  const res = await fetch(FRIJOLE);
  if (!res.ok) throw new Error(`${FRIJOLE}: ${res.status}`);
  const faces = [
    ['door-display-400.woff2', Buffer.from(await res.arrayBuffer()), TITLE],
    ['door-mono-700.woff2', await readFile(SPACE_MONO), BODY.join(' ')],
  ];
  for (const [name, woff2, text] of faces) {
    const out = await subset(woff2, text);
    await writeFile(join(ROOT, 'public/fonts', name), out);
    console.log(`  public/fonts/${name}  ${woff2.length} → ${out.length} bytes, ${new Set(text).size} glyphs`);
  }
}

/** The logo, optimised, in the door's ink; the same pixels as the source. */
async function logo() {
  const src = await readFile(LOGO, 'utf8');
  let svg = optimize(src, {
    multipass: true,
    floatPrecision: 4,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // The shapes stay the shapes: no rewriting of their paths beyond
            // the numbers' notation, no merging, no colour conversions.
            convertPathData: { floatPrecision: 4, transformPrecision: 6, makeArcs: false, straightCurves: false, convertToQ: false, lineShorthands: true, convertToZ: false },
            mergePaths: false,
            convertColors: false,
          },
        },
      },
      // Inline in the page: its filter's id must not meet another's.
      { name: 'prefixIds', params: { prefix: 'door-logo' } },
      // Sized by phone.css, from the viewBox.
      'removeDimensions',
    ],
  }).data;
  // Every fill is the source's black (svgo may move it to the group) or none.
  const colours = new Set(svg.match(/fill="[^"]*"/g));
  if ([...colours].some((c) => !/^fill="(black|#000|none)"$/.test(c))) throw new Error(`logo: fills ${[...colours]}`);
  svg = svg.replace(/fill="(black|#000)"/g, 'fill="currentColor"').replace('<svg ', '<svg role="img" aria-label="Discommode" focusable="false" ');
  // The same pixels: both drawn black, 4× the viewBox, every channel within a level.
  const draw = (s) => sharp(Buffer.from(s.replaceAll('currentColor', 'black')), { density: 288 }).resize(1593 * 4, 324 * 4, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const [a, b] = await Promise.all([draw(src), draw(svg)]);
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  if (a.length !== b.length || worst > 1) throw new Error(`logo: the optimised logo draws differently (worst ${worst} levels)`);
  await writeFile(join(ROOT, 'src/phone/door-logo.svg'), svg + '\n');
  console.log(`  src/phone/door-logo.svg  ${src.length} → ${svg.length} bytes, ${(svg.match(/<path/g) ?? []).length} shapes in currentColor; drawn against the source, worst ${worst} levels`);
}

console.log('door: the logo, and the disclaimer\'s photo and fonts');
await logo();
await photo();
await fonts();
