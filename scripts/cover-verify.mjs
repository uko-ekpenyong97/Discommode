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
 * Pixel checks hide the sky and the dev overlays, as verify:detail does, except
 * `sky`, which is about the sky. A pixel differs past 32 levels (verify:detail's
 * tolerance).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg('--only', 'budgets,clock,morph,reduced,nogl,contexts,sky,ground').split(',');
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
      const pres = await page.evaluate(() => window.__covers.presenters().filter((p) => p.visible));
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
  const r = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.cover-tile').length,
    canvases: document.querySelectorAll('.cover-tile__canvas').length,
    stills: [...document.querySelectorAll('.cover-tile__still')].filter((i) => i.complete && i.naturalWidth > 0 && getComputedStyle(i).visibility !== 'hidden').length,
  }));
  check(r.tiles > 0 && r.canvases === 0 && r.stills === r.tiles, 'grid', `${r.tiles} tiles, ${r.stills} showing the still, ${r.canvases} canvases`);
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
