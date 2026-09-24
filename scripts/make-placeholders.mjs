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
 *   public/projects/0N/card.webp           grid + detail art, 2000x2600 (10:13)
 *   public/projects/0N/sheet-NN-B@2x.webp  a section's FIRST viewport, per bucket
 *   public/projects/0N/tail-NN-B@2x.webp   …and its LAST
 *   public/projects/placeholder/*     the block media the placeholder project uses
 *
 *   npm run dev                       # in another shell, for the captures
 *   npm run placeholders
 *   npm run placeholders -- --force   # rewrite files that already exist
 *
 * THE SHEET CAPTURES are the odd one out: they are not synthesised, they are
 * SCREENSHOTS OF THE LIVE PAGE — because the whole model is that the sheet and
 * the page are the same pixels, and the only way to be sure of that is to take
 * one from the other.
 *
 * TWO PER SECTION, because there are two hand-offs. An entrance ends on the
 * section's FIRST viewport and a tear begins on its LAST, and both moments are
 * as deterministic as each other: a tear always starts with the page scrolled
 * to its bottom, which is what the end of a vertical run is.
 *
 * …times one per PAGE BUCKET (`src/portfolio/pageBuckets.json`). The page is laid
 * out at a bucket's width and never between two, so the buckets are every
 * document a reader can be shown. Each is taken at 2x with the page
 * `captureHeight` tall, taller than any page the view draws, and the sheet
 * crops it by uv to the live page's height. Files for widths or scales that are
 * no longer in the list are deleted.
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
import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ASSETS from '../src/portfolio/projects/placeholder-assets.json' with { type: 'json' };
import PAGE from '../src/portfolio/pageBuckets.json' with { type: 'json' };

/**
 * A RASTER BUDGET BIG ENOUGH FOR A 2x PAGE 1400px TALL. Headless Chrome's
 * default GPU memory budget is small, and a page this size at 2x (with the
 * grain layer, which is nine times the page's area) goes over it. Chrome's
 * answer is to leave tiles unrasterised, and a screenshot then shows the
 * ground through the paper in tile-shaped bands. It is not deterministic: the
 * same page came back 3.5% and then 11.5% sky on two runs at bucket 1920, and
 * clean with this.
 */
const CHROME_ARGS = ['--force-gpu-mem-available-mb=4096'];

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
 * ONE CAPTURE PER PAGE BUCKET, and the list is the app's own.
 *
 * A page's type is a fixed number of pixels and its measure is not, so a page
 * at one width wraps its lines somewhere a page at another does not. The two
 * are different documents, and resampling one into the other resamples the
 * wrong line breaks: measured, a capture worn at a width it was not taken at
 * put the hand-off diff at 8–16% of the page against a 2% budget. So the view
 * lays its page out only at these widths (see `pageBuckets.ts`), and each one
 * is captured.
 *
 * The window is the bucket's width exactly, and as tall as it has to be for
 * the page to be `captureHeight` tall. That is measured off the live page
 * rather than worked out from the dials, so a dial change cannot put the
 * capture a few pixels short.
 */
const BUCKETS = PAGE.buckets;
const CAPTURE_H = PAGE.captureHeight;
const SCALE = PAGE.captureScale;

/**
 * One placeholder card per portfolio project: flat colour + a large label.
 *
 * `bg`/`ink` are a PLATE, and a card with a real face has none — card 04 wears
 * a crop of Nosey's own pitch site, cut from a poster by `optimize-projects`,
 * so a plate here would be written straight over it on the next `--force`. It
 * still needs its CAPTURES taken, which is every other thing in this list, so
 * it stays in the list without a plate rather than dropping out of it.
 */
