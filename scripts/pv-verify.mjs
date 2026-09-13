/**
 * The project view, checked in a real browser.
 *
 * The unit tests cover `pageTrack` thoroughly and nothing else, and every bug
 * this view has had was one only a browser could see: a `clip-path` the browser
 * quietly dropped, a row of glass between two folders, a page that popped into
 * place a frame after it landed. This is the suite that asks the browser.
 *
 *   npm run dev            # in another shell
 *   node scripts/pv-verify.mjs
 *
 * THE PAINT PASS is the heart of it. Repainting every folder in a flat, opaque
 * colour of its own — one per index, all of them `rgb(r, 0, 255)` — and the
 * scrim in flat green turns the question "is the cabinet airtight, and did
 * every folder stay inside its slot?" into two pixel counts:
 *
 *   green inside the sheet   → GLASS: the backdrop showing through a seam
 *   blue outside its slot    → SMEAR: a folder painting where it must not
 *
 * Neither repaint touches layout — no size, no position, no reflow of a folder's
 * content — so the track is exactly the track the reader gets.
 *
 * `window.__pv` (dev only, from `Sheet`) parks the track at an exact position,
 * which is the only way to hold a mid-turn frame still enough to measure.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';
const PROJECT = '02';

/** The two viewports the view is signed off at. */
const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

/** Points through a turn the rising folder is checked at. */
const TURN_POINTS = [0.3, 0.6, 0.9];

let failures = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const round = (v) => Math.round(v * 10) / 10;
/** The bounding box of a set of offending pixels, for a failure worth finding. */
const box = (pts) =>
  `x ${Math.min(...pts.map((p) => p[0]))}…${Math.max(...pts.map((p) => p[0]))}` +
  `  y ${Math.min(...pts.map((p) => p[1]))}…${Math.max(...pts.map((p) => p[1]))}  ${pts.length}px`;

/* ── the paint pass ───────────────────────────────────────────────────────── */

/** Folder `k`'s flat colour. Blue pinned at 255 and green at 0, so a folder is
 *  never mistaken for the scrim, and the index rides in the red channel. */
const paintOf = (k) => ({ r: 20 + k * 30, g: 0, b: 255 });

const PAINT_CSS = (n) => `
  .pv-scrim {
    background: rgb(0, 255, 0) !important;
    opacity: 1 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .pv-folder__shape { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important; }
  /* visibility, not display: hiding these by layout would resize a folder's
     content and rebuild the track under the frame being measured. */
  .pv-folder__strip, .pv-folder__content, .pv-folder__thumbs, .pv-close { visibility: hidden !important; }
  .pv-folder { transition: none !important; }
  ${Array.from({ length: n }, (_, k) => {
    const { r, g, b } = paintOf(k);
    return `.pv-folder[data-k="${k}"] .pv-folder__shape { background: rgb(${r}, ${g}, ${b}) !important; }`;
  }).join('\n  ')}
`;

/**
 * What each folder is ALLOWED to paint, in sheet coordinates: its own column
 * for the strip, and — when it is the open one — the whole sheet below the top
 * of its page.
 */
async function readSlots(page) {
  return page.evaluate(() => {
    const stack = document.querySelector('.pv-stack');
    // The SCROLLER's box is the sheet. The stack is `inset: 0` in a sticky
    // stage whose `height: 100%` resolves against an auto-height parent, so it
    // measures zero tall — the folders are placed by the inline tops `Sheet`
    // writes, and those are in the scroller's coordinates.
    const sheet = document.querySelector('.pv-scroller').getBoundingClientRect();
    const cs = getComputedStyle(stack);
    const num = (v) => parseFloat(cs.getPropertyValue(v));
    return {
      sheet: { left: sheet.left, top: sheet.top, width: sheet.width, height: sheet.height },
      tabH: num('--pv-tab-h'),
      strip: num('--pv-strip-h'),
      rowPitch: num('--pv-row-pitch'),
      titlePx: num('--pv-title'),
      folders: Array.from(document.querySelectorAll('.pv-folder')).map((el) => {
        const strip = el.querySelector('.pv-folder__strip');
        const left = parseFloat(strip.style.left);
        const width = parseFloat(strip.style.width);
        const body = el.querySelector('.pv-folder__content');
        return {
          k: Number(el.dataset.k),
          side: el.dataset.side,
          open: el.hasAttribute('data-open'),
          top: el.offsetTop,
          height: el.offsetHeight,
          left,
          right: left + width,
          bodyTop: parseFloat(body.style.top),
          bodyHeight: parseFloat(body.style.height),
        };
      }),
    };
  });
}

