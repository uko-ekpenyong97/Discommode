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
 * `window.__pv` (dev only, from `Scroller`) parks the track at an exact position,
 * which is the only way to hold a mid-turn frame still enough to measure.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';
const PROJECT = '02';
/** Both shapes of project: an even folder count, and an odd one — whose last
 *  row holds a single folder and leaves a column of the pile empty. */
const PROJECTS = ['02', '04'];

/** The two viewports the view is signed off at. */
const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

/** Points through a turn the rising folder is checked at: just after it leaves,
 *  through the middle, and just before it lands. */
const TURN_POINTS = [0.05, 0.2, 0.5, 0.8, 0.95];

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
    // measures zero tall — the folders are placed by the inline tops `Scroller`
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
 * The glass that is SUPPOSED to be there, as rectangles in sheet coordinates —
 * MASKED, not tolerated. Two kinds, and only two:
 *
 *  1. above the cabinet's top row — a folder's tab sticks up out of nothing at
 *     the top of a pile, which is what a tab is for;
 *  2. above the topmost piled tab OF EACH COLUMN, for the same reason. One
 *     tab deep and no deeper: the page's foot is per column now, so it comes
 *     down to meet each column's pile wherever that pile starts.
 *
 * There is no third. The slot a rising folder vacates used to need one; the
 * page under it now reaches into that column from the frame it leaves.
 */
function allowedGlass(slots, layout) {
  const { tabH, sheet, folders } = slots;
  const W = sheet.width;
  const open = layout.activeIndex;
  const riser = layout.turning ? layout.topIndex : -1;
  const rects = [];

  const docked = folders.filter((f) => f.k <= open && f.k !== riser);
  const cabinetTop = docked.length > 0 ? Math.min(...docked.map((f) => f.top)) : 0;
  rects.push({ x0: -1, x1: W + 1, y0: -1, y1: cabinetTop + tabH + 1 });

  for (const side of ['left', 'right']) {
    const resting = folders.filter((f) => f.side === side && f.k > open && f.k !== riser);
    if (resting.length === 0) continue;
    const head = resting.reduce((a, b) => (a.top <= b.top ? a : b));
    rects.push({ x0: head.left - 1, x1: head.right + 1, y0: head.top - 1, y1: head.top + tabH + 1 });
  }
  return rects;
}

/* ── one frame, measured ──────────────────────────────────────────────────── */

async function frame(page, label, { seek, quiet = false } = {}) {
  if (seek !== undefined) await page.evaluate((y) => window.__pv.seek(y), seek);
  await page.waitForTimeout(60);

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

  const clean = stray.length === 0 && smear === 0;
  // Every sample is checked; only the interesting ones are printed. A run that
  // prints one line per frame is a run nobody reads.
  if (!quiet || !clean) {
    check(stray.length === 0, `${label} — no glass between the rows`, `${stray.length} px`);
    check(
      smear === 0,
      `${label} — every folder inside its slot`,
      smear ? `${smear} px from folders ${[...outside.keys()].join(', ')}` : '0 differing',
    );
  } else {
    failures += 0;
  }
  if (stray.length > 0) console.log(`      glass ${box(stray)}`);
  for (const [k, pts] of outside) console.log(`      folder ${k} ${box(pts)}`);
  return { slots, layout, clean };
}

/* ── the run ──────────────────────────────────────────────────────────────── */

