/**
 * The live covers, in Chrome. `npm run verify:cover` with the dev server running
 * (`npm run dev`; `--url <origin>` for another — in a worktree, always pass it:
 * :5173 is usually another checkout's). `--only budgets,clock,morph,reduced,
 * nogl,contexts,sky,ground` for a subset. See docs/covers.md.
 *
 *   drag      the grid dragged, flung and dropped at 1728×1117 and 2560×1440
 *             @2×: no canvas resized while dragging or settling, no blank or
 *             flickering tile, every tile at rest agreeing with its siblings,
 *             card 02 warmed and dragged staying sharp and rejoining them, no
 *             frame over 33 ms (judged on a production build, `vite
 *             preview`), and a morph and a slide resizing no canvas twice
 *             (scripts/cover-drag-checks.mjs). `--drag-json <file>` writes
 *             its rows, for a main-vs-branch table.
 *
 *   budgets   GPU ms per frame at 1728×996 and 1440×900, 1× and 2×, measured
 *             exactly as the tuning bench measured when these budgets were set
 *             (src/covers/bench.ts): batches closed by a pixel read, minus the
 *             same batches of the FLOOR — two do-nothing passes into the same
 *             targets. The floor is printed beside each figure, and so is the
 *             total, which is what the GPU actually spends:
 *               hero        the paper's draw of the hero           ≤ 1.0
 *               tile        each tile's own cost — its copy of the
 *                           shared draw (drawImage)                ≤ 0.15
 *               total       the worst frame of cover work: in the grid,
 *                           the shared draw + the hovered tile's
 *                           own + a copy for every visible tile (at
 *                           least 4); in the detail view, the hero  ≤ 1.2
 *             The hovered tile's own draw and the hero are benched WARM —
 *             under the pointer, card 02's lava warmth full on (bench.ts,
 *             `benchDome`) — which is what they draw while hovered.
 *               sky+covers  the sky's own benchmark (fluid awake, p95)
 *                           + that total                            ≤ 8
 *             The shared draw (one per frame for every tile at rest) is
 *             printed too: it is the tile's cost if you read "each tile" as
 *             "a tile drawn on its own", which this design never does.
 *   clock     the clock pinned: the focused grid tile and the hero, each in
 *             its own view, cropped to the part of the frame both show — the
 *             same moment, ≤ 2% of pixels differ. Compared blurred (σ 2 at
 *             300 px across): the tile draws the dot field at 3 frame units a
 *             pixel (1×) and the hero at 1.4, so their speckle aliases
 *             differently at the SAME moment; the letters, the lenses and the
 *             marquee do not. A control — the hero a second later — has to fail.
 *   morph     grid → detail from the tile: the morph card held on its last
 *             frame against the detail's DOM hero it hands to, ≤ 2%.
 *   reduced   prefers-reduced-motion: the tiles and the hero show the still (no
 *             cover canvas, the paper draws no cover), and nothing moves in 1s.
 *   nogl      no WebGL at all: the tiles show the still.
 *   contexts  WebGL contexts on the page: main has the sky's in the grid and
 *             the paper's in the detail view; covers add ONE (the stage), never
 *             one per tile. The paper's is made by the idle warm-up after load
 *             (src/warmup.ts), so the grid can have it too: it is counted
 *             apart (its canvas is `.detail__paper`), and never more than one.
 *   sky       the cover's ground over the sky at NOON and at NIGHT: mean
 *             luminance differs by > 20% (the sky is really through it).
 *   ground    nothing between the hero's transparent ground and the sky, with
 *             the paper's effects ON (every other hero check runs them at 0):
 *             at a clear NOON, the hero's pixels where the cover's alpha is
 *             ≈ 0 against the same pixels with the cover hidden — mean
 *             difference ≤ 1% of full scale, and ≤ 1% of them past 32 levels.
 *             The tuned cover HAS no transparent ground (its riso paper stock
 *             is 0.439 opaque everywhere), so the check draws it with
 *             `riso4.paperOpacity` 0 — ink on nothing — and measures the
 *             alpha on the page (over black, then white). A control, the same
 *             pixels with the stock back at 0.439, has to fail.
 *
 * CARD 02's LAVA (docs/covers.md, "Card 02's lava"), on the real path: the
 * clock running and the pointer moving from the first frame, through the
 * browser, at the tile's and the hero's on-screen positions:
 *
 *   lmove     the marquee held, a tile and the hero 2 s apart: > 3% of pixels
 *             moved; the control (riseSpeed and wobble 0) < 1%; and at one
 *             moment some blobs rise while others sink.
 *   lpointer  the dots' dome off. Hovered: the warmth is full, the blobs near
 *             the pointer are drawn toward it (away, with the sign) and run
 *             ahead of the shared timeline; warm against the same moment at
 *             rest (the clock pinned before the pointer arrives), > 3% near
 *             the pointer and < 1% beyond two radii, and < 0.5% with strength 0;
 *             leaving, every frame: no jump, back on the shared draw within
 *             150 frames. The same on the hero under the paper.
 *   lsweep    1728×996 @2×: the pointer swept through every card-02 tile on
 *             screen in ~1 s; the most of them drawn for themselves in one
 *             frame ≤ 2 (the cap), and that frame's cover work (the shared
 *             draw + that many warm draws + 4 copies, benched) ≤ 1.25 — its
 *             own budget, from production-build runs (docs/perf/lsweep.md).
 *
 * CARD 04, the Rive cover (nosey: "Main" in the grid, "Main Bounce" as the
 * hero; docs/covers.md "Rive covers"). The Rive players advance by the cover
 * clock's delta, so a pinned clock holds them still, and `__covers.rive.reset`
 * makes the next draw of each a fresh instance at its artboard's first frame;
 * `step` below walks the pinned clock a frame at a time, so two runs of the
 * same steps are the same run (Main Bounce's physics has no randomness):
 *
 *   rbudgets  main-thread ms per frame of ALL card-04 cover work — the grid's
 *             one shared draw of Main plus every visible tile's copy, the
 *             hovered tile's pointer driving it; the hero's draw of Main Bounce
 *             plus the paper's texture upload, the pointer moving over it —
 *             p95 of the frames ≤ 2.0 (at hero size 2× the one that matters);
 *             a timed batch of draws beside it (the frame numbers are read off
 *             a 0.1 ms clock). Sky + fluid (p95) + covers ≤ 8.
 *   rswap     the swap: grid → detail from the focused tile, the morph held on
 *             its last frame (Main, the grid's instance) against the DOM hero
 *             it lands on (Main Bounce, fresh) — the rest frames agree, ≤ 2%;
 *             a control, the hero a second of bounce later, has to fail. Then
 *             the DOM hero → the paper, ≤ 2% (the morph's whole hand-off).
 *             Also riveSwapAt 'start', where the morph card is the hero.
 *   rpointer  the REAL pointer path, as a person uses it: the clock never
 *             pinned, the pointer moving from the first frame (a moving
 *             pointer is input, and input is what held the file's import back
 *             for 20.8 s), mouse events dispatched through the browser at the
 *             on-screen position of the focused grid tile and then of the hero
 *             (opened by clicking the tile), with the tile's hover overlay
 *             left in place (made transparent, still hit-testable):
 *               - the file is imported ≤ 1.1 s after its bytes are ready;
 *               - the instance receives the events, in artboard space: the view
 *                 model's ptrX/ptrY (MainPlay mirrors them) match the on-screen
 *                 point mapped through the instance's crop, ± 2 units;
 *               - a character tracks: a tracking flag or lookX differs between
 *                 the pointer at 12% and at 88% across;
 *               - the tile's pixels move with the pointer: left vs right more
 *                 than 3× the tile's own idle animation over the same time.
 *             The hero is checked again 2 s and 5 s after landing (both
 *             routes), the pointer sweeping it: still advancing, still
 *             uploaded to the plane, still receiving the pointer, a character
 *             tracking it within each window, the same instance, the hero's
 *             pixels still moving (> 0.5% past 32 levels).
 *             It fails on each way this path broke or could: the old 10 s idle
 *             deadline ("never loaded"), events kept from the cover (ptrX/ptrY
 *             stay 0), and the tile-only listener (an exit over the CTA).
 *   rclick    the cover is hover-only: the pointer moved onto the headset
 *             Nosey's cup, against the same second with no pointer — its
 *             colour is another one (the file's "Headset.Pointer.Enter" fires
 *             its Click trigger). And a click on the hero opens the project,
 *             #view-04, as on every portfolio card.
 *   rreduced  reduced motion: card 04's tiles and hero are the still, the
 *             runtime is never loaded, nothing moves in 1s.
 *   rsky      a patch of Main's empty ground over NOON and NIGHT: > 20% apart.
 *   rground   as `ground`, on card 04's hero (most of it IS ground: no stock);
 *             the control is coverBackdrop 'solid', which has to fail.
 *   rcontexts WebGL contexts with card 04 live, grid and #item-04: the same
 *             bounds as `contexts`, and none of them made by the Rive runtime.
 *
 * `sky`, `ground`, `rsky` and `rground` are about the sky THROUGH a cover's
 * ground. A cover whose own `coverBackdrop` is 'solid' (card 04: its artboards
 * are filled) has no sky through it by design, so they are SKIPPED for it —
 * printed as skipped, not failed — and run again the day it is 'sky'
 * (docs/covers.md, "Transparency, and the backdrop").
 *
 * Pixel checks hide the sky and the dev overlays, as verify:detail does, except
 * `sky`, which is about the sky. A pixel differs past 32 levels (verify:detail's
 * tolerance).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { checkDrag } from './cover-drag-checks.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg(
  '--only',
  'budgets,clock,morph,reduced,nogl,contexts,sky,ground,lmove,lpointer,lsweep,rbudgets,rswap,rpointer,rclick,rreduced,rsky,rground,rcontexts,' +
    'dcompile,dref,dcache,dpointer,dmorph,dreduced,dbudgets,drag',
).split(',');
const B = `${ORIGIN}/`;
const GPU = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const VIEWPORTS = [
  { width: 1728, height: 996 },
  { width: 1440, height: 900 },
];
const TOL = 32;
const BUDGET = { hero: 1.0, tile: 0.15, total: 1.2, all: 8 };
/**
 * `lsweep`'s worst grid frame, ms: its own budget, re-baselined on production
 * builds (2026-10-04, docs/perf/lsweep.md). 46 runs of the sweep — alone on a
 * quiet machine, alone at a load average of 14–16, and inside a full run —
 * measured 0.670–1.095 ms, p95 1.020; the budget is that p95 plus ~20% (the
 * bench reads 1.2–1.6× its quiet value on a loaded machine). It was
 * `BUDGET.total` (1.2), the design budget for the grid's cover work, which the
 * sweep's benches overran only on the dev server or a busy machine. What the
 * sweep is FOR — the cap on tiles drawn for themselves — is asserted on its
 * own (`LSWEEP_OWN_MAX`), not left to the timing.
 */
const LSWEEP_BUDGET = 1.25;
/** coverStage.ts's MAX_OWN_TILES: at most this many card-02 grid tiles drawn for themselves in a frame. */
const LSWEEP_OWN_MAX = 2;
/** Main's WebGL contexts: the sky's (grid), plus the paper's (detail view —
 *  and, since the idle warm-up, the grid's too once it has run; counted apart). */
const MAIN_CONTEXTS = { grid: 1, detail: 2 };
const FRAME = { w: 900, h: 1326 };
/** Card 04's: Main and Main Bounce. */
const RFRAME = { w: 1000, h: 1300 };
/** All card-04 cover work, main-thread ms per frame. */
const RIVE_BUDGET = 2.0;
/** Noseyhead in Main Bounce: its origin is the view model's headsetX/Y, at 1.2;
 *  its head centre and ear cup from there (BouncePlay's body, Main's still). */
const HEADSET = { w: 296 * 1.2, h: 225 * 1.2, head: { x: 175, y: 153 }, cup: { x: 271, y: 180 } };

let failures = 0;
let skipped = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const skip = (label, extra) => {
  skipped++;
  console.log(`  – ${label}  skipped: ${extra}`);
};
const pct = (x) => `${(100 * x).toFixed(2)}%`;
const ms = (x) => `${x.toFixed(3)}ms`;

/**
 * "Nothing moves": two screenshots of the same still, a second apart. Bytes
 * that changed by MORE than one level are motion; a byte one level off is the
 * compositor re-rasterising the same still image (the grid's cover stills were
 * redrawn ~2 s after a load in about 1 run in 8, every changed byte exactly
 * ±1 — docs/perf/flaky-checks.md). Both are reported.
 */
function stillDiff(a, b) {
  let moved = 0;
  let lsb = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > 1) moved++;
    else if (d === 1) lsb++;
  }
  return { moved, note: `${moved} bytes changed over 1s${lsb ? ` (and ${lsb} by one level: a re-raster)` : ''}` };
}

const errors = [];
async function newPage(browser, viewport, dpr = 1, extra = {}, init = null) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, ...extra });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}

const quiet = (page) =>
  page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.sky-layer, .env-readout, .dialkit-root, .frame-hud, .minimap-wrap { visibility: hidden !important; }';
    document.head.append(st);
  });

/** Take the grid cards' own CSS (tilt, focus scale, dim, fade) off, so a tile
 *  shows exactly what the cover drew. */
const flatGrid = (page) =>
  page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent =
      '.grid-plane__tilt, .grid-card__transform { transform: none !important; }' +
      '.grid-card__fade { opacity: 1 !important; } .grid-card__face { filter: none !important; box-shadow: none !important; }';
    document.head.append(st);
  });

