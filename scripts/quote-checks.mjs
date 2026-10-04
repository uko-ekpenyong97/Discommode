/**
 * The chapter-break quotes (src/reader/quotePlayer.ts) — every page
 * `quotes.json` carries (02, 05, 12, 21, 29, 39) — in Chrome: the `quote`
 * section of `npm run verify:reader` (`--quote-pages 2,39` for a subset).
 * Everything here is a question about what the browser draws, or which way a
 * press goes. Per page:
 *
 *   the print       the page at rest in Spanish, drawn by the layer's own code
 *                   at 2000×2600 over the plate, against the PRINTED page
 *                   (~/Discommode-pages/01/NN.png; the shipped NN.webp if the
 *                   sources are not here): each line registered to ≤ 0.5px, the
 *                   ink within 2%, and the differing pixels reported. "Ink" is
 *                   each pixel's distance from the plate, so cream letters on
 *                   green count as black ones on cream do. The letters and the
 *                   hint in the page's own colours (`ink`, `hintColor`). Writes
 *                   the difference to `.context/quote/`. And on screen at 1× and
 *                   2×: the live layer against the printed page in the same slot.
 *   a click         on the quote translates it and turns nothing (no turn layer
 *                   on any frame, the spread unchanged); the morph ends with
 *                   every English letter where the layout says, measured here
 *                   from quotes.json, not read back from the player; the static
 *                   slot carries the English bake, and the layer and the bake
 *                   agree on screen. A click mid-morph lands it and starts the
 *                   next.
 *   a turn          started mid-morph — the page lifting — shows the page in the
 *                   language it was going to, on the static slot and on the
 *                   curl, and never the bare plate; turning away and back, the
 *                   quote is Spanish and breathes again.
 *   elsewhere       a click off the quote turns the page; a drag that starts on
 *                   the quote turns it too.
 *   the wand        over the quote the native cursor goes and wand.svg follows
 *                   the pointer, its hotspot (the star's centre) on it, 52px
 *                   tall at −32°; it goes off the quote; a click at the hotspot
 *                   translates; mid-morph its colour leaves the palette's first
 *                   and comes back after; a tap flicks it. Never on touch.
 *   its pixels      at 1× and 2×, the wand alone on white: the star on the
 *                   pointer, #EDD431; the outline crisp (≥ 1 device px, dark all
 *                   round); mid-cycle the outline stays black while only the
 *                   fill changes; #EDD431 after.
 *   grow, breath    hovered, the letters go to ×1.03 and back on leave; until
 *                   the first tap they breathe to ×1.012 (not while hovered),
 *                   and after it never. A turn while grown shows the bake at ×1.
 *   the turn ease   a turn that starts with the letters grown or mid-breath
 *                   eases them to ×1 over ~180ms as the page lifts: on every
 *                   frame of the turn that lifts the page, the one that leaves
 *                   it lying, Home (a riffle, or for 02 the close), and from
 *                   mid-breath, what shows steps no more than a third of the way
 *                   in a frame; held, the leaf draws the letters at the layer's
 *                   size, and at the end at the bake's.
 *   keyboard        the button: Enter and Space toggle, its name and its
 *                   description's language follow, the live region speaks.
 *   touch           a tap on the quote translates, a tap elsewhere turns.
 *   reduced motion  a 300ms crossfade: no letter moves and none scrambles; no
 *                   breathing, grow or flick, but the wand and its colour.
 *
 * And page 02, the cover's neighbour: the doorway's first-visit open (the
 * cover turning to 01 | 02) and Prev back to the cover — the cover leaf over
 * 02's bake, never its plate; 02 Spanish and breathing on arrival; on the
 * cover no quote layer, no wand, the turn layer gone; the frames reported.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const QUOTES = JSON.parse(await readFile(new URL('../src/reader/quotes.json', import.meta.url), 'utf8'));
const W = 2000;
const H = 2600;
const OUT = '.context/quote';
const BASE = QUOTES.settings.wandPalette[0].toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const argv = process.argv.slice(2);
const ONLY_PAGES = argv.includes('--quote-pages') ? argv[argv.indexOf('--quote-pages') + 1].split(',').map(Number) : null;

/** The spread a printed inside page opens on (Issue 01 has a cover): odd pages
 *  on the left. */
const spreadOfPage = (n) => Math.floor((n + 1) / 2);

/**
 * One quote page, as the checks need it: where it sits, the turn that LIFTS it
 * (it is the leaf: Prev for a left page, Next for a right one) and the one that
 * leaves it LYING under the leaf.
 */
function pageOf(entry) {
  const n = entry.page;
  const spread = spreadOfPage(n);
  const side = n % 2 ? 'left' : 'right';
  const prev = { key: 'ArrowLeft', back: 'ArrowRight', lands: spread - 1, dir: 'prev' };
  const next = { key: 'ArrowRight', back: 'ArrowLeft', lands: spread + 1, dir: 'next' };
  return {
    n,
    nn: pad(n),
    spread,
    side,
    entry,
    lift: side === 'left' ? prev : next,
    lie: side === 'left' ? next : prev,
    slot: `.book > .book__page--${side}`,
    img: `.book > .book__page--${side} > img`,
    /** The quote's align and the attribution's last line's bottom, page px. */
    align: entry.quote.align ?? QUOTES.styles.quote.align,
    bottom: entry.attribution.top + entry.attribution.es.length * QUOTES.styles.attribution.lineHeightPx,
  };
}

const PAGES = QUOTES.pages.map(pageOf).filter((p) => !ONLY_PAGES || ONLY_PAGES.includes(p.n));

const shown = (page, P) => page.waitForFunction((n) => window.__quote?.state().some((s) => s.page === n && s.shown), P.n, { timeout: 15000 });
const qstate = (page, P) => page.evaluate((n) => window.__quote.state().find((s) => s.page === n), P.n);
const hash = (page) => page.evaluate(() => +location.hash.split('/')[1]);
const settledAt = (page, t) =>
  page.waitForFunction(
    (t) => +location.hash.split('/')[1] === t && document.querySelector('.book__turn-host').childElementCount === 0,
    t,
    { timeout: 6000 },
  );
