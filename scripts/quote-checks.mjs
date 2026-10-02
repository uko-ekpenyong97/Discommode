/**
 * The chapter-break quote on page 05 (src/reader/quotePlayer.ts), in Chrome —
 * the `quote` section of `npm run verify:reader`. Everything here is a
 * question about what the browser draws, or which way a press goes:
 *
 *   the print       page 05 at rest in Spanish, drawn by the layer's own code at
 *                   2000×2600 over the plate, against the PRINTED page
 *                   (~/Discommode-pages/01/05.png; the shipped 05.webp if the
 *                   sources are not here): each line registered to ≤ 0.5px, the
 *                   ink within 2%, and the differing pixels reported. Writes the
 *                   difference to `.context/quote/`. And on screen at 1× and 2×:
 *                   the live layer against the printed page in the same slot.
 *   a click         on the quote translates it and turns nothing (no turn layer
 *                   on any frame, the spread unchanged); the morph ends with
 *                   every English letter where the layout says, measured here
 *                   from quotes.json, not read back from the player; the static
 *                   slot carries the English bake, and the layer and the bake
 *                   agree on screen. A click mid-morph lands it and starts the
 *                   next.
 *   a turn          started mid-morph shows the page in the language it was
 *                   going to — on the static slot and on the curl — and never
 *                   the bare plate; flipping away and back, the quote is Spanish.
 *   elsewhere       a click off the quote turns the page; a drag that starts on
 *                   the quote turns it too.
 *   the cursor      the tag over the quote, the book's own off it; never on touch.
 *   keyboard        the button: Enter and Space toggle, its name and its
 *                   description's language follow, the live region speaks.
 *   touch           a tap on the quote translates, a tap elsewhere turns.
 *   reduced motion  a 300ms crossfade: no letter moves and none scrambles.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const QUOTES = JSON.parse(await readFile(new URL('../src/reader/quotes.json', import.meta.url), 'utf8'));
const SPREAD = 3;
const PAGE = 5;
const W = 2000;
const H = 2600;
const PRINT_SRC = join(homedir(), 'Discommode-pages/01/05.png');
const PRINT = existsSync(PRINT_SRC) ? PRINT_SRC : new URL('../public/issues/01/05.webp', import.meta.url).pathname;
const OUT = '.context/quote';

const shown = (page) => page.waitForFunction((n) => window.__quote?.state().some((s) => s.page === n && s.shown), PAGE, { timeout: 15000 });
const qstate = (page) => page.evaluate((n) => window.__quote.state().find((s) => s.page === n), PAGE);
const hash = (page) => page.evaluate(() => +location.hash.split('/')[1]);
const settledAt = (page, t) =>
  page.waitForFunction(
    (t) => +location.hash.split('/')[1] === t && document.querySelector('.book__turn-host').childElementCount === 0,
    t,
    { timeout: 6000 },
  );
const morphDone = (page) => page.waitForFunction((n) => !window.__quote.state().find((s) => s.page === n)?.morphing, PAGE, { timeout: 8000 });

/** Where every letter should sit at rest in `lang`, from quotes.json alone:
 *  the prototype's rule (each letter at the width of its line before it,
 *  centred or right-aligned; the baseline at CSS's half-leading). */