const frames = (page, n = 3) =>
  page.evaluate(
    (n) =>
      new Promise((res) => {
        let k = 0;
        const f = () => (++k >= n ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

/** The grid, card 02 focused (one ArrowRight from 01), no pointer ever moved. */
async function gridOn02(page) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__covers && window.__covers.frames() > 3, null, { timeout: 20000 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200);
}

/** The focused cover tile's rect, CSS px. */
const focusedTile = (page) =>
  page.evaluate(() => {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    let best = null;
    for (const el of document.querySelectorAll('.grid-card .cover-tile[data-cover]')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
      if (!best || d < best.d) best = { d, x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return best;
  });

async function heroOn02(page, { settle = true } = {}) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.goto(`${B}#item-02`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  if (settle) await page.waitForFunction(() => window.__paper.presence() >= 1, null, { timeout: 5000 });
}

const heroRect = (page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const [x, y, w, h] = ['--hero-x', '--hero-y', '--hero-w', '--hero-h'].map((k) => parseFloat(s.getPropertyValue(k)));
    return { x, y, w, h };
  });

/** `r` (CSS px) out of a screenshot, as raw RGB at `ow × oh`; `blur` σ after. */
async function grab(page, r, dpr, ow, oh, cropFrame = null, blur = 0) {
  const png = await page.screenshot();
  let img = sharp(png).extract({
    left: Math.round(r.x * dpr) + 2,
    top: Math.round(r.y * dpr) + 2,
    width: Math.round(r.w * dpr) - 4,
    height: Math.round(r.h * dpr) - 4,
  });
  if (cropFrame) {
    // `cropFrame` = the part of THIS instance's crop to keep, as fractions.
    const buf = await img.png().toBuffer();
    const meta = await sharp(buf).metadata();
    img = sharp(buf).extract({
      left: Math.round(cropFrame.u0 * meta.width),
      top: Math.round(cropFrame.v0 * meta.height),
      width: Math.round((cropFrame.u1 - cropFrame.u0) * meta.width),
      height: Math.round((cropFrame.v1 - cropFrame.v0) * meta.height),
    });
  }
  let out = img.resize(ow, oh, { fit: 'fill' }).removeAlpha();
  if (blur) out = sharp(await out.png().toBuffer()).blur(blur).removeAlpha();
  return out.raw().toBuffer();
}

function diff(a, b) {
  let d = 0;
  const n = a.length / 3;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > TOL) d++;
  }
  return d / n;
}

/** The object-fit: cover crop of the frame for a box of this aspect. */
function cropOf(aspect) {
  const img = FRAME.w / FRAME.h;
  if (img > aspect) {
    const w = FRAME.h * aspect;
    return { x0: (FRAME.w - w) / 2, y0: 0, w, h: FRAME.h };
  }
  const h = FRAME.w / aspect;
  return { x0: 0, y0: (FRAME.h - h) / 2, w: FRAME.w, h };
}

/** Each cover's own backdrop, 'sky' or 'solid', as the app has it. */
let backdrops = null;
async function coverBackdrops(browser) {
  if (!backdrops) {
    const page = await newPage(browser, VIEWPORTS[0], 1);
    await page.goto(B, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__covers?.backdrop, null, { timeout: 20000 });
    backdrops = await page.evaluate(() => ({ 'rive-site': window.__covers.backdrop('rive-site'), nosey: window.__covers.backdrop('nosey') }));
    await page.context().close();
  }
  return backdrops;
}

/** Skip a sky-through check for a cover whose backdrop is 'solid'; true if so. */
async function skipSolid(browser, id, labels) {
  if ((await coverBackdrops(browser))[id] !== 'solid') return false;
  for (const label of labels) skip(label, `${id}'s coverBackdrop is 'solid': an opaque ground of its own, no sky through it`);
  return true;
}

// ── budgets ─────────────────────────────────────────────────────────────

/** `--budget-viewports 1728x1117,2560x1440` and `--budget-dpr 2`: budgets
 *  somewhere else than the suite's own viewports (an A/B, say). */
const BUDGET_VIEWPORTS = arg('--budget-viewports', null)?.split(',').map((s) => ({ width: Number(s.split('x')[0]), height: Number(s.split('x')[1]) })) ?? VIEWPORTS;
const BUDGET_DPRS = arg('--budget-dpr', null)?.split(',').map(Number) ?? [1, 2];

async function checkBudgets(browser) {
  console.log('\nbudgets: GPU ms per frame (M1 Max numbers in docs/covers.md)');
  for (const vp of BUDGET_VIEWPORTS) {
    for (const dpr of BUDGET_DPRS) {
      const page = await newPage(browser, vp, dpr);
      await gridOn02(page);
      const pres = await page.evaluate(() => window.__covers.presenters().filter((p) => p.visible && p.cover === 'rive-site'));
      const big = pres.reduce((a, p) => (p.pxW > a.pxW ? p : a), { pxW: 0, pxH: 0, drawW: 0, drawH: 0 });
      // A grid tile's cover is RENDERED at its capped size (coverRenderMax,
      // docs/covers.md), and its canvas's backing store is that size too — CSS
      // stretches it over the tile — so the draw and the copy are both benched
      // at the render size.
      const drawW = big.drawW || big.pxW;
      const drawH = big.drawH || big.pxH;
      const sharedCost = await page.evaluate(([w, h]) => window.__covers.benchStage('rive-site', w, h), [drawW, drawH]);
      const shared = sharedCost.ms;
      const copy = await page.evaluate(([w, h]) => window.__covers.benchPresent(w, h), [drawW, drawH]);
      // Hovered: the tile under the pointer is drawn again, for itself, at its
      // size, warm (the lava under the pointer).
      const hovered = (await page.evaluate(([w, h]) => window.__covers.benchStage('rive-site', w, h, true), [drawW, drawH])).ms;
      // At least four tiles' copies: the grid shows 3–4 of card 02 at these
      // viewports, and the budget is held at 4.
      const tiles = Math.max(4, pres.length);
      const gridTotal = shared + hovered + tiles * copy;
      const sky = await page.evaluate(() => {
        const t = window.__skyBenchmark?.(300, 10, true) ?? [];
        t.sort((a, b) => a - b);
        return t.length ? t[Math.floor(t.length * 0.95)] : NaN;
      });
      await heroOn02(page);
      await page.mouse.move(3, 3);
      const hero = await page.evaluate(() => window.__paper.benchCover(undefined, true));
      const detailTotal = hero ? hero.ms : NaN;
      const total = Math.max(gridTotal, detailTotal);
      const tag = `${vp.width}×${vp.height} @${dpr}×`;
      check(hero && hero.ms <= BUDGET.hero, `${tag} hero`, `${hero ? `${hero.pxW}×${hero.pxH} ${ms(hero.ms)} (+ floor ${ms(hero.floor)} = ${ms(hero.total)})` : 'no hero draw'} ≤ ${BUDGET.hero}`);
      check(copy <= BUDGET.tile, `${tag} tile`, `${pres.length} visible, each ${ms(copy)} (copy ${drawW}×${drawH}, shown at ${big.pxW}×${big.pxH}) ≤ ${BUDGET.tile}; the shared draw ${drawW}×${drawH} ${ms(shared)} (+ floor ${ms(sharedCost.floor)})`);
      check(total <= BUDGET.total, `${tag} total`, `grid ${ms(gridTotal)} (shared + hovered ${ms(hovered)} warm + ${tiles} copies; ${pres.length} visible), detail ${ms(detailTotal)} warm ≤ ${BUDGET.total}`);
      check(sky + total <= BUDGET.all, `${tag} sky+fluid+covers`, `${ms(sky)} + ${ms(total)} = ${ms(sky + total)} ≤ ${BUDGET.all}`);
      await page.context().close();
    }
  }
}

// ── clock ───────────────────────────────────────────────────────────────

async function checkClock(browser) {
  console.log('\nclock: the focused tile and the hero, the clock pinned, the frame both show');
  const T = 7.25;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn02(page);
    await quiet(page);
    await flatGrid(page);
    await page.evaluate((t) => window.__covers.pin(t), T);
    await frames(page, 4);
    const tr = await focusedTile(page);
    // The hero's crop is the 10:13 part of the frame; the tile's is 3:4, and
    // taller: keep the hero's rows out of it.
    const tc = cropOf(tr.w / tr.h);
    const hc = cropOf(10 / 13);
    const band = { u0: 0, u1: 1, v0: (hc.y0 - tc.y0) / tc.h, v1: (hc.y0 + hc.h - tc.y0) / tc.h };
    const tile = await grab(page, tr, dpr, 300, 390, band, 2);
    await heroOn02(page);
    await quiet(page);
    await page.evaluate((t) => {
      window.__covers.pin(t);
      window.__paper.override({ zero: true });
    }, T);
    await frames(page, 4);
    const hr = await heroRect(page);
    const hero = await grab(page, hr, dpr, 300, 390, null, 2);
    const d = diff(tile, hero);
    await page.evaluate((t) => window.__covers.pin(t + 1), T);
    await frames(page, 4);
    const later = await grab(page, hr, dpr, 300, 390, null, 2);
    const dc = diff(tile, later);
    check(d <= 0.02 && dc > 0.02, `@${dpr}× tile ↔ hero at t = ${T}s`, `${pct(d)} of pixels differ ≤ 2% (control, the hero 1s later: ${pct(dc)})`);
    await page.context().close();
  }
}

// ── morph ───────────────────────────────────────────────────────────────

async function checkMorph(browser, { gridOn = gridOn02, label = '' } = {}) {
  if (!label) console.log('\nmorph: grid → detail from the tile, the last morph frame vs the DOM hero');
  const T = 4.5;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn(page);
    await quiet(page);
    await page.evaluate((t) => {
      window.__covers.pin(t);
      window.__paper.set?.({ paper: 'off' }); // not mounted yet; set again below
    }, T).catch(() => {});
    const tr = await focusedTile(page);
    // The travel is a few hundred ms: freeze it the moment the morph mounts, a
    // hair short of its end, from inside the page — a poll from here can miss it.
    await page.evaluate(() => {
      window.__morphHeld = false;
      const mo = new MutationObserver(() => {
        if (!document.querySelector('.detail-morph')) return;
        mo.disconnect();
        requestAnimationFrame(() => {
          for (const a of document.getAnimations()) {
            const d = a.effect?.getTiming().duration;
            if (typeof d === 'number') {
              a.pause();
              a.currentTime = d - 1;
            }
          }
          window.__morphHeld = true;
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    await page.mouse.move(tr.x + tr.w / 2, tr.y + tr.h * 0.62, { steps: 5 });
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => window.__morphHeld, null, { timeout: 5000 });
    await page.mouse.move(3, 3);
    await page.waitForTimeout(1500); // the hero's dome back to rest
    // …and card 02's lava warmth, which the clicked tile handed to the morph
    // card (the hero's dome): settled, so both ends show the rest
    await page.waitForFunction(() => window.__covers.lava?.warmth('hero')?.settled !== false, null, { timeout: 5000 });
    const hr = await heroRect(page);
    const morph = await grab(page, hr, dpr, 300, 390);
    await page.evaluate(() => {
      window.__paper?.set({ paper: 'off' }); // hold the DOM hero: this is the hand-off it lands on
      for (const a of document.getAnimations()) a.play();
    });
    await page.waitForFunction(() => !document.querySelector('.detail-morph') && document.querySelector('.detail[data-phase="active"]'), null, { timeout: 5000 });
    await page.evaluate(() => window.__paper.set({ paper: 'off' }));
    await frames(page, 6);
    const dom = await grab(page, hr, dpr, 300, 390);
    const d = diff(morph, dom);
    // Card 03's still is a 1-px Bayer dither: the morph card and the DOM hero
    // are the same print through two resamplers, and off whole pixels its moiré
    // moves (the light, the logo and the wordmark in register). 0.32–0.40% at
    // the old hero (555.7 × 722.4); 4.86–5.69% at the bigger one (599.0 ×
    // 778.7, 2026-10-05, every run). Held to the worst + 1 point.
    const budget = label.trim() === 'drex' ? 0.067 : 0.02;
    check(d <= budget, `${label}@${dpr}× morph → DOM hero`, `${pct(d)} of pixels differ ≤ ${budget * 100}%`);
    // …and the DOM hero hands to the paper as an identity (verify:detail's step
    // does this at every size; once here for the chain).
    await page.evaluate(() => {
      window.__paper.set({ paper: 'on' });
    });
    await page.waitForFunction(() => window.__paper.state() === 'on', null, { timeout: 10000 });
    await page.evaluate(() => window.__paper.override({ zero: true }));
    await frames(page, 4);
    const paper = await grab(page, hr, dpr, 300, 390);
    const d2 = diff(dom, paper);
    check(d2 <= 0.02, `${label}@${dpr}× DOM hero → paper`, `${pct(d2)} of pixels differ ≤ 2%`);
    await page.context().close();
  }
}

// ── reduced motion ──────────────────────────────────────────────────────

async function checkReduced(browser) {
  console.log('\nreduced motion: the still, and nothing moves');
  const page = await newPage(browser, VIEWPORTS[0], 2, { reducedMotion: 'reduce' });
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const grid = await page.evaluate(() => ({
    canvases: document.querySelectorAll('.cover-tile__canvas').length,
    stills: [...document.querySelectorAll('.cover-tile__still')].filter((i) => i.complete && i.naturalWidth > 0).length,
  }));
  await quiet(page);
  const a = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const b = await sharp(await page.screenshot()).raw().toBuffer();
  const g = stillDiff(a, b);
  check(grid.canvases === 0 && grid.stills > 0 && g.moved === 0, 'grid', `${grid.stills} tiles on the still, ${grid.canvases} cover canvases, ${g.note}`);
  await heroOn02(page, { settle: false });
  await quiet(page);
  await page.waitForTimeout(500);
  const drawn = await page.evaluate(() => window.__paper.coversDrawn());
  const c = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const d = await sharp(await page.screenshot()).raw().toBuffer();
  const h = stillDiff(c, d);
  check(drawn === 0 && h.moved === 0, 'detail hero', `paper drew the live cover ${drawn} times (0 = the still), ${h.note}`);
  await page.context().close();
}

// ── card 02's lava ──────────────────────────────────────────────────────

/** Move the pointer in small circles for `ms` around (x, y), CSS px — a
 *  person's pointer is never still. */
async function circle(page, x, y, ms, r = 10) {
  const n = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < n; i++) {
    const a = (i / 18) * Math.PI * 2;
    await page.mouse.move(x + Math.cos(a) * r, y + Math.sin(a) * r);
    await page.waitForTimeout(16);
  }
}

/** The share of pixels past TOL between two grabs of `w × h`, where `keep`(x, y) holds. */
function diffWhere(a, b, w, h, keep) {
  let d = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!keep(x, y)) continue;
      n++;
      const i = (y * w + x) * 3;
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > TOL) d++;
    }
  }
  return { d: n ? d / n : 0, n };
}

