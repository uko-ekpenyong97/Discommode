/**
 * PROJECT MEDIA -> the files a project page actually loads.
 *
 * The third of the three source pipelines, and the same shape as the other two
 * (`optimize-pages`, `optimize-anims`): the masters live OUTSIDE the repo, only
 * the outputs are committed. Drop one folder per project into
 *
 *   ~/Discommode-pages/projects/<slug>/
 *
 * and this writes what the app loads into
 *
 *   public/projects/<slug>/<name>.webm        VP9, muted, <= MAX_W wide
 *   public/projects/<slug>/<name>.mp4         h264, muted, the same frame
 *   public/projects/<slug>/<name>-poster.webp the FIRST FRAME, same pixels
 *   public/projects/<slug>/<name>.webp        for a png/jpg source
 *   public/projects/<slug>/<name>.riv         copied byte for byte
 *   public/projects/<slug>/<name>.svg         copied byte for byte (a cover's
 *                                             logo: card 03's cover-logo.svg)
 *
 * plus the card face, which is named by the CARD and not by the slug:
 *
 *   public/projects/<NN>/card.webp            a 10:13 crop of one frame
 *
 * plus the one thing that is not an asset:
 *
 *   src/portfolio/projects/<slug>-assets.json  the INTRINSIC SIZE of each
 *
 * THAT JSON IS THE POINT OF HALF OF THIS. A media box is laid out from its
 * dimensions BEFORE the asset loads — that is what keeps a page the same height
 * at mount as it is once everything has decoded, and a page height that changes
 * moves every page start behind it and throws the reader onto the wrong section
 * (see `docs/portfolio-view.md`, "The first-open lock"). So the size cannot be
 * looked up at runtime and it cannot be guessed: it is written here, by the same
 * run that writes the file, and imported by the project's content module. Never
 * hand-edit it.
 *
 * The size is read back off the POSTER rather than out of the encoder, and that
 * is deliberate: the poster is extracted from the ENCODED mp4, so whatever the
 * scale filter actually did is what the JSON says. A number derived from the
 * source and a file scaled from it are two chances to disagree.
 *
 * TWO CODECS, ONE CLIP. `<video>` takes both as `<source>` children and picks;
 * the mp4 is last because it is the one that always plays. Shipping only the
 * webm would be smaller and would not play everywhere; shipping only the mp4
 * costs about a third more bytes for the same picture.
 *
 * THE BUDGET IS PER FILE, and it is enforced rather than hoped for: each encode
 * runs at a starting CRF and, if it lands over {@link MAX_MB}, runs again a few
 * steps quieter until it fits. A 4K 60fps screen recording is two orders of
 * magnitude over budget to begin with, so the first guess is always wrong and
 * the loop is what makes the number true. If a clip cannot be made to fit
 * before {@link CRF_CEILING}, it is written anyway and named loudly at the end
 * — a clip that is too big is a thing to go and shorten, not a thing for this
 * script to silently ruin.
 *
 * Needs an ffmpeg binary, on the same terms as `make-placeholders`: it is NOT a
 * project dependency. Put one on PATH or point `FFMPEG` at it.
 *
 *   npm run projects
 *   npm run projects -- --force            # re-encode files that already exist
 *   npm run projects -- --only rive-site   # one slug
 */
import { access, copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);

/** Where the masters live — outside the repo, so no git operation can reach
 *  them. Same folder the page scans use, one level down. */
const SOURCE_DIR = join(homedir(), 'Discommode-pages', 'projects');
/** Where the committed outputs go. */
const OUTPUT_DIR = fileURLToPath(new URL('../public/projects/', import.meta.url));
/** …and where the size table goes, which is source rather than an asset. */
const ASSETS_DIR = fileURLToPath(new URL('../src/portfolio/projects/', import.meta.url));

/** No clip is laid out wider than the page's measure at the widest signed-off
 *  viewport (1632px, less two insets), and a 2x display doubles that. 1600 is
 *  the round number above it — past that every extra pixel is spent on a
 *  display nobody is reading this on. */
const MAX_W = 1600;

/** The per-file budget, in megabytes. */
const MAX_MB = 4;

/** Where each codec starts, how far a retry moves it, and where it gives up.
 *  The starting numbers are tuned for 60fps screen capture of UI motion, which
 *  is the hardest thing in this folder: large flat areas that compress to
 *  nothing, punctuated by whole-frame changes that do not. */
