/**
 * THE CONTACT SHEET — the sky's eye test, as twenty-four files.
 *
 * Six conditions × four times of day, shot from the GRID (cards and HUD on, so
 * every frame also answers "does the site still read on it"), driven through
 * the dev override the EnvReadout exposes. Nothing here decides what "rain" or
 * "dusk" means: `window.__skyPreview` takes the same two arguments the
 * readout's buttons pass, so the sheet is the states you can click to and not a
 * second definition of them.
 *
 *   npm run dev              # in another shell
 *   node scripts/sky-sheet.mjs [--out docs/sky] [--png]
 *
 * WebP by default and committed, because they are the review: a PR that says
 * "fog and overcast are different states now" has to show it. `--png` writes
 * the raw captures instead, for looking at locally.
 *
 * The wait before each shutter is deliberate and it is two things. The sky
 * EASES to a new target over `skyTransitionMs`, so a capture taken too early is
 * a cross-fade between two conditions rather than either of them; and the cloud
 * deck and the fog bank are noise fields that only look like weather once they
 * have drifted a little off their t=0 arrangement.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.PV_URL ?? 'http://localhost:5173/';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/sky';
const asPng = args.includes('--png');

const CONDITIONS = ['clear', 'partly', 'cloudy', 'fog', 'rain', 'storm'];
const TIMES = ['night', 'dawn', 'noon', 'dusk'];

/** Long enough for the ease to land (tau 1500ms) and for the noise to move. */
const SETTLE_MS = 5200;

const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    // The sky is a fragment shader and the point of the sheet is what it looks
    // like — software rasterisation would draw a different picture.
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.log('  ! page error:', m.text()));

  await page.goto(URL, { waitUntil: 'networkidle' });
  // The override lives on the dev EnvReadout, which App lazy-loads.
  await page.waitForFunction(() => typeof window.__skyPreview === 'function', { timeout: 15_000 });
  // The readout and the dial dock are chrome, not sky — out of the frame.
  await page.addStyleTag({ content: '.env-readout, .dialkit-root, [class*="dialkit"] { display: none !important; }' });

  const rows = [];
  for (const condition of CONDITIONS) {
    for (const time of TIMES) {
      await page.evaluate(([c, t]) => window.__skyPreview(c, t), [condition, time]);
      await page.waitForTimeout(SETTLE_MS);
      const png = await page.screenshot();
      const name = `${condition}-${time}`;
      const file = path.join(outDir, `${name}.${asPng ? 'png' : 'webp'}`);
      await writeFile(
        file,
        asPng ? png : await sharp(png).resize({ width: 1440 }).webp({ quality: 82 }).toBuffer(),
      );
      // The mean luminance of the top band, which is the one number that says
      // "these two are not the same grey" without opening the file.
      const { data, info } = await sharp(png)
        .extract({ left: 0, top: 0, width: VIEWPORT.width * 2, height: 240 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      const luma = sum / (data.length / info.channels);
      rows.push({ condition, time, luma: Math.round(luma * 10) / 10 });
      console.log(`  ${name.padEnd(16)} zenith luma ${luma.toFixed(1)}  → ${file}`);
    }
  }

  await browser.close();

  console.log('\n  zenith luma, by condition and time of day');
  console.log(`  ${''.padEnd(9)}${TIMES.map((t) => t.padStart(8)).join('')}`);
  for (const condition of CONDITIONS) {
    const cells = TIMES.map((t) =>
      String(rows.find((r) => r.condition === condition && r.time === t).luma).padStart(8),
    );
    console.log(`  ${condition.padEnd(9)}${cells.join('')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
