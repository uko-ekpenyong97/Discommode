/**
 * PNG -> WebP for issue page scans.
 *
 * Figma is the master. Drop full-size PNG exports into
 *
 *   ~/Discommode-pages/<issue>/NN.png      (01.png ... 42.png, cover.png, back.png)
 *   ~/Discommode-pages/<issue>/overlay.png (the grid card's hover plate)
 *   ~/Discommode-pages/<issue>/cover-plate.png (the drawn cover, objects hidden)
 *
 * and this writes the WebPs the app actually loads into
 *
 *   public/issues/<issue>/NN.webp
 *
 * Everything is 2000x2600. `overlay.png` is the odd one out: it is not a page,
 * it is the hover-state artwork that floats in front of the card in the grid, so
 * its transparency is load-bearing. WebP keeps the alpha channel by default; we
 * read each output back and complain loudly if a conversion ever drops it.
 *
 * The source lives OUTSIDE the repo on purpose: gitignored files inside a
 * checkout are invisible to every git safety net, and `git reset --hard` will
 * happily destroy them. Only the WebPs are committed and deployed.
 *
 * Every NUMBERED page also gets a half-resolution copy,
 *
 *   public/issues/<issue>/riffle/NN.webp   1000px wide
 *
 * which the reader's riffle draws on every leaf but its first and last
 * (flipEngine `isFast`): a riffle crosses too many pages too fast for each one
 * to be decoded at full size at a new scale. The cover and back only ever ride
 * a first or last leaf, so they have none.
 *
 *   npm run pages           # only rebuilds pages whose PNG is newer
 *   npm run pages -- --force
 *
 * A fresh worktree converts NOTHING on the plain run: checkout stamps every
 * committed WebP newer than its PNG. Use --force there — the encoder is
 * deterministic, so unchanged pages come out byte for byte and only real
 * changes show in git.
 *
 * PLATES. `npm run plates` (this script with `--plates`) gives the inside
 * pages that carry an animation or a chapter-break quote the same treatment:
 *
 *   ~/Discommode-pages/<issue>/plates/NN.png  →  public/issues/<issue>/plates/NN.webp
 *
 * A plate is the page with its live content HIDDEN — the animated drawing, or
 * the quote: the reader shows it, with the sprites or the letters drawn over
 * it, on the open spread (docs/reader.md, "Inside-page animations" and
 * "Chapter-break quotes"). No riffle copies — a plate never rides a leaf.
 * The plates must be exactly the pages `src/reader/pageAnims.ts` animates and
 * `src/reader/quotes.json` quotes: such a page with no plate, or a plate with
 * neither, stops the run.
 *
 *   npm run plates -- --only 05      just those pages (comma-separated), and
 *                                    only they are held to that rule
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ANIMATED_PAGES, PAGE_ANIM_ISSUE, animsOnPage } from '../src/reader/pageAnims.ts';
import quotes from '../src/reader/quotes.json' with { type: 'json' };

/** Where the PNG exports live — outside the repo. */
const SOURCE_DIR = join(homedir(), 'Discommode-pages');
/** Where the committed WebPs go. */
const OUTPUT_DIR = fileURLToPath(new URL('../public/issues/', import.meta.url));

/** WebP quality. 82 is visually lossless on these scans at 2000px wide. */
const QUALITY = 82;
/** The riffle copies: width and quality. Seen for a frame or two at speed. */
const RIFFLE_W = 1000;
const RIFFLE_QUALITY = 72;
/** Every page must be exactly this. A wrong export size is caught here first. */
const PAGE_W = 2000;
const PAGE_H = 2600;

/** `01.png` … `42.png`, plus the named plates. */
const PAGE_RE = /^(\d{2}|cover|cover-plate|back|overlay)\.png$/;

/** Plates that are not pages: excluded from the page count, and alpha-checked.
 *  `cover-plate.png` is the drawn cover with all twenty animated objects HIDDEN
 *  — the backdrop the hover layer draws its sprites onto, so nothing is baked
 *  underneath them. The composited resting face the rest of the app shows
 *  (`cover-rest.webp`) is built from it by scripts/optimize-anims.mjs, and
 *  `cover-illustrated.png` — the drawn cover WITH its objects — stays a build
 *  input only: it is what frames are registered against, and nothing loads it at
 *  runtime, so it is deliberately not converted here. */