/** Frame (fx, fy) in a grab of `w × h` of an instance of aspect `aspect`. */
function frameToGrab(fx, fy, aspect, w, h) {
  const c = cropOf(aspect);
  return [((fx - c.x0) / c.w) * w, ((fy - c.y0) / c.h) * h];
}

/** How far, on average, the blobs near the pointer are drawn TOWARD it (frame
 *  units; negative: away): an instance against itself without the pull — the
 *  same extra phase — so the speed-up's travel along the path is not counted. */
const pullOf = (page, which) =>
  page.evaluate((which) => {
    const L = window.__covers.lava;
    const t = window.__covers.time();
    const w = L.warmth(which);
    if (!w) return { pull: 0, heat: 0, extra: 0 };
    const a = L.blobs(which, t, false);
    const b = L.blobs(which, t);
    const r = window.__covers.dials('rive-site').lava.cursorRadius;
    let sum = 0;
    let n = 0;
    a.forEach((p, i) => {
      const d0 = Math.hypot(p[0] - w.px, p[1] - w.py);
      if (d0 > r || d0 < 1) return;
      sum += d0 - Math.hypot(b[i][0] - w.px, b[i][1] - w.py);
      n++;
    });
    return { pull: n ? sum / n : 0, n, heat: w.heat, extra: w.extra };
  }, which);

const OVERLAY_OFF = (page) =>
  page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.card-overlay, .grid-card__overlay { opacity: 0 !important; }';
    document.head.append(st);
  });

async function checkLavaMove(browser) {
  console.log('\nlava move: the blobs move by themselves over 2 s, the clock running (the marquee held)');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn02(page);
    await quiet(page);
    await flatGrid(page);
    const tr = await focusedTile(page);
    const run = async (rect, w, h, lava) => {
      await page.evaluate((lava) => {
        window.__covers.patchDials('rive-site', null);
        window.__covers.patchDials('rive-site', { base: { marqueePx: 0 }, lava });
      }, lava);
      await circle(page, 12, 12, 300); // the pointer moving, off the cards
      const a = await grab(page, rect, dpr, w, h);
      await circle(page, 12, 12, 2000);
      const b = await grab(page, rect, dpr, w, h);
      return diff(a, b);
    };
    const moved = await run(tr, 300, 400, {});
    // never in sync: at this moment some blobs rise and others sink
    const sync = await page.evaluate(() => {
      const L = window.__covers.lava;
      const t = window.__covers.time();
      const a = L.blobs('rest', t);
      const b = L.blobs('rest', t + 0.5);
      let up = 0;
      let down = 0;
      a.forEach((p, i) => (b[i][1] < p[1] - 0.01 ? up++ : b[i][1] > p[1] + 0.01 ? down++ : 0));
      return { up, down, n: a.length };
    });
    const held = await run(tr, 300, 400, { riseSpeed: 0, wobble: 0 });
    check(
      moved > 0.03 && held < 0.01 && sync.up > 0 && sync.down > 0,
      `@${dpr}× grid tile`,
      `${pct(moved)} of pixels moved in 2 s (> 3%); control, riseSpeed and wobble 0: ${pct(held)} (< 1%); of ${sync.n} blobs ${sync.up} rising, ${sync.down} sinking`,
    );
    await heroOn02(page);
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    const hr = await heroRect(page);
    const hmoved = await run(hr, 300, 390, {});
    const hheld = await run(hr, 300, 390, { riseSpeed: 0, wobble: 0 });
    const under = await page.evaluate(() => window.__paper.state());
    check(under === 'on' && hmoved > 0.03 && hheld < 0.01, `@${dpr}× detail hero (paper ${under})`, `${pct(hmoved)} moved in 2 s (> 3%); control ${pct(hheld)} (< 1%)`);
    await page.context().close();
  }
}

/** Beyond two cursor radii, the share of pixels a warm instance may differ
 *  from its rest: the swell and the pull stop at one radius. (`warmVsRest` pins
 *  the clock before the pointer arrives, so no blob is sped up along its path:
 *  with the clock running, a sped-up blob carried 1.0–1.8% of the hero's
 *  pixels past two radii at `riseSpeed` 78. The speed-up is checked apart.) */
const FAR = 0.01;

async function checkLavaPointer(browser) {
  console.log('\nlava pointer: the blobs near a moving pointer react — swell, drift, speed up — and ease back when it leaves');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn02(page);
    await quiet(page);
    await flatGrid(page);
    await OVERLAY_OFF(page);
    // the dots' own dome off, so the lava is all that differs; the sign
    // 'toward' unless a patch says otherwise (the default is the JSON's)
    const patch = (lava) =>
      page.evaluate((lava) => {
        window.__covers.patchDials('rive-site', null);
        window.__covers.patchDials('rive-site', { dots3: { dome: { strength: 0, scale: 0 } }, lava: { cursorSign: 'toward', ...lava } });
      }, lava);
    await patch({});
    const tr = await focusedTile(page);
    const at = { x: tr.x + tr.w * 0.32, y: tr.y + tr.h * 0.32 };
    // the pointer moves from the first frame, the clock running; no waiting for anything
    await circle(page, at.x, at.y, 1500);
    const hov = await page.evaluate(
      (tr) => window.__covers.presenters().findIndex((p) => p.visible && p.cover === 'rive-site' && p.domed && Math.abs(p.rect.x - tr.x) < 2 && Math.abs(p.rect.y - tr.y) < 2),
      tr,
    );
    if (hov < 0) {
      bad(`@${dpr}× grid tile`, 'the hovered tile is not drawn for itself (no dome up)');
      await page.context().close();
      continue;
    }
    const toward = await pullOf(page, hov);
    await patch({ cursorSign: 'away' });
    await circle(page, at.x, at.y, 1000);
    const away = await pullOf(page, hov);
    await patch({});
    // the pixels: the tile warm, against the same moment once the pointer has
    // gone and the tile is back at rest (the clock pinned; the pointer moving)
    const wr = await warmVsRest(page, dpr, tr, at, 300, 400, hov, patch, {});
    const wc = await warmVsRest(page, dpr, tr, at, 300, 400, hov, patch, { cursorStrength: 0 });
    await page.evaluate(() => window.__covers.pin(null));
    check(
      toward.heat > 0.9 && toward.pull > 2 && toward.extra > 0.02 && away.pull < -2,
      `@${dpr}× grid tile, the clock running`,
      `warmth ${toward.heat.toFixed(2)}; ${toward.n} blobs near it drawn ${toward.pull.toFixed(1)} units toward the pointer (> 2), 'away' ${away.pull.toFixed(1)} (< -2); sped up: ${toward.extra.toFixed(2)} rad ahead of the shared timeline`,
    );
    check(
      wr.near.d > 0.03 && wr.far.d < FAR && wc.near.d < 0.005,
      `@${dpr}× grid tile, warm vs rest`,
      `near the pointer ${pct(wr.near.d)} differ (> 3%), beyond 2 radii ${pct(wr.far.d)} (< 1%, ${wr.far.n} px); control, strength 0: ${pct(wc.near.d)} (< 0.5%)`,
    );
    // leaving: every frame recorded, the clock running, the pointer moving off the card
    await patch({});
    await circle(page, at.x, at.y, 1500);
    await page.evaluate((i) => {
      window.__lavaLeave = [];
      const t0 = performance.now();
      const L = window.__covers.lava;
      const f = () => {
        const t = window.__covers.time();
        const a = L.blobs('rest', t);
        const b = L.blobs(i, t);
        let dev = 0;
        a.forEach((p, k) => (dev = Math.max(dev, Math.hypot(b[k][0] - p[0], b[k][1] - p[1]))));
        const w = L.warmth(i);
        window.__lavaLeave.push({ dev, heat: w ? w.heat : 0, domed: window.__covers.presenters()[i].domed });
        if (performance.now() - t0 < 3500) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, hov);
    await circle(page, 12, 12, 3700);
    const rec = await page.evaluate(() => window.__lavaLeave);
    let jump = 0;
    let drop = 0;
    for (let k = 1; k < rec.length; k++) {
      jump = Math.max(jump, Math.abs(rec[k].dev - rec[k - 1].dev));
      drop = Math.max(drop, rec[k - 1].heat - rec[k].heat);
    }
    const restAt = rec.findIndex((r) => !r.domed);
    check(
      rec.length > 30 && rec[0].dev > 2 && jump < 8 && drop < 0.1 && restAt > 0 && restAt < 150,
      `@${dpr}× grid tile, leaving`,
      `${rec.length} frames: off the shared timeline by ${rec[0].dev.toFixed(1)} units, back by at most ${jump.toFixed(1)} a frame (< 8); warmth down ≤ ${drop.toFixed(3)} a frame (< 0.1); on the shared draw again after ${restAt} frames (< 150)`,
    );

    // the hero, under the paper: its panel takes the pointer
    await heroOn02(page);
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    await patch({});
    const hr = await heroRect(page);
    const hat = { x: hr.x + hr.w * 0.4, y: hr.y + hr.h * 0.4 };
    await circle(page, hat.x, hat.y, 1500);
    const hp = await pullOf(page, 'hero');
    const h = await warmVsRest(page, dpr, hr, hat, 300, 390, 'hero', patch, {});
    const hc = await warmVsRest(page, dpr, hr, hat, 300, 390, 'hero', patch, { cursorStrength: 0 });
    const under = await page.evaluate(() => window.__paper.state());
    check(
      under === 'on' && hp.heat > 0.9 && hp.pull > 2 && hp.extra > 0.02 && h.near.d > 0.03 && h.far.d < FAR && hc.near.d < 0.005,
      `@${dpr}× detail hero (paper ${under})`,
      `warmth ${hp.heat.toFixed(2)}, ${hp.n} blobs ${hp.pull.toFixed(1)} units toward it, ${hp.extra.toFixed(2)} rad ahead; warm vs rest: near ${pct(h.near.d)} (> 3%), beyond 2 radii ${pct(h.far.d)} (< 1%); control, strength 0: ${pct(hc.near.d)} (< 0.5%)`,
    );
    await page.context().close();
  }
}

async function checkLavaSweep(browser) {
  console.log('\nlava sweep: the pointer swept across every visible tile in ~1 s, 1728×996 @2× — the worst grid frame');
  const dpr = 2;
  const page = await newPage(browser, VIEWPORTS[0], dpr);
  await gridOn02(page);
  await quiet(page); // a dev dock (`?intro`) would sit over the top-right tile's strip; this URL has none
  const pres = await page.evaluate(() => window.__covers.presenters().filter((p) => p.visible && p.cover === 'rive-site'));
  const big = pres.reduce((a, p) => (p.drawW > a.drawW ? p : a), { drawW: 0, drawH: 0 });
  const [w, h] = [big.drawW, big.drawH];
  const shared = (await page.evaluate(([w, h]) => window.__covers.benchStage('rive-site', w, h), [w, h])).ms;
  const warm = (await page.evaluate(([w, h]) => window.__covers.benchStage('rive-site', w, h, true), [w, h])).ms;
  const copy = await page.evaluate(([w, h]) => window.__covers.benchPresent(w, h), [w, h]);
  // every frame's own draws of card 02, from the sweep until the grid is at rest again
  await page.evaluate(() => {
    window.__sweep = [];
    const t0 = performance.now();
    const f = () => {
      window.__sweep.push(window.__covers.ownDraws('rive-site'));
      if (performance.now() - t0 < 5000) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  // through the visible part of every card-02 tile on screen (they run
  // diagonally across the grid, a row apart), in one ~1 s stroke
  const V = VIEWPORTS[0];
  const pts = pres
    .map((p) => {
      const x = Math.max(p.rect.x, 4);
      const y = Math.max(p.rect.y, 4);
      const xe = Math.min(p.rect.x + p.rect.w, V.width - 4);
      const ye = Math.min(p.rect.y + p.rect.h, V.height - 4);
      return [(x + xe) / 2, (y + ye) / 2];
    })
    .sort((a, b) => a[0] - b[0]);
  const steps = 60;
  const at = (s) => {
    const k = Math.min(pts.length - 2, Math.floor(s * (pts.length - 1)));
    const f = s * (pts.length - 1) - k;
    return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
  };
  const t0 = Date.now();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = pts.length > 1 ? at(i / steps) : pts[0];
    await page.mouse.move(x + Math.sin(i / 3) * 20, y);
    await page.waitForTimeout(Math.max(0, t0 + (1000 * i) / steps - Date.now()));
  }
  const sweepMs = Date.now() - t0;
  await page.mouse.move(3, 3);
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(3 + (i % 8), 3);
    await page.waitForTimeout(100);
  }
  const rec = await page.evaluate(() => window.__sweep);
  const most = Math.max(...rec);
  const tiles = Math.max(4, pres.length);
  const worst = shared + most * warm + tiles * copy;
  check(
    most <= LSWEEP_OWN_MAX,
    '1728×996 @2× sweep: the cap on tiles drawn for themselves',
    `${pres.length} tiles swept in ${sweepMs} ms; at most ${most} drawn for themselves in one frame (of ${rec.length}) ≤ ${LSWEEP_OWN_MAX}`,
  );
  check(
    worst <= LSWEEP_BUDGET,
    '1728×996 @2× sweep: the worst grid frame',
    `${ms(worst)} = shared ${ms(shared)} + ${most} × warm ${ms(warm)} + ${tiles} copies × ${ms(copy)} ≤ ${LSWEEP_BUDGET}`,
  );
  await page.context().close();
}

/**
 * An instance (`rect`, CSS px) warm under the pointer circling `at`, against
 * the same moment of the cover clock once the pointer has moved off and the
 * instance is back at rest; `which` names it for `__covers.lava`. It starts at
 * rest and the clock is pinned before the pointer arrives, so the warmth is
 * the swell and the pull alone (the speed-up needs the clock to run). Pixels
 * past TOL near the pointer (within the cursor radius) and beyond two radii.
 */
async function warmVsRest(page, dpr, rect, at, w, h, which, patch, lava) {
  await patch(lava);
  await circle(page, 12, 12, 300);
  await page.waitForFunction((i) => window.__covers.lava.warmth(i)?.settled !== false, which, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.__covers.pin(window.__covers.time()));
  await circle(page, at.x, at.y, 1500);
  const warm = await grab(page, rect, dpr, w, h);
  const ptr = await page.evaluate((i) => window.__covers.lava.warmth(i), which);
  await circle(page, 12, 12, 1500);
  await page.waitForFunction((i) => window.__covers.lava.warmth(i)?.settled !== false, which, { timeout: 5000 }).catch(() => {});
  await frames(page, 3);
  const rest = await grab(page, rect, dpr, w, h);
  await page.evaluate(() => window.__covers.pin(null));
  const r = (await page.evaluate(() => window.__covers.dials('rive-site').lava.cursorRadius)) * (w / cropOf(rect.w / rect.h).w);
  const [px, py] = frameToGrab(ptr.px, ptr.py, rect.w / rect.h, w, h);
  return {
    near: diffWhere(warm, rest, w, h, (x, y) => Math.hypot(x - px, y - py) < r),
    far: diffWhere(warm, rest, w, h, (x, y) => Math.hypot(x - px, y - py) > 2 * r),
  };
}

// ── no WebGL ────────────────────────────────────────────────────────────

async function checkNoGl(browser) {
  console.log('\nno WebGL: the tiles show the still');
  const page = await newPage(browser, VIEWPORTS[0], 2, {}, () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      return /webgl/.test(type) ? null : orig.call(this, type, ...a);
    };
  });
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const of = (id) => [...document.querySelectorAll(`.cover-tile[data-cover="${id}"]`)];
    const shader = of('rive-site');
    const rive = of('nosey');
    return {
      tiles: shader.length,
      canvases: shader.filter((t) => t.querySelector('.cover-tile__canvas')).length,
      stills: shader.filter((t) => {
        const i = t.querySelector('.cover-tile__still');
        return i.complete && i.naturalWidth > 0 && getComputedStyle(i).visibility !== 'hidden';
      }).length,
      rive: rive.length,
      riveLive: rive.filter((t) => t.querySelector('.cover-tile__canvas')).length,
    };
  });
  check(r.tiles > 0 && r.canvases === 0 && r.stills === r.tiles, 'grid, card 02', `${r.tiles} tiles, ${r.stills} showing the still, ${r.canvases} canvases`);
  check(r.rive > 0 && r.riveLive === r.rive, 'grid, card 04', `${r.riveLive} of ${r.rive} tiles live: the Rive cover draws on the CPU and needs no WebGL`);
  await page.context().close();
}

