/**
 * THE SITE'S IDENTITY: its icons and its link preview — `npm run identity`.
 *
 *   icons    ~/Discommode-pages/ui/icon/favicon.svg and apple-touch-icon.png
 *            (180×180), read only. The SVG goes through svgo into
 *            public/favicon.svg with no shape rewritten or merged
 *            (convertPathData and mergePaths off), and is checked here to
 *            draw the same pixels as the source; the PNG is copied as it is,
 *            to public/apple-touch-icon.png. Missing sources are said loudly,
 *            and the committed icons are left alone.
 *   preview  public/og-image.jpg, 1200×630: Issue 01's cover still
 *            (public/issues/01/cover.webp, the grid card's face) on the sky
 *            colour, the flat light sky the phone door and its theme-color
 *            use. index.html and phone.html point og:image and twitter:image
 *            at it by absolute URL.
 */
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';

const ROOT = new URL('..', import.meta.url).pathname;
const ICONS = join(homedir(), 'Discommode-pages/ui/icon');
const COVER = join(ROOT, 'public/issues/01/cover.webp');
/** The phone door's sky (src/phone/phone.css `--ph-sky`, phone.html's theme-color). */
const SKY = '#cfe0f1';
const OG = { w: 1200, h: 630, pad: 40 };

const exists = (f) => stat(f).then(() => true, () => false);

async function samePixels(a, b) {
  const draw = (svg) => sharp(Buffer.from(svg), { density: 900 }).resize(944).raw().toBuffer();
  const [pa, pb] = await Promise.all([draw(a), draw(b)]);
  return pa.equals(pb);
}

async function icons() {
  const svgIn = join(ICONS, 'favicon.svg');
  const pngIn = join(ICONS, 'apple-touch-icon.png');
  if (!(await exists(svgIn)) || !(await exists(pngIn))) {
    console.warn(`  ✗ ${ICONS}: favicon.svg or apple-touch-icon.png missing — the committed icons are left as they are`);
    return;
  }
  const source = await readFile(svgIn, 'utf8');
  const { data } = optimize(source, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertPathData: false, mergePaths: false, convertShapeToPath: false } } }],
  });
  if (!(await samePixels(source, data))) throw new Error('favicon.svg: the optimised icon draws different pixels from the source');
  await writeFile(join(ROOT, 'public/favicon.svg'), data);
  console.log(`  public/favicon.svg  ${source.length} → ${data.length} bytes, same pixels`);

  const { width, height } = await sharp(pngIn).metadata();
  if (width !== 180 || height !== 180) throw new Error(`${pngIn}: ${width}×${height}, not 180×180`);
  await copyFile(pngIn, join(ROOT, 'public/apple-touch-icon.png'));
  console.log('  public/apple-touch-icon.png  180×180, as drawn');
}

async function preview() {
  const h = OG.h - 2 * OG.pad;
  const cover = await sharp(COVER).resize({ height: h }).toBuffer();
  const { width: w } = await sharp(cover).metadata();
  const file = join(ROOT, 'public/og-image.jpg');
  await sharp({ create: { width: OG.w, height: OG.h, channels: 3, background: SKY } })
    .composite([{ input: cover, left: Math.round((OG.w - w) / 2), top: OG.pad }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(file);
  console.log(`  public/og-image.jpg  ${OG.w}×${OG.h}, the cover ${w}×${h} on ${SKY}`);
}

await icons();
await preview();
