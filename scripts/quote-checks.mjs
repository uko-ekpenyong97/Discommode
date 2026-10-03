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
 *   the wand        over the quote the native cursor goes and wand.svg follows
 *                   the pointer, its hotspot (the star's centre) on it, 52px
 *                   tall at −32°; it goes off the quote; a click at the hotspot
 *                   translates; mid-morph its colour leaves the palette's first
 *                   and comes back after; a tap flicks it. Never on touch.
 *   its pixels      on every quote page at 1× and 2×, the wand alone on white:
 *                   the star on the pointer, #EDD431; the outline crisp (≥ 1
 *                   device px, dark all round); mid-cycle the outline stays
 *                   black while only the fill changes; #EDD431 after.
 *   grow, breath    hovered, the letters go to ×1.03 and back on leave; until
 *                   the first tap they breathe to ×1.012 (not while hovered),
 *                   and after it never. A turn while grown shows the bake at ×1.
 *   the turn ease   a turn that starts with the letters grown or mid-breath
 *                   eases them to ×1 over ~180ms as the page lifts: on every
 *                   frame of Prev (05 lifting), Next (05 lying), a riffle, and
 *                   from mid-breath, what shows steps no more than a third of
 *                   the way in a frame; held, the leaf draws the letters at the
 *                   layer's size, and at the end at the bake's.
 *   keyboard        the button: Enter and Space toggle, its name and its
 *                   description's language follow, the live region speaks.
 *   touch           a tap on the quote translates, a tap elsewhere turns.
 *   reduced motion  a 300ms crossfade: no letter moves and none scrambles; no
 *                   breathing, grow or flick, but the wand and its colour.
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
/** The letters at ×1: off the quote, the grow undone, the breath at rest. */
const unscaled = (page) => page.waitForFunction((n) => window.__quote.state().find((s) => s.page === n)?.scale === 1, PAGE, { timeout: 8000 });
const wandOf = (page) => page.evaluate(() => window.__quote.wand());
const BASE = QUOTES.settings.wandPalette[0].toLowerCase();
/** `ms` of the letters' scale, every frame. */
const scaleFrames = (page, ms) =>
  page.evaluate(
    ({ n, ms }) =>
      new Promise((done) => {
        const out = [];
        const t0 = performance.now();
        const f = () => {
          out.push(window.__quote.state().find((s) => s.page === n)?.scale ?? null);
          if (performance.now() - t0 < ms) requestAnimationFrame(f);
          else done(out);
        };
        requestAnimationFrame(f);
      }),
    { n: PAGE, ms },
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
        wandOn: window.__quote.wand()?.on ?? false,
        scale: s?.scale ?? null,
        easing: !!s?.turnEase,
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

// ── the turn ease ────────────────────────────────────────────────────────

/** Every frame of `act`: the scale the quote's letters SHOW at — the layer's
 *  while it is up, else the one a leaf or a riffle's slot draws them at
 *  (--quote-s on the book, if anything there draws the eased letters). */
async function easeFrames(page, act, ms = 700) {
  await page.evaluate((n) => {
    window.__qe = [];
    window.__qeOn = true;
    const f = () => {
      const book = document.querySelector('.book');
      const layer = document.querySelector('.quote-layer');
      const slot = layer?.closest('.book__page');
      const st = window.__quote.state().find((x) => x.page === n);
      const layerUp = !!layer && !!st?.shown && getComputedStyle(layer).visibility !== 'hidden' && getComputedStyle(slot).visibility !== 'hidden';
      const eased = [...document.querySelectorAll('.flip-curl .flip-face--front')].some((x) => x.style.backgroundImage.split('url(').length > 2) || !!document.querySelector('.book__turn .book__ease-letters');
      const qs = getComputedStyle(book).getPropertyValue('--quote-s');
      window.__qe.push({ turn: document.querySelector('.book__turn-host').childElementCount > 0, layerUp, eased, shown: layerUp ? st.scale : eased ? (qs ? Number(qs) : 1) : 1 });
      if (window.__qeOn) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, PAGE);
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    window.__qeOn = false;
    return window.__qe;
  });
}

/** The biggest change in what shows from one frame to the next, as a share of
 *  where it started from ×1; and where it starts and ends. */
function steps(frames) {
  const v = frames.map((f) => f.shown);
  const from = v[0];
  let worst = 0;
  for (let i = 1; i < v.length; i++) worst = Math.max(worst, Math.abs(v[i] - v[i - 1]));
  return { from, end: v.at(-1), worst, share: Math.abs(from - 1) > 1e-9 ? worst / Math.abs(from - 1) : 0, eased: frames.filter((f) => f.eased).length, layer: frames.filter((f) => f.turn && f.layerUp).length };
}

/** How wide the quote's letters are on screen, in a screenshot of the left
 *  page: twice the darkness-weighted spread of their x (σ), which scales with
 *  their size whatever the antialiasing. Returned as `w`. */
async function inkBox(page) {
  const slot = await page.locator('.book > .book__page--left').boundingBox();
  const png = await page.screenshot({ clip: slot });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const q = QUOTES.pages.find((p) => p.page === PAGE);
  const y0 = Math.floor(((q.quote.top - 30) / H) * info.height);
  const y1 = Math.ceil(((q.quote.top + 3 * QUOTES.styles.quote.lineHeightPx + 30) / H) * info.height);
  let sw = 0, sx = 0, sxx = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      // Black ink only: not the paper, not the green hint, not the yellow wand.
      const k = Math.max(0, 200 - Math.max(data[i], data[i + 1], data[i + 2]));
      sw += k; sx += k * x; sxx += k * x * x;
    }
  }
  const m = sx / sw;
  return { w: 2 * Math.sqrt(sxx / sw - m * m) };
}