/** The letters at ×1: off the quote, the grow undone, the breath at rest. */
const unscaled = (page, P) => page.waitForFunction((n) => window.__quote.state().find((s) => s.page === n)?.scale === 1, P.n, { timeout: 8000 });
const wandOf = (page) => page.evaluate(() => window.__quote.wand());
/** `ms` of the letters' scale, every frame. */
const scaleFrames = (page, P, ms) =>
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
    { n: P.n, ms },
  );
const morphDone = (page, P) => page.waitForFunction((n) => !window.__quote.state().find((s) => s.page === n)?.morphing, P.n, { timeout: 8000 });

/** Where every letter should sit at rest in `lang`, from quotes.json alone:
 *  each letter at the width of its line up to and including it, less its own
 *  advance (the kern before it kept), the line centred, left- or right-aligned;
 *  the baseline at CSS's half-leading. */
const expected = (page, P, lang) =>
  page.evaluate(
    ({ q, lang, n, align }) => {
      const ctx = document.createElement('canvas').getContext('2d');
      const entry = q.pages.find((p) => p.page === n);
      const out = [];
      for (const [key, style, box, al] of [
        ['quote', q.styles.quote, entry.quote, align],
        ['attribution', q.styles.attribution, entry.attribution, 'right'],
      ]) {
        ctx.font = `${style.weight} ${style.sizePx}px "${style.family}"`;
        box[lang].forEach((line, li) => {
          const m = ctx.measureText(line);
          const x0 = al === 'center' ? box.centerX - m.width / 2 : al === 'left' ? box.left : box.right - m.width;
          const y = box.top + li * style.lineHeightPx + (style.lineHeightPx - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
          for (let i = 0; i < line.length; i++) {
            if (line[i] !== ' ') out.push({ ch: line[i], x: x0 + ctx.measureText(line.slice(0, i + 1)).width - ctx.measureText(line[i]).width, y, block: key });
          }
        });
      }
      return out;
    },
    { q: QUOTES, lang, n: P.n, align: P.align },
  );

const sameLetters = (a, b, tol = 0.01) =>
  a.length === b.length && a.every((g, i) => g.ch === b[i].ch && g.block === b[i].block && Math.abs(g.x - b[i].x) <= tol && Math.abs(g.y - b[i].y) <= tol && (g.alpha ?? 1) === 1);

// ── pixels ───────────────────────────────────────────────────────────────

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbOf = async (input, region) => {
  let img = sharp(input).removeAlpha();
  if (region) img = img.extract(region);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
/** Ink: each pixel's RGB distance from the ground under it — the plate, or one
 *  colour. Linear in a letter's coverage whatever its colour and the ground's. */
const inkFrom = ({ data, w, h }, ground) => {
  const L = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) {
    const g = ground.length === 3 ? ground : [ground[i * 3], ground[i * 3 + 1], ground[i * 3 + 2]];
    L[i] = Math.hypot(data[i * 3] - g[0], data[i * 3 + 1] - g[1], data[i * 3 + 2] - g[2]);
  }
  return { L, w, h };
};

/** On screen, ink: how far each pixel has gone from the ground TOWARD the
 *  page's ink colour (its projection on that axis). The page's crease shading
 *  darkens the ground, which on green or pink is not toward cream — plain
 *  distance would count it as ink. */
const inkToward = ({ data, w, h }, ground, ink) => {
  const d = ink.map((v, c) => v - ground[c]);
  const n = Math.hypot(...d);
  const u = d.map((v) => v / n);
  const L = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = Math.max(0, (data[i * 3] - ground[0]) * u[0] + (data[i * 3 + 1] - ground[1]) * u[1] + (data[i * 3 + 2] - ground[2]) * u[2]);
  return { L, w, h };
};
const inkRgb = (P) => hexRgb(P.entry.ink ?? QUOTES.styles.quote.color);

/** The printed page and its plate: the sources if they are here, else what
 *  ships (the printed page's WebP, the plate's). */
function sourcesOf(P) {
  const src = (f) => join(homedir(), 'Discommode-pages/01', f);
  const pub = (f) => new URL(`../public/issues/01/${f}`, import.meta.url).pathname;
  const print = existsSync(src(`${P.nn}.png`)) ? src(`${P.nn}.png`) : pub(`${P.nn}.webp`);
  const plate = existsSync(src(`plates/${P.nn}.png`)) ? src(`plates/${P.nn}.png`) : pub(`plates/${P.nn}.webp`);
  return { print, plate, shippedPlate: pub(`plates/${P.nn}.webp`) };
}

/** The page's ground: its plate's colour inside the hit area's corner. */
async function groundOf(P) {
  const { data } = await rgbOf(sourcesOf(P).shippedPlate, { left: P.entry.hitArea.x + 4, top: P.entry.hitArea.y + 4, width: 1, height: 1 });
  return [data[0], data[1], data[2]];
}

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

/** Pixels over `levels` apart. */
function differ(ref, got, levels) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) if (Math.abs(ref[i] - got[i]) > levels) n++;
  return n;
}

/** The median colour of a picture's strongest ink inside a box (page px). */
function inkColour(img, L, [x0, y0, x1, y1]) {
  let max = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) max = Math.max(max, L[y * W + x]);
  const px = [[], [], []];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * W + x;
    if (L[i] < max * 0.9) continue;
    for (let c = 0; c < 3; c++) px[c].push(img.data[i * 3 + c]);
  }
  return px.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

