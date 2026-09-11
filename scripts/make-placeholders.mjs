/**
 * Generates the PORTFOLIO PLACEHOLDER assets — flat-colour WebPs and one test
 * MP4 — so the portfolio view's mechanics can be eye-tested before any real
 * project content exists.
 *
 * Unlike `optimize-pages` / `optimize-backgrounds`, there is no source folder
 * outside the repo: every byte here is synthesised from the tables below, so a
 * re-run reproduces the exact same files. Only the outputs are committed.
 *
 *   public/projects/0N/card.webp      grid + detail art, 2000x2600 (10:13 hero)
 *   public/projects/placeholder/*     the block media the placeholder project uses
 *
 *   npm run placeholders
 *   npm run placeholders -- --force   # rewrite files that already exist
 *
 * The MP4 needs an ffmpeg binary. It is NOT a project dependency: point FFMPEG
 * at one, or have `ffmpeg` on PATH. Without it the images are still written and
 * the video step is skipped with a note (the committed MP4 stays as it is).
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);

/** Where the generated assets go. */
const OUTPUT_DIR = fileURLToPath(new URL('../public/projects/', import.meta.url));

/** WebP quality. Flat colour compresses to nothing, so this can be generous. */
const QUALITY = 82;

/** The hero rect's ratio (see layout/hero.ts) — card art is authored at 10:13. */
const CARD_W = 2000;
const CARD_H = 2600;

const force = process.argv.includes('--force');

/** One placeholder card per portfolio project: flat colour + a large label. */
const CARDS = [
  { id: '02', bg: '#2b3a4a', ink: '#e8eef4' },
  { id: '03', bg: '#3f3348', ink: '#f1e9f6' },
  { id: '04', bg: '#2f4239', ink: '#e6f2ea' },
];

/** The block media the placeholder project points at, all solid colour. */
const MEDIA = [
  { file: 'wide.webp', w: 2000, h: 1200, bg: '#33404d', ink: '#dce6f0', label: 'IMAGE' },
  { file: 'bleed.webp', w: 2400, h: 1100, bg: '#3d3444', ink: '#ece3f2', label: 'BLEED' },
  { file: 'two-up-a.webp', w: 1000, h: 1200, bg: '#384a42', ink: '#e2efe8', label: 'A' },
  { file: 'two-up-b.webp', w: 1000, h: 1200, bg: '#4a4038', ink: '#f2e8de', label: 'B' },
  { file: 'stat-1.webp', w: 600, h: 600, bg: '#2e3b47', ink: '#dbe5ef', label: '01' },
  { file: 'stat-2.webp', w: 600, h: 600, bg: '#3a3345', ink: '#e8e0f0', label: '02' },
  { file: 'stat-3.webp', w: 600, h: 600, bg: '#33443c', ink: '#dfeee6', label: '03' },
  { file: 'stat-4.webp', w: 600, h: 600, bg: '#453a30', ink: '#f0e6da', label: '04' },
  { file: 'video-poster.webp', w: 1920, h: 1080, bg: '#22303c', ink: '#cfdde9', label: 'VIDEO' },
];

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
  const rel = 'placeholder/loop.mp4';
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
  await run(ffmpeg, [
    '-y',
    '-f', 'lavfi',
    '-i', 'gradients=s=960x540:d=4:speed=0.12:c0=0x3f6079:c1=0x8c6a46:n=2',
    '-f', 'lavfi',
    '-i', 'color=c=0xcfdde9@0.55:s=40x540:d=4,format=rgba',
    '-filter_complex', "[0][1]overlay=x='mod(t*260,1000)-40':y=0:format=auto,format=yuv420p",
    '-r', '24',
    '-t', '4',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '30',
    '-movflags', '+faststart',
    '-an',
    out,
  ]);
  console.log(`  write  ${rel}`);
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
console.log('done.');
