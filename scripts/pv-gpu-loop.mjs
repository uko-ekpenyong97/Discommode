/**
 * OPEN THE VIEW, READ IT, CLOSE IT. TWENTY TIMES, AND WATCH THE GPU PROCESS.
 *
 *   npm run dev            # in another shell
 *   node scripts/pv-gpu-loop.mjs [--cycles 20] [--project 02] [--headless]
 *
 * IT RUNS HEADED BY DEFAULT, and that is the whole point of it. Headless Chrome
 * falls back to SwiftShader here — WebGL on the CPU — and a GPU process that is
 * not driving a GPU is not the thing under test: the baseline came back just as
 * flat with every capture held, which is the answer a software rasteriser gives
 * to any question about video memory.
 *
 * This is the other half of the eviction check, and it asks a question
 * `pv-verify` cannot: that one holds the view open and counts what is resident
 * INSIDE it, and a texture map that is correctly pruned on every section change
 * still leaks if nothing lets go when the view is closed. A project view is
 * opened from a card and closed back to the grid, so "whenever the canvas is
 * collected" is a WebGL context per open — and Chrome keeps sixteen of those
 * and then drops the oldest, which is a leak that looks like a plateau.
 *
 * WHAT IS MEASURED is the GPU process's resident set, read from `ps`, which is
 * the row Chrome's own task manager calls "GPU Process". It is not a precise
 * accounting of texture bytes and is not meant to be: what is being asked is
 * whether twenty cycles end where one cycle ended, and a number that climbed by
 * a hundred megabytes on the way would answer that whatever its units.
 *
 * It samples after every cycle rather than only at the ends, because the shape
 * of the curve is the finding. A flat line with a step at cycle 16 is the
 * context limit doing the collecting for us; a straight ramp is a leak.
 */

import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const ORIGIN = arg('url', 'http://localhost:5173');
const PROJECT = arg('project', '02');
const CYCLES = Number(arg('cycles', 20));

/** Long enough for the layer's fade-out (200ms) and for the browser to have
 *  done something about the context that went with it. */
const CLOSE_MS = 700;

/** Every Chrome GPU process on the machine, by pid, with its RSS in MB. */
function gpuProcesses() {
  const out = execSync('ps -axo pid=,rss=,command=').toString();
  const found = new Map();
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m || !m[3].includes('--type=gpu-process')) continue;
    found.set(Number(m[1]), Number(m[2]) / 1024);
  }
  return found;
}

/**
 * THE GPU PROCESS THIS RUN OWNS, identified by not having existed before the
 * browser was launched.
 *
 * A developer's machine has its own Chrome open with its own GPU process, and
 * measuring that one would report a flat line for the best of reasons. Playwright
 * does not hand back a pid for a browser launched on a channel, so the honest
 * identification is the difference between the two snapshots.
 */
function gpuRssMb(before) {
  const now = gpuProcesses();
  const mine = [...now].filter(([pid]) => !before.has(pid));
  const pick = mine.length > 0 ? mine : [...now];
  return pick.length > 0 ? Math.max(...pick.map(([, mb]) => mb)) : null;
}

/** Open the view at `#view-NN`, walk every section of it, and close back to the
 *  grid. One cycle is what a reader does to a card. */
async function cycle(page) {
  await page.evaluate((p) => {
    window.location.hash = `#view-${p}`;
  }, PROJECT);
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });

  const sections = await page.evaluate(() => window.__pv.track().start.length);
  for (let k = 0; k < sections; k++) {
    await page.evaluate((k) => {
      const t = window.__pv.track();
      window.__pv.seek(t.start[k] + 1);
    }, k);
    // The window is six fetches and six decodes; waiting for it is what makes
    // the cycle a read-through rather than a flicker past one.
    await page
      .waitForFunction(() => (window.__pv.textures?.().count ?? 2) >= 2, null, { timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(80);
  }
  // `textures` is dev-only and is the thing this release added, so a build
  // without it still measures: the GPU process is the number under test, and
  // the resident count beside it is context.
  const held = await page.evaluate(() => window.__pv.textures?.() ?? { count: -1, mb: 0 });

  await page.evaluate(() => {
    window.location.hash = '';
  });
  await page.waitForFunction(() => !window.__pv, null, { timeout: 5000 });
  await page.waitForTimeout(CLOSE_MS);
  return held;
}

const existing = gpuProcesses();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.argv.includes('--headless'),
});
const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();
await page.setViewportSize({ width: 1728, height: 996 });
await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);

console.log(`\n── ${CYCLES} open/close cycles of card ${PROJECT}, at 2x ──────────────`);
const before = gpuRssMb(existing);
console.log(`      before          GPU process ${before === null ? '?' : before.toFixed(1)} MB`);

const samples = [];
for (let i = 1; i <= CYCLES; i++) {
  const held = await cycle(page);
  const mb = gpuRssMb(existing);
  samples.push(mb);
  console.log(
    `      cycle ${String(i).padStart(2)}  ${held.count} captures resident at close ` +
      `(${held.mb.toFixed(1)} MB)  GPU process ${mb === null ? '?' : mb.toFixed(1)} MB`,
  );
}

const after = samples[samples.length - 1];
const first = samples[0];
console.log(
  `\n      first cycle ${first.toFixed(1)} MB → last cycle ${after.toFixed(1)} MB  ` +
    `(${after - first >= 0 ? '+' : ''}${(after - first).toFixed(1)} MB over ${CYCLES - 1} cycles)`,
);
console.log(`      worst ${Math.max(...samples).toFixed(1)} MB, best ${Math.min(...samples).toFixed(1)} MB`);

await browser.close();
