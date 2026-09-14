/**
 * The project view, checked in a real browser.
 *
 * The unit tests cover `pageTrack` and `fitPlaneToRect` thoroughly and nothing
 * else, and every bug this view has had was one only a browser could see: a
 * declaration the browser quietly dropped, a page that popped into place a
 * frame after it landed, two surfaces that were supposed to be the same pixels
 * and were not. This is the suite that asks the browser.
 *
 *   npm run dev            # in another shell
 *   node scripts/pv-verify.mjs
 *
 * THE HAND-OFF is the heart of it. Everything else in the view is a mapping
 * from one number; the one thing that is not is the swap at the end of an
 * entrance, where the HTML page fades in over the WebGL sheet at the identical
 * rect. Two checks hold it:
 *
 *   the RECT MATCH   the flat plane's screen rect, as three.js projects it,
 *                    against the live page's own — one pixel, both axes
 *   the DIFF         a screenshot of the sheet a frame before the swap against
 *                    a screenshot of the page a frame after it — two per cent
 *                    of the pixels inside the page rect may differ
 *
 * The rect match is the invariant; the diff is what catches everything the
 * invariant cannot say anything about — a stale texture, a lighting gradient
 * the flat HTML does not have, a hairline on one surface and not the other.
 *
 * `window.__pv` (dev only, from `Scroller`) parks the track at an exact
 * position, which is the only way to hold a mid-entrance frame still enough to
 * measure. The position is not the scrollTop, and Lenis owns the scrollTop.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const ORIGIN = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

/** Card 02 is five sections of uneven length; 03 is ONE, the case with no exit
 *  and no turn anywhere; 04 is three, the smallest count with a middle one. */
const PROJECT = '02';
const PROJECTS = ['02', '03', '04'];

/** The two viewports the view is signed off at. */
const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

/** Points through an entrance the sheet is checked at. */
const ENTER_POINTS = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95];

/**
 * A pixel counts as different when a channel moves by more than this — an
 * eighth of the range.
 *
 * Below that the measurement is dominated by how the two rasterisers antialias
 * a glyph edge: the GPU sampling a texture one texel to one pixel, and the
 * browser drawing type. Measured on the page that is all prose, which has more
 * glyph edges than any other: 3.1% of its pixels differ at a tolerance of 14
 * and 1.4% at 32, the mean absolute difference across the whole page is 1.5
 * levels, and the two screenshots are indistinguishable at 4x. A tolerance that
 * calls that a failure is a tolerance measuring the rasteriser.
 *
 * It still has teeth, and the control below proves it: the same measurement run
 * against the WRONG section's page reports a fifth of the page differing.
 */
const CHANNEL_TOLERANCE = 32;

/** The thresholds, all of them in one place. */
const RECT_PX = 1;
const DIFF_PCT = 2;
const FRAME_MS = 20;
const CONTRAST = 7;

let failures = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const round = (v) => Math.round(v * 10) / 10;
const pct = (v) => `${Math.round(v * 1000) / 1000}%`;

/* ── driving the view ─────────────────────────────────────────────────────── */

async function openView(context, viewport, hash = `#view-${PROJECT}`) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${ORIGIN}/${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
  // The intro tween owns the position for its first second and a half.
  await page.waitForTimeout(1800);
  page.logs = logs;
  return page;
}

/** The parts of the track the checks steer by. */
const readTrack = (page) =>
  page.evaluate(() => {
    const t = window.__pv.track();
    return {
      start: t.start,
      pageScroll: t.pageScroll,
      heights: t.heights,
      pageHeight: t.pageHeight,
      enterDistance: t.enterDistance,
      exitDistance: t.exitDistance,
      enterOverlap: t.enterOverlap,
      windows: t.start.map((_, k) => window.__pv.enterWindow(k)),
    };
  });

const seek = async (page, y) => {
  await page.evaluate((y) => window.__pv.seek(y), y);
  await page.waitForTimeout(50);
};

/** `p` through section `k`'s entrance WINDOW — which is not the same as its
 *  `enter` segment, because of the overlap. */
const atEnter = (track, k, p) => {
  const w = track.windows[k];
  return w.from + (w.to - w.from) * p;
};

