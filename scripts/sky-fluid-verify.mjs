/**
 * THE WAKE, checked in a real browser — `npm run verify:sky`.
 *
 * The sky's fluid (`src/sky/fluid.ts`) is a field nobody can see directly, so
 * every claim about it is made in the sky's own pixels, with the shader's clock
 * PINNED (`window.__skyPinTime`) so that two captures differ only by what the
 * wake did — not by the drift, the twinkle, the grain or a lightning flash.
 *
 *   npm run dev                                  # this branch, in another shell
 *   node scripts/sky-fluid-verify.mjs [--url http://localhost:5173]
 *                                     [--before http://localhost:5174]
 *                                     [--shots docs/sky/fluid]
 *
 * WHAT IT ASSERTS
 *
 *   1  ASLEEP IS INVISIBLE. All twenty-four states, sim on, after a sweep has
 *      been put through the field and left to decay: against the same state
 *      with the fluid switched off, no more than 0.5% of pixels may differ. The
 *      field has to decay to NOTHING, and the solver has to have gone to sleep.
 *      With `--before` pointing at a dev server of the branch this came from,
 *      each state is also compared with the sky as it was — which differs, by
 *      design, in exactly one place: the night's stars are denser and brighter.
 *   2  STARS SCATTER, AND COME BACK. A pointer swept across a clear night moves
 *      at least 30% of the star pixels; within 3s they are back.
 *   3  THE FOG OPENS, AND CLOSES. A sweep through the bank opens a window at
 *      the cursor: the mean luminance of a 200px disc there drops by at least
 *      15%, and within 3s it has filled back in. ASSERTED AT NIGHT, REPORTED BY
 *      DAY — a daylit bank is only about 13% brighter than the sky behind it,
 *      so no hole in it, however clean, can take 15% off a disc at noon; the
 *      night is the state where "the bank opened" is a question light can
 *      answer. The window rides AT the cursor (the air it pushes carries it),
 *      so the disc is centred where the sweep stops, and the field is frozen
 *      there (`__skyHoldFluid`) for the capture — a screenshot is slower
 *      than the wake is.
 *   4  THE FRAME BUDGET. The whole sky, with the fluid awake and splatting
 *      every frame, at p95 ≤ 6ms — at both signed-off viewports × both DPRs,
 *      and at 2560×1440 @2x (a 5K backing store).
 *   5  REDUCED MOTION IS UNTOUCHED. A sweep changes nothing, and the field
 *      never wakes.
 *   6  THE PAGE DISTURBS THE SKY. With the POINTER's strength at 0, so that
 *      only the page can be what put anything in: the detail view's Next, a
 *      grid drag, the portfolio sheet's roll-in and the reader's doorway each
 *      wake the field on their own.
 *   7  THE GRADIENT IS PUSHED AROUND, AND SETTLES BACK. A sweep across a clear
 *      dusk — where the gradient is the whole picture, nothing painted over it
 *      — moves at least 20% of the frame by at least 8 levels on some channel,
 *      and within 3s it is back. A clear dusk is the state that asks the
 *      question: its ramp runs from a deep purple zenith to an orange horizon,
 *      so a displacement of the gradient IS a change of colour, where at noon
 *      the same push over a blue-to-pale-blue ramp would barely print.
 *
 * `--shots` writes the PR captures: the stars at rest at both sizes, the star
 * scatter mid-sweep, the gradient mid-sweep, the fog window, the deck parting,
 * the rain bending.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const URL = opt('--url', process.env.PV_URL ?? 'http://localhost:5173/');
const BEFORE = opt('--before', null);
const SHOTS = opt('--shots', null);
/** `--only 23` runs sections 2 and 3 and nothing else. */
const ONLY = opt('--only', '1234567');

const CONDITIONS = ['clear', 'partly', 'cloudy', 'fog', 'rain', 'storm'];
const TIMES = ['night', 'dawn', 'noon', 'dusk'];
const VIEWPORT = { width: 1440, height: 900 };

