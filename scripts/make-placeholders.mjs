/**
 * Generates the PORTFOLIO PLACEHOLDER assets — flat-colour WebPs and one test
 * MP4 — so the portfolio view's mechanics can be eye-tested before any real
 * project content exists.
 *
 * Unlike `optimize-pages` / `optimize-backgrounds`, there is no source folder
 * outside the repo: every byte here is synthesised from `placeholder-assets.json`,
 * so a re-run reproduces the exact same files. Only the outputs are committed.
 *
 * That table is shared with `projects/placeholder.ts`, which puts the same
 * dimensions into the block data. It has to be one table: a media box laid out
 * at the wrong size until its asset loads changes the page's height, and a page
 * height that changes moves every page start behind it.
 *
 *   public/projects/0N/card.webp      grid + detail art, 2000x2600 (10:13 hero)
 *   public/projects/0N/sheet-NN.webp  one capture per section — see below
 *   public/projects/placeholder/*     the block media the placeholder project uses
 *
 *   npm run dev                       # in another shell, for the captures
 *   npm run placeholders
 *   npm run placeholders -- --force   # rewrite files that already exist
 *
 * THE SHEET CAPTURES are the odd one out: they are not synthesised, they are
 * SCREENSHOTS OF THE LIVE PAGE. A section's sheet is that section's first
 * viewport at 1440×900 — paper colour, grain, the letterhead block, the first
 * blocks — because the whole model is that the sheet and the page are the same
 * pixels, and the only way to be sure of that is to take one from the other.
 *
 * Which makes this a PLACEHOLDER pipeline and not a content one. Nothing fails
 * if a section's first viewport changes and its capture does not; the hand-off
 * diff in `pv-verify` catches it, which is the right signal in the wrong place.
 * See `docs/portfolio-view.md`.
 *
 * The MP4 needs an ffmpeg binary. It is NOT a project dependency: point FFMPEG
 * at one, or have `ffmpeg` on PATH. Without it the images are still written and
 * the video step is skipped with a note (the committed MP4 stays as it is).
 * The captures need a dev server; without one they are skipped the same way.
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ASSETS from '../src/portfolio/projects/placeholder-assets.json' with { type: 'json' };

const run = promisify(execFile);

/** Where the generated assets go. */
const OUTPUT_DIR = fileURLToPath(new URL('../public/projects/', import.meta.url));

/** WebP quality. Flat colour compresses to nothing, so this can be generous. */
const QUALITY = 82;

/**
 * …and the captures get their own, because they are pages of type that get
 * compared pixel for pixel against the live page they were taken from.
 *
 * 90 rather than 82, and measured: lossy compression rings around a glyph edge,
 * and the page that is all prose has more glyph edges than any other. See the
 * figures in `docs/portfolio-view.md`.
 */
const SHEET_QUALITY = 90;

/** The hero rect's ratio (see layout/hero.ts) — card art is authored at 10:13. */
const CARD_W = 2000;
const CARD_H = 2600;

const force = process.argv.includes('--force');
const URL_ARG = process.argv.indexOf('--url');
/** Not `URL` — that is a global, and shadowing it breaks `new URL(...)` above. */
const ORIGIN = URL_ARG >= 0 ? process.argv[URL_ARG + 1] : 'http://localhost:5173';

/**
 * ONE CAPTURE PER SIGNED-OFF VIEWPORT, and there is no way around it.
 *
 * It would be tidier for one to serve both, and it does not work. A page's type
 * is a fixed number of pixels and its measure is not, so a page at 1728 wraps
 * its lines somewhere a page at 1440 does not — the two are different documents
 * rather than the same document at two scales, and resampling one into the
 * other resamples the wrong line breaks. Measured: a single capture put the
 * hand-off diff at 8-16% of the page's pixels at the viewport it was not taken
 * at, against a 2% budget. With one each it is under 2% at both.
 *
 * The names carry the PAGE's width rather than the viewport's, because that is
 * what `SheetCanvas` picks by.
 */
const CAPTURES = [
  { width: 1728, height: 996 },
  { width: 1440, height: 900 },
];

/** One placeholder card per portfolio project: flat colour + a large label. */
const CARDS = [
  { id: '02', bg: '#2b3a4a', ink: '#e8eef4' },
  { id: '03', bg: '#3f3348', ink: '#f1e9f6' },
  { id: '04', bg: '#2f4239', ink: '#e6f2ea' },
];

/** The block media the placeholder project points at, all solid colour. */
const MEDIA = Object.entries(ASSETS.media).map(([file, spec]) => ({ file, ...spec }));

