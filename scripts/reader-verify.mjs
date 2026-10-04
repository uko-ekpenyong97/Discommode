/**
 * The reader, in Chrome. `npm run verify:reader` with the dev server running
 * (`npm run dev`; `--url` for another origin, `--runs N` for the frame budget,
 * `--only frames,zorder,nav,exit,hover,life,sky,pageanims,pageclip,quote` for a subset;
 * `--quote-pages 2,39` for some of the quote pages).
 *
 * Every check here is one the unit tests cannot make, because each is a question
 * about what the browser DRAWS or when it draws it:
 *
 *   riffle frame budget   real 20→0 and 0→20 riffles at 1× and 2×: no frame over
 *                         20ms (rAF intervals). An ordinary Next from the cover is
 *                         measured beside it and reported, not asserted — it is
 *                         the baseline a riffle's first leaf shares.
 *   riffle landing        after every one of those: hash, caption, data-pos and
 *                         the rendered pages agree, and the turn layer is gone.
 *   riffle z-order        pixel-exact. The riffle is held at every 60Hz frame
 *                         (`__flip.probe`), its leaves painted flat hues; every
 *                         pair in the air is rendered alone and together, and
 *                         where both cover a pixel the combined frame must show
 *                         the more upright leaf. Hinge antialiasing allowed: at
 *                         most 1 in 10,000 overlap pixels.
 *   navigation            Prev / Next / arrows / drag / Home / End / Cover / Back
 *                         cover all land on one spread index; input during a
 *                         riffle is ignored; Escape mid-riffle lands, then exits.
 *   layout                the Studio Display's spacing at 2560×1440, 1920×1080,
 *                         1728×1117, 1512×982, 1440×900 and 1280×720, at the
 *                         cover, 07 | 08 and the back: the margins, the chrome
 *                         and the gaps to the book are the spec to ±2px (× k
 *                         where the chrome shrank), no paper over the book, the
 *                         open book inside the side gaps, the top shape is
 *                         "Close" (scripts/layout-checks.mjs). A screenshot per
 *                         viewport to `--shots` (default .context/layout/).
 *   pill vs Escape        the doorway exit from each, screencast three times; the
 *                         Escape exit must pass through a frame the pill exit
 *                         also shows (to under 0.1% of pixels), and both end on
 *                         #item-01 with the reader unmounted.
 *   hover loops           libros (cover) and riddim (back) keep changing frames
 *                         for more than three passes while hovered; on leave the
 *                         pass in flight finishes before the still returns. And
 *                         the back layer exists only at rest on the last spread.
 *   cover life            the closed cover and the closed back, 1× and 2×
 *                         (src/reader/coverLife.ts): hovering the page on no
 *                         object has every object on the face playing within
 *                         200ms; during the boil, sampled 10 times, the book's
 *                         static slot (the face) and every sprite sit where the
 *                         slot's own transform puts them, to ≤ 0.5px; no frame
 *                         over 20ms; leaving, each object is home within its
 *                         pass + stagger + fade and nothing is moved at all.
 *                         Writes docs/reader-nav/boil-steps.webp.
 *   the sky (`sky`)        the ground is the app's one sky (ReaderGround.tsx):
 *                         ONE canvas and no new WebGL context when the reader
 *                         opens, the canvas in the app while TABLE < 1 and in
 *                         the ground once it is 1, and back after the exit;
 *                         the hand-over at TABLE 1 changes no pixels; the
 *                         reader's sky is the grid's sky, pixel for pixel;
 *                         a page flip and a riffle wake the sky's field (and
 *                         at readerFlipSplat 0 a flip does not); and the frame
 *                         budget — main-thread work per frame during page
 *                         flips plus the sky's own GPU frame with the fluid
 *                         awake, ≤ 8ms at p95, at 1× and 2× (a riffle's is
 *                         reported beside it), and 60fps through both.
 *   inside-page animations (`pageanims`) spread 17 | 18 at 1× and 2×: both
 *                         sprite canvases draw, backed at the DPR, and step;
 *                         each loop's first drawn frame after a settle (on
 *                         open, after a cancelled turn, after a real Prev) is
 *                         its rest frame; held mid-turn and on every frame of a
 *                         real Next and Prev, no plate or sprite is shown while
 *                         a turn layer is up, and the strips and static slots
 *                         carry the baked pages; reduced motion holds the rest
 *                         frame. Spread 4 (07 | 08) at 1×: badges, sampled
 *                         every frame for 3 s, holds each frame its Procreate
 *                         ticks (2,2,1,2,5,2 at 6fps, from its APNG) in order
 *                         from its rest frame. The frame budget is gated on the machine: the
 *                         animated spread interleaved with a plain one (19 | 20),
 *                         asserted only when the plain one is clean; the load
 *                         average is printed.
 *   sprites cut at the paper (`pageclip`) spread 2 (03 | 04), whose
 *                         sprites run off their pages, at 1× and 2×: each
 *                         canvas is exactly its paper in a clipping slot, the
 *                         drawings reach the edges they leave by, at rest the
 *                         layer changes no pixel off the paper and each sprite
 *                         agrees ≥ 85% with the print over the drawing; through
 *                         Next/Prev both ways, a drag and a riffle the layer
 *                         never shows with a leaf up, and held mid-turn it adds
 *                         no pixel anywhere.
 *   chapter-break quotes  (`quote`, scripts/quote-checks.mjs) every quote
 *                         page — 02, 05, 12, 21, 29, 39; `--quote-pages 2,39`
 *                         for some: the Spanish layer against the printed page,
 *                         at 2000×2600 (each line registered, the ink, its
 *                         colours, the differing pixels) and on screen at 1×
 *                         and 2×; a click on the quote translates and turns
 *                         nothing, a click elsewhere and a drag from the quote
 *                         turn; the morph ends on the English layout; a turn
 *                         mid-morph shows the English bake, never the plate;
 *                         away and back is Spanish; the wand, the grow, the
 *                         breath, the turn ease, the keyboard, touch, reduced
 *                         motion. And 02 beside the cover: the doorway's open
 *                         onto 01 | 02 and Prev back to the cover.
 *
 * The z-order and exit checks photograph the book over the sky now, so they
 * hold the sky still first (`stillSky`: its clock pinned, its wake frozen) —
 * two captures must differ only by what the reader did.
 *
 * It drives the reader through `window.__flip`, the dev-only engine handle, and
 * its `probe` (hold a riffle at any ms, paint leaves flat hues, read their state).
 */
import os from 'node:os';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { atRest, boilSteps, emptyPoint, hoverAll, judgeLeave, leaveAll, registration } from './cover-life-checks.mjs';
import { checkLayout } from './layout-checks.mjs';
import { checkQuote } from './quote-checks.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const RUNS = Number(arg('--runs', 5));
/** `--only frames,zorder,nav,folios,layout,exit,hover,life,sky,pageanims,pageclip,quote` runs just those sections. */
const ONLY = arg('--only', 'frames,zorder,nav,folios,layout,exit,hover,life,sky,pageanims,pageclip,quote').split(',');
/** Where `layout` writes its screenshots. */
const SHOTS = arg('--shots', '.context/layout');
const B = `${ORIGIN}/`;
const VIEWPORT = { width: 1728, height: 996 };
const FRAME_BUDGET_MS = 20;
/** Sky + fluid + the reader's flip, per frame, at p95. */
const WORK_BUDGET_MS = 8;
const ZORDER_TOLERANCE = 1e-4;

let failures = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));

const errors = [];
async function newPage(browser, dpr = 1) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}

/** Load `#read-01/<spread>` fresh, with the pointer parked off the book. */
async function open(page, spread, query = '') {
  await page.goto(B);
  await page.goto(`${B}#read-01/${spread}${query}`);
  await page.waitForSelector('.reader__bar');
  await page.mouse.move(5, 500);
  await page.waitForTimeout(1200);
}

const settled = (page, target) =>
  page.waitForFunction(
    (t) => +location.hash.split('/')[1] === t && document.querySelector('.book__turn-host').childElementCount === 0,
    target,
    { timeout: 6000 },
  );

/** What the reader says it is showing, every way it says it. */
const readState = (page) =>
  page.evaluate(() => ({
    caption: +document.querySelector('.reader__caption').dataset.spread - 1,
    hash: +location.hash.split('/')[1],
    pos: document.querySelector('.book').dataset.pos,
    imgs: [...document.querySelectorAll('.book > .book__page > img')]
      .map((i) => i.dataset.file ?? i.getAttribute('src').split('/').pop().replace('.webp', ''))
      .join('|'),
    layer: document.querySelector('.book__turn-host').childElementCount,
  }));

/** What each spread of Issue 01 should show. */
const pagesOf = (i) =>
  i === 0 ? 'cover-rest' : i === 21 ? 'back-rest' : `${String(2 * i - 1).padStart(2, '0')}|${String(2 * i).padStart(2, '0')}`;
const posOf = (i) => (i === 0 ? 'cover' : i === 21 ? 'back' : 'mid');
const agrees = (s, i) => s.caption === i && s.hash === i && s.imgs === pagesOf(i) && s.pos === posOf(i) && s.layer === 0;