/** The thresholds, all in one place. */
const IDLE_PCT = 0.5;
const STAR_MOVED_PCT = 30;
const STAR_BACK_PCT = 2;
const FOG_DROP_PCT = 15;
const FOG_BACK_PCT = 2;
const GRAD_MOVED_PCT = 20;
const GRAD_BACK_PCT = 2;
/** "Moved" for a gradient pixel: this many 8-bit levels on any channel. */
const GRAD_LEVELS = 8;
const RETURN_MS = 3000;
const BUDGET_MS = 6;
/** The clock every capture is pinned to. */
const PIN_S = 3;

const HIDE = '.grid-stage, .minimap-wrap, .env-readout, [class*="dialkit"] { display: none !important; }';
const GPU = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'];

let failures = 0;
const check = (pass, label, extra = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`);
};

async function open(browser, url, { reduced = false, viewport = VIEWPORT, dpr = 2 } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('    ! page error:', m.text()));
  page.on('crash', () => console.log('    ! page crashed:', url));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__skyPreview === 'function', null, { timeout: 20_000 });
  await page.addStyleTag({ content: HIDE });
  // A comparison to the byte wants a sky that has LANDED, and the shipped ease
  // (tau 1500ms) is still 5% short of its target 4.5s in. At 150ms — what
  // reduced motion uses, which is what `--before` runs under — it has settled
  // to nothing long before any shutter here.
  await page.evaluate(() => window.__setConfig?.({ skyTransitionMs: 150 }));
  return page;
}

async function state(page, condition, time) {
  await page.evaluate(([c, t]) => window.__skyPreview(c, t), [condition, time]);
  // The ease is tau 1500ms — five of it and the cross-fade is under a level.
  await page.waitForTimeout(4500);
}

const raw = async (png) => sharp(png).raw().toBuffer({ resolveWithObject: true });
const shot = async (page) => raw(await page.screenshot());

/** Percentage of pixels with any channel different at all. */
function diffPct(a, b) {
  let n = 0;
  const c = a.info.channels;
  for (let i = 0; i < a.data.length; i += c) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return (100 * n) / (a.data.length / c);
}

const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

/** The star pixels of a clear night: well above the darkest pixel within 2px.
 *  The moon and its halo are not stars and are left out. */
function starPixels(img, moon) {
  const { data, info } = img;
  const { width: W, height: H, channels: c } = info;
  const out = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (Math.hypot(x - moon.x, y - moon.y) < moon.r) continue;
      const i = (y * W + x) * c;
      let bg = 255;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) bg = Math.min(bg, luma(data, ((y + dy) * W + x + dx) * c));
      }
      if (luma(data, i) - bg >= 30) out.push(i);
    }
  }
  return out;
}

const movedPct = (stars, a, b) =>
  (100 * stars.filter((i) => Math.abs(luma(b.data, i) - luma(a.data, i)) > 15).length) / stars.length;

/** Percentage of pixels whose worst channel moved by at least `levels`. */
function shiftedPct(a, b, levels) {
  let n = 0;
  const c = a.info.channels;
  for (let i = 0; i < a.data.length; i += c) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (d >= levels) n++;
  }
  return (100 * n) / (a.data.length / c);
}

function discLuma(img, cx, cy, r) {
  const { data, info } = img;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, cy - r); y < Math.min(info.height, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(info.width, cx + r); x++) {
      if (Math.hypot(x - cx, y - cy) > r) continue;
      sum += luma(data, (y * info.width + x) * info.channels);
      n++;
    }
  }
  return sum / n;
}

/**
 * A pointer sweep a person could make: a straight line at a steady speed, one
 * move per frame. Playwright's own `steps` fires every move inside one task,
 * which the sky would see as a single teleport.
 */
async function sweep(page, from, to, ms = 700) {
  const n = Math.round(ms / 16);
  await page.mouse.move(from[0], from[1]);
  await page.waitForTimeout(32);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    await page.mouse.move(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
    await page.waitForTimeout(16);
  }
}

/**
 * Let the wake run, UNTOUCHED, for `ms` — then one capture. Not a poll: a 2x
 * full-frame screenshot takes about a second and stalls the page's frames
 * while it does, and the solver's step is capped at 1/30s, so a page being
 * photographed continuously decays its wake in fewer, slower steps than a page
 * being looked at. Polling measured the camera; this measures the sky.
 */
async function after(page, ms) {
  await page.waitForTimeout(ms);
  return shot(page);
}

/** Poll a measurement until it passes, for up to `limit` ms; returns when. */
async function until(fn, limit = 6000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    const dt = Date.now() - t0;
    if (v.ok || dt > limit) return { ...v, ms: dt };
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function save(img, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.webp`);
  await sharp(img.data, { raw: img.info }).resize({ width: 1440 }).webp({ quality: 84 }).toFile(file);
  console.log(`    → ${file}`);
}