// ── contexts ────────────────────────────────────────────────────────────

async function checkContexts(browser) {
  console.log('\ncontexts: WebGL contexts on the page');
  const page = await newPage(browser, VIEWPORTS[0], 2, {}, () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    window.__gl = new Set();
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const c = orig.call(this, type, ...a);
      if (c && /webgl/.test(type)) window.__gl.add(this);
      return c;
    };
  });
  await gridOn02(page);
  const grid = await page.evaluate(() => {
    const all = [...window.__gl];
    const paper = all.filter((c) => c.classList.contains('detail__paper')).length;
    return { n: all.length - paper, paper, tiles: document.querySelectorAll('.cover-tile__canvas').length };
  });
  await page.goto(`${B}#item-02`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  const detail = await page.evaluate(() => window.__gl.size);
  check(grid.n <= MAIN_CONTEXTS.grid + 1 && grid.paper <= 1, 'grid', `${grid.n} contexts (main ${MAIN_CONTEXTS.grid}, +1: the cover stage) for ${grid.tiles} live tiles, + ${grid.paper} the paper's (the idle warm-up)`);
  check(detail <= MAIN_CONTEXTS.detail + 1, 'detail', `${detail} contexts (main ${MAIN_CONTEXTS.detail}, +1: the cover stage)`);
  await page.context().close();
}

// ── the sky through the ground ──────────────────────────────────────────

async function checkSky(browser) {
  console.log('\nsky: the cover ground over NOON and over NIGHT');
  if (await skipSolid(browser, 'rive-site', ['ground luminance'])) return;
  const page = await newPage(browser, VIEWPORTS[0], 2);
  await gridOn02(page);
  await flatGrid(page);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.env-readout, .dialkit-root, .frame-hud, .minimap-wrap { visibility: hidden !important; }';
    document.head.append(st);
    window.__covers.pin(0); // the text where Figma has it
  });
  const tr = await focusedTile(page);
  const tc = cropOf(tr.w / tr.h);
  // Inside the i's stem: cover ground and nothing else (frame 612–632 × 600–800).
  const u0 = (612 - tc.x0) / tc.w;
  const u1 = (632 - tc.x0) / tc.w;
  const v0 = (600 - tc.y0) / tc.h;
  const v1 = (800 - tc.y0) / tc.h;
  const lum = async () => {
    const png = await page.screenshot({
      clip: { x: tr.x + u0 * tr.w, y: tr.y + v0 * tr.h, width: (u1 - u0) * tr.w, height: (v1 - v0) * tr.h },
    });
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let s = 0;
    for (let i = 0; i < data.length; i += 3) s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return s / (data.length / 3);
  };
  await page.evaluate(() => window.__skyPreview('clear', 'noon'));
  await page.waitForTimeout(4000);
  const noon = await lum();
  await page.evaluate(() => window.__skyPreview('clear', 'night'));
  await page.waitForTimeout(4000);
  const night = await lum();
  const rel = Math.abs(noon - night) / Math.max(noon, night);
  check(rel > 0.2, 'ground luminance', `noon ${noon.toFixed(1)}, night ${night.toFixed(1)}: ${pct(rel)} apart > 20%`);
  await page.context().close();
}

// ── the ground, and nothing on it ────────────────────────────────────────

async function checkGround(browser) {
  console.log('\nground: the hero where the cover is transparent, paper effects ON, vs the sky with the cover hidden');
  if (await skipSolid(browser, 'rive-site', ['1728×996 @1× ground ↔ sky', '1728×996 @2× ground ↔ sky'])) return;
  const TUNED = 0.439; // rive-site.json riso4.paperOpacity
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await heroOn02(page);
    await page.mouse.move(3, 3);
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.env-readout, .dialkit-root, .frame-hud, .minimap-wrap { visibility: hidden !important; }';
      document.head.append(st);
      window.__covers.pin(3.5);
      window.__covers.patchDials('rive-site', { riso4: { paperOpacity: 0 } });
      window.__skyPreview('clear', 'noon');
    });
    await page.waitForTimeout(4000); // the sky's preview transition, the fluid's wake at the corner
    // The sky's grain and drift, pinned; its wake held: two captures of the sky
    // are then the same sky, and the floor below is 0.
    await page.evaluate(() => {
      window.__skyPinTime(10);
      window.__skyHoldFluid(true);
    });
    const on = await page.evaluate(() => ({ state: window.__paper.state(), presence: window.__paper.presence(), u: window.__paper.uniforms() }));
    const hr = await heroRect(page);
    const clip = { x: hr.x, y: hr.y, width: hr.w, height: hr.h };
    const raw = async () => {
      await frames(page, 3);
      const { data, info } = await sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data, n: info.width * info.height };
    };
    // The cover's alpha, as the page composites it: the sky off, over black and
    // over white (the canvas is premultiplied over whatever is behind it).
    const under = (css) =>
      page.evaluate((css) => {
        let st = document.getElementById('ground-under');
        if (!st) {
          st = document.createElement('style');
          st.id = 'ground-under';
          document.head.append(st);
        }
        st.textContent = css;
      }, css);
    await under('.sky-layer { visibility: hidden !important; } html, body, #root { background: #000 !important; }');
    const k = await raw();
    await under('.sky-layer { visibility: hidden !important; } html, body, #root { background: #fff !important; }');
    const w = await raw();
    await under('');
    const mask = new Uint8Array(k.n);
    let ground = 0;
    for (let i = 0; i < k.n; i++) {
      let a = 0;
      for (let c = 0; c < 3; c++) a = Math.max(a, 1 - (w.data[i * 3 + c] - k.data[i * 3 + c]) / 255);
      if (a <= 0.02) {
        mask[i] = 1;
        ground++;
      }
    }
    const cmp = (a, b) => {
      let sum = 0;
      let far = 0;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        let m = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c]);
          sum += d;
          m = Math.max(m, d);
        }
        if (m > TOL) far++;
      }
      return { mean: sum / (3 * ground * 255), far: far / ground };
    };
    const hide = (on) => page.evaluate((on) => window.__paper.override(on ? { hideCovers: true } : {}), on);
    const lit = await raw();
    await hide(true);
    const sky = await raw();
    const sky2 = await raw(); // the floor: the sky against itself, a moment later
    await hide(false);
    await page.evaluate((a) => window.__covers.patchDials('rive-site', { riso4: { paperOpacity: a } }), TUNED);
    const stock = await raw();
    // What the paper's LIGHT adds to that stock: the creases' refraction held
    // at 0 (it moves the ink, which is not light), then their blend too.
    // Printed, not held to a bar — the stock is 0.439 opaque, and the light it
    // takes is weighted by that alpha (coverPaperShade × alpha). The page is
    // closed after, so the dials are not put back.
    await page.evaluate(() => window.__paper.set({ creaseDisplacement: 0 }));
    const stockLit = await raw();
    await page.evaluate(() => window.__paper.set({ creaseBlend: 0 }));
    const stockFlat = await raw();
    // The mean only: with the refraction off the ink sits a pixel or two from
    // where the mask was measured, so the odd mask pixel holds ink at full light.
    let lightSum = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      for (let c = 0; c < 3; c++) lightSum += Math.abs(stockLit.data[i * 3 + c] - stockFlat.data[i * 3 + c]);
    }
    const d = cmp(lit, sky);
    const floor = cmp(sky2, sky);
    const ctl = cmp(stock, sky);
    const hero = on.u.find((x) => x.slot === 0) ?? {};
    const tag = `1728×996 @${dpr}×`;
    check(
      on.state === 'on' && on.presence >= 1 && ground > 0.1 * k.n && d.mean <= 0.01 && d.far <= 0.01 && ctl.mean > 0.01,
      `${tag} ground ↔ sky`,
      `${pct(ground / k.n)} of the hero is ground (alpha ≤ 0.02); paper ${on.state}, presence ${on.presence.toFixed(2)}, ripple ${hero.ripple}; mean ${pct(d.mean)} ≤ 1%, ${pct(d.far)} past ${TOL} levels ≤ 1% (floor ${pct(floor.mean)} / ${pct(floor.far)}; control, the stock at ${TUNED}: ${pct(ctl.mean)} / ${pct(ctl.far)})`,
    );
    console.log(`      the paper's light on the stock (not held to a bar): mean ${pct(lightSum / (3 * ground * 255))}`);
    await page.context().close();
  }
}

// ── card 04, the Rive cover ─────────────────────────────────────────────

/** The grid, card 04 focused (three ArrowRights from 01), its file loaded. */
async function gridOn04(page) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__covers && window.__covers.rive.ready('nosey') && window.__covers.frames() > 3, null, { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1200);
}

async function heroOn04(page, { settle = true } = {}) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.goto(`${B}#item-04`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  if (settle) await page.waitForFunction(() => window.__paper.presence() >= 1, null, { timeout: 5000 });
}

/** Walk the pinned cover clock from `t0`, one 60 Hz step per frame, `n` frames:
 *  every surface draws each step once, so the same walk is the same run. */
const step = (page, t0, n) =>
  page.evaluate(
    async ([t0, n]) => {
      for (let k = 1; k <= n; k++) {
        window.__covers.pin(t0 + k / 60);
        await new Promise((r) => requestAnimationFrame(r));
      }
    },
    [t0, n],
  );

/** Fresh instances, the clock pinned at `t`, and a couple of frames to draw them. */
async function freshRive(page, t) {
  await page.evaluate((t) => {
    window.__covers.pin(t);
    window.__covers.rive.reset('nosey');
  }, t);
  await frames(page, 3);
}

/** A frame-unit box of the hero (10:13, the whole frame) on screen, CSS px. */
const heroBox = (hr, fx, fy, fw, fh) => ({
  x: hr.x + (fx / RFRAME.w) * hr.w,
  y: hr.y + (fy / RFRAME.h) * hr.h,
  w: (fw / RFRAME.w) * hr.w,
  h: (fh / RFRAME.h) * hr.h,
});