/** Nothing painted this pixel — the backdrop is showing through. */
const GLASS = -2;
/** A blend: two folders' colours meeting along an edge. Not evidence either way. */
const EDGE = -1;

/**
 * Screenshot the sheet with every folder flat-painted, and account for every
 * pixel of it: which folder painted it, or nothing did.
 *
 * Antialiasing is the whole difficulty. Where one folder's chamfer crosses
 * another, the blend along it lands on a THIRD folder's colour exactly as often
 * as not — 50% of 110 over 50% of 50 is 80, and 80 is folder 2. So a pixel only
 * counts when its four neighbours agree with it: an outline is one pixel wide,
 * and a folder painting where it should not is never one pixel wide.
 */
async function paintPass(page, slots) {
  const clip = {
    x: Math.round(slots.sheet.left),
    y: Math.round(slots.sheet.top),
    width: Math.floor(slots.sheet.width),
    height: Math.floor(slots.sheet.height),
  };
  const png = await page.screenshot({ clip, animations: 'disabled' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const byRed = new Map();
  for (const f of slots.folders) byRed.set(paintOf(f.k).r, f);

  const cls = new Int16Array(width * height);
  for (let i = 0, px = 0; px < cls.length; px++, i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > 200 && r < 60 && b < 60) cls[px] = GLASS;
    else if (b >= 250 && g <= 8 && byRed.has(r)) cls[px] = byRed.get(r).k;
    else cls[px] = EDGE;
  }
  const solid = (x, y) => {
    const i = y * width + x;
    const c = cls[i];
    if (x > 0 && cls[i - 1] !== c) return EDGE;
    if (x < width - 1 && cls[i + 1] !== c) return EDGE;
    if (y > 0 && cls[i - width] !== c) return EDGE;
    if (y < height - 1 && cls[i + width] !== c) return EDGE;
    return c;
  };

  const glass = [];
  const outside = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = solid(x, y);
      if (c === EDGE) continue;
      if (c === GLASS) {
        glass.push([x, y]);
        continue;
      }
      const f = slots.folders[c];
      // The slot: the folder's own column, plus the sheet's width under the top
      // of its page once it is the open one.
      const inColumn = x >= f.left - 1 && x <= f.right + 1;
      const inBand = y >= f.top - 1 && y <= f.top + f.height + 1;
      const inPage = f.open && y >= f.top + f.bodyTop - 1 && y <= f.top + f.height + 1;
      if (inBand && (inColumn || inPage)) continue;
      if (!outside.has(f.k)) outside.set(f.k, []);
      outside.get(f.k).push([x, y]);
    }
  }
  return { glass, outside, width, height, png };
}

/**
 * The glass that is SUPPOSED to be there, as rectangles in sheet coordinates.
 *
 * Three of them, and only three:
 *
 *  1. above the cabinet's top row — a folder's tab sticks up out of nothing at
 *     the top of a pile, which is what a tab is for;
 *  2. above the topmost piled tab OF EACH COLUMN, for the same reason. One
 *     notch, not one row: the open page runs under the pile's half-read top row
 *     rather than stopping at it, so a column's notch is a tab deep whichever
 *     row its pile happens to start in;
 *  3. mid-turn, the slot the rising folder has just left.
 */
