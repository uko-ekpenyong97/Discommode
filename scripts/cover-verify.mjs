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
 * CARD 04, the Rive cover (nosey: ONE instance of "Nosey Detail" for every
 * surface — grid tiles, the morph card, the side card, the centre card, the
 * paper's plane — its `focused` input true while it is the centre card;
 * docs/covers.md "Rive covers"). The behaviour checks run in real Chrome, the
 * pointer moving from the first frame and never parked; each was run once
 * against the broken path in brackets (`--fault <name>`, or `--broken`), and
 * failed there:
 *
 *   rbudgets  main-thread ms per frame of ALL card-04 cover work — the grid's
 *             one shared draw plus every visible tile's copy, the pointer
 *             circling the focused tile; the centre card (after the burst)
 *             plus the paper's upload; the side card (card 03 the hero) —
 *             p95 of the frames ≤ 2.0; a timed batch of draws beside it (the
 *             frame numbers are read off a 0.1 ms clock). Sky + fluid (p95) +
 *             covers ≤ 8. In the bundled Chromium, as its earlier numbers.
 *   rgrid     the focused grid tile is live: the face's agentStatus changes
 *             over 8 s, the tile's canvas is drawn, mostly the blue ground,
 *             and its pixels move; unfocused, the characters parked, one
 *             instance. [frozen]
 *   rside     card 03 (and 01) the centre card: card 04's side card is live —
 *             the DOM side canvas drawn, then the paper's side plane live and
 *             uploading, the instance's clock and agentStatus advancing, its
 *             pixels moving, unfocused, one instance. [sidestill]
 *   rjump     NO JUMP through every role change: grid → centre (the morph),
 *             centre → side (Next, after the unfocus cut, which is excluded),
 *             side → centre (Prev), grid → side (card 03 clicked). The clock
 *             pinned and walked a 1/60 s step a frame; every frame the
 *             instance's moment drawn at a fixed size (`snapshot`, no
 *             advance) against the frame before. A change of what shows it
 *             moves ≤ max(3 × that run's p95 frame-to-frame change, 0.5%);
 *             one instance throughout. [fresh]
 *   rfocus    card 04 becomes the centre card (the morph, and Next from 03):
 *             `burst` reaches 1 within 5 s of landing, `faceScale` 0 within
 *             0.5 s of the burst, then the headset Nosey moves. [nofocus]
 *   runfocus  it stops being the centre card (Next, Prev, Escape to the
 *             grid): `burst` 0, `faceScale` 1 and the characters parked
 *             within 2 frames of the view leaving it. [nounfocus]
 *   rdeep     #item-04 on load: focused from birth, before its first advance;
 *             `burst` at 2.42 ± 0.1 s of the instance's clock after its first
 *             draw. [latefocus]
 *   rpointer  the REAL pointer path: the file imported ≤ 1.1 s after its
 *             bytes are ready with the pointer moving; the grid tile's and the
 *             overlay CTA's moves reach the instance through the crop (± 2
 *             units; unfocused, the face does not follow them — for now); on
 *             the centre card after the burst, by the morph and by a direct
 *             load, the file's mirrored ptrX/ptrY match the on-screen point
 *             (± 2), and the card is alive — advancing, uploading, the
 *             headset moving, one instance through three 450 ms frames.
 *             [--broken pointer]
 *   rtouch    a tablet (1180×820, touch): a tap on the tile opens card 04 and
 *             it bursts within 5 s; a finger on the centre card moves its
 *             pointer (ptrX/ptrY ± 3) and lifting it is an exit.
 *             [--broken pointer]
 *   rphone    the phone door's project 04 shows the still (the blue face)
 *             and nothing Rive is requested. [--broken phone]
 *   rclick    a click on the centre card opens the project, #view-04.
 *   rreduced  reduced motion: card 04's tiles and hero are the still, the
 *             runtime is never loaded, nothing moves in 1s.
 *   rsky      a patch of the artboard's empty ground over NOON and NIGHT.
 *   rground   as `ground`, on card 04's hero.
 *   rcontexts WebGL contexts with card 04 live, grid and #item-04: the same
 *             bounds as `contexts`, and none of them made by the Rive runtime.
 *   sidelive  the generic live side card on a SHADER cover, forced on in dev
 *             (`window.__coversSideLive`): card 02 beside card 03 is drawn
 *             live on the paper. (Cards 02 and 03 are live side cards in the
 *             manifest since 2026-10-06; the force path stays.)
 *
 * CARDS 02 AND 03 AS LIVE SIDE CARDS (scripts/side-live-checks.mjs, which
 * says what each asserts): `sside`, `sjump`, `sbudgets` — the last with
 * `--side-budget-viewports 1728x996@2,2560x1440@2` for a subset, and
 * `--side-json <file>` to write its rows.
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
import { checkSideBudgets, checkSideJump, checkSideLive } from './side-live-checks.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg(
  '--only',
  'budgets,clock,morph,reduced,nogl,contexts,sky,ground,lmove,lpointer,lsweep,rbudgets,rgrid,rside,rjump,rfocus,runfocus,rdeep,rpointer,rtouch,rphone,rclick,rreduced,rsky,rground,rcontexts,sidelive,sside,sjump,sbudgets,' +
    'dcompile,dref,dcache,dpointer,dmorph,dreduced,dbudgets,drag',
).split(',');
const B = `${ORIGIN}/`;
/** `--fault <name>`: a deliberately broken path in the app (dev only,
 *  src/covers/faults.ts), for running a check once against what it exists to
 *  catch. `--broken pointer|phone`: the same, done from the check's side. */
const FAULT = arg("--fault", "");
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
/** Card 04's artboard, "Nosey Detail". */
const RFRAME = { w: 1000, h: 1300 };
/** All card-04 cover work, main-thread ms per frame. */
const RIVE_BUDGET = 2.0;

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
  if (FAULT) await context.addInitScript((f) => (window.__coversFault = f.split(",")), FAULT);
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

/** Load the grid with the pointer moving from the first frame (a person's is
 *  never still), until card 04's file is in; then `right` ArrowRights. */
async function gridMoving(page, right = 3) {
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  let st = null;
  for (let i = 0; i < 200 && !st; i++) {
    await page.mouse.move(140 + 60 * Math.sin(i / 3), 110 + 40 * Math.cos(i / 4));
    await page.waitForTimeout(40);
    st = await page.evaluate(() => {
      const s = window.__covers?.rive.status('nosey');
      return s && (s.file === 'loaded' || s.file === 'failed') ? s : null;
    });
  }
  for (let i = 0; i < right; i++) {
    await page.keyboard.press('ArrowRight');
    for (let k = 0; k < 8; k++) {
      await page.mouse.move(200 + 30 * Math.sin(k), 120 + 20 * Math.cos(k));
      await page.waitForTimeout(45);
    }
  }
  return { st, ms: Date.now() - t0 };
}

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

