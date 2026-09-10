/**
 * Procreate frame stacks -> animated WebP, registered onto the illustrated cover.
 *
 * Drop one folder per object into
 *
 *   ~/Discommode-pages/<issue>/anim/<folder>/<Object>-<n>.png
 *
 * (transparent background, any canvas size, frames ordered by the TRAILING
 * number — `-10` after `-9`, not after `-1`) plus TWO versions of the cover:
 *
 *   ~/Discommode-pages/<issue>/cover-illustrated.png  2000x2600, objects drawn
 *   ~/Discommode-pages/<issue>/cover-plate.png        2000x2600, objects HIDDEN
 *
 * The illustrated one is a build input only — it is what frames are REGISTERED
 * against, and nothing loads it at runtime. The plate is what ships, because the
 * hover layer draws its own sprites and must not have anything baked underneath.
 *
 * This writes what the app loads:
 *
 *   public/issues/<issue>/anim/<id>.webp         animated, alpha, loop forever
 *   public/issues/<issue>/anim/<id>-still.webp   FRAME 1, same crop
 *   public/issues/<issue>/cover-rest.webp        plate + every frame 1, flattened
 *   public/issues/<issue>/anim/manifest.json     geometry the hover layer reads
 *
 * plus a QC sheet BESIDE THE SOURCE, not in public/ — it is a build artefact for
 * a human to look at, not something to deploy:
 *
 *   ~/Discommode-pages/<issue>/anim/contact-sheet.png
 *
 * The INPUT is `src/reader/cover-anim-placements.json` (committed): each object's
 * `rect` in cover space, its `z`, and an optional `folder` when the on-disk name
 * differs from the id. The manifest is OUTPUT — never hand-edit it.
 *
 * Frames are placed on the cover by registering the artwork against
 * `cover-illustrated.png` rather than by trusting `rect` as a scale reference;
 * see scripts/cover-register.mjs for why. `rect` remains the HIT rectangle.
 *
 *   npm run anims                # only rebuilds objects whose PNGs are newer
 *   npm run anims -- --force
 *   npm run anims -- --only shark
 *   npm run anims -- --fps 8     # overrides every object (default 6)
 *
 * The RESTING state of the cover is frame 1 of every object, never the finished
 * illustration — several of these loops BUILD UP (the shelf of books starts
 * empty), and resting on the built state made the hover read backwards. So
 * `cover-rest.webp` is the plate with every object's frame 1 composited at its
 * displayRect: exactly what the hover layer shows at rest, pre-flattened for the
 * surfaces that do not mount the layer (the reader's flip strips, the grid→detail
 * morph, the detail neighbours). Mounting or unmounting the layer is therefore
 * invisible.
 *
 * Animated WebP is muxed by sharp itself (`join: { animated: true }`), which the
 * installed 0.35.x supports — no `img2webp` / `brew install webp` needed.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const SOURCE_DIR = join(homedir(), 'Discommode-pages');
const OUTPUT_DIR = fileURLToPath(new URL('../public/issues/', import.meta.url));
const PLACEMENTS = fileURLToPath(new URL('../src/reader/cover-anim-placements.json', import.meta.url));

/** WebP quality for the animations. */
const QUALITY = 85;
/** Frames per second when neither `fps.json` nor `--fps` says otherwise. */
const DEFAULT_FPS = 6;
/** Registration agreement below this gets a closer look (see `peakMargin`). */
const AGREE_FLOOR = 0.8;
/** ...and below this peak margin too, it is reported as an actual problem. */
const MARGIN_FLOOR = 0.15;

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const onlyId = flag('--only');
const fpsOverride = flag('--fps') ? Number(flag('--fps')) : null;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

const warnings = [];
const notes = [];

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