/** A flat rectangle with a centred monospace label, as an SVG buffer. */
function plate({ w, h, bg, ink, label, kicker }) {
  // Label size tracks the short edge so every plate reads the same at any size.
  const size = Math.round(Math.min(w, h) * 0.28);
  const kickerSize = Math.round(Math.min(w, h) * 0.045);
  const cy = kicker ? h / 2 + size * 0.26 : h / 2 + size * 0.35;
  const font = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect width="${w}" height="${h}" fill="${bg}"/>` +
      (kicker
        ? `<text x="${w / 2}" y="${h / 2 - size * 0.62}" fill="${ink}" fill-opacity="0.6"` +
          ` font-family="${font}" font-size="${kickerSize}" letter-spacing="${kickerSize * 0.4}"` +
          ` text-anchor="middle">${kicker}</text>`
        : '') +
      `<text x="${w / 2}" y="${cy}" fill="${ink}" font-family="${font}" font-size="${size}"` +
      ` font-weight="600" text-anchor="middle">${label}</text>` +
      `</svg>`,
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writePlate(relPath, spec) {
  const out = join(OUTPUT_DIR, relPath);
  if (!force && (await exists(out))) {
    console.log(`  skip   ${relPath} (exists)`);
    return;
  }
  await mkdir(dirname(out), { recursive: true });
  const buf = await sharp(plate(spec)).webp({ quality: QUALITY }).toBuffer();
  await writeFile(out, buf);
  console.log(`  write  ${relPath}  ${(buf.length / 1024).toFixed(0)} KB`);
}

/** An ffmpeg binary, or null when there is none to be had. */
async function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    const { stdout } = await run('which', ['ffmpeg']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The test clip: 4s of a slow colour sweep with a travelling bar, so "is it
 * playing?" is answerable at a glance and pause-when-out-of-view is visible.
 */
async function writeVideo() {
  const rel = `placeholder/${ASSETS.video.file}`;
  const out = join(OUTPUT_DIR, rel);
  if (!force && (await exists(out))) {
    console.log(`  skip   ${rel} (exists)`);
    return;
  }
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    console.log(`  SKIP   ${rel} — no ffmpeg (set FFMPEG=/path/to/ffmpeg)`);
    return;
  }
  await mkdir(dirname(out), { recursive: true });
  const V = ASSETS.video;
  await run(ffmpeg, [
    '-y',
    '-f', 'lavfi',
    '-i', `gradients=s=${V.w}x${V.h}:d=${V.seconds}:speed=0.12:c0=0x3f6079:c1=0x8c6a46:n=2`,
    '-f', 'lavfi',
    '-i', `color=c=0xcfdde9@0.55:s=40x${V.h}:d=${V.seconds},format=rgba`,
    '-filter_complex', `[0][1]overlay=x='mod(t*260,${V.w + 40})-40':y=0:format=auto,format=yuv420p`,
    '-r', '24',
    '-t', String(V.seconds),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '30',
    '-movflags', '+faststart',
    '-an',
    out,
  ]);
  console.log(`  write  ${rel}`);
}

/**
 * One capture per section of one project, clipped to the live page's rect.
 *
 * It PARKS THE TRACK on each section rather than deep-linking to it, and the
 * reason is the whole geometry of the view: every page of a project is in the
 * same rectangle, and all but the live one are out of the paint order. A
 * screenshot clipped to section 3's box while section 0 is the live page is a
 * picture of section 0. `window.__pv.seek` is the only way to say which page is
 * the one painting.
 */
async function captureSheets(browser, id, viewport) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${ORIGIN}/#view-${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
  // The intro tween owns the position for its first second and a half.
  await page.waitForTimeout(2000);
  const count = await page.evaluate(() => document.querySelectorAll('.pv-page').length);
  const pageWidth = await page.evaluate(
    () => Math.round(document.querySelector('.pv-page').getBoundingClientRect().width),
  );

  for (let k = 0; k < count; k++) {
    const rel = `${id}/sheet-${String(k + 1).padStart(2, '0')}-${pageWidth}.webp`;
    const out = join(OUTPUT_DIR, rel);
    if (!force && (await exists(out))) {
      console.log(`  skip   ${rel} (exists)`);
      continue;
    }
    const clip = await page.evaluate(async (k) => {
      window.__pv.seek(window.__pv.track().start[k]);
      // The media has to be decoded and every reveal on the first viewport
      // finished: a block caught mid-reveal would bake a half-faded paragraph
      // into the texture, and the hand-off would then have to hide it.
      await new Promise((r) => setTimeout(r, 1500));
      // EVERY VIDEO ON ITS FIRST FRAME. A clip that is playing bakes whatever
      // frame it was on, and the live page is never on that frame again — so
      // the hand-off diff would report a difference on every run and mean
      // nothing by it. `pv-verify` parks them the same way before it measures.
      for (const v of document.querySelectorAll('video')) {
        v.pause();
        v.currentTime = 0;
      }
      await new Promise((r) => setTimeout(r, 250));
      const r = document.querySelector(`.pv-page[data-k="${k}"]`).getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }, k);
    const png = await page.screenshot({ clip, animations: 'disabled' });
    await mkdir(dirname(out), { recursive: true });
    const buf = await sharp(png).webp({ quality: SHEET_QUALITY }).toBuffer();
    await writeFile(out, buf);
    console.log(`  write  ${rel}  ${clip.width}x${clip.height}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
  await context.close();
}

console.log('portfolio placeholders →', OUTPUT_DIR);
for (const card of CARDS) {
  await writePlate(`${card.id}/card.webp`, {
    w: CARD_W,
    h: CARD_H,
    bg: card.bg,
    ink: card.ink,
    label: card.id,
    kicker: 'PORTFOLIO',
  });
}
for (const m of MEDIA) {
  await writePlate(`placeholder/${m.file}`, m);
}
await writeVideo();

// The captures, last: they need everything above to exist first, since they are
// screenshots of a page made of it.
try {
  const res = await fetch(ORIGIN, { method: 'GET' });
  if (!res.ok) throw new Error(String(res.status));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const card of CARDS) {
    for (const viewport of CAPTURES) await captureSheets(browser, card.id, viewport);
  }
  await browser.close();
} catch (e) {
  console.log(`  SKIP   sheet captures — no dev server at ${ORIGIN} (${e.message})`);
  console.log('         run \`npm run dev\` in another shell, or pass --url');
}

console.log('done.');