async function saveStars(a, b, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  const crop = { left: Math.round(a.info.width * 0.45), top: Math.round(a.info.height * 0.3), width: 1100, height: 720 };
  const tile = (img) =>
    sharp(img.data, { raw: img.info }).extract(crop).linear(2.2, 0).png().toBuffer();
  const file = path.join(SHOTS, `${name}.webp`);
  await sharp({ create: { width: crop.width * 2 + 16, height: crop.height, channels: 3, background: '#fff' } })
    .composite([
      { input: await tile(a), left: 0, top: 0 },
      { input: await tile(b), left: crop.width + 16, top: 0 },
    ])
    .webp({ quality: 90 })
    .toFile(file);
  console.log(`    → ${file}`);
}

async function main() {
  const browser = await chromium.launch({ args: GPU });
  const H = VIEWPORT.height;
  const W = VIEWPORT.width;

  // ── 1  asleep is invisible ──────────────────────────────────────────────────
  if (ONLY.includes('1')) {
    console.log('\n── 1  the field decays to nothing: 24 states, sim on vs off');
    const page = await open(browser, URL);
    const before = BEFORE ? await open(browser, BEFORE, { reduced: true }) : null;
    await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
    let worst = 0;
    let worstBefore = 0;
    const rows = [];
    for (const c of CONDITIONS) {
      for (const t of TIMES) {
        await state(page, c, t);
        await page.evaluate(() => window.__setConfig({ fluidOn: false }));
        await page.waitForTimeout(100);
        const off = await shot(page);
        await page.evaluate(() => window.__setConfig({ fluidOn: true }));
        await sweep(page, [W * 0.15, H * 0.5], [W * 0.85, H * 0.45], 500);
        // Leave it. The field has to go to sleep on its own.
        const slept = await until(async () => ({ ok: !(await page.evaluate(() => window.__skyFluidAwake())) }), 15000);
        await page.waitForTimeout(100);
        const on = await shot(page);
        const pct = diffPct(off, on);
        worst = Math.max(worst, pct);
        let vsBefore = null;
        if (before) {
          // The branch this came from, under reduced motion — its uTime is
          // pinned at 0 there, so this one is pinned at 0 for the comparison.
          await state(before, c, t);
          await page.evaluate(() => window.__skyPinTime(0));
          await page.waitForTimeout(100);
          const now0 = await shot(page);
          await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
          vsBefore = diffPct(await shot(before), now0);
          worstBefore = Math.max(worstBefore, vsBefore);
        }
        rows.push({ c, t, pct, vsBefore, sleptMs: slept.ms, slept: slept.ok });
        console.log(
          `    ${`${c}-${t}`.padEnd(14)} on vs off ${pct.toFixed(3)}%` +
            `${vsBefore === null ? '' : `   vs before ${vsBefore.toFixed(3)}%`}   asleep after ${(slept.ms / 1000).toFixed(1)}s`,
        );
      }
    }
    check(rows.every((r) => r.slept), 'the solver goes to sleep after every sweep');
    check(worst <= IDLE_PCT, `sim on, no pointer: every state within ${IDLE_PCT}% of sim off`, `worst ${worst.toFixed(3)}%`);
    if (before) {
      check(
        worstBefore <= IDLE_PCT,
        `…and within ${IDLE_PCT}% of the sky before this change — night's denser stars included`,
        `worst ${worstBefore.toFixed(3)}%`,
      );
      const nights = rows.filter((r) => r.t === 'night').map((r) => `${r.c} ${r.vsBefore.toFixed(2)}%`);
      console.log(`    nights vs before (the denser, brighter stars): ${nights.join(', ')}`);
      await before.context().close();
    }
    await page.context().close();
  }

  // ── 2  stars ────────────────────────────────────────────────────────────────
  if (ONLY.includes('2')) {
    console.log('\n── 2  a sweep across a clear night');
    const page = await open(browser, URL);
    await state(page, 'clear', 'night');
    await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
    await page.waitForTimeout(100);
    const base = await shot(page);
    // What the size dial does, at REST, before any of the wake: the same sky at
    // the one-device-pixel dot the field started as (left) and at what ships
    // (right). It is the one change here that is nothing to do with the wake,
    // so it is shot with the field asleep and the clock pinned.
    //
    // The 2 below is DEFAULTS.starSize written out — there is no getter on the
    // page to read it back from — and the rest of this section depends on it
    // being put back, so it has to track src/config.ts.
    if (SHOTS) {
      await page.evaluate(() => window.__setConfig({ starSize: 1 }));
      await page.waitForTimeout(200);
      const small = await shot(page);
      await page.evaluate(() => window.__setConfig({ starSize: 2 }));
      await page.waitForTimeout(200);
      await saveStars(small, await shot(page), 'stars-at-rest');
    }
    // The moon: (0.70, 0.80) of the viewport from the bottom-left, and its
    // halo, which the wake brightens on purpose.
    const moon = { x: 0.7 * W * 2, y: 0.2 * H * 2, r: 0.12 * H * 2 };
    const stars = starPixels(base, moon);
    await sweep(page, [W * 0.08, H * 0.55], [W * 0.92, H * 0.5], 800);
    await page.evaluate(() => window.__skyHoldFluid(true));
    const mid = await shot(page);
    await page.evaluate(() => window.__skyHoldFluid(false));
    const moved = movedPct(stars, base, mid);
    check(moved >= STAR_MOVED_PCT, `the sweep moves ≥ ${STAR_MOVED_PCT}% of the star pixels`, `${moved.toFixed(1)}% of ${stars.length}`);
    // A star is a device pixel or two, so the scatter is invisible in a
    // downscaled frame: the capture is a 1:1 crop of the sweep's far half,
    // still (left) and mid-sweep (right), brightened so the stars read.
    await saveStars(base, mid, 'stars-mid-sweep');
    const back = movedPct(stars, base, await after(page, RETURN_MS));
    check(
      back <= STAR_BACK_PCT,
      `…and they are back (≤ ${STAR_BACK_PCT}% moved) within ${RETURN_MS / 1000}s`,
      `${back.toFixed(1)}% moved at ${RETURN_MS / 1000}s`,
    );
    await page.context().close();
  }

  // ── 3  fog ──────────────────────────────────────────────────────────────────
  if (ONLY.includes('3')) console.log('\n── 3  a sweep through the fog bank');
  if (ONLY.includes('3')) for (const time of ['night', 'noon', 'dusk']) {
    const page = await open(browser, URL);
    await state(page, 'fog', time);
    await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
    await page.waitForTimeout(100);
    // A 200 CSS px disc where the sweep stops, in the body of the bank.
    const end = [W * 0.6, H * 0.6];
    const cx = end[0] * 2;
    const cy = end[1] * 2;
    const r = 100 * 2;
    const base = discLuma(await shot(page), cx, cy, r);
    await sweep(page, [W * 0.15, end[1]], end, 700);
    await page.evaluate(() => window.__skyHoldFluid(true));
    const img = await shot(page);
    const open_ = discLuma(img, cx, cy, r);
    const drop = (100 * (base - open_)) / base;
    const numbers = `${base.toFixed(1)} → ${open_.toFixed(1)}, −${drop.toFixed(1)}%`;
    if (time === 'night') {
      check(drop >= FOG_DROP_PCT, `fog-${time}: the sweep opens a window (disc luminance drops ≥ ${FOG_DROP_PCT}%)`, numbers);
    } else {
      console.log(`    fog-${time}: the window, reported (a daylit bank is ~13% over the sky behind it)  ${numbers}`);
    }
    if (time === 'noon') await save(img, 'fog-window');
    await page.evaluate(() => window.__skyHoldFluid(false));
    const back = discLuma(await after(page, RETURN_MS), cx, cy, r);
    check(
      Math.abs(back - base) / base <= FOG_BACK_PCT / 100,
      `fog-${time}: …and it fills back in (within ${FOG_BACK_PCT}%) inside ${RETURN_MS / 1000}s`,
      `${back.toFixed(1)} against ${base.toFixed(1)} at ${RETURN_MS / 1000}s`,
    );
    await page.context().close();
  }

  // The other two PR captures: the deck parting, the rain bending.
  if (SHOTS && ONLY.includes('3')) {
    for (const [c, t, name] of [
      ['cloudy', 'noon', 'cloud-parting'],
      ['rain', 'noon', 'rain-bend'],
    ]) {
      const page = await open(browser, URL);
      await state(page, c, t);
      await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
      await sweep(page, [W * 0.1, H * 0.6], [W * 0.7, H * 0.4], 700);
      await page.evaluate(() => window.__skyHoldFluid(true));
      await save(await shot(page), name);
      await page.context().close();
    }
  }

  // ── 4  frame budget ─────────────────────────────────────────────────────────
  if (ONLY.includes('4')) {
    console.log(`\n── 4  frame time, fluid awake and splatting every frame (budget p95 ${BUDGET_MS}ms)`);
    const sizes = [
      { width: 1728, height: 996, dpr: 1 },
      { width: 1728, height: 996, dpr: 2 },
      { width: 1440, height: 900, dpr: 1 },
      { width: 1440, height: 900, dpr: 2 },
      { width: 2560, height: 1440, dpr: 2 },
    ];
    let worst = 0;
    for (const s of sizes) {
      const page = await open(browser, URL, { viewport: { width: s.width, height: s.height }, dpr: s.dpr });
      const cells = [];
      for (const c of ['clear', 'partly', 'fog', 'storm']) {
        await state(page, c, 'noon');
        // THE MEDIAN OF THREE p95s. The GPU is the display's too, and one run on
        // a machine that is also indexing or compositing someone's browser has
        // come in 3ms over the next — against a 6ms line that is the difference
        // between a pass and a fail, and it is not the sky's.
        const p95 = async (fluid) => {
          const runs = [];
          for (let r = 0; r < 3; r++) {
            const t = await page.evaluate((f) => window.__skyBenchmark(600, 10, f), fluid);
            t.sort((a, b) => a - b);
            runs.push(t[Math.floor(t.length * 0.95)]);
          }
          return runs.sort((a, b) => a - b)[1];
        };
        const without = await p95(false);
        const withF = await p95(true);
        worst = Math.max(worst, withF);
        cells.push(`${c} ${without.toFixed(2)}→${withF.toFixed(2)}`);
      }
      const backing = await page.evaluate(() => {
        const el = document.querySelector('canvas.sky-layer__canvas');
        return `${el.width}×${el.height}`;
      });
      console.log(`    ${`${s.width}×${s.height} @${s.dpr}x`.padEnd(16)} ${backing.padEnd(10)} p95 ms (off→on): ${cells.join('  ')}`);
      await page.context().close();
    }
    check(worst <= BUDGET_MS, `the whole sky incl. the sim ≤ ${BUDGET_MS}ms at every size`, `worst p95 ${worst.toFixed(2)}ms`);
  }

  // ── 5  reduced motion ───────────────────────────────────────────────────────
  if (ONLY.includes('5')) console.log('\n── 5  reduced motion');
  if (ONLY.includes('5')) for (const [c, t] of [
    ['clear', 'night'],
    ['fog', 'noon'],
  ]) {
    const page = await open(browser, URL, { reduced: true });
    await state(page, c, t);
    const a = await shot(page);
    await sweep(page, [W * 0.1, H * 0.6], [W * 0.9, H * 0.5], 600);
    await page.evaluate(() => window.__skySplat(720, 450, 3000, 0, 1));
    await page.waitForTimeout(100);
    const b = await shot(page);
    const awake = await page.evaluate(() => window.__skyFluidAwake());
    const pct = diffPct(a, b);
    check(pct === 0 && !awake, `${c}-${t}: a sweep changes nothing and the field never wakes`, `${pct.toFixed(3)}% differ, awake ${awake}`);
    await page.context().close();
  }

  // ── 6  the page ─────────────────────────────────────────────────────────────
  if (ONLY.includes('6')) {
    console.log('\n── 6  the page disturbs the sky (pointer strength 0)');
    const cases = [
      ['the detail slide', '#item-02', (p) => p.keyboard.press('ArrowRight')],
      [
        'a grid drag',
        '',
        async (p) => {
          await p.mouse.move(W / 2, H / 2);
          await p.mouse.down();
          for (let i = 1; i <= 20; i++) {
            await p.mouse.move(W / 2 - i * 12, H / 2);
            await p.waitForTimeout(16);
          }
          await p.mouse.up();
        },
      ],
      ['the sheet rolling in', '#item-02', (p) => p.evaluate(() => { location.hash = '#view-02'; })],
      ['the reader doorway', '#item-01', (p) => p.click('.detail__btn--read')],
    ];
    for (const [label, hash, act] of cases) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await page.goto(`${URL.replace(/\/$/, '')}/${hash}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof window.__skyFluidAwake === 'function', null, { timeout: 20_000 });
      await page.evaluate(() => window.__setConfig({ fluidStrength: 0 }));
      await page.waitForTimeout(1500);
      const before = await page.evaluate(() => window.__skyFluidAwake());
      await act(page);
      let woke = false;
      for (let i = 0; i < 30 && !woke; i++) {
        await page.waitForTimeout(100);
        woke = await page.evaluate(() => window.__skyFluidAwake());
      }
      check(!before && woke, `${label} wakes the field`, `asleep before: ${!before}, awake after: ${woke}`);
      await context.close();
    }
  }

  // ── 7  the gradient ─────────────────────────────────────────────────────────
  if (ONLY.includes('7')) {
    console.log('\n── 7  a sweep across a clear dusk pushes the gradient itself');
    const page = await open(browser, URL);
    await state(page, 'clear', 'dusk');
    await page.evaluate((s) => window.__skyPinTime(s), PIN_S);
    await page.waitForTimeout(100);
    // A clear dusk has no deck and no bank: the gradient is the frame, edge to
    // edge, but for the sun's disc — a fraction of a percent of it, and the
    // glow is ADDED over a gradient that moves under it anyway.
    const base = await shot(page);
    // Diagonally up the screen, which is the drag the effect is for: it carries
    // the warm horizon into the zenith blue rather than along its own band.
    await sweep(page, [W * 0.12, H * 0.8], [W * 0.88, H * 0.3], 800);
    await page.evaluate(() => window.__skyHoldFluid(true));
    const mid = await shot(page);
    await page.evaluate(() => window.__skyHoldFluid(false));
    const moved = shiftedPct(base, mid, GRAD_LEVELS);
    check(
      moved >= GRAD_MOVED_PCT,
      `the sweep moves ≥ ${GRAD_MOVED_PCT}% of the gradient by ≥ ${GRAD_LEVELS} levels`,
      `${moved.toFixed(1)}%`,
    );
    await save(mid, 'gradient-mid-sweep');
    const back = shiftedPct(base, await after(page, RETURN_MS), GRAD_LEVELS);
    check(
      back <= GRAD_BACK_PCT,
      `…and it is back (≤ ${GRAD_BACK_PCT}% still shifted) within ${RETURN_MS / 1000}s`,
      `${back.toFixed(1)}% shifted at ${RETURN_MS / 1000}s`,
    );
    await page.context().close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