const pctl = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN;
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

async function checkRiveBudgets(browser) {
  console.log(`\nrive budgets: card 04, main-thread ms per frame (≤ ${RIVE_BUDGET}), the pointer moving`);
  for (const vp of VIEWPORTS) {
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, vp, dpr);
      const tag = `${vp.width}×${vp.height} @${dpr}×`;
      await gridOn04(page);
      const tr = await focusedTile(page);
      const sweep = async (r, n) => {
        await page.evaluate(() => window.__covers.rive.clearCosts());
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 4;
          await page.mouse.move(r.x + r.w * (0.5 + 0.4 * Math.cos(a)), r.y + r.h * (0.5 + 0.4 * Math.sin(a)));
          await page.waitForTimeout(16);
        }
        return page.evaluate(() => window.__covers.rive.costs());
      };
      const v0 = await page.evaluate(() => window.__covers.rive.players().find((p) => p.role === 'grid')?.version ?? 0);
      const f0 = await page.evaluate(() => window.__covers.frames());
      const grid = await sweep(tr, 120);
      const v1 = await page.evaluate(() => window.__covers.rive.players().find((p) => p.role === 'grid')?.version ?? 0);
      const f1 = await page.evaluate(() => window.__covers.frames());
      const tiles = await page.evaluate(() => window.__covers.presenters().filter((p) => p.cover === 'nosey' && p.visible));
      const big = tiles.reduce((a, p) => (p.pxW > a.pxW ? p : a), { pxW: 0, pxH: 0 });
      const gridBench = await page.evaluate(([w, h]) => window.__covers.rive.bench('nosey', 'grid', w, h, 120), [big.pxW, big.pxH]);
      const sky = await page.evaluate(() => {
        const t = window.__skyBenchmark?.(300, 10, true) ?? [];
        t.sort((a, b) => a - b);
        return t.length ? t[Math.floor(t.length * 0.95)] : NaN;
      });
      await heroOn04(page);
      const hr = await heroRect(page);
      const hero = await sweep(hr, 120);
      const hp = await page.evaluate(() => window.__covers.rive.players().find((p) => p.role === 'hero'));
      const heroBench = await page.evaluate(([w, h]) => window.__covers.rive.bench('nosey', 'hero', w, h, 120), [hp.pxW, hp.pxH]);
      const upBench = await page.evaluate(() => window.__paper.benchRiveUpload(60));
      const g = grid.map((c) => c.ms);
      const h = hero.map((c) => c.ms);
      const worst = Math.max(pctl(g, 0.95), pctl(h, 0.95));
      const drawsPerFrame = (v1 - v0) / Math.max(1, f1 - f0);
      check(
        pctl(g, 0.95) <= RIVE_BUDGET,
        `${tag} grid`,
        `${tiles.length} tiles, one draw ${big.pxW}×${big.pxH} (${drawsPerFrame.toFixed(2)} draws a frame): per frame mean ${ms(mean(g))}, p95 ${ms(pctl(g, 0.95))}, max ${ms(Math.max(...g))} (draw ${ms(mean(grid.map((c) => c.draw)))} + copies ${ms(mean(grid.map((c) => c.copy)))}); a timed draw ${ms(gridBench)} ≤ ${RIVE_BUDGET}`,
      );
      check(
        pctl(h, 0.95) <= RIVE_BUDGET,
        `${tag} hero`,
        `${hp.pxW}×${hp.pxH}: per frame mean ${ms(mean(h))}, p95 ${ms(pctl(h, 0.95))}, max ${ms(Math.max(...h))} (draw ${ms(mean(hero.map((c) => c.draw)))} + upload ${ms(mean(hero.map((c) => c.upload)))}); a timed draw ${ms(heroBench)} + upload ${ms(upBench)} = ${ms(heroBench + upBench)} ≤ ${RIVE_BUDGET}`,
      );
      check(sky + worst <= BUDGET.all, `${tag} sky+fluid+covers`, `${ms(sky)} + ${ms(worst)} = ${ms(sky + worst)} ≤ ${BUDGET.all}`);
      await page.context().close();
    }
  }
}

async function holdMorphAtEnd(page) {
  await page.evaluate(() => {
    window.__morphHeld = false;
    const mo = new MutationObserver(() => {
      if (!document.querySelector('.detail-morph')) return;
      mo.disconnect();
      requestAnimationFrame(() => {
        for (const a of document.getAnimations()) {
          const d = a.effect?.getTiming().duration;
          if (typeof d === 'number') {
            a.pause();
            a.currentTime = d - 1;
          }
        }
        window.__morphHeld = true;
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

async function checkRiveSwap(browser) {
  console.log('\nrive swap: the morph (Main) held on its last frame vs the DOM hero it lands on (Main Bounce)');
  const T = 5;
  for (const [dpr, swapAt] of [
    [1, 'landing'],
    [2, 'landing'],
    [1, 'start'],
  ]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn04(page);
    await quiet(page);
    if (swapAt !== 'landing') await page.evaluate((v) => window.__covers.patchDials('nosey', { rive: { riveSwapAt: v } }), swapAt);
    const tr = await focusedTile(page);
    await page.mouse.move(tr.x + tr.w / 2, tr.y + tr.h * 0.62, { steps: 5 });
    await page.waitForTimeout(300);
    await freshRive(page, T); // the grid's instance at its first frame, the clock held
    await holdMorphAtEnd(page);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => window.__morphHeld, null, { timeout: 5000 });
    await page.mouse.move(3, 3);
    await page.waitForTimeout(400);
    const hr = await heroRect(page);
    // The number is the DOM hero's alone: this compares the cover.
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.detail__panel-num { visibility: hidden !important; }';
      document.head.append(st);
    });
    const role = await page.evaluate(() => document.querySelector('.detail-morph .cover-tile[data-cover="nosey"]')?.dataset.role);
    const morph = await grab(page, hr, dpr, 300, 390);
    await page.evaluate(() => {
      window.__paper?.set({ paper: 'off' });
      for (const a of document.getAnimations()) a.play();
    });
    await page.waitForFunction(() => !document.querySelector('.detail-morph') && document.querySelector('.detail[data-phase="active"]'), null, { timeout: 5000 });
    await page.evaluate(() => window.__paper.set({ paper: 'off' }));
    await frames(page, 6);
    const heroRole = await page.evaluate(() => document.querySelector('.detail__panel--center .cover-tile[data-cover="nosey"]')?.dataset.role);
    const dom = await grab(page, hr, dpr, 300, 390);
    const d = diff(morph, dom);
    const tag = `@${dpr}× riveSwapAt ${swapAt}`;
    if (swapAt === 'landing') {
      await step(page, T, 60); // a second of bounce
      const later = await grab(page, hr, dpr, 300, 390);
      await page.evaluate((t) => window.__covers.pin(t), T + 1);
      const dc = diff(morph, later);
      check(
        role === 'grid' && heroRole === 'hero' && d <= 0.02 && dc > 0.02,
        `${tag}: morph (${role}) → DOM hero (${heroRole})`,
        `${pct(d)} of pixels differ ≤ 2% (control, the hero 1s of bounce later: ${pct(dc)})`,
      );
      await page.evaluate(() => window.__paper.set({ paper: 'on' }));
      await page.waitForFunction(() => window.__paper.state() === 'on', null, { timeout: 10000 });
      await page.evaluate(() => window.__paper.override({ zero: true }));
      await frames(page, 4);
      const dom2 = await (async () => {
        await page.evaluate(() => window.__paper.set({ paper: 'off' }));
        await frames(page, 4);
        return grab(page, hr, dpr, 300, 390);
      })();
      await page.evaluate(() => window.__paper.set({ paper: 'on' }));
      await page.waitForFunction(() => window.__paper.state() === 'on', null, { timeout: 10000 });
      await page.evaluate(() => window.__paper.override({ zero: true }));
      await frames(page, 4);
      const paper = await grab(page, hr, dpr, 300, 390);
      const d2 = diff(dom2, paper);
      check(d2 <= 0.02, `@${dpr}× DOM hero → paper`, `${pct(d2)} of pixels differ ≤ 2% (one instance, one canvas: the DOM face copies it, the plane samples it)`);
    } else {
      check(role === 'hero' && heroRole === 'hero' && d <= 0.02, `${tag}: morph (${role}) → DOM hero (${heroRole})`, `${pct(d)} of pixels differ ≤ 2% (the morph card IS the hero's instance)`);
    }
    await page.context().close();
  }
}

/** One run on the hero from a fresh instance: `before` (the pointer's moves),
 *  a walk of `n` frames with `mid` at its middle, then the headset's region. */
async function heroRun(page, dpr, T, { before, mid, n = 60 }) {
  await page.mouse.move(3, 3);
  await freshRive(page, T);
  const hr = await heroRect(page);
  if (before) await before(hr);
  await step(page, T, n / 2);
  if (mid) await mid(hr);
  await step(page, T + n / 2 / 60, n / 2);
  await frames(page, 2);
  const vm = await page.evaluate(() => window.__covers.rive.viewModel('nosey', 'hero'));
  const box = heroBox(hr, vm.headsetX, vm.headsetY, HEADSET.w, HEADSET.h);
  const img = await grab(page, box, dpr, 180, 137);
  return { vm, img, hr };
}

async function checkRivePointer(browser) {
  console.log('\nrive pointer: real mouse events at the tile and the hero, the pointer moving from the first frame');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}×`;
    // Moving from the first frame, and never waiting for a quiet moment.
    await page.goto(B, { waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    let loaded = null;
    for (let i = 0; i < 150 && !loaded; i++) {
      await page.mouse.move(140 + 60 * Math.sin(i / 3), 110 + 40 * Math.cos(i / 4));
      await page.waitForTimeout(40);
      loaded = await page.evaluate(() => {
        const st = window.__covers?.rive.status('nosey');
        return st && (st.file === 'loaded' || st.file === 'failed') ? st : null;
      });
    }
    const waited = loaded ? loaded.at.importing - loaded.at['waiting for idle'] : NaN;
    check(
      loaded?.file === 'loaded' && waited <= 1100,
      `${tag} loads with the pointer moving`,
      loaded
        ? `${loaded.file} ${Date.now() - t0} ms after navigation; waited ${waited} ms for a quiet moment (≤ 1100: the deadline), bytes ready at +${loaded.at['waiting for idle']} ms, imported at +${loaded.at.loaded} ms`
        : 'never loaded',
    );
    if (loaded?.file !== 'loaded') {
      await page.context().close();
      continue;
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(900);
    await quiet(page);
    await flatGrid(page);
    // The hover overlay stays hit-testable (its CTA takes the pointer); it is
    // only made invisible, so the pixels are the cover's.
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.card-overlay, .grid-card__overlay { opacity: 0 !important; }';
      document.head.append(st);
    });
    const tile = await focusedTile(page);
    const hold = async (r, u, v, ms) => {
      const x = r.x + u * r.w;
      const y = r.y + v * r.h;
      for (let i = 0; i <= 8; i++) await page.mouse.move(x - 40 + 5 * i, y, { steps: 1 });
      for (let t = 0; t < ms; t += 50) {
        await page.mouse.move(x + ((t / 50) % 2), y); // a hand is never still
        await page.waitForTimeout(50);
      }
      await page.mouse.move(x, y); // …and the last event is the point checked
      await page.waitForTimeout(50);
      return { x, y };
    };
    const ptr = (role) => page.evaluate((role) => ({ vm: window.__covers.rive.viewModel('nosey', role), st: window.__covers.rive.status('nosey').pointer }), role);
    const tracking = (vm) => Object.entries(vm).filter(([k]) => /isTracking|lookX|overHead/.test(k)).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`);
    const crop = (r) => {
      const a = r.w / r.h;
      const img = RFRAME.w / RFRAME.h;
      return img > a ? { x0: (RFRAME.w - RFRAME.h * a) / 2, y0: 0, w: RFRAME.h * a, h: RFRAME.h } : { x0: 0, y0: (RFRAME.h - RFRAME.w / a) / 2, w: RFRAME.w, h: RFRAME.w / a };
    };
    const judge = async (role, r, label) => {
      const c = crop(r);
      const onCard = await page.evaluate(
        ([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel),
        [r.x + 0.12 * r.w, r.y + 0.5 * r.h, role === 'grid' ? '.grid-card' : '.detail__panel--center'],
      );
      const a = await hold(r, 0.12, 0.5, 1000);
      const A = await ptr(role);
      const imgA = await grab(page, r, dpr, 150, 200);
      const b = await hold(r, 0.88, 0.5, 1000);
      const Bp = await ptr(role);
      const imgB = await grab(page, r, dpr, 150, 200);
      await hold(r, 0.88, 0.5, 1000);
      const imgB2 = await grab(page, r, dpr, 150, 200);
      const want = (p) => ({ x: c.x0 + ((p.x - r.x) / r.w) * c.w, y: c.y0 + ((p.y - r.y) / r.h) * c.h });
      const wa = want(a);
      const wb = want(b);
      const near = (vm, w) => Math.abs(vm.ptrX - w.x) <= 2 && Math.abs(vm.ptrY - w.y) <= 2;
      const tA = tracking(A.vm).join(' ');
      const tB = tracking(Bp.vm).join(' ');
      const dMove = diff(imgA, imgB);
      const dStill = diff(imgB, imgB2);
      const pixels = role === 'grid' ? dMove > 3 * dStill && dMove > 0.002 : true;
      // The hero's characters bounce: at a given moment neither sample point
      // may be near one. Its tracking is held in heroLater, over a sweep.
      const trackOk = role === 'grid' ? tA !== tB : true;
      check(
        onCard && A.st?.role === role && Bp.st?.role === role && near(A.vm, wa) && near(Bp.vm, wb) && trackOk && pixels,
        `${tag} ${label}`,
        `events on the ${role === 'grid' ? 'card' : 'panel'}: ${onCard}; the ${role} instance got them (${Bp.st?.n} so far) at (${A.vm.ptrX.toFixed(1)}, ${A.vm.ptrY.toFixed(1)}) / (${Bp.vm.ptrX.toFixed(1)}, ${Bp.vm.ptrY.toFixed(1)}) — wanted (${wa.x.toFixed(1)}, ${wa.y.toFixed(1)}) / (${wb.x.toFixed(1)}, ${wb.y.toFixed(1)}); tracking left [${tA}] vs right [${tB}]` +
          (role === 'grid' ? `; pixels left vs right ${pct(dMove)} vs the tile's idle ${pct(dStill)}` : ''),
      );
    };
    await judge('grid', tile, 'the focused grid tile');
    // Over the hover overlay's CTA — the one thing over a tile that takes the
    // pointer itself: the instance still gets moves there, not an exit.
    const cta = await page.evaluate(() => {
      const b = document.querySelector('.grid-card .card-overlay__cta');
      const r = b?.getBoundingClientRect();
      const el = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, top: el?.closest('.card-overlay__cta') ? 'card-overlay__cta' : (el?.tagName ?? 'nothing') } : null;
    });
    if (cta) {
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(cta.x + (i % 2), cta.y);
        await page.waitForTimeout(50);
      }
      await page.mouse.move(cta.x, cta.y);
      await page.waitForTimeout(80);
      const c = crop(tile);
      const want = { x: c.x0 + ((cta.x - tile.x) / tile.w) * c.w, y: c.y0 + ((cta.y - tile.y) / tile.h) * c.h };
      const got = await ptr('grid');
      check(
        /card-overlay__cta/.test(String(cta.top)) && got.st?.role === 'grid' && got.st.kind === 'move' && Math.abs(got.vm.ptrX - want.x) <= 2 && Math.abs(got.vm.ptrY - want.y) <= 2,
        `${tag} over the overlay's CTA`,
        `on top: ${String(cta.top).split(' ')[0]}; the grid instance's last event: ${got.st?.kind} at (${got.vm.ptrX.toFixed(1)}, ${got.vm.ptrY.toFixed(1)}), wanted (${want.x.toFixed(1)}, ${want.y.toFixed(1)})`,
      );
    } else bad(`${tag} over the overlay's CTA`, 'no overlay CTA on the hovered card');
    // Into the detail view the way a person goes: a click on the tile.
    await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h * 0.62);
    await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
    const landed = Date.now();
    // What was on screen from the click to the paper, before anything else moves it on.
    const landing = await page.evaluate(() => window.__covers.rive.status('nosey').swaps.map((w) => [w.from, w.to]));
    // Alive, not just receiving: advancing, bouncing, uploaded to the plane,
    // the swap seen, and one instance through three 450 ms frames (a loaded
    // machine's arrival) — wall-time grace made each such frame a fresh hero.
    const heroAlive = async (label, morph) => {
      const read = () =>
        page.evaluate(() => {
          const st = window.__covers.rive.status('nosey');
          const vm = window.__covers.rive.viewModel('nosey', 'hero');
          return {
            f: st.players.hero?.frames ?? 0,
            inst: st.players.hero?.instances ?? 0,
            up: st.plane?.uploads ?? 0,
            shows: st.plane?.shows ?? 'none',
            hx: vm?.headsetX ?? NaN,
            hy: vm?.headsetY ?? NaN,
            swaps: st.swaps.map((w) => [w.from, w.to]),
          };
        });
      const a = await read();
      await page.waitForTimeout(800);
      await page.evaluate(async () => {
        for (let k = 0; k < 3; k++) {
          await new Promise((r) => requestAnimationFrame(r));
          const t = performance.now();
          while (performance.now() - t < 450);
        }
      });
      await page.waitForTimeout(600);
      const z = await read();
      const swaps = morph ? landing : z.swaps;
      const swapped = !morph || swaps.some(([from, to]) => /morph card \(Main\)/.test(from) && /Main Bounce/.test(to));
      const moved = Math.hypot(z.hx - a.hx, z.hy - a.hy);
      check(
        z.f - a.f > 30 && z.up - a.up > 30 && z.shows === 'live' && moved > 20 && z.inst === a.inst && swapped,
        `${tag} ${label}: alive`,
        `${z.f - a.f} frames advanced and ${z.up - a.up} uploads to the plane in ~2 s, the plane shows ${z.shows}; the headset Nosey bounced ${moved.toFixed(0)} units; hero instance #${a.inst} → #${z.inst} through three 450 ms frames${morph ? `; the swap: ${swapped ? swaps.filter(([fr, to]) => /morph card \(Main\)/.test(fr) && /Main Bounce/.test(to)).map(([fr, to]) => `${fr} → ${to}`)[0] : `not seen in ${JSON.stringify(swaps)}`}` : ''}`,
      );
    };
    // Still alive LATER — 2 s and 5 s after landing, the pointer moving over it
    // the whole time: a hero that lived through the hand-off and then froze
    // (a plane no longer uploaded, an instance no longer advanced, the pointer
    // no longer routed) fails here.
    const heroLater = async (label, since) => {
      const hr = await heroRect(page);
      const read = () =>
        page.evaluate(() => {
          const st = window.__covers.rive.status('nosey');
          return {
            f: st.players.hero?.frames ?? 0,
            inst: st.players.hero?.instances ?? 0,
            up: st.plane?.uploads ?? 0,
            shows: st.plane?.shows ?? 'none',
            ptr: st.pointers.hero?.n ?? 0,
            paper: window.__paper.state(),
            raf: window.__rafN ?? 0,
          };
        });
      // Each window at least 800 ms, whenever the check starts.
      let windowFrom = Date.now();
      let tracked = 0;
      const until = async (ms) => {
        tracked = 0;
        for (let i = 0; Date.now() - since < ms || Date.now() - windowFrom < 800; i++) {
          if (i % 8 === 0) {
            tracked += await page.evaluate(() => {
              const vm = window.__covers.rive.viewModel('nosey', 'hero') ?? {};
              return Object.entries(vm).some(([k, v]) => (/isTracking/.test(k) && v === true) || (/lookX/.test(k) && Math.abs(v) > 0.05)) ? 1 : 0;
            });
          }
          await page.mouse.move(hr.x + hr.w * (0.5 + 0.35 * Math.sin(i / 5)), hr.y + hr.h * (0.4 + 0.2 * Math.cos(i / 7)));
          await page.waitForTimeout(30);
        }
      };
      const shot = () => grab(page, hr, dpr, 200, 260);
      await page.evaluate(() => {
        if (window.__rafN !== undefined) return;
        window.__rafN = 0;
        const f = () => {
          window.__rafN++;
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      const samples = [];
      let prev = await read();
      let prevImg = await shot();
      for (const at of [2000, 5000]) {
        await until(at);
        const cur = await read();
        const img = await shot();
        const moved = diff(prevImg, img);
        samples.push({ tracked, ms: Date.now() - windowFrom, raf: cur.raf - prev.raf, at, frames: cur.f - prev.f, uploads: cur.up - prev.up, ptr: cur.ptr - prev.ptr, inst: cur.inst, shows: cur.shows, paper: cur.paper, moved, instSame: cur.inst === prev.inst });
        prev = cur;
        prevImg = img;
        windowFrom = Date.now();
      }
      check(
        samples.every((x) => x.frames > 30 && x.uploads > 30 && x.ptr > 5 && x.tracked > 0 && x.shows === 'live' && x.paper === 'on' && x.instSame && x.moved > 0.005),
        `${tag} ${label}: still alive at 2 s and 5 s`,
        samples.map((x) => `${x.at / 1000} s (a ${x.ms} ms window, ${x.raf} rAF): +${x.frames} frames, +${x.uploads} uploads, +${x.ptr} pointer events, a character tracking it in ${x.tracked} of its checks, plane ${x.shows}, instance #${x.inst}${x.instSame ? '' : ' (NEW)'}, ${pct(x.moved)} of the hero's pixels changed`).join('; '),
      );
    };
    await heroLater('the hero after the morph', landed);
    await judge('hero', await heroRect(page), 'the hero after the morph, on the paper');
    await heroAlive('the hero after the morph', true);

    // …and a direct load of #item-04, the pointer moving from the first frame.
    await page.goto('about:blank');
    await page.goto(`${B}#item-04`, { waitUntil: 'domcontentloaded' });
    const d0 = Date.now();
    let live = false;
    for (let i = 0; i < 150 && !live; i++) {
      await page.mouse.move(820 + 40 * Math.sin(i / 3), 380 + 30 * Math.cos(i / 4));
      await page.waitForTimeout(40);
      live = await page.evaluate(() => window.__covers?.rive.status('nosey').plane?.shows === 'live');
    }
    const liveMs = Date.now() - d0;
    const liveAt = Date.now();
    check(live && liveMs <= 4000, `${tag} direct load: the hero goes live`, live ? `the plane shows Main Bounce ${liveMs} ms after navigation, the pointer moving (≤ 4000)` : 'never live');
    if (live) {
      await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 10000 });
      await heroLater('the hero on a direct load', liveAt);
      await judge('hero', await heroRect(page), 'the hero on a direct load');
      await heroAlive('the hero on a direct load', false);
    }
    await page.context().close();
  }
}