const CRF = {
  webm: { start: 34, step: 4, ceiling: 50 },
  mp4: { start: 26, step: 3, ceiling: 40 },
};
const CRF_CEILING = Math.max(CRF.webm.ceiling, CRF.mp4.ceiling);

/** WebP quality for stills and posters. Matches `optimize-pages`. */
const QUALITY = 82;

/**
 * SOURCES THAT STAY SOURCES — kept in the masters folder, never shipped.
 *
 * A project's source folder is a working folder: things get tried and dropped
 * out of the page without anybody wanting to delete the file that made them.
 * Without this, every run would faithfully copy one back into `public/` and the
 * next commit would carry an asset nothing loads.
 *
 * `rive-site/loop.riv` is the Loop character, which section 01 opened with
 * until the two clips replaced it. It is 3.6 MB of artboard nothing fetches.
 *
 * `nosey/cover.unsigned.riv` is a build of card 04's cover whose scripts are
 * not signed: the web runtimes refuse its scripts, so Main's props and Main
 * Bounce's physics never run (docs/covers.md, "The .riv"). Kept only as the
 * record of that; `cover.riv` is the signed build.
 *
 * `drex/preview-*.png` are drexCover.js's handoff renders, the references
 * `verify:cover` reads from here (docs/covers.md, "Card 03"); nothing loads
 * them.
 */
const NOT_SHIPPED = {
  'rive-site': ['loop.riv'],
  nosey: ['cover.unsigned.riv'],
  drex: ['preview-figma-rest.png', 'preview-hover.png'],
};

/**
 * THE CARD FACE — the 2000x2600 the grid tile and the detail panel wear.
 *
 * `make-placeholders` synthesises one flat plate per portfolio card, and that
 * is the right thing for a card with nothing behind it. Once a project is real
 * its face should be a picture of the project — and this pipeline is already
 * holding the project's own footage, so the face is a FRAME OF IT.
 *
 * It is named by the CARD (`04`) rather than by the slug, because
 * `public/projects/<NN>/card.webp` is what `content.ts` points at and `#view-NN`
 * is what the card opens.
 *
 * A card taken over by an entry here has to come OUT of the plates in `CARDS`
 * in `make-placeholders.mjs`, or the next `npm run placeholders -- --force`
 * writes the flat plate back over it.
 *
 *   from    the clip's stem, in this slug
 *   at      seconds into the ENCODED mp4 — the frame, chosen by eye. Read off
 *           the encode rather than the master so the face is the pixels the
 *           page ships, at the size and the CRF it ships them at
 *   focus   where the 10:13 window sits in the frame's slack: 0 flush left,
 *           0.5 centred, 1 flush right. A crop this deep has a subject in it
 *           or it has nothing, and the subject is rarely in the middle
 *
 * 10:13 out of 16:9 is a deep crop and there is no way around it: the frame is
 * 900 tall and the card is 2600, so a full-bleed face is the same ~2.9x upscale
 * whichever slice it takes. It is authored at 2000x2600 and read at a few
 * hundred, which is where that goes unseen — see `layout/hero.ts`.
 */
const CARD_FACES = {
  // The closing scene: Nosey's face, large, on the white of the page it lives
  // on, with the site's sky and grass left as bands top and bottom. `focus`
  // 0.66 is what puts the face on the card's centre line rather than off its
  // right edge, which is where a centred crop leaves it.
  nosey: { card: '04', from: '01-site-scroll', at: 110, focus: 0.66 },
};

/** The hero rect's ratio (see `layout/hero.ts`) — card art is authored at 10:13,
 *  the same size `make-placeholders` draws its plates at. */
const CARD_W = 2000;
const CARD_H = 2600;

const VIDEO_RE = /\.(mp4|mov)$/i;
const IMAGE_RE = /\.(png|jpe?g)$/i;
const RIVE_RE = /\.riv$/i;
const SVG_RE = /\.svg$/i;

const force = process.argv.includes('--force');
const ONLY_ARG = process.argv.indexOf('--only');
const only = ONLY_ARG >= 0 ? process.argv[ONLY_ARG + 1] : null;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const warnings = [];
let written = 0;
let skipped = 0;

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

const exists = async (path) => (await statOrNull(path)) !== null;