const CARDS = [
  { id: '02', bg: '#2b3a4a', ink: '#e8eef4' },
  { id: '03', bg: '#3f3348', ink: '#f1e9f6' },
  { id: '04' },
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
/** Every capture a project of `count` sections needs, in the order that takes
 *  the fewest seeks: down the sections, both frames of each. */
function* frames(count) {
  for (let k = 0; k < count; k++) {
    yield [k, 'sheet'];
    yield [k, 'tail'];
  }
}

/** `02/sheet-01-1728@2x.webp`: the name `captures.ts` expects. */
const captureName = (id, k, kind, bucket) =>
  `${id}/${kind}-${String(k + 1).padStart(2, '0')}-${bucket}${SCALE > 1 ? `@${SCALE}x` : ''}.webp`;

/** Delete every capture in a project's folder that the bucket list no longer
 *  names: the per-viewport set this replaced, or a bucket taken out of the
 *  list. A stale file is never read, and never noticed either. */
async function pruneCaptures(id, count) {
  const keep = new Set();
  for (const bucket of BUCKETS) {
    for (let k = 0; k < count; k++) {
      for (const kind of ['sheet', 'tail']) keep.add(captureName(id, k, kind, bucket).split('/')[1]);
    }
  }
  for (const name of await readdir(join(OUTPUT_DIR, id))) {
    if (!/^(sheet|tail)-\d+-\d+(@\dx)?\.webp$/.test(name) || keep.has(name)) continue;
    await unlink(join(OUTPUT_DIR, id, name));
    console.log(`  prune  ${id}/${name}`);
  }
}

async function captureSheets(browser, id, bucket) {
  const scale = SCALE;
  const context = await browser.newContext({ deviceScaleFactor: scale });
  const page = await context.newPage();
  // The chrome around the page is the letterhead and two margins; find it at
  // a first guess of the height, then open again at the height that makes the
  // page exactly `CAPTURE_H` tall.
  await page.setViewportSize({ width: bucket, height: CAPTURE_H + 200 });
  await page.goto(`${ORIGIN}/#view-${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
  const guess = await page.evaluate(() => window.__pv.pageRect()?.height ?? 0);
  await page.setViewportSize({ width: bucket, height: CAPTURE_H + 200 + (CAPTURE_H - guess) });
  await page.goto(`${ORIGIN}/?capture=${bucket}#view-${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
  // THE INTRO OWNS THE POSITION while its tween runs, and `seek` sets the same
  // flag it holds — so a seek issued underneath one is overwritten on the next
  // frame and the capture is of whatever the intro was on. Wait for the
  // position to stop moving and for a page to be the live surface, rather than
  // guessing at the open tween's length plus the storyboard — a guess that got
  // worse the moment the tween went from 1.4s to 2.6s.
  const t0 = Date.now();
  let last = null;
  for (;;) {
    const now = await page.evaluate(() => ({
      y: window.__pv.position(),
      segment: window.__pv.layout()?.segment ?? null,
    }));
    if (last !== null && Math.abs(last - now.y) < 0.5 && now.segment === 'page') break;
    if (Date.now() - t0 > 8000) throw new Error('the view never settled after opening');
    last = now.y;
    await page.waitForTimeout(60);
  }
  const count = await page.evaluate(() => document.querySelectorAll('.pv-page').length);
  const laid = await page.evaluate(() => ({ bucket: window.__pv.bucket(), rect: window.__pv.pageRect() }));
  if (laid.bucket !== bucket || Math.round(laid.rect.height) !== CAPTURE_H) {
    throw new Error(
      `bucket ${bucket}: the page came out at bucket ${laid.bucket}, ` +
        `${laid.rect.width}x${laid.rect.height}, not ${CAPTURE_H} tall`,
    );
  }

  for (const [k, kind] of frames(count)) {
    const rel = captureName(id, k, kind, bucket);
    const out = join(OUTPUT_DIR, rel);
    if (!force && (await exists(out))) {
      console.log(`  skip   ${rel} (exists)`);
      continue;
    }
    const clip = await page.evaluate(async ([k, kind]) => {
      const t = window.__pv.track();
      // The first viewport of the section, or its last — which is the bottom of
      // its vertical run, and the frame every tear starts from.
      window.__pv.seek(kind === 'tail' ? t.start[k] + t.pageScroll[k] : t.start[k]);
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
      // AND EVERY RIVE ARTBOARD, back to the frame it mounted on. A state
      // machine runs its own rAF loop on a canvas, where `animations:
      // 'disabled'` cannot reach it — so without this the capture bakes
      // whatever frame the artboard happened to be on and the live page is
      // never on that frame again. `pv-verify` parks them the same way before
      // it measures the hand-off. Dev-only, and absent on a project with no
      // artboard, so the call is optional.
      await window.__pvRive?.();
      await new Promise((r) => setTimeout(r, 250));
      const r = document.querySelector(`.pv-page[data-k="${k}"]`).getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }, [k, kind]);
    // The clip is in CSS pixels; Playwright returns it at `deviceScaleFactor`,
    // so the file comes out `clip.width × scale` wide with no resampling
    // anywhere in the path.
    const png = await page.screenshot({ clip, animations: 'disabled' });
    await mkdir(dirname(out), { recursive: true });
    const buf = await sharp(png).webp({ quality: SHEET_QUALITY }).toBuffer();
    await writeFile(out, buf);
    const { width, height } = await sharp(buf).metadata();
    console.log(
      `  write  ${rel}  ${width}x${height} device px ` +
        `(${clip.width}x${clip.height} css @${scale}x)  ${(buf.length / 1024).toFixed(0)} KB`,
    );
  }
  await context.close();
  return count;
}

console.log('portfolio placeholders →', OUTPUT_DIR);
for (const card of CARDS) {
  // A card whose face is a real picture has no plate — see `CARDS`.
  if (!card.bg) {
    console.log(`  keep   ${card.id}/card.webp (real art, written by \`npm run projects\`)`);
    continue;
  }
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
  const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
  for (const card of CARDS) {
    let count = 0;
    for (const bucket of BUCKETS) count = await captureSheets(browser, card.id, bucket);
    await pruneCaptures(card.id, count);
  }
  await browser.close();
} catch (e) {
  console.log(`  SKIP   sheet captures — no dev server at ${ORIGIN} (${e.message})`);
  console.log('         run \`npm run dev\` in another shell, or pass --url');
}

console.log('done.');
