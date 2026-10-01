/**
 * Inside-page animations: Procreate frame stacks -> one sprite ATLAS per
 * animation, for the reader's open spreads (docs/reader.md, "Inside-page
 * animations"). The second phase of `npm run anims`; the cover's phase is
 * scripts/optimize-anims.mjs and does not know this exists.
 *
 *   ~/Discommode-pages/<issue>/anim/<id>/<Name>-<n>.png   frames, any canvas
 *   src/reader/pageAnims.ts                               where each one sits
 *
 * writes
 *
 *   public/issues/<issue>/page-anim/<id>.webp             the atlas
 *   public/issues/<issue>/page-anim/manifest.json         its geometry
 *
 * Each atlas is every frame cropped to the box all frames' drawing covers
 * together (so the frames stay registered to each other), scaled to the row's
 * placed size on the page × PAGE_ANIM_SCALE, in a near-square grid with a
 * transparent gutter (lossy WebP and a scaled `drawImage` would otherwise bleed
 * a neighbouring frame into the cell's edge). Byte-stable: no timestamp, and
 * the encoder is deterministic, so a re-run on unchanged sources writes
 * identical files.
 *
 * A folder with no `fps.json` plays at the cover's boil rate; the run lists
 * which did. The REST frame — what the page shows under reduced motion, for the
 * fade-in on a settle, and in the align tool — is the row's `rest` (the frame
 * the baked page prints), else the first frame with any drawing. It is copied
 * into the manifest; changing it rewrites the manifest, not the atlas.
 *
 * Placement is NOT written here. pageAnims.ts belongs to a person (and the
 * align tool's Copy). For every animation rebuilt, or all of them with
 * `--suggest`, the run registers the frames against the baked page
 * (scripts/page-anim-register.mjs) and prints the row it would suggest beside
 * the row in the file.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { folderOptions, loadCover, loadFrame, orderFrames, unionOf } from './cover-register.mjs';
import { rowSource, suggestRow } from './page-anim-register.mjs';
import { PAGE_ANIMS, PAGE_ANIM_ISSUE, PAGE_ANIM_SCALE, PAGE_H, PAGE_W } from '../src/reader/pageAnims.ts';

/** The cover's sprite quality. */
const QUALITY = 85;
/** The cover's boil rate (coverLife `boilFps`), for a folder with no fps.json. */
const DEFAULT_FPS = 6;
/** Transparent px between cells. */
const GUTTER = 2;
/** Scaled drawing past this far from the row's own box is reported. */
const SUGGEST_REPORT_PX = 2;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
const pad2 = (n) => String(n).padStart(2, '0');

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

/** Spread index of an inside page in a book with a cover: [2s−1, 2s]. */
export const spreadOfPage = (page) => Math.floor((page + 1) / 2);

/**
 * @param {{ sourceDir: string, outputDir: string, force: boolean, onlyId: string | null,
 *           fpsOverride: number | null, suggest: boolean }} o
 */