function allowedGlass(slots, layout) {
  const { tabH, rowPitch, sheet, folders } = slots;
  const W = sheet.width;
  const open = layout.activeIndex;
  const riser = layout.turning ? layout.topIndex : -1;
  const rows = Math.ceil(folders.length / 2);
  const pileTopOf = (r) => sheet.height - (rows - r) * rowPitch;
  const rects = [];

  const cabinetTop = Math.min(...folders.filter((f) => f.k <= open).map((f) => f.top));
  rects.push({ x0: -1, x1: W + 1, y0: -1, y1: cabinetTop + tabH + 1 });

  for (const side of ['left', 'right']) {
    const resting = folders.filter((f) => f.side === side && f.k > open && f.k !== riser);
    if (resting.length === 0) continue;
    const head = resting.reduce((a, b) => (a.top <= b.top ? a : b));
    rects.push({ x0: head.left - 1, x1: head.right + 1, y0: head.top - 1, y1: head.top + tabH + 1 });
  }

  if (riser >= 0) {
    // The hole the riser left. Its partner's column goes with it when the
    // partner is already docked, which is exactly the odd-index case.
    const r = Math.floor(riser / 2);
    const y0 = pileTopOf(r) - 1;
    const y1 = pileTopOf(r) + rowPitch + tabH + 1;
    for (const f of folders.filter((g) => Math.floor(g.k / 2) === r)) {
      if (f.k === riser || f.k <= open) rects.push({ x0: f.left - 1, x1: f.right + 1, y0, y1 });
    }
  }
  return rects;
}

/* ── one frame, measured ──────────────────────────────────────────────────── */

async function frame(page, label, { seek } = {}) {
  if (seek !== undefined) await page.evaluate((y) => window.__pv.seek(y), seek);
  await page.waitForTimeout(120);

  const slots = await readSlots(page);
  const layout = await page.evaluate(() => window.__pv.layout());

  // Not `addStyleTag`: it takes no id, and a paint pass left in the head would
  // still be there when the contrast probe ran — measuring text over a flat
  // green scrim and a hidden page.
  await page.evaluate((css) => {
    const el = document.createElement('style');
    el.id = 'pv-paint';
    el.textContent = css;
    document.head.append(el);
  }, PAINT_CSS(slots.folders.length));
  await page.waitForTimeout(80);
  const { glass, outside } = await paintPass(page, slots);
  await page.evaluate(() => document.getElementById('pv-paint').remove());

  const rects = allowedGlass(slots, layout);
  const inside = ([x, y]) => rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const stray = glass.filter((p) => !inside(p));
  const smear = [...outside.values()].reduce((a, p) => a + p.length, 0);

  check(stray.length === 0, `${label} — no glass between the rows`, `${stray.length} px`);
  check(
    smear === 0,
    `${label} — every folder inside its slot`,
    smear ? `${smear} px from folders ${[...outside.keys()].join(', ')}` : '0 differing',
  );
  if (stray.length > 0) console.log(`      glass ${box(stray)}`);
  for (const [k, pts] of outside) console.log(`      folder ${k} ${box(pts)}`);
  return { slots, layout };
}

/* ── the run ──────────────────────────────────────────────────────────────── */

