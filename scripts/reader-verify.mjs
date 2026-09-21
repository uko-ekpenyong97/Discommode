/**
 * The reader, in Chrome. `npm run verify:reader` with the dev server running
 * (`npm run dev`; `--url` for another origin, `--runs N` for the frame budget,
 * `--only frames,zorder,nav,exit,hover` for a subset).
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
 *
 * It drives the reader through `window.__flip`, the dev-only engine handle, and
 * its `probe` (hold a riffle at any ms, paint leaves flat hues, read their state).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const RUNS = Number(arg('--runs', 5));
/** `--only frames,zorder,nav,exit,hover` runs just those sections. */
const ONLY = arg('--only', 'frames,zorder,nav,exit,hover').split(',');
const B = `${ORIGIN}/`;
const VIEWPORT = { width: 1728, height: 996 };
const FRAME_BUDGET_MS = 20;
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
    caption: +document.querySelector('.reader__caption').textContent.match(/SPREAD (\d+)/)[1] - 1,
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
      for (let ms = 0; ms <= 2000; ms += 1000 / 60) {
        await page.evaluate((ms) => window.__flip.probe.hold(ms), ms);
        const air = await page.evaluate(() => window.__flip.probe.leaves().filter((l) => l.phase === 'air'));
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
      if (c && window.__caps.at(-1) !== c.textContent) window.__caps.push(c.textContent);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const esc = await page.evaluate(() => ({ last: window.__caps.at(-1), hash: location.hash, reader: !!document.querySelector('.reader') }));
  check(
    /SPREAD 22 \/ 22/.test(esc.last ?? '') && esc.hash === '#item-01' && !esc.reader,
    'Escape mid-riffle lands the riffle, then exits',
    JSON.stringify(esc),
  );
  await page.context().close();
}

// ── the exit: pill and Escape are one thing ──────────────────────────────────

async function exitFrames(browser, how) {
  const page = await newPage(browser);
  await page.goto(`${B}#item-01`);
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
  if (how === 'pill') await page.getByRole('button', { name: '‹ Back', exact: true }).click();
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

  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