async function processObject(cover, issue, o, outDir) {
  const dir = join(SOURCE_DIR, issue, 'anim', o.folder ?? o.id);
  const entries = await readdir(dir).catch(() => null);
  if (!entries) {
    warnings.push(`${o.id}: no folder at ${dir} — skipped`);
    return null;
  }
  const files = orderFrames(entries);
  if (files.length === 0) {
    warnings.push(`${o.id}: no <Object>-<n>.png frames in ${dir} — skipped`);
    return null;
  }

  const outAnim = join(outDir, `${o.id}.webp`);
  const outStill = join(outDir, `${o.id}-still.webp`);
  const newest = Math.max(
    ...(await Promise.all(files.map(async (f) => (await stat(join(dir, f))).mtimeMs))),
  );
  const prev = await statOrNull(outAnim);
  const prevStill = await statOrNull(outStill);
  if (!force && prev && prevStill && prev.mtimeMs > newest) {
    return { skipped: true, id: o.id, frames: files.length, bytes: prev.size + prevStill.size };
  }

  const frames = [];
  for (const f of files) frames.push(await loadFrame(join(dir, f)));
  const drawn = frames.filter((f) => f.box);
  if (drawn.length === 0) {
    warnings.push(`${o.id}: every frame is fully transparent — skipped`);
    return null;
  }
  if (drawn.length !== frames.length) {
    notes.push(`${o.id}: ${frames.length - drawn.length} fully transparent frame(s) kept in the loop`);
  }

  const result = await registerObject(cover, frames, o.rect);
  if (!result) {
    warnings.push(`${o.id}: registration found no usable frame — skipped`);
    return null;
  }
  const { still, fit, swept, qc } = result;
  const opts = await folderOptions(dir);
  const fps = fpsOverride ?? opts.fps ?? DEFAULT_FPS;
  const mode = opts.mode;
  const delay = Math.round(1000 / fps);
  // Which frame the cover rests on. Frame 1 for almost everything — the loop
  // then animates away from what is already on the page. `rest: "last"` is for a
  // build-up that should read as finished at rest: the shelf rests full, and
  // hovering empties it and rebuilds. The crop is shared by every frame, so
  // either choice lands in exactly the same place.
  const restIndex = opts.rest === 'last' ? frames.length - 1 : 0;
  const stillBox = frames[still].box;
  // Two different stories end in a low agreement figure, and they need
  // different reactions: a flat objective means the fit is a guess, while a
  // sharp peak at a low absolute score means fine detail or occlusion held the
  // score down while the placement itself is pinned.
  if (fit.agree < AGREE_FLOOR && qc.margin < MARGIN_FLOOR) {
    warnings.push(
      `${o.id}: registration is not pinned down — agreement ${pct(fit.agree)}, peak margin only ${pct(qc.margin)}. Check it against the cover in contact-sheet.png`,
    );
  } else if (fit.agree < AGREE_FLOOR) {
    notes.push(
      `${o.id}: agreement ${pct(fit.agree)} is low but the fit is sharp (peak margin ${pct(qc.margin)}) — fine detail or occlusion by a higher-z object, not a misplacement`,
    );
  }
  if (still !== 0) {
    notes.push(
      `${o.id}: the cover carries frame ${still + 1} (${files[still]}), so that is what the transform was fitted to — the resting sprite is frame ${restIndex + 1}`,
    );
  }

  // One crop for every frame, so the still and the animation are pixel-aligned
  // by construction and the hover swap cannot jump.
  const union = unionOf(frames);
  const s = Math.min(fit.s, 1); // never upscale past the source
  const outW = Math.max(1, Math.round(union.w * s));
  const outH = Math.max(1, Math.round(union.h * s));
  // Integer origin, and the size IS the emitted sprite's size. At scale 1 the
  // sprite then draws 1:1, which is what lets `cover-rest.webp` be composited
  // from these same numbers and match what the layer paints.
  const mapped = mapBox(union, stillBox, { ...fit, s });
  const displayRect = { x: Math.round(mapped.x), y: Math.round(mapped.y), w: outW, h: outH };

  const rendered = [];
  for (const f of frames) {
    rendered.push(
      await sharp(f.rgba, { raw: { width: f.w, height: f.h, channels: 4 } })
        .extract({ left: union.x, top: union.y, width: union.w, height: union.h })
        .resize(outW, outH, { fit: 'fill' })
        .png()
        .toBuffer(),
    );
  }

  // The loop is never rotated: it always plays from frame 1. The registration
  // may well have matched a later frame — the illustrated cover carries whatever
  // frame was drawn — but that only picks the transform. What the cover RESTS on
  // is `rest`, below: frame 1 by default, so the animation starts from the image
  // already on the page and the swap is invisible.
  await sharp(rendered, { join: { animated: true } })
    .webp({
      quality: QUALITY,
      loop: mode === 'once' ? 1 : 0,
      delay: rendered.map(() => delay),
      effort: 5,
    })
    .toFile(outAnim);
  await sharp(rendered[restIndex]).webp({ quality: QUALITY }).toFile(outStill);

  const animStat = await stat(outAnim);
  const stillStat = await stat(outStill);

  return {
    id: o.id,
    frames: files.length,
    still: still + 1,
    stillFile: files[still],
    swept,
    agree: fit.agree,
    margin: qc.margin,
    scale: s,
    seedRatio: s / (o.rect.w / stillBox.w),
    outW,
    outH,
    fps,
    mode,
    restIndex,
    bytes: animStat.size + stillStat.size,
    animBytes: animStat.size,
    stillBytes: stillStat.size,
    entry: {
      id: o.id,
      z: o.z,
      src: `/issues/${issue}/anim/${o.id}.webp`,
      still: `/issues/${issue}/anim/${o.id}-still.webp`,
      displayRect: {
        x: round2(displayRect.x),
        y: round2(displayRect.y),
        w: round2(displayRect.w),
        h: round2(displayRect.h),
      },
      hitRect: { x: round2(o.rect.x), y: round2(o.rect.y), w: round2(o.rect.w), h: round2(o.rect.h) },
      frames: files.length,
      fps,
      mode,
      /** Which frame the cover rests on — `'last'` means the still and the
       *  animation's first frame differ by design. */
      restFrame: opts.rest,
      /** One pass, in ms. The leave handler waits out the remainder of this. */
      durationMs: files.length * delay,
      bytes: animStat.size,
    },
    qc: { union, stillBox, fit: { ...fit, s }, stillPath: join(dir, files[still]) },
  };
}