/** rAF intervals across `act`, which starts something and resolves when done. */
async function frameTimes(page, act) {
  await page.evaluate(() => {
    window.__fr = [];
    window.__frOn = true;
    let last = 0;
    const f = (t) => {
      if (last && window.__frOn) window.__fr.push(t - last);
      last = t;
      if (window.__frOn) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__fr = []));
  await act();
  return page.evaluate(() => {
    window.__frOn = false;
    return window.__fr;
  });
}

/**
 * Hold the sky still: its clock pinned (no drift, twinkle, grain or flash) and
 * its wake frozen (splats dropped, the field left asleep). The ground is the
 * live sky now, and a check that compares two photographs of the book must not
 * be comparing two moments of the weather.
 */
async function stillSky(page) {
  await page.waitForFunction(() => typeof window.__skyPinTime === 'function' && typeof window.__skyHoldFluid === 'function');
  await page.evaluate(() => {
    window.__skyPinTime(0);
    window.__skyHoldFluid(true);
  });
}

// ── riffle: frame budget and landing ─────────────────────────────────────────

async function checkRiffleFrames(browser) {
  console.log(`\nriffle frame budget and landing (${RUNS} runs each)`);
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    for (const [from, to] of [
      [20, 0],
      [0, 20],
    ]) {
      const worst = [];
      const landings = [];
      for (let i = 0; i < RUNS; i++) {
        await open(page, from);
        const fr = await frameTimes(page, async () => {
          await page.evaluate((to) => window.__flip.turnTo(to), to);
          await settled(page, to);
        });
        worst.push(Math.max(...fr));
        landings.push(await readState(page));
      }
      const over = worst.filter((w) => w > FRAME_BUDGET_MS).length;
      check(
        over === 0,
        `${dpr}× ${from}→${to}: no frame over ${FRAME_BUDGET_MS}ms`,
        `worst per run ${worst.map((w) => w.toFixed(1)).join(' / ')}ms`,
      );
      const wrong = landings.filter((s) => !agrees(s, to));
      check(wrong.length === 0, `${dpr}× ${from}→${to}: lands with hash, caption, data-pos and pages agreeing`, wrong.length ? JSON.stringify(wrong[0]) : `${pagesOf(to)} #read-01/${to}`);
    }
    // The baseline: an ordinary Next off the cover lifts the same full-size
    // leaf a riffle's first leaf does. Reported, not asserted.
    let dropped = 0;
    for (let i = 0; i < RUNS; i++) {
      await open(page, 0);
      const fr = await frameTimes(page, async () => {
        await page.evaluate(() => window.__flip.turn('next'));
        await settled(page, 1);
      });
      if (Math.max(...fr) > FRAME_BUDGET_MS) dropped++;
    }
    console.log(`    baseline ${dpr}×: an ordinary Next from the cover went over ${FRAME_BUDGET_MS}ms in ${dropped} of ${RUNS} runs`);
    await page.context().close();
  }
}

// ── riffle: z-order, pixel-exact ─────────────────────────────────────────────

const HUES = [
  [224, 32, 32],
  [32, 176, 64],
  [32, 80, 224],
  [224, 192, 32],
  [192, 32, 192],
  [32, 192, 192],
];
function hueOf(r, g, b) {
  const m = Math.max(r, g, b);
  if (m < 25) return -1;
  let best = -1;
  let bd = Infinity;
  HUES.forEach((h, i) => {
    const hm = Math.max(...h);
    const d = (r / m - h[0] / hm) ** 2 + (g / m - h[1] / hm) ** 2 + (b / m - h[2] / hm) ** 2;
    if (d < bd) [bd, best] = [d, i];
  });
  return bd < 0.12 ? best : -1;
}

async function checkZOrder(browser) {
  console.log('\nriffle z-order (every 60Hz frame, pairs rendered alone and together)');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    for (const [from, to] of [
      [20, 0],
      [0, 20],
    ]) {
      await open(page, from);
      await stillSky(page);
      await page.evaluate((to) => {
        window.__flip.probe.colours(true);
        window.__flip.turnTo(to);
        window.__flip.probe.hold(0);
      }, to);
      const clip = { x: 150, y: 0, width: 1428, height: 996 };
      const grab = async () => sharp(await page.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true });
      const show = (z) =>
        page.evaluate(
          (z) =>
            document.querySelectorAll('.flip-leaf').forEach((w) => {
              w.style.visibility = z === 'all' || w.style.zIndex === z ? '' : 'hidden';
            }),
          z,
        );
      let overlap = 0;
      let wrong = 0;
      let pairs = 0;
      // Every frame until the last leaf has landed, however long the dials make
      // the run (capped, so a riffle that never lands fails rather than hangs).
      for (let ms = 0; ms <= 10000; ms += 1000 / 60) {
        await page.evaluate((ms) => window.__flip.probe.hold(ms), ms);
        const leaves = await page.evaluate(() => window.__flip.probe.leaves());
        if (leaves.length > 0 && leaves.every((l) => l.phase === 'landed')) break;
        const air = leaves.filter((l) => l.phase === 'air');
        if (air.length < 2) continue;
        await page.waitForTimeout(30);
        const all = await grab();
        await show('none');
        await page.waitForTimeout(30);
        const none = await grab();
        const alone = {};
        for (const l of air) {
          await show(l.z);
          await page.waitForTimeout(30);
          alone[l.k] = await grab();
        }
        await show('all');
        const { width: W, height: H, channels: C } = all.info;
        for (let i = 0; i < air.length; i++) {
          for (let j = i + 1; j < air.length; j++) {
            const [a, b] = [air[i], air[j]];
            // Edge-on together: no defined order to be wrong about.
            if (Math.abs(Math.sin(a.tt) - Math.sin(b.tt)) < 0.02) continue;
            const back = Math.sin(a.tt) > Math.sin(b.tt) ? b : a;
            pairs++;
            for (let y = 0; y < H; y += 2) {
              for (let x = 0; x < W; x += 2) {
                const q = (y * W + x) * C;
                const covers = (D, k) =>
                  Math.abs(D[q] - none.data[q]) + Math.abs(D[q + 1] - none.data[q + 1]) + Math.abs(D[q + 2] - none.data[q + 2]) > 30 &&
                  hueOf(D[q], D[q + 1], D[q + 2]) === k % HUES.length;
                if (!covers(alone[a.k].data, a.k) || !covers(alone[b.k].data, b.k)) continue;
                overlap++;
                if (hueOf(all.data[q], all.data[q + 1], all.data[q + 2]) === back.k % HUES.length) wrong++;
              }
            }
          }
        }
      }
      await page.evaluate(() => {
        window.__flip.probe.colours(false);
        window.__flip.probe.hold(null);
      });
      await settled(page, to);
      check(
        overlap > 0 && wrong / overlap <= ZORDER_TOLERANCE,
        `${dpr}× ${from}→${to}: the more upright leaf is always in front`,
        `${wrong} of ${overlap} overlap px in the wrong order, over ${pairs} pairs`,
      );
    }
    await page.context().close();
  }
}

// ── folios: the pill reads the magazine's page numbers ────────────────────────

/**
 * Walk the whole issue and hold the spread pill to the printed folios of the
 * pages actually open. The expectation is read off the PAGES ON SCREEN, not off
 * the pill's own code: each open page is the file `NN.webp`, which carries the
 * printed folio NN (01 and 02 carry none, and still count); the closed book is
 * the cover's or the back's rest plate. So a spread showing 07.webp and 08.webp
 * must read "07 | 08", one showing a single inside page that page alone, the
 * closed front "Cover" and the closed back "Back" — at the same pill width.
 */
async function checkFolios(browser) {
  console.log('\nfolios: the spread pill against the pages that are open, every spread');
  const page = await newPage(browser, 1);
  await open(page, 0);
  const rows = [];
  for (let s = 0; s < 22; s++) {
    await page.evaluate((s) => (location.hash = `#read-01/${s}`), s);
    await page.waitForFunction(
      (s) => document.querySelector('.reader__caption')?.dataset.spread === String(s + 1) && document.querySelector('.book__turn-host').childElementCount === 0,
      s,
      { timeout: 8000 },
    );
    await page.waitForTimeout(80);
    rows.push(
      await page.evaluate(() => {
        const files = [...document.querySelectorAll('.book > .book__page > img')].map((i) => i.dataset.file ?? i.getAttribute('src').split('/').pop().replace('.webp', ''));
        const inside = files.filter((f) => /^\d+$/.test(f));
        const expected = inside.length ? inside.join(' | ') : files.includes('cover-rest') ? 'Cover' : files.includes('back-rest') ? 'Back' : '?';
        const pill = document.querySelector('.reader__caption');
        const shown = [...pill.querySelectorAll('.paper-pill__text > *, .paper-pill__text')]
          .filter((n) => n.matches('.paper-pill__num') || (n.matches('.paper-pill__text') && !n.querySelector('.paper-pill__num')))
          .map((n) => n.textContent.trim())
          .join(' | ');
        return { files: files.join('|'), expected, folio: pill.dataset.folio, shown, width: Math.round(pill.querySelector('.paper__shape').getBoundingClientRect().width) };
      }),
    );
  }
  const wrong = rows.map((r, s) => ({ s, ...r })).filter((r) => r.folio !== r.expected || r.shown !== r.expected);
  const widths = [...new Set(rows.map((r) => r.width))];
  for (const [label, s] of [['the cover', 0], ['the first open spread', 1], ['the 07 spread', 4], ['the last open spread', 20], ['the back', 21]]) {
    const r = rows[s];
    check(r.folio === r.expected && r.shown === r.expected, `${label} (spread ${s}) reads "${r.shown}"`, `pages on screen ${r.files} → expected "${r.expected}"`);
  }
  check(wrong.length === 0, `all 22 spreads read the folios of the pages that are open`, wrong.length ? JSON.stringify(wrong.slice(0, 3)) : rows.map((r) => r.shown).join(', '));
  check(widths.length === 1, 'the pill is one width throughout', `${widths.join(', ')}px`);
  await page.context().close();
}