/** The parts of the track the checks steer by. */
const readTrack = (page) =>
  page.evaluate(() => {
    const t = window.__pv.track();
    return {
      start: t.start,
      pageScroll: t.pageScroll,
      openBody: t.openBody,
      footMin: t.footMin,
      footMax: t.footMax,
      turnDistance: t.turnDistance,
      rowPitch: t.rowPitch,
      tabHeight: t.tabHeight,
      strip: t.strip,
      viewportHeight: t.viewportHeight,
    };
  });

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
    const track = await readTrack(page);

    // 1 — every rest, and every point of every turn, on both projects. The
    //     paint pass answers the same two questions each time; only the frames
    //     that fail say anything.
    for (const id of PROJECTS) {
      const sheet = id === PROJECT ? page : await openView(context, viewport, `#view-${id}`);
      const t = await readTrack(sheet);
      let clean = 0;
      let total = 0;
      for (let k = 0; k < t.start.length; k++) {
        total++;
        if ((await frame(sheet, `card ${id} rest on folder ${k}`, { seek: t.start[k], quiet: true })).clean) clean++;
      }
      for (let k = 0; k + 1 < t.start.length; k++) {
        const foot = t.start[k] + t.pageScroll[k];
        for (const p of TURN_POINTS) {
          total++;
          const label = `card ${id} turn ${k}→${k + 1} at p=${p}`;
          const { slots, layout, clean: ok } = await frame(sheet, label, {
            seek: foot + t.turnDistance * p,
            quiet: true,
          });
          if (ok) clean++;
          const riser = slots.folders[k + 1];
          const shown = riser.height - riser.bodyTop;
          if (!(layout.folders[k + 1].bodyVisible && shown > slots.strip)) {
            bad(`${label} — the riser carries its page`, `${round(shown)}px under the strip`);
          }
          if (!layout.folders[k].bodyVisible) bad(`${label} — the folder below went out`);
        }
        // …and it lands with the page already where it ends up.
        const pop = await page.evaluate(
          async ([a, b]) => {
            const rect = () => {
              const f = document.querySelector('.pv-folder[data-top]');
              return { top: f.offsetTop, height: f.offsetHeight };
            };
            window.__pv.seek(a);
            const before = rect();
            window.__pv.seek(b);
            return { before, after: rect() };
          },
          [foot + t.turnDistance * 0.999, t.start[k + 1]],
        );
        if (Math.abs(pop.before.top - pop.after.top) > 1.5 || Math.abs(pop.before.height - pop.after.height) > 1.5) {
          bad(`card ${id} turn ${k}→${k + 1} — pop at the dock`, JSON.stringify(pop));
        }
      }
      ok(
        `card ${id}: ${total} frames — no glass outside the notches, no folder outside its slot`,
        `${clean}/${total} clean`,
      );

      // 2 — the rise is LINEAR: the folder is where the scroll put it, to
      //     within the half device pixel the snapping is allowed to move it.
      const rise = await sheet.evaluate(() => {
        const t = window.__pv.track();
        const foot = t.start[0] + t.pageScroll[0];
        const out = [];
        for (let p = 0.1; p < 0.95; p += 0.1) {
          window.__pv.seek(foot + t.turnDistance * p);
          out.push({ p, y: document.querySelector('.pv-folder[data-k="1"]').offsetTop });
        }
        return out;
      });
      // Fit the two ends and hold every point between them to the line.
      const a = rise[0];
      const b = rise[rise.length - 1];
      const worst = Math.max(
        ...rise.map(({ p, y }) => Math.abs(y - (a.y + ((b.y - a.y) * (p - a.p)) / (b.p - a.p)))),
      );
      check(worst <= 1, `card ${id}: the rise is linear in p`, `worst ${round(worst)}px off the line`);

      if (sheet !== page) await sheet.close();
    }

    // 3 — THE PAGE'S LAYOUT. No centred column: a page is the folder's width
    //     less one inset either side, and everything on it starts at the left
    //     inset and is free to run to the right one.
    await page.evaluate((y) => window.__pv.seek(y), track.start[3]);
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const folder = document.querySelector('.pv-folder[data-open]');
      const sheetBox = document.querySelector('.pv-scroller').getBoundingClientRect();
      const x = (el) => el.getBoundingClientRect().left - sheetBox.left;
      const right = (el) => el.getBoundingClientRect().right - sheetBox.left;
      // The CONTENT box. A text block's soft dark pool is 24px of padding on a
      // matching negative margin, so its border box overhangs the measure by
      // exactly the pool — which is a feather, not content.
      const inner = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return [
          r.left - sheetBox.left + parseFloat(cs.paddingLeft),
          r.right - sheetBox.left - parseFloat(cs.paddingRight),
        ];
      };
      const inset = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--pv-inset'),
      );
      const gap = parseFloat(
        getComputedStyle(document.querySelector('.pv-stack')).getPropertyValue('--pv-grid-gap'),
      );
      // The line the cabinet already drew: the FIRST thing on a left-hand
      // folder's strip, which is its number.
      const tabInk = document.querySelector('.pv-folder[data-side="left"] .pv-folder__no');
      const blocks = [...folder.querySelectorAll('.pv-run > .pv-block')];
      const twoup = folder.querySelector('.pv-twoup');
      const cells = twoup ? [...twoup.children] : [];
      const row = folder.querySelector('.pv-row');
      const bleed = folder.querySelector('.pv-block--bleed');
      const body = [...folder.querySelectorAll('.pv-body')];
      return {
        inset,
        gap,
        sheet: sheetBox.width,
        tabInkX: x(tabInk),
        headerNoX: x(folder.querySelector('.pv-folder__header .pv-folder__no')),
        headingX: x(folder.querySelector('.pv-folder__heading')),
        // What the widest thing on the page actually reaches.
        contentLeft: Math.min(
          ...blocks.filter((b) => !b.matches('.pv-block--bleed')).map((b) => inner(b)[0]),
        ),
        contentRight: Math.max(
          ...blocks.filter((b) => !b.matches('.pv-block--bleed')).map((b) => inner(b)[1]),
        ),
        bodyRight: body.length ? Math.max(...body.map(right)) : null,
        twoup: cells.length === 2 ? { gap: x(cells[1]) - right(cells[0]), widths: cells.map((c) => c.getBoundingClientRect().width) } : null,
        row: row ? { textRight: right(row.children[0]), mediaLeft: x(row.children[1]), mediaRight: right(row.children[1]) } : null,
        bleed: bleed ? { left: x(bleed), right: right(bleed) } : null,
        // Anything sitting with equal air either side of its parent and not
        // filling it is a centred column by another name.
        centred: blocks.filter((b) => {
          const r = b.getBoundingClientRect();
          const pr = b.parentElement.getBoundingClientRect();
          return Math.abs(r.left - pr.left - (pr.right - r.right)) < 2 && r.width < pr.width - 4;
        }).length,
      };
    });
    const near = (a, b, t = 1) => Math.abs(a - b) <= t;
    check(
      near(layout.headerNoX, layout.inset) && near(layout.headerNoX, layout.tabInkX),
      'the page header starts on the tab labels’ own line',
      `header ${round(layout.headerNoX)}  tab ${round(layout.tabInkX)}  inset ${layout.inset}`,
    );
    check(near(layout.headingX, layout.inset), 'the large title is left-aligned at the inset', `${round(layout.headingX)}`);
    check(
      near(layout.contentLeft, layout.inset) && near(layout.contentRight, layout.sheet - layout.inset),
      'content fills the measure — the only glass beside it is the two insets',
      `${round(layout.contentLeft)}…${round(layout.contentRight)} of ${round(layout.sheet)}`,
    );
    check(
      layout.bodyRight !== null && near(layout.bodyRight, layout.sheet - layout.inset),
      'body text runs to the right inset',
      `${round(layout.bodyRight)}`,
    );
    check(layout.centred === 0, 'nothing on the page is centred', `${layout.centred} blocks`);
    check(
      layout.twoup !== null &&
        near(layout.twoup.gap, layout.gap) &&
        near(layout.twoup.widths[0], layout.twoup.widths[1]),
      'the two-up halves meet at the gutter',
      layout.twoup ? `gap ${round(layout.twoup.gap)} of ${round(layout.gap)}` : 'no two-up on this page',
    );
    // Seven and five: the text stops one gutter short of the media, and the
    // media is pinned to the right inset.
    const grid = (layout.sheet - 2 * layout.inset - 11 * layout.gap) / 12;
    check(
      layout.row !== null &&
        near(layout.row.mediaLeft - layout.row.textRight, layout.gap) &&
        near(layout.row.mediaRight, layout.sheet - layout.inset) &&
        near(layout.row.mediaRight - layout.row.mediaLeft, 5 * grid + 4 * layout.gap, 1.5),
      'a list row is seven columns of text and five of media, pinned right',
      layout.row ? `media ${round(layout.row.mediaLeft)}…${round(layout.row.mediaRight)}` : 'no row on this page',
    );
    check(
      layout.bleed !== null && near(layout.bleed.left, 0) && near(layout.bleed.right, layout.sheet),
      'a bleed block escapes both insets to the folder’s edges',
      layout.bleed ? `${round(layout.bleed.left)}…${round(layout.bleed.right)}` : 'no bleed on this page',
    );

    // 4 — compact rows, and what they leave for the page.
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

    // 5 — hover dims the piles and never the page.
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

    // 6 — a folder that opens UNDER a resting pointer must drop the hover. The
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

    // 7 — THE SETTLE. A folder must never come to rest in mid-air, so a turn
    //     left part done finishes itself: on past halfway, back before it.
    //     `park` is a real scroll, so the idle timer counts exactly as it would
    //     after a wheel — the only honest way to check this.
    for (const p of [0.5, 0.75, 0.25]) {
      const settled = await page.evaluate(async (p) => {
        const t = window.__pv.track();
        const foot = t.start[0] + t.pageScroll[0];
        window.__pv.park(Math.round(foot + t.turnDistance * p));
        // A scroller quantises to device pixels, so read back where it landed
        // rather than assuming: at exactly half a turn either end is nearer.
        await new Promise((r) => setTimeout(r, 30));
        const from = window.__pv.layout().progress;
        const t0 = performance.now();
        while (window.__pv.layout().turning && performance.now() - t0 < 3000) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        return {
          from,
          active: window.__pv.layout().activeIndex,
          turning: window.__pv.layout().turning,
          ms: Math.round(performance.now() - t0),
        };
      }, p);
      // The decision is made on the exact figure, not a rounded one: a
      // scroller lands a ten-thousandth short of half a turn as often as not.
      const nearer = settled.from >= 0.5 ? 1 : 0;
      check(
        !settled.turning && settled.active === nearer,
        `settle: a turn left at p=${settled.from.toFixed(2)} runs ${nearer ? 'on' : 'back'}`,
        `${settled.ms}ms`,
      );
      // 120ms of quiet, then a 450ms tween — anything much past that is a
      // folder hanging in the air long enough for the reader to notice.
      check(settled.ms <= 900, `settle: …and lands promptly`, `${settled.ms}ms`);
    }

    // The same thing with a real hand on the wheel, end to end: park at the
    // foot of folder 0, wheel half a turn, stop. Nothing must settle WHILE the
    // wheel is turning, and the folder must dock once it stops.
    await page.evaluate(() => {
      const t = window.__pv.track();
      window.__pv.park(Math.round(t.start[0] + t.pageScroll[0]));
    });
    await page.waitForTimeout(300);
    await page.mouse.move(1000, 500);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 120); // 3 × 120 = half of a 720px turn
      await page.waitForTimeout(40);
    }
    const during = await page.evaluate(() => window.__pv.layout().turning);
    const wheeled = await page.evaluate(async () => {
      // Where the wheel actually left it. Lenis's own smoothing runs on for
      // most of a second after the last wheel event, and it crawls the last
      // few pixels — so wait for Lenis to say it has stopped rather than
      // guessing from two samples that happened to match.
      const t1 = performance.now();
      while (window.__pv.scrolling() && performance.now() - t1 < 3000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const from = window.__pv.layout().progress;
      const t0 = performance.now();
      while (window.__pv.layout().turning && performance.now() - t0 < 3000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const at = window.__pv.layout();
      return { from, active: at.activeIndex, turning: at.turning, ms: Math.round(performance.now() - t0) };
    });
    check(during, 'settle: nothing fires while the wheel is still turning');
    check(
      !wheeled.turning && wheeled.active === (wheeled.from >= 0.5 ? 1 : 0),
      `settle: half a turn on the wheel (p=${wheeled.from.toFixed(2)}), then stop — it lands`,
      `${wheeled.ms}ms after the scroll came to rest`,
    );

    // …and a rewind is a turn run backwards, so it settles the same way.
    const rewound = await page.evaluate(async () => {
      const t = window.__pv.track();
      window.__pv.park(t.start[2]);
      await new Promise((r) => setTimeout(r, 200));
      // Back up into the turn that brought folder 2 in, a third of the way.
      const foot = t.start[1] + t.pageScroll[1];
      window.__pv.park(foot + t.turnDistance * 0.3);
      await new Promise((r) => setTimeout(r, 900));
      const at = window.__pv.layout();
      return { turning: at.turning, active: at.activeIndex };
    });
    check(!rewound.turning && rewound.active === 1, 'settle: a rewind left part done runs back', JSON.stringify(rewound));

    // Outside the band it must do nothing at all, or a folder that has barely
    // moved twitches under a reader who has stopped reading it.
    const held = await page.evaluate(
      async ([lo, hi]) => {
        const t = window.__pv.track();
        const foot = t.start[0] + t.pageScroll[0];
        const out = [];
        for (const p of [lo / 2, 1 - (1 - hi) / 2]) {
          window.__pv.park(foot + t.turnDistance * p);
          await new Promise((r) => setTimeout(r, 900));
          out.push(Math.round(window.__pv.layout().progress * 100) / 100);
        }
        return out;
      },
      [0.15, 0.85],
    );
    check(
      Math.abs(held[0] - 0.075) < 0.02 && Math.abs(held[1] - 0.925) < 0.02,
      'settle: below the low dial and above the high one, nothing moves',
      JSON.stringify(held),
    );

    // A tab click owns the scroll while it runs; the settle must not grab it.
    const clicked = await page.evaluate(async () => {
      window.__pv.park(0);
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('.pv-folder[data-k="3"] .pv-folder__strip').click();
      await new Promise((r) => setTimeout(r, 1500));
      const at = window.__pv.layout();
      return { turning: at.turning, active: at.activeIndex };
    });
    check(!clicked.turning && clicked.active === 3, 'a tab click still lands on its folder', JSON.stringify(clicked));

    // 8 — contrast, re-measured: the titles got smaller.
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

    // 9 — the frame budget, over a real wheel scroll.
    await page.evaluate(() => window.__pv.release());
    const fps = await measureFps(page);
    console.log(`  · ${fps} fps over a 2s wheel scroll`);

    const noisy = page.logs.filter((l) => /ACTIVE FOLDER MOVED|pageerror|error:|overlap by|no clip/.test(l));
    check(noisy.length === 0, 'no console errors on first open', noisy.join(' | '));
    await page.close();
  }

  // ── media reserves its box ─────────────────────────────────────────────────
  //
  // A page's height is the input the whole track is built from, so it has to be
  // the same before and after its assets arrive. Every media block carries its
  // intrinsic size for exactly this, and the full-width page changed every one
  // of those boxes — so hold the assets back, measure, let them through, and
  // measure again.
  console.log('\n── layout-stable media ──────────────────────────────────────');
  {
    // Its OWN context: the shared one has these assets in its memory cache from
    // every run above, and a cache hit never reaches the route that holds them
    // back — so the page would arm with all the media already decoded and the
    // check would prove nothing.
    const cold = await context.browser().newContext({ deviceScaleFactor: 1 });
    const held = await cold.newPage();
    await held.setViewportSize(VIEWPORTS[0]);
    await held.route('**/projects/placeholder/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const logs = [];
    held.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    await held.goto(`${URL}/#view-${PROJECT}`, { waitUntil: 'commit' });
    await held.waitForFunction(() => window.__pv?.armed(), null, { timeout: 15000 });
    const heights = () =>
      held.evaluate(() =>
        [...document.querySelectorAll('.pv-folder__inner')].map((el) =>
          Math.round(el.getBoundingClientRect().height),
        ),
      );
    // Only the PROJECT's media. `document.images` also holds the grid's covers,
    // which are behind the scrim, are not held back, and are already cached.
    const loaded = () =>
      held.evaluate(() => {
        const mine = [...document.images].filter((i) => i.src.includes('/projects/placeholder/'));
        return { of: mine.length, done: mine.filter((i) => i.complete).length };
      });
    const before = await heights();
    const loadedAtArm = await loaded();
    // Not "wait for every image": they are `loading="lazy"`, so the ones below
    // the fold never start. Wait past the hold-back and count what arrived.
    await held.waitForTimeout(3000);
    const after = await heights();
    const loadedNow = await loaded();
    check(
      loadedNow.done > loadedAtArm.done,
      'the gate opened before the media did',
      `${loadedAtArm.done} of ${loadedAtArm.of} decoded when the track armed, ${loadedNow.done} after`,
    );
    check(
      String(before) === String(after),
      'page heights are identical before and after the media lands',
      `${before.join(', ')}`,
    );
    const moved = logs.filter((l) => /ACTIVE FOLDER MOVED/.test(l));
    check(moved.length === 0, 'no rebuild moved the reader', moved.join(' | '));
    await cold.close();
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