async function checkPrint(page, P, check) {
  const { print, plate, shippedPlate } = sourcesOf(P);
  console.log(`  the print: ${print.replace(homedir(), '~')}`);
  const url = await page.evaluate((n) => window.__quote.render(n, 'es', false), P.n);
  const png = Buffer.from(url.split(',')[1], 'base64');
  const printImg = await rgbOf(print);
  const gotImg = await rgbOf(png);
  const ref = inkFrom(printImg, (await rgbOf(plate)).data);
  const got = inkFrom(gotImg, (await rgbOf(shippedPlate)).data);
  // Each printed line, by its band (the layer's own line boxes), across its
  // letters ± a letter.
  const glyphs = await page.evaluate((n) => window.__quote.layout(n, 'es'), P.n);
  const lines = [];
  for (const [key, style] of [['quote', QUOTES.styles.quote], ['attribution', QUOTES.styles.attribution]]) {
    const b = P.entry[key];
    b.es.forEach((_, i) => {
      const y0 = Math.floor(b.top + i * style.lineHeightPx);
      const y1 = Math.ceil(b.top + (i + 1) * style.lineHeightPx);
      const xs = glyphs.filter((g) => g.block === key && g.y > y0 && g.y < y1).map((g) => g.x);
      lines.push([`${key} line ${i + 1}`, [Math.floor(Math.min(...xs)) - 20, y0, Math.ceil(Math.max(...xs) + style.sizePx) + 20, y1]]);
    });
  }
  const regs = lines.map(([name, box]) => ({ name, ...register(ref.L, got.L, W, box) }));
  for (const r of regs) {
    check(
      Math.hypot(r.dx, r.dy) <= 0.5 && Math.abs(r.ink - 1) <= 0.02,
      `${r.name} sits on the print`,
      `off by ${r.dx.toFixed(2)}, ${r.dy.toFixed(2)} px; ink ${(r.ink * 100).toFixed(1)}% of the print's`,
    );
  }
  // The colours: the letters' strongest ink against the print's and the
  // page's `ink`; the hint's (drawn with it) against `hintColor`.
  const box = [P.entry.hitArea.x, Math.floor(P.entry.quote.top), P.entry.hitArea.x + P.entry.hitArea.w, Math.ceil(P.bottom)];
  const inkGot = inkColour(gotImg, got.L, box);
  const inkRef = inkColour(printImg, ref.L, box);
  const want = hexRgb(P.entry.ink ?? QUOTES.styles.quote.color);
  const hintUrl = await page.evaluate((n) => window.__quote.render(n, 'es', true), P.n);
  const hintImg = await rgbOf(Buffer.from(hintUrl.split(',')[1], 'base64'));
  const hintL = inkFrom(hintImg, (await rgbOf(shippedPlate)).data);
  const hintGot = inkColour(hintImg, hintL.L, [box[0], Math.floor(P.entry.hint.top), box[2], Math.ceil(P.entry.hint.top + QUOTES.styles.hint.sizePx)]);
  const hintWant = hexRgb(P.entry.hintColor ?? QUOTES.styles.hint.color);
  check(
    far(inkGot, want) <= 6 && far(inkRef, want) <= 12 && far(hintGot, hintWant) <= 6,
    `the letters are the page's ink (${hex(want)}, as printed) and the hint its hint colour (${hex(hintWant)})`,
    `letters ${hex(inkGot)}, the print's ${hex(inkRef)}; hint ${hex(hintGot)}`,
  );
  const inkPx = ref.L.reduce((n, v) => n + (v > 32 ? 1 : 0), 0);
  const d = [8, 32, 64, 128].map((l) => differ(ref.L, got.L, l));
  console.log(
    `    2000×2600, ${W * H} px: ${d[0]} differ by more than 8 levels, ${d[1]} by 32, ${d[2]} by 64, ${d[3]} by 128 (the print has ${inkPx} ink px); max ${Math.round(ref.L.reduce((m, v, i) => Math.max(m, Math.abs(v - got.L[i])), 0))} levels`,
  );
  await mkdir(OUT, { recursive: true });
  const crop = { left: P.entry.hitArea.x - 10, top: P.entry.hitArea.y - 20, width: P.entry.hitArea.w + 20, height: P.entry.hitArea.h + 40 };
  const diff = Buffer.alloc(crop.width * crop.height * 3);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const i = (y + crop.top) * W + x + crop.left;
      const v = 255 - Math.min(255, Math.abs(ref.L[i] - got.L[i]) * 2);
      diff.set([255, v, v], (y * crop.width + x) * 3);
    }
  }
  await sharp(diff, { raw: { width: crop.width, height: crop.height, channels: 3 } }).png().toFile(join(OUT, `print-diff-${P.nn}.png`));
  await sharp(png).extract(crop).toFile(join(OUT, `render-es-${P.nn}.png`));
  await sharp(print).extract(crop).toFile(join(OUT, `print-${P.nn}.png`));
  return { regs, d, inkPx };
}

/** The quote's slot, screenshotted: with the layer, or with only the static
 *  image (`src`, if given) under it. */
async function slotShot(page, P, src) {
  const slot = page.locator(P.slot);
  if (src !== undefined) {
    await page.evaluate(
      ({ src, sel }) => {
        const layer = document.querySelector('.quote-layer');
        layer.style.visibility = 'hidden';
        const img = document.querySelector(sel);
        window.__keptSrc = img.getAttribute('src');
        if (src) img.src = src;
        return img.decode();
      },
      { src, sel: P.img },
    );
  }
  const box = await slot.boundingBox();
  const png = await page.screenshot({ clip: box });
  if (src !== undefined) {
    await page.evaluate((sel) => {
      document.querySelector('.quote-layer').style.visibility = '';
      const img = document.querySelector(sel);
      img.src = window.__keptSrc;
    }, P.img);
  }
  return png;
}

/** The live layer against `src` in the same slot, inside the quote's box (the
 *  hint, which the print has not, left out). */
async function onScreen(page, P, src) {
  const a = await slotShot(page, P);
  const b = await slotShot(page, P, src);
  const { width, height } = await sharp(a).metadata();
  const h = P.entry.hitArea;
  const region = {
    left: Math.floor((h.x / W) * width),
    top: Math.floor(((P.entry.quote.top - 20) / H) * height),
    width: Math.ceil((h.w / W) * width),
    height: Math.ceil(((P.bottom + 10 - (P.entry.quote.top - 20)) / H) * height),
  };
  const ground = await groundOf(P);
  const A = inkToward(await rgbOf(a, region), ground, inkRgb(P));
  const B = inkToward(await rgbOf(b, region), ground, inkRgb(P));
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < A.L.length; i++) (ia += A.L[i]), (ib += B.L[i]);
  return { px: A.L.length, d32: differ(B.L, A.L, 32), d64: differ(B.L, A.L, 64), ink: ia / ib };
}

