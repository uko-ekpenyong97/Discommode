/**
 * PNG -> WebP for issue page scans.
 *
 * Figma is the master; the PNGs in public/issues/ are a local drop folder and are
 * gitignored. The WebPs this writes beside them are the committed artefact and
 * the only thing that ships, so run this after every export:
 *
 *   npm run pages           # only rebuilds pages whose PNG is newer
 *   npm run pages -- --force
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ISSUES_DIR = fileURLToPath(new URL('../public/issues/', import.meta.url));

/** WebP quality. 82 is visually lossless on these scans at 2000px wide. */
const QUALITY = 82;
/** Every page must be exactly this. A wrong export size is caught here first. */
const PAGE_W = 2000;
const PAGE_H = 2600;

/** `01.png` … `42.png`, plus the two named plates. */
const PAGE_RE = /^(\d{2}|cover|back)\.png$/;

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

async function listIssues() {
  const entries = await readdir(ISSUES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

let pngTotal = 0;
let webpTotal = 0;
let converted = 0;
let skipped = 0;
const warnings = [];

async function convert(issue, name) {
  const pngPath = join(ISSUES_DIR, issue, name);
  const webpName = name.replace(/\.png$/, '.webp');
  const webpPath = join(ISSUES_DIR, issue, webpName);

  const pngStat = await stat(pngPath);
  const webpStat = await statOrNull(webpPath);

  // Dimensions are checked even on a skip — a stale WebP from a wrong-sized
  // export should keep complaining until it is fixed.
  const { width, height } = await sharp(pngPath).metadata();
  if (width !== PAGE_W || height !== PAGE_H) {
    warnings.push(`${issue}/${name} is ${width}x${height}, expected ${PAGE_W}x${PAGE_H}`);
  }

  if (!force && webpStat && webpStat.mtimeMs > pngStat.mtimeMs) {
    pngTotal += pngStat.size;
    webpTotal += webpStat.size;
    skipped += 1;
    console.log(`  ${name.padEnd(10)} ${kb(pngStat.size).padStart(9)} → ${kb(webpStat.size).padStart(9)}   (up to date)`);
    return;
  }

  await sharp(pngPath).webp({ quality: QUALITY }).toFile(webpPath);
  const out = await stat(webpPath);

  pngTotal += pngStat.size;
  webpTotal += out.size;
  converted += 1;
  const saved = Math.round((1 - out.size / pngStat.size) * 100);
  console.log(`  ${name.padEnd(10)} ${kb(pngStat.size).padStart(9)} → ${kb(out.size).padStart(9)}   ${String(saved).padStart(3)}% smaller`);
}

const issues = await listIssues();
if (issues.length === 0) {
  console.log(`No issue folders in ${ISSUES_DIR}`);
  process.exit(0);
}

for (const issue of issues) {
  const files = (await readdir(join(ISSUES_DIR, issue))).filter((f) => PAGE_RE.test(f)).sort();
  console.log(`\nissue ${issue}  (${files.length} page${files.length === 1 ? '' : 's'})`);
  for (const name of files) await convert(issue, name);
}

console.log(`\n${converted} converted, ${skipped} up to date`);
console.log(`total  ${mb(pngTotal)} PNG → ${mb(webpTotal)} WebP   ${Math.round((1 - webpTotal / pngTotal) * 100)}% smaller`);

if (warnings.length > 0) {
  console.log(`\n!!  ${warnings.length} PAGE${warnings.length === 1 ? '' : 'S'} WITH THE WRONG DIMENSIONS  !!`);
  for (const w of warnings) console.log(`!!  ${w}`);
  console.log('!!  Re-export at 2000x2600 before committing.\n');
}