const NON_PAGE = new Set(['overlay.png', 'cover-plate.png']);

const force = process.argv.includes('--force');
const platesMode = process.argv.includes('--plates');
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const only = onlyArg ? new Set(onlyArg.split(',').map((p) => Number(p))) : null;

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
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  // `background/` is not an issue — it holds stage textures for optimize-backgrounds.mjs.
  return entries
    .filter((e) => e.isDirectory() && e.name !== 'background')
    .map((e) => e.name)
    .sort();
}

let pngTotal = 0;
let webpTotal = 0;
let converted = 0;
let skipped = 0;
const warnings = [];

/**
 * A source with *real* transparency must still have it after the WebP round-trip
 * — `overlay.png` is composited over the card, so a flattened alpha would show
 * up as an opaque rectangle instead of floating artwork.
 *
 * "Real" is the operative word: the page scans are RGBA too, but every pixel is
 * opaque, and libwebp correctly drops that redundant channel to save bytes. So
 * the gate is the source's minimum alpha, not merely `hasAlpha` — otherwise
 * every page would cry wolf. Returns the note appended to the conversion line.
 */
async function alphaNote(issue, name, pngPath, webpPath) {
  const { hasAlpha } = await sharp(pngPath).metadata();
  if (!hasAlpha) return '';
  const { channels } = await sharp(pngPath).stats();
  const alpha = channels[channels.length - 1];
  if (alpha.min === 255) return ''; // opaque throughout; dropping it is a win
  const out = await sharp(webpPath).metadata();
  if (!out.hasAlpha) {
    warnings.push(`${issue}/${name} lost its alpha channel in the WebP conversion`);
    return '   !! ALPHA LOST !!';
  }
  return '   hasAlpha: true';
}

let riffleWritten = 0;

/** The half-resolution copy of a numbered page, on the same up-to-date rule. */
async function riffleCopy(issue, name, pngPath, pngStat) {
  if (!/^\d{2}\.png$/.test(name)) return;
  const dir = join(OUTPUT_DIR, issue, 'riffle');
  const out = join(dir, name.replace(/\.png$/, '.webp'));
  const outStat = await statOrNull(out);
  if (!force && outStat && outStat.mtimeMs > pngStat.mtimeMs) return;
  await mkdir(dir, { recursive: true });
  await sharp(pngPath).resize(RIFFLE_W).webp({ quality: RIFFLE_QUALITY }).toFile(out);
  riffleWritten += 1;
}

async function convert(issue, name, sub = '') {
  const pngPath = join(SOURCE_DIR, issue, sub, name);
  const webpName = name.replace(/\.png$/, '.webp');
  const webpPath = join(OUTPUT_DIR, issue, sub, webpName);

  const pngStat = await stat(pngPath);
  const webpStat = await statOrNull(webpPath);

  // Dimensions are checked even on a skip — a stale WebP from a wrong-sized
  // export should keep complaining until it is fixed.
  const { width, height } = await sharp(pngPath).metadata();
  if (width !== PAGE_W || height !== PAGE_H) {
    warnings.push(`${issue}/${name} is ${width}x${height}, expected ${PAGE_W}x${PAGE_H}`);
  }

  if (!sub) await riffleCopy(issue, name, pngPath, pngStat);

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
  const alpha = await alphaNote(issue, name, pngPath, webpPath);
  console.log(`  ${name.padEnd(10)} ${kb(pngStat.size).padStart(9)} → ${kb(out.size).padStart(9)}   ${String(saved).padStart(3)}% smaller${alpha}`);
}

if ((await statOrNull(SOURCE_DIR)) === null) {
  console.log(`
!!  NO PAGE SOURCE FOLDER  !!
!!  Expected PNG exports in: ${SOURCE_DIR}/<issue>/
!!
!!  This folder lives outside the repo so a git operation can never destroy it.
!!  Create it and drop Figma exports in as ~/Discommode-pages/01/01.png etc,
!!  then re-run \`npm run pages\`. Nothing to do until then.
`);
  process.exit(0);
}