/** Walk the pinned cover clock from `t0`, one 60 Hz step per frame, `n` frames. */
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

/** A fresh instance at the top of its loop, the clock pinned at `t`. */
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

/** Card 04's instance and its view model, now. */
const nosey = (page) =>
  page.evaluate(() => ({ i: window.__covers.rive.instance('nosey'), vm: window.__covers.rive.viewModel('nosey'), st: window.__covers.rive.status('nosey') }));

/**
 * A recorder, in the page, one entry per frame: the instance's clock, focus
 * and burst, the face's state, the headset's position, what shows it, the
 * wall time and the frame. `__rec.mark(name)` stamps the frame of an event.
 */
const startRec = (page) =>
  page.evaluate(() => {
    const R = (window.__rec = { on: true, rows: [], marks: {}, frame: 0 });
    R.mark = (name) => (R.marks[name] ??= { frame: R.frame, wall: performance.now() });
    const f = () => {
      if (!R.on) return;
      R.frame++;
      const rive = window.__covers?.rive;
      const i = rive?.instance('nosey');
      const vm = i ? rive.viewModel('nosey') : null;
      const st = rive?.status('nosey');
      R.rows.push({
        frame: R.frame,
        wall: performance.now(),
        serial: i?.instances ?? 0,
        clock: i?.clock ?? -1,
        frames: i?.frames ?? 0,
        focused: i?.focused ?? false,
        burst: vm?.burst ?? -1,
        face: vm?.faceScale ?? -1,
        hx: vm?.headsetX ?? NaN,
        hy: vm?.headsetY ?? NaN,
        agent: vm?.['noseyAgent/agentStatus'] ?? '',
        showing: st?.showing ?? '',
        phase: document.querySelector('.detail')?.dataset.phase ?? 'grid',
        morph: !!document.querySelector('.detail-morph'),
      });
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
const stopRec = (page) =>
  page.evaluate(() => {
    window.__rec.on = false;
    return { rows: window.__rec.rows, marks: window.__rec.marks };
  });

/** Keep the pointer moving around (x, y) until `stop()`, as a hand does. */
function movingAround(page, at) {
  let on = true;
  const run = (async () => {
    for (let i = 0; on; i++) {
      try {
        const p = typeof at === 'function' ? await at() : at;
        await page.mouse.move(p.x + 12 * Math.sin(i / 3), p.y + 9 * Math.cos(i / 4));
        await page.waitForTimeout(30);
      } catch {
        return; // the page went away under it
      }
    }
  })();
  return { stop: async () => ((on = false), run) };
}

/** Card 04's panel in the detail view (DOM rect, CSS px), centre or side. */
const panel04 = (page) =>
  page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('.detail__panel[data-idx="3"]')) {
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > innerWidth) continue;
      const d = Math.abs(r.x + r.width / 2 - innerWidth / 2);
      if (!best || d < best.d) best = { d, x: r.x, y: r.y, w: r.width, h: r.height, centre: el.classList.contains('detail__panel--center') };
    }
    if (!best) return null;
    // Its on-screen part (a side card runs off the edge).
    const x0 = Math.max(0, best.x);
    const y0 = Math.max(0, best.y);
    const x1 = Math.min(innerWidth, best.x + best.w);
    const y1 = Math.min(innerHeight, best.y + best.h);
    return { ...best, x: x0, y: y0, w: x1 - x0, h: y1 - y0, full: { x: best.x, y: best.y, w: best.w, h: best.h } };
  });

/** The share of a grab's pixels that are the face's blue ground (#0A85D1),
 *  by hue, not level: a side card is at detailSideOpacity, and dimmed further
 *  while the pointer is over the centre card (detailHoverDim). */
function blueShare(img) {
  let n = 0;
  for (let i = 0; i < img.length; i += 3) {
    const [r, g, b] = [img[i], img[i + 1], img[i + 2]];
    if (b > 80 && b > 2.5 * r && b > 1.3 * g && g > 2 * r) n++;
  }
  return n / (img.length / 3);
}

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
      const v = () => page.evaluate(() => window.__covers.rive.instance('nosey')?.stage?.version ?? 0);
      const v0 = await v();
      const f0 = await page.evaluate(() => window.__covers.frames());
      const grid = await sweep(tr, 120);
      const v1 = await v();
      const f1 = await page.evaluate(() => window.__covers.frames());
      const tiles = await page.evaluate(() => window.__covers.presenters().filter((p) => p.cover === 'nosey' && p.visible));
      const big = tiles.reduce((a, p) => (p.pxW > a.pxW ? p : a), { pxW: 0, pxH: 0 });
      const gridBench = await page.evaluate(([w, h]) => window.__covers.rive.bench('nosey', w, h, 120), [big.pxW, big.pxH]);
      const sky = await page.evaluate(() => {
        const t = window.__skyBenchmark?.(300, 10, true) ?? [];
        t.sort((a, b) => a - b);
        return t.length ? t[Math.floor(t.length * 0.95)] : NaN;
      });
      // The hero: the centre card, focused from the deep link, measured once
      // the characters are out and bouncing (the burst is 2.42 s in).
      await heroOn04(page);
      await page.waitForFunction(() => (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      const hr = await heroRect(page);
      const hero = await sweep(hr, 120);
      const hp = await page.evaluate(() => window.__covers.rive.instance('nosey')?.plane);
      const heroBench = await page.evaluate(([w, h]) => window.__covers.rive.bench('nosey', w, h, 120, { focused: true, lead: 3 }), [hp.pxW, hp.pxH]);
      const upBench = await page.evaluate(() => window.__paper.benchRiveUpload(60));
      // The side card: card 03 in the centre, card 04 live beside it, the
      // pointer over the centre card.
      await page.goto(`${B}#item-03`);
      await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__covers.rive.status('nosey').plane?.slot === 'side' && window.__covers.rive.status('nosey').plane?.shows === 'live', null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const side = await sweep(await heroRect(page), 120);
      const sp = await page.evaluate(() => window.__covers.rive.instance('nosey')?.plane);
      const g = grid.map((c) => c.ms);
      const h = hero.map((c) => c.ms);
      const s = side.map((c) => c.ms);
      const worst = Math.max(pctl(g, 0.95), pctl(h, 0.95), pctl(s, 0.95));
      const drawsPerFrame = (v1 - v0) / Math.max(1, f1 - f0);
      check(
        pctl(g, 0.95) <= RIVE_BUDGET,
        `${tag} grid`,
        `${tiles.length} tiles, one draw ${big.pxW}×${big.pxH} (${drawsPerFrame.toFixed(2)} draws a frame): per frame mean ${ms(mean(g))}, p95 ${ms(pctl(g, 0.95))}, max ${ms(Math.max(...g))} (draw ${ms(mean(grid.map((c) => c.draw)))} + copies ${ms(mean(grid.map((c) => c.copy)))}); a timed draw ${ms(gridBench)} ≤ ${RIVE_BUDGET}`,
      );
      check(
        pctl(h, 0.95) <= RIVE_BUDGET,
        `${tag} hero`,
        `${hp.pxW}×${hp.pxH}, after the burst: per frame mean ${ms(mean(h))}, p95 ${ms(pctl(h, 0.95))}, max ${ms(Math.max(...h))} (draw ${ms(mean(hero.map((c) => c.draw)))} + upload ${ms(mean(hero.map((c) => c.upload)))}); a timed draw ${ms(heroBench)} + upload ${ms(upBench)} = ${ms(heroBench + upBench)} ≤ ${RIVE_BUDGET}`,
      );
      check(
        pctl(s, 0.95) <= RIVE_BUDGET,
        `${tag} side card`,
        `${sp?.pxW}×${sp?.pxH}, card 03 the hero: per frame mean ${ms(mean(s))}, p95 ${ms(pctl(s, 0.95))}, max ${ms(Math.max(...s))} (draw ${ms(mean(side.map((c) => c.draw)))} + upload ${ms(mean(side.map((c) => c.upload)))}) ≤ ${RIVE_BUDGET}`,
      );
      check(sky + worst <= BUDGET.all, `${tag} sky+fluid+covers`, `${ms(sky)} + ${ms(worst)} = ${ms(sky + worst)} ≤ ${BUDGET.all}`);
      await page.context().close();
    }
  }
}