/** The headset's colour in a region: its saturated pixels, by the three hues
 *  the Colors layer cycles through. */
function hues(img) {
  const h = { blue: 0, red: 0, yellow: 0 };
  for (let i = 0; i < img.length; i += 3) {
    const [r, g, b] = [img[i], img[i + 1], img[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 90) continue;
    if (b > r && b > g) h.blue++;
    else if (r > 150 && g > 140) h.yellow++;
    else if (r > g) h.red++;
  }
  const top = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
  return { ...h, top: top[1] > 20 ? top[0] : 'none' };
}

async function checkRiveClick(browser) {
  console.log('\nrive click: hovering onto the headset steps its colour; a click on the hero opens the project');
  const T = 2;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await heroOn04(page);
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    const onto = async (hr) => {
      const vm = await page.evaluate(() => window.__covers.rive.viewModel('nosey', 'hero'));
      const b = heroBox(hr, vm.headsetX + HEADSET.cup.x, vm.headsetY + HEADSET.cup.y, 0, 0);
      await page.mouse.move(b.x, b.y, { steps: 3 });
    };
    const none = await heroRun(page, dpr, T, {});
    const hover = await heroRun(page, dpr, T, { mid: onto });
    const a = hues(none.img);
    const b = hues(hover.img);
    check(
      a.top !== 'none' && b.top !== 'none' && a.top !== b.top,
      `@${dpr}× onto the headset vs no pointer, 0.5s after`,
      `the headset is ${b.top} (no pointer: ${a.top}); ${pct(diff(none.img, hover.img))} of its region differs`,
    );
    // A click on the hero is the card's, as on every portfolio card: #view-04.
    await page.evaluate(() => window.__covers.pin(null));
    const hr = await heroRect(page);
    await page.mouse.click(hr.x + hr.w * 0.5, hr.y + hr.h * 0.35);
    await page.waitForFunction(() => location.hash.startsWith('#view-04'), null, { timeout: 5000 }).catch(() => {});
    const hash = await page.evaluate(() => location.hash);
    check(hash.startsWith('#view-04'), `@${dpr}× a click on the hero opens the project`, `hash ${hash || '(none)'}`);
    await page.context().close();
  }
}

async function checkRiveReduced(browser) {
  console.log('\nrive reduced motion: card 04 is its still');
  const page = await newPage(browser, VIEWPORTS[0], 2, { reducedMotion: 'reduce' });
  await page.goto(B, { waitUntil: 'networkidle' });
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3000);
  const grid = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.cover-tile[data-cover="nosey"]')];
    return {
      tiles: tiles.length,
      canvases: tiles.filter((t) => t.querySelector('.cover-tile__canvas')).length,
      stills: tiles.filter((t) => t.querySelector('.cover-tile__still').complete).length,
      loaded: window.__covers.rive.ready('nosey'),
    };
  });
  await quiet(page);
  const a = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const b = await sharp(await page.screenshot()).raw().toBuffer();
  const g = stillDiff(a, b);
  check(
    grid.tiles > 0 && grid.canvases === 0 && grid.stills === grid.tiles && !grid.loaded && g.moved === 0,
    'grid',
    `${grid.stills} of ${grid.tiles} tiles on the still, ${grid.canvases} canvases, runtime loaded: ${grid.loaded}, ${g.note}`,
  );
  await heroOn04(page, { settle: false });
  await quiet(page);
  const hr = await heroRect(page);
  await page.waitForTimeout(500);
  const c = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const d = await sharp(await page.screenshot()).raw().toBuffer();
  const h = stillDiff(c, d);
  // …and the pointer across it loads nothing either.
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(hr.x + hr.w * (0.2 + 0.06 * i), hr.y + hr.h * 0.3);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ uploads: window.__paper.riveUploads().n, loaded: window.__covers.rive.ready('nosey') }));
  check(r.uploads === 0 && !r.loaded && h.moved === 0, 'detail hero', `paper uploaded the live cover ${r.uploads} times, runtime loaded: ${r.loaded} (after the pointer crossed it), ${h.note}`);
  await page.context().close();
}