if (platesMode) {
  const issue = PAGE_ANIM_ISSUE;
  const dir = join(SOURCE_DIR, issue, 'plates');
  const files = ((await readdir(dir).catch(() => null)) ?? []).filter((f) => /\.png$/i.test(f)).sort();
  const stray = files.filter((f) => !/^\d{2}\.png$/.test(f));
  const quoted = quotes.pages.map((q) => q.page);
  const wanted = [...new Set([...ANIMATED_PAGES, ...quoted])].sort((a, b) => a - b);
  const inScope = (p) => !only || only.has(p);
  const plated = new Set(files.filter((f) => /^\d{2}\.png$/.test(f)).map((f) => Number(f.slice(0, 2))).filter(inScope));
  const missing = wanted.filter((p) => inScope(p) && !plated.has(p));
  const orphan = [...plated].filter((p) => !wanted.includes(p));
  const unknown = only ? [...only].filter((p) => !wanted.includes(p)) : [];
  const pad = (p) => `${String(p).padStart(2, '0')}.png`;
  const what = (p) => (quoted.includes(p) ? 'quote' : `animated (${animsOnPage(p).map((r) => r.id).join(', ')})`);
  const problems = [
    ...missing.map((p) => `page ${pad(p)} has a ${what(p)} but no plate: export ${join(dir, pad(p))} — the page with that ${quoted.includes(p) ? 'quote' : 'drawing'} HIDDEN`),
    ...orphan.map((p) => `plate ${pad(p)} has no animation in src/reader/pageAnims.ts and no quote in src/reader/quotes.json: remove it from ${dir}, or add the page's row`),
    ...unknown.map((p) => `--only ${p}: page ${pad(p)} has no animation and no quote`),
    ...(only ? [] : stray.map((f) => `${join(dir, f)} is not named NN.png`)),
  ];
  if (problems.length) {
    console.log(`\n!!  PLATES DO NOT MATCH THE PAGE ANIMATIONS  !!`);
    for (const p of problems) console.log(`!!  ${p}`);
    console.log('');
    process.exit(1);
  }
  console.log(`\nissue ${issue}  (${plated.size} plate${plated.size === 1 ? '' : 's'}: ${[...plated].sort((a, b) => a - b).map((p) => String(p).padStart(2, '0')).join(' ')})`);
  await mkdir(join(OUTPUT_DIR, issue, 'plates'), { recursive: true });
  for (const p of wanted.filter(inScope)) await convert(issue, pad(p), 'plates');
  console.log(`\n${converted} converted, ${skipped} up to date`);
  console.log(`total  ${mb(pngTotal)} PNG → ${mb(webpTotal)} WebP   ${Math.round((1 - webpTotal / pngTotal) * 100)}% smaller`);
  if (warnings.length > 0) {
    console.log(`\n!!  ${warnings.length} PROBLEM${warnings.length === 1 ? '' : 'S'}  !!`);
    for (const w of warnings) console.log(`!!  ${w}`);
    console.log('!!  Re-export at 2000x2600 before committing.\n');
    process.exit(1);
  }
  process.exit(0);
}

const issues = await listIssues();
if (issues.length === 0) {
  console.log(`No issue folders in ${SOURCE_DIR}`);
  process.exit(0);
}

for (const issue of issues) {
  const files = (await readdir(join(SOURCE_DIR, issue))).filter((f) => PAGE_RE.test(f)).sort();
  const pageCount = files.filter((f) => !NON_PAGE.has(f)).length;
  const extras = files.length - pageCount;
  const plates = extras > 0 ? ` + ${extras} plate${extras === 1 ? '' : 's'}` : '';
  console.log(`\nissue ${issue}  (${pageCount} page${pageCount === 1 ? '' : 's'}${plates})`);
  await mkdir(join(OUTPUT_DIR, issue), { recursive: true });
  for (const name of files) await convert(issue, name);
}

console.log(`\n${converted} converted, ${skipped} up to date, ${riffleWritten} riffle copies written`);
console.log(`total  ${mb(pngTotal)} PNG → ${mb(webpTotal)} WebP   ${Math.round((1 - webpTotal / pngTotal) * 100)}% smaller`);

if (warnings.length > 0) {
  console.log(`\n!!  ${warnings.length} PROBLEM${warnings.length === 1 ? '' : 'S'}  !!`);
  for (const w of warnings) console.log(`!!  ${w}`);
  console.log('!!  Re-export at 2000x2600 (overlay.png with transparency) before committing.\n');
}