// ── the resting cover ─────────────────────────────────────────────────────

/**
 * `cover-rest.webp`: the plate with every object's frame 1 composited at its
 * displayRect — pixel-for-pixel what the hover layer shows at rest.
 *
 * It exists so that mounting the layer changes nothing. Surfaces that cannot
 * carry the layer (the reader's flip strips, which the engine rebuilds mid-turn;
 * the grid→detail morph; the detail neighbours) show this instead, and the
 * handover in either direction is invisible.
 *
 * The stills are read back off disk rather than kept from the encode, so a run
 * that skipped most objects still composites the right thing. Compositing order
 * is z ascending — the same order the manifest is stored in, and the same order
 * the layer paints — so the shark lands on top of the bed here too.
 *
 * The base is the SHIPPED `cover-plate.webp`, not the source PNG, and the sprites
 * are the shipped WebPs: composite the same decoded pixels the browser composites
 * and the only difference left between this file and the live layer is this
 * file's own encode. (Falls back to the PNG if `npm run pages` has not run yet,
 * which costs a little fidelity and says so.)
 */
async function buildRestCover(platePath, manifestObjects, outDir, coverW, coverH) {
  const layers = [];
  for (const o of manifestObjects) {
    const file = join(outDir, `${o.id}-still.webp`);
    let sprite = await readFile(file).catch(() => null);
    if (!sprite) {
      warnings.push(`${o.id}: ${file} missing — left out of cover-rest.webp`);
      continue;
    }
    let { x, y, w, h } = o.displayRect;
    // A displayRect can run off the cover when an animation swings outward. The
    // browser just clips it; sharp refuses, so trim the sprite to match.
    if (x < 0 || y < 0 || x + w > coverW || y + h > coverH) {
      const left = Math.max(0, -x);
      const top = Math.max(0, -y);
      const width = Math.min(w - left, coverW - Math.max(0, x));
      const height = Math.min(h - top, coverH - Math.max(0, y));
      if (width <= 0 || height <= 0) {
        warnings.push(`${o.id}: displayRect is entirely off the cover — left out of cover-rest.webp`);
        continue;
      }
      notes.push(
        `${o.id}: displayRect runs off the cover edge; clipped to ${width}x${height} for cover-rest.webp (the layer clips it the same way)`,
      );
      sprite = await sharp(sprite).extract({ left, top, width, height }).png().toBuffer();
      x = Math.max(0, x);
      y = Math.max(0, y);
    }
    layers.push({ input: sprite, left: x, top: y });
  }

  const plateWebp = join(outDir, '..', 'cover-plate.webp');
  let base = plateWebp;
  if ((await statOrNull(plateWebp)) === null) {
    base = platePath;
    warnings.push(
      `cover-plate.webp not built yet — cover-rest.webp was composited from the PNG instead. Run \`npm run pages\` then \`npm run anims\` for an exact match with the live layer.`,
    );
  }
  const restPath = join(outDir, '..', 'cover-rest.webp');
  await sharp(base).composite(layers).webp({ quality: QUALITY }).toFile(restPath);
  return { path: restPath, bytes: (await stat(restPath)).size, placed: layers.length };
}

