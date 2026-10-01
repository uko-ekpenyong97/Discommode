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
 *   --fill L            measure the chrome at chromeFillLightness L (a tuning
 *                       session's value) rather than the shipped one
 *   --step S            measure the chrome at chromeSkyStep S (0 = off)
 *   --chrome-only       skip the letterhead
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
 * AND THE CHROME. The reader's and the detail view's buttons are paper shapes
 * whose colour is the sky under them made paper (src/chrome/chromeColor.ts),
 * so each viewport also opens `#read-01/6` (a mid spread, every bar button
 * live) and `#item-01`, and for every shape on screen asks: over this sky,
 * what paper and ink does the chrome make, and is the glyph ≥ 4.5:1 on its own
 * paper — WCAG AA, chrome is not a page of reading. The twenty-four states
 * print a ratio per shape, and a `*` and a line wherever the paper had to be
 * CLAMPED off `chromeFillLightness` to hold it; the whole day is swept the
 * letterhead's way, with the sky under each shape reduced to its mean on the
 * GPU (`sweepMeans`). `src/chrome/chromeContrast.ts` is the probe.
 *
 * Nothing in here forces the live sky. The probe takes a target and reads that
 * sky out of the back buffer, so twenty-four states cost twenty-four draws and
 * no transitions — and the page on screen never changes.
 */
import { chromium } from 'playwright';

const URL = process.env.PV_URL ?? 'http://localhost:5173';
const doSweep = process.argv.includes('--sweep');
const chromeOnly = process.argv.includes('--chrome-only');
const doMd = process.argv.includes('--md');
const shipped = process.argv.includes('--shipped');
/** `--fill L`: measure the chrome at `chromeFillLightness` L instead of the
 *  shipped value — how to check a tuned value before it is pasted. */
const FILL = process.argv.includes('--fill') ? Number(process.argv[process.argv.indexOf('--fill') + 1]) : null;
/** `--step S`: measure the chrome at `chromeSkyStep` S (0 turns it off). */
const STEP = process.argv.includes('--step') ? Number(process.argv[process.argv.indexOf('--step') + 1]) : null;
const DATE = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : '2026-09-26';

/** The bar. Same one `contrastProbe.ts` and `pv-verify` use. */
const REQUIRED = 7;
/** The chrome's bar: WCAG AA (`CHROME_REQUIRED` in src/chrome/chromeDials.ts). */
const CHROME_REQUIRED = 4.5;

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

/** The views whose chrome is measured: a mid spread of the reader (every bar
 *  button live) and the detail view. */
const CHROME_VIEWS = [
  { name: 'reader', hash: '#read-01/6' },
  { name: 'detail', hash: '#item-01' },
];

const rgb = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;

/**
 * THE CHROME — every paper shape of one view, at one viewport: fill against
 * ink, per shape, for the twenty-four states and the whole day. Each shape's
 * paper is made from the mean of the sky under it (src/chrome/chromeColor.ts),
 * so what is printed is the paint the page would show over that sky; where the
 * paper had to be clamped off `chromeFillLightness` to hold 4.5:1, the clamp is
 * printed. Returns the worst ratio, the failures, and the markdown rows.
 */
async function chromeContrast(browser, viewport, view) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.log('  ! page error:', m.text()));
  await page.goto(`${URL}/${view.hash}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => typeof window.__skyStates === 'function' && typeof window.__chromeSweep === 'function',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(2500);
  if (FILL !== null) await page.evaluate((l) => window.__chromeDials.set({ chromeFillLightness: l }), FILL);
  if (STEP !== null) await page.evaluate((v) => window.__chromeDials.set({ chromeSkyStep: v }), STEP);
  const dials = await page.evaluate(() => ({ ...window.__chromeDials.dials }));
  console.log(
    `\n── the ${view.name}'s chrome, ${viewport.name} @2x — every paper shape, glyph against its own paper (bar ${CHROME_REQUIRED}:1);` +
      ` chromeFillLightness ${dials.chromeFillLightness}, chromeInkMix ${dials.chromeInkMix}, chromeSkyStep ${dials.chromeSkyStep}\n`,
  );
  const rows = await page.evaluate(() =>
    window.__skyStates().map(({ condition, time, target }) => {
      const r = window.__chromeProbe({ sky: target });
      return { condition, time, samples: r.samples };
    }),
  );
  const shapes = rows[0].samples.map((s) => s.kind);
  console.log(`  ${''.padEnd(16)}${shapes.map((k) => k.padStart(11)).join('')}    (* = paper clamped, + = sky step)`);
  const clamps = [];
  const steps = [];
  let failures = 0;
  let worst = Infinity;
  for (const r of rows) {
    const cells = r.samples.map((s) => {
      if (s.clamp) clamps.push({ state: `${r.condition} ${r.time}`, ...s });
      if (s.skyStep) steps.push({ state: `${r.condition} ${r.time}`, ...s });
      if (!s.pass) failures++;
      worst = Math.min(worst, s.ratio);
      return `${s.ratio.toFixed(2)}${s.clamp ? '*' : s.skyStep ? '+' : ' '}${s.pass ? '' : '←'}`.padStart(11);
    });
    console.log(`  ${`${r.condition} ${r.time}`.padEnd(16)}${cells.join('')}`);
  }
  // One state in full: what the paint IS, per shape.
  const noon = rows.find((r) => r.condition === 'clear' && r.time === 'noon');
  console.log(`\n  clear noon, per shape — sky under it → paper / ink`);
  for (const s of noon.samples) console.log(`    ${s.kind.padEnd(11)} ${rgb(s.sky).padEnd(18)} → ${rgb(s.fill).padEnd(18)} / ${rgb(s.ink)}   ${s.ratio.toFixed(2)}:1`);
  if (clamps.length) {
    console.log(`\n  CLAMPS (${clamps.length}) — the paper moved off chromeFillLightness to hold ${CHROME_REQUIRED}:1`);
    for (const c of clamps) console.log(`    ${c.state.padEnd(16)} ${c.kind.padEnd(11)} L ${c.clamp.from} → ${c.clamp.to}  paper ${rgb(c.fill)} ink ${rgb(c.ink)}  ${c.ratio.toFixed(2)}:1`);
  } else {
    console.log(`\n  no clamps: every shape holds ${CHROME_REQUIRED}:1 at chromeFillLightness in all 24 states`);
  }
  if (steps.length) {
    console.log(`\n  SKY STEPS (${steps.length}) — the paper moved off the sky's lightness by chromeSkyStep`);
    for (const c of steps) console.log(`    ${c.state.padEnd(16)} ${c.kind.padEnd(11)} sky L ${c.skyStep.sky}: paper ${c.skyStep.from} → ${c.skyStep.to}  gap ${c.skyGap.toFixed(3)}  ${c.ratio.toFixed(2)}:1`);
  } else {
    console.log(`  no sky steps: every shape's paper is at least chromeSkyStep from its sky in all 24 states`);
  }

  // ── the sweep ────────────────────────────────────────────────────────────
  const day = await page.evaluate(([date, asShipped]) => {
    const states = window.__skyDayStates(date);
    const res = window.__chromeSweep(states.map((s) => s.target), asShipped ? {} : undefined);
    return {
      states: states.map(({ condition, minute, moon, dayPhase, sun, target }) => ({
        condition, minute, moon, dayPhase, sun, moonAlt: target.moonAltitude,
      })),
      ...res,
    };
  }, [DATE, shipped]);
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  console.log(
    `\n  THE SWEEP — ${DATE}, every 5 min, ${day.states.length} skies × ${day.samples} samples × ${day.shapes.length} shapes` +
      ` (${day.frames}-frame wake), ${(day.ms / 1000).toFixed(1)}s on the GPU, wake dials ${shipped ? 'AS SHIPPED' : 'at their maxima'}\n`,
  );
  console.log(`  ${''.padEnd(10)}${'still'.padStart(8)}${'wake'.padStart(8)}${'clamps'.padStart(9)}${'steps'.padStart(9)}    worst at`);
  const out = [];
  const conditions = [...new Set(day.states.map((st) => st.condition))];
  for (const condition of conditions) {
    const idx = day.states.map((st, i) => (st.condition === condition ? i : -1)).filter((i) => i >= 0);
    const at = idx.reduce((a, i) => (day.ratio[i] < day.ratio[a] ? i : a));
    const st = day.states[at];
    const row = {
      condition,
      still: Math.min(...idx.map((i) => day.restRatio[i])),
      wake: day.ratio[at],
      clamps: idx.reduce((n, i) => n + day.clamps[i], 0),
      steps: idx.reduce((n, i) => n + day.steps[i], 0),
      when: `${hhmm(st.minute)} ${st.dayPhase}, sun ${st.sun.toFixed(2)}, moon ${st.moon} (${st.moonAlt.toFixed(0)}°)`,
      frame: day.frame[at],
      kind: day.kind[at],
    };
    out.push(row);
    console.log(
      `  ${condition.padEnd(10)}${row.still.toFixed(2).padStart(8)}${row.wake.toFixed(2).padStart(8)}${String(row.clamps).padStart(9)}${String(row.steps).padStart(9)}    ${row.when}` +
        `${row.frame < 0 ? ', still' : `, wake frame ${row.frame}`}, ${row.kind}${row.wake < CHROME_REQUIRED ? '   ← FAILS' : ''}`,
    );
  }
  const dayFails = day.ratio.filter((r) => r < CHROME_REQUIRED).length;
  failures += dayFails;
  const dw = out.reduce((a, r) => (r.wake < a.wake ? r : a));
  worst = Math.min(worst, dw.wake);
  console.log(`\n  sweep worst: ${dw.condition} ${dw.wake.toFixed(2)}:1 on ${dw.kind} — ${dayFails === 0 ? 'every sky passes' : `${dayFails} SKIES BELOW ${CHROME_REQUIRED}:1`}`);
  // The sky step at dusk and at night: how often it moved the paper, and the
  // closest the paper came to its sky there (after the step and the clamp).
  const totalSteps = day.steps.reduce((a, b) => a + b, 0);
  console.log(`\n  sky step: moved the paper in ${totalSteps} (sky, shape, sample)s of ${day.states.length * day.samples * day.shapes.length}`);
  for (const [band, test] of [
    ['dusk', (st) => st.dayPhase === 'setting' && st.sun > 0 && st.sun < 0.15],
    ['night', (st) => st.sun <= 0],
  ]) {
    const idx = day.states.map((st, i) => (test(st) ? i : -1)).filter((i) => i >= 0);
    const n = idx.reduce((a, i) => a + day.steps[i], 0);
    const at = idx.reduce((a, i) => (day.gap[i].gap < day.gap[a].gap ? i : a), idx[0]);
    const g = day.gap[at];
    const st = day.states[at];
    console.log(
      `    ${band.padEnd(6)} ${String(n).padStart(6)} steps over ${idx.length} skies; closest paper–sky gap ${g.gap.toFixed(3)}` +
        ` (${st.condition} ${hhmm(st.minute)}, ${g.kind}, sky ${rgb(g.color)}` +
        `${g.step ? `, stepped ${g.step.from} → ${g.step.to} off sky L ${g.step.sky}` : ', no step'})`,
    );
  }
  if (day.clampList.length) {
    console.log(`  deepest clamps in the sweep:`);
    for (const c of day.clampList.slice(0, 8)) {
      const st = day.states[c.sky];
      console.log(`    ${st.condition} ${hhmm(st.minute)}  ${c.kind.padEnd(11)} sky ${rgb(c.color).padEnd(18)} L ${c.from} → ${c.to}`);
    }
  } else {
    console.log(`  no clamps anywhere in the sweep`);
  }
  await page.close();
  return { failures, worst, md: { viewport: viewport.name, view: view.name, rows: out, worst: dw, day } };
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'],
  });

  let worstEverywhere = Infinity;
  let chromeWorst = Infinity;
  const chromeTables = [];
  let failures = 0;
  const mdTables = [];
  const t0 = Date.now();

  for (const viewport of VIEWPORTS) {
    if (!chromeOnly) {
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

    for (const view of CHROME_VIEWS) {
      const chrome = await chromeContrast(browser, viewport, view);
      failures += chrome.failures;
      chromeWorst = Math.min(chromeWorst, chrome.worst);
      chromeTables.push(chrome.md);
    }
  }

  await browser.close();
  console.log(
    `\n  ${failures === 0 ? 'ALL 24 STATES AND EVERY SWEPT SKY PASS, LETTERHEAD AND CHROME' : `${failures} STATE-RUNS BELOW THEIR BAR`}` +
      ` — letterhead ${chromeOnly ? 'skipped' : `worst anywhere ${worstEverywhere.toFixed(2)}:1 (bar ${REQUIRED})`}, chrome worst ${chromeWorst.toFixed(2)}:1 (bar ${CHROME_REQUIRED}),` +
      ` in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`,
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
  if (doMd) {
    for (const t of chromeTables) {
      console.log(`\n**Chrome, ${t.view}, ${t.viewport} @2x** — ${DATE}, ${t.day.states.length} skies × ${t.day.samples} samples × ${t.day.shapes.length} shapes\n`);
      console.log('| condition | still | with the wake | clamps | sky steps | worst at |');
      console.log('| --- | --- | --- | --- | --- | --- |');
      for (const r of t.rows) {
        console.log(`| ${r.condition} | ${r.still.toFixed(2)} | **${r.wake.toFixed(2)}** | ${r.clamps} | ${r.steps} | ${r.when}${r.frame < 0 ? ', still' : `, wake frame ${r.frame}`}, ${r.kind} |`);
      }
      console.log(`\nWorst **${t.worst.wake.toFixed(2)}:1** (${t.worst.condition}). Bar ${CHROME_REQUIRED}:1.`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