// ── layout: the Studio Display's spacing at every viewport ───────────────────

/**
 * The book is sized after the chrome's bands (src/layout/hero.ts), so the
 * margins, the chrome and the gaps to the book are the 2560×1440 spec on every
 * viewport (× k where the chrome shrank). At the cover, a mid spread and the
 * back. `scripts/layout-checks.mjs`; a screenshot per viewport to `--shots`.
 */
async function checkReaderLayout(browser) {
  await checkLayout({
    browser,
    view: 'reader',
    states: [0, 6, 21],
    openState: 6,
    open: async (page, spread) => {
      await page.goto(B);
      await page.goto(`${B}#read-01/${spread}`);
      await page.waitForSelector('.reader__bar');
      await page.waitForTimeout(1200);
    },
    check,
    errors,
    shots: SHOTS,
  });
}

// ── navigation: every way of moving agrees ───────────────────────────────────

async function checkNavigation(browser) {
  console.log('\nnavigation');
  const page = await newPage(browser);
  await open(page, 3);
  const box = await page.locator('.book').boundingBox();
  const drag = (dir) => async () => {
    const y = box.y + box.height / 2;
    const x0 = dir === 'next' ? box.x + box.width * 0.85 : box.x + box.width * 0.15;
    const x1 = dir === 'next' ? box.x + box.width * 0.25 : box.x + box.width * 0.75;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y);
    await page.mouse.up();
  };
  const btn = (name) => () => page.getByRole('button', { name, exact: true }).click();
  const key = (k) => () => page.keyboard.press(k);
  const steps = [
    ['Next', btn('Next spread'), 4],
    ['ArrowRight', key('ArrowRight'), 5],
    ['Prev', btn('Previous spread'), 4],
    ['ArrowLeft', key('ArrowLeft'), 3],
    ['drag next', drag('next'), 4],
    ['drag prev', drag('prev'), 3],
    ['End', key('End'), 21],
    ['Home', key('Home'), 0],
    ['Back cover', btn('Jump to the back cover'), 21],
    ['Prev from the back', btn('Previous spread'), 20],
    ['Cover', btn('Jump to the cover'), 0],
    ['Next from the cover', btn('Next spread'), 1],
  ];
  const off = [];
  for (const [label, act, want] of steps) {
    await act();
    await settled(page, want).catch(() => {});
    await page.waitForTimeout(150);
    const s = await readState(page);
    if (!agrees(s, want)) off.push(`${label}: ${JSON.stringify(s)}`);
  }
  check(off.length === 0, 'Prev / Next / arrows / drag / Home / End / Cover / Back cover agree on the spread', off.join('; '));

  // Input while a riffle runs goes nowhere.
  await open(page, 12);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  await drag('next')();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Next spread', exact: true }).click({ force: true }).catch(() => {});
  await settled(page, 0).catch(() => {});
  await page.waitForTimeout(300);
  const locked = await readState(page);
  check(agrees(locked, 0), 'drag, arrows and Next during a riffle are ignored', JSON.stringify(locked));

  // Escape mid-riffle (direct URL, so the plain exit): lands, then leaves.
  await open(page, 12);
  await page.evaluate(() => {
    window.__caps = [];
    new MutationObserver(() => {
      const c = document.querySelector('.reader__caption');
      const cap = c && `${c.dataset.spread} / ${c.dataset.spreads}`;
      if (cap && window.__caps.at(-1) !== cap) window.__caps.push(cap);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-spread'] });
  });
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const esc = await page.evaluate(() => ({ last: window.__caps.at(-1), hash: location.hash, reader: !!document.querySelector('.reader') }));
  check(
    esc.last === '22 / 22' && esc.hash === '#item-01' && !esc.reader,
    'Escape mid-riffle lands the riffle, then exits',
    JSON.stringify(esc),
  );
  await page.context().close();
}

// ── the exit: pill and Escape are one thing ──────────────────────────────────

async function exitFrames(browser, how) {
  const page = await newPage(browser);
  await page.goto(`${B}#item-01`);
  await stillSky(page);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Read issue', exact: true }).click();
  await page.waitForTimeout(3500);
  await page.mouse.move(5, 500);
  await page.evaluate(() => {
    window.__v = [];
    const f = () => {
      const s = document.documentElement.style;
      window.__v.push([performance.timeOrigin + performance.now(), s.getPropertyValue('--doorway-table'), s.getPropertyValue('--doorway-settle')]);
      if (window.__v.length < 300) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await page.waitForTimeout(200);
  if (how === 'pill') await page.locator('.reader').getByRole('button', { name: 'Close', exact: true }).click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(2600);
  await cdp.send('Page.stopScreencast');
  const log = await page.evaluate(() => window.__v).catch(() => []);
  const after = await page.evaluate(() => ({ hash: location.hash, reader: !!document.querySelector('.reader') }));
  await page.context().close();
  // Each frame tagged with the channels at the last rAF before it; mid-exit only.
  const tagged = frames
    .map((f) => ({ ...f, v: log.filter((x) => x[0] <= f.t).at(-1) }))
    .filter((f) => f.v && f.v[1] !== '' && +f.v[1] > 0.2 && +f.v[1] < 0.8);
  return { after, tagged };
}

async function checkExit(browser) {
  console.log('\nthe exit: pill and Escape');
  const escape = [];
  const pill = [];
  const ends = [];
  for (let i = 0; i < 3; i++) {
    const e = await exitFrames(browser, 'escape');
    const p = await exitFrames(browser, 'pill');
    escape.push(...e.tagged);
    pill.push(...p.tagged);
    ends.push(e.after, p.after);
  }
  check(
    ends.every((a) => a.hash === '#item-01' && !a.reader),
    'both end on #item-01 with the reader unmounted',
    `${ends.length} exits`,
  );
  // Paired by the frames themselves. Tagging a screencast frame with the rAF
  // channels logged before it is only approximate — the frame can be a vsync
  // behind — so pairing by `--doorway-table` can put two different moments side
  // by side. Instead: for each mid-exit Escape frame, the most similar pill
  // frame (searched small, confirmed full size). If the two exits differed
  // anywhere in their choreography, no pair could agree to 0.1%.
  const SMALL = 216;
  const small = async (f) => (f.small ??= await sharp(Buffer.from(f.data, 'base64')).resize(SMALL).removeAlpha().raw().toBuffer());
  const diff = (A, P) => {
    let n = 0;
    for (let i = 0; i < A.length; i += 3) if (Math.abs(A[i] - P[i]) + Math.abs(A[i + 1] - P[i + 1]) + Math.abs(A[i + 2] - P[i + 2]) > 24) n++;
    return n / (A.length / 3);
  };
  let best = null;
  const shares = [];
  for (const e of escape) {
    const es = await small(e);
    let near = null;
    for (const p of pill) {
      const d = diff(es, await small(p));
      if (!near || d < near.d) near = { d, p };
    }
    const full = diff(
      await sharp(Buffer.from(e.data, 'base64')).removeAlpha().raw().toBuffer(),
      await sharp(Buffer.from(near.p.data, 'base64')).removeAlpha().raw().toBuffer(),
    );
    shares.push(full);
    if (!best || full < best.full) best = { full, e, p: near.p };
  }
  if (!best) {
    bad('mid-exit frames were captured', 'none between table 0.2 and 0.8');
    return;
  }
  shares.sort((x, y) => x - y);
  check(
    best.full < 0.001,
    'mid-exit, the Escape exit passes through the frames the pill exit does',
    `best pair ${(best.full * 100).toFixed(3)}% px differ (table ${(+best.e.v[1]).toFixed(3)} / ${(+best.p.v[1]).toFixed(3)}); median over ${shares.length} Escape frames ${(shares[shares.length >> 1] * 100).toFixed(3)}%`,
  );
}

// ── hover loops ──────────────────────────────────────────────────────────────

async function hoverLoop(page, spread, face, id) {
  await open(page, spread);
  // The boil moves every pixel of the face; take it out, so a frame change
  // below is the loop and nothing else.
  await page.evaluate(() => window.__coverLife.set({ boilPx: 0, boilDeg: 0 }));
  const geo = await page.evaluate(
    async ({ face, id }) => {
      const m = await (await fetch('/issues/01/anim/manifest.json')).json();
      const o = m.objects.find((x) => x.id === id);
      const l = document.querySelector('.book-anim .cover-anim').getBoundingClientRect();
      const k = l.width / (face === 'back' ? m.back.backW : m.coverW);
      const r = o.displayRect;
      return { x: l.x + r.x * k, y: l.y + r.y * k, w: r.w * k, h: r.h * k, durationMs: o.durationMs, mode: o.mode };
    },
    { face, id },
  );
  const clip = { x: geo.x, y: geo.y, width: geo.w, height: geo.h };
  await page.mouse.move(geo.x + geo.w / 2, geo.y + geo.h / 2, { steps: 3 });
  const window_ = Math.max(3.2 * geo.durationMs, 2000);
  const shots = [];
  const t0 = Date.now();
  while (Date.now() - t0 < window_) {
    shots.push([Date.now() - t0, await sharp(await page.screenshot({ clip })).raw().toBuffer()]);
    await page.waitForTimeout(60);
  }
  const changes = [];
  for (let i = 1; i < shots.length; i++) {
    const [a, b] = [shots[i - 1][1], shots[i][1]];
    let n = 0;
    for (let j = 0; j < a.length; j += 4) if (Math.abs(a[j] - b[j]) > 24) n++;
    if (n > 50) changes.push(shots[i][0]);
  }
  // On leave: the animation keeps running out its pass, then the still is back.
  const phase = () =>
    page.evaluate((id) => {
      const obj = [...document.querySelectorAll('.cover-anim__obj')].find((el) =>
        [...el.querySelectorAll('img')].some((i) => i.getAttribute('src').includes(`/${id}`)),
      );
      return obj?.querySelector(`img[src$="/${id}.webp"]`) ? 'playing' : 'rest';
    }, id);
  await page.mouse.move(5, 500);
  const left = Date.now();
  const justAfter = await phase();
  let backAt = null;
  while (Date.now() - left < geo.durationMs + 1500) {
    if ((await phase()) === 'rest') {
      backAt = Date.now() - left;
      break;
    }
    await page.waitForTimeout(40);
  }
  return { geo, changes, window_, justAfter, backAt };
}

async function checkHover(browser) {
  console.log('\nhover loops');
  const page = await newPage(browser, 2);
  for (const [spread, face, id] of [
    [0, 'cover', 'libros'],
    [21, 'back', 'riddim'],
  ]) {
    const r = await hoverLoop(page, spread, face, id);
    const lastPass = r.changes.filter((t) => t > r.window_ - r.geo.durationMs);
    check(
      r.geo.mode === 'loop' && r.changes.length > 0 && lastPass.length > 0 && r.window_ >= 3 * r.geo.durationMs,
      `${id} (${face}) keeps playing past three passes while hovered`,
      `${r.changes.length} frame changes over ${(r.window_ / 1000).toFixed(1)}s, ${lastPass.length} in the last pass; pass ${r.geo.durationMs}ms`,
    );
    check(
      r.justAfter === 'playing' && r.backAt !== null && r.backAt <= r.geo.durationMs + 400,
      `${id}: leaving finishes the pass in flight, then rests`,
      `still playing on leave, at rest after ${r.backAt}ms`,
    );
  }

  // The back's layer exists only at rest on the last spread.
  await open(page, 20);
  const at20 = await page.evaluate(() => document.querySelectorAll('.book-anim').length);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const turningIn = await page.evaluate(() => document.querySelectorAll('.book-anim').length);
  await settled(page, 21);
  await page.waitForTimeout(300);
  const at21 = await page.evaluate(() => document.querySelectorAll('.book-anim .cover-anim').length);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  const turningOut = await page.evaluate(() => document.querySelectorAll('.book-anim').length);
  check(
    at20 === 0 && turningIn === 0 && at21 === 1 && turningOut === 0,
    'the back layer is mounted only at rest on the last spread',
    `20: ${at20}, turning in: ${turningIn}, 21: ${at21}, turning out: ${turningOut}`,
  );
  await page.context().close();
}


// ── cover life ───────────────────────────────────────────────────────────────

/** A closed face: its layer, and the book's static slot under it, whose own
 *  laid-out transform is what the sprites are checked against. */
const readerFace = (which) => {
  const slot = which === 'cover' ? '.book[data-pos="cover"] > .book__page--right' : '.book[data-pos="back"] > .book__page--left';
  return {
    which,
    layer: '.book-anim .cover-anim',
    plateBox: slot,
    boiled: '.book > .book__page',
    plate: `() => {
      const el = document.querySelector('${slot}');
      const cs = getComputedStyle(el);
      const t = cs.translate === 'none' ? [0, 0] : cs.translate.split(' ').map(parseFloat);
      const rad = cs.rotate === 'none' ? 0 : (parseFloat(cs.rotate) * Math.PI) / 180;
      // Its rotation centre is its own, which is the hover layer's box's.
      const hb = document.querySelector('.book-anim').getBoundingClientRect();
      return { cx: hb.x + hb.width / 2, cy: hb.y + hb.height / 2, dx: t[0], dy: t[1] ?? 0, rad };
    }`,
  };
};

async function checkLife(browser) {
  console.log('\ncover life: page hover and the boil, closed cover and back');
  const max = (xs) => Math.max(...xs);
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    for (const [spread, which, count] of [
      [0, 'cover', 20],
      [21, 'back', 1],
    ]) {
      const face = readerFace(which);
      await open(page, spread);
      const rest0 = await atRest(page, face);
      check(
        rest0.still && rest0.styles === '' && rest0.phases.every((p) => p === 'rest'),
        `@${dpr}× ${which} at rest: nothing boiled, nothing playing`,
        `slot boil ${rest0.plate.dx},${rest0.plate.dy},${rest0.plate.rad}; styles "${rest0.styles}"`,
      );
      const at = await emptyPoint(page, face);
      const h = await hoverAll(page, face, at);
      check(
        h.ms !== null && h.ms <= 200 && h.n === count,
        `@${dpr}× ${which}: hovering the page, on no object, plays all ${h.n}`,
        `all playing ${h.ms === null ? 'never' : `${h.ms.toFixed(1)}ms`} after the pointer arrived`,
      );
      const reg = await registration(page, face, 10);
      const moved = reg.filter((r) => r.moved > 0.05 || Math.abs(r.deg) > 0.01).length;
      const steps = new Set(reg.map((r) => r.step)).size;
      check(
        max(reg.map((r) => r.worst)) <= 0.5 && max(reg.map((r) => r.box)) <= 0.5 && moved >= 8 && steps >= 4,
        `@${dpr}× ${which}: during the boil, the face and its sprites move together`,
        `worst sprite ${max(reg.map((r) => r.worst)).toFixed(3)}px, slot ${max(reg.map((r) => r.box)).toFixed(3)}px over 10 samples; ${moved}/10 boiled (up to ${max(reg.map((r) => r.moved)).toFixed(2)}px, ${max(reg.map((r) => Math.abs(r.deg))).toFixed(2)}°), ${steps} distinct steps`,
      );
      const fr = await frameTimes(page, async () => {
        for (let k = 0; k < 60; k++) {
          await page.mouse.move(at.x + (k % 9), at.y + (k % 7));
          await page.waitForTimeout(50);
        }
      });
      check(max(fr) <= FRAME_BUDGET_MS, `@${dpr}× ${which}: frames during the boil`, `worst ${max(fr).toFixed(1)}ms over ${fr.length} frames`);
      const L = await leaveAll(page, face, { x: 5, y: 500 });
      const j = judgeLeave(L);
      check(
        j.all && j.ids.length === count && j.over.length === 0,
        `@${dpr}× ${which}: leaving, every object finishes its pass and fades home`,
        `slowest home ${j.worst.toFixed(0)}ms; fades begin ${j.fades[0]?.toFixed(0)}–${j.fades.at(-1)?.toFixed(0)}ms${j.over.length ? `; late: ${j.over.map((x) => `${x.id} ${x.t.toFixed(0)}>${x.bound}`).join(', ')}` : ''}`,
      );
      await page.waitForTimeout(500);
      const rest1 = await atRest(page, face);
      check(rest1.still && rest1.styles === '', `@${dpr}× ${which}: after the leave, everything exactly where it was`, `styles "${rest1.styles}"`);
      if (dpr === 2 && which === 'cover') {
        const s = await boilSteps(page, face, 'docs/reader-nav/boil-steps.webp');
        ok('wrote docs/reader-nav/boil-steps.webp', s.map((x) => `step ${x.step}: ${x.dx.toFixed(2)},${x.dy.toFixed(2)}px ${x.deg.toFixed(2)}°`).join(' | '));
      }
    }
    await page.context().close();
  }
}

// ── the sky: one canvas, the same sky, the flip's wake, the budget ───────────

/** Count every WebGL context the page ever makes, by canvas. */
const COUNT_CONTEXTS = () => {
  const made = new Set();
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = get.call(this, type, ...rest);
    if (ctx && /webgl/.test(type)) made.add(this);
    return ctx;
  };
  window.__glContexts = () => made.size;
};

/** Where the one sky canvas is: the reader's ground, the app, or nowhere. */
const canvasHome = () => {
  const all = document.querySelectorAll('canvas.sky-layer__canvas');
  const c = all[0];
  return {
    count: all.length,
    home: !c || !c.isConnected ? 'none' : c.closest('.reader-ground') ? 'reader' : c.closest('.app') ? 'app' : 'other',
  };
};

const differing = (A, B, levels = 8) => {
  let n = 0;
  for (let i = 0; i < A.length; i += 4) {
    if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > levels) n++;
  }
  return n / (A.length / 4);
};
const raw = async (page, clip) => sharp(await page.screenshot(clip ? { clip } : {})).ensureAlpha().raw().toBuffer();

/**
 * MAIN-THREAD WORK PER FRAME, from the frame's first rAF callback to the first
 * task after the frame — which runs once every rAF callback, style, layout,
 * paint and the commit are done. `requestAnimationFrame` is wrapped before the
 * page's own scripts load (an init script), so "first" is first: timing from the
 * rAF timestamp instead would count the gap between vsync and the main thread
 * starting the frame, which is scheduling and not work. And the rAF intervals,
 * for the 60fps question.
 */
const WRAP_RAF = () => {
  const raf = window.requestAnimationFrame.bind(window);
  const frame = { t: -1 };
  const ch = new MessageChannel();
  window.__work = [];
  window.__gaps = [];
  window.__workOn = false;
  ch.port1.onmessage = (e) => window.__workOn && window.__work.push(performance.now() - e.data);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      if (t !== frame.t) {
        if (window.__workOn && frame.t > 0) window.__gaps.push(t - frame.t);
        frame.t = t;
        ch.port2.postMessage(performance.now());
      }
      cb(t);
    });
};