const expected = (page, lang) =>
  page.evaluate(
    ({ q, lang, page }) => {
      const ctx = document.createElement('canvas').getContext('2d');
      const entry = q.pages.find((p) => p.page === page);
      const out = [];
      for (const [key, style, box, align] of [
        ['quote', q.styles.quote, entry.quote, 'center'],
        ['attribution', q.styles.attribution, entry.attribution, 'right'],
      ]) {
        ctx.font = `${style.weight} ${style.sizePx}px "${style.family}"`;
        box[lang].forEach((line, li) => {
          const m = ctx.measureText(line);
          const x0 = align === 'center' ? box.centerX - m.width / 2 : box.right - m.width;
          const y = box.top + li * style.lineHeightPx + (style.lineHeightPx - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
          for (let i = 0; i < line.length; i++) if (line[i] !== ' ') out.push({ ch: line[i], x: x0 + ctx.measureText(line.slice(0, i)).width, y, block: key });
        });
      }
      return out;
    },
    { q: QUOTES, lang, page: PAGE },
  );

const sameLetters = (a, b, tol = 0.01) =>
  a.length === b.length && a.every((g, i) => g.ch === b[i].ch && g.block === b[i].block && Math.abs(g.x - b[i].x) <= tol && Math.abs(g.y - b[i].y) <= tol && (g.alpha ?? 1) === 1);

// ── pixels ───────────────────────────────────────────────────────────────

/** Darkness (255 − luminance) per pixel. */
const darkness = async (input, region) => {
  let img = sharp(input).removeAlpha();
  if (region) img = img.extract(region);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(info.width * info.height);
  for (let i = 0; i < L.length; i++) L[i] = 255 - (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]);
  return { L, w: info.width, h: info.height };
};

/** The shift (px, to 0.05) that best lays `got` on `ref` inside a box, and the
 *  ink ratio once it is laid there. */
function register(ref, got, w, [x0, y0, x1, y1]) {
  const at = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const i = yi * w + xi;
    return got[i] * (1 - fx) * (1 - fy) + got[i + 1] * fx * (1 - fy) + got[i + w] * (1 - fx) * fy + got[i + w + 1] * fx * fy;
  };
  let best = null;
  const run = (cx, cy, span, step) => {
    for (let dy = cy - span; dy <= cy + span + 1e-9; dy += step) {
      for (let dx = cx - span; dx <= cx + span + 1e-9; dx += step) {
        let e = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) e += (ref[y * w + x] - at(x + dx, y + dy)) ** 2;
        if (!best || e < best.e) best = { dx, dy, e };
      }
    }
  };
  run(0, 0, 2, 1);
  run(best.dx, best.dy, 1, 0.25);
  run(best.dx, best.dy, 0.25, 0.05);
  let a = 0;
  let b = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (a += ref[y * w + x]), (b += got[y * w + x]);
  return { dx: -best.dx, dy: -best.dy, ink: b / a };
}

/** Pixels over `levels` apart, and the print's ink pixels for scale. */
function differ(ref, got, levels) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) if (Math.abs(ref[i] - got[i]) > levels) n++;
  return n;
}

async function checkPrint(page, check) {
  console.log(`  the print: ${PRINT.replace(homedir(), '~')}`);
  const url = await page.evaluate((n) => window.__quote.render(n, 'es', false), PAGE);
  const png = Buffer.from(url.split(',')[1], 'base64');
  const ref = await darkness(PRINT);
  const got = await darkness(png);
  // Each printed line, by its band (the layer's own baselines ± the type).
  const lines = [];
  const q = QUOTES.pages.find((p) => p.page === PAGE);
  const band = (style, top, i, x0, x1) => [x0, Math.floor(top + i * style.lineHeightPx), x1, Math.ceil(top + (i + 1) * style.lineHeightPx)];
  q.quote.es.forEach((_, i) => lines.push([`quote line ${i + 1}`, band(QUOTES.styles.quote, q.quote.top, i, 700, 1300)]));
  q.attribution.es.forEach((_, i) => lines.push([`attribution line ${i + 1}`, band(QUOTES.styles.attribution, q.attribution.top, i, 1040, 1300)]));
  const regs = lines.map(([name, box]) => ({ name, ...register(ref.L, got.L, W, box) }));
  for (const r of regs) {
    check(
      Math.hypot(r.dx, r.dy) <= 0.5 && Math.abs(r.ink - 1) <= 0.02,
      `${r.name} sits on the print`,
      `off by ${r.dx.toFixed(2)}, ${r.dy.toFixed(2)} px; ink ${(r.ink * 100).toFixed(1)}% of the print's`,
    );
  }
  const inkPx = ref.L.reduce((n, v) => n + (v > 32 ? 1 : 0), 0);
  const d = [8, 32, 64, 128].map((l) => differ(ref.L, got.L, l));
  console.log(
    `    2000×2600, ${W * H} px: ${d[0]} differ by more than 8 levels, ${d[1]} by 32, ${d[2]} by 64, ${d[3]} by 128 (the print has ${inkPx} ink px); max ${Math.round(ref.L.reduce((m, v, i) => Math.max(m, Math.abs(v - got.L[i])), 0))} levels`,
  );
  await mkdir(OUT, { recursive: true });
  const crop = { left: 680, top: 1080, width: 640, height: 420 };
  const diff = Buffer.alloc(crop.width * crop.height * 3);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const i = (y + crop.top) * W + x + crop.left;
      const v = 255 - Math.min(255, Math.abs(ref.L[i] - got.L[i]) * 2);
      diff.set([255, v, v], (y * crop.width + x) * 3);
    }
  }
  await sharp(diff, { raw: { width: crop.width, height: crop.height, channels: 3 } }).png().toFile(join(OUT, 'print-diff.png'));
  await sharp(png).extract(crop).toFile(join(OUT, 'render-es.png'));
  await sharp(PRINT).extract(crop).toFile(join(OUT, 'print.png'));
  return { regs, d, inkPx };
}