async function checkTurnEase(page, check) {
  const c = await hitCentre(page);
  const over = async () => {
    await page.mouse.move(c.x - 30, c.y - 10, { steps: 2 });
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.waitForFunction((n) => Math.abs(window.__quote.state().find((s) => s.page === n).scale - 1.03) < 1e-6, PAGE, { timeout: 4000 });
  };
  const away = () => page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  // The ease layers are baked after the reveal.
  await page.waitForFunction(() => {
    const img = document.querySelector('.book > .book__page--left > img');
    return !!img && img.getAttribute('src').startsWith('blob:');
  });
  await page.waitForTimeout(800);

  // Held: the leaf at the ease's start draws the letters as much bigger than
  // at its end as the grown layer is than the page at rest. (Leaf against
  // leaf: a curl at t 0 is not in pixel register with the flat page — up to
  // 13px across the spread, flipbook.css — so it is measured against itself.)
  // The wand is hidden while measuring: it lies over the letters.
  const wandVis = (v) => page.evaluate((v) => (document.querySelector('.quote-wand').style.visibility = v), v);
  await away();
  await unscaled(page);
  const rest = await inkBox(page);
  await over();
  await wandVis('hidden');
  const grown = await inkBox(page);
  await page.evaluate(() => {
    window.__quote.holdEase(0);
    window.__flip.startTurn('prev');
  });
  await page.waitForTimeout(200);
  const leaf0 = await inkBox(page);
  await page.evaluate(() => window.__quote.holdEase(1));
  await page.waitForTimeout(100);
  const leaf1 = await inkBox(page);
  await page.evaluate(() => {
    window.__quote.holdEase(null);
    window.__flip.clearTurn();
  });
  await wandVis('');
  await page.waitForTimeout(300);
  const layerRatio = grown.w / rest.w;
  const leafRatio = leaf0.w / leaf1.w;
  check(
    // Against the grow itself (×1.03): a leaf that stepped would read ×1.000.
    // The layer's own ratio is reported — the canvas re-antialiases at each
    // scale, which moves a 1× measure of it by ~1%; the leaf scales one image.
    Math.abs(leafRatio - QUOTES.settings.hoverScale) <= 0.008 && layerRatio > 1.02,
    'held, the lifting leaf draws the letters grown (×1.03) at the ease’s start and at ×1 at its end',
    `letters' spread: leaf at the ease's start ×${leafRatio.toFixed(4)} of its end; the layer grown ×${layerRatio.toFixed(4)} of rest`,
  );

  // Every frame: Prev (05 lifts), Next (05 lies under the leaf), a riffle.
  const runs = [];
  for (const [label, key, back, lands] of [
    ['Prev (05 lifting)', 'ArrowLeft', 'ArrowRight', SPREAD - 1],
    ['Next (05 lying)', 'ArrowRight', 'ArrowLeft', SPREAD + 1],
    ['Home (a riffle)', 'Home', null, 0],
  ]) {
    await over();
    const fr = await easeFrames(page, () => page.keyboard.press(key));
    runs.push([label, steps(fr)]);
    await away();
    await settledAt(page, lands);
    if (back) await page.keyboard.press(back);
    else await page.evaluate((s) => (location.hash = `#read-01/${s}`), SPREAD);
    await settledAt(page, SPREAD);
    await shown(page);
    await page.waitForTimeout(300);
  }
  // From mid-breath (untapped again: away and back reset it).
  await unscaled(page);
  await page.waitForFunction((n) => window.__quote.state().find((s) => s.page === n).scale > 1.006, PAGE, { timeout: 8000 });
  runs.push(['Next from mid-breath', steps(await easeFrames(page, () => page.keyboard.press('ArrowRight')))]);
  await settledAt(page, SPREAD + 1);
  await page.keyboard.press('ArrowLeft');
  await settledAt(page, SPREAD);
  for (const [label, r] of runs) {
    check(
      r.from > 1.004 && r.end === 1 && r.share <= 0.34 && r.eased + r.layer > 0,
      `a turn from a grown quote eases it to ×1, no frame a jump: ${label}`,
      `×${r.from.toFixed(4)} → ×${r.end}; biggest step ${r.worst.toFixed(4)} (${(r.share * 100).toFixed(0)}% of the way); ${r.layer} frames on the layer, ${r.eased} on the leaf or slot`,
    );
  }
}