// ── contact sheet ─────────────────────────────────────────────────────────

/** Tile width in the QC sheet; tiles are letterboxed into a square cell. */
const TILE = 460;
const SHEET_COLS = 4;

/**
 * One QC tile: the cover as it is, with every pixel of the registered still that
 * DISAGREES with the cover painted magenta. A correct registration shows the
 * artwork looking untouched, with magenta only along antialiased edges; a wrong
 * one lights up as a solid magenta ghost offset from the drawing. The blue box
 * is `hitRect` (what the pointer tests against), the green box `displayRect`
 * (where the animation is drawn, which may be larger).
 */
async function tile(coverPath, coverW, coverH, r) {
  const { qc, entry } = r;
  const d = entry.displayRect;
  const hx0 = Math.min(entry.hitRect.x, d.x);
  const hy0 = Math.min(entry.hitRect.y, d.y);
  const hx1 = Math.max(entry.hitRect.x + entry.hitRect.w, d.x + d.w);
  const hy1 = Math.max(entry.hitRect.y + entry.hitRect.h, d.y + d.h);
  const pad = Math.max(24, 0.12 * Math.max(hx1 - hx0, hy1 - hy0));
  const wx = Math.max(0, Math.round(hx0 - pad));
  const wy = Math.max(0, Math.round(hy0 - pad));
  const ww = Math.min(coverW - wx, Math.round(hx1 - hx0 + 2 * pad));
  const wh = Math.min(coverH - wy, Math.round(hy1 - hy0 + 2 * pad));

  const colour = await sharp(coverPath).extract({ left: wx, top: wy, width: ww, height: wh })
    .flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer();

  // The base is a WASHED-OUT GREY of the cover, not the cover itself: the
  // disagreement tint has to be legible over artwork of any colour, and a
  // magenta-over-colour sheet is unreadable on the pink subjects (rose bouquet,
  // cherry blossoms) where art and tint look identical. Comparison still runs
  // against the true colours in `colour`.
  const crop = Buffer.alloc(colour.length);
  for (let i = 0; i < colour.length; i += 3) {
    const lum = (colour[i] * 77 + colour[i + 1] * 150 + colour[i + 2] * 29) >> 8;
    const g = 110 + Math.round(lum * 0.52);
    crop[i] = g;
    crop[i + 1] = g;
    crop[i + 2] = g;
  }

  const { stillBox, fit, stillPath } = qc;
  const aw = Math.max(1, Math.round(stillBox.w * fit.s));
  const ah = Math.max(1, Math.round(stillBox.h * fit.s));
  const art = await sharp(stillPath)
    .extract({ left: stillBox.x, top: stillBox.y, width: stillBox.w, height: stillBox.h })
    .resize(aw, ah, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

  const ax = Math.round(fit.ox) - wx;
  const ay = Math.round(fit.oy) - wy;
  for (let y = 0; y < ah; y++) {
    const cy = ay + y;
    if (cy < 0 || cy >= wh) continue;
    for (let x = 0; x < aw; x++) {
      const cx = ax + x;
      if (cx < 0 || cx >= ww) continue;
      const ai = (y * aw + x) * 4;
      if (art[ai + 3] < 220) continue;
      const ci = (cy * ww + cx) * 3;
      const same =
        Math.abs(art[ai] - colour[ci]) < 28 &&
        Math.abs(art[ai + 1] - colour[ci + 1]) < 28 &&
        Math.abs(art[ai + 2] - colour[ci + 2]) < 28;
      if (!same) {
        crop[ci] = 255;
        crop[ci + 1] = 0;
        crop[ci + 2] = 200;
      }
    }
  }

  const boxes = `<svg xmlns="http://www.w3.org/2000/svg" width="${ww}" height="${wh}">
    <rect x="${entry.hitRect.x - wx}" y="${entry.hitRect.y - wy}" width="${entry.hitRect.w}" height="${entry.hitRect.h}" fill="none" stroke="#0af" stroke-width="2"/>
    <rect x="${d.x - wx}" y="${d.y - wy}" width="${d.w}" height="${d.h}" fill="none" stroke="#0f8" stroke-width="2" stroke-dasharray="6 4"/>
  </svg>`;
  const painted = await sharp(crop, { raw: { width: ww, height: wh, channels: 3 } })
    .composite([{ input: Buffer.from(boxes), left: 0, top: 0 }]).png().toBuffer();

  // Highlighted for a look whenever agreement is low; whether that is a real
  // problem or just fine detail is what the peak margin and the notes say.
  const flagged = r.agree < AGREE_FLOOR;
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="34">
    <rect width="${TILE}" height="34" fill="${flagged ? '#7a1030' : '#111'}"/>
    <text x="10" y="23" font-family="monospace" font-size="16" fill="#fff">${r.id}</text>
    <text x="${TILE - 10}" y="23" text-anchor="end" font-family="monospace" font-size="14" fill="${flagged ? '#ffb0c8' : '#8f8'}">${pct(r.agree)} · f${r.still}/${r.frames}${flagged ? ' · CHECK' : ''}</text>
    <text x="${TILE / 2}" y="23" text-anchor="middle" font-family="monospace" font-size="12" fill="#888">margin ${pct(r.margin)}</text>
  </svg>`;

  const inner = await sharp(painted)
    .resize(TILE, TILE - 34, { fit: 'contain', background: '#1a1a1a' }).png().toBuffer();
  return sharp({ create: { width: TILE, height: TILE, channels: 3, background: '#111' } })
    .composite([
      { input: Buffer.from(label), left: 0, top: 0 },
      { input: inner, left: 0, top: 34 },
    ])
    .png()
    .toBuffer();
}

async function contactSheet(coverPath, coverW, coverH, results, outPath) {
  const usable = results.filter((r) => r && r.qc);
  if (usable.length === 0) return null;
  const tiles = [];
  for (const r of usable) tiles.push(await tile(coverPath, coverW, coverH, r));
  const cols = Math.min(SHEET_COLS, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({
      input: t,
      left: (i % cols) * TILE,
      top: Math.floor(i / cols) * TILE,
    })))
    .png()
    .toFile(outPath);
  return (await stat(outPath)).size;
}

// ── driver ────────────────────────────────────────────────────────────────

if ((await statOrNull(SOURCE_DIR)) === null) {
  console.log(`
!!  NO PAGE SOURCE FOLDER  !!
!!  Expected the Procreate exports in: ${SOURCE_DIR}/<issue>/anim/<object>/
!!
!!  This folder lives outside the repo so a git operation can never destroy it.
!!  Nothing to do until it exists.
`);
  process.exit(0);
}

const placements = JSON.parse(await readFile(PLACEMENTS, 'utf8'));
const issue = placements.issue ?? '01';
const { coverW, coverH } = placements;
const coverPath = join(SOURCE_DIR, issue, 'cover-illustrated.png');
const platePath = join(SOURCE_DIR, issue, 'cover-plate.png');

if ((await statOrNull(coverPath)) === null) {
  console.log(`
!!  NO ILLUSTRATED COVER  !!
!!  Expected: ${coverPath}
!!
!!  Frames are registered against it, so nothing can be placed without it.
`);
  process.exit(1);
}

if ((await statOrNull(platePath)) === null) {
  console.log(`
!!  NO COVER PLATE  !!
!!  Expected: ${platePath}
!!
!!  This is the illustrated cover with all twenty animated objects HIDDEN. The
!!  hover layer draws its sprites onto it, and cover-rest.webp is built from it.
!!  Export it from the same Figma frame with those layers switched off.
`);
  process.exit(1);
}

const objects = placements.objects.filter((o) => !onlyId || o.id === onlyId);
if (objects.length === 0) {
  console.log(`No object matches --only ${onlyId}`);
  process.exit(1);
}

const outDir = join(OUTPUT_DIR, issue, 'anim');
await mkdir(outDir, { recursive: true });

console.log(`\nissue ${issue}  (${objects.length} object${objects.length === 1 ? '' : 's'}, cover ${coverW}x${coverH})`);
const cover = await loadCover(coverPath, coverW, coverH);

const results = [];
for (const o of objects) {
  const r = await processObject(cover, issue, o, outDir);
  if (!r) continue;
  results.push(r);
  if (r.skipped) {
    console.log(`  ${r.id.padEnd(12)} ${String(r.frames).padStart(2)} frames  ${kb(r.bytes).padStart(9)}   (up to date)`);
  } else {
    const seed = `${r.seedRatio.toFixed(3)}x seed`;
    console.log(
      `  ${r.id.padEnd(12)} ${String(r.frames).padStart(2)} frames  ${kb(r.bytes).padStart(9)}   ` +
        `${r.outW}x${r.outH} @ ${r.fps}fps   agree ${pct(r.agree).padStart(6)} ±${pct(r.margin).padStart(5)}   ` +
        `rest f${r.restIndex + 1}${r.mode === 'once' ? ' once' : ''}   fit f${r.still}   ${seed}` +
        `${r.agree < AGREE_FLOOR ? '   !! CHECK !!' : ''}`,
    );
  }
}

// The manifest is merged, not overwritten, so `--only` and skips keep the rest.
const manifestPath = join(outDir, 'manifest.json');
const previous = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"objects":[]}'));
const byId = new Map((previous.objects ?? []).map((e) => [e.id, e]));
for (const r of results) if (r.entry) byId.set(r.id, r.entry);

// Cover-space z order: the hover layer resolves overlaps highest-z-first, and
// paints in the same order, so the manifest is stored sorted once here.
const merged = placements.objects
  .map((o) => byId.get(o.id))
  .filter(Boolean)
  .sort((a, b) => a.z - b.z);

const rest = await buildRestCover(platePath, merged, outDir, coverW, coverH);

await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      issue,
      coverW,
      coverH,
      /** The backdrop the layer draws onto: objects hidden. */
      plate: `/issues/${issue}/cover-plate.webp`,
      /** The same thing pre-flattened, for surfaces that cannot mount the layer. */
      rest: `/issues/${issue}/cover-rest.webp`,
      generated: new Date().toISOString(),
      objects: merged,
    },
    null,
    2,
  )}\n`,
);

const sheetPath = join(SOURCE_DIR, issue, 'anim', 'contact-sheet.png');
const sheetBytes = await contactSheet(coverPath, coverW, coverH, results, sheetPath);

const totalBytes = merged.reduce((n, e) => n + e.bytes, 0);
const stillBytes = results.reduce((n, r) => n + (r.stillBytes ?? 0), 0);
console.log(`\n${results.filter((r) => !r.skipped).length} built, ${results.filter((r) => r.skipped).length} up to date`);
console.log(`manifest  ${merged.length} objects   animations ${kb(totalBytes)}${stillBytes ? ` + stills ${kb(stillBytes)}` : ''}`);
console.log(`cover-rest  plate + ${rest.placed} resting sprites   ${kb(rest.bytes)}`);
if (sheetBytes) console.log(`contact sheet  ${sheetPath}  ${kb(sheetBytes)}`);

if (notes.length > 0) {
  console.log(`\n${notes.length} note${notes.length === 1 ? '' : 's'}:`);
  for (const n of notes) console.log(`  - ${n}`);
}
if (warnings.length > 0) {
  console.log(`\n!!  ${warnings.length} PROBLEM${warnings.length === 1 ? '' : 'S'}  !!`);
  for (const w of warnings) console.log(`!!  ${w}`);
  console.log('');
}