export async function buildPageAnims({ sourceDir, outputDir, force, onlyId, fpsOverride, suggest }) {
  const issue = PAGE_ANIM_ISSUE;
  const rows = PAGE_ANIMS.filter((r) => !onlyId || r.id === onlyId);
  if (rows.length === 0) return { built: 0 };
  const outDir = join(outputDir, issue, 'page-anim');
  await mkdir(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const previous = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"anims":{}}'));
  const anims = { ...(previous.anims ?? {}) };

  const warnings = [];
  const notes = [];
  const defaulted = [];
  const suggestions = [];
  const pageCache = new Map();
  const pageImage = async (page) => {
    if (!pageCache.has(page)) pageCache.set(page, await loadCover(join(sourceDir, issue, `${pad2(page)}.png`), PAGE_W, PAGE_H));
    return pageCache.get(page);
  };

  console.log(`\nissue ${issue} inside pages  (${rows.length} animation${rows.length === 1 ? '' : 's'}, ×${PAGE_ANIM_SCALE} of placed size)`);
  let built = 0;
  for (const row of rows) {
    const dir = join(sourceDir, issue, 'anim', row.id);
    const entries = await readdir(dir).catch(() => null);
    if (!entries) {
      warnings.push(`${row.id}: no folder at ${dir} — skipped`);
      continue;
    }
    const files = orderFrames(entries);
    if (files.length === 0) {
      warnings.push(`${row.id}: no <Name>-<n>.png frames in ${dir} — skipped`);
      continue;
    }
    const optsStat = await statOrNull(join(dir, 'fps.json'));
    if (!optsStat && fpsOverride == null) defaulted.push(row.id);
    const newest = Math.max(
      optsStat?.mtimeMs ?? 0,
      ...(await Promise.all(files.map(async (f) => (await stat(join(dir, f))).mtimeMs))),
    );
    const outAtlas = join(outDir, `${row.id}.webp`);
    const prev = await statOrNull(outAtlas);
    const prevEntry = anims[row.id];
    // The cell follows the row's width: an aligned row that grew or shrank by a
    // pixel or more rebuilds, so the sprite is never resampled at runtime by more
    // than that.
    const wantW = Math.max(1, Math.round(row.w * PAGE_ANIM_SCALE));
    const upToDate =
      !force && prev && prevEntry && prev.mtimeMs > newest && prevEntry.cellW === wantW && prevEntry.scale === PAGE_ANIM_SCALE;
    if (upToDate) {
      // `rest` is the manifest's alone: a new one needs no re-encode.
      if (row.rest != null && row.rest !== prevEntry.rest) anims[row.id] = { ...prevEntry, rest: restOf(row, prevEntry.frames, prevEntry.rest, warnings) };
      console.log(`  ${pad2(row.page)} ${row.id.padEnd(14)} ${String(prevEntry.frames).padStart(2)} frames  ${kb(prev.size).padStart(8)}   (up to date)`);
      if (suggest) suggestions.push({ row, ...(await suggestFor(row, dir, files, pageImage)) });
      continue;
    }

    const frames = [];
    for (const f of files) frames.push(await loadFrame(join(dir, f)));
    const union = unionOf(frames);
    if (!union) {
      warnings.push(`${row.id}: every frame is fully transparent — skipped`);
      continue;
    }
    const empty = frames.map((f, i) => (f.box ? null : i + 1)).filter(Boolean);
    const opts = await folderOptions(dir);
    const fps = fpsOverride ?? opts.fps ?? DEFAULT_FPS;
    const firstDrawn = frames.findIndex((f) => f.box);
    const lastDrawn = frames.length - 1 - [...frames].reverse().findIndex((f) => f.box);
    const rest = restOf(row, frames.length, opts.rest === 'last' ? lastDrawn : firstDrawn, warnings);
    if (rest !== firstDrawn && frames[rest] && !frames[rest].box) warnings.push(`${row.id}: rest ${rest} (${files[rest]}) is a fully transparent frame`);
    if (empty.length) {
      notes.push(
        `${row.id}: frame${empty.length === 1 ? '' : 's'} ${empty.join(', ')} ${empty.length === 1 ? 'is' : 'are'} fully transparent — kept in the loop; it rests on frame ${rest + 1} (${files[rest]})`,
      );
    }

    const aspect = union.w / union.h;
    const cellW = wantW;
    const cellH = Math.max(1, Math.round(cellW / aspect));
    if (cellW > union.w) notes.push(`${row.id}: placed ${cellW}px wide from a ${union.w}px drawing — upscaled`);
    const cols = Math.ceil(Math.sqrt(frames.length));
    const gridRows = Math.ceil(frames.length / cols);
    const atlasW = cols * cellW + (cols - 1) * GUTTER;
    const atlasH = gridRows * cellH + (gridRows - 1) * GUTTER;
    const cells = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const input = await sharp(f.rgba, { raw: { width: f.w, height: f.h, channels: 4 } })
        .extract({ left: union.x, top: union.y, width: union.w, height: union.h })
        .resize(cellW, cellH, { fit: 'fill' })
        .png()
        .toBuffer();
      cells.push({ input, left: (i % cols) * (cellW + GUTTER), top: Math.floor(i / cols) * (cellH + GUTTER) });
    }
    await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(cells)
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(outAtlas);
    const bytes = (await stat(outAtlas)).size;
    built++;

    anims[row.id] = {
      page: row.page,
      src: `/issues/${issue}/page-anim/${row.id}.webp`,
      frames: frames.length,
      fps,
      mode: opts.mode,
      /** Index (0-based) of the frame the page rests on. */
      rest,
      cols,
      rows: gridRows,
      cellW,
      cellH,
      gutter: GUTTER,
      atlasW,
      atlasH,
      /** The drawing's box on its canvas, source px: `aspect` is what h is
       *  locked to (pageAnims.ts rows, the align tool). */
      sourceW: union.w,
      sourceH: union.h,
      aspect: Math.round(aspect * 1e6) / 1e6,
      scale: PAGE_ANIM_SCALE,
      bytes,
    };
    console.log(
      `  ${pad2(row.page)} ${row.id.padEnd(14)} ${String(frames.length).padStart(2)} frames  ${kb(bytes).padStart(8)}   ` +
        `${cellW}x${cellH} × ${cols}x${gridRows} = ${atlasW}x${atlasH} @ ${fps}fps   rest f${rest + 1}`,
    );
    suggestions.push({ row, ...(await suggestFor(row, dir, files, pageImage, frames, union)) });
  }

  // Ordered as pageAnims.ts is, and only what it lists: a row removed there
  // drops out of the manifest.
  const ordered = {};
  for (const r of PAGE_ANIMS) if (anims[r.id]) ordered[r.id] = anims[r.id];
  await writeFile(manifestPath, `${JSON.stringify({ issue, scale: PAGE_ANIM_SCALE, anims: ordered }, null, 2)}\n`);

  // ── what a spread costs ─────────────────────────────────────────────────
  const bySpread = new Map();
  for (const r of PAGE_ANIMS) {
    const e = ordered[r.id];
    if (!e) continue;
    const s = spreadOfPage(r.page);
    const plate = await statOrNull(join(outputDir, issue, 'plates', `${pad2(r.page)}.webp`));
    const cur = bySpread.get(s) ?? { pages: new Set(), atlas: 0, plates: 0, decoded: 0, ids: [] };
    if (!cur.pages.has(r.page)) cur.plates += plate?.size ?? 0;
    cur.pages.add(r.page);
    cur.atlas += e.bytes;
    cur.decoded += e.atlasW * e.atlasH * 4;
    cur.ids.push(r.id);
    bySpread.set(s, cur);
  }
  const spreads = [...bySpread.keys()].sort((a, b) => a - b);
  const windowOf = (s) => [s - 1, s, s + 1].reduce((n, k) => n + (bySpread.get(k)?.decoded ?? 0), 0);
  console.log('\n  spread  pages   atlases   plates    total   decoded atlases, ±1 window   ids');
  let total = 0;
  for (const s of spreads) {
    const v = bySpread.get(s);
    const pages = [...v.pages].map(pad2).join('|');
    total += v.atlas + v.plates;
    console.log(
      `  ${String(s).padStart(6)}  ${pages.padEnd(6)} ${kb(v.atlas).padStart(8)} ${kb(v.plates).padStart(8)} ${kb(v.atlas + v.plates).padStart(8)}   ${mb(v.decoded).padStart(7)}, ${mb(windowOf(s)).padStart(7)}               ${v.ids.join(', ')}`,
    );
  }
  const worst = spreads.reduce((w, s) => (windowOf(s) > windowOf(w) ? s : w), spreads[0]);
  console.log(`  all ${spreads.length} spreads ${kb(total)}; worst ±1 window of decoded atlases ${mb(windowOf(worst))} (open at spread ${worst})`);
  if (!spreads.some((s) => bySpread.get(s).plates > 0)) console.log('  (plates not built yet — `npm run plates`)');

  // ── suggestions ─────────────────────────────────────────────────────────
  if (suggestions.length) {
    console.log('\n  registration against the baked page — SUGGESTED rows (pageAnims.ts is not written):');
    for (const s of suggestions) {
      const d = Math.max(Math.abs(s.row.x - s.suggested.row.x), Math.abs(s.row.y - s.suggested.row.y), Math.abs(s.row.w - s.suggested.row.w));
      const tag = s.suggested.by === 'match' ? `match  agree ${pct(s.suggested.agree)} margin ${pct(s.suggested.margin)} (rest ${s.suggested.rest}: frame ${s.suggested.rest + 1})` : `no match: ${s.suggested.reason}`;
      console.log(`  ${pad2(s.row.page)} ${s.row.id.padEnd(14)} ${tag}`);
      const restMoved = s.suggested.by === 'match' && s.suggested.rest !== (s.row.rest ?? s.suggested.rest);
      if (s.suggested.by === 'match' && (d > SUGGEST_REPORT_PX || restMoved)) console.log(`       ${rowSource(s.row.page, s.row.id, s.suggested.row)}   (${d.toFixed(1)}px from the file's)`);
      else if (s.suggested.by === 'match') console.log(`       within ${SUGGEST_REPORT_PX}px of the file's row`);
    }
  }

  if (defaulted.length) console.log(`\n  no fps.json, played at ${DEFAULT_FPS}fps (the cover's boil rate): ${defaulted.join(', ')}`);
  if (notes.length) {
    console.log(`\n  ${notes.length} note${notes.length === 1 ? '' : 's'}:`);
    for (const n of notes) console.log(`    - ${n}`);
  }
  if (warnings.length) {
    console.log(`\n!!  ${warnings.length} PROBLEM${warnings.length === 1 ? '' : 'S'} (inside pages)  !!`);
    for (const w of warnings) console.log(`!!  ${w}`);
  }
  return { built, warnings };
}

/** The row's rest frame if it names one in range, else `fallback`. */
function restOf(row, frames, fallback, warnings) {
  if (row.rest == null) return fallback;
  if (Number.isInteger(row.rest) && row.rest >= 0 && row.rest < frames) return row.rest;
  warnings.push(`${row.id}: rest ${row.rest} is not a frame (0–${frames - 1}) — resting on frame ${fallback + 1}`);
  return fallback;
}

/** Register a row's frames against its baked page, seeded from the row. */
async function suggestFor(row, dir, files, pageImage, frames = null, union = null) {
  if (!frames) {
    frames = [];
    for (const f of files) frames.push(await loadFrame(join(dir, f)));
    union = unionOf(frames);
  }
  const suggested = await suggestRow(await pageImage(row.page), frames, union, row);
  return { suggested };
}