async function checkRiveSky(browser) {
  console.log("\nrive sky: Main's empty ground over NOON and over NIGHT");
  if (await skipSolid(browser, 'nosey', ['ground luminance'])) return;
  const page = await newPage(browser, VIEWPORTS[0], 2);
  await gridOn04(page);
  await flatGrid(page);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.env-readout, .dialkit-root, .frame-hud, .minimap-wrap { visibility: hidden !important; }';
    document.head.append(st);
  });
  await page.mouse.move(3, 3);
  await freshRive(page, 1);
  const tr = await focusedTile(page);
  const aspect = tr.w / tr.h;
  const img = RFRAME.w / RFRAME.h;
  const tc = img > aspect ? { x0: (RFRAME.w - RFRAME.h * aspect) / 2, y0: 0, w: RFRAME.h * aspect, h: RFRAME.h } : { x0: 0, y0: (RFRAME.h - RFRAME.w / aspect) / 2, w: RFRAME.w, h: RFRAME.w / aspect };
  // Between the four characters: ground and nothing else (frame 450–550 × 560–700).
  const u0 = (450 - tc.x0) / tc.w;
  const u1 = (550 - tc.x0) / tc.w;
  const v0 = (560 - tc.y0) / tc.h;
  const v1 = (700 - tc.y0) / tc.h;
  const lum = async () => {
    const png = await page.screenshot({ clip: { x: tr.x + u0 * tr.w, y: tr.y + v0 * tr.h, width: (u1 - u0) * tr.w, height: (v1 - v0) * tr.h } });
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let s = 0;
    for (let i = 0; i < data.length; i += 3) s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return s / (data.length / 3);
  };
  await page.evaluate(() => window.__skyPreview('clear', 'noon'));
  await page.waitForTimeout(4000);
  const noon = await lum();
  await page.evaluate(() => window.__skyPreview('clear', 'night'));
  await page.waitForTimeout(4000);
  const night = await lum();
  const rel = Math.abs(noon - night) / Math.max(noon, night);
  check(rel > 0.2, 'ground luminance', `noon ${noon.toFixed(1)}, night ${night.toFixed(1)}: ${pct(rel)} apart > 20%`);
  await page.context().close();
}

async function checkRiveGround(browser) {
  console.log("\nrive ground: card 04's hero where it is transparent, paper effects ON, vs the sky with the cover hidden");
  if (await skipSolid(browser, 'nosey', ['1728×996 @1× ground ↔ sky', '1728×996 @2× ground ↔ sky'])) return;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await heroOn04(page);
    await page.mouse.move(3, 3);
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.env-readout, .dialkit-root, .frame-hud, .minimap-wrap { visibility: hidden !important; }';
      document.head.append(st);
      window.__skyPreview('clear', 'noon');
    });
    await freshRive(page, 3.5);
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      window.__skyPinTime(10);
      window.__skyHoldFluid(true);
    });
    const on = await page.evaluate(() => ({ state: window.__paper.state(), presence: window.__paper.presence() }));
    const hr = await heroRect(page);
    const clip = { x: hr.x, y: hr.y, width: hr.w, height: hr.h };
    const raw = async () => {
      await frames(page, 3);
      const { data, info } = await sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data, n: info.width * info.height };
    };
    const under = (css) =>
      page.evaluate((css) => {
        let st = document.getElementById('ground-under');
        if (!st) {
          st = document.createElement('style');
          st.id = 'ground-under';
          document.head.append(st);
        }
        st.textContent = css;
      }, css);
    // The panel's number is DOM over the hero: out of the way, so the mask is
    // the cover's alone.
    await under('.detail__panel-num { visibility: hidden !important; } .sky-layer { visibility: hidden !important; } html, body, #root { background: #000 !important; }');
    const k = await raw();
    await under('.detail__panel-num { visibility: hidden !important; } .sky-layer { visibility: hidden !important; } html, body, #root { background: #fff !important; }');
    const w = await raw();
    await under('.detail__panel-num { visibility: hidden !important; }');
    const mask = new Uint8Array(k.n);
    let ground = 0;
    for (let i = 0; i < k.n; i++) {
      let a = 0;
      for (let c = 0; c < 3; c++) a = Math.max(a, 1 - (w.data[i * 3 + c] - k.data[i * 3 + c]) / 255);
      if (a <= 0.02) {
        mask[i] = 1;
        ground++;
      }
    }
    const cmp = (a, b) => {
      let sum = 0;
      let far = 0;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        let m = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c]);
          sum += d;
          m = Math.max(m, d);
        }
        if (m > TOL) far++;
      }
      return { mean: sum / (3 * ground * 255), far: far / ground };
    };
    const lit = await raw();
    await page.evaluate(() => window.__paper.override({ hideCovers: true }));
    const sky = await raw();
    const sky2 = await raw();
    await page.evaluate(() => window.__paper.override({}));
    await page.evaluate(() => window.__covers.setSite({ coverBackdrop: 'solid' }));
    const solid = await raw();
    const d = cmp(lit, sky);
    const floor = cmp(sky2, sky);
    const ctl = cmp(solid, sky);
    check(
      on.state === 'on' && on.presence >= 1 && ground > 0.5 * k.n && d.mean <= 0.01 && d.far <= 0.01 && ctl.mean > 0.01,
      `1728×996 @${dpr}× ground ↔ sky`,
      `${pct(ground / k.n)} of the hero is ground; mean ${pct(d.mean)} ≤ 1%, ${pct(d.far)} past ${TOL} levels ≤ 1% (floor ${pct(floor.mean)} / ${pct(floor.far)}; control, coverBackdrop 'solid': ${pct(ctl.mean)} / ${pct(ctl.far)})`,
    );
    await page.context().close();
  }
}

async function checkRiveContexts(browser) {
  console.log('\nrive contexts: card 04 live adds none');
  const page = await newPage(browser, VIEWPORTS[0], 2, {}, () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    window.__gl = [];
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const had = this.__glMade;
      const c = orig.call(this, type, ...a);
      if (c && /webgl/.test(type) && !had) {
        this.__glMade = true;
        window.__gl.push({ rive: /rive-app|rive\.js/i.test(new Error().stack ?? ''), paper: this.classList.contains('detail__paper') });
      }
      return c;
    };
  });
  await gridOn04(page);
  const grid = await page.evaluate(() => ({
    n: window.__gl.filter((g) => !g.paper).length,
    paper: window.__gl.filter((g) => g.paper).length,
    rive: window.__gl.filter((g) => g.rive).length,
    tiles: document.querySelectorAll('.cover-tile[data-cover="nosey"] .cover-tile__canvas').length,
  }));
  await page.goto(`${B}#item-04`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const detail = await page.evaluate(() => ({ n: window.__gl.length, rive: window.__gl.filter((g) => g.rive).length }));
  check(grid.n <= MAIN_CONTEXTS.grid + 1 && grid.paper <= 1 && grid.rive === 0, 'grid', `${grid.n} contexts (main ${MAIN_CONTEXTS.grid}, +1: card 02's stage) with ${grid.tiles} card-04 tiles live, + ${grid.paper} the paper's (the idle warm-up); ${grid.rive} made by the Rive runtime`);
  check(detail.n <= MAIN_CONTEXTS.detail + 1 && detail.rive === 0, 'detail #item-04', `${detail.n} contexts; ${detail.rive} made by the Rive runtime`);
  await page.context().close();
}

// ── card 03, the drex cover ─────────────────────────────────────────────

/** Card 03's frame, and where its logo's mark is centred (drex.ts). */
const DFRAME = { w: 1000, h: 1300 };
const DLOGO = { x: 500, y: 649 };
/** drexCover.js's handoff render of Figma's frame, pointer at (-1, -1): kept
 *  with the masters, outside the repo. */
const DREX_REF = arg('--drex-ref', join(homedir(), 'Discommode-pages', 'projects', 'drex', 'preview-figma-rest.png'));

/** The grid, card 03 focused (two ArrowRights from 01), its print ready. */
async function gridOn03(page) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__covers && window.__covers.frames() > 3, null, { timeout: 20000 });
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
  }
  await page.waitForFunction(() => window.__covers.stage.cover('drex')?.ready(), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function heroOn03(page, { settle = true } = {}) {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.goto(`${B}#item-03`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  if (settle) await page.waitForFunction(() => window.__paper.presence() >= 1, null, { timeout: 5000 });
}

/** Mean luminance of an RGB(A) raw buffer `w` wide, over a box of fractions. */
function lum(buf, w, h, ch, box) {
  const x0 = Math.floor(box.u0 * w);
  const x1 = Math.ceil(box.u1 * w);
  const y0 = Math.floor(box.v0 * h);
  const y1 = Math.ceil(box.v1 * h);
  let s = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      s += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
    }
  }
  return s / ((x1 - x0) * (y1 - y0));
}

/** An image as 20 × 26 blocks (50 frame px each), the dither and grain
 *  averaged out: what "looks like" compares. */
const blocks = (input, raw) =>
  sharp(input, raw ? { raw } : undefined)
    .removeAlpha()
    .resize(20, 26, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer();

function blockDiff(a, b) {
  let s = 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    s += d;
    m = Math.max(m, d);
  }
  return { mean: s / a.length, max: m };
}

/** One draw of card 03 at w × h by the stage, read back (straight RGBA). */
async function drexFrame(page, w, h, t, dome) {
  const r = await page.evaluate(([w, h, t, dome]) => window.__covers.renderFrame('drex', w, h, t, dome), [w, h, t, dome]);
  return r ? { ...r, data: Buffer.from(r.b64, 'base64') } : null;
}

async function checkDrexCompile(browser) {
  console.log('\ndrex compile: both passes link, no GL error, in the stage and in the paper');
  const page = await newPage(browser, VIEWPORTS[0], 2);
  await gridOn03(page);
  const st = await page.evaluate(() => window.__covers.diagnose('drex'));
  check(st && st.linked && st.glError === 0, 'stage', st ? `linked ${st.linked}, glError ${st.glError}${st.log ? `: ${st.log}` : ''}` : 'no cached renderer for drex');
  await heroOn03(page);
  const pp = await page.evaluate(() => window.__paper.coverDiagnose('drex'));
  check(pp && pp.linked && pp.glError === 0, 'paper', pp ? `linked ${pp.linked}, glError ${pp.glError}${pp.log ? `: ${pp.log}` : ''}` : 'no cached renderer for drex');
  await page.context().close();
}

async function checkDrexRef(browser) {
  console.log('\ndrex ref: 1000×1300, the pointer at (-1, -1), against preview-figma-rest.png');
  let ref;
  try {
    ref = await readFile(DREX_REF);
  } catch {
    skip('1000×1300 vs Figma', `no reference at ${DREX_REF} (--drex-ref <png>)`);
    return;
  }
  const page = await newPage(browser, VIEWPORTS[0], 1);
  await gridOn03(page);
  const raw = { width: DFRAME.w, height: DFRAME.h, channels: 4 };
  // Figma's pointer rests at (-1, -1): the dome all the way up, there.
  const me = await drexFrame(page, DFRAME.w, DFRAME.h, 0, { x: -1, y: -1, amp: 1 });
  // A control: the light parked on the logo, which Figma's render is not.
  const ctl = await drexFrame(page, DFRAME.w, DFRAME.h, 0, { x: DLOGO.x, y: DLOGO.y, amp: 1 });
  await writeFile('.context/verify-drex-rest.png', await sharp(me.data, { raw }).png().toBuffer()).catch(() => {});
  const rb = await blocks(ref);
  const d = blockDiff(rb, await blocks(me.data, raw));
  const dc = blockDiff(rb, await blocks(ctl.data, raw));
  const refMeta = await sharp(ref).metadata();
  const refRaw = await sharp(ref).removeAlpha().raw().toBuffer();
  const ch = refMeta.channels >= 4 ? 3 : refMeta.channels;
  const L = (buf, c, box) => lum(buf, DFRAME.w, DFRAME.h, c, box);
  const ALL = { u0: 0, u1: 1, v0: 0, v1: 1 };
  const CORNER = { u0: 0, u1: 0.15, v0: 0, v1: 0.12 };
  const LOGO = { u0: 0.3, u1: 0.45, v0: 0.4, v1: 0.55 }; // inside the left page
  const GROUND = { u0: 0.05, u1: 0.2, v0: 0.6, v1: 0.75 }; // beside it
  const mine = { all: L(me.data, 4, ALL), corner: L(me.data, 4, CORNER), logo: L(me.data, 4, LOGO), ground: L(me.data, 4, GROUND) };
  const theirs = { all: L(refRaw, ch, ALL), corner: L(refRaw, ch, CORNER), logo: L(refRaw, ch, LOGO), ground: L(refRaw, ch, GROUND) };
  const f1 = (x) => x.toFixed(1);
  check(me.minA === 255, 'opaque', `smallest alpha ${me.minA} (255: no sky through it)`);
  check(
    Math.abs(mine.all - theirs.all) <= 4 && mine.all < 60,
    'a dark frame',
    `mean luminance ${f1(mine.all)} vs Figma's ${f1(theirs.all)} (±4, < 60)`,
  );
  check(mine.corner > 150 && theirs.corner > 150, 'lit top-left corner', `${f1(mine.corner)} vs Figma's ${f1(theirs.corner)} (> 150)`);
  check(
    Math.abs(mine.logo - mine.ground) < 25 && mine.ground < 60,
    'the logo barely visible',
    `inside the mark ${f1(mine.logo)}, beside it ${f1(mine.ground)}: ${f1(Math.abs(mine.logo - mine.ground))} apart < 25 (Figma's: ${f1(theirs.logo)} / ${f1(theirs.ground)})`,
  );
  check(
    d.mean <= 3 && dc.mean > 3,
    'looks like Figma',
    `20×26 blocks: mean ${f1(d.mean)} levels ≤ 3, max ${d.max} (the logo is the exported one; drexCover.js's previews used a stand-in); control, the light on the logo: mean ${f1(dc.mean)}`,
  );
  await page.context().close();
}