/** The left page's slot, screenshotted: with the layer, or with only the
 *  static image (`src`, if given) under it. */
async function slotShot(page, src) {
  const slot = page.locator('.book > .book__page--left');
  if (src !== undefined) {
    await page.evaluate((src) => {
      const layer = document.querySelector('.quote-layer');
      layer.style.visibility = 'hidden';
      const img = document.querySelector('.book > .book__page--left > img');
      window.__keptSrc = img.getAttribute('src');
      if (src) img.src = src;
      return img.decode();
    }, src);
  }
  const box = await slot.boundingBox();
  const png = await page.screenshot({ clip: box });
  if (src !== undefined) {
    await page.evaluate(() => {
      document.querySelector('.quote-layer').style.visibility = '';
      const img = document.querySelector('.book > .book__page--left > img');
      img.src = window.__keptSrc;
    });
  }
  return png;
}

/** The live layer against `src` in the same slot, inside the quote's box (the
 *  hint, which the print has not, left out). */
async function onScreen(page, src) {
  const a = await slotShot(page);
  const b = await slotShot(page, src);
  const { width, height } = await sharp(a).metadata();
  const q = QUOTES.pages.find((p) => p.page === PAGE);
  const region = {
    left: Math.floor((690 / W) * width),
    top: Math.floor(((q.quote.top - 20) / H) * height),
    width: Math.ceil((620 / W) * width),
    height: Math.ceil(((q.attribution.top + 2 * QUOTES.styles.attribution.lineHeightPx + 10 - (q.quote.top - 20)) / H) * height),
  };
  const A = await darkness(a, region);
  const B = await darkness(b, region);
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < A.L.length; i++) (ia += A.L[i]), (ib += B.L[i]);
  return { px: A.L.length, d32: differ(B.L, A.L, 32), d64: differ(B.L, A.L, 64), ink: ia / ib };
}

// ── frames ───────────────────────────────────────────────────────────────

/** Record, every frame until stopped: the turn layer, the static page 05, the
 *  curl's faces, the quote layer, the letters drawn. */