async function openView(context, viewport, hash = `#view-${PROJECT}`) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${URL}/${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  page.logs = logs;
  return page;
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ deviceScaleFactor: 1 });

  for (const viewport of VIEWPORTS) {
    console.log(`\n── ${viewport.name} ──────────────────────────────────────────`);
    const page = await openView(context, viewport);
    const track = await page.evaluate(() => {
      const t = window.__pv.track();
      return { start: t.start, pageScroll: t.pageScroll, openBody: t.openBody, rowPitch: t.rowPitch, tabHeight: t.tabHeight, strip: t.strip, viewportHeight: t.viewportHeight };
    });

    // 1 — at rest on each of the first three folders, both parities.
    for (const k of [0, 1, 2]) {
      await frame(page, `rest on folder ${k}`, { seek: track.start[k] });
    }

    // 2 — mid-turn, where the rising folder is carrying its page.
    for (const k of [0, 1]) {
      for (const p of TURN_POINTS) {
        const y = track.start[k] + track.pageScroll[k] + 720 * p;
        const { slots, layout } = await frame(page, `turn ${k}→${k + 1} at p=${p}`, { seek: y });
        const riser = slots.folders[k + 1];
        const pageShown = riser.height - riser.bodyTop;
        check(
          layout.folders[k + 1].bodyVisible && pageShown > slots.strip,
          `turn ${k}→${k + 1} at p=${p} — the riser carries its page`,
          `${round(pageShown)}px of page under the strip`,
        );
        check(
          layout.folders[k].bodyVisible,
          `turn ${k}→${k + 1} at p=${p} — the folder below is covered, not hidden`,
        );
      }
      // …and lands with the page already where it ends up.
      const before = await page.evaluate((y) => {
        window.__pv.seek(y);
        const f = document.querySelector(`.pv-folder[data-k="${window.__pv.layout().topIndex}"]`);
        return { top: f.offsetTop, height: f.offsetHeight };
      }, track.start[k] + track.pageScroll[k] + 720 * 0.999);
      const after = await page.evaluate((y) => {
        window.__pv.seek(y);
        const f = document.querySelector(`.pv-folder[data-k="${window.__pv.layout().activeIndex}"]`);
        return { top: f.offsetTop, height: f.offsetHeight };
      }, track.start[k + 1]);
      check(
        Math.abs(before.top - after.top) < 1.5 && Math.abs(before.height - after.height) < 1.5,
        `turn ${k}→${k + 1} — no pop at the dock`,
        `Δtop ${round(after.top - before.top)}  Δheight ${round(after.height - before.height)}`,
      );
    }

    // 3 — compact rows, and what they leave for the page.
    await page.evaluate((y) => window.__pv.seek(y), track.start[2]);
    await page.waitForTimeout(80);
    const slots = await readSlots(page);
    const open = slots.folders[2];
    const share = (open.bodyHeight / slots.sheet.height) * 100;
    console.log(
      `  · rows ${round(slots.rowPitch)}px  tab ${round(slots.tabH)}  strip ${round(slots.strip)}  title ${round(slots.titlePx)}px`,
    );
    check(share >= 60, 'three docked, three piled — the page keeps the sheet', `${round(share)}%`);
    const pageWidth = await page.evaluate(() => {
      const f = document.querySelector('.pv-folder[data-open]');
      const shape = f.querySelector('.pv-folder__shape').getBoundingClientRect();
      return { shape: shape.width, sheet: f.parentElement.getBoundingClientRect().width };
    });
    check(
      Math.abs(pageWidth.shape - pageWidth.sheet) < 1,
      'the open page fills the sheet width',
      `${round(pageWidth.shape)} of ${round(pageWidth.sheet)}`,
    );

    // 4 — hover dims the piles and never the page.
    await page.evaluate(() => window.__pv.release());
    // A REAL pointer: React derives enter/leave from `pointerover`/`pointerout`,
    // so a dispatched `pointerenter` reaches nothing.
    await page.hover('.pv-folder[data-k="4"] .pv-folder__strip');
    await page.waitForTimeout(350);
    const dim = await page.evaluate(() => {
      const open = document.querySelector('.pv-folder[data-open]');
      const piled = document.querySelector('.pv-folder:not([data-open]):not([data-hover])');
      return {
        hovered: !!document.querySelector('.pv-folder[data-hover]'),
        open: Number(getComputedStyle(open).opacity),
        page: Number(getComputedStyle(open.querySelector('.pv-folder__content')).opacity),
        piled: Number(getComputedStyle(piled).opacity),
      };
    });
    check(dim.hovered, 'a folder in the pile takes the hover');
    check(dim.open === 1 && dim.page === 1, 'hover never dims the open folder or its page');
    check(dim.piled < 0.5, 'hover dims the cabinet and the pile', `${dim.piled}`);

    // 5 — a folder that opens UNDER a resting pointer must drop the hover. The
    //     pointer has not moved, so nothing sends a `pointerleave`; without the
    //     sweep in `apply` the whole pile stays dimmed behind a page.
    const stuck = await page.evaluate(async () => {
      const t = window.__pv.track();
      window.__pv.seek(t.start[4]);
      // Long enough for the 250ms dim transition to have run all the way back.
      await new Promise((r) => setTimeout(r, 500));
      const out = {
        hovered: !!document.querySelector('.pv-folder[data-hover]'),
        dimmed: Number(getComputedStyle(document.querySelector('.pv-folder[data-k="1"]')).opacity),
      };
      window.__pv.release();
      return out;
    });
    check(!stuck.hovered && stuck.dimmed === 1, 'a folder that opens under the pointer drops the hover', JSON.stringify(stuck));
    await page.mouse.move(10, 10);

    // 6 — contrast, re-measured: the titles got smaller.
    await page.evaluate(() => window.__pv.seek(0));
    await page.waitForTimeout(200);
    const contrast = await page.evaluate(() => {
      const r = window.__pvProbe?.();
      if (!r) return null;
      // The worst run of each kind of text — the folder titles and the number
      // are the ones this change touched.
      const byKind = new Map();
      for (const s of r.samples) {
        const w = byKind.get(s.kind);
        if (!w || s.ratio < w.ratio) byKind.set(s.kind, s);
      }
      return {
        worst: r.worst,
        failures: r.failures,
        kinds: [...byKind.values()].map(
          (s) => `${s.kind} ${s.fontPx}px  ${Math.round(s.ratio * 100) / 100}:1  needs ${s.required}${s.pass ? '' : '  ← BELOW'}`,
        ),
      };
    });
    if (contrast) {
      check(contrast.failures === 0, 'contrast', `worst ${round(contrast.worst)}:1`);
      for (const s of contrast.kinds) console.log(`      ${s}`);
    } else {
      bad('contrast — the probe returned nothing');
    }

    // 7 — the frame budget, over a real wheel scroll.
    await page.evaluate(() => window.__pv.release());
    const fps = await measureFps(page);
    console.log(`  · ${fps} fps over a 2s wheel scroll`);

    const noisy = page.logs.filter((l) => /ACTIVE FOLDER MOVED|pageerror|error:|overlap by|no clip/.test(l));
    check(noisy.length === 0, 'no console errors on first open', noisy.join(' | '));
    await page.close();
  }

  // ── the ways in and out ────────────────────────────────────────────────────
  console.log('\n── navigation ───────────────────────────────────────────────');
  const page = await openView(context, VIEWPORTS[0], `#view-${PROJECT}/4`);
  const deep = await page.evaluate(() => ({
    active: window.__pv.layout().activeIndex,
    open: document.querySelectorAll('.pv-folder[data-open]').length,
    turning: window.__pv.layout().turning,
  }));
  check(deep.active === 3 && deep.open === 1 && !deep.turning, 'deep link opens on its folder', JSON.stringify(deep));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  const resized = await page.evaluate(() => window.__pv.layout().activeIndex);
  check(resized === 3, 'a resize keeps the reader on their folder', `folder ${resized}`);

  const inert = await page.evaluate(() => document.querySelector('.app')?.hasAttribute('inert'));
  check(inert === true, 'the app behind is inert');

  await page.keyboard.press('Escape');
  // The close is a storyboard (sheet out, scrim trailing it) and only then the
  // hash change and the unmount — a second covers all of it with room.
  await page.waitForTimeout(1400);
  const closed = await page.evaluate(() => ({
    hash: location.hash,
    layer: !!document.querySelector('.portfolio-layer'),
    inert: document.querySelector('.app')?.hasAttribute('inert'),
  }));
  check(!closed.hash.startsWith('#view-') && !closed.layer && !closed.inert, 'Escape closes the view', JSON.stringify(closed));

  // The reader is the other full-screen layer; it must still open.
  const reader = await page.evaluate(async () => {
    const link = document.querySelector('a[href^="#read-"]');
    location.hash = link ? link.getAttribute('href') : '#read-1';
    await new Promise((r) => setTimeout(r, 1200));
    return !!document.querySelector('.reader, [class*="reader"]');
  });
  check(reader, 'the reader still opens');
  await page.close();

  await browser.close();
  console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`);
  process.exit(failures === 0 ? 0 : 1);
}

async function measureFps(page) {
  await page.mouse.move(1000, 500);
  const done = page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve(Math.round((frames / (performance.now() - t0)) * 1000));
        };
        requestAnimationFrame(tick);
      }),
  );
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(45);
  }
  return done;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
