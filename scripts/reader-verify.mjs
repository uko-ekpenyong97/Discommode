/**
 * The reader, in Chrome. `npm run verify:reader` with the dev server running
 * (`npm run dev`; `--url` for another origin, `--runs N` for the frame budget,
 * `--only frames,zorder,nav,exit,hover,life,sky` for a subset).
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
 *
 * The z-order and exit checks photograph the book over the sky now, so they
 * hold the sky still first (`stillSky`: its clock pinned, its wake frozen) —
 * two captures must differ only by what the reader did.
 *
 * It drives the reader through `window.__flip`, the dev-only engine handle, and
 * its `probe` (hold a riffle at any ms, paint leaves flat hues, read their state).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { atRest, boilSteps, emptyPoint, hoverAll, judgeLeave, leaveAll, registration } from './cover-life-checks.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const RUNS = Number(arg('--runs', 5));
/** `--only frames,zorder,nav,exit,hover,life,sky` runs just those sections. */
const ONLY = arg('--only', 'frames,zorder,nav,exit,hover,life,sky').split(',');
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
    imgs: [...document.querySelectorAll('.book > .book__page img')]
      .map((i) => i.getAttribute('src').split('/').pop().replace('.webp', ''))
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
  if (how === 'pill') await page.getByRole('button', { name: 'Back', exact: true }).click();
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
  if (ONLY.includes('exit')) await checkExit(browser);
  if (ONLY.includes('hover')) await checkHover(browser);
  if (ONLY.includes('life')) await checkLife(browser);
  if (ONLY.includes('sky')) await checkSky(browser);

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
