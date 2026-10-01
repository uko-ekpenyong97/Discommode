/**
 * `npm run covers` — each live cover's STILL (src/covers/covers.ts), into
 * public/projects/<id>/cover-still.webp. Also the tail of `npm run projects`.
 *
 * The still is the cover at t = 0, its dome at rest, with nothing behind it
 * (transparent where its ground is), drawn by the app's own renderer — so it is
 * the first frame the live cover shows, and what reduced motion, a browser
 * without WebGL, the detail neighbours and the first paint show instead.
 *
 * It is the WHOLE frame: every instance is an object-fit: cover crop of the
 * frame (the tile's 3:4, the hero's 10:13), so the still crops exactly as the
 * live cover does wherever it stands in for it. Two files:
 *
 *   cover-still.webp     900 px wide — the frame's own resolution, and
 *                        cover-ref.png's — drawn at 1800 and halved for clean
 *                        edges. ~1 MB: the particle field is noise, and noise
 *                        does not compress (AVIF was measured: 400–900 KB at
 *                        the sizes that hold up). Loaded only where it SHOWS:
 *                        the detail neighbours, reduced motion, no WebGL.
 *   cover-still-sm.webp  360 px, ~180 KB — the grid tiles' first paint, for
 *                        the few hundred ms before the live cover's first frame.
 *
 * Card 03's (drex) is drawn with its still dials — the light parked on the
 * logo, no wobble: what reduced motion shows — and at 900 px, not halved from
 * 1800: its dither is one pixel, and halving a 1800 render averages the
 * Bayer pattern away into a flat tone the live cover never shows.
 *
 * A RIVE cover's still (card 04, nosey) is its grid artboard ("Main") at its
 * first frame, no pointer, drawn by the app's own player (riveCover.ts) — a
 * vector drawing, so it is a few tens of KB, not a megabyte.
 *
 * Self-contained: starts its own Vite server and a headless Chrome, so it needs
 * no dev server running. Rendered on the GPU where there is one (Metal on a
 * Mac), SwiftShader where there is not — the same shader either way.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_W = 1800;
const OUT = [
  { file: 'cover-still.webp', width: 900, quality: 72 },
  { file: 'cover-still-sm.webp', width: 360, quality: 70 },
];
const COVERS = ['rive-site', 'drex', 'nosey'];
/** Drawn at its full still's width, not RENDER_W (above). */
const RENDER_AT = { drex: 900 };
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : COVERS;

const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}scripts/cover-still.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.stillReady, null, { timeout: 30_000 });
  for (const id of COVERS.filter((c) => ONLY.includes(c))) {
    const { w, h, b64 } = await page.evaluate(([i, wd]) => window.renderStill(i, wd), [id, RENDER_AT[id] ?? RENDER_W]);
    const raw = Buffer.from(b64, 'base64');
    for (const o of OUT) {
      const out = join(ROOT, 'public', 'projects', id, o.file);
      await mkdir(dirname(out), { recursive: true });
      const buf = await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
        .resize(o.width, null, { kernel: 'lanczos3' })
        .webp({ quality: o.quality, alphaQuality: 85, effort: 6 })
        .toBuffer();
      await writeFile(out, buf);
      const hh = Math.round((o.width * h) / w);
      console.log(`  ${id.padEnd(12)} → public/projects/${id}/${o.file.padEnd(20)} ${o.width}×${hh}  ${(buf.length / 1024).toFixed(0)} KB`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