async function frameWork(page, act) {
  await page.evaluate(() => {
    window.__work = [];
    window.__gaps = [];
    window.__workOn = true;
  });
  await act();
  return page.evaluate(() => {
    window.__workOn = false;
    return { work: window.__work, gaps: window.__gaps.slice(1) };
  });
}

const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

async function checkSky(browser) {
  console.log("\nthe sky: one canvas, the same sky, the flip's wake, the budget");

  // ONE CANVAS. The doorway from the detail view, with the canvas's home
  // logged every frame beside the TABLE channel.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript(COUNT_CONTEXTS);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${B}#item-01`);
    await page.waitForTimeout(2500);
    const before = await page.evaluate(canvasHome);
    const ctx0 = await page.evaluate(() => window.__glContexts());
    await page.evaluate((homeSrc) => {
      const home = new Function(`return (${homeSrc})()`);
      window.__homes = [];
      const f = () => {
        const t = document.documentElement.style.getPropertyValue('--doorway-table');
        // Unset (before the click) is not the doorway yet; not logged.
        if (t !== '') window.__homes.push([+t, home().home]);
        if (window.__homes.length < 200) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, canvasHome.toString());
    await page.getByRole('button', { name: 'Read issue', exact: true }).click();
    await page.waitForTimeout(3500);
    const homes = await page.evaluate(() => window.__homes);
    const atRest = await page.evaluate(canvasHome);
    const ctx1 = await page.evaluate(() => window.__glContexts());
    // The claim follows TABLE in the same frame (a mutation observer on
    // :root's style). Measured: exact, both ways.
    const early = homes.filter(([t, h]) => t < 1 && h === 'reader').length;
    const firstFull = homes.findIndex(([t]) => t >= 1);
    const late = homes.filter(([t, h]) => t >= 1 && h !== 'reader').length;
    check(
      before.count === 1 && before.home === 'app' && atRest.count === 1 && atRest.home === 'reader' && ctx1 === ctx0,
      'opening the reader moves the one sky canvas into its ground, with no new WebGL context',
      `canvases ${before.count} → ${atRest.count}, home ${before.home} → ${atRest.home}, WebGL contexts ${ctx0} → ${ctx1}`,
    );
    check(
      early === 0 && late === 0 && firstFull > 0,
      'through the doorway the canvas stays in the app until TABLE is 1, then the reader holds it',
      `${homes.filter(([t]) => t < 1).length} frames under 1 (${early} in the reader), ${homes.length - firstFull} at 1 (${late} not)`,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2600);
    const after = await page.evaluate(canvasHome);
    const hash = await page.evaluate(() => location.hash);
    check(after.count === 1 && after.home === 'app' && hash === '#item-01', 'after the exit the canvas is back in the app', `${after.count} canvas, in ${after.home}, ${hash}`);
    await context.close();
  }

  // THE HAND-OVER IS INVISIBLE. At the doorway's own dock (the dev authoring
  // harness), with the sky held still: the frame at TABLE 0.9999, where the
  // ground is transparent and the app's canvas shows through it, against the
  // frame at TABLE 1, where the ground holds the canvas. Anything the app still
  // drew over its sky would be in the first and not the second.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${B}#item-01?intro`);
    await page.waitForSelector('.reader-ground');
    await page.waitForFunction(() => typeof window.__doorwayApply === 'function');
    await stillSky(page);
    await page.waitForTimeout(2500);
    // The dock is chrome for the author, not the picture.
    await page.addStyleTag({ content: '.dialkit-root, [class*="dialkit"] { visibility: hidden !important; }' });
    const at = async (table) => {
      await page.evaluate((table) => window.__doorwayApply({ clear: 1, table, settle: 1, chrome: 1, open: 0 }), table);
      await page.waitForTimeout(400);
      return { img: await raw(page), home: (await page.evaluate(canvasHome)).home };
    };
    const a = await at(0.9999);
    const b = await at(1);
    const pct = differing(a.img, b.img);
    check(
      a.home === 'app' && b.home === 'reader' && pct < 1e-4,
      'the ground taking the canvas at TABLE 1 changes no pixels',
      `canvas in the ${a.home} at 0.9999, the ${b.home} at 1; ${(pct * 100).toFixed(4)}% px differ`,
    );
    await context.close();
  }

  // THE SAME SKY. The grid's sky, alone, against the reader's with the book,
  // the chrome and the washes hidden: one engine, one state, one picture.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(B);
    await page.waitForFunction(() => typeof window.__skyPreview === 'function');
    await stillSky(page);
    const results = [];
    for (const [c, t] of [
      ['cloudy', 'noon'],
      ['clear', 'night'],
    ]) {
      await page.evaluate(() => {
        if (location.hash) location.hash = '';
      });
      await page.waitForTimeout(600);
      await page.evaluate(([c, t]) => window.__skyPreview(c, t), [c, t]);
      const hideApp = await page.addStyleTag({
        content: '.app > :not(.sky-layer), [class*="dialkit"] { visibility: hidden !important; }',
      });
      // Settled means two photographs a beat apart agree: the moon eases to
      // its place on screen on its own clock, and a sky still arriving is not
      // a state to compare.
      let grid = await raw(page);
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(500);
        const next = await raw(page);
        const still = differing(grid, next) < 1e-5;
        grid = next;
        if (still) break;
      }
      await hideApp.evaluate((el) => el.remove());
      await page.evaluate(() => {
        location.hash = '#read-01/6';
      });
      await page.waitForSelector('.reader__bar');
      await page.waitForTimeout(900);
      const hideReader = await page.addStyleTag({
        content: '.reader, .reader-ground__scrim { visibility: hidden !important; }',
      });
      const reader = await raw(page);
      const home = await page.evaluate(canvasHome);
      await hideReader.evaluate((el) => el.remove());
      results.push({ state: `${c} ${t}`, pct: differing(grid, reader), home });
    }
    check(
      results.every((r) => r.pct < 1e-4 && r.home.count === 1 && r.home.home === 'reader'),
      "the reader's sky is the grid's sky, pixel for pixel",
      results.map((r) => `${r.state}: ${(r.pct * 100).toFixed(4)}% px differ, ${r.home.count} canvas in the ${r.home.home}`).join('; '),
    );
    await context.close();
  }

  // THE FLIP'S WAKE. No pointer anywhere near the page, so only the book can
  // be what wakes the field.
  {
    const awakeWithin = async (page, ms) => {
      for (let t = 0; t < ms; t += 100) {
        if (await page.evaluate(() => window.__skyFluidAwake())) return true;
        await page.waitForTimeout(100);
      }
      return false;
    };
    const page = await newPage(browser);
    await page.goto(`${B}#read-01/3`);
    await page.waitForSelector('.reader__bar');
    await page.waitForTimeout(1500);
    const asleep0 = !(await page.evaluate(() => window.__skyFluidAwake()));
    const shipped = await page.evaluate(() => window.__readerGround.dials.readerFlipSplat);
    await page.evaluate(() => window.__readerGround.set({ readerFlipSplat: 0 }));
    await page.evaluate(() => window.__flip.turn('next'));
    const offWoke = await awakeWithin(page, 1300);
    await settled(page, 4);
    await page.evaluate((k) => window.__readerGround.set({ readerFlipSplat: k }), shipped);
    await page.evaluate(() => window.__flip.turn('next'));
    const onWoke = await awakeWithin(page, 1300);
    await page.context().close();
    check(
      asleep0 && !offWoke && onWoke,
      'a page flip wakes the sky; at readerFlipSplat 0 it does not',
      `asleep before: ${asleep0}; at 0: ${offWoke ? 'woke' : 'stayed asleep'}; at the shipped ${shipped}: ${onWoke ? 'woke' : 'stayed asleep'}`,
    );
    const riffle = await newPage(browser);
    await riffle.goto(`${B}#read-01/12`);
    await riffle.waitForSelector('.reader__bar');
    await riffle.waitForTimeout(1500);
    const asleep1 = !(await riffle.evaluate(() => window.__skyFluidAwake()));
    await riffle.evaluate(() => window.__flip.turnTo(0));
    const riffleWoke = await awakeWithin(riffle, 1500);
    await riffle.context().close();
    check(asleep1 && riffleWoke, 'a riffle wakes the sky', `asleep before: ${asleep1}, awake during: ${riffleWoke}`);
  }

  // THE BUDGET. Fog noon, the sky's most expensive condition, with the flip's
  // wake keeping the fluid awake. Two figures, at p95: the MAIN THREAD's work
  // per frame (the flip's own JS, style, layout, paint, commit, and the sky's
  // per-frame JS) through five Next turns, and separately through a 3→20
  // riffle; and the SKY'S GPU FRAME with the fluid awake and splatting, by the
  // sky's own benchmark (`sky-perf.mjs`), median of three. They are ADDED, which is the
  // conservative figure: the GPU shades the sky while the main thread builds
  // the next frame, so the two overlap in practice.
  //
  // THE FLIP is held to it. THE RIFFLE is reported beside it: its main thread
  // alone is ~6.3ms at p95, the same on `main` under the wood (where the sky was
  // already rendering, covered), so the sum is over 8 at 2× whatever the ground
  // is — see docs/reader.md. Its 60fps is asserted, like the flips'.
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr });
    await context.addInitScript(WRAP_RAF);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${B}#read-01/3`);
    await page.waitForSelector('.reader__bar');
    await page.waitForFunction(() => typeof window.__skyPreview === 'function');
    await page.evaluate(() => window.__skyPreview('fog', 'noon'));
    await page.waitForTimeout(2500);
    const flips = await frameWork(page, async () => {
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.__flip.turn('next'));
        await settled(page, 4 + i);
        await page.waitForTimeout(120);
      }
    });
    const riffle = await frameWork(page, async () => {
      await page.evaluate(() => window.__flip.turnTo(20));
      await settled(page, 20);
    });
    const awake = await page.evaluate(() => window.__skyFluidAwake());
    // The median p95 of three benchmark runs, as `sky-perf.mjs` takes it: the
    // GPU also drives the display, and one run on a busy machine is noise.
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(p95(await page.evaluate(() => window.__skyBenchmark(300, 10, true))));
    const sky95 = runs.sort((a, b) => a - b)[1];
    await context.close();
    const flip95 = p95(flips.work);
    const riffle95 = p95(riffle.work);
    check(
      flip95 + sky95 <= WORK_BUDGET_MS && awake,
      `@${dpr}× sky + fluid + a page flip ≤ ${WORK_BUDGET_MS}ms a frame`,
      `flip main thread p95 ${flip95.toFixed(2)}ms + sky GPU (fluid awake) p95 ${sky95.toFixed(2)}ms = ${(flip95 + sky95).toFixed(2)}ms`,
    );
    console.log(
      `    riffle @${dpr}×: main thread p95 ${riffle95.toFixed(2)}ms + sky ${sky95.toFixed(2)}ms = ${(riffle95 + sky95).toFixed(2)}ms (reported, not asserted)`,
    );
    const gaps = [...flips.gaps, ...riffle.gaps];
    const over = gaps.filter((g) => g > FRAME_BUDGET_MS).length;
    check(over === 0, `@${dpr}× the flips and the riffle hold 60fps over the sky`, `worst frame ${Math.max(...gaps).toFixed(1)}ms, ${over} over ${FRAME_BUDGET_MS}ms of ${gaps.length}`);
  }
}

