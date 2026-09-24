/**
 * THE LETTERHEAD AGAINST EVERY SKY THERE IS.
 *
 * TWO PARTS. The first is the twenty-four still states below. The second, and
 * the one that decides, is THE SWEEP: every condition × every five minutes of
 * a whole day in San Francisco (so both day phases and every sun height the
 * day has), with the moon where it really is on that date AND at FORCE UP, and
 * with a hand in the sky — a synthetic swipe along the letterhead band and a
 * second one dragging the lower sky up through it, sampled every third frame
 * of the wake, with the wake's dials held at the worst the dock can set them
 * (`SWEEP_WORST_DIALS` in contrastProbe.ts). The stars are measured across a
 * whole twinkle cycle. Sky only: no page is captured, and the sky's band is
 * reduced on the GPU (`src/sky/bandSweep.ts`), which is what makes ~140,000
 * skies per viewport a matter of seconds.
 *
 *   --date YYYY-MM-DD   the day to sweep (default 2026-09-26, a full moon that
 *                       is up all night — the brightest moon there is)
 *   --md                print the worst-case table as markdown too
 *   --shipped           sweep at the SHIPPED dials instead of the worst ones
 *                       (a reading, not the check: the check is the maxima)
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
const doMd = process.argv.includes('--md');
const shipped = process.argv.includes('--shipped');
const DATE = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : '2026-09-26';

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
  const mdTables = [];
  const t0 = Date.now();

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

    // ── the sweep ────────────────────────────────────────────────────────────
    const day = await page.evaluate(([date, asShipped]) => {
      const states = window.__skyDayStates(date);
      const res = window.__pvSweep(states.map((s) => s.target), {}, asShipped ? {} : undefined);
      return {
        states: states.map(({ condition, minute, moon, dayPhase, sun, target }) => ({
          condition, minute, moon, dayPhase, sun, moonAlt: target.moonAltitude,
        })),
        ...res,
      };
    }, [DATE, shipped]);
    // A PURE WHITE band: the brightest thing any sky could put under the type,
    // and so the floor no sky can go under. Where a sky reaches it, it is tied
    // with every other sky that does, and "worst at" names the first.
    const white = await page.evaluate(() =>
      Math.min(...(window.__pvProbe({ groundColor: '#ffffff' })?.samples ?? []).filter((s) => s.surface === 'ground').map((s) => s.ratio)),
    );
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const rowsOut = [];
    console.log(
      `\n  THE SWEEP — ${DATE}, every 5 min, ${day.states.length} skies × ${day.samples} samples` +
        ` (${day.frames}-frame wake), ${(day.ms / 1000).toFixed(1)}s on the GPU` +
        `, dials ${shipped ? 'AS SHIPPED' : 'at their maxima'}\n`,
    );
    console.log(
      `  ${''.padEnd(10)}${'still'.padStart(8)}${'wake'.padStart(8)}${'real'.padStart(8)}${'forced'.padStart(8)}${'white'.padStart(8)}    worst at`,
    );
    for (const condition of conditions) {
      const idx = day.states.map((s, i) => (s.condition === condition ? i : -1)).filter((i) => i >= 0);
      const min = (f) => Math.min(...idx.filter(f).map((i) => day.ratio[i]));
      const still = Math.min(...idx.map((i) => day.restRatio[i]));
      const at = idx.reduce((a, i) => (day.ratio[i] < day.ratio[a] ? i : a));
      const s = day.states[at];
      const row = {
        condition,
        still,
        wake: day.ratio[at],
        real: min((i) => day.states[i].moon === 'real'),
        force: min((i) => day.states[i].moon === 'force'),
        when: `${hhmm(s.minute)} ${s.dayPhase}, sun ${s.sun.toFixed(2)}, moon ${s.moon} (${s.moonAlt.toFixed(0)}°)`,
        frame: day.frame[at],
        kind: day.kind[at],
        // how much of this condition's day reaches the white floor under the wake
        floor: idx.filter((i) => day.ratio[i] <= white).length / idx.length,
      };
      rowsOut.push(row);
      console.log(
        `  ${condition.padEnd(10)}${row.still.toFixed(2).padStart(8)}${row.wake.toFixed(2).padStart(8)}` +
          `${row.real.toFixed(2).padStart(8)}${row.force.toFixed(2).padStart(8)}${`${(row.floor * 100).toFixed(0)}%`.padStart(8)}    ${row.when}` +
          `${row.frame < 0 ? ', still' : `, wake frame ${row.frame}`}${row.wake < REQUIRED ? '   ← FAILS' : ''}`,
      );
    }
    const dayWorst = rowsOut.reduce((a, r) => (r.wake < a.wake ? r : a));
    const dayFails = day.ratio.filter((r) => r < REQUIRED).length;
    failures += dayFails;
    worstEverywhere = Math.min(worstEverywhere, dayWorst.wake);
    console.log(
      `\n  sweep worst: ${dayWorst.condition} ${dayWorst.wake.toFixed(2)}:1 on ${dayWorst.kind}` +
        ` — ${dayFails === 0 ? 'every sky passes' : `${dayFails} SKIES BELOW ${REQUIRED}:1`}`,
    );
    console.log(`  (a PURE WHITE band reads ${white.toFixed(2)}:1 here — the floor no sky can go under)`);
    mdTables.push({ viewport: viewport.name, rows: rowsOut, worst: dayWorst, white, day });

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
    `\n  ${failures === 0 ? 'ALL 24 STATES AND EVERY SWEPT SKY PASS' : `${failures} STATE-RUNS BELOW ${REQUIRED}:1`}` +
      ` — worst anywhere ${worstEverywhere.toFixed(2)}:1, in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`,
  );
  if (doMd) {
    for (const t of mdTables) {
      console.log(`\n**${t.viewport} @2x** — ${DATE}, ${t.day.states.length} skies × ${t.day.samples} samples\n`);
      console.log('| condition | still | with the wake | real moon | FORCE UP | skies at the white floor | worst at |');
      console.log('| --- | --- | --- | --- | --- | --- | --- |');
      for (const r of t.rows) {
        console.log(
          `| ${r.condition} | ${r.still.toFixed(2)} | **${r.wake.toFixed(2)}** | ${r.real.toFixed(2)} | ${r.force.toFixed(2)} | ${(r.floor * 100).toFixed(0)}% | ` +
            `${r.when}${r.frame < 0 ? ', still' : `, wake frame ${r.frame}`} |`,
        );
      }
      console.log(`\nGlobal worst **${t.worst.wake.toFixed(2)}:1** (${t.worst.condition}); a pure-white band is ${t.white.toFixed(2)}:1. Bar 7:1.`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
