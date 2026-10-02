/**
 * Screenshot A/B of two DEV servers — `node scripts/visual-ab.mjs --a <origin>
 * --b <origin> [--out <dir>]` — for a change that must not move a pixel.
 *
 * Every view, at 1728×1117 and 2560×1440 @2×, captured twice from A and once
 * from B: A against A is the noise floor (what the page does on its own from
 * one load to the next), A against B the change. Pinned so that floor is low:
 * the wall clock (a fixed noon), the weather (Open-Meteo blocked: the clock's
 * clear sky), the sky's drift and grain (`__skyPinTime`), the covers' clock
 * (`__covers.pin`); the pointer never enters the page.
 *
 *   grid             /?nodials
 *   detail 01–04     /?nodials#item-NN (the paper on, settled)
 *   reader           #read-01 (the cover), #read-01/6 (11|12), #read-01/21 (the back)
 *   portfolio        #view-02, #view-03, #view-04
 *
 * Captured in four quadrants (see `capture`). A pixel differs past 32 levels in any channel (the suites' tolerance); also
 * reported: past 8 levels. A diff map is written for every view whose A|B
 * difference is over its A|A floor.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const A = arg('--a');
const B = arg('--b');
const OUT = arg('--out', '.context/visual-ab');
const ONLY = arg('--only', null);
if (!A || !B) throw new Error('--a <origin> --b <origin>');
mkdirSync(OUT, { recursive: true });

const NOON = new Date('2026-10-01T20:00:00Z'); // 13:00 in San Francisco
const SIZES = [
  [1728, 1117],
  [2560, 1440],
];
const VIEWS = [
  ['grid', '/?nodials', 'grid'],
  ...['01', '02', '03', '04'].map((n) => [`detail-${n}`, `/?nodials#item-${n}`, 'detail']),
  ['reader-cover', '/?nodials#read-01', 'reader'],
  ['reader-11-12', '/?nodials#read-01/6', 'reader'],
  ['reader-back', '/?nodials#read-01/21', 'reader'],
  ...['02', '03', '04'].map((n) => [`view-${n}`, `/?nodials#view-${n}`, 'view']),
].filter(([name]) => !ONLY || ONLY.split(',').some((o) => name.startsWith(o)));

async function capture(browser, origin, [w, h], [, path, kind]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOON);
  await page.route(/open-meteo/, (r) => r.abort());
  await page.goto(`${origin}${path}`);
  await page.waitForFunction(() => typeof window.__skyPinTime === 'function' && !!window.__covers, null, { timeout: 20000 });
  await page.evaluate(() => {
    window.__skyPinTime(12);
    window.__covers.pin(3);
  });
  if (kind === 'view') {
    // The open's intro owns the position until it lands (pv-verify `settled`).
    await page.waitForFunction(() => window.__pv?.armed?.(), null, { timeout: 20000 });
    let last = null;
    for (let i = 0; i < 150; i++) {
      const now = await page.evaluate(() => ({ y: window.__pv.position(), seg: window.__pv.layout()?.segment ?? null }));
      if (last !== null && Math.abs(last - now.y) < 0.5 && now.seg === 'page') break;
      last = now.y;
      await page.waitForTimeout(60);
    }
  }
  if (kind === 'detail') {
    await page.waitForFunction(() => window.__paper?.state?.() === 'on', null, { timeout: 20000 });
  }
  // Long enough for the sky's ease, the paper's settle, a turn or a sheet's roll.
  await page.waitForTimeout(kind === 'grid' ? 3000 : 4000);
  // In four quadrants, stitched: one capture of a whole 5120 × 2880 page
  // comes back with its bottom-right unrastered (the sky through the
  // portfolio sheet) — on any build, a capture artifact, not the page.
  const qs = [];
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const clip = { x: (x * w) / 2, y: (y * h) / 2, width: w / 2, height: h / 2 };
    qs.push({ input: await page.screenshot({ type: 'png', clip }), left: x * w, top: y * h });
  }
  await ctx.close();
  return sharp({ create: { width: w * 2, height: h * 2, channels: 4, background: '#000' } }).composite(qs).png().toBuffer();
}

async function raw(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { p32: 100, p8: 100, max: 255, map: null };
  let n32 = 0;
  let n8 = 0;
  let max = 0;
  const map = Buffer.alloc(a.w * a.h);
  for (let i = 0, p = 0; i < a.data.length; i += a.ch, p++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
    if (d > 32) n32++;
    if (d > 8) n8++;
    if (d > max) max = d;
    map[p] = Math.min(255, d * 4);
  }
  const n = a.w * a.h;
  return { p32: (100 * n32) / n, p8: (100 * n8) / n, max, map };
}

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (const size of SIZES) {
  for (const v of VIEWS) {
    const a1 = await raw(await capture(browser, A, size, v));
    const a2 = await raw(await capture(browser, A, size, v));
    const bPng = await capture(browser, B, size, v);
    const b = await raw(bPng);
    const floor = diff(a1, a2);
    const ab = diff(a1, b);
    const ab2 = diff(a2, b);
    const worse = Math.min(ab.p32, ab2.p32) > floor.p32 + 0.05 || Math.min(ab.p8, ab2.p8) > floor.p8 + 0.25;
    const name = `${v[0]}@${size[0]}`;
    if (worse && ab.map) {
      await sharp(ab.map, { raw: { width: a1.w, height: a1.h, channels: 1 } }).png().toFile(join(OUT, `${name}-diff.png`));
      writeFileSync(join(OUT, `${name}-b.png`), bPng);
    }
    const row = { name, floor: { p32: floor.p32, p8: floor.p8, max: floor.max }, ab: { p32: Math.min(ab.p32, ab2.p32), p8: Math.min(ab.p8, ab2.p8), max: Math.min(ab.max, ab2.max) }, worse };
    rows.push(row);
    const f = (x) => `${x.p32.toFixed(3)}% >32, ${x.p8.toFixed(3)}% >8, max ${x.max}`;
    console.log(`${worse ? '✗' : '✓'} ${name.padEnd(20)} A|A ${f(row.floor).padEnd(40)} A|B ${f(row.ab)}`);
  }
}
await browser.close();
writeFileSync(join(OUT, 'result.json'), JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.worse);
console.log(bad.length ? `\n✗ ${bad.length} view(s) differ beyond the A|A floor: ${bad.map((r) => r.name).join(', ')}` : '\n✓ every view within the A|A floor');
process.exitCode = bad.length ? 1 : 0;
