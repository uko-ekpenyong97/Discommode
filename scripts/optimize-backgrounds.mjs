/**
 * PNG -> WebP for reader-stage backgrounds (the wooden table, etc.).
 *
 * Drop textures into
 *
 *   ~/Discommode-pages/background/<name>.png
 *
 * and this writes the WebPs the stage loads into
 *
 *   public/backgrounds/<name>.webp
 *
 * The source lives OUTSIDE the repo for the same reason as the page scans — see
 * optimize-pages.mjs. Only the WebPs are committed and deployed.
 *
 * Backgrounds do NOT share the pages' fixed export size: there is no dimension
 * check. The longest edge is clamped to MAX_EDGE (never upscaled) and the image
 * is encoded at quality 80.
 *
 *   npm run backgrounds           # only rebuilds backgrounds whose PNG is newer
 *   npm run backgrounds -- --force
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Where the PNG textures live — outside the repo. */
const SOURCE_DIR = join(homedir(), 'Discommode-pages', 'background');
/** Where the committed WebPs go. */
const OUTPUT_DIR = fileURLToPath(new URL('../public/backgrounds/', import.meta.url));

/** WebP quality. Lower than the page scans — a texture hides compression. */
const QUALITY = 80;
/** Longest edge is clamped to this; a smaller texture is never enlarged. */
const MAX_EDGE = 2560;

const PNG_RE = /\.png$/i;

const force = process.argv.includes('--force');

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

let pngTotal = 0;
let webpTotal = 0;
let converted = 0;
let skipped = 0;

async function convert(name) {
  const pngPath = join(SOURCE_DIR, name);
  const webpName = name.replace(PNG_RE, '.webp');
  const webpPath = join(OUTPUT_DIR, webpName);

  const pngStat = await stat(pngPath);
  const webpStat = await statOrNull(webpPath);

  const { width, height } = await sharp(pngPath).metadata();

  if (!force && webpStat && webpStat.mtimeMs > pngStat.mtimeMs) {
    pngTotal += pngStat.size;
    webpTotal += webpStat.size;
    skipped += 1;
    console.log(`  ${name.padEnd(14)} ${width}x${height}  ${kb(pngStat.size).padStart(9)} → ${kb(webpStat.size).padStart(9)}   (up to date)`);
    return;
  }

  // fit:'inside' scales down to fit within MAX_EDGE x MAX_EDGE preserving aspect;
  // withoutEnlargement leaves an already-small texture untouched.
  await sharp(pngPath)
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(webpPath);
  const out = await stat(webpPath);
  const { width: ow, height: oh } = await sharp(webpPath).metadata();

  pngTotal += pngStat.size;
  webpTotal += out.size;
  converted += 1;
  const saved = Math.round((1 - out.size / pngStat.size) * 100);
  console.log(`  ${name.padEnd(14)} ${width}x${height} → ${ow}x${oh}  ${kb(pngStat.size).padStart(9)} → ${kb(out.size).padStart(9)}   ${String(saved).padStart(3)}% smaller`);
}

if ((await statOrNull(SOURCE_DIR)) === null) {
  console.log(`
!!  NO BACKGROUND SOURCE FOLDER  !!
!!  Expected PNG textures in: ${SOURCE_DIR}/
!!
!!  This folder lives outside the repo so a git operation can never destroy it.
!!  Create it and drop textures in as ~/Discommode-pages/background/wood.png,
!!  then re-run \`npm run backgrounds\`. Nothing to do until then.
`);
  process.exit(0);
}

const files = (await readdir(SOURCE_DIR)).filter((f) => PNG_RE.test(f)).sort();
if (files.length === 0) {
  console.log(`No PNG textures in ${SOURCE_DIR}`);
  process.exit(0);
}

console.log(`\nbackgrounds  (${files.length} texture${files.length === 1 ? '' : 's'})`);
await mkdir(OUTPUT_DIR, { recursive: true });
for (const name of files) await convert(name);

console.log(`\n${converted} converted, ${skipped} up to date`);
console.log(`total  ${mb(pngTotal)} PNG → ${mb(webpTotal)} WebP   ${Math.round((1 - webpTotal / pngTotal) * 100)}% smaller`);