async function checkDrexCache(browser) {
  console.log('\ndrex cache: pass A rendered once per size, pass B every frame');
  const page = await newPage(browser, VIEWPORTS[0], 2);
  await gridOn03(page);
  const tr = await focusedTile(page);
  const prints = () => page.evaluate(() => window.__covers.prints('drex'));
  const draws = () => page.evaluate(() => window.__covers.stage.cover('drex').drawCount());
  const a0 = await prints();
  const d0 = await draws();
  // the pointer over the focused tile for 90 frames: the tile tilts and its
  // focus scale settles, every frame a new bounding box — not a new print
  for (let i = 0; i < 90; i++) {
    const k = i / 90;
    await page.mouse.move(tr.x + tr.w * (0.15 + 0.7 * k), tr.y + tr.h * (0.2 + 0.6 * Math.abs(Math.sin(k * 6))));
    await frames(page, 1);
  }
  const a1 = await prints();
  const d1 = await draws();
  // …except the hero's, which a hovered tile has the stage render in an idle
  // moment, so the morph does not pay for it on the click's first frame
  // The print is the whole frame at the scale that makes the hero's crop its
  // width, its own rounding: the hero's size, or a pixel over (at
  // detailCardScale 0.81, 1112×1446 for a 1111×1445 hero at 1728×996 @2×).
  const hs = await heroRect(page);
  const hw = Math.round(hs.w * 2);
  const hh = Math.round(hs.h * 2);
  const heroPrint = `${hw}x${hh}`;
  const isHeros = (k) => {
    const [w, h] = k.split('x').map(Number);
    return w >= hw && w <= hw + 1 && h >= hh && h <= hh + 1;
  };
  check(
    a1.renders - a0.renders === 1 && a1.kept.some(isHeros) && d1 - d0 >= 90,
    'grid, hovered',
    `pass A ${a1.renders - a0.renders} render (1: the hero's ${heroPrint}, ahead of the click; the tile's none), pass B ${d1 - d0} draws in 90 frames; prints kept ${a1.kept.join(', ')}`,
  );
  // grid → detail through the morph, then 90 frames on the hero
  await page.mouse.click(tr.x + tr.w / 2, tr.y + tr.h * 0.62);
  await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__paper.presence() >= 1, null, { timeout: 20000 });
  const a2 = await prints();
  const p0 = await page.evaluate(() => window.__paper.coverPrints('drex'));
  const c0 = await page.evaluate(() => window.__paper.coversDrawn());
  const hr = await heroRect(page);
  for (let i = 0; i < 90; i++) {
    const k = i / 90;
    await page.mouse.move(hr.x + hr.w * (0.2 + 0.6 * k), hr.y + hr.h * (0.3 + 0.4 * Math.abs(Math.sin(k * 5))));
    await frames(page, 1);
  }
  const p1 = await page.evaluate(() => window.__paper.coverPrints('drex'));
  const c1 = await page.evaluate(() => window.__paper.coversDrawn());
  check(
    a2.renders === a1.renders,
    'the morph and the DOM hero',
    `${a2.renders - a1.renders} new prints in the stage over the whole travel (0: the hero's was ready), kept ${a2.kept.join(', ')}`,
  );
  check(
    p0 && p1 && p1.renders === p0.renders && c1 - c0 >= 80,
    'the paper hero, hovered',
    p0 ? `pass A ${p1.renders - p0.renders} renders, pass B ${c1 - c0} draws in 90 frames; prints kept ${p1.kept.join(', ')}` : 'no paper renderer',
  );
  // a dial change re-renders it, once
  await page.evaluate(() => window.__covers.patchDials('drex', { risograph: { grain: 0.2 } }));
  await frames(page, 10);
  const p2 = await page.evaluate(() => window.__paper.coverPrints('drex'));
  await page.evaluate(() => window.__covers.patchDials('drex', null));
  check(p2.renders - p1.renders === 1, 'a pass-A dial changed', `${p2.renders - p1.renders} render in 10 frames (1)`);
  await page.context().close();
}

async function checkDrexPointer(browser) {
  console.log('\ndrex pointer: the light follows it, on the tile and on the hero; drifts at rest');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn03(page);
    await quiet(page);
    await flatGrid(page);
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.card-overlay, .grid-card__overlay { opacity: 0 !important; }';
      document.head.append(st);
      window.__covers.pin(2);
    });
    const tr = await focusedTile(page);
    const TL = { u0: 0.1, u1: 0.35, v0: 0.1, v1: 0.3 };
    const BR = { u0: 0.65, u1: 0.9, v0: 0.7, v1: 0.9 };
    const shot = async (r) => {
      const buf = await grab(page, r, dpr, 300, 400);
      return { tl: lum(buf, 300, 400, 3, TL), br: lum(buf, 300, 400, 3, BR) };
    };
    const hover = async (r, u, v) => {
      for (let i = 0; i < 12; i++) await page.mouse.move(r.x + r.w * u + i, r.y + r.h * v);
      await page.waitForTimeout(900); // followEase 0.12: ~97% of the way in 0.45 s
    };
    // tilt and focus are off (flatGrid): the tile's box IS the cover
    await hover(tr, 0.22, 0.2);
    const a = await shot(tr);
    await hover(tr, 0.78, 0.8);
    const b = await shot(tr);
    check(a.tl > a.br + 60 && b.br > b.tl + 60, `@${dpr}× grid tile`, `pointer top-left: TL ${a.tl.toFixed(0)} / BR ${a.br.toFixed(0)}; bottom-right: TL ${b.tl.toFixed(0)} / BR ${b.br.toFixed(0)}`);
    // at rest the light drifts: two moments of the shared clock
    await page.mouse.move(3, 3);
    await page.waitForTimeout(1200);
    const r0 = await grab(page, tr, dpr, 300, 400);
    await page.evaluate(() => window.__covers.pin(5.5));
    await frames(page, 3);
    const r1 = await grab(page, tr, dpr, 300, 400);
    const moved = diff(r0, r1);
    check(moved > 0.05, `@${dpr}× grid at rest, drifting`, `t 2 s → 5.5 s: ${pct(moved)} of pixels past ${TOL} levels (> 5%)`);
    // the hero, under the paper: its panel takes the pointer
    await heroOn03(page);
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    const hr = await heroRect(page);
    await hover(hr, 0.22, 0.2);
    const c = await shot(hr);
    await hover(hr, 0.78, 0.8);
    const d = await shot(hr);
    const under = await page.evaluate(() => window.__paper.state());
    check(
      under === 'on' && c.tl > c.br + 60 && d.br > d.tl + 60,
      `@${dpr}× detail hero (paper ${under})`,
      `pointer top-left: TL ${c.tl.toFixed(0)} / BR ${c.br.toFixed(0)}; bottom-right: TL ${d.tl.toFixed(0)} / BR ${d.br.toFixed(0)}`,
    );
    await page.context().close();
  }
}

async function checkDrexMorph(browser) {
  console.log('\ndrex morph: the last morph frame vs the DOM hero, the DOM hero vs the paper');
  await checkMorph(browser, { gridOn: gridOn03, label: 'drex ' });
}

async function checkDrexReduced(browser) {
  console.log('\ndrex reduced motion: the still, the light parked on the logo, nothing moves');
  const page = await newPage(browser, VIEWPORTS[0], 2, { reducedMotion: 'reduce' });
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const grid = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.cover-tile[data-cover="drex"]')];
    return {
      tiles: tiles.length,
      canvases: tiles.filter((t) => t.querySelector('.cover-tile__canvas')).length,
      stills: tiles.filter((t) => {
        const i = t.querySelector('.cover-tile__still');
        return i.complete && i.naturalWidth > 0;
      }).length,
    };
  });
  check(grid.tiles > 0 && grid.canvases === 0 && grid.stills === grid.tiles, 'grid', `${grid.stills} of ${grid.tiles} tiles on the still, ${grid.canvases} canvases`);
  await heroOn03(page, { settle: false });
  await quiet(page);
  await page.waitForTimeout(500);
  const drawn = await page.evaluate(() => window.__paper.coversDrawn());
  const a = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const b = await sharp(await page.screenshot()).raw().toBuffer();
  const h = stillDiff(a, b);
  check(drawn === 0 && h.moved === 0, 'detail hero', `paper drew the live cover ${drawn} times (0 = the still), ${h.note}`);
  // the still itself (npm run covers): its light is on the logo
  const res = await page.request.get(`${B}projects/drex/cover-still.webp`);
  const img = sharp(await res.body());
  const { width, height } = await img.metadata();
  const s = await img.removeAlpha().raw().toBuffer();
  const at = (cx, cy) => lum(s, width, height, 3, { u0: cx - 0.06, u1: cx + 0.06, v0: cy - 0.05, v1: cy + 0.05 });
  // the white paper between the pages and the wordmark, 111 frame px under
  // the logo's centre (inside the light's 344), and the corner, outside it
  const lit = lum(s, width, height, 3, { u0: 0.47, u1: 0.53, v0: 0.565, v1: 0.605 });
  const dark = at(0.1, 0.08);
  check(lit > 150 && dark < 60, 'the still, parked', `${width}×${height}: the paper under the logo's centre ${lit.toFixed(0)} (> 150), the top-left corner ${dark.toFixed(0)} (< 60)`);
  await page.context().close();
}

async function checkDrexBudgets(browser) {
  console.log('\ndrex budgets: GPU ms per frame (pass B), and pass A once');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn03(page);
    const pres = await page.evaluate(() => window.__covers.presenters().filter((p) => p.visible && p.cover === 'drex'));
    const big = pres.reduce((a, p) => (p.pxW > a.pxW ? p : a), { pxW: 0, pxH: 0, drawW: 0, drawH: 0 });
    const w = big.drawW || big.pxW;
    const h = big.drawH || big.pxH;
    const shared = await page.evaluate(([w, h]) => window.__covers.benchStage('drex', w, h), [w, h]);
    const copy = await page.evaluate(([w, h]) => window.__covers.benchPresent(w, h), [w, h]);
    const gridTotal = 2 * shared.ms + pres.length * copy;
    const print = await page.evaluate(([w, h]) => window.__covers.benchPrint('drex', w, h), [w, h]);
    await heroOn03(page);
    await page.mouse.move(3, 3);
    const hero = await page.evaluate(() => window.__paper.benchCover('drex'));
    const heroPrint = hero ? await page.evaluate(([w, h]) => window.__covers.benchPrint('drex', w, h), [hero.pxW, hero.pxH]) : null;
    const tag = `1728×996 @${dpr}×`;
    check(
      gridTotal <= BUDGET.total,
      `${tag} grid`,
      `the shared tile draw ${w}×${h} ${ms(shared.ms)} (+ floor ${ms(shared.floor)}) + the hovered tile's + ${pres.length} copies of ${ms(copy)} = ${ms(gridTotal)} ≤ ${BUDGET.total}; pass A at this size, once: ${print === null ? '–' : ms(print)}`,
    );
    check(
      hero && hero.ms <= BUDGET.hero,
      `${tag} hero`,
      hero ? `${hero.pxW}×${hero.pxH} ${ms(hero.ms)} (+ floor ${ms(hero.floor)}) ≤ ${BUDGET.hero}; pass A at this size, once: ${heroPrint === null ? '–' : ms(heroPrint)}` : 'no hero draw',
    );
    await page.context().close();
  }
}

async function run() {
  const browser = await chromium.launch({ args: GPU });
  try {
    if (ONLY.includes('budgets')) await checkBudgets(browser);
    if (ONLY.includes('clock')) await checkClock(browser);
    if (ONLY.includes('morph')) await checkMorph(browser);
    if (ONLY.includes('reduced')) await checkReduced(browser);
    if (ONLY.includes('nogl')) await checkNoGl(browser);
    if (ONLY.includes('contexts')) await checkContexts(browser);
    if (ONLY.includes('sky')) await checkSky(browser);
    if (ONLY.includes('ground')) await checkGround(browser);
    if (ONLY.includes('lmove')) await checkLavaMove(browser);
    if (ONLY.includes('lpointer')) await checkLavaPointer(browser);
    if (ONLY.includes('lsweep')) await checkLavaSweep(browser);
    if (ONLY.includes('rbudgets')) await checkRiveBudgets(browser);
    if (ONLY.includes('rswap')) await checkRiveSwap(browser);
    if (ONLY.includes('rpointer')) await checkRivePointer(browser);
    if (ONLY.includes('rclick')) await checkRiveClick(browser);
    if (ONLY.includes('rreduced')) await checkRiveReduced(browser);
    if (ONLY.includes('rsky')) await checkRiveSky(browser);
    if (ONLY.includes('rground')) await checkRiveGround(browser);
    if (ONLY.includes('rcontexts')) await checkRiveContexts(browser);
    if (ONLY.includes('dcompile')) await checkDrexCompile(browser);
    if (ONLY.includes('dref')) await checkDrexRef(browser);
    if (ONLY.includes('dcache')) await checkDrexCache(browser);
    if (ONLY.includes('dpointer')) await checkDrexPointer(browser);
    if (ONLY.includes('dmorph')) await checkDrexMorph(browser);
    if (ONLY.includes('dreduced')) await checkDrexReduced(browser);
    if (ONLY.includes('dbudgets')) await checkDrexBudgets(browser);
    if (ONLY.includes('drag')) {
      const rows = await checkDrag({ browser, origin: ORIGIN, newPage, check, dump: arg('--drag-dump', null) });
      const out = arg('--drag-json', null);
      if (out) await writeFile(out, JSON.stringify({ origin: ORIGIN, rows }, null, 2));
    }
  } finally {
    await browser.close();
  }
  const noise = errors.filter((e) => !/Download the React DevTools|favicon|webgl|WebGL/i.test(e));
  check(noise.length === 0, 'no page errors', noise.slice(0, 3).join(' | '));
  const skips = skipped ? ` (${skipped} skipped)` : '';
  console.log(failures ? `\n${failures} failed${skips}` : `\nall passed${skips}`);
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
