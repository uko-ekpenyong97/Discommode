/**
 * THE SKY'S FRAME TIME, per condition, at the biggest viewport this machine has.
 *
 * The new shader is roughly three times the cost of the four-colour field it
 * replaced — two five-octave fbm samples for the cloud deck, one for the fog
 * bank, a three-octave warp on the base gradient, and two rain layers — and all
 * of it is per pixel, so the number that matters is at a big window on a
 * retina display and not at the default one.
 *
 *   npm run dev            # in another shell
 *   node scripts/sky-perf.mjs [--width 2560] [--height 1440] [--scale 2]
 *
 * WHAT IS MEASURED is the GPU cost of one frame of sky and nothing else: the
 * engine draws sixty frames back to back, each followed by a `gl.finish()`, and
 * reports the per-frame wall time. The `finish` is the point — `drawArrays`
 * only queues the work, so timing around it on its own measures how fast this
 * thread can talk to the driver. It also costs a synchronisation the real rAF
 * loop never pays, so every figure here errs HIGH.
 *
 * `--resolution` re-runs the whole table at a `skyResolution` below 1, which is
 * the lever if a condition comes out over budget.
 */
import { chromium } from 'playwright';

const URL = process.env.PV_URL ?? 'http://localhost:5173/';
const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback;

const width = flag('--width', 2560);
const height = flag('--height', 1440);
const scale = flag('--scale', 2);
const resolution = flag('--resolution', 1);

/** Over this, the sky is eating a 120Hz frame on its own. */
const BUDGET_MS = 6;

const CASES = [
  ['clear', 'noon'],
  ['partly', 'noon'],
  ['fog', 'noon'],
  ['storm', 'noon'],
];

/** Long enough for the eased target to land before the batch is drawn. */
const SETTLE_MS = 4000;
/** Frames per condition, and how many go into one timed batch. */
const FRAMES = 600;
const BATCH = 10;

async function main() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => typeof window.__skyPreview === 'function' && typeof window.__skyBenchmark === 'function',
    { timeout: 15_000 },
  );
  if (resolution !== 1) {
    await page.evaluate((r) => window.__setConfig({ skyResolution: r }), resolution);
  }

  const { backing, renderer } = await page.evaluate(() => {
    const c = document.querySelector('canvas.sky-layer__canvas');
    return {
      backing: c ? `${c.width}×${c.height}` : 'none',
      renderer: window.__skyRenderer(),
    };
  });
  console.log(`  ${renderer}`);
  console.log(
    `  ${width}×${height} @${scale}x, skyResolution ${resolution} → backing store ${backing}\n`,
  );
  console.log(`  ${'condition'.padEnd(10)}${'mean'.padStart(8)}${'p95'.padStart(8)}${'max'.padStart(8)}   budget ${BUDGET_MS}ms`);

  let worst = 0;
  for (const [condition, time] of CASES) {
    await page.evaluate(([c, t]) => window.__skyPreview(c, t), [condition, time]);
    await page.waitForTimeout(SETTLE_MS);
    const times = await page.evaluate(
      ([n, b]) => window.__skyBenchmark(n, b),
      [FRAMES, BATCH],
    );
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];
    const max = times[times.length - 1];
    worst = Math.max(worst, p95);
    const over = p95 > BUDGET_MS ? '  ← OVER' : '';
    console.log(
      `  ${condition.padEnd(10)}${mean.toFixed(2).padStart(8)}${p95.toFixed(2).padStart(8)}` +
        `${max.toFixed(2).padStart(8)}${over}   (${times.length}×${BATCH} frames)`,
    );
  }

  await browser.close();
  console.log(
    `\n  worst p95 ${worst.toFixed(2)}ms — ${worst > BUDGET_MS ? 'OVER BUDGET' : 'inside the budget'}`,
  );
  return worst;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