/** Every video on its first frame, and every CSS animation pinned by the
 *  screenshot itself. A clip that is playing is a pixel difference that means
 *  nothing, and it is the only one the diff cannot tell from a real one. */
const parkMedia = (page) =>
  page.evaluate(async () => {
    for (const v of document.querySelectorAll('video')) {
      v.pause();
      v.currentTime = 0;
    }
    await new Promise((r) => setTimeout(r, 200));
  });

/* ── the hand-off diff ────────────────────────────────────────────────────── */

/** Share of pixels differing by more than {@link CHANNEL_TOLERANCE}, and the
 *  mean absolute difference per channel over the whole rect — which is the
 *  figure that says whether a difference is broad (a gradient) or narrow (an
 *  edge). */
async function differing(a, b) {
  const [x, y] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return 100;
  const n = x.info.width * x.info.height;
  const c = x.info.channels;
  let differ = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const o = i * c;
    const dr = Math.abs(x.data[o] - y.data[o]);
    const dg = Math.abs(x.data[o + 1] - y.data[o + 1]);
    const db = Math.abs(x.data[o + 2] - y.data[o + 2]);
    total += dr + dg + db;
    if (dr > CHANNEL_TOLERANCE || dg > CHANNEL_TOLERANCE || db > CHANNEL_TOLERANCE) differ++;
  }
  return { pct: (differ / n) * 100, mean: total / (n * 3) };
}

/**
 * One entrance's hand-off: the rect match a frame before the swap, and the
 * diff across it.
 *
 * The "after" shot waits out the crossfade rather than taking it at p = 1.001,
 * and it has to: a frame past the swap the page is at one per cent opacity over
 * a canvas still showing the sheet, so a diff there would compare the sheet
 * with itself and pass on anything. What is worth comparing is the last frame
 * of the sheet against the settled page.
 */
async function handoff(page, track, k, handoffMs) {
  await seek(page, atEnter(track, k, 0.999));
  const rects = await page.evaluate(() => ({
    sheet: window.__pv.sheetRect(),
    page: (() => {
      // The page is hidden a frame before the swap, so its rect comes off the
      // element rather than off the probe's "which one is live" test.
      const el = document.querySelector(`.pv-page[data-k="${window.__pv.layout().sheet.index}"]`);
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    })(),
  }));
  const drift = Math.max(
    Math.abs(rects.sheet.left - rects.page.left),
    Math.abs(rects.sheet.top - rects.page.top),
    Math.abs(rects.sheet.width - rects.page.width),
    Math.abs(rects.sheet.height - rects.page.height),
  );

  const clip = {
    x: Math.round(rects.page.left),
    y: Math.round(rects.page.top),
    width: Math.round(rects.page.width),
    height: Math.round(rects.page.height),
  };
  await parkMedia(page);
  const before = await page.screenshot({ clip, animations: 'disabled' });

  await seek(page, track.start[k]);
  await page.waitForTimeout(handoffMs + 250);
  await parkMedia(page);
  const after = await page.screenshot({ clip, animations: 'disabled' });

  const { pct, mean } = await differing(before, after);
  return { drift, diff: pct, mean, before, clip };
}

