/**
 * THE LETTERHEAD AGAINST EVERY SKY THERE IS.
 *
 * The contrast probe measures the ground against one forced worst-case sky,
 * because a bar wants one number. This is the check behind that claim: it walks
 * all twenty-four states — the same six conditions × four times of day the
 * contact sheet shoots — and reports the worst run of letterhead type in each,
 * against the same 7:1.
 *
 * IT IS ALSO WHAT CHOSE THE WORST CASE. The probe was first written to force a
 * clear noon on the reasoning that a clear noon is the brightest sky there is.
 * This script disagreed: clear noon comes out at 7.73:1 and an overcast one at
 * 6.78, because the lit top of the cloud deck clips to white. Every daylit
 * clouded state ties at that number, which makes it a ceiling rather than a
 * sample, and it is what `WORST_CASE_SKY` is now.
 *
 *   npm run dev              # in another shell
 *   node scripts/sky-contrast.mjs [--sweep]
 *
 * `--sweep` reruns the worst state across a range of `letterheadScrim`, which
 * is how the shipped value was chosen. **`groundScrim` is never the answer
 * here**: it covers the whole ground, nothing is printed on it, and paying the
 * contrast bar with it is what took the sky to 0.78 of black. If a state fails,
 * the band's own wash goes up.
 *
 * Nothing in here forces the live sky. The probe takes a target and reads that
 * sky out of the back buffer, so twenty-four states cost twenty-four draws and
 * no transitions — and the page on screen never changes.
 */
import { chromium } from 'playwright';

const URL = process.env.PV_URL ?? 'http://localhost:5173';
const doSweep = process.argv.includes('--sweep');

/** The bar. Same one `contrastProbe.ts` and `pv-verify` use. */
const REQUIRED = 7;

const SWEEP = [0.5, 0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.75];

const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

async function openView(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.log('  ! page error:', m.text()));
  await page.goto(`${URL}/#view-01`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__skyStates === 'function', { timeout: 15_000 });
  // The view has to have settled onto a page: the probe measures the live one,
  // and a pane still fading in has nothing on it to measure.
  await page.waitForTimeout(3500);
  return page;
}

/** Worst ground ratio per state, at one letterheadScrim. */
const sweepStates = (page, letterheadScrim) =>
  page.evaluate((scrim) => {
    const out = [];
    for (const { condition, time, target } of window.__skyStates()) {
      const opts = { sky: target };
      if (scrim !== null) opts.letterheadScrim = scrim;
      const report = window.__pvProbe(opts);
      const ground = (report?.samples ?? [])
        .filter((s) => s.surface === 'ground')
        .sort((a, b) => a.ratio - b.ratio);
      out.push({ condition, time, ratio: ground[0]?.ratio ?? null, kind: ground[0]?.kind ?? null });
    }
    return out;
  }, letterheadScrim);

async function main() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  });

  let worstEverywhere = Infinity;
  let failures = 0;

  for (const viewport of VIEWPORTS) {
    const page = await openView(browser, viewport);
    // Read the shipped values off the variables the look publishes, so the
    // header names what was actually measured rather than a second copy.
    const live = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        ground: s.getPropertyValue('--pv-ground-scrim').trim(),
        letterhead: s.getPropertyValue('--pv-letterhead-scrim').trim(),
      };
    });
    console.log(
      `\n── ${viewport.name} @2x — groundScrim ${live.ground}, letterheadScrim ${live.letterhead}\n`,
    );

    const rows = await sweepStates(page, null);
    const times = [...new Set(rows.map((r) => r.time))];
    const conditions = [...new Set(rows.map((r) => r.condition))];
    console.log(`  ${''.padEnd(10)}${times.map((t) => t.padStart(9)).join('')}    worst`);
    for (const condition of conditions) {
      const mine = times.map((t) => rows.find((r) => r.condition === condition && r.time === t));
      const worst = Math.min(...mine.map((r) => r.ratio));
      const cells = mine.map((r) => `${r.ratio.toFixed(2)}${r.ratio < REQUIRED ? '←' : ' '}`.padStart(9));
      console.log(`  ${condition.padEnd(10)}${cells.join('')}${worst.toFixed(2).padStart(9)}`);
    }
    const worst = rows.reduce((a, r) => (r.ratio < a.ratio ? r : a));
    failures += rows.filter((r) => r.ratio < REQUIRED).length;
    worstEverywhere = Math.min(worstEverywhere, worst.ratio);
    console.log(
      `\n  worst state: ${worst.condition} ${worst.time} — ${worst.ratio}:1 on ${worst.kind}` +
        `  (bar ${REQUIRED}:1)`,
    );

    if (doSweep) {
      console.log(`\n  letterheadScrim sweep, worst of all 24 states:`);
      for (const scrim of SWEEP) {
        const swept = await sweepStates(page, scrim);
        const w = swept.reduce((a, r) => (r.ratio < a.ratio ? r : a));
        console.log(
          `    ${scrim.toFixed(2)}  ${w.ratio.toFixed(2)}:1  ${w.condition} ${w.time}` +
            `${w.ratio < REQUIRED ? '   ← FAILS' : ''}`,
        );
      }
    }
    await page.close();
  }

  await browser.close();
  console.log(
    `\n  ${failures === 0 ? 'ALL 24 STATES PASS' : `${failures} STATE-RUNS BELOW ${REQUIRED}:1`}` +
      ` — worst anywhere ${worstEverywhere.toFixed(2)}:1\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