// ── frames ───────────────────────────────────────────────────────────────

/** Record, every frame until stopped: the turn layer, the quote's static
 *  slot, the curl's faces, the quote layer, the letters drawn. */
const recordFrames = (page, P) =>
  page.evaluate(
    ({ n, sel }) => {
      window.__qFrames = [];
      window.__qOn = true;
      const f = () => {
        const img = document.querySelector(sel);
        const faces = [...document.querySelectorAll('.flip-strip > *')].map((x) => x.style.backgroundImage).filter((b) => b && b !== 'none');
        const layer = document.querySelector('.quote-layer');
        const s = window.__quote?.state().find((x) => x.page === n);
        window.__qFrames.push({
          t: performance.now(),
          turn: (document.querySelector('.book__turn-host')?.childElementCount ?? 0) > 0,
          staticSrc: img?.getAttribute('src') ?? null,
          staticReady: !!img && img.complete && img.naturalWidth > 0,
          faces: [...new Set(faces)],
          plates: [...document.querySelectorAll('.book__turn img')].map((i) => i.getAttribute('src')),
          layerShown: !!layer && getComputedStyle(layer).visibility !== 'hidden',
          drawn: s ? s.drawn.map((g) => `${g.ch}@${g.x.toFixed(2)},${g.y.toFixed(2)}`) : null,
          wandOn: window.__quote?.wand()?.on ?? false,
          scale: s?.scale ?? null,
          easing: !!s?.turnEase,
          lang: s?.lang ?? null,
        });
        if (window.__qOn) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    },
    { n: P.n, sel: P.img },
  );
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
async function easeFrames(page, P, act, ms = 700) {
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
  }, P.n);
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

/** How wide the quote's letters are on screen, in a screenshot of the quote's
 *  page: from the first column to the last where the ink reaches half its
 *  strongest. (Not the ink-weighted spread of x: the curl lights a leaf
 *  unevenly, which weights cream letters on green unevenly too — that read
 *  ×1.046 for a ×1.03 leaf on page 12.) Returned as `w`. */
async function inkBox(page, P, ground) {
  const slot = await page.locator(P.slot).boundingBox();
  const png = await page.screenshot({ clip: slot });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = inkToward({ data, w: info.width, h: info.height }, ground, inkRgb(P)).L;
  const q = P.entry.quote;
  // The quote's lines only: not the attribution, not the hint.
  const y0 = Math.floor(((q.top - 30) / H) * info.height);
  const y1 = Math.ceil((Math.min(q.top + q.es.length * QUOTES.styles.quote.lineHeightPx + 30, P.entry.attribution.top - 4) / H) * info.height);
  // Each column's strongest ink; the letters' left and right edges where it
  // crosses half the strongest anywhere, to a subpixel.
  const col = new Float32Array(info.width);
  let max = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < info.width; x++) {
      const v = L[y * info.width + x];
      if (v > col[x]) col[x] = v;
      if (v > max) max = v;
    }
  }
  const t = max / 2;
  let l = -1;
  let r = -1;
  for (let x = 0; x < info.width; x++) if (col[x] >= t) (l < 0 && (l = x), (r = x));
  const left = l - (col[l] - t) / (col[l] - col[l - 1]);
  const right = r + (col[r] - t) / (col[r] - col[r + 1]);
  return { w: right - left };
}

async function checkTurnEase(page, P, check) {
  const ground = await groundOf(P);
  const c = await hitCentre(page);
  const over = async () => {
    await page.mouse.move(c.x - 30, c.y - 10, { steps: 2 });
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.waitForFunction((n) => Math.abs(window.__quote.state().find((s) => s.page === n).scale - 1.03) < 1e-6, P.n, { timeout: 4000 });
  };
  const away = () => page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  // The keyboard checks' last toggle may still be morphing: land it first.
  await morphDone(page, P);
  // The ease layers are baked after the reveal.
  await page.waitForFunction((sel) => {
    const img = document.querySelector(sel);
    return !!img && img.getAttribute('src').startsWith('blob:');
  }, P.img);
  await page.waitForTimeout(800);

  // Held: the leaf at the ease's start draws the letters as much bigger than
  // at its end as the grown layer is than the page at rest. (Leaf against
  // leaf: a curl at t 0 is not in pixel register with the flat page — up to
  // 13px across the spread, flipbook.css — so it is measured against itself.)
  // The wand is hidden while measuring: it lies over the letters.
  const wandVis = (v) => page.evaluate((v) => (document.querySelector('.quote-wand').style.visibility = v), v);
  await away();
  await unscaled(page, P);
  const rest = await inkBox(page, P, ground);
  await over();
  await wandVis('hidden');
  const grown = await inkBox(page, P, ground);
  await page.evaluate((dir) => {
    window.__quote.holdEase(0);
    window.__flip.startTurn(dir);
  }, P.lift.dir);
  await page.waitForTimeout(200);
  const leaf0 = await inkBox(page, P, ground);
  await page.evaluate(() => window.__quote.holdEase(1));
  await page.waitForTimeout(100);
  const leaf1 = await inkBox(page, P, ground);
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

  // Every frame: the page lifting, the page lying, Home (a riffle, but from
  // 01 | 02 a single turn: the close).
  const runs = [];
  for (const [label, key, back, lands] of [
    [`${P.lift.dir === 'prev' ? 'Prev' : 'Next'} (${P.nn} lifting)`, P.lift.key, P.lift.back, P.lift.lands],
    [`${P.lie.dir === 'prev' ? 'Prev' : 'Next'} (${P.nn} lying)`, P.lie.key, P.lie.back, P.lie.lands],
    [P.spread > 1 ? 'Home (a riffle)' : 'Home (the close)', 'Home', null, 0],
  ]) {
    await over();
    const fr = await easeFrames(page, P, () => page.keyboard.press(key));
    runs.push([label, steps(fr)]);
    await away();
    await settledAt(page, lands);
    if (back) await page.keyboard.press(back);
    else await page.evaluate((s) => (location.hash = `#read-01/${s}`), P.spread);
    await settledAt(page, P.spread);
    await shown(page, P);
    await page.waitForTimeout(300);
  }
  // From mid-breath (untapped again: away and back reset it).
  await unscaled(page, P);
  await page.waitForFunction((n) => window.__quote.state().find((s) => s.page === n).scale > 1.006, P.n, { timeout: 8000 });
  runs.push([`${P.lie.dir === 'prev' ? 'Prev' : 'Next'} from mid-breath`, steps(await easeFrames(page, P, () => page.keyboard.press(P.lie.key)))]);
  await settledAt(page, P.lie.lands);
  await page.keyboard.press(P.lie.back);
  await settledAt(page, P.spread);
  for (const [label, r] of runs) {
    check(
      r.from > 1.004 && r.end === 1 && r.share <= 0.34 && r.eased + r.layer > 0,
      `a turn from a grown quote eases it to ×1, no frame a jump: ${label}`,
      `×${r.from.toFixed(4)} → ×${r.end}; biggest step ${r.worst.toFixed(4)} (${(r.share * 100).toFixed(0)}% of the way); ${r.layer} frames on the layer, ${r.eased} on the leaf or slot`,
    );
  }
}