// ── the inside pages' animations ─────────────────────────────────────────────

/** Spread 9 is 17 | 18: cuqui and highlander, one sprite canvas each. */
const ANIM_SPREAD = 9;
const ANIM_PAGES = [17, 18];
/** 7 | 8: badges, whose frames carry Procreate's holds (its APNG's). */
const HOLDS_SPREAD = 4;
const HOLDS_PAGE = 8;
/** Ticks of 1/6 s each badges frame is held: Badges.png's 14 frames of 166ms. */
const BADGES_HOLDS = [2, 2, 1, 2, 5, 2];
/** 19 | 20: nothing animated — the frame budget's baseline. */
const PLAIN_SPREAD = 10;

/** Both of 17 | 18's pages (or `pages`) shown, i.e. settled and drawing. */
const animsShown = (page, pages = ANIM_PAGES) =>
  page.waitForFunction(
    (pages) => {
      const st = window.__pageAnims?.state() ?? [];
      return pages.every((n) => st.some((s) => s.page === n && s.shown && s.draws > 0));
    },
    pages,
    { timeout: 10000 },
  );

/** What the page shows of the inside pages' animations, right now. */
const animSnapshot = (page) =>
  page.evaluate(() => {
    const book = document.querySelector('.book');
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    };
    const wraps = [...document.querySelectorAll('.page-anim')].map((w) => ({ page: +w.dataset.page, visible: visible(w) }));
    // Any plate the eye could see: a visible <img> of one, or a curl face painted with one.
    const plateImgs = [...book.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.includes('/plates/') && visible(i) && visible(i.closest('.page-anim') ?? i)).length;
    const faces = [...book.querySelectorAll('.flip-strip > *')].map((f) => f.style.backgroundImage).filter(Boolean);
    return {
      wraps,
      plateImgs,
      stripPlates: faces.filter((b) => b.includes('/plates/')).length,
      stripFaces: [...new Set(faces.map((b) => b.split('/').pop().replace(/\.webp.*$/, '')))].sort(),
      staticImgs: [...document.querySelectorAll('.book > .book__page > img')].map((i) => i.getAttribute('src').split('/').pop().replace('.webp', '')),
      layer: document.querySelector('.book__turn-host').childElementCount,
      state: window.__pageAnims.state(),
    };
  });