// ── the wand's pixels ────────────────────────────────────────────────────

/** The spread a printed inside page opens on (Issue 01 has a cover). */
const spreadOfPage = (n) => Math.floor((n + 1) / 2);

/** The wand alone on white, around its star (`hot`), as raw RGB. */
async function wandShot(page, hot) {
  const clip = { x: Math.floor(hot.x - 45), y: Math.floor(hot.y - 20), width: 90, height: 70 };
  await page.evaluate(() => document.documentElement.classList.add('__wand-alone'));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove('__wand-alone'));
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, n: info.width * info.height, png };
}
const lumaAt = (d, i) => 0.2126 * d[i * 3] + 0.7152 * d[i * 3 + 1] + 0.0722 * d[i * 3 + 2];
const chromaAt = (d, i) => Math.max(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]) - Math.min(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * On every quote page, at 1× and 2×: the wand's star on the pointer (≤ 1px),
 * #EDD431 at rest; its outline crisp (at least one device pixel of black) and
 * black mid-cycle while the fill takes the palette; back to #EDD431 after.
 * The wand is shot alone on white (the page hidden for the shot), the pointer
 * still, after the flick.
 */
async function checkWandPixels(browser, { newPage, open, check }) {
  for (const entry of QUOTES.pages) {
    const n = entry.page;
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, dpr);
      await open(page, spreadOfPage(n));
      await page.waitForFunction((n) => window.__quote?.state().some((s) => s.page === n && s.shown), n, { timeout: 15000 });
      await page.addStyleTag({ content: 'html.__wand-alone body > *:not(.quote-wand) { visibility: hidden !important } html.__wand-alone, html.__wand-alone body { background: #fff !important }' });
      const b = await page.locator(`.quote-layer[data-page="${n}"] .quote-layer__hit`).boundingBox();
      const x = Math.round(b.x + b.width / 2) + 0.3;
      const y = Math.round(b.y + b.height / 2) + 0.6;
      await page.mouse.move(x - 40, y, { steps: 4 });
      await page.mouse.move(x, y, { steps: 6 });
      await page.waitForTimeout(700);
      const w0 = await wandOf(page);
      const rest = await wandShot(page, w0.hot);
      // The outline: what is black at rest; the fill: what is the base colour.
      const base = hexRgb(BASE);
      const outline = [];
      const fill = [];
      let dark64 = 0;
      for (let i = 0; i < rest.n; i++) {
        if (lumaAt(rest.data, i) <= 64) dark64++;
        if (lumaAt(rest.data, i) <= 32) outline.push(i);
        else if (Math.hypot(rest.data[i * 3] - base[0], rest.data[i * 3 + 1] - base[1], rest.data[i * 3 + 2] - base[2]) <= 6) fill.push(i);
      }
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(600); // past the flick (420ms): the wand is where it rests
      const mids = [];
      for (let k = 0; k < 5; k++) {
        const w = await wandOf(page);
        mids.push({ colour: w.colour, shot: await wandShot(page, w.hot) });
        await page.waitForTimeout(170);
      }
      let worstLuma = 0;
      let worstChroma = 0;
      let fillMoved = 0;
      const offBase = mids.filter((m) => m.colour !== BASE);
      for (const m of offBase) {
        for (const i of outline) {
          worstLuma = Math.max(worstLuma, lumaAt(m.shot.data, i));
          worstChroma = Math.max(worstChroma, chromaAt(m.shot.data, i));
        }
        // The fill is one colour, off the base (the shot may be a frame or two
        // on from the colour read beside it, so it is not matched to that).
        const med = [0, 1, 2].map((c) => fill.map((i) => m.shot.data[i * 3 + c]).sort((a, b) => a - b)[fill.length >> 1]);
        const one = fill.filter((i) => Math.hypot(m.shot.data[i * 3] - med[0], m.shot.data[i * 3 + 1] - med[1], m.shot.data[i * 3 + 2] - med[2]) <= 8).length;
        if (Math.hypot(med[0] - base[0], med[1] - base[1], med[2] - base[2]) > 24) fillMoved = Math.max(fillMoved, one / Math.max(1, fill.length));
      }
      await page.waitForFunction((n) => !window.__quote.state().find((s) => s.page === n)?.morphing, n, { timeout: 8000 });
      await page.waitForTimeout(1500);
      const w1 = await wandOf(page);
      const tag = `page ${String(n).padStart(2, '0')} @${dpr}×`;
      if (dpr === 2 && n === QUOTES.pages[0].page) {
        await mkdir(OUT, { recursive: true });
        await sharp(rest.png).toFile(join(OUT, `wand-rest-${dpr}x.png`));
        // The shot furthest from the base colour.
        const far = (h) => Math.hypot(...hexRgb(h).map((v, i) => v - base[i]));
        const most = mids.reduce((m, x) => (far(x.colour) > far(m.colour) ? x : m));
        await sharp(most.shot.png).toFile(join(OUT, `wand-mid-${dpr}x.png`));
      }
      check(
        Math.hypot(w0.hot.x - x, w0.hot.y - y) <= 1 && w0.colour === BASE && Math.abs(w0.height - QUOTES.settings.wandSizePx) < 0.01,
        `${tag}: the wand's star is on the pointer, at #EDD431`,
        `hotspot ${Math.hypot(w0.hot.x - x, w0.hot.y - y).toFixed(2)}px off; ${w0.colour}; ${w0.height.toFixed(2)}px tall`,
      );
      check(
        // The bitmap-turned 0.62px outline this replaced had 1 px ≤ 64 at 1× and
        // 38 ≤ 32 at 2×; drawn turned, at ≥ 1 device px, ~85 and ~140.
        (dpr === 1 ? dark64 >= 60 : outline.length >= 100) && w0.outline * dpr >= 0.999,
        `${tag}: the outline is crisp: dark all round, at least a device pixel wide`,
        `${dark64} px at luma ≤ 64, ${outline.length} at ≤ 32; outline ${(w0.outline * dpr).toFixed(2)} device px`,
      );
      check(
        offBase.length >= 3 && worstLuma <= 48 && worstChroma <= 24 && fillMoved >= 0.9,
        `${tag}: mid-cycle only the fill changes colour; the outline stays black`,
        `${offBase.length} shots off base (${offBase.map((m) => m.colour).join(' ')}); outline worst luma ${worstLuma.toFixed(0)}, chroma ${worstChroma}; fill one colour off the base: ${(fillMoved * 100).toFixed(0)}%`,
      );
      check(w1.colour === BASE, `${tag}: after the morph the wand is #EDD431 again`, w1.colour);
      await page.context().close();
    }
  }
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
    await unscaled(page);
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

  // ── the breathing guide, before any tap ──
  const breath = (await scaleFrames(page, QUOTES.settings.breathePeriodMs + 200)).filter((v) => v !== null);
  const peak = Math.max(...breath);
  check(
    Math.abs(peak - QUOTES.settings.breatheScale) < 0.0008 && Math.min(...breath) === 1 && (await qstate(page)).breathing,
    'until the first tap the quote breathes: to ×1.012 and back to rest, once a loop',
    `peak ×${peak.toFixed(4)}; ${breath.filter((v) => v === 1).length} of ${breath.length} frames at rest`,
  );

  // ── the wand and the grow ──
  const c = await hitCentre(page);
  await page.mouse.move(c.x - 60, c.y - 20, { steps: 4 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(700);
  const on = await wandOf(page);
  const hov = await qstate(page);
  const native = await page.evaluate(() => getComputedStyle(document.querySelector('.book')).cursor);
  check(
    on.on &&
      on.opacity === 1 &&
      native === 'none' &&
      on.hot &&
      Math.hypot(on.hot.x - c.x, on.hot.y - c.y) <= 1 &&
      Math.abs(on.angle - QUOTES.settings.wandTiltDeg) < 1e-6 &&
      Math.abs(on.turn - QUOTES.settings.wandTiltDeg) < 0.01 &&
      Math.abs(on.height - QUOTES.settings.wandSizePx) < 0.01 &&
      on.colour === BASE,
    'over the quote the cursor is the wand: its star on the pointer, 52px tall, at −32°, #EDD431',
    `opacity ${on.opacity}, native cursor ${native}; hotspot ${on.hot ? Math.hypot(on.hot.x - c.x, on.hot.y - c.y).toFixed(2) : '?'}px from the pointer; ${on.height.toFixed(2)}px, ${on.turn.toFixed(2)}° on screen; colour ${on.colour}; outline ${on.outline.toFixed(2)}px`,
  );
  check(
    Math.abs(hov.scale - QUOTES.settings.hoverScale) < 1e-6 && hov.hovered && !hov.breathing,
    'hovered, the quote and attribution grow to ×1.03 (and do not breathe)',
    `×${hov.scale.toFixed(4)}`,
  );
  await page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  await page.waitForTimeout(700);
  const offW = await wandOf(page);
  const offS = await qstate(page);
  const nativeOff = await page.evaluate(() => getComputedStyle(document.querySelector('.book')).cursor);
  check(
    !offW.on && offW.opacity === 0 && nativeOff === 'grab' && offS.scale <= 1.012 && !offS.hovered,
    'off the quote the wand fades and the grow comes off',
    `opacity ${offW.opacity}, cursor ${nativeOff}; ×${offS.scale.toFixed(4)}${offS.breathing ? ' (breathing again)' : ''}`,
  );

  // ── a click translates and turns nothing ──
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(600);
  await recordFrames(page);
  await page.mouse.down();
  await page.mouse.up();
  const angles = [];
  const colours = [];
  for (let i = 0; i < 6; i++) {
    const w = await wandOf(page);
    angles.push(w.angle);
    colours.push(w.colour);
    await page.waitForTimeout(60);
  }
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
  for (let i = 0; i < 8; i++) {
    colours.push((await wandOf(page)).colour);
    await page.waitForTimeout(150);
  }
  await morphDone(page);
  const s2 = await qstate(page);
  check(sameLetters(s2.drawn, en), 'the morph ends with every English letter where quotes.json puts it', `${s2.drawn.length} letters, to 0.01px`);
  check(
    Math.min(...angles) < QUOTES.settings.wandTiltDeg - 5,
    'a tap flicks the wand',
    `deepest ${Math.min(...angles).toFixed(1)}° (rest ${QUOTES.settings.wandTiltDeg}°)`,
  );
  await page.waitForTimeout(1500);
  const settledColour = (await wandOf(page)).colour;
  const away = colours.filter((h) => h !== BASE);
  check(
    away.length >= 4 && new Set(away).size >= 4 && settledColour === BASE,
    'mid-morph the wand cycles the palette, and comes back to its first colour after',
    `${new Set(away).size} colours off ${BASE} (${[...new Set(away)].slice(0, 5).join(' ')}); after: ${settledColour}`,
  );
  await page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  await unscaled(page);
  const still = (await scaleFrames(page, QUOTES.settings.breathePeriodMs + 200)).filter((v) => v !== null);
  const tappedS = await qstate(page);
  check(
    still.every((v) => v === 1) && tappedS.tapped && !tappedS.breathing,
    'after the first tap the quote breathes no more',
    `${still.length} frames, max ×${Math.max(...still).toFixed(4)}`,
  );
  const bake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'en'), PAGE);
  const staticSrc = await page.evaluate(() => document.querySelector('.book > .book__page--left > img').getAttribute('src'));
  check(!!bake && staticSrc === bake, 'the static slot under the layer carries the English bake', staticSrc?.slice(0, 40));
  await page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  await unscaled(page);
  const agree = await onScreen(page, '');
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(600);
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
  const enEase = await page.evaluate((n) => window.__quote.easeUrls(n, 'en'), PAGE);
  const esEase = await page.evaluate((n) => window.__quote.easeUrls(n, 'es'), PAGE);
  /** A face shows page 05 in English: its bake, or (easing) its layers. */
  const isEn = (b) => b.includes(enBake) || (!!enEase && b.includes(enEase.letters) && b.includes(enEase.base));
  const is05 = (b) => isEn(b) || b.includes(esBake) || (!!esEase && b.includes(esEase.base)) || b.includes('/05.webp') || b.includes('plates/05');
  // Grown (hovered) now: the bake is still the page at rest, ×1, with no wand.
  const grown = (await qstate(page)).scale;
  const bakeVsRest = await page.evaluate(
    async ({ n, bake }) => {
      const ink = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 2000;
        c.height = 2600;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(600, 1050, 800, 500).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 96 || d[i + 1] > 96) continue; // dark ink (not paper, not the green hint)
          const p = i / 4, x = p % 800, y = Math.floor(p / 800);
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        return [x0, y0, x1, y1];
      };
      return { bake: await ink(bake), rest: await ink(await window.__quote.render(n, 'en', true)) };
    },
    { n: PAGE, bake: enBake },
  );
  const bakeOff = Math.max(...bakeVsRest.bake.map((v, i) => Math.abs(v - bakeVsRest.rest[i])));
  await recordFrames(page);
  await page.keyboard.press('ArrowLeft');
  await settledAt(page, SPREAD - 1);
  frames = await stopFrames(page);
  const turning = frames.filter((f) => f.turn);
  const firstTurn = turning[0];
  const facesWith05 = turning.flatMap((f) => f.faces).filter(is05);
  check(
    turning.length > 0 &&
      turning.every((f) => !f.layerShown || f.easing) &&
      firstTurn.staticSrc === enBake &&
      firstTurn.staticReady &&
      facesWith05.length > 0 &&
      facesWith05.every(isEn) &&
      turning.every((f) => !f.wandOn) &&
      !frames.some((f) => [...f.faces, ...f.plates].some((b) => b?.includes('/plates/'))),
    'a turn mid-morph shows page 05 in English, baked: the static slot and the curl, never the plate, no wand',
    `${turning.length} turning frames; static ${firstTurn?.staticSrc === enBake ? 'the English bake' : firstTurn?.staticSrc}, ${firstTurn?.staticReady ? 'decoded' : 'NOT decoded'}; curl ${[...new Set(facesWith05)].map((b) => (b.includes(enBake) ? 'en bake' : isEn(b) ? 'en, easing' : b.slice(0, 30))).join(', ')}`,
  );
  check(
    grown > 1.02 && bakeOff <= 1,
    'grown under the pointer, the page a turn shows is still at ×1 (the bake has no grow and no wand)',
    `letters ×${grown.toFixed(4)} on screen; the bake's ink box within ${bakeOff}px of the page at rest`,
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
    back.lang === 'es' && sameLetters(back.drawn, es) && backFaces.length > 0 && backFaces.every((b) => b.includes(esBake)) && !back.tapped,
    'flipping away and back, the quote is Spanish again (the arriving leaf too), and breathes again',
    `${back.lang}; arriving leaf ${backFaces.every((b) => b.includes(esBake)) ? 'the Spanish bake' : 'NOT the Spanish bake'}; tapped ${back.tapped}`,
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
  await page.locator('.quote-layer__hit').blur();
  await checkTurnEase(page, check);
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
  const twand = await wandOf(tp);
  const tbook = await tp.locator('.book').boundingBox();
  await tp.touchscreen.tap(tbook.x + tbook.width * 0.12, tbook.y + tbook.height * 0.15);
  await settledAt(tp, SPREAD - 1).catch(() => {});
  check(ts.lang === 'en' && tcur === null && !twand.on && twand.opacity === 0, 'a tap on the quote translates it, with no wand and no cursor', `${ts.lang}, wand ${twand.on ? 'on' : 'off'}, cursor ${tcur}`);
  check((await hash(tp)) === SPREAD - 1, 'a tap off the quote turns the page', `spread ${await hash(tp)}`);
  await touch.close();

  // ── reduced motion ──
  const rm = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const rp = await rm.newPage();
  await open(rp, SPREAD);
  await shown(rp);
  const r = await hitCentre(rp);
  const rmRest = (await scaleFrames(rp, 1200)).filter((v) => v !== null);
  await rp.mouse.move(r.x, r.y, { steps: 4 });
  await rp.waitForTimeout(700);
  const rmHover = await qstate(rp);
  const rmWand = await wandOf(rp);
  await recordFrames(rp);
  const t0 = Date.now();
  await rp.mouse.click(r.x, r.y);
  const rmAngles = [];
  const rmColours = [];
  for (let i = 0; i < 4; i++) {
    const w = await wandOf(rp);
    rmAngles.push(w.angle);
    rmColours.push(w.colour);
    await rp.waitForTimeout(40);
  }
  await morphDone(rp);
  const took = Date.now() - t0;
  frames = await stopFrames(rp);
  check(
    rmRest.every((v) => v === 1) && rmHover.scale === 1 && rmAngles.every((a) => a === QUOTES.settings.wandTiltDeg),
    'reduced motion: no breathing, no grow, no flick',
    `${rmRest.length} frames at rest all ×1; hovered ×${rmHover.scale}; wand ${Math.min(...rmAngles)}°`,
  );
  check(rmWand.on && rmWand.opacity === 1 && rmColours.some((h) => h !== BASE), 'reduced motion: the wand still shows, and its colour still changes', `opacity ${rmWand.opacity}; ${[...new Set(rmColours)].join(' ')}`);
  const rs = await qstate(rp);
  const places = new Set([...es, ...en].map((g) => `${g.ch}@${g.x.toFixed(2)},${g.y.toFixed(2)}`));
  const stray = frames.flatMap((f) => f.drawn ?? []).filter((d) => !places.has(d));
  check(
    stray.length === 0 && took < 700 && sameLetters(rs.drawn, en),
    'reduced motion: a crossfade — no letter moves or scrambles — done in about 300ms',
    `${frames.length} frames, ${stray.length} letters off both layouts${stray.length ? ` (${stray.slice(0, 3).join(' ')})` : ''}; ${took}ms to settle`,
  );
  await rm.close();

  await checkWandPixels(browser, { newPage, open, check });
}