/** An ffmpeg binary, or null when there is none to be had. Same contract as
 *  `make-placeholders`: the env var wins, then PATH. */
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
 * Fit to {@link MAX_W} without ever enlarging, and keep both axes EVEN.
 *
 * `-2` rather than `-1` is not a style choice: yuv420p subsamples chroma by two
 * on both axes, so an odd dimension is not encodable and h264 fails outright on
 * one. `min(MAX_W,iw)` is what stops a source narrower than the cap being blown
 * up to it — the cap is a ceiling, not a target.
 */
const SCALE = `scale='min(${MAX_W},iw)':-2:flags=lanczos`;

/**
 * Encode once, at one CRF, and report what it cost.
 *
 * `-an` is the whole of "muted" at the file level, and it is better than muting
 * the element: a silent track is bytes the reader downloads to not hear.
 */
async function encodeOnce(ffmpeg, src, out, codec, crf) {
  const common = ['-y', '-i', src, '-vf', SCALE, '-an', '-map_metadata', '-1'];
  const args =
    codec === 'webm'
      ? [...common, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
         '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', out]
      : [...common, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow',
         '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', out];
  await run(ffmpeg, args, { maxBuffer: 64 * 1024 * 1024 });
  return (await stat(out)).size;
}

/**
 * …and again, quieter, until it fits the budget.
 *
 * Returns the CRF it landed on and the bytes, so the run's log is a record of
 * what each clip actually cost rather than of what was asked for.
 */
async function encodeToBudget(ffmpeg, src, out, codec, label) {
  const { start, step, ceiling } = CRF[codec];
  const limit = MAX_MB * 1024 * 1024;
  let crf = start;
  let bytes = await encodeOnce(ffmpeg, src, out, codec, crf);
  while (bytes > limit && crf + step <= ceiling) {
    crf += step;
    process.stdout.write(`      ${label} ${mb(bytes)} at crf ${crf - step} — retrying at ${crf}\n`);
    bytes = await encodeOnce(ffmpeg, src, out, codec, crf);
  }
  if (bytes > limit) {
    warnings.push(`${label} is ${mb(bytes)} at crf ${crf} (ceiling) — over the ${MAX_MB} MB budget`);
  }
  return { crf, bytes };
}

/**
 * THE FIRST FRAME OF THE ENCODED CLIP, as the poster.
 *
 * Taken from the output rather than the source so it is the same pixels the
 * video's own first frame is — a poster that is a different size, or a
 * different crop, is a layout shift at the moment the clip decodes, which is
 * the one thing the intrinsic size exists to prevent.
 */
async function writePoster(ffmpeg, mp4, out) {
  const tmp = join(tmpdir(), `pv-poster-${process.pid}-${basename(out)}.png`);
  await run(ffmpeg, ['-y', '-i', mp4, '-vframes', '1', '-f', 'image2', tmp]);
  const buf = await sharp(tmp).webp({ quality: QUALITY }).toBuffer();
  await writeFile(out, buf);
  await unlink(tmp).catch(() => {});
  const { width, height } = await sharp(buf).metadata();
  return { bytes: buf.length, w: width, h: height };
}

async function convertVideo(ffmpeg, slug, name, table) {
  const stem = basename(name, extname(name));
  const src = join(SOURCE_DIR, slug, name);
  const dir = join(OUTPUT_DIR, slug);
  const mp4 = join(dir, `${stem}.mp4`);
  const webm = join(dir, `${stem}.webm`);
  const poster = join(dir, `${stem}-poster.webp`);

  const srcStat = await stat(src);
  const outStat = await statOrNull(mp4);
  if (!force && outStat && outStat.mtimeMs > srcStat.mtimeMs && (await exists(webm)) && (await exists(poster))) {
    const { width, height } = await sharp(poster).metadata();
    table[stem] = { w: width, h: height };
    skipped += 1;
    console.log(`  ${stem.padEnd(20)} ${width}x${height}  (up to date)`);
    return;
  }

  await mkdir(dir, { recursive: true });
  const h264 = await encodeToBudget(ffmpeg, src, mp4, 'mp4', `${stem}.mp4`);
  const vp9 = await encodeToBudget(ffmpeg, src, webm, 'webm', `${stem}.webm`);
  const still = await writePoster(ffmpeg, mp4, poster);

  table[stem] = { w: still.w, h: still.h };
  written += 1;
  console.log(
    `  ${stem.padEnd(20)} ${still.w}x${still.h}  ${mb(srcStat.size)} → ` +
      `mp4 ${mb(h264.bytes)} (crf ${h264.crf})  webm ${mb(vp9.bytes)} (crf ${vp9.crf})  ` +
      `poster ${kb(still.bytes)}`,
  );
}