/** Non-transparent pixels on each page's sprite canvas. */
const canvasInk = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.page-anim')].map((w) => {
      const c = w.querySelector('canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
      return { page: +w.dataset.page, ink: n, w: c.width, cssW: w.clientWidth };
    }),
  );

/** Every frame's view of the turn layer and the wrappers, until `act` resolves. */
async function sampleFrames(page, act) {
  await page.evaluate(() => {
    window.__paSamples = [];
    window.__paOn = true;
    const f = () => {
      const vis = [...document.querySelectorAll('.page-anim')].some((w) => getComputedStyle(w).visibility !== 'hidden');
      window.__paSamples.push({ layer: document.querySelector('.book__turn-host').childElementCount > 0, vis });
      if (window.__paOn) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await act();
  return page.evaluate(() => {
    window.__paOn = false;
    return window.__paSamples;
  });
}

const firstIsRest = (state) => state.filter((s) => ANIM_PAGES.includes(s.page)).every((s) => s.first && s.first.every((f, i) => f === s.rest[i]));
const fmtFirst = (state) => state.map((s) => `${s.page}: first ${JSON.stringify(s.first)} rest ${JSON.stringify(s.rest)}`).join(', ');

async function checkPageAnims(browser) {
  console.log(`\ninside-page animations (spread ${ANIM_SPREAD}: ${ANIM_PAGES.join(' | ')})`);
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    await open(page, ANIM_SPREAD);
    await animsShown(page);

    // Settled: both canvases draw, from the rest frame, and keep stepping.
    const rest = await animSnapshot(page);
    check(firstIsRest(rest.state), `@${dpr}× opened on ${ANIM_PAGES.join(' | ')}: each loop's first drawn frame is its rest frame`, fmtFirst(rest.state));
    const ink = await canvasInk(page);
    check(
      ANIM_PAGES.every((n) => ink.find((c) => c.page === n)?.ink > 1000),
      `@${dpr}× both sprite canvases draw`,
      ink.map((c) => `${c.page}: ${c.ink} px of ink, ${c.w}px backing for ${c.cssW} CSS px`).join('; '),
    );
    check(
      ink.every((c) => Math.abs(c.w - Math.round(c.cssW * dpr)) <= 1),
      `@${dpr}× each canvas is backed at ${dpr}× its page`,
    );
    check(rest.wraps.every((w) => w.visible) && rest.plateImgs === 2, `@${dpr}× settled: both plates and canvases shown`, JSON.stringify(rest.wraps));
    const seen = new Map();
    for (let i = 0; i < 12; i++) {
      for (const s of await page.evaluate(() => window.__pageAnims.state())) {
        if (!seen.has(s.page)) seen.set(s.page, new Set());
        seen.get(s.page).add(s.last.join(','));
      }
      await page.waitForTimeout(110);
    }
    check(
      ANIM_PAGES.every((n) => (seen.get(n)?.size ?? 0) > 1),
      `@${dpr}× the loops step while open`,
      ANIM_PAGES.map((n) => `${n}: frames ${[...(seen.get(n) ?? [])].join(' ')}`).join('; '),
    );

    // Held mid-turn: the baked pages on the strips and in the static slots, no plate anywhere.
    await page.evaluate(() => {
      window.__flip.startTurn('next');
      window.__flip.applyTurn(0.5);
    });
    await page.waitForTimeout(150);
    const mid = await animSnapshot(page);
    check(mid.layer > 0 && mid.wraps.every((w) => !w.visible), `@${dpr}× mid-turn: both pages' plates and sprites are hidden`, JSON.stringify(mid.wraps));
    check(
      mid.plateImgs === 0 && mid.stripPlates === 0,
      `@${dpr}× mid-turn: no plate is visible, on the strips or under them`,
      `strip faces ${mid.stripFaces.join(', ')}; static ${mid.staticImgs.join('|')}`,
    );
    check(
      mid.stripFaces.includes('18') && mid.staticImgs.join('|') === '17|18',
      `@${dpr}× mid-turn: the strips and the static slots carry the baked pages`,
    );
    await page.evaluate(() => window.__flip.cancelTurn(0.05));
    await settled(page, ANIM_SPREAD);
    await animsShown(page);
    const back = await animSnapshot(page);
    check(firstIsRest(back.state), `@${dpr}× after a cancelled turn: the first drawn frame is the rest frame`, fmtFirst(back.state));

    // A real turn out and back, every frame sampled: never a wrapper shown under a turn layer.
    const out = await sampleFrames(page, async () => {
      await page.evaluate(() => window.__flip.turn('next'));
      await settled(page, ANIM_SPREAD + 1);
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__flip.turn('prev'));
      await settled(page, ANIM_SPREAD);
      await animsShown(page);
    });
    const leaked = out.filter((s) => s.layer && s.vis).length;
    check(
      leaked === 0 && out.some((s) => s.layer),
      `@${dpr}× through a real Next and Prev: no frame shows a plate or sprite while a turn layer is up`,
      `${out.filter((s) => s.layer).length} turning frames, ${leaked} with a plate shown`,
    );
    const landed = await animSnapshot(page);
    check(firstIsRest(landed.state), `@${dpr}× after a settle: the first drawn frame is the rest frame`, fmtFirst(landed.state));

    // The neighbours' atlases: fetched with the settle, never decoded ahead —
    // each spread decodes its own at its own settle. 9 → 10 → 11: at 11 the
    // window newly takes in spread 12 (sofa-green); on to 12, it decodes there.
    if (dpr === 1) {
      await page.evaluate(() => window.__flip.turn('next'));
      await settled(page, ANIM_SPREAD + 1);
      await page.evaluate(() => window.__flip.turn('next'));
      await settled(page, ANIM_SPREAD + 2);
      const early = await page.evaluate(() => ({ fetched: window.__pageAnims.fetched(), decoded: window.__pageAnims.cached() }));
      await page.waitForTimeout(1500);
      const later = await page.evaluate(() => window.__pageAnims.cached());
      await page.evaluate(() => window.__flip.turn('next'));
      await settled(page, ANIM_SPREAD + 3);
      await page.waitForFunction(() => window.__pageAnims.state().some((s) => s.page === 24 && s.shown), null, { timeout: 10000 });
      const opened = await page.evaluate(() => window.__pageAnims.cached());
      check(
        early.fetched.includes('sofa-green') && !early.decoded.includes('sofa-green') && !later.includes('sofa-green') && opened.includes('sofa-green'),
        '@1× a neighbour spread’s atlas is fetched on settle, not decoded ahead, and decoded at its own settle',
        `settled on 21 | 22: fetched ${early.fetched.join(', ')}; decoded ${early.decoded.join(', ') || 'none'}, 1.5 s later ${later.join(', ') || 'none'} — settled on 23 | 24: decoded ${opened.join(', ')}`,
      );
    }
    await page.context().close();
  }

  // Reduced motion: the rest frame, and no loop.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, ANIM_SPREAD);
    await animsShown(page);
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => window.__pageAnims.state());
    check(
      st.every((s) => s.last.every((f, i) => f === s.rest[i]) && s.draws <= 2),
      'reduced motion: each page holds its rest frame',
      st.map((s) => `${s.page}: frame ${s.last} (rest ${s.rest}), ${s.draws} draws`).join('; '),
    );
    await context.close();
  }

  // Procreate's holds, in the browser: badges' frame on every rAF for 3 s,
  // its runs measured on the page's own clock. The first and last runs seen
  // are partial. `open` idles past the settle, so the loop's start is the
  // player's first drawn frame, which must be the rest frame.
  {
    const page = await newPage(browser, 1);
    await open(page, HOLDS_SPREAD);
    await animsShown(page, [HOLDS_PAGE]);
    const changes = await page.evaluate(
      ({ pageN, ms }) =>
        new Promise((done) => {
          const out = [];
          const t0 = performance.now();
          const f = (now) => {
            const s = window.__pageAnims.state().find((x) => x.page === pageN);
            const frame = s?.last[0];
            if (out.at(-1)?.frame !== frame) out.push({ frame, at: now });
            if (now - t0 < ms) requestAnimationFrame(f);
            else done(out);
          };
          requestAnimationFrame(f);
        }),
      { pageN: HOLDS_PAGE, ms: 3000 },
    );
    const st = (await page.evaluate(() => window.__pageAnims.state())).find((x) => x.page === HOLDS_PAGE);
    const tick = 1000 / 6;
    const runs = changes.slice(1, -1).map((c, i) => ({ frame: c.frame, ticks: (changes[i + 2].at - c.at) / tick }));
    const seen = new Set(runs.map((r) => r.frame));
    const inOrder = runs.every((r, i) => i === 0 || r.frame === (runs[i - 1].frame + 1) % BADGES_HOLDS.length);
    const held = runs.every((r) => Math.round(r.ticks) === BADGES_HOLDS[r.frame] && Math.abs(r.ticks - BADGES_HOLDS[r.frame]) < 0.5);
    check(
      st?.first?.[0] === st?.rest[0] && st?.rest[0] === 2 && seen.size === BADGES_HOLDS.length && inOrder && held,
      `@1× 07 | 08: badges holds each frame its Procreate ticks (${BADGES_HOLDS.join(',')} at 6fps), in order from its rest frame`,
      `first drawn ${st?.first?.[0]} (rest ${st?.rest[0]}); ${runs.map((r) => `${r.frame}×${r.ticks.toFixed(2)}`).join(' ')}`,
    );
    await page.context().close();
  }

  // The frame budget, gated on the machine: the animated spread and a plain
  // one, interleaved run by run, the same idle-then-turn-out-and-back on each.
  // A plain spread that misses says the machine is busy; then the animated
  // spread's misses are reported, not asserted.
  const load = os.loadavg();
  console.log(`    load average ${load.map((l) => l.toFixed(2)).join(' / ')} on ${os.cpus().length} cores`);
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    const tally = { anim: [], plain: [] };
    for (let i = 0; i < RUNS; i++) {
      for (const [kind, s] of [
        ['anim', ANIM_SPREAD],
        ['plain', PLAIN_SPREAD],
      ]) {
        await open(page, s);
        if (kind === 'anim') await animsShown(page);
        const fr = await frameTimes(page, async () => {
          await page.waitForTimeout(1500);
          await page.evaluate(() => window.__flip.turn('next'));
          await settled(page, s + 1);
          await page.evaluate(() => window.__flip.turn('prev'));
          await settled(page, s);
          await page.waitForTimeout(500);
        });
        tally[kind].push(Math.max(...fr));
      }
    }
    const over = (k) => tally[k].filter((w) => w > FRAME_BUDGET_MS).length;
    const detail = `worst per run: animated ${tally.anim.map((w) => w.toFixed(1)).join(' / ')}ms; plain ${tally.plain.map((w) => w.toFixed(1)).join(' / ')}ms`;
    if (over('plain') === 0) {
      check(over('anim') === 0, `@${dpr}× spread ${ANIM_SPREAD} playing, and a turn out and back: no frame over ${FRAME_BUDGET_MS}ms`, detail);
    } else {
      console.log(
        `    @${dpr}× the plain spread missed in ${over('plain')} of ${RUNS} runs — the machine is busy; the animated spread missed in ${over('anim')} (reported, not asserted)\n      ${detail}`,
      );
    }
    await page.context().close();
  }
}

