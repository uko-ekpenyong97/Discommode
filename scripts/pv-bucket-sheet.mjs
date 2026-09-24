/**
 * THE BUCKET CONTACT SHEET: one section's page, laid out at every page bucket,
 * side by side at one scale.
 *
 * The page is laid out at a bucket's width and nothing in between (see
 * `src/portfolio/pageBuckets.ts`), and the claim is that each bucket is a real
 * layout: the grid, the spans, the measure and the media boxes all resolve at
 * its width, rather than one layout being stretched. A sheet of the whole page
 * at every bucket is how that is looked at, and the heights printed under each
 * one are how it is read: a page that reflowed is a different height at every
 * width.
 *
 *   npm run dev                              # in another shell
 *   node scripts/pv-bucket-sheet.mjs [--url http://localhost:5173] [--card 02] [--section 1]
 *
 * Writes `docs/portfolio-view/buckets-<card>-<section>.webp`.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
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

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const ORIGIN = arg('url', 'http://localhost:5173');
const CARD = arg('card', '02');
const SECTION = Number(arg('section', 1));
/** Every page is drawn at this fraction of its CSS size, so widths compare. */
const SCALE = 0.25;
const GAP = 24;
const LABEL_H = 56;
const OUT_DIR = fileURLToPath(new URL('../docs/portfolio-view/', import.meta.url));

const browser = await chromium.launch({ channel: 'chrome', args: CHROME_ARGS });
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();
const shots = [];

for (const bucket of PAGE.buckets) {
  // Open once to learn how long the section is at this width, then again with
  // a window tall enough that the whole of it is one viewport.
  const open = async (height) => {
    await page.setViewportSize({ width: bucket, height });
    await page.goto(`${ORIGIN}/?sheet=${bucket}-${height}#view-${CARD}/${SECTION}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
  };
  await open(1000);
  const k = SECTION - 1;
  const content = await page.evaluate((k) => Math.ceil(window.__pv.track().heights[k]), k);
  const chrome = await page.evaluate(() => innerHeight - window.__pv.pageRect().height);
  await open(content + chrome);
  const shot = await page.evaluate(async (k) => {
    // Every clip on its first frame, the way a capture is taken. The reveals
    // are already settled: a deep link settles everything in the window, and
    // the window is the whole page.
    for (const v of document.querySelectorAll('video')) {
      v.pause();
      v.currentTime = 0;
    }
    await new Promise((r) => setTimeout(r, 400));
    const r = document.querySelector(`.pv-page[data-k="${k}"]`).getBoundingClientRect();
    return {
      clip: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      bucket: window.__pv.bucket(),
    };
  }, k);
  const png = await page.screenshot({ clip: shot.clip, animations: 'disabled' });
  shots.push({ bucket, width: shot.clip.width, height: content, png });
  console.log(`  bucket ${bucket}: page ${shot.clip.width} wide, ${content} tall`);
}
await browser.close();

const tallest = Math.max(...shots.map((s) => s.height));
const W = shots.reduce((a, s) => a + Math.round(s.width * SCALE), 0) + GAP * (shots.length + 1);
const H = Math.round(tallest * SCALE) + LABEL_H + GAP * 2;
const layers = [];
let x = GAP;
for (const s of shots) {
  const w = Math.round(s.width * SCALE);
  const img = await sharp(s.png).resize({ width: w }).png().toBuffer();
  layers.push({ input: img, left: x, top: GAP + LABEL_H });
  const label =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL_H}">` +
    `<text x="0" y="22" font-family="Menlo, monospace" font-size="18" fill="#f4efe6">${s.bucket}</text>` +
    `<text x="0" y="44" font-family="Menlo, monospace" font-size="13" fill="#f4efe6" fill-opacity="0.7">` +
    `page ${s.width} × ${s.height}</text></svg>`;
  layers.push({ input: Buffer.from(label), left: x, top: GAP });
  x += w + GAP;
}
await mkdir(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}buckets-${CARD}-${String(SECTION).padStart(2, '0')}.webp`;
await sharp({ create: { width: W, height: H, channels: 3, background: '#1b2433' } })
  .composite(layers)
  .webp({ quality: 82 })
  .toFile(out);
console.log(`wrote ${out}  ${W}x${H}`);