async function convertImage(slug, name, table) {
  const stem = basename(name, extname(name));
  const src = join(SOURCE_DIR, slug, name);
  const out = join(OUTPUT_DIR, slug, `${stem}.webp`);

  const srcStat = await stat(src);
  const outStat = await statOrNull(out);
  if (!force && outStat && outStat.mtimeMs > srcStat.mtimeMs) {
    const { width, height } = await sharp(out).metadata();
    table[stem] = { w: width, h: height };
    skipped += 1;
    console.log(`  ${stem.padEnd(20)} ${width}x${height}  (up to date)`);
    return;
  }

  await mkdir(join(OUTPUT_DIR, slug), { recursive: true });
  const buf = await sharp(src)
    .resize({ width: MAX_W, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  await writeFile(out, buf);
  const { width, height } = await sharp(buf).metadata();
  table[stem] = { w: width, h: height };
  written += 1;
  if (buf.length > MAX_MB * 1024 * 1024) {
    warnings.push(`${slug}/${stem}.webp is ${mb(buf.length)} — over the ${MAX_MB} MB budget`);
  }
  console.log(`  ${stem.padEnd(20)} ${width}x${height}  ${mb(srcStat.size)} → ${kb(buf.length)}`);
}

/**
 * A `.riv` is COPIED, not processed. It is already a compiled binary the
 * runtime reads whole; there is no lossy knob on it and no smaller form of it
 * that is still the same file. So is an `.svg`: Figma's export, drawn as it is.
 */
async function copyAsIs(slug, name) {
  const src = join(SOURCE_DIR, slug, name);
  const out = join(OUTPUT_DIR, slug, name);
  const srcStat = await stat(src);
  const outStat = await statOrNull(out);
  if (!force && outStat && outStat.mtimeMs > srcStat.mtimeMs) {
    skipped += 1;
    console.log(`  ${name.padEnd(20)} ${kb(srcStat.size)}  (up to date)`);
    return;
  }
  await mkdir(join(OUTPUT_DIR, slug), { recursive: true });
  await copyFile(src, out);
  written += 1;
  if (srcStat.size > MAX_MB * 1024 * 1024) {
    warnings.push(`${slug}/${name} is ${mb(srcStat.size)} — over the ${MAX_MB} MB budget`);
  }
  // Rive files start with the ASCII fingerprint "RIVE"; a source that is not one
  // would otherwise ship and fail silently at the block, which renders its
  // stand-in and says nothing.
  const head = (await readFile(out)).subarray(0, 4).toString('ascii');
  if (RIVE_RE.test(name) && head !== 'RIVE') warnings.push(`${slug}/${name} does not start with the RIVE fingerprint`);
  console.log(`  ${name.padEnd(20)} ${kb(srcStat.size)}  copied`);
}

/**
 * …and the crop itself.
 *
 * `extract` at an explicit left edge rather than `fit: 'cover'`, because cover
 * only takes a named anchor and the three it offers here — left, centre, right —
 * are not where the subject is. The window is as tall as the frame and as wide
 * as 10:13 allows, and `focus` slides it across the pixels cover would have
 * thrown away.
 */
async function writeCardFace(ffmpeg, slug, { card, from, at, focus }) {
  const mp4 = join(OUTPUT_DIR, slug, `${from}.mp4`);
  const out = join(OUTPUT_DIR, card, 'card.webp');
  const srcStat = await statOrNull(mp4);
  if (!srcStat) {
    warnings.push(`${card}/card.webp not written: ${slug}/${from}.mp4 does not exist`);
    return;
  }
  if (!ffmpeg) {
    warnings.push(`${card}/card.webp not written: no ffmpeg (set FFMPEG=/path/to/ffmpeg)`);
    return;
  }
  const outStat = await statOrNull(out);
  if (!force && outStat && outStat.mtimeMs > srcStat.mtimeMs) {
    skipped += 1;
    console.log(`  ${`${card}/card.webp`.padEnd(20)} ${CARD_W}x${CARD_H}  (up to date)`);
    return;
  }

  const tmp = join(tmpdir(), `pv-card-${process.pid}-${card}.png`);
  // `-ss` BEFORE `-i` seeks the container and decodes from the nearest keyframe,
  // which is the fast form and is exact enough: the face is a still, not a
  // measurement, and the clip is a slow scroll.
  await run(ffmpeg, ['-y', '-ss', String(at), '-i', mp4, '-frames:v', '1', '-f', 'image2', tmp]);

  const frame = sharp(tmp);
  const { width, height } = await frame.metadata();
  const cropW = Math.min(width, Math.round((height * CARD_W) / CARD_H));
  const left = Math.round((width - cropW) * Math.min(1, Math.max(0, focus)));
  const buf = await frame
    .extract({ left, top: 0, width: cropW, height })
    .resize({ width: CARD_W, height: CARD_H })
    .webp({ quality: QUALITY })
    .toBuffer();
  await mkdir(join(OUTPUT_DIR, card), { recursive: true });
  await writeFile(out, buf);
  await unlink(tmp).catch(() => {});
  written += 1;
  console.log(
    `  ${`${card}/card.webp`.padEnd(20)} ${CARD_W}x${CARD_H}  ` +
      `from ${from}.mp4 @${at}s, ${cropW}x${height} at x=${left}  ${kb(buf.length)}`,
  );
}

async function listSlugs() {
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !only || name === only)
    .sort();
}

if (!(await exists(SOURCE_DIR))) {
  console.log(`
!!  NO PROJECT SOURCE FOLDER  !!
!!  Expected masters in: ${SOURCE_DIR}/<slug>/
!!
!!  This folder lives outside the repo so a git operation can never destroy it.
!!  Create it, drop a project's video/stills/.riv in as
!!  ~/Discommode-pages/projects/<slug>/…, then re-run \`npm run projects\`.
`);
  process.exit(0);
}

const ffmpeg = await findFfmpeg();
const slugs = await listSlugs();
if (slugs.length === 0) {
  console.log(`No project folders in ${SOURCE_DIR}${only ? ` matching "${only}"` : ''}`);
  process.exit(0);
}

console.log('project media →', OUTPUT_DIR);
for (const slug of slugs) {
  const skip = new Set(NOT_SHIPPED[slug] ?? []);
  const files = (await readdir(join(SOURCE_DIR, slug))).filter(
    (f) => !skip.has(f) && (VIDEO_RE.test(f) || IMAGE_RE.test(f) || RIVE_RE.test(f) || SVG_RE.test(f)),
  );
  for (const name of skip) console.log(`  ${name.padEnd(20)} kept as a source, not shipped`);
  files.sort();
  console.log(`\n${slug}  (${files.length} file${files.length === 1 ? '' : 's'})`);
  /** stem → intrinsic size. Written out whole at the end of the slug, so a
   *  half-finished run never leaves a table that disagrees with the files. */
  const table = {};
  for (const name of files) {
    if (RIVE_RE.test(name) || SVG_RE.test(name)) await copyAsIs(slug, name);
    else if (IMAGE_RE.test(name)) await convertImage(slug, name, table);
    else if (!ffmpeg) {
      console.log(`  SKIP   ${name} — no ffmpeg (set FFMPEG=/path/to/ffmpeg)`);
      warnings.push(`${slug}/${name} was not encoded: no ffmpeg`);
    } else await convertVideo(ffmpeg, slug, name, table);
  }
  // The size table, beside the content module that imports it. Sorted, so a
  // re-run of an unchanged folder produces a byte-identical file and the diff
  // stays readable.
  const sorted = Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]]));
  const json = join(ASSETS_DIR, `${slug}-assets.json`);
  await writeFile(json, `${JSON.stringify({ media: sorted }, null, 2)}\n`);
  console.log(`  → src/portfolio/projects/${slug}-assets.json  (${Object.keys(sorted).length} entries)`);
  // The card face, last: it is cut from a poster this run may have just
  // written, so it cannot be taken before the clips are.
  if (CARD_FACES[slug]) await writeCardFace(ffmpeg, slug, CARD_FACES[slug]);
}

console.log(`\n${written} written, ${skipped} up to date`);

if (warnings.length > 0) {
  console.log(`\n!!  ${warnings.length} PROBLEM${warnings.length === 1 ? '' : 'S'}  !!`);
  for (const w of warnings) console.log(`!!  ${w}`);
  console.log('');
  process.exitCode = 1;
}