/* ── the run ──────────────────────────────────────────────────────────────── */

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const handoffMs = 120;

  for (const viewport of VIEWPORTS) {
    console.log(`\n── ${viewport.name} ──────────────────────────────────────────`);

    // 1 — THE HAND-OFF, on every entrance of every card.
    for (const id of PROJECTS) {
      const page = await openView(context, viewport, `#view-${id}`);
      const track = await readTrack(page);
      let worstDrift = 0;
      let worstDiff = 0;
      let worstMean = 0;
      let control = null;
      for (let k = 0; k < track.start.length; k++) {
        const { drift, diff, mean, before, clip } = await handoff(page, track, k, handoffMs);
        worstDrift = Math.max(worstDrift, drift);
        worstDiff = Math.max(worstDiff, diff);
        worstMean = Math.max(worstMean, mean);
        if (drift > RECT_PX) bad(`card ${id} section ${k} — rect match`, `${round(drift)}px apart`);
        if (diff > DIFF_PCT) bad(`card ${id} section ${k} — hand-off diff`, pct(diff));
        // THE CONTROL, once per card: the same measurement against the page of
        // the NEXT section. If that comes out small the diff is measuring
        // nothing and every pass above is worthless.
        if (control === null && k + 1 < track.start.length) {
          await seek(page, track.start[k + 1]);
          await page.waitForTimeout(handoffMs + 250);
          await parkMedia(page);
          const wrong = await page.screenshot({ clip, animations: 'disabled' });
          control = (await differing(before, wrong)).pct;
        }
      }
      check(
        worstDrift <= RECT_PX,
        `card ${id}: the sheet's flat rect is the page's rect`,
        `worst ${Math.round(worstDrift * 1000) / 1000}px of ${RECT_PX}`,
      );
      check(
        worstDiff <= DIFF_PCT,
        `card ${id}: the hand-off does not show`,
        `worst ${pct(worstDiff)} of ${DIFF_PCT}% differing, mean ${Math.round(worstMean * 100) / 100} levels`,
      );
      if (control !== null) {
        check(
          control > 10,
          `card ${id}: …and the diff can tell two pages apart`,
          `the wrong section's page differs on ${pct(control)}`,
        );
      }

      // 2 — THE CURL IS OUT BY p = 0.60 AND STAYS OUT. A curl still resolving
      //     at the swap is a shape the flat HTML cannot match, so the crossfade
      //     would have to hide a shape change rather than a surface change.
      const curls = await page.evaluate(
        async ([k, points]) => {
          const out = [];
          for (const p of points) {
            const w = window.__pv.enterWindow(k);
            window.__pv.seek(w.from + (w.to - w.from) * p);
            out.push({ p, ...window.__pv.layout().sheet.pose });
          }
          return out;
        },
        [Math.min(1, track.start.length - 1), ENTER_POINTS],
      );
      const late = curls.filter((c) => c.p >= 0.6);
      check(
        late.every((c) => c.curl === 0) && curls.some((c) => c.curl < 0),
        `card ${id}: the curl is out by p = 0.60 and stays out`,
        late.map((c) => `${c.p}:${c.curl}`).join(' '),
      );
      // …and the sheet is exactly the page at the end of its window.
      const landed = curls[curls.length - 1];
      check(
        landed.scale === 1 && landed.rotationZ === 0,
        `card ${id}: the sheet is flat and full size well before the swap`,
        `p ${landed.p}  scale ${landed.scale}  rot ${landed.rotationZ}`,
      );
      await page.close();
    }

    const page = await openView(context, viewport);
    const track = await readTrack(page);

    // 3 — THE CANVAS IS IDLE during a vertical run. Zero frames, not cheap
    //     ones: it is the longest segment by far and the only one where the
    //     reader is actually reading.
    await seek(page, track.start[1]);
    await page.waitForTimeout(handoffMs + 300);
    const idle = await page.evaluate(async () => {
      const before = window.__pv.canvasFrames();
      const t = window.__pv.track();
      // A real scroll down the middle of the section, nowhere near either end.
      for (let i = 1; i <= 20; i++) {
        window.__pv.seek(t.start[1] + (t.pageScroll[1] * i) / 24);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return window.__pv.canvasFrames() - before;
    });
    check(idle === 0, 'the canvas paints nothing during a vertical run', `${idle} frames`);

    // 4 — THE FRAME BUDGET, through an entrance and through an exit with the
    //     canvas active. Sampled off rAF, so a long frame is a long frame.
    for (const [label, from, to] of [
      ['an entrance', atEnter(track, 1, 0), atEnter(track, 1, 1)],
      ['an exit', track.start[1] + track.pageScroll[1], track.start[2] - track.enterDistance],
    ]) {
      const frames = await page.evaluate(
        ([from, to]) =>
          new Promise((resolve) => {
            const times = [];
            const t0 = performance.now();
            let last = t0;
            const step = (now) => {
              times.push(now - last);
              last = now;
              const p = Math.min(1, (now - t0) / 1200);
              window.__pv.seek(from + (to - from) * p);
              if (p < 1) requestAnimationFrame(step);
              else resolve(times);
            };
            requestAnimationFrame(step);
          }),
        [from, to],
      );
      // The first two are the ramp-up: a shader compile, a texture upload, a
      // layer being promoted. What matters is the steady state.
      const worst = Math.max(...frames.slice(2));
      check(worst <= FRAME_MS, `no frame over ${FRAME_MS}ms through ${label}`, `worst ${round(worst)}ms over ${frames.length} frames`);
    }

    // 5 — THE PAGE'S LAYOUT. A page is the rect less one inset either side, and
    //     everything on it starts at the left inset and is free to run to the
    //     right one.
    //
    //     Measured across EVERY page, not just the live one. The pages are all
    //     in the same rect and all laid out from the first frame — only one of
    //     them paints — and no single section carries every kind of block, so a
    //     check that looked at one would report "no row on this page" and mean
    //     nothing by it. `getBoundingClientRect` does not care about
    //     `visibility`.
    await seek(page, track.start[1] + 200);
    await page.waitForTimeout(handoffMs + 200);
    const layout = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.pv-page')];
      const boxOf = (el) => el.closest('.pv-page').getBoundingClientRect();
      const x = (n) => n.getBoundingClientRect().left - boxOf(n).left;
      const right = (n) => n.getBoundingClientRect().right - boxOf(n).left;
      /** The first one of these anywhere in the project. */
      const first = (sel) => {
        for (const p of pages) {
          const found = p.querySelector(sel);
          if (found) return found;
        }
        return null;
      };
      const all = (sel) => pages.flatMap((p) => [...p.querySelectorAll(sel)]);
      const cs = getComputedStyle(document.documentElement);
      const inset = parseFloat(cs.getPropertyValue('--pv-inset'));
      const gap = parseFloat(cs.getPropertyValue('--pv-grid-gap'));
      const width = pages[0].getBoundingClientRect().width;

      const letterhead = first('.pv-letterhead-block__no');
      const blocks = all('.pv-run > .pv-block');
      const measured = blocks.filter((b) => !b.matches('.pv-block--bleed'));
      const twoup = first('.pv-twoup');
      const cells = twoup ? [...twoup.children] : [];
      const row = first('.pv-row');
      const bleed = first('.pv-block--bleed');
      const body = all('.pv-body');
      return {
        inset,
        gap,
        width,
        letterheadX: x(letterhead),
        titleX: x(first('.pv-letterhead-block__title')),
        contentLeft: Math.min(...measured.map(x)),
        contentRight: Math.max(...measured.map(right)),
        bodyRight: body.length ? Math.max(...body.map(right)) : null,
        twoup:
          cells.length === 2
            ? { gap: x(cells[1]) - right(cells[0]), widths: cells.map((c) => c.getBoundingClientRect().width) }
            : null,
        row: row
          ? { textRight: right(row.children[0]), mediaLeft: x(row.children[1]), mediaRight: right(row.children[1]) }
          : null,
        bleed: bleed ? { left: x(bleed), right: right(bleed) } : null,
        // Anything with equal air either side of its parent and not filling it
        // is a centred column by another name.
        centred: blocks.filter((b) => {
          const r = b.getBoundingClientRect();
          const p = b.parentElement.getBoundingClientRect();
          return Math.abs(r.left - p.left - (p.right - r.right)) < 2 && r.width < p.width - 4;
        }).length,
      };
    });
    const near = (a, b, t = 1) => Math.abs(a - b) <= t;
    check(
      near(layout.letterheadX, layout.inset) && near(layout.titleX, layout.inset),
      'the letterhead block sits on the inset line',
      `no ${round(layout.letterheadX)}  title ${round(layout.titleX)}  inset ${layout.inset}`,
    );
    check(
      near(layout.contentLeft, layout.inset) && near(layout.contentRight, layout.width - layout.inset),
      'content fills the measure — the only paper beside it is the two insets',
      `${round(layout.contentLeft)}…${round(layout.contentRight)} of ${round(layout.width)}`,
    );
    check(
      layout.bodyRight !== null && near(layout.bodyRight, layout.width - layout.inset),
      'body text runs to the right inset',
      `${round(layout.bodyRight)}`,
    );
    check(layout.centred === 0, 'nothing on the page is centred', `${layout.centred} blocks`);
    check(
      layout.twoup !== null && near(layout.twoup.gap, layout.gap) && near(layout.twoup.widths[0], layout.twoup.widths[1]),
      'the two-up halves meet at the gutter',
      layout.twoup ? `gap ${round(layout.twoup.gap)} of ${round(layout.gap)}` : 'no two-up in this project',
    );
    const column = (layout.width - 2 * layout.inset - 11 * layout.gap) / 12;
    check(
      layout.row !== null &&
        near(layout.row.mediaLeft - layout.row.textRight, layout.gap) &&
        near(layout.row.mediaRight, layout.width - layout.inset) &&
        near(layout.row.mediaRight - layout.row.mediaLeft, 5 * column + 4 * layout.gap, 1.5),
      'a list row is seven columns of text and five of media, pinned right',
      layout.row ? `media ${round(layout.row.mediaLeft)}…${round(layout.row.mediaRight)}` : 'no row in this project',
    );
    check(
      layout.bleed !== null && near(layout.bleed.left, 0) && near(layout.bleed.right, layout.width),
      'a bleed block escapes both insets to the page’s edges',
      layout.bleed ? `${round(layout.bleed.left)}…${round(layout.bleed.right)}` : 'no bleed in this project',
    );

    // 6 — CONTRAST, on paper and on the ground, sampled down a whole section so
    //     every kind of run of type is measured somewhere.
    const contrast = await page.evaluate(async () => {
      const t = window.__pv.track();
      const worst = new Map();
      for (let i = 0; i <= 8; i++) {
        window.__pv.seek(t.start[1] + (t.pageScroll[1] * i) / 8);
        await new Promise((r) => setTimeout(r, 120));
        for (const s of window.__pvProbe()?.samples ?? []) {
          const key = `${s.kind}|${s.surface}`;
          const had = worst.get(key);
          if (!had || s.ratio < had.ratio) worst.set(key, s);
        }
      }
      return [...worst.values()].sort((a, b) => a.ratio - b.ratio);
    });
    const failed = contrast.filter((s) => !s.pass);
    check(
      contrast.length > 0 && failed.length === 0,
      `contrast ≥ ${CONTRAST}:1, ink on paper and mono on the ground`,
      `worst ${contrast[0]?.ratio}:1 across ${contrast.length} kinds`,
    );
    for (const s of contrast) {
      console.log(`      ${s.pass ? ' ' : '←'} ${s.kind.padEnd(26)} ${s.surface.padEnd(7)} ${String(s.fontPx).padStart(3)}px  ${s.ratio}:1`);
    }

    // 7 — THE SETTLE. A sheet must never come to rest in mid-air, so a TURN —
    //     an exit and the entrance that overlaps it, as one move — left part
    //     done finishes itself: on past halfway, back before it.
    for (const p of [0.5, 0.75, 0.25]) {
      const settled = await page.evaluate(async (p) => {
        const t = window.__pv.track();
        const from = t.start[0] + t.pageScroll[0];
        window.__pv.park(Math.round(from + (t.exitDistance + t.enterDistance) * p));
        // A scroller quantises to device pixels, so read back where it landed
        // rather than assuming: at exactly half a turn either end is nearer.
        await new Promise((r) => setTimeout(r, 40));
        const at = () => window.__pv.layout();
        const started = (window.__pv.position() - from) / (t.exitDistance + t.enterDistance);
        const t0 = performance.now();
        while (at().segment !== 'page' && performance.now() - t0 < 3000) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { from: started, segment: at().segment, active: at().activeIndex, ms: Math.round(performance.now() - t0) };
      }, p);
      const nearer = settled.from >= 0.5 ? 1 : 0;
      check(
        settled.segment === 'page' && settled.active === nearer,
        `settle: a turn left at p=${settled.from.toFixed(2)} runs ${nearer ? 'on' : 'back'}`,
        `${settled.ms}ms`,
      );
      // 120ms of quiet, then a 450ms tween — anything much past that is a sheet
      // hanging in the air long enough for the reader to notice.
      check(settled.ms <= 1200, 'settle: …and lands promptly', `${settled.ms}ms`);
    }

    // Outside the band it must do nothing at all, or a page that has barely
    // started to leave twitches under a reader who has stopped reading it.
    const held = await page.evaluate(
      async ([lo, hi]) => {
        const t = window.__pv.track();
        const from = t.start[0] + t.pageScroll[0];
        const len = t.exitDistance + t.enterDistance;
        const out = [];
        for (const p of [lo / 2, 1 - (1 - hi) / 2]) {
          window.__pv.park(Math.round(from + len * p));
          await new Promise((r) => setTimeout(r, 900));
          out.push(Math.round(((window.__pv.position() - from) / len) * 100) / 100);
        }
        return out;
      },
      [0.15, 0.85],
    );
    check(
      Math.abs(held[0] - 0.075) < 0.03 && Math.abs(held[1] - 0.925) < 0.03,
      'settle: below the low dial and above the high one, nothing moves',
      JSON.stringify(held),
    );

    // The same thing with a real hand on the wheel, end to end: park at the
    // bottom of section 0, wheel part-way into the turn, stop. Nothing must
    // settle WHILE the wheel is turning, and the sheet must land once it stops.
    await page.evaluate(() => {
      const t = window.__pv.track();
      window.__pv.park(Math.round(t.start[0] + t.pageScroll[0]));
    });
    await page.waitForTimeout(400);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }
    const during = await page.evaluate(() => window.__pv.layout().segment !== 'page');
    const wheeled = await page.evaluate(async () => {
      // Where the wheel actually left it. Lenis's own smoothing runs on for
      // most of a second after the last wheel event and crawls the last few
      // pixels, so wait for Lenis to say it has stopped rather than guessing.
      const t1 = performance.now();
      while (window.__pv.scrolling() && performance.now() - t1 < 3000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const t = window.__pv.track();
      const from = t.start[0] + t.pageScroll[0];
      const started = (window.__pv.position() - from) / (t.exitDistance + t.enterDistance);
      const t0 = performance.now();
      while (window.__pv.layout().segment !== 'page' && performance.now() - t0 < 3000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { from: started, active: window.__pv.layout().activeIndex, segment: window.__pv.layout().segment, ms: Math.round(performance.now() - t0) };
    });
    check(during, 'settle: nothing fires while the wheel is still turning');
    check(
      wheeled.segment === 'page' && wheeled.active === (wheeled.from >= 0.5 ? 1 : 0),
      `settle: part of a turn on the wheel (p=${wheeled.from.toFixed(2)}), then stop — it lands`,
      `${wheeled.ms}ms after the scroll came to rest`,
    );

    // A letterhead click owns the scroll while it runs; the settle must not
    // grab it, and it must land on the section it names.
    const clicked = await page.evaluate(async () => {
      window.__pv.park(0);
      await new Promise((r) => setTimeout(r, 400));
      document.querySelectorAll('.pv-letterhead__no')[3].click();
      await new Promise((r) => setTimeout(r, 2200));
      const at = window.__pv.layout();
      return { segment: at.segment, active: at.activeIndex };
    });
    check(
      clicked.segment === 'page' && clicked.active === 3,
      'a letterhead number still lands on its section',
      JSON.stringify(clicked),
    );

    const noisy = page.logs.filter((l) => /ACTIVE SECTION MOVED|pageerror|error:|\[pv:handoff\]/.test(l));
    check(noisy.length === 0, 'no console errors', noisy.slice(0, 3).join(' | '));
    await page.close();
  }

  // ── layout-stable media, and a cold first open ──────────────────────────────
  //
  // A page's height is the input the whole track is built from, so it has to be
  // the same before and after its assets arrive. And the TEXTURES must not be
  // part of that gate at all: `sheet.webp` decoding affects no layout, and
  // waiting on it would put a WebGL asset on the critical path of a scroll lock.
  console.log('\n── layout-stable media, textures cold ───────────────────────');
  {
    // Its OWN context: the shared one has these assets in its memory cache from
    // every run above, and a cache hit never reaches the route that holds them
    // back — so the page would arm with all the media already decoded and the
    // check would prove nothing.
    const cold = await browser.newContext({ deviceScaleFactor: 1 });
    const held = await cold.newPage();
    await held.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    // TWO hold-backs, because they answer two different questions. The block
    // media is what a page's HEIGHT is made of, so it is held long enough to
    // prove the heights do not move when it lands. The TEXTURES are held longer
    // still, because the claim about them is stronger: the scroll lock has to
    // arm before one of them has arrived at all.
    const MEDIA_MS = 1500;
    const TEXTURE_MS = 3000;
    const seen = [];
    const t0 = Date.now();
    await held.route('**/projects/*/sheet-*.webp', async (route) => {
      await new Promise((r) => setTimeout(r, TEXTURE_MS));
      await route.continue();
    });
    await held.route('**/projects/placeholder/**', async (route) => {
      await new Promise((r) => setTimeout(r, MEDIA_MS));
      await route.continue();
    });
    held.on('response', (r) => seen.push({ url: r.url(), at: Date.now() - t0 }));
    const logs = [];
    held.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    await held.goto(`${ORIGIN}/#view-${PROJECT}`, { waitUntil: 'commit' });
    await held.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
    const armedAt = Date.now() - t0;
    const heights = () => held.evaluate(() => window.__pv.track().heights.map(Math.round));
    const decoded = () =>
      held.evaluate(() => {
        const mine = [...document.images].filter((i) => i.src.includes('/projects/placeholder/'));
        return { of: mine.length, done: mine.filter((i) => i.complete).length };
      });
    const before = await heights();
    const atArm = await decoded();
    // Not "wait for every image": they are `loading="lazy"`, so the ones below
    // the fold never start. Wait past both hold-backs and count what arrived.
    await held.waitForTimeout(TEXTURE_MS + 1200);
    const after = await heights();
    const now = await decoded();
    const firstTexture = seen.find((r) => /sheet-[\d-]+\.webp/.test(r.url))?.at;
    check(
      now.done > atArm.done,
      'the gate opened before the media did',
      `${atArm.done} of ${atArm.of} decoded when the track armed, ${now.done} after`,
    );
    check(
      firstTexture !== undefined && armedAt < firstTexture,
      'the track armed with the textures cold',
      `armed at ${armedAt}ms, first capture landed at ${firstTexture ?? 'never'}ms`,
    );
    check(
      String(before) === String(after),
      'page heights are identical before and after the media lands',
      `${before.join(', ')}`,
    );
    const moved = logs.filter((l) => /ACTIVE SECTION MOVED/.test(l));
    check(moved.length === 0, 'no rebuild moved the reader', moved.join(' | '));
    await cold.close();
  }

  // ── the ways in and out ────────────────────────────────────────────────────
  console.log('\n── navigation ───────────────────────────────────────────────');
  const page = await openView(context, VIEWPORTS[0], `#view-${PROJECT}/4`);
  const deep = await page.evaluate(() => {
    const l = window.__pv.layout();
    return {
      active: l.activeIndex,
      segment: l.segment,
      sheet: l.sheet,
      shown: [...document.querySelectorAll('.pv-page')].filter((p) => p.style.visibility !== 'hidden').length,
      frames: window.__pv.canvasFrames(),
    };
  });
  check(
    deep.active === 3 && deep.segment === 'page' && deep.sheet === null && deep.shown === 1,
    'a deep link lands flat on its section',
    JSON.stringify({ active: deep.active, segment: deep.segment, shown: deep.shown }),
  );
  check(deep.frames === 0, 'a deep link replays no entrance — the canvas never painted', `${deep.frames} frames`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  const resized = await page.evaluate(() => ({
    active: window.__pv.layout().activeIndex,
    drift: (() => {
      const s = window.__pv.sheetRect();
      const r = document.querySelector('.pv-page[data-k="3"]').getBoundingClientRect();
      return Math.max(Math.abs(s.left - r.left), Math.abs(s.top - r.top), Math.abs(s.width - r.width), Math.abs(s.height - r.height));
    })(),
  }));
  check(resized.active === 3, 'a resize keeps the reader on their section', `section ${resized.active}`);
  check(resized.drift <= RECT_PX, 'a resize re-fits the plane to the new page rect', `${round(resized.drift)}px apart`);

  const inert = await page.evaluate(() => document.querySelector('.app')?.hasAttribute('inert'));
  check(inert === true, 'the app behind is inert');

  await page.keyboard.press('Escape');
  // The close is a storyboard (the pane out, the scrim trailing it) and only
  // then the hash change and the unmount — a second covers all of it with room.
  await page.waitForTimeout(1400);
  const closed = await page.evaluate(() => ({
    hash: location.hash,
    layer: !!document.querySelector('.portfolio-layer'),
    inert: document.querySelector('.app')?.hasAttribute('inert'),
  }));
  check(
    !closed.hash.startsWith('#view-') && !closed.layer && !closed.inert,
    'Escape closes the view',
    JSON.stringify(closed),
  );

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

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