const recordFrames = (page) =>
  page.evaluate((n) => {
    window.__qFrames = [];
    window.__qOn = true;
    const f = () => {
      const img = document.querySelector('.book > .book__page--left > img');
      const faces = [...document.querySelectorAll('.flip-strip > *')].map((x) => x.style.backgroundImage).filter((b) => b && b !== 'none');
      const layer = document.querySelector('.quote-layer');
      const s = window.__quote.state().find((x) => x.page === n);
      window.__qFrames.push({
        turn: document.querySelector('.book__turn-host').childElementCount > 0,
        staticSrc: img?.getAttribute('src') ?? null,
        staticReady: !!img && img.complete && img.naturalWidth > 0,
        faces: [...new Set(faces)],
        plates: [...document.querySelectorAll('.book__turn img')].map((i) => i.getAttribute('src')),
        layerShown: !!layer && getComputedStyle(layer).visibility !== 'hidden',
        drawn: s ? s.drawn.map((g) => `${g.ch}@${g.x.toFixed(2)},${g.y.toFixed(2)}`) : null,
        lang: s?.lang ?? null,
      });
      if (window.__qOn) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, PAGE);
const stopFrames = (page) =>
  page.evaluate(() => {
    window.__qOn = false;
    return window.__qFrames;
  });

async function hitCentre(page) {
  const b = await page.locator('.quote-layer__hit').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

// ── the section ──────────────────────────────────────────────────────────

export async function checkQuote(browser, { newPage, open, check, viewport }) {
  console.log('\nchapter-break quote (page 05)');

  // ── the print, and on screen ──
  /** At 1×, how far the Spanish layer is from the printed page in its slot:
   *  the floor any 2000px page drawn into the slot is held to (it is all edge
   *  resampling, the slot drawn at its size against a page scaled down to it). */
  let floor = null;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    await open(page, SPREAD);
    await shown(page);
    await page.waitForTimeout(300);
    if (dpr === 1) await checkPrint(page, check);
    const s = await onScreen(page, '/issues/01/05.webp');
    check(
      Math.abs(s.ink - 1) <= 0.04,
      `@${dpr}× on screen, the Spanish layer reads as the printed page`,
      `ink ${(s.ink * 100).toFixed(1)}% of the printed page's in the same slot; ${s.d32} of ${s.px} px differ by more than 32 levels, ${s.d64} by 64`,
    );
    if (dpr === 1) floor = s;
    await page.context().close();
  }

  const page = await newPage(browser, 1);
  await open(page, SPREAD);
  await shown(page);
  const es = await expected(page, 'es');
  const en = await expected(page, 'en');
  const s0 = await qstate(page);
  check(sameLetters(s0.drawn, es), 'at rest the layer draws every Spanish letter where quotes.json puts it', `${s0.drawn.length} letters`);

  // ── the cursor ──
  const c = await hitCentre(page);
  await page.mouse.move(c.x, c.y);
  await page.waitForTimeout(50);
  const over = await page.evaluate(() => ({ data: document.querySelector('.book').dataset.cursor, css: getComputedStyle(document.querySelector('.book')).cursor }));
  await page.mouse.move(c.box.x + 4, c.box.y - 60);
  await page.waitForTimeout(50);
  const off = await page.evaluate(() => ({ data: document.querySelector('.book').dataset.cursor ?? null, css: getComputedStyle(document.querySelector('.book')).cursor }));
  check(
    over.data === 'quote' && over.css.includes('url(') && off.data === null && off.css === 'grab',
    'the cursor is the ES ⇄ EN tag over the quote, and the book’s own off it',
    `over: ${over.css.slice(0, 24)}…; off: ${off.css}`,
  );

  // ── a click translates and turns nothing ──
  await page.mouse.move(c.x, c.y);
  await recordFrames(page);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  let frames = await stopFrames(page);
  const s1 = await qstate(page);
  check(
    !frames.some((f) => f.turn) && (await hash(page)) === SPREAD && s1.lang === 'en' && s1.morphing,
    'a click on the quote translates it and turns nothing',
    `turn layer on ${frames.filter((f) => f.turn).length} of ${frames.length} frames; spread ${await hash(page)}; ${s1.lang}, morphing ${s1.morphing} (${s1.morph?.moved} of ${s1.morph?.total} letters travel)`,
  );
  check(
    s1.label === 'Show the quote in Spanish' && s1.live.lang === 'en' && s1.live.text.startsWith('We cannot celebrate') && s1.desc.lang === 'en',
    'the button’s name, its description’s language and the live region follow',
    `"${s1.label}"; live [${s1.live.lang}] "${s1.live.text.slice(0, 26)}…"`,
  );
  await morphDone(page);
  const s2 = await qstate(page);
  check(sameLetters(s2.drawn, en), 'the morph ends with every English letter where quotes.json puts it', `${s2.drawn.length} letters, to 0.01px`);
  const bake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'en'), PAGE);
  const staticSrc = await page.evaluate(() => document.querySelector('.book > .book__page--left > img').getAttribute('src'));
  check(!!bake && staticSrc === bake, 'the static slot under the layer carries the English bake', staticSrc?.slice(0, 40));
  const agree = await onScreen(page, '');
  check(
    agree.d64 <= floor.d64 * 1.25 && Math.abs(agree.ink - 1) <= 0.03,
    'the English layer and the English bake agree on screen, as the Spanish layer and the print do',
    `${agree.d64} of ${agree.px} px differ by more than 64 levels (Spanish against the print: ${floor.d64}); ink ${(agree.ink * 100).toFixed(1)}%`,
  );

  // ── a click mid-morph lands it, then starts the next ──
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(500);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(30);
  const s3 = await qstate(page);
  await page.waitForTimeout(500);
  const mid = await qstate(page);
  await morphDone(page);
  const s4 = await qstate(page);
  check(
    s3.lang === 'en' && s3.morphing && mid.morphing && sameLetters(s4.drawn, en) && (await hash(page)) === SPREAD,
    'a click mid-morph lands it and starts the next (ES→EN→ES→EN: English)',
    `${s3.lang}, morphing; then ${s4.lang}`,
  );

  // ── a turn mid-morph: the language it was going to, baked, never the plate ──
  await page.mouse.click(c.x, c.y); // → es
  await page.waitForTimeout(400);
  await morphDone(page);
  await page.mouse.click(c.x, c.y); // → en
  await page.waitForTimeout(300);
  const enBake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'en'), PAGE);
  const esBake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'es'), PAGE);
  await recordFrames(page);
  await page.keyboard.press('ArrowLeft');
  await settledAt(page, SPREAD - 1);
  frames = await stopFrames(page);
  const turning = frames.filter((f) => f.turn);
  const firstTurn = turning[0];
  const facesWith05 = turning.flatMap((f) => f.faces).filter((b) => b.includes(enBake) || b.includes(esBake) || b.includes('/05.webp') || b.includes('plates/05'));
  check(
    turning.length > 0 &&
      turning.every((f) => !f.layerShown) &&
      firstTurn.staticSrc === enBake &&
      firstTurn.staticReady &&
      facesWith05.length > 0 &&
      facesWith05.every((b) => b.includes(enBake)) &&
      !frames.some((f) => [...f.faces, ...f.plates].some((b) => b?.includes('/plates/'))),
    'a turn mid-morph shows page 05 in English, baked: the static slot and the curl, never the plate',
    `${turning.length} turning frames; static ${firstTurn?.staticSrc === enBake ? 'the English bake' : firstTurn?.staticSrc}, ${firstTurn?.staticReady ? 'decoded' : 'NOT decoded'}; curl ${[...new Set(facesWith05)].map((b) => (b.includes(enBake) ? 'en bake' : b.slice(0, 30))).join(', ')}`,
  );
  // …and back: Spanish.
  await recordFrames(page);
  await page.keyboard.press('ArrowRight');
  await settledAt(page, SPREAD);
  frames = await stopFrames(page);
  await shown(page);
  await page.waitForTimeout(200);
  const back = await qstate(page);
  const backFaces = frames.filter((f) => f.turn).flatMap((f) => f.faces).filter((b) => b.includes(enBake) || b.includes(esBake));
  check(
    back.lang === 'es' && sameLetters(back.drawn, es) && backFaces.length > 0 && backFaces.every((b) => b.includes(esBake)),
    'flipping away and back, the quote is Spanish again (the arriving leaf too)',
    `${back.lang}; arriving leaf ${backFaces.every((b) => b.includes(esBake)) ? 'the Spanish bake' : 'NOT the Spanish bake'}`,
  );

  // ── elsewhere: a click turns; a drag from the quote turns ──
  const book = await page.locator('.book').boundingBox();
  await page.mouse.click(book.x + book.width * 0.12, book.y + book.height * 0.15);
  await settledAt(page, SPREAD - 1).catch(() => {});
  const afterClick = await hash(page);
  await page.mouse.click(book.x + book.width * 0.88, book.y + book.height * 0.15);
  await settledAt(page, SPREAD).catch(() => {});
  await shown(page);
  const c2 = await hitCentre(page);
  await page.mouse.move(c2.x, c2.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(c2.x + (book.width * 0.6 * i) / 12, c2.y);
  await page.mouse.up();
  await settledAt(page, SPREAD - 1).catch(() => {});
  const afterDrag = await hash(page);
  const dragLang = await page.evaluate((n) => window.__quote.langs()[n] ?? 'es', PAGE);
  check(afterClick === SPREAD - 1, 'a click off the quote turns the page', `spread ${SPREAD} → ${afterClick}`);
  check(afterDrag === SPREAD - 1 && dragLang === 'es', 'a drag that starts on the quote turns the page (and translates nothing)', `spread ${SPREAD} → ${afterDrag}`);
  await page.keyboard.press('ArrowRight');
  await settledAt(page, SPREAD);
  await shown(page);

  // ── keyboard ──
  await page.locator('.quote-layer__hit').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const k1 = await qstate(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(100);
  const k2 = await qstate(page);
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('quote-layer__hit'));
  check(
    k1.lang === 'en' && k2.lang === 'es' && (await hash(page)) === SPREAD && focused,
    'the quote is a button: Enter and Space toggle it, and turn nothing',
    `Enter → ${k1.lang}, Space → ${k2.lang}; spread ${await hash(page)}`,
  );
  check(k2.desc.lang === 'es' && k2.label === 'Translate the quote to English', 'its name and its description’s language are back to Spanish', `"${k2.label}" [${k2.desc.lang}]`);
  await page.context().close();

  // ── touch ──
  const touch = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2 });
  const tp = await touch.newPage();
  await open(tp, SPREAD);
  await shown(tp);
  const t = await hitCentre(tp);
  await tp.touchscreen.tap(t.x, t.y);
  await tp.waitForTimeout(300);
  const ts = await qstate(tp);
  const tcur = await tp.evaluate(() => document.querySelector('.book').dataset.cursor ?? null);
  const tbook = await tp.locator('.book').boundingBox();
  await tp.touchscreen.tap(tbook.x + tbook.width * 0.12, tbook.y + tbook.height * 0.15);
  await settledAt(tp, SPREAD - 1).catch(() => {});
  check(ts.lang === 'en' && tcur === null, 'a tap on the quote translates it, with no cursor tag', `${ts.lang}, cursor ${tcur}`);
  check((await hash(tp)) === SPREAD - 1, 'a tap off the quote turns the page', `spread ${await hash(tp)}`);
  await touch.close();

  // ── reduced motion ──
  const rm = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const rp = await rm.newPage();
  await open(rp, SPREAD);
  await shown(rp);
  const r = await hitCentre(rp);
  await recordFrames(rp);
  const t0 = Date.now();
  await rp.mouse.click(r.x, r.y);
  await morphDone(rp);
  const took = Date.now() - t0;
  frames = await stopFrames(rp);
  const rs = await qstate(rp);
  const places = new Set([...es, ...en].map((g) => `${g.ch}@${g.x.toFixed(2)},${g.y.toFixed(2)}`));
  const stray = frames.flatMap((f) => f.drawn ?? []).filter((d) => !places.has(d));
  check(
    stray.length === 0 && took < 700 && sameLetters(rs.drawn, en),
    'reduced motion: a crossfade — no letter moves or scrambles — done in about 300ms',
    `${frames.length} frames, ${stray.length} letters off both layouts${stray.length ? ` (${stray.slice(0, 3).join(' ')})` : ''}; ${took}ms to settle`,
  );
  await rm.close();
}