async function checkRiveGrid(browser) {
  console.log('\nrive grid: card 04\'s tile is live — the face loops through its states, on blue, the pointer moving');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}×`;
    const { st } = await gridMoving(page, 3);
    if (st?.file !== 'loaded') {
      bad(`${tag} grid tile live`, `the file: ${st?.file ?? 'never loaded'}`);
      await page.context().close();
      continue;
    }
    await quiet(page);
    await flatGrid(page);
    await page.waitForTimeout(300);
    const tile = await focusedTile(page);
    const ptr = movingAround(page, { x: tile.x + tile.w * 0.5, y: tile.y + tile.h * 0.6 });
    const seen = new Set();
    const shots = [];
    let inst = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const n = await nosey(page);
      inst ??= n.i?.instances;
      seen.add(n.vm?.['noseyAgent/agentStatus']);
      if (shots.length < 2 && Date.now() - t0 > shots.length * 3000) shots.push(await grab(page, tile, dpr, 150, 200));
      await page.waitForTimeout(250);
    }
    await ptr.stop();
    const end = await nosey(page);
    const drawn = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.grid-card .cover-tile[data-cover="nosey"]')].find((t) => 'drawn' in t.dataset);
      return !!el;
    });
    const blue = blueShare(shots[0]);
    const moved = diff(shots[0], shots[1]);
    check(
      seen.size >= 2 && drawn && blue > 0.3 && moved > 0.005 && !end.i.focused && end.vm.burst === 0 && end.i.instances === inst,
      `${tag} grid tile live`,
      `agentStatus seen over 8 s: ${[...seen].join(' → ')}; the tile's canvas drawn: ${drawn}; ${pct(blue)} of it the blue ground; ${pct(moved)} of its pixels changed in 3 s; unfocused, characters ${end.vm.burst === 0 ? 'parked' : 'OUT'}; instance #${inst} → #${end.i.instances}`,
    );
    await page.context().close();
  }
}

async function checkRiveSide(browser) {
  console.log('\nrive side card: card 04 beside the centre card is live — the same instance, unfocused, not the still');
  for (const [dpr, centre] of [
    [1, '03'],
    [2, '03'],
    [2, '01'],
  ]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}× ${centre} the hero`;
    await gridMoving(page, 0);
    await quiet(page);
    await page.goto(`${B}#item-${centre}`);
    const hr = await heroRect(page);
    const ptr = movingAround(page, { x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.5 });
    // Before the paper takes the cards: the DOM side card's canvas.
    const dom = await page
      .waitForFunction(
        () => {
          const el = [...document.querySelectorAll('.detail__panel:not(.detail__panel--center) .cover-tile[data-cover="nosey"]')].find((t) => t.closest('.detail__panel').getBoundingClientRect().right > 0);
          return el && 'drawn' in el.dataset && el.querySelector('.cover-tile__canvas') ? true : null;
        },
        null,
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false);
    await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
    const p = await panel04(page);
    const a = await nosey(page);
    const imgA = await grab(page, p, dpr, 150, 195);
    const seen = new Set([a.vm['noseyAgent/agentStatus']]);
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      seen.add((await nosey(page)).vm['noseyAgent/agentStatus']);
      await page.waitForTimeout(250);
    }
    const z = await nosey(page);
    const imgB = await grab(page, p, dpr, 150, 195);
    await ptr.stop();
    const plane = z.st.plane;
    const moved = diff(imgA, imgB);
    check(
      dom && !p.centre && plane?.slot === 'side' && plane.shows === 'live' && plane.uploads > (a.st.plane?.uploads ?? 0) + 30 && z.i.clock > a.i.clock + 5 && seen.size >= 2 && moved > 0.005 && !z.i.focused && z.i.instances === a.i.instances && blueShare(imgB) > 0.3,
      `${tag}: card 04 the side card, live`,
      `DOM side canvas drawn: ${dom}; the paper's side plane ${plane?.shows} (${plane?.slot}), +${(plane?.uploads ?? 0) - (a.st.plane?.uploads ?? 0)} uploads in ~7 s; the instance's clock ${a.i.clock.toFixed(1)} → ${z.i.clock.toFixed(1)} s, agentStatus ${[...seen].join(' → ')}; ${pct(moved)} of the side card's pixels changed, ${pct(blueShare(imgB))} of it the blue ground; focused ${z.i.focused}; instance #${a.i.instances} → #${z.i.instances}`,
    );
    await page.context().close();
  }
}

/**
 * NO JUMP. The cover clock pinned and walked one 1/60 s step per frame, and
 * every frame the instance's moment drawn at a fixed size (`snapshot`: no
 * advance) and compared with the frame before. Where what shows the instance
 * changes (`showing`), that frame's change must be like any other frame's:
 * ≤ max(3 × the p95 of the same run's frame-to-frame changes, 0.5%). The
 * instance number must not change. The unfocus cut (centre → side) is the
 * file's own reset and is excluded: its frame and the next.
 */
