/**
 * The live covers, in Chrome. `npm run verify:cover` with the dev server running
 * (`npm run dev`; `--url <origin>` for another — in a worktree, always pass it:
 * :5173 is usually another checkout's). `--only budgets,clock,morph,reduced,
 * nogl,contexts,sky,ground` for a subset. See docs/covers.md.
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
 *                           own + every visible tile's copy; in the
 *                           detail view, the hero                   ≤ 1.2
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
 *             one per tile.
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
 *             It fails on each way this path broke or could: the old 10 s idle
 *             deadline ("never loaded"), events kept from the cover (ptrX/ptrY
 *             stay 0), and the tile-only listener (an exit over the CTA).
 *   rclick    a click on the headset Nosey changes the headset's colour: the
 *             pointer moved onto its cup and pressed, against the same second
 *             with no pointer — the headset's colour is another one. In the
 *             file the colour steps on POINTER-ENTER of the headset (the
 *             listener "Headset.Pointer.Enter" fires its Click trigger; Main
 *             Bounce's bumps fire it too) — there is no press listener — so
 *             a press with the pointer already on it is printed too: it adds
 *             nothing. That is the .riv's wiring (docs/covers.md).
 *   rreduced  reduced motion: card 04's tiles and hero are the still, the
 *             runtime is never loaded, nothing moves in 1s.
 *   rsky      a patch of Main's empty ground over NOON and NIGHT: > 20% apart.
 *   rground   as `ground`, on card 04's hero (most of it IS ground: no stock);
 *             the control is coverBackdrop 'solid', which has to fail.
 *   rcontexts WebGL contexts with card 04 live, grid and #item-04: the same
 *             bounds as `contexts`, and none of them made by the Rive runtime.
 *
 * Pixel checks hide the sky and the dev overlays, as verify:detail does, except
 * `sky`, which is about the sky. A pixel differs past 32 levels (verify:detail's
 * tolerance).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg(
  '--only',
  'budgets,clock,morph,reduced,nogl,contexts,sky,ground,rbudgets,rswap,rpointer,rclick,rreduced,rsky,rground,rcontexts',
).split(',');
const B = `${ORIGIN}/`;
const GPU = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const VIEWPORTS = [
  { width: 1728, height: 996 },
  { width: 1440, height: 900 },
];
const TOL = 32;
const BUDGET = { hero: 1.0, tile: 0.15, total: 1.2, all: 8 };
/** Main's WebGL contexts: the sky's (grid), plus the paper's (detail view). */
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
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const pct = (x) => `${(100 * x).toFixed(2)}%`;
const ms = (x) => `${x.toFixed(3)}ms`;

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
      '.grid-card__fade { opacity: 1 !important; } .grid-card__face { filter: none !important; box-shadow: none !important; }' +
      '.grid-card__index { visibility: hidden !important; }';
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
    for (const el of document.querySelectorAll('.grid-card .cover-tile')) {
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

// ── budgets ─────────────────────────────────────────────────────────────

async function checkBudgets(browser) {
  console.log('\nbudgets: GPU ms per frame (M1 Max numbers in docs/covers.md)');
  for (const vp of VIEWPORTS) {
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, vp, dpr);
      await gridOn02(page);
      const pres = await page.evaluate(() => window.__covers.presenters().filter((p) => p.visible && p.cover === 'rive-site'));
      const big = pres.reduce((a, p) => (p.pxW > a.pxW ? p : a), { pxW: 0, pxH: 0 });
      const sharedCost = await page.evaluate(([w, h]) => window.__covers.benchStage('rive-site', w, h), [big.pxW, big.pxH]);
      const shared = sharedCost.ms;
      const copy = await page.evaluate(([w, h]) => window.__covers.benchPresent(w, h), [big.pxW, big.pxH]);
      // Hovered: the tile under the pointer is drawn again, for itself, at its size.
      const hovered = shared;
      const gridTotal = shared + hovered + pres.length * copy;
      const sky = await page.evaluate(() => {
        const t = window.__skyBenchmark?.(300, 10, true) ?? [];
        t.sort((a, b) => a - b);
        return t.length ? t[Math.floor(t.length * 0.95)] : NaN;
      });
      await heroOn02(page);
      await page.mouse.move(3, 3);
      const hero = await page.evaluate(() => window.__paper.benchCover());
      const detailTotal = hero ? hero.ms : NaN;
      const total = Math.max(gridTotal, detailTotal);
      const tag = `${vp.width}×${vp.height} @${dpr}×`;
      check(hero && hero.ms <= BUDGET.hero, `${tag} hero`, `${hero ? `${hero.pxW}×${hero.pxH} ${ms(hero.ms)} (+ floor ${ms(hero.floor)} = ${ms(hero.total)})` : 'no hero draw'} ≤ ${BUDGET.hero}`);
      check(copy <= BUDGET.tile, `${tag} tile`, `${pres.length} visible, each ${ms(copy)} (copy) ≤ ${BUDGET.tile}; the shared draw ${big.pxW}×${big.pxH} ${ms(shared)} (+ floor ${ms(sharedCost.floor)})`);
      check(total <= BUDGET.total, `${tag} total`, `grid ${ms(gridTotal)} (shared + hovered + ${pres.length} copies), detail ${ms(detailTotal)} ≤ ${BUDGET.total}`);
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

async function checkMorph(browser) {
  console.log('\nmorph: grid → detail from the tile, the last morph frame vs the DOM hero');
  const T = 4.5;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await gridOn02(page);
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
    check(d <= 0.02, `@${dpr}× morph → DOM hero`, `${pct(d)} of pixels differ ≤ 2%`);
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
    check(d2 <= 0.02, `@${dpr}× DOM hero → paper`, `${pct(d2)} of pixels differ ≤ 2%`);
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
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  check(grid.canvases === 0 && grid.stills > 0 && moved === 0, 'grid', `${grid.stills} tiles on the still, ${grid.canvases} cover canvases, ${moved} bytes changed over 1s`);
  await heroOn02(page, { settle: false });
  await quiet(page);
  await page.waitForTimeout(500);
  const drawn = await page.evaluate(() => window.__paper.coversDrawn());
  const c = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const d = await sharp(await page.screenshot()).raw().toBuffer();
  let moved2 = 0;
  for (let i = 0; i < c.length; i++) if (c[i] !== d[i]) moved2++;
  check(drawn === 0 && moved2 === 0, 'detail hero', `paper drew the live cover ${drawn} times (0 = the still), ${moved2} bytes changed over 1s`);
  await page.context().close();
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
  const grid = await page.evaluate(() => ({ n: window.__gl.size, tiles: document.querySelectorAll('.cover-tile__canvas').length }));
  await page.goto(`${B}#item-02`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  const detail = await page.evaluate(() => window.__gl.size);
  check(grid.n <= MAIN_CONTEXTS.grid + 1, 'grid', `${grid.n} contexts (main ${MAIN_CONTEXTS.grid}, +1: the cover stage) for ${grid.tiles} live tiles`);
  check(detail <= MAIN_CONTEXTS.detail + 1, 'detail', `${detail} contexts (main ${MAIN_CONTEXTS.detail}, +1: the cover stage)`);
  await page.context().close();
}

// ── the sky through the ground ──────────────────────────────────────────

async function checkSky(browser) {
  console.log('\nsky: the cover ground over NOON and over NIGHT');
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
    // The labels are the DOM hero's alone (the name, its line, the number):
    // this compares the cover.
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = '.detail__panel-meta, .detail__panel-num, .grid-card__index { visibility: hidden !important; }';
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
      check(
        onCard && A.st?.role === role && Bp.st?.role === role && near(A.vm, wa) && near(Bp.vm, wb) && tA !== tB && pixels,
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
    await page.waitForTimeout(600);
    await judge('hero', await heroRect(page), 'the hero, on the paper');
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
  console.log('\nrive click: onto the headset Nosey and press — its colour changes');
  const T = 2;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await heroOn04(page);
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    const cup = async (hr) => {
      const vm = await page.evaluate(() => window.__covers.rive.viewModel('nosey', 'hero'));
      const b = heroBox(hr, vm.headsetX + HEADSET.cup.x, vm.headsetY + HEADSET.cup.y, 0, 0);
      return b;
    };
    const none = await heroRun(page, dpr, T, {});
    const click = await heroRun(page, dpr, T, {
      mid: async (hr) => {
        const b = await cup(hr);
        await page.mouse.move(b.x, b.y, { steps: 3 });
        await page.mouse.down();
        await page.mouse.up();
      },
    });
    // The press alone: the pointer arrives on the cup a quarter-second early,
    // then presses there (vs arriving and not pressing).
    const arrive = async (hr, press) => {
      const b = await cup(hr);
      await page.mouse.move(b.x, b.y, { steps: 3 });
      await step(page, T + 0.5, 15);
      if (press) {
        await page.mouse.down();
        await page.mouse.up();
      }
    };
    const hoverOnly = await heroRun(page, dpr, T, { mid: (hr) => arrive(hr, false) });
    const pressOnly = await heroRun(page, dpr, T, { mid: (hr) => arrive(hr, true) });
    const a = hues(none.img);
    const b = hues(click.img);
    check(
      a.top !== 'none' && b.top !== 'none' && a.top !== b.top,
      `@${dpr}× clicked vs no pointer, 0.5s after`,
      `the headset is ${b.top} (no pointer: ${a.top}); ${pct(diff(none.img, click.img))} of its region differs`,
    );
    console.log(
      `      a press with the pointer already on it (not held to a bar): ${pct(diff(hoverOnly.img, pressOnly.img))} of the region differs; ${hues(hoverOnly.img).top} → ${hues(pressOnly.img).top}`,
    );
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
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  check(
    grid.tiles > 0 && grid.canvases === 0 && grid.stills === grid.tiles && !grid.loaded && moved === 0,
    'grid',
    `${grid.stills} of ${grid.tiles} tiles on the still, ${grid.canvases} canvases, runtime loaded: ${grid.loaded}, ${moved} bytes changed over 1s`,
  );
  await heroOn04(page, { settle: false });
  await quiet(page);
  const hr = await heroRect(page);
  await page.waitForTimeout(500);
  const c = await sharp(await page.screenshot()).raw().toBuffer();
  await page.waitForTimeout(1000);
  const d = await sharp(await page.screenshot()).raw().toBuffer();
  let moved2 = 0;
  for (let i = 0; i < c.length; i++) if (c[i] !== d[i]) moved2++;
  // …and the pointer across it loads nothing either.
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(hr.x + hr.w * (0.2 + 0.06 * i), hr.y + hr.h * 0.3);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ uploads: window.__paper.riveUploads().n, loaded: window.__covers.rive.ready('nosey') }));
  check(r.uploads === 0 && !r.loaded && moved2 === 0, 'detail hero', `paper uploaded the live cover ${r.uploads} times, runtime loaded: ${r.loaded} (after the pointer crossed it), ${moved2} bytes changed over 1s`);
  await page.context().close();
}

async function checkRiveSky(browser) {
  console.log("\nrive sky: Main's empty ground over NOON and over NIGHT");
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
    // The panel's name and number are DOM over the hero: out of the way, so the
    // mask is the cover's alone.
    await under('.detail__panel-meta, .detail__panel-num { visibility: hidden !important; } .sky-layer { visibility: hidden !important; } html, body, #root { background: #000 !important; }');
    const k = await raw();
    await under('.detail__panel-meta, .detail__panel-num { visibility: hidden !important; } .sky-layer { visibility: hidden !important; } html, body, #root { background: #fff !important; }');
    const w = await raw();
    await under('.detail__panel-meta, .detail__panel-num { visibility: hidden !important; }');
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
        window.__gl.push({ rive: /rive-app|rive\.js/i.test(new Error().stack ?? '') });
      }
      return c;
    };
  });
  await gridOn04(page);
  const grid = await page.evaluate(() => ({
    n: window.__gl.length,
    rive: window.__gl.filter((g) => g.rive).length,
    tiles: document.querySelectorAll('.cover-tile[data-cover="nosey"] .cover-tile__canvas').length,
  }));
  await page.goto(`${B}#item-04`);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const detail = await page.evaluate(() => ({ n: window.__gl.length, rive: window.__gl.filter((g) => g.rive).length }));
  check(grid.n <= MAIN_CONTEXTS.grid + 1 && grid.rive === 0, 'grid', `${grid.n} contexts (main ${MAIN_CONTEXTS.grid}, +1: card 02's stage) with ${grid.tiles} card-04 tiles live; ${grid.rive} made by the Rive runtime`);
  check(detail.n <= MAIN_CONTEXTS.detail + 1 && detail.rive === 0, 'detail #item-04', `${detail.n} contexts; ${detail.rive} made by the Rive runtime`);
  await page.context().close();
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
    if (ONLY.includes('rbudgets')) await checkRiveBudgets(browser);
    if (ONLY.includes('rswap')) await checkRiveSwap(browser);
    if (ONLY.includes('rpointer')) await checkRivePointer(browser);
    if (ONLY.includes('rclick')) await checkRiveClick(browser);
    if (ONLY.includes('rreduced')) await checkRiveReduced(browser);
    if (ONLY.includes('rsky')) await checkRiveSky(browser);
    if (ONLY.includes('rground')) await checkRiveGround(browser);
    if (ONLY.includes('rcontexts')) await checkRiveContexts(browser);
  } finally {
    await browser.close();
  }
  const noise = errors.filter((e) => !/Download the React DevTools|favicon|webgl|WebGL/i.test(e));
  check(noise.length === 0, 'no page errors', noise.slice(0, 3).join(' | '));
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
