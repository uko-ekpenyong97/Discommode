/**
 * ADAPTIVE QUALITY, in real Chrome — `npm run verify:tier -- --url <origin>`
 * (a verify build or the dev server: it drives `window.__tier`). The rule is
 * src/quality.ts; the unit tests (quality.test.ts) feed it synthetic frames,
 * this feeds it a real page, with the pointer moving from the first frame.
 *
 *   fast      the screen's own rate (60 or 120), the detail view with live
 *             side cards: 14 s, never off tier 0
 *   cap       Chrome's Energy Saver forced on (Local State, battery_saver_mode
 *             3): the cadence reads 33.3 ms and the tier stays 0
 *   inject    20 ms burned in every frame: it steps within 4–6 s of the start
 *             grace, one tier per ≥ 4 s, and never back up
 *   software  --disable-gpu (SwiftShader): tier 4 at startup, the paper off
 *   pinned    ?tier=2: tier 2, pinned; the governor never moves it
 *   reduced   prefers-reduced-motion with 20 ms injected: no governor, tier 0
 *
 * `--fault`: the fast case forces a step, to show the check can fail. Every
 * page opens with `?tier=auto`: without it, a page under automation (this, the
 * other suites) keeps the governor off at tier 0.
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg('--only', 'fast,cap,inject,software,pinned,reduced').split(',');
const FAULT = argv.includes('--fault');

let failed = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
};

// `?tier=auto`: under automation the governor is otherwise off (src/quality.ts).
async function open({ battery = 0, args = [], reduced = false, hash = '#item-03', query = '?tier=auto' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tier-'));
  writeFileSync(join(dir, 'Local State'), JSON.stringify({ performance_tuning: { battery_saver_mode: { state: battery } } }));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1728, height: 1117 },
    deviceScaleFactor: 2,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    args,
  });
  const page = ctx.pages()[0];
  await page.goto(`${ORIGIN}/${query}`);
  await page.goto(`${ORIGIN}/${query}${hash}`);
  // The pointer moves from the first frame, as a person's does.
  let x = 300;
  const mover = setInterval(() => {
    x = x > 1400 ? 300 : x + 7;
    page.mouse.move(x, 520).catch(() => {});
  }, 16);
  await page.waitForFunction(() => window.__tier, null, { timeout: 20000 });
  return {
    page,
    tier: () => page.evaluate(() => ({ ...window.__tier.get(), history: window.__tier.history() })),
    close: async () => {
      clearInterval(mover);
      await ctx.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const fmt = (t) =>
  `tier ${t.tier} (${t.mode})${t.score ? `, cadence ${t.score.cadence.toFixed(1)}, busy p75 ${t.score.busyP75.toFixed(1)}/${t.score.budget.toFixed(1)}, drop ${(t.score.dropped * 100).toFixed(0)}%` : ''}; steps ${t.history.map((h) => `${h.tier}@${(h.at / 1000).toFixed(1)}s ${h.why}`).join(', ') || 'none'}`;

console.log(`tier-check: ${ORIGIN}  (load ${loadavg().map((l) => l.toFixed(1)).join(' ')})`);

if (ONLY.includes('fast')) {
  console.log('\nfast: the screen’s own rate, #item-03, 14 s');
  const s = await open();
  if (FAULT) await s.page.evaluate(() => window.__tier.force(1));
  await s.page.waitForTimeout(14000);
  const t = await s.tier();
  check(t.tier === 0 && t.history.length === 0, 'never off tier 0', fmt(t));
  await s.close();
}

if (ONLY.includes('cap')) {
  console.log('\ncap: Energy Saver forced on (30 fps), #item-03, 12 s');
  const s = await open({ battery: 3 });
  await s.page.waitForTimeout(12000);
  const t = await s.tier();
  check(t.score && Math.abs(t.score.cadence - 1000 / 30) < 0.5, 'the cadence reads 33.3 ms', fmt(t));
  check(t.tier === 0, 'and the tier stays 0', fmt(t));
  await s.close();
}

if (ONLY.includes('inject')) {
  console.log('\ninject: 20 ms burned in every frame, 18 s');
  const s = await open();
  await s.page.evaluate(() => window.__tier.inject(20));
  await s.page.waitForTimeout(18000);
  const t = await s.tier();
  const h = t.history;
  check(h.length > 0 && h[0].tier === 1 && h[0].at < 3000 + 6500 + 1500, 'steps to tier 1 within 4–6 s of the start grace', fmt(t));
  const gaps = h.slice(1).map((x, i) => x.at - h[i].at);
  check(gaps.every((g) => g >= 3900), 'one tier per ≥ 4 s', `gaps ${gaps.map((g) => (g / 1000).toFixed(1)).join(', ') || '—'} s`);
  check(h.every((x, i) => i === 0 || x.tier === h[i - 1].tier + 1), 'one tier at a time, never back up', h.map((x) => x.tier).join(' → '));
  await s.page.evaluate(() => window.__tier.inject(0));
  await s.page.waitForTimeout(5000);
  const after = await s.tier();
  // A window already slow when the load stops may still take one more step.
  check(after.tier >= t.tier, 'and it never comes back up once the load is gone', `tier ${t.tier} → ${after.tier}`);
  await s.close();
}

if (ONLY.includes('software')) {
  console.log('\nsoftware: --disable-gpu (SwiftShader)');
  const s = await open({ args: ['--disable-gpu'] });
  await s.page.waitForFunction(() => window.__tier.get().tier === 4, null, { timeout: 20000 }).catch(() => {});
  const t = await s.tier();
  check(t.tier === 4 && /software|swiftshader/i.test(t.history[0]?.why ?? ''), 'tier 4 at startup, for the renderer', fmt(t));
  const paper = await s.page.evaluate(() => document.querySelector('.detail')?.getAttribute('data-paper'));
  check(paper == null || paper === 'dom', 'the detail view keeps its DOM cards', `data-paper ${paper ?? 'unset'}`);
  await s.close();
}

if (ONLY.includes('pinned')) {
  console.log('\npinned: ?tier=2 with 20 ms injected');
  const s = await open({ query: '?tier=2' });
  await s.page.evaluate(() => window.__tier.inject(20));
  await s.page.waitForTimeout(10000);
  const t = await s.tier();
  check(t.tier === 2 && t.mode === 'pinned' && t.history.length === 1, 'tier 2, pinned, never moved', fmt(t));
  await s.close();
}

if (ONLY.includes('reduced')) {
  console.log('\nreduced: prefers-reduced-motion with 20 ms injected');
  const s = await open({ reduced: true });
  await s.page.evaluate(() => window.__tier.inject(20));
  await s.page.waitForTimeout(10000);
  const t = await s.tier();
  check(t.tier === 0 && t.mode === 'reduced', 'no governor: tier 0', fmt(t));
  await s.close();
}

console.log(failed ? `\n✗ ${failed} failed` : '\n✓ all held');
process.exit(failed ? 1 : 0);