async function jumpRun(page, act, { until, ms = 1600 }) {
  await page.evaluate(() => {
    const J = (window.__jump = { on: true, t: window.__covers.time(), prev: null, rows: [] });
    window.__covers.pin(J.t);
    const W = 160;
    const H = 208;
    const f = () => {
      if (!J.on) return;
      const r = window.__covers.rive;
      const i = r.instance('nosey');
      const snap = r.snapshot('nosey', W, H);
      let d = 0;
      if (snap && J.prev) {
        for (let k = 0; k < snap.length; k += 4) {
          if (Math.max(Math.abs(snap[k] - J.prev[k]), Math.abs(snap[k + 1] - J.prev[k + 1]), Math.abs(snap[k + 2] - J.prev[k + 2])) > 32) d++;
        }
        d /= W * H;
      }
      J.prev = snap ? snap.slice() : null;
      J.rows.push({ d, showing: r.status('nosey').showing, serial: i?.instances ?? 0, focused: i?.focused ?? false, clock: i?.clock ?? 0 });
      J.t += 1 / 60;
      window.__covers.pin(J.t);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await page.waitForTimeout(400); // the control's frames, before the change
  await act();
  if (until) await page.waitForFunction(until, null, { timeout: 15000 });
  await page.waitForTimeout(ms);
  const rows = await page.evaluate(() => {
    window.__jump.on = false;
    return window.__jump.rows;
  });
  await page.evaluate(() => window.__covers.pin(null));
  rows.shift(); // no frame before it
  const cut = new Set();
  rows.forEach((r, k) => {
    if (k > 0 && rows[k - 1].focused && !r.focused) {
      cut.add(k);
      cut.add(k + 1);
      cut.add(k + 2);
    }
  });
  // A change is judged over its frame and the two after it: on a hand-off
  // frame nothing may advance the instance (the surface it is moving to has
  // not drawn yet), and that frame's motion lands in the next one.
  const switches = [];
  const near = new Set();
  rows.forEach((r, k) => {
    if (k === 0 || r.showing === rows[k - 1].showing) return;
    let d = 0;
    for (let j = k; j <= k + 2 && j < rows.length; j++) {
      near.add(j);
      if (!cut.has(j)) d = Math.max(d, rows[j].d);
    }
    // The instance's own clock across the change: on, by at most a few
    // steps — never back to the top of the loop, never skipping ahead.
    const dc = rows[Math.min(k + 2, rows.length - 1)].clock - rows[k - 1].clock;
    switches.push({ k, from: rows[k - 1].showing, to: r.showing, d, dc });
  });
  const control = rows.filter((r, k) => k > 0 && !cut.has(k) && !near.has(k)).map((r) => r.d);
  return { rows, switches, control, serials: [...new Set(rows.map((r) => r.serial))], cut: cut.size > 0 };
}

async function checkRiveJump(browser) {
  console.log('\nrive no jump: one instance through every role change, each change one frame\'s motion');
  const judge = (label, r, expect) => {
    const p95 = pctl(r.control, 0.95);
    const bound = Math.max(3 * p95, 0.005);
    const worst = r.switches.reduce((a, s) => (s.d >= a.d ? s : a), { d: 0, to: '' });
    const roles = r.switches.map((s) => s.to || 'nothing');
    const seenRoles = expect.every((e) => r.switches.some((s) => s.to.includes(e)));
    const clockOk = r.switches.every((s) => s.dc >= 0 && s.dc <= 4 / 60 + 1e-6);
    const dcs = r.switches.map((s) => `${(s.dc * 60).toFixed(1)}`).join(', ');
    check(
      r.switches.length > 0 && seenRoles && worst.d <= bound && r.serials.length === 1 && clockOk,
      label,
      `${r.switches.length} role change(s) → ${roles.join(' | ')}; worst change ${pct(worst.d)} (into "${worst.to}", over its frame and the next two) ≤ ${pct(bound)} (3 × the p95 of ${r.control.length} control frames, ${pct(p95)}; floor 0.5%); its clock across each change +${dcs} frames (0–4); instance ${r.serials.map((s) => `#${s}`).join(' → ')}${r.cut ? '; the unfocus cut excluded' : ''}`,
    );
  };
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}×`;
    // grid → centre: card 04 clicked in the grid, a few seconds into its loop.
    await gridMoving(page, 3);
    await quiet(page);
    await page.waitForFunction(() => (window.__covers.rive.instance('nosey')?.clock ?? 0) > 6, null, { timeout: 15000 });
    let tile = await focusedTile(page);
    let ptr = movingAround(page, { x: tile.x + tile.w * 0.5, y: tile.y + tile.h * 0.6 });
    const a = await jumpRun(page, async () => {
      await ptr.stop();
      await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h * 0.6);
      ptr = movingAround(page, async () => {
        const hr = await heroRect(page);
        return { x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.5 };
      });
    }, { until: () => window.__paper?.state() === 'on' });
    judge(`${tag} grid → centre`, a, ['morph card', 'centre card (DOM)', 'paper centre']);
    // centre → side, after the cut: Next, card 01 the centre; card 04 slides left.
    await page.waitForFunction(() => (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 8000 }).catch(() => {});
    const b = await jumpRun(page, () => page.click('[data-chrome="next"]'), {
      until: () => window.__covers.rive.status('nosey').plane?.slot === 'side' && window.__paper.state() === 'on',
    });
    judge(`${tag} centre → side (after the unfocus cut)`, b, ['paper side']);
    // side → centre: Prev, back to card 04.
    const c = await jumpRun(page, () => page.click('[data-chrome="prev"]'), {
      until: () => window.__covers.rive.status('nosey').plane?.slot === 'centre' && window.__covers.rive.instance('nosey').focused,
    });
    judge(`${tag} side → centre`, c, ['paper centre']);
    await ptr.stop();
    // grid → side: card 03 clicked in the grid; card 04 travels in beside it.
    await page.goto('about:blank');
    await gridMoving(page, 2);
    await quiet(page);
    await page.waitForFunction(() => (window.__covers.rive.instance('nosey')?.clock ?? 0) > 6, null, { timeout: 15000 });
    tile = await focusedTile(page);
    const d = await jumpRun(page, () => page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h * 0.6), {
      until: () => window.__paper?.state() === 'on' && window.__covers.rive.status('nosey').plane?.slot === 'side',
    });
    judge(`${tag} grid → side`, d, ['morph card', 'paper side']);
    await page.context().close();
  }
}

async function checkRiveFocus(browser) {
  console.log('\nrive focus: card 04 becomes the centre card — the face finishes, errors, shrinks, and the characters burst out');
  for (const [dpr, route] of [
    [1, 'the morph'],
    [2, 'the morph'],
    [2, 'Next from 03'],
  ]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}× ${route}`;
    if (route === 'the morph') {
      await gridMoving(page, 3);
      const tile = await focusedTile(page);
      await startRec(page);
      await page.evaluate(() => window.__rec.mark('click'));
      await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h * 0.6);
      await page.waitForFunction(() => document.querySelector('.detail[data-phase="active"]'), null, { timeout: 8000 });
      await page.evaluate(() => window.__rec.mark('landed'));
    } else {
      await gridMoving(page, 0);
      await page.goto(`${B}#item-03`);
      await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
      await startRec(page);
      await page.evaluate(() => window.__rec.mark('click'));
      await page.click('[data-chrome="next"]');
      await page.waitForFunction(() => window.__covers.rive.instance('nosey')?.focused, null, { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => window.__rec.mark('landed'));
    }
    const hr = await heroRect(page);
    const ptr = movingAround(page, { x: hr.x + hr.w * 0.3, y: hr.y + hr.h * 0.4 });
    await page.waitForFunction(() => (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await ptr.stop();
    const { rows, marks } = await stopRec(page);
    const landed = marks.landed;
    const focusRow = rows.find((r) => r.focused);
    const burstRow = rows.find((r) => r.burst >= 1);
    const zeroRow = burstRow && rows.find((r) => r.frame >= burstRow.frame && r.face <= 0.001);
    const after = burstRow ? rows.filter((r) => r.wall >= burstRow.wall + 400) : [];
    const hxs = after.map((r) => r.hx).filter((x) => Number.isFinite(x) && x > -4000);
    const span = hxs.length ? Math.max(...hxs) - Math.min(...hxs) : 0;
    const toBurst = burstRow ? (burstRow.wall - landed.wall) / 1000 : NaN;
    const toZero = zeroRow ? zeroRow.clock - burstRow.clock : NaN;
    const morphRow = rows.find((r) => r.morph);
    const from = morphRow ? `the morph's first frame` : 'the click';
    const fromWall = (morphRow ?? marks.click).wall;
    check(
      !!focusRow && burstRow && toBurst <= 5 && toZero <= 0.5 && span > 20 && rows.every((r) => r.serial === rows[0].serial),
      `${tag}: focus → burst`,
      `focused ${focusRow ? `${((focusRow.wall - fromWall) / 1000).toFixed(2)} s after ${from} (at ${focusRow.clock.toFixed(2)} s of its clock, the face "${focusRow.agent}")` : 'NEVER'}; burst ${burstRow ? `${toBurst.toFixed(2)} s after landing (≤ 5), ${(burstRow.clock - focusRow.clock).toFixed(2)} s of its clock after the focus` : 'NEVER'}; the face at 0 ${Number.isFinite(toZero) ? `${toZero.toFixed(2)} s after the burst (≤ 0.5)` : 'never'}; the headset Nosey moved over ${span.toFixed(0)} units after (> 20); instance #${rows[0]?.serial}${rows.every((r) => r.serial === rows[0].serial) ? '' : ' (CHANGED)'}`,
    );
    await page.context().close();
  }
}

async function checkRiveUnfocus(browser) {
  console.log('\nrive unfocus: card 04 stops being the centre card — straight back to the looping face');
  for (const [dpr, route] of [
    [1, 'Next'],
    [2, 'Prev'],
    [2, 'Escape (to the grid)'],
  ]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}× ${route}`;
    await gridMoving(page, 0);
    await page.goto(`${B}#item-04`);
    await page.waitForFunction(() => window.__paper?.state() === 'on' && (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    const hr = await heroRect(page);
    const ptr = movingAround(page, { x: hr.x + hr.w * 0.5, y: hr.y + hr.h + 30 });
    await startRec(page);
    await page.evaluate(() => {
      // The frame the view says card 04 is no longer the centre card: the
      // active item changed (Prev/Next), or the exit started.
      const R = window.__rec;
      const sel = document.querySelector('.detail__select');
      const was = sel?.value;
      const f = () => {
        if (!R.on) return;
        if (document.querySelector('.detail__select')?.value !== was || document.querySelector('.detail[data-phase="exit"]') || !document.querySelector('.detail')) R.mark('left');
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.waitForTimeout(200);
    if (route === 'Next') await page.click('[data-chrome="next"]');
    else if (route === 'Prev') await page.click('[data-chrome="prev"]');
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    await ptr.stop();
    const { rows, marks } = await stopRec(page);
    const left = marks.left;
    const before = rows.filter((r) => left && r.frame < left.frame).at(-1);
    const back = left && rows.find((r) => r.frame >= left.frame && r.burst === 0 && r.face >= 0.999);
    const n = back ? back.frame - left.frame : NaN;
    const parked = back && back.hx <= -4000;
    check(
      before?.burst >= 1 && back && n <= 2 && parked && !back.focused && rows.every((r) => r.serial === rows[0].serial),
      `${tag}: unfocus → the face`,
      `before: burst ${before?.burst}, face ${before?.face?.toFixed(2)}; ${back ? `burst 0 and faceScale 1 ${n} frame(s) after the view left card 04 (≤ 2), the characters ${parked ? 'parked' : 'NOT parked'}, the face "${back.agent}"` : 'NEVER back'}; instance #${rows[0]?.serial}${rows.every((r) => r.serial === rows[0].serial) ? '' : ' (CHANGED)'}`,
    );
    await page.context().close();
  }
}

async function checkRiveDeepLink(browser) {
  console.log('\nrive deep link: #item-04 on load — focused before the first advance, the burst 2.42 s in');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr, {}, () => {
      const R = (window.__deep = { rows: [], first: null });
      const f = () => {
        const r = window.__covers?.rive;
        const i = r?.instance('nosey');
        if (i) {
          const vm = r.viewModel('nosey');
          if (!R.first && i.frames > 0) R.first = { wall: performance.now(), clock: i.clock, focusedAt: i.focusedAt };
          R.rows.push({ wall: performance.now(), clock: i.clock, burst: vm.burst, focused: i.focused, focusedAt: i.focusedAt, serial: i.instances });
        }
        if (R.rows.length < 900) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const tag = `@${dpr}×`;
    await page.goto(`${B}#item-04`, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 160; i++) {
      await page.mouse.move(820 + 40 * Math.sin(i / 3), 380 + 30 * Math.cos(i / 4));
      await page.waitForTimeout(40);
      if (await page.evaluate(() => window.__deep.rows.some((r) => r.burst >= 1) && window.__deep.rows.length > 30)) break;
    }
    const R = await page.evaluate(() => window.__deep);
    const burst = R.rows.find((r) => r.burst >= 1);
    const off = burst ? burst.clock - (R.first?.clock ?? 0) : NaN;
    check(
      !!R.first && R.first.focusedAt === 0 && burst && Math.abs(off - 2.42) <= 0.1 && new Set(R.rows.map((r) => r.serial)).size === 1,
      `${tag} the burst after the first draw`,
      `focused ${R.first?.focusedAt === 0 ? 'from birth (before its first advance)' : `at ${R.first?.focusedAt?.toFixed(2)} s of its clock`}; burst at ${Number.isFinite(off) ? `${off.toFixed(2)} s of its clock` : 'NEVER'} after its first draw (2.42 ± 0.1), ${burst && R.first ? `${((burst.wall - R.first.wall) / 1000).toFixed(2)} s of wall time` : ''}; instances ${[...new Set(R.rows.map((r) => `#${r.serial}`))].join(', ')}`,
    );
    await page.context().close();
  }
}

async function checkRivePointer(browser, { broken = arg('--broken', '') } = {}) {
  console.log('\nrive pointer: real mouse events at the tile and the centre card after the burst, the pointer moving from the first frame');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    const tag = `@${dpr}×`;
    const { st: loaded, ms: loadMs } = await gridMoving(page, 3);
    const waited = loaded ? loaded.at.importing - loaded.at['waiting for idle'] : NaN;
    check(
      loaded?.file === 'loaded' && waited <= 1100,
      `${tag} loads with the pointer moving`,
      loaded ? `${loaded.file} ~${loadMs} ms after navigation; waited ${waited} ms for a quiet moment (≤ 1100: the deadline), bytes ready at +${loaded.at['waiting for idle']} ms, imported at +${loaded.at.loaded} ms` : 'never loaded',
    );
    if (loaded?.file !== 'loaded') {
      await page.context().close();
      continue;
    }
    await page.waitForTimeout(600);
    await quiet(page);
    await flatGrid(page);
    if (broken === 'pointer') {
      await page.evaluate(() => {
        const st = document.createElement('style');
        st.textContent = '.cover-tile, .detail__panel { pointer-events: none !important; }';
        document.head.append(st);
      });
    }
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
      await page.waitForTimeout(60);
      return { x, y };
    };
    const ptr = () => page.evaluate(() => ({ vm: window.__covers.rive.viewModel('nosey'), st: window.__covers.rive.status('nosey') }));
    const crop = (r) => {
      const a = r.w / r.h;
      const img = RFRAME.w / RFRAME.h;
      return img > a ? { x0: (RFRAME.w - RFRAME.h * a) / 2, y0: 0, w: RFRAME.h * a, h: RFRAME.h } : { x0: 0, y0: (RFRAME.h - RFRAME.w / a) / 2, w: RFRAME.w, h: RFRAME.w / a };
    };
    const want = (r, p) => {
      const c = crop(r);
      return { x: c.x0 + ((p.x - r.x) / r.w) * c.w, y: c.y0 + ((p.y - r.y) / r.h) * c.h };
    };
    // The grid tile: unfocused, the pointer does nothing to the face (by
    // design, for now); the instance still receives it, through the crop.
    {
      const a = await hold(tile, 0.12, 0.5, 600);
      const A = await ptr();
      const wa = want(tile, a);
      const ours = A.st.pointers.tile;
      check(
        ours && ours.kind === 'move' && Math.abs(ours.x - wa.x) <= 2 && Math.abs(ours.y - wa.y) <= 2,
        `${tag} the focused grid tile`,
        `the instance got the card's events (${ours?.n ?? 0} so far), the last a ${ours?.kind} at (${ours?.x}, ${ours?.y}) in artboard space, wanted (${wa.x.toFixed(1)}, ${wa.y.toFixed(1)}); the file mirrors ptrX/ptrY (${A.vm.ptrX.toFixed(1)}, ${A.vm.ptrY.toFixed(1)}) — unfocused, the face does not follow it`,
      );
    }
    // Over the hover overlay's CTA: still moves on the tile, not an exit.
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
      const w = want(tile, cta);
      const got = (await ptr()).st.pointers.tile;
      check(
        /card-overlay__cta/.test(String(cta.top)) && got?.kind === 'move' && Math.abs(got.x - w.x) <= 2 && Math.abs(got.y - w.y) <= 2,
        `${tag} over the overlay's CTA`,
        `on top: ${String(cta.top).split(' ')[0]}; the instance's last event from the tile: ${got?.kind} at (${got?.x}, ${got?.y}), wanted (${w.x.toFixed(1)}, ${w.y.toFixed(1)})`,
      );
    } else bad(`${tag} over the overlay's CTA`, 'no overlay CTA on the hovered card');
    // The centre card after the burst, reached by clicking the tile, and by a
    // direct load.
    const centre = async (label) => {
      const hr = await heroRect(page);
      const sweep = movingAround(page, async () => ({ x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.45 }));
      const burst = await page
        .waitForFunction(() => (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 9000 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(400);
      await sweep.stop();
      const a = await hold(hr, 0.15, 0.5, 700);
      const A = await ptr();
      const b = await hold(hr, 0.85, 0.5, 700);
      const Bp = await ptr();
      const wa = want(hr, a);
      const wb = want(hr, b);
      const near = (vm, w) => Math.abs(vm.ptrX - w.x) <= 2 && Math.abs(vm.ptrY - w.y) <= 2;
      // Alive: advancing, uploaded, bouncing, one instance, through three
      // 450 ms frames (a loaded machine's arrival).
      const r0 = await nosey(page);
      const up0 = r0.st.plane?.uploads ?? 0;
      const live = movingAround(page, async () => ({ x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.4 }));
      await page.waitForTimeout(600);
      await page.evaluate(async () => {
        for (let k = 0; k < 3; k++) {
          await new Promise((r) => requestAnimationFrame(r));
          const t = performance.now();
          while (performance.now() - t < 450);
        }
      });
      await page.waitForTimeout(900);
      await live.stop();
      const r1 = await nosey(page);
      const moved = Math.hypot(r1.vm.headsetX - r0.vm.headsetX, r1.vm.headsetY - r0.vm.headsetY);
      check(
        burst && A.st.pointer?.from === 'centre' && near(A.vm, wa) && near(Bp.vm, wb),
        `${tag} ${label}: the pointer after the burst`,
        `burst ${burst}; events from the centre panel, mirrored by the file at (${A.vm.ptrX.toFixed(1)}, ${A.vm.ptrY.toFixed(1)}) / (${Bp.vm.ptrX.toFixed(1)}, ${Bp.vm.ptrY.toFixed(1)}) — wanted (${wa.x.toFixed(1)}, ${wa.y.toFixed(1)}) / (${wb.x.toFixed(1)}, ${wb.y.toFixed(1)}), ${Bp.st.pointers.centre?.n ?? 0} in all`,
      );
      check(
        r1.i.frames - r0.i.frames > 30 && (r1.st.plane?.uploads ?? 0) - up0 > 30 && r1.st.plane?.shows === 'live' && r1.st.plane?.slot === 'centre' && moved > 20 && r1.i.instances === r0.i.instances,
        `${tag} ${label}: alive`,
        `${r1.i.frames - r0.i.frames} frames advanced and ${(r1.st.plane?.uploads ?? 0) - up0} uploads in ~2 s, the plane ${r1.st.plane?.shows} (${r1.st.plane?.slot}); the headset Nosey moved ${moved.toFixed(0)} units; instance #${r0.i.instances} → #${r1.i.instances} through three 450 ms frames`,
      );
    };
    await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h * 0.62);
    await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
    await centre('the centre card after the morph');
    await page.goto('about:blank');
    await page.goto(`${B}#item-04`, { waitUntil: 'domcontentloaded' });
    const d0 = Date.now();
    let live = false;
    for (let i = 0; i < 150 && !live; i++) {
      await page.mouse.move(820 + 40 * Math.sin(i / 3), 380 + 30 * Math.cos(i / 4));
      await page.waitForTimeout(40);
      live = await page.evaluate(() => window.__covers?.rive.status('nosey').plane?.shows === 'live');
    }
    check(live && Date.now() - d0 <= 4000, `${tag} direct load: the centre card goes live`, live ? `the plane live ${Date.now() - d0} ms after navigation, the pointer moving (≤ 4000)` : 'never live');
    if (live) {
      await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 10000 });
      if (broken === 'pointer') {
        await page.evaluate(() => {
          const st = document.createElement('style');
          st.textContent = '.cover-tile, .detail__panel { pointer-events: none !important; }';
          document.head.append(st);
        });
      }
      await quiet(page);
      await centre('the centre card on a direct load');
    }
    await page.context().close();
  }
}

/** Tablets (docs/mobile.md): a finger stands in for the hover — card 04's
 *  pointer moves while it is down, and lifting it is an exit. */
async function checkRiveTouch(browser, { broken = arg('--broken', '') } = {}) {
  console.log('\nrive touch: a tablet — the tap opens card 04, the burst as on a desktop, a finger drives its pointer');
  const page = await newPage(browser, { width: 1180, height: 820 }, 2, { hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  const media = async () => page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches }));
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__covers?.rive.ready('nosey'), null, { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(900);
  const m = await media();
  const tile = await focusedTile(page);
  await startRec(page);
  await page.touchscreen.tap(tile.x + tile.w / 2, tile.y + tile.h * 0.6);
  await page.waitForFunction(() => document.querySelector('.detail[data-phase="active"]'), null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => window.__rec.mark('landed'));
  await page.waitForFunction(() => (window.__covers.rive.viewModel('nosey')?.burst ?? 0) >= 1, null, { timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(300); // the recorder's next frames
  const { rows, marks } = await stopRec(page);
  const burstRow = rows.find((r) => r.burst >= 1);
  const toBurst = burstRow && marks.landed ? (burstRow.wall - marks.landed.wall) / 1000 : NaN;
  check(
    !!burstRow && toBurst <= 5 && rows.every((r) => r.serial === rows[0].serial),
    'a tap on the tile → the centre card bursts',
    `(pointer: coarse) ${m.coarse}, (hover: hover) ${m.hover}; burst ${Number.isFinite(toBurst) ? `${toBurst.toFixed(2)} s after landing (≤ 5)` : 'NEVER'}; instance #${rows[0]?.serial}${rows.every((r) => r.serial === rows[0].serial) ? '' : ' (CHANGED)'}`,
  );
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 10000 }).catch(() => {});
  if (broken === 'pointer') {
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.detail__panel { pointer-events: none !important; }';
      document.head.append(st);
    });
  }
  const hr = await heroRect(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const at = (u, v) => ({ x: hr.x + u * hr.w, y: hr.y + v * hr.h });
  const p0 = at(0.3, 0.5);
  await touch('touchStart', p0.x, p0.y);
  let last = p0;
  for (let i = 1; i <= 20; i++) {
    last = at(0.3 + (0.5 * i) / 20, 0.5 + 0.1 * Math.sin(i / 3));
    await touch('touchMove', last.x, last.y);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(80);
  const down = await page.evaluate(() => ({ vm: window.__covers.rive.viewModel('nosey'), st: window.__covers.rive.status('nosey') }));
  await touch('touchEnd', last.x, last.y);
  await page.waitForTimeout(120);
  const up = await page.evaluate(() => window.__covers.rive.status('nosey').pointers.centre);
  const a = hr.w / hr.h;
  const c = RFRAME.w / RFRAME.h > a ? { x0: (RFRAME.w - RFRAME.h * a) / 2, y0: 0, w: RFRAME.h * a, h: RFRAME.h } : { x0: 0, y0: (RFRAME.h - RFRAME.w / a) / 2, w: RFRAME.w, h: RFRAME.w / a };
  const w = { x: c.x0 + ((last.x - hr.x) / hr.w) * c.w, y: c.y0 + ((last.y - hr.y) / hr.h) * c.h };
  const ok = Math.abs(down.vm.ptrX - w.x) <= 3 && Math.abs(down.vm.ptrY - w.y) <= 3;
  check(
    ok && down.st.pointers.centre?.kind === 'move' && up?.kind === 'exit',
    'a finger on the centre card after the burst',
    `while down: the file's ptrX/ptrY (${down.vm.ptrX.toFixed(1)}, ${down.vm.ptrY.toFixed(1)}), wanted (${w.x.toFixed(1)}, ${w.y.toFixed(1)}), ${down.st.pointers.centre?.n ?? 0} events; lifted: the last event ${up?.kind ?? 'none'}`,
  );
  await page.context().close();
}

/** The phone door (docs/mobile.md) shows card 04's still and never loads Rive. */
async function checkRivePhone(browser, { broken = arg('--broken', '') } = {}) {
  console.log('\nrive phone: the door shows card 04\'s still, and loads no Rive');
  const page = await newPage(browser, { width: 390, height: 844 }, 3, { hasTouch: true, isMobile: true }, broken === 'phone' ? () => fetch('/projects/nosey/cover.riv') : null);
  const asked = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.goto(`${B}#view-04`, { waitUntil: 'networkidle' });
  const where = page.url();
  const img = await page
    .waitForFunction(() => {
      const el = document.querySelector('.ph-project__cover');
      return el && el.complete && el.naturalWidth > 0 ? { src: el.getAttribute('src'), w: el.naturalWidth, h: el.naturalHeight } : null;
    }, null, { timeout: 10000 })
    .then((h) => h.jsonValue())
    .catch(() => null);
  let blue = NaN;
  if (img) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('.ph-project__cover').getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    const shot = await grab(page, r, 3, 150, 200);
    blue = blueShare(shot);
    await sharp(await page.screenshot()).toFile('.context/rphone.png').catch(() => {});
  }
  // The runtime (dev: a pre-bundled @rive-app dep; build: an assets/rive-*.js
  // chunk), its wasm, or a .riv.
  const rive = asked.filter((u) => /\.riv(\?|$)|rive\.wasm|@rive-app|\/assets\/rive-[^/]*\.js/.test(u));
  check(
    /phone\.html/.test(where) && img?.src === '/projects/nosey/cover-still.webp' && blue > 0.3 && rive.length === 0,
    'the door\'s project 04',
    `${where.replace(ORIGIN, '')}; the cover ${img ? `${img.src} (${img.w}×${img.h}), ${pct(blue)} of it the blue ground` : 'not shown'}; Rive requests: ${rive.length ? rive.map((u) => u.replace(ORIGIN, '')).join(', ') : 'none'} (of ${asked.length})`,
  );
  await page.context().close();
}

async function checkRiveClick(browser) {
  console.log('\nrive click: a click on the centre card opens the project');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await heroOn04(page);
    const hr = await heroRect(page);
    await page.mouse.move(hr.x + hr.w * 0.4, hr.y + hr.h * 0.3, { steps: 4 });
    await page.mouse.click(hr.x + hr.w * 0.5, hr.y + hr.h * 0.35);
    await page.waitForFunction(() => location.hash.startsWith('#view-04'), null, { timeout: 5000 }).catch(() => {});
    const hash = await page.evaluate(() => location.hash);
    check(hash.startsWith('#view-04'), `@${dpr}× a click on the centre card opens the project`, `hash ${hash || '(none)'}`);
    await page.context().close();
  }
}

/** Card 02's live side card, the generic path (not enabled in the manifest):
 *  forced on in dev, card 03 the hero, card 02 beside it on the paper live. */
async function checkSideShader(browser) {
  console.log('\nside live (shader): card 02 forced live as a side card — the generic path, not enabled');
  const page = await newPage(browser, VIEWPORTS[0], 2, {}, () => (window.__coversSideLive = ['rive-site']));
  await page.goto(`${B}#item-03`);
  await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__covers, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await quiet(page);
  const r = await page.evaluate(() => {
    for (const el of document.querySelectorAll('.detail__panel[data-idx="1"]')) {
      const b = el.getBoundingClientRect();
      if (b.right > 0 && b.left < innerWidth) {
        const x0 = Math.max(0, b.x);
        const x1 = Math.min(innerWidth, b.right);
        return { x: x0, y: b.y, w: x1 - x0, h: b.height };
      }
    }
    return null;
  });
  const n0 = await page.evaluate(() => window.__paper.coversDrawn());
  const a = await grab(page, r, 2, 150, 195);
  await page.waitForTimeout(1500);
  const b = await grab(page, r, 2, 150, 195);
  const n1 = await page.evaluate(() => window.__paper.coversDrawn());
  const dom = await page.evaluate(() => [...document.querySelectorAll('.detail__panel[data-idx="1"] .cover-tile__canvas')].length);
  const moved = diff(a, b);
  check(n1 - n0 > 30 && moved > 0.01 && dom > 0, 'card 02 beside card 03, on the paper', `the paper drew live covers ${n1 - n0} times in 1.5 s; ${pct(moved)} of the side card's pixels moved; ${dom} DOM side canvas(es)`);
  await page.context().close();
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
  // Card 04's behaviour checks run in real Chrome (CDP input, as a person's
  // pointer reaches it); the rest, and rbudgets (its numbers are compared
  // with earlier runs), in the bundled Chromium as before.
  let real = null;
  const chrome = async () => (real ??= await chromium.launch({ channel: "chrome", args: GPU }));
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
    if (ONLY.includes('rgrid')) await checkRiveGrid(await chrome());
    if (ONLY.includes('rside')) await checkRiveSide(await chrome());
    if (ONLY.includes('rjump')) await checkRiveJump(await chrome());
    if (ONLY.includes('rfocus')) await checkRiveFocus(await chrome());
    if (ONLY.includes('runfocus')) await checkRiveUnfocus(await chrome());
    if (ONLY.includes('rdeep')) await checkRiveDeepLink(await chrome());
    if (ONLY.includes('rpointer')) await checkRivePointer(await chrome());
    if (ONLY.includes('rtouch')) await checkRiveTouch(await chrome());
    if (ONLY.includes('rphone')) await checkRivePhone(await chrome());
    if (ONLY.includes('rclick')) await checkRiveClick(browser);
    if (ONLY.includes('rreduced')) await checkRiveReduced(browser);
    if (ONLY.includes('rsky')) await checkRiveSky(browser);
    if (ONLY.includes('rground')) await checkRiveGround(browser);
    if (ONLY.includes('rcontexts')) await checkRiveContexts(browser);
    if (ONLY.includes('sidelive')) await checkSideShader(browser);
    const side = { B, newPage, check, quiet, grab, diff, heroRect, focusedTile, movingAround, pctl, mean, pct, ms, VIEWPORT: VIEWPORTS[0], errors };
    if (ONLY.includes('sside')) await checkSideLive({ ...side, browser: await chrome() });
    if (ONLY.includes('sjump')) await checkSideJump({ ...side, browser: await chrome() });
    if (ONLY.includes('sbudgets')) {
      const viewports = arg('--side-budget-viewports', '1728x996@1,1728x996@2,1440x900@1,1440x900@2,2560x1440@2')
        .split(',')
        .map((v) => {
          const [wh, d] = v.split('@');
          const [width, height] = wh.split('x').map(Number);
          return [{ width, height }, Number(d)];
        });
      const rows = await checkSideBudgets({ ...side, browser: await chrome(), viewports });
      const out = arg('--side-json', null);
      if (out) await writeFile(out, JSON.stringify({ origin: ORIGIN, rows }, null, 2));
    }
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
    await real?.close();
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