// ── 03 | 04: sprites that run off the page, cut at the paper ─────────────────

/** Spread 2 is 03 | 04: xolo leaves 03 by its left and bottom edges, hippo
 *  leaves 04 by its right. */
const CLIP_SPREAD = 2;
const CLIP_PAGES = [3, 4];
const CLIP_EDGES = { 3: ['left', 'bottom'], 4: ['right'] };
/** Each sprite's drawing where it is on its page, page px (its row cut at the page). */
const CLIP_BOXES = { 3: { id: 'xolo', x0: 0, y0: 1819, x1: 849, y1: 2600 }, 4: { id: 'hippo', x0: 1145, y0: 414, x1: 2000, y1: 1256 } };
/** A screenshot pixel "agrees" when every channel is within this (the registration's TAU). */
const CLIP_TAU = 28;
/**
 * At rest, the sprite must agree with the print over their drawing at least
 * this much. Registered, at 2×: xolo 89.1% (its thick rough outlines antialias
 * differently from the print's at this size; the baked page itself agrees
 * 95.2% with 03.png there), hippo 98.0%. xolo moved 4 page px scores 84.1%, 8 px
 * 75.8%, 1% larger 75.4% (2026-10-02).
 */
const CLIP_MATCH_FLOOR = 0.85;

/** The paper (each page's baked <img>), its slot and its sprite canvas, in CSS px. */
const clipGeometry = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.book > .book__page')].map((slot) => {
      const r = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const img = slot.querySelector(':scope > img');
      const wrap = slot.querySelector('.page-anim');
      const c = wrap?.querySelector('canvas');
      return {
        page: wrap ? +wrap.dataset.page : null,
        paper: img ? r(img) : null,
        slot: r(slot),
        overflow: getComputedStyle(slot).overflow,
        canvas: c ? r(c) : null,
      };
    }),
  );

/** Ink on each sprite canvas's outermost columns and rows. */
const edgeInk = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.page-anim')].map((w) => {
        const c = w.querySelector('canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const at = (x, y) => d[(y * c.width + x) * 4 + 3] > 8;
        const count = (n, f) => {
          let k = 0;
          for (let i = 0; i < n; i++) if (f(i)) k++;
          return k;
        };
        return [
          +w.dataset.page,
          {
            left: count(c.height, (y) => at(0, y)),
            right: count(c.height, (y) => at(c.width - 1, y)),
            top: count(c.width, (x) => at(x, 0)),
            bottom: count(c.width, (x) => at(x, c.height - 1)),
          },
        ];
      }),
    ),
  );

/**
 * The book alone on a flat ground: the sky and its washes hidden, and the
 * chrome (which takes its colour from the sky). Even pinned, the sky redraws
 * its weather when the DOM changes, so it cannot be the control here; these
 * captures must differ only by what the sprite layer drew.
 */
const flatGround = (page) =>
  page.addStyleTag({
    content: '.reader-ground { visibility: hidden !important; } .reader { background: rgb(96, 112, 128) !important; } .reader__back, .reader__bar { visibility: hidden !important; }',
  });

const shot = async (page) => {
  const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

/**
 * Pixels that differ between two screenshots: on a page, on a page's edge (a
 * device pixel the paper only partly covers — the page sits at fractional CSS
 * px, so its edge is antialiased whatever is drawn on it), or off the paper
 * altogether, touching no page.
 */
function diffByPaper(a, b, papers, dpr) {
  let on = 0;
  let edge = 0;
  let off = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * 3;
      if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue;
      const [x0, x1, y0, y1] = [x / dpr, (x + 1) / dpr, y / dpr, (y + 1) / dpr];
      if (papers.some((p) => x0 >= p.x && x1 <= p.x + p.w && y0 >= p.y && y1 <= p.y + p.h)) on++;
      else if (papers.some((p) => x1 > p.x && x0 < p.x + p.w && y1 > p.y && y0 < p.y + p.h)) edge++;
      else off++;
    }
  }
  return { on, edge, off };
}