// ── the wand's pixels ────────────────────────────────────────────────────

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

/**
 * On one quote page, at 1× and 2×: the wand's star on the pointer (≤ 1px),
 * #EDD431 at rest; its outline crisp (at least one device pixel of black) and
 * black mid-cycle while the fill takes the palette; back to #EDD431 after.
 * The wand is shot alone on white (the page hidden for the shot), the pointer
 * still, after the flick.
 */
async function checkWandPixels(browser, P, { newPage, open, check }) {
  const n = P.n;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    await open(page, P.spread);
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
    const tag = `@${dpr}×`;
    if (dpr === 2 && n === 5) {
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

// ── page 02, the cover's neighbour ───────────────────────────────────────

/** rAF intervals over 20ms in a run of recorded frames. */
const longFrames = (frames) => {
  const out = [];
  for (let i = 1; i < frames.length; i++) if (frames[i].t - frames[i - 1].t > 20) out.push(Math.round(frames[i].t - frames[i - 1].t));
  return out;
};

async function checkCoverNeighbour(browser, P, { newPage, check, origin }) {
  console.log(`\n  page ${P.nn} beside the cover`);
  const page = await newPage(browser, 2);
  // The doorway's first-visit open: the cover turns to 01 | 02 by itself.
  await page.goto(`${origin}#item-01`);
  await page.waitForTimeout(2500);
  await page.mouse.move(40, 500, { steps: 3 });
  await page.evaluate(() => {
    window.__loaf = [];
    new PerformanceObserver((l) => window.__loaf.push(...l.getEntries().map((e) => Math.round(e.duration)))).observe({ type: 'long-animation-frame' });
  });
  await page.getByRole('button', { name: 'Read issue', exact: true }).click();
  await page.waitForSelector('.book__turn-host', { state: 'attached', timeout: 15000 });
  await recordFrames(page, P);
  await page.waitForFunction(() => +location.hash.split('/')[1] === 1, null, { timeout: 15000 });
  await shown(page, P);
  // Past the reveal and the bakes (two pages and four ease layers).
  await page.waitForTimeout(2500);
  let frames = await stopFrames(page);
  const loafOpen = await page.evaluate(() => window.__loaf.splice(0));
  const opened = await qstate(page, P);
  const turning = frames.filter((f) => f.turn);
  check(
    turning.length > 0 &&
      turning.every((f) => !f.layerShown) &&
      !frames.some((f) => f.plates.some((b) => b?.includes('/plates/')) || f.faces.some((b) => b.includes('/plates/'))) &&
      opened.shown &&
      opened.lang === 'es' &&
      opened.breathing &&
      (await hash(page)) === 1,
    `the doorway's first open turns the cover onto 01 | ${P.nn}: no quote layer while it turns, never the plate; then ${P.nn} in Spanish, breathing`,
    `${turning.length} turning frames; ${P.nn} ${opened.lang}, ${opened.shown ? 'shown' : 'NOT shown'}, ${opened.breathing ? 'breathing' : 'NOT breathing'}`,
  );
  console.log(
    `    opening: ${frames.length} frames, ${longFrames(frames).length} over 20ms (${longFrames(frames).slice(0, 8).join(', ') || '—'}); long animation frames over 50ms: ${loafOpen.filter((d) => d > 50).join(', ') || 'none'}`,
  );
  // Back to the cover: grown under the pointer, then Prev — the cover leaf
  // lands over 02 easing to ×1, 02's bake on the static slot, never its plate.
  const c = await hitCentre(page);
  await page.mouse.move(c.x - 30, c.y, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForFunction((n) => Math.abs(window.__quote.state().find((s) => s.page === n).scale - 1.03) < 1e-6, P.n, { timeout: 4000 });
  const esBake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'es'), P.n);
  await page.evaluate(() => (window.__loaf = []));
  await recordFrames(page, P);
  await page.keyboard.press('ArrowLeft');
  await settledAt(page, 0);
  await page.waitForTimeout(400);
  frames = await stopFrames(page);
  const loafClose = await page.evaluate(() => window.__loaf.splice(0));
  const closing = frames.filter((f) => f.turn);
  const atCover = await page.evaluate(() => ({
    layers: document.querySelectorAll('.quote-layer').length,
    wand: window.__quote.wand(),
    turnHost: document.querySelector('.book__turn-host').childElementCount,
    imgs: [...document.querySelectorAll('.book > .book__page > img')].map((i) => i.getAttribute('src').split('/').pop()),
    quotes: window.__quote.state().length,
    cursor: document.querySelector('.book').dataset.cursor ?? null,
  }));
  check(
    closing.length > 0 &&
      closing[0].staticSrc === esBake &&
      closing.every((f) => !f.wandOn) &&
      !frames.some((f) => [...f.faces, ...f.plates].some((b) => b?.includes('/plates/'))) &&
      closing.some((f) => f.easing) &&
      atCover.layers === 0 &&
      atCover.quotes === 0 &&
      atCover.turnHost === 0 &&
      !atCover.wand?.on &&
      atCover.cursor === null,
    `Prev from 01 | ${P.nn} closes onto the cover: ${P.nn}'s Spanish bake under the leaf, eased to ×1, never the plate; on the cover no quote layer, no wand`,
    `${closing.length} turning frames; static ${closing[0]?.staticSrc === esBake ? 'the Spanish bake' : closing[0]?.staticSrc?.slice(0, 30)}; ${closing.filter((f) => f.easing).length} easing; cover shows ${atCover.imgs.join(' | ')}`,
  );
  console.log(`    closing: ${frames.length} frames, ${longFrames(frames).length} over 20ms (${longFrames(frames).slice(0, 8).join(', ') || '—'}); long animation frames over 50ms: ${loafClose.filter((d) => d > 50).join(', ') || 'none'}`);
  // And open again by hand (Next from the cover), the pointer off the page:
  // 02 Spanish, breathing.
  await page.mouse.move(40, 500, { steps: 3 });
  await page.keyboard.press('ArrowRight');
  await settledAt(page, 1);
  await shown(page, P);
  const again = await qstate(page, P);
  check(again.lang === 'es' && again.breathing && !again.tapped, `Next from the cover opens onto 01 | ${P.nn} again, ${P.nn} in Spanish and breathing`, `${again.lang}`);
  await page.context().close();
}

// ── one page ─────────────────────────────────────────────────────────────

async function checkPage(browser, P, { newPage, open, check, viewport }) {
  console.log(`\nchapter-break quote (page ${P.nn}, spread ${P.spread}, ${P.side})`);
  const enText = P.entry.quote.en.join(' ');

  // ── the print, and on screen ──
  /** At 1×, how far the Spanish layer is from the printed page in its slot:
   *  the floor any 2000px page drawn into the slot is held to (it is all edge
   *  resampling, the slot drawn at its size against a page scaled down to it). */
  let floor = null;
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, dpr);
    await open(page, P.spread);
    await shown(page, P);
    await page.waitForTimeout(300);
    if (dpr === 1) await checkPrint(page, P, check);
    await unscaled(page, P);
    const s = await onScreen(page, P, `/issues/01/${P.nn}.webp`);
    check(
      Math.abs(s.ink - 1) <= 0.04,
      `@${dpr}× on screen, the Spanish layer reads as the printed page`,
      `ink ${(s.ink * 100).toFixed(1)}% of the printed page's in the same slot; ${s.d32} of ${s.px} px differ by more than 32 levels, ${s.d64} by 64`,
    );
    if (dpr === 1) floor = s;
    await page.context().close();
  }

  const page = await newPage(browser, 1);
  await open(page, P.spread);
  await shown(page, P);
  const es = await expected(page, P, 'es');
  const en = await expected(page, P, 'en');
  const s0 = await qstate(page, P);
  check(sameLetters(s0.drawn, es), 'at rest the layer draws every Spanish letter where quotes.json puts it', `${s0.drawn.length} letters`);

  // ── the breathing guide, before any tap ──
  const breath = (await scaleFrames(page, P, QUOTES.settings.breathePeriodMs + 200)).filter((v) => v !== null);
  const peak = Math.max(...breath);
  check(
    Math.abs(peak - QUOTES.settings.breatheScale) < 0.0008 && Math.min(...breath) === 1 && (await qstate(page, P)).breathing,
    'until the first tap the quote breathes: to ×1.012 and back to rest, once a loop',
    `peak ×${peak.toFixed(4)}; ${breath.filter((v) => v === 1).length} of ${breath.length} frames at rest`,
  );

  // ── the wand and the grow ──
  const c = await hitCentre(page);
  await page.mouse.move(c.x - 60, c.y - 20, { steps: 4 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(700);
  const on = await wandOf(page);
  const hov = await qstate(page, P);
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
  const offS = await qstate(page, P);
  const nativeOff = await page.evaluate(() => getComputedStyle(document.querySelector('.book')).cursor);
  check(
    !offW.on && offW.opacity === 0 && nativeOff === 'grab' && offS.scale <= 1.012 && !offS.hovered,
    'off the quote the wand fades and the grow comes off',
    `opacity ${offW.opacity}, cursor ${nativeOff}; ×${offS.scale.toFixed(4)}${offS.breathing ? ' (breathing again)' : ''}`,
  );

  // ── a click translates and turns nothing ──
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(600);
  await recordFrames(page, P);
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
  const s1 = await qstate(page, P);
  check(
    !frames.some((f) => f.turn) && (await hash(page)) === P.spread && s1.lang === 'en' && s1.morphing,
    'a click on the quote translates it and turns nothing',
    `turn layer on ${frames.filter((f) => f.turn).length} of ${frames.length} frames; spread ${await hash(page)}; ${s1.lang}, morphing ${s1.morphing} (${s1.morph?.moved} of ${s1.morph?.total} letters travel)`,
  );
  check(
    s1.label === 'Show the quote in Spanish' && s1.live.lang === 'en' && s1.live.text.startsWith(enText) && s1.desc.lang === 'en',
    'the button’s name, its description’s language and the live region follow',
    `"${s1.label}"; live [${s1.live.lang}] "${s1.live.text.slice(0, 26)}…"`,
  );
  for (let i = 0; i < 8; i++) {
    colours.push((await wandOf(page)).colour);
    await page.waitForTimeout(150);
  }
  await morphDone(page, P);
  const s2 = await qstate(page, P);
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
  await unscaled(page, P);
  const still = (await scaleFrames(page, P, QUOTES.settings.breathePeriodMs + 200)).filter((v) => v !== null);
  const tappedS = await qstate(page, P);
  check(
    still.every((v) => v === 1) && tappedS.tapped && !tappedS.breathing,
    'after the first tap the quote breathes no more',
    `${still.length} frames, max ×${Math.max(...still).toFixed(4)}`,
  );
  const bake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'en'), P.n);
  const staticSrc = await page.evaluate((sel) => document.querySelector(sel).getAttribute('src'), P.img);
  check(!!bake && staticSrc === bake, 'the static slot under the layer carries the English bake', staticSrc?.slice(0, 40));
  await page.mouse.move(c.box.x + 4, c.box.y - 60, { steps: 4 });
  await unscaled(page, P);
  const agree = await onScreen(page, P, '');
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
  const s3 = await qstate(page, P);
  await page.waitForTimeout(500);
  const mid = await qstate(page, P);
  await morphDone(page, P);
  const s4 = await qstate(page, P);
  check(
    s3.lang === 'en' && s3.morphing && mid.morphing && sameLetters(s4.drawn, en) && (await hash(page)) === P.spread,
    'a click mid-morph lands it and starts the next (ES→EN→ES→EN: English)',
    `${s3.lang}, morphing; then ${s4.lang}`,
  );

  // ── a turn mid-morph: the language it was going to, baked, never the plate ──
  await page.mouse.click(c.x, c.y); // → es
  await page.waitForTimeout(400);
  await morphDone(page, P);
  await page.mouse.click(c.x, c.y); // → en
  await page.waitForTimeout(300);
  const enBake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'en'), P.n);
  const esBake = await page.evaluate((n) => window.__quote.bakeUrl(n, 'es'), P.n);
  const enEase = await page.evaluate((n) => window.__quote.easeUrls(n, 'en'), P.n);
  const esEase = await page.evaluate((n) => window.__quote.easeUrls(n, 'es'), P.n);
  /** A face shows the page in English: its bake, or (easing) its layers. */
  const isEn = (b) => b.includes(enBake) || (!!enEase && b.includes(enEase.letters) && b.includes(enEase.base));
  const isPage = (b) => isEn(b) || b.includes(esBake) || (!!esEase && b.includes(esEase.base)) || b.includes(`/${P.nn}.webp`) || b.includes(`plates/${P.nn}`);
  // Grown (hovered) now: the bake is still the page at rest, ×1, with no wand.
  const grown = (await qstate(page, P)).scale;
  const ground = await groundOf(P);
  const bakeVsRest = await page.evaluate(
    async ({ n, bake, ground, inkC, box }) => {
      const d = inkC.map((v, c) => v - ground[c]);
      const nn = d.reduce((a, v) => a + v * v, 0);
      const ink = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 2000;
        c.height = 2600;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const [bx, by, bw, bh] = box;
        const px = ctx.getImageData(bx, by, bw, bh).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let i = 0; i < px.length; i += 4) {
          // The letters' ink (the box stops above the hint).
          if (((px[i] - ground[0]) * d[0] + (px[i + 1] - ground[1]) * d[1] + (px[i + 2] - ground[2]) * d[2]) / nn < 0.4) continue;
          const p = i / 4, x = p % bw, y = Math.floor(p / bw);
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        return [x0, y0, x1, y1];
      };
      return { bake: await ink(bake), rest: await ink(await window.__quote.render(n, 'en', true)) };
    },
    { n: P.n, bake: enBake, ground, inkC: inkRgb(P), box: [P.entry.hitArea.x - 40, Math.floor(P.entry.quote.top) - 40, P.entry.hitArea.w + 80, Math.ceil(P.bottom + 30 - P.entry.quote.top + 40)] },
  );
  const bakeOff = Math.max(...bakeVsRest.bake.map((v, i) => Math.abs(v - bakeVsRest.rest[i])));
  await recordFrames(page, P);
  await page.keyboard.press(P.lift.key);
  await settledAt(page, P.lift.lands);
  frames = await stopFrames(page);
  const turning = frames.filter((f) => f.turn);
  const firstTurn = turning[0];
  const facesWithPage = turning.flatMap((f) => f.faces).filter(isPage);
  check(
    turning.length > 0 &&
      turning.every((f) => !f.layerShown || f.easing) &&
      firstTurn.staticSrc === enBake &&
      firstTurn.staticReady &&
      facesWithPage.length > 0 &&
      facesWithPage.every(isEn) &&
      turning.every((f) => !f.wandOn) &&
      !frames.some((f) => [...f.faces, ...f.plates].some((b) => b?.includes('/plates/'))),
    `a turn mid-morph shows page ${P.nn} in English, baked: the static slot and the curl, never the plate, no wand`,
    `${turning.length} turning frames; static ${firstTurn?.staticSrc === enBake ? 'the English bake' : firstTurn?.staticSrc}, ${firstTurn?.staticReady ? 'decoded' : 'NOT decoded'}; curl ${[...new Set(facesWithPage)].map((b) => (b.includes(enBake) ? 'en bake' : isEn(b) ? 'en, easing' : b.slice(0, 30))).join(', ')}`,
  );
  check(
    grown > 1.02 && bakeOff <= 1,
    'grown under the pointer, the page a turn shows is still at ×1 (the bake has no grow and no wand)',
    `letters ×${grown.toFixed(4)} on screen; the bake's ink box within ${bakeOff}px of the page at rest`,
  );
  // …and back: Spanish.
  await recordFrames(page, P);
  await page.keyboard.press(P.lift.back);
  await settledAt(page, P.spread);
  frames = await stopFrames(page);
  await shown(page, P);
  await page.waitForTimeout(200);
  const back = await qstate(page, P);
  const backFaces = frames.filter((f) => f.turn).flatMap((f) => f.faces).filter((b) => b.includes(enBake) || b.includes(esBake));
  check(
    back.lang === 'es' && sameLetters(back.drawn, es) && backFaces.length > 0 && backFaces.every((b) => b.includes(esBake)) && !back.tapped,
    'turning away and back, the quote is Spanish again (the arriving leaf too), and breathes again',
    `${back.lang}; arriving leaf ${backFaces.every((b) => b.includes(esBake)) ? 'the Spanish bake' : 'NOT the Spanish bake'}; tapped ${back.tapped}`,
  );

  // ── elsewhere: a click turns; a drag from the quote turns ──
  const book = await page.locator('.book').boundingBox();
  await page.mouse.click(book.x + book.width * 0.12, book.y + book.height * 0.15);
  await settledAt(page, P.spread - 1).catch(() => {});
  const afterClick = await hash(page);
  await page.keyboard.press('ArrowRight');
  await settledAt(page, P.spread).catch(() => {});
  await shown(page, P);
  // The drag lifts the quote's own page: rightward from a left page, leftward
  // from a right one.
  const c2 = await hitCentre(page);
  const sign = P.side === 'left' ? 1 : -1;
  await page.mouse.move(c2.x, c2.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(c2.x + (sign * book.width * 0.6 * i) / 12, c2.y);
  await page.mouse.up();
  await settledAt(page, P.lift.lands).catch(() => {});
  const afterDrag = await hash(page);
  const dragLang = await page.evaluate((n) => window.__quote.langs()[n] ?? 'es', P.n);
  check(afterClick === P.spread - 1, 'a click off the quote turns the page', `spread ${P.spread} → ${afterClick}`);
  check(afterDrag === P.lift.lands && dragLang === 'es', 'a drag that starts on the quote turns the page (and translates nothing)', `spread ${P.spread} → ${afterDrag}`);
  await page.keyboard.press(P.lift.back);
  await settledAt(page, P.spread);
  await shown(page, P);

  // ── keyboard ──
  await page.locator('.quote-layer__hit').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const k1 = await qstate(page, P);
  await page.keyboard.press(' ');
  await page.waitForTimeout(100);
  const k2 = await qstate(page, P);
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('quote-layer__hit'));
  check(
    k1.lang === 'en' && k2.lang === 'es' && (await hash(page)) === P.spread && focused,
    'the quote is a button: Enter and Space toggle it, and turn nothing',
    `Enter → ${k1.lang}, Space → ${k2.lang}; spread ${await hash(page)}`,
  );
  check(k2.desc.lang === 'es' && k2.label === 'Translate the quote to English', 'its name and its description’s language are back to Spanish', `"${k2.label}" [${k2.desc.lang}]`);
  await page.locator('.quote-layer__hit').blur();
  await checkTurnEase(page, P, check);
  await page.context().close();

  // ── touch ──
  const touch = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2 });
  const tp = await touch.newPage();
  await open(tp, P.spread);
  await shown(tp, P);
  const t = await hitCentre(tp);
  await tp.touchscreen.tap(t.x, t.y);
  await tp.waitForTimeout(300);
  const ts = await qstate(tp, P);
  const tcur = await tp.evaluate(() => document.querySelector('.book').dataset.cursor ?? null);
  const twand = await wandOf(tp);
  const tbook = await tp.locator('.book').boundingBox();
  await tp.touchscreen.tap(tbook.x + tbook.width * 0.12, tbook.y + tbook.height * 0.15);
  await settledAt(tp, P.spread - 1).catch(() => {});
  check(ts.lang === 'en' && tcur === null && !twand.on && twand.opacity === 0, 'a tap on the quote translates it, with no wand and no cursor', `${ts.lang}, wand ${twand.on ? 'on' : 'off'}, cursor ${tcur}`);
  check((await hash(tp)) === P.spread - 1, 'a tap off the quote turns the page', `spread ${await hash(tp)}`);
  await touch.close();

  // ── reduced motion ──
  const rm = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const rp = await rm.newPage();
  await open(rp, P.spread);
  await shown(rp, P);
  const r = await hitCentre(rp);
  const rmRest = (await scaleFrames(rp, P, 1200)).filter((v) => v !== null);
  await rp.mouse.move(r.x, r.y, { steps: 4 });
  await rp.waitForTimeout(700);
  const rmHover = await qstate(rp, P);
  const rmWand = await wandOf(rp);
  await recordFrames(rp, P);
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
  await morphDone(rp, P);
  const took = Date.now() - t0;
  frames = await stopFrames(rp);
  check(
    rmRest.every((v) => v === 1) && rmHover.scale === 1 && rmAngles.every((a) => a === QUOTES.settings.wandTiltDeg),
    'reduced motion: no breathing, no grow, no flick',
    `${rmRest.length} frames at rest all ×1; hovered ×${rmHover.scale}; wand ${Math.min(...rmAngles)}°`,
  );
  check(rmWand.on && rmWand.opacity === 1 && rmColours.some((h) => h !== BASE), 'reduced motion: the wand still shows, and its colour still changes', `opacity ${rmWand.opacity}; ${[...new Set(rmColours)].join(' ')}`);
  const rs = await qstate(rp, P);
  const places = new Set([...es, ...en].map((g) => `${g.ch}@${g.x.toFixed(2)},${g.y.toFixed(2)}`));
  const stray = frames.flatMap((f) => f.drawn ?? []).filter((d) => !places.has(d));
  check(
    stray.length === 0 && took < 700 && sameLetters(rs.drawn, en),
    'reduced motion: a crossfade — no letter moves or scrambles — done in about 300ms',
    `${frames.length} frames, ${stray.length} letters off both layouts${stray.length ? ` (${stray.slice(0, 3).join(' ')})` : ''}; ${took}ms to settle`,
  );
  await rm.close();

  await checkWandPixels(browser, P, { newPage, open, check });
}

// ── the section ──────────────────────────────────────────────────────────

export async function checkQuote(browser, opts) {
  for (const P of PAGES) await checkPage(browser, P, opts);
  const cover = PAGES.find((P) => P.spread === 1);
  if (cover) await checkCoverNeighbour(browser, cover, opts);
}