/**
 * How well the sprite (`shown`) agrees with the print (`baked`) inside its box
 * on the page, counted only where there is drawing: where either differs from
 * the plate. The empty paper around a drawing would agree whatever happened.
 */
function drawingAgreement(shown, baked, plate, paper, box, dpr) {
  const same = (p, q, i) =>
    Math.abs(p.data[i] - q.data[i]) < CLIP_TAU && Math.abs(p.data[i + 1] - q.data[i + 1]) < CLIP_TAU && Math.abs(p.data[i + 2] - q.data[i + 2]) < CLIP_TAU;
  const a = shown;
  const b = baked;
  const k = (paper.w / 2000) * dpr;
  const x0 = Math.ceil(paper.x * dpr + box.x0 * k);
  const x1 = Math.floor(paper.x * dpr + box.x1 * k);
  const y0 = Math.ceil(paper.y * dpr + box.y0 * k);
  const y1 = Math.floor(paper.y * dpr + box.y1 * k);
  let n = 0;
  let hit = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.w + x) * 3;
      if (same(a, plate, i) && same(b, plate, i)) continue;
      n++;
      if (same(a, b, i)) hit++;
    }
  }
  return n ? hit / n : 0;
}

async function checkPageAnimClip(browser) {
  console.log(`\nsprites cut at the paper (spread ${CLIP_SPREAD}: ${CLIP_PAGES.map((n) => String(n).padStart(2, '0')).join(' | ')})`);
  for (const dpr of [1, 2]) {
    // At rest, under reduced motion so both pages hold their rest frames.
    {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, CLIP_SPREAD);
      await flatGround(page);
      await animsShown(page, CLIP_PAGES);
      await page.waitForTimeout(300);

      const geo = await clipGeometry(page);
      const near = (a, b) => a && b && Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.w - b.w) <= 0.5 && Math.abs(a.h - b.h) <= 0.5;
      check(
        geo.length === 2 && geo.every((g) => near(g.canvas, g.paper) && near(g.slot, g.paper) && g.overflow === 'hidden'),
        `@${dpr}× each sprite canvas is exactly its page's paper, in a slot that clips`,
        geo.map((g) => `${g.page}: paper ${g.paper.w.toFixed(1)}×${g.paper.h.toFixed(1)} at ${g.paper.x.toFixed(1)},${g.paper.y.toFixed(1)}; canvas ${g.canvas?.w.toFixed(1)}×${g.canvas?.h.toFixed(1)} at ${g.canvas?.x.toFixed(1)},${g.canvas?.y.toFixed(1)}; overflow ${g.overflow}`).join('; '),
      );
      const ink = await edgeInk(page);
      check(
        CLIP_PAGES.every((n) => CLIP_EDGES[n].every((e) => ink[n]?.[e] > 0)),
        `@${dpr}× both drawings reach the edges they run off (cut there, not short of them)`,
        CLIP_PAGES.map((n) => `${n}: ${CLIP_EDGES[n].map((e) => `${e} ${ink[n]?.[e]} px`).join(', ')}`).join('; '),
      );

      const papers = geo.map((g) => g.paper);
      const shown = await shot(page);
      await page.evaluate(() => document.querySelectorAll('.page-anim__sprites').forEach((c) => (c.style.visibility = 'hidden')));
      const plateOnly = await shot(page);
      await page.evaluate(() => document.querySelectorAll('.page-anim').forEach((w) => (w.style.visibility = 'hidden')));
      const baked = await shot(page);
      await page.evaluate(() => document.querySelectorAll('.page-anim, .page-anim__sprites').forEach((el) => (el.style.visibility = '')));
      const sprites = diffByPaper(shown, plateOnly, papers, dpr);
      check(
        sprites.on > 1000 && sprites.off === 0,
        `@${dpr}× at rest: the sprites draw on the paper and nowhere else`,
        `${sprites.on} px on the pages, ${sprites.edge} on their edges, ${sprites.off} off them`,
      );
      const layer = diffByPaper(shown, baked, papers, dpr);
      check(layer.off === 0, `@${dpr}× at rest: plate and sprites together change nothing off the paper`, `${layer.on} px on the pages, ${layer.edge} on their edges, ${layer.off} off them`);
      const match = CLIP_PAGES.map((n) => {
        const g = geo.find((x) => x.page === n);
        return { n, id: CLIP_BOXES[n].id, agree: drawingAgreement(shown, baked, plateOnly, g.paper, CLIP_BOXES[n], dpr) };
      });
      check(
        match.every((m) => m.agree >= CLIP_MATCH_FLOOR),
        `@${dpr}× at rest: each sprite agrees with the print over their drawing (≥ ${CLIP_MATCH_FLOOR * 100}%)`,
        match.map((m) => `${m.id} ${(m.agree * 100).toFixed(1)}%`).join(', '),
      );
      await context.close();
    }

    // While the pages turn: every frame of a real Next and Prev off 03 | 04
    // each way, a drag, and a riffle across it — the sprite layer never shows
    // with a leaf in the air; held mid-turn, removing it changes no pixel.
    {
      const page = await newPage(browser, dpr);
      await open(page, CLIP_SPREAD);
      await flatGround(page);
      await animsShown(page, CLIP_PAGES);
      const box = await page.evaluate(() => {
        const b = document.querySelector('.book').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      const frames = await sampleFrames(page, async () => {
        for (const [dir, to] of [
          ['next', CLIP_SPREAD + 1],
          ['prev', CLIP_SPREAD],
          ['prev', CLIP_SPREAD - 1],
          ['next', CLIP_SPREAD],
        ]) {
          await page.evaluate((d) => window.__flip.turn(d), dir);
          await settled(page, to);
          await page.waitForTimeout(150);
        }
        await animsShown(page, CLIP_PAGES);
        // A drag: 04 picked up by its outer edge and laid over to the left.
        const y = box.y + box.h * 0.5;
        await page.mouse.move(box.x + box.w * 0.97, y);
        await page.mouse.down();
        for (let i = 1; i <= 24; i++) {
          await page.mouse.move(box.x + box.w * (0.97 - (0.9 * i) / 24), y + Math.sin(i / 4) * 6);
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
        await settled(page, CLIP_SPREAD + 1);
        await page.mouse.move(5, 500);
        // A riffle across 03 | 04 and back.
        await page.evaluate(() => window.__flip.turnTo(6));
        await settled(page, 6);
        await page.evaluate(() => window.__flip.turnTo(1));
        await settled(page, 1);
        await page.evaluate(() => window.__flip.turn('next'));
        await settled(page, CLIP_SPREAD);
        await animsShown(page, CLIP_PAGES);
      });
      const turning = frames.filter((s) => s.layer).length;
      const leaked = frames.filter((s) => s.layer && s.vis).length;
      check(
        leaked === 0 && turning > 60,
        `@${dpr}× through Next and Prev both ways, a drag and a riffle: the sprite layer never shows while a leaf is in the air`,
        `${turning} turning frames, ${leaked} with it shown`,
      );

      const held = [];
      for (const [dir, t] of [
        ['next', 0.3],
        ['next', 0.7],
        ['prev', 0.3],
        ['prev', 0.7],
      ]) {
        await page.evaluate(([d, tt]) => {
          window.__flip.startTurn(d);
          window.__flip.applyTurn(tt);
        }, [dir, t]);
        await page.waitForTimeout(150);
        const withLayer = await shot(page);
        await page.evaluate(() => document.querySelectorAll('.page-anim').forEach((w) => (w.style.display = 'none')));
        const without = await shot(page);
        await page.evaluate(() => document.querySelectorAll('.page-anim').forEach((w) => (w.style.display = '')));
        const d = diffByPaper(withLayer, without, [], dpr); // no page exempt: anything is a failure
        held.push({ dir, t, px: d.off });
        await page.evaluate(() => window.__flip.cancelTurn(0.05));
        await settled(page, CLIP_SPREAD);
        await animsShown(page, CLIP_PAGES);
      }
      check(
        held.every((h) => h.px === 0),
        `@${dpr}× held mid-turn (04 and 03 lifting, t 0.3 and 0.7): the sprite layer adds no pixel anywhere`,
        held.map((h) => `${h.dir} ${h.t}: ${h.px} px`).join(', '),
      );
      await page.context().close();
    }
  }
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const probe = await newPage(browser);
  await probe.goto(`${B}#read-01`).catch(() => {});
  const up = await probe.evaluate(() => !!window.__flip).catch(() => false);
  await probe.context().close();
  if (!up) {
    console.log(`\nNo reader with a dev engine handle at ${ORIGIN}. Run \`npm run dev\` (or pass --url).\n`);
    await browser.close();
    process.exit(1);
  }

  if (ONLY.includes('frames')) await checkRiffleFrames(browser);
  if (ONLY.includes('zorder')) await checkZOrder(browser);
  if (ONLY.includes('nav')) await checkNavigation(browser);
  if (ONLY.includes('folios')) await checkFolios(browser);
  if (ONLY.includes('layout')) await checkReaderLayout(browser);
  if (ONLY.includes('exit')) await checkExit(browser);
  if (ONLY.includes('hover')) await checkHover(browser);
  if (ONLY.includes('life')) await checkLife(browser);
  if (ONLY.includes('sky')) await checkSky(browser);
  if (ONLY.includes('pageanims')) await checkPageAnims(browser);
  if (ONLY.includes('pageclip')) await checkPageAnimClip(browser);
  if (ONLY.includes('quote')) await checkQuote(browser, { newPage, open, check, viewport: VIEWPORT, origin: B });

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
