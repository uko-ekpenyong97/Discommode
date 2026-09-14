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
 * THE TWO HAND-OFFS are the heart of it. Everything else in the view is a
 * mapping from one number; the things that are not are the two swaps at either
 * end of a vertical run, where the HTML page and a WebGL sheet showing the same
 * pixels change places. Each is held by two checks:
 *
 *   the RECT MATCH   the flat plane's screen rect, as three.js projects it,
 *                    against the live page's own — one pixel, both axes
 *   the DIFF         a screenshot of one surface against a screenshot of the
 *                    other — two per cent of the pixels inside the page rect
 *                    may differ
 *
 * The rect match is the invariant; the diff is what catches everything the
 * invariant cannot say anything about — a stale capture, a lighting gradient
 * the flat HTML does not have, a hairline on one surface and not the other.
 *
 * THE PAINT PASS is how the tear and the dwell are measured. Repainting the
 * ground in flat magenta and hiding the two pieces of chrome turns "where is
 * the sheet" and "is the ground really empty" into pixel counts, which is the
 * only honest way to ask either: the sheet is a bent surface in a vertex
 * shader, and its silhouette is not something the CPU knows.
 *
 * `window.__pv` (dev only, from `Scroller`) parks the track at an exact
 * position, which is the only way to hold a mid-tear frame still enough to
 * measure. The position is not the scrollTop, and Lenis owns the scrollTop.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const ORIGIN = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

/** Card 02 is five sections of uneven length; 03 is ONE, the case with no tear,
 *  no dwell and nothing to settle; 04 is three, the smallest count with a
 *  middle one. */
const PROJECT = '02';
const PROJECTS = ['02', '03', '04'];

/** The two viewports the view is signed off at. */
const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

/** Points through a tear the sheet is measured at. */
const TEAR_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9];

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
 * against the WRONG section's page reports half the page differing.
 */
const CHANNEL_TOLERANCE = 32;

/** The thresholds, all of them in one place. */
const RECT_PX = 1;
const DIFF_PCT = 2;
const FRAME_MS = 20;
const CONTRAST = 7;
/** How far outside the page's rect the tear may paint before it comes free —
 *  a couple of pixels for the bend's own perspective, and no more. */
const PIN_SLACK = 3;
/** How far the free corner must have come off the page by `p` = 0.15, in screen
 *  pixels. The tear's first movement is a corner lifting, and a lift nobody can
 *  see is a beat of the choreography spent on nothing. */
const CORNER_PX = 40;
/** Points through the corner lift it is reported at. */
const LIFT_POINTS = [0.05, 0.1, 0.15, 0.3];

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
      dwellDistance: t.dwellDistance,
      enters: t.start.map((_, k) => window.__pv.enterWindow(k)),
      dwells: t.start.map((_, k) => window.__pv.dwellWindow(k)),
    };
  });

const seek = async (page, y) => {
  await page.evaluate((y) => window.__pv.seek(y), y);
  await page.waitForTimeout(50);
};

/** Seek, and wait for the crossfade at the start of a tear to finish.
 *
 * Anything that asks the CANVAS what it is showing has to go through this. For
 * the 120ms of a hand-off the canvas is holding the FLAT sheet — that is the
 * whole point of it — so a probe that lands inside the swap measures a flat
 * sheet and reports that nothing has bent. */
const seekSettled = async (page, y, handoffMs) => {
  await page.evaluate((y) => window.__pv.seek(y), y);
  await page.waitForTimeout(handoffMs + 200);
};

/** `p` through section `k`'s entrance, which is exactly its `enter` segment. */
const atEnter = (track, k, p) => {
  const w = track.enters[k];
  return w.from + (w.to - w.from) * p;
};

/** `p` through section `k`'s tear. */
const atTear = (track, k, p) =>
  track.start[k] + track.pageScroll[k] + track.exitDistance * p;

/** The page's rect — every section's page has it, whether or not it is the one
 *  painting, so it can be read at any position on the track. */
const readFrame = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.pv-page').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

/** Every video on its first frame. A clip that is playing is a pixel difference
 *  that means nothing, and it is the only one the diff cannot tell from a real
 *  one. CSS animations are pinned by the screenshot itself. */
const parkMedia = (page) =>
  page.evaluate(async () => {
    for (const v of document.querySelectorAll('video')) {
      v.pause();
      v.currentTime = 0;
    }
    await new Promise((r) => setTimeout(r, 200));
  });

/* ── the diff ─────────────────────────────────────────────────────────────── */

/** Share of pixels differing by more than {@link CHANNEL_TOLERANCE}, and the
 *  mean absolute difference per channel over the whole rect — which is the
 *  figure that says whether a difference is broad (a gradient) or narrow (an
 *  edge). */
async function differing(a, b) {
  const [x, y] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
    return { pct: 100, mean: 255 };
  }
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

/* ── the paint pass ───────────────────────────────────────────────────────── */

/**
 * Flat magenta ground, no grain, no chrome. Everything left on screen is paper
 * — the sheet, or the page — so "where is the sheet" and "is the ground empty"
 * become one pixel count each.
 *
 * The grain goes because it is noise over both surfaces and the question is
 * about neither. The letterhead and the pill go because they are chrome: they
 * paint through a dwell on purpose, and they are checked from the DOM instead.
 */
const PAINT_CSS = `
  .pv-ground { background: #ff00ff !important; }
  .pv-grain, .pv-page__grain { display: none !important; }
  .pv-letterhead, .pv-close { visibility: hidden !important; }
`;

const paintOn = (page) =>
  page.evaluate((css) => {
    const el = document.createElement('style');
    el.id = 'pv-paint';
    el.textContent = css;
    document.head.append(el);
  }, PAINT_CSS);

const paintOff = (page) => page.evaluate(() => document.getElementById('pv-paint')?.remove());

/** The bounding box of everything that is NOT the magenta ground, in viewport
 *  coordinates — plus how many such pixels there are. */
async function paperBounds(page) {
  const png = await page.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      // Magenta is the ground; anything else is paper. The ground is flat, so
      // this needs no tolerance to speak of.
      if (data[o] > 200 && data[o + 1] < 60 && data[o + 2] > 200) continue;
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return count === 0 ? { count: 0 } : { count, left, top, right, bottom };
}

/* ── the hand-offs ────────────────────────────────────────────────────────── */

/**
 * The rect match at whatever position the page is about to swap at.
 *
 * The plane's rect comes from three.js's own projection rather than from the
 * arithmetic that fed it, and the page's from `getBoundingClientRect` — so this
 * is the two halves of the invariant asked of the two things that actually draw
 * them.
 */
const rectDrift = (page) =>
  page.evaluate(() => {
    const sheet = window.__pv.sheetRect();
    const r = document.querySelector('.pv-page').getBoundingClientRect();
    if (!sheet) return Infinity;
    return Math.max(
      Math.abs(sheet.left - r.left),
      Math.abs(sheet.top - r.top),
      Math.abs(sheet.width - r.width),
      Math.abs(sheet.height - r.height),
    );
  });

/**
 * THE FORWARD HAND-OFF: the last frame of an entrance against the settled page.
 *
 * The "after" shot waits out the crossfade rather than taking it a frame past
 * the swap, and it has to: a frame past it the page is at one per cent opacity
 * over a canvas still showing the sheet, so a diff there would compare the
 * sheet with itself and pass on anything.
 */
async function handoffIn(page, track, k, clip, handoffMs) {
  await seek(page, atEnter(track, k, 0.999));
  const drift = await rectDrift(page);
  await parkMedia(page);
  const sheet = await page.screenshot({ clip, animations: 'disabled' });

  await seek(page, track.start[k]);
  await page.waitForTimeout(handoffMs + 250);
  await parkMedia(page);
  const live = await page.screenshot({ clip, animations: 'disabled' });
  return { drift, ...(await differing(sheet, live)), sheet };
}

/**
 * THE REVERSE HAND-OFF: the settled page at the bottom of its run against the
 * first frame of the tear, which is the same rect wearing the section's LAST
 * viewport.
 *
 * It is the forward one run the other way, and it is a separate capture and a
 * separate check because it is a separate texture: an entrance ends on a
 * section's first viewport and a tear begins on its last, and nothing would
 * catch one of the two going stale except measuring both.
 */
async function handoffOut(page, track, k, clip, handoffMs) {
  await seek(page, track.start[k] + track.pageScroll[k]);
  await page.waitForTimeout(handoffMs + 250);
  await parkMedia(page);
  const live = await page.screenshot({ clip, animations: 'disabled' });

  // Two pixels into the tear: past the boundary, and far enough before the
  // corner lifts that the sheet is still the page's own rect.
  await seek(page, track.start[k] + track.pageScroll[k] + 2);
  const drift = await rectDrift(page);
  await page.waitForTimeout(handoffMs + 250);
  await parkMedia(page);
  // The second shot has to BE the sheet. Without this the check could pass at
  // 0% by photographing the same page twice, which is exactly the shape of
  // failure a reverse crossfade has: the page never hides and the sheet is
  // never seen.
  const swapped = await page.evaluate(
    () =>
      [...document.querySelectorAll('.pv-page')].every((p) => p.style.visibility === 'hidden') &&
      document.querySelector('.pv-canvas').style.visibility !== 'hidden',
  );
  const sheet = await page.screenshot({ clip, animations: 'disabled' });
  return { drift, swapped, ...(await differing(live, sheet)) };
}

/* ── the run ──────────────────────────────────────────────────────────────── */

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const handoffMs = 120;

  for (const viewport of VIEWPORTS) {
    console.log(`\n── ${viewport.name} ──────────────────────────────────────────`);

    // 1 — BOTH HAND-OFFS, on every section of every card.
    for (const id of PROJECTS) {
      const page = await openView(context, viewport, `#view-${id}`);
      const track = await readTrack(page);
      const frame = await readFrame(page);
      const clip = {
        x: Math.round(frame.left),
        y: Math.round(frame.top),
        width: Math.round(frame.width),
        height: Math.round(frame.height),
      };
      const worst = { inDrift: 0, inDiff: 0, outDrift: 0, outDiff: 0, mean: 0 };
      let control = null;
      const last = track.start.length - 1;

      for (let k = 0; k < track.start.length; k++) {
        const into = await handoffIn(page, track, k, clip, handoffMs);
        worst.inDrift = Math.max(worst.inDrift, into.drift);
        worst.inDiff = Math.max(worst.inDiff, into.pct);
        worst.mean = Math.max(worst.mean, into.mean);
        if (into.drift > RECT_PX) bad(`card ${id} section ${k} in — rect`, `${round(into.drift)}px`);
        if (into.pct > DIFF_PCT) bad(`card ${id} section ${k} in — diff`, pct(into.pct));

        // THE CONTROL, once per card: the entrance's own last frame against the
        // NEXT section's page. If that comes out small the diff is measuring
        // nothing and every pass above is worthless.
        if (control === null && k < last) {
          await seek(page, track.start[k + 1]);
          await page.waitForTimeout(handoffMs + 250);
          await parkMedia(page);
          const wrong = await page.screenshot({ clip, animations: 'disabled' });
          control = (await differing(into.sheet, wrong)).pct;
        }

        // The last section has no tear: there is nothing behind it to bring on.
        if (k === last) continue;
        const out = await handoffOut(page, track, k, clip, handoffMs);
        if (!out.swapped) bad(`card ${id} section ${k} out — the page never handed over`);
        worst.outDrift = Math.max(worst.outDrift, out.drift);
        worst.outDiff = Math.max(worst.outDiff, out.pct);
        worst.mean = Math.max(worst.mean, out.mean);
        if (out.drift > RECT_PX) bad(`card ${id} section ${k} out — rect`, `${round(out.drift)}px`);
        if (out.pct > DIFF_PCT) bad(`card ${id} section ${k} out — diff`, pct(out.pct));
      }

      check(
        Math.max(worst.inDrift, worst.outDrift) <= RECT_PX,
        `card ${id}: the sheet's flat rect is the page's rect, both ways`,
        `worst ${Math.round(Math.max(worst.inDrift, worst.outDrift) * 1000) / 1000}px of ${RECT_PX}`,
      );
      check(
        Math.max(worst.inDiff, worst.outDiff) <= DIFF_PCT,
        `card ${id}: neither hand-off shows`,
        `in ${pct(worst.inDiff)}, out ${pct(worst.outDiff)} of ${DIFF_PCT}%, mean ${round(worst.mean)} levels`,
      );
      if (control !== null) {
        check(
          control > 10,
          `card ${id}: …and the diff can tell two pages apart`,
          `the wrong section's page differs on ${pct(control)}`,
        );
      }

      // 2 — THE ENTRANCE'S SHAPE. The bend is out well before the swap and
      //     stays out: a bend still resolving there is a shape the flat HTML
      //     cannot match, so the crossfade would have to hide a shape change
      //     rather than a surface change.
      const shape = await page.evaluate(
        async ([k, points]) => {
          const out = [];
          for (const p of points) {
            const w = window.__pv.enterWindow(k);
            window.__pv.seek(w.from + (w.to - w.from) * p);
            out.push({ p, ...window.__pv.layout().sheet.pose });
          }
          return out;
        },
        [Math.min(1, last), [0, 0.3, 0.6, 0.8, 0.95]],
      );
      const late = shape.filter((c) => c.p >= 0.6);
      check(
        late.every((c) => c.curl === 0 && c.scale === 1 && c.rotationZ === 0) &&
          shape.some((c) => c.curl < 0),
        `card ${id}: the entrance is flat and square by p = 0.60, and bends the soft way`,
        `start ${shape[0].curl} at origin ${shape[0].curlOrigin}`,
      );
      await page.close();
    }

    const page = await openView(context, viewport);
    const track = await readTrack(page);
    const frame = await readFrame(page);

    // 3 — THE TEAR, in pixels. The ground goes flat magenta and the chrome goes
    //     away, so what is left on screen IS the sheet — which is the only
    //     honest way to ask where a bent surface in a vertex shader ended up.
    await paintOn(page);
    const tear = [];
    for (const p of TEAR_POINTS) {
      await seek(page, atTear(track, 0, p));
      tear.push({ p, ...(await paperBounds(page)) });
    }
    await paintOff(page);

    const pinned = tear.filter((t) => t.p < 0.6);
    check(
      pinned.every((t) => t.count > 0),
      'the tear paints something at every point before it comes free',
      pinned.map((t) => `${t.p}:${t.count}`).join(' '),
    );
    check(
      pinned.every((t) => t.left >= frame.left - PIN_SLACK),
      'the tear never reaches left of the pinned corner while it is held',
      pinned.map((t) => `${t.p}:${round(t.left - frame.left)}`).join(' '),
    );
    check(
      pinned.every((t) => t.bottom <= frame.top + frame.height + PIN_SLACK),
      'the tear never sags below the page while it is held',
      pinned.map((t) => `${t.p}:${round(t.bottom - (frame.top + frame.height))}`).join(' '),
    );
    // …and once it is free it goes UP and BACK, not sideways: whatever is left
    // on screen is higher than the page's own middle and smaller than the page.
    const free = tear.filter((t) => t.p >= 0.8 && t.count > 0);
    check(
      free.every((t) => t.bottom < frame.top + frame.height),
      'once free, the tear is above the page it came off',
      free.map((t) => `${t.p}:${round(frame.top + frame.height - t.bottom)}px clear`).join(' '),
    );
    check(
      tear[tear.length - 1].count < tear[0].count,
      'the tear is smaller on the way out than it was on the way in',
      `${tear[0].count} → ${tear[tear.length - 1].count} px`,
    );

    // 3b — THE CORNER LIFT. The tear's first movement is a corner coming off
    //      the page, and how far it has come is a question about a vertex —
    //      so it is asked of the vertex, through the same bend and the same
    //      camera the GPU uses, against where a flat sheet would have put it.
    const lift = [];
    for (const p of LIFT_POINTS) {
      await seekSettled(page, atTear(track, 0, p), handoffMs);
      lift.push({ p, ...(await page.evaluate(() => window.__pv.cornerLift())) });
    }
    check(
      lift.find((l) => l.p === 0.15).px >= CORNER_PX,
      `the free corner is ≥ ${CORNER_PX}px off the page by p = 0.15`,
      lift.map((l) => `${l.p}:${round(l.px)}px`).join(' '),
    );
    check(
      lift.every((l, i) => i === 0 || l.px > lift[i - 1].px),
      '…and it only ever comes further off',
      lift.map((l) => round(l.px)).join(' → '),
    );

    // 3c — THE BACK OF THE SHEET IS BLANK. Paper is opaque: the flap turns over
    //      around p = 0.3, and what it hands the reader has to be the reverse
    //      of a page rather than the page read backwards.
    //
    //      Asked as a CONTROLLED COMPARISON rather than by looking for type.
    //      Two different sections at the same point of their tear are the same
    //      geometry in the same rect wearing two different documents, so the
    //      only thing that can differ between them is the texture: if the back
    //      face is showing one, the flap's pixels differ; if it is paper, they
    //      are identical. No threshold on what type looks like, and nothing a
    //      blank corner of one capture could sneak past.
    //
    //      p = 0.5 and not earlier, and that is load-bearing: by then every
    //      point of the grid has turned past vertical. At p = 0.4 part of it is
    //      still on the arc and still FACING the reader, so it shows the
    //      texture because it should, and the comparison means nothing there.
    //      Run against a build with the branch removed, this reports 6 to 9
    //      points up to 202 levels apart.
    const grid = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) grid.push([0.995 - i * 0.06, 0.005 + j * 0.06]);
    }
    const flapOf = async (k) => {
      await seekSettled(page, atTear(track, k, 0.5), handoffMs);
      const at = await page.evaluate(
        ([grid]) => grid.map(([u, v]) => window.__pv.sheetPoint(u, v)),
        [grid],
      );
      const raw = await sharp(await page.screenshot({ animations: 'disabled' }))
        .raw()
        .toBuffer({ resolveWithObject: true });
      return at.map((p) => {
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (x < 1 || y < 1 || x >= raw.info.width - 1 || y >= raw.info.height - 1) return null;
        const o = (y * raw.info.width + x) * raw.info.channels;
        return [raw.data[o], raw.data[o + 1], raw.data[o + 2]];
      });
    };
    const flapA = await flapOf(0);
    const flapB = await flapOf(1);
    const pairs = flapA.map((a, i) => [a, flapB[i]]).filter(([a, b]) => a && b);
    const apart = pairs.map(([a, b]) => Math.max(...a.map((c, i) => Math.abs(c - b[i]))));
    check(
      pairs.length >= 30 && apart.every((d) => d <= 6),
      'the flap shows the BACK of the sheet: two sections, the same blank paper',
      `${pairs.length} points on screen, worst ${Math.max(...apart, 0)} levels apart`,
    );

    // 4 — THE DWELL. Half a screen of ground, and nothing else at all.
    await paintOn(page);
    await seek(page, track.dwells[0].from + track.dwellDistance * 0.5);
    const empty = await paperBounds(page);
    await paintOff(page);
    check(empty.count === 0, 'a dwell paints nothing but ground', `${empty.count} px of paper`);
    const naming = await page.evaluate(() => {
      const strip = document.querySelector('.pv-letterhead__section');
      return {
        text: (strip?.textContent ?? '').trim(),
        pending: strip?.hasAttribute('data-pending'),
        marked: document.querySelectorAll('.pv-letterhead__no[data-pending]').length,
        frames: window.__pv.canvasFrames(),
      };
    });
    check(
      naming.pending && naming.marked === 1 && /02 \/ 05/.test(naming.text),
      '…and the letterhead names the section it is waiting for, dim',
      JSON.stringify({ text: naming.text, marked: naming.marked }),
    );
    const idleFrames = await page.evaluate(async () => {
      const before = window.__pv.canvasFrames();
      const t = window.__pv.track();
      const w = window.__pv.dwellWindow(0);
      for (let i = 1; i <= 12; i++) {
        window.__pv.seek(w.from + (t.dwellDistance * i) / 14);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return window.__pv.canvasFrames() - before;
    });
    check(idleFrames === 0, '…and the canvas paints nothing through it', `${idleFrames} frames`);

    // 5 — THE CANVAS IS IDLE during a vertical run too. Zero frames, not cheap
    //     ones: it is the longest segment by far and the only one where the
    //     reader is actually reading.
    await seek(page, track.start[1]);
    await page.waitForTimeout(handoffMs + 300);
    const idle = await page.evaluate(async () => {
      const before = window.__pv.canvasFrames();
      const t = window.__pv.track();
      for (let i = 1; i <= 20; i++) {
        window.__pv.seek(t.start[1] + (t.pageScroll[1] * i) / 24);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return window.__pv.canvasFrames() - before;
    });
    check(idle === 0, 'the canvas paints nothing during a vertical run', `${idle} frames`);

    // 6 — THE FRAME BUDGET, through an entrance and through a tear with the
    //     canvas active. Sampled off rAF, so a long frame is a long frame.
    for (const [label, from, to] of [
      ['an entrance', atEnter(track, 1, 0), atEnter(track, 1, 1)],
      ['a tear', atTear(track, 0, 0), atTear(track, 0, 1)],
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
      const worstFrame = Math.max(...frames.slice(2));
      check(
        worstFrame <= FRAME_MS,
        `no frame over ${FRAME_MS}ms through ${label}`,
        `worst ${round(worstFrame)}ms over ${frames.length} frames`,
      );
    }

    // 7 — THE PAGE'S LAYOUT, measured across EVERY page. The pages are all in
    //     the same rect and all laid out from the first frame — only one of
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
        letterheadX: x(first('.pv-letterhead-block__no')),
        titleX: x(first('.pv-letterhead-block__title')),
        contentLeft: Math.min(...measured.map(x)),
        contentRight: Math.max(...measured.map(right)),
        bodyRight: body.length ? Math.max(...body.map(right)) : null,
        twoup:
          cells.length === 2
            ? {
                gap: x(cells[1]) - right(cells[0]),
                widths: cells.map((c) => c.getBoundingClientRect().width),
              }
            : null,
        row: row
          ? {
              textRight: right(row.children[0]),
              mediaLeft: x(row.children[1]),
              mediaRight: right(row.children[1]),
            }
          : null,
        bleed: bleed ? { left: x(bleed), right: right(bleed) } : null,
        // Anything with equal air either side of its parent and not filling it
        // is a centred column by another name.
        centred: blocks.filter((b) => {
          const r = b.getBoundingClientRect();
          const p = b.parentElement.getBoundingClientRect();
          return Math.abs(r.left - p.left - (p.right - r.right)) < 2 && r.width < p.width - 4;
        }).length,
        // The page never moves any more: the tear is entirely WebGL, so nothing
        // should ever write a transform to one of these.
        transformed: pages.filter((p) => getComputedStyle(p).transform !== 'none').length,
      };
    });
    const near = (a, b, t = 1) => Math.abs(a - b) <= t;
    check(
      near(layout.letterheadX, layout.inset) && near(layout.titleX, layout.inset),
      'the letterhead block sits on the inset line',
      `no ${round(layout.letterheadX)}  title ${round(layout.titleX)}  inset ${layout.inset}`,
    );
    check(
      near(layout.contentLeft, layout.inset) &&
        near(layout.contentRight, layout.width - layout.inset),
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
      layout.transformed === 0,
      'no page carries a transform — every pixel of the tear is WebGL',
      `${layout.transformed} transformed`,
    );
    check(
      layout.twoup !== null &&
        near(layout.twoup.gap, layout.gap) &&
        near(layout.twoup.widths[0], layout.twoup.widths[1]),
      'the two-up halves meet at the gutter',
      layout.twoup ? `gap ${round(layout.twoup.gap)} of ${round(layout.gap)}` : 'no two-up',
    );
    const column = (layout.width - 2 * layout.inset - 11 * layout.gap) / 12;
    check(
      layout.row !== null &&
        near(layout.row.mediaLeft - layout.row.textRight, layout.gap) &&
        near(layout.row.mediaRight, layout.width - layout.inset) &&
        near(layout.row.mediaRight - layout.row.mediaLeft, 5 * column + 4 * layout.gap, 1.5),
      'a list row is seven columns of text and five of media, pinned right',
      layout.row ? `media ${round(layout.row.mediaLeft)}…${round(layout.row.mediaRight)}` : 'no row',
    );
    check(
      layout.bleed !== null && near(layout.bleed.left, 0) && near(layout.bleed.right, layout.width),
      'a bleed block escapes both insets to the page’s edges',
      layout.bleed ? `${round(layout.bleed.left)}…${round(layout.bleed.right)}` : 'no bleed',
    );

    // 8 — CONTRAST, on paper and on the ground, sampled down a whole section so
    //     every kind of run of type is measured somewhere.
    const contrast = await page.evaluate(async () => {
      const t = window.__pv.track();
      const worstOf = new Map();
      for (let i = 0; i <= 8; i++) {
        window.__pv.seek(t.start[1] + (t.pageScroll[1] * i) / 8);
        await new Promise((r) => setTimeout(r, 120));
        for (const s of window.__pvProbe()?.samples ?? []) {
          const key = `${s.kind}|${s.surface}`;
          const had = worstOf.get(key);
          if (!had || s.ratio < had.ratio) worstOf.set(key, s);
        }
      }
      return [...worstOf.values()].sort((a, b) => a.ratio - b.ratio);
    });
    check(
      contrast.length > 0 && contrast.every((s) => s.pass),
      `contrast ≥ ${CONTRAST}:1, ink on paper and mono on the ground`,
      `worst ${contrast[0]?.ratio}:1 across ${contrast.length} kinds`,
    );
    for (const s of contrast) {
      console.log(
        `      ${s.pass ? ' ' : '←'} ${s.kind.padEnd(26)} ${s.surface.padEnd(7)} ` +
          `${String(s.fontPx).padStart(3)}px  ${s.ratio}:1`,
      );
    }

    // 9 — THE SETTLE. A sheet must never come to rest in mid-air. A TEAR goes
    //     to its nearer end; a DWELL, and the entrance after it, always go
    //     forward — empty ground is a beat you pass through rather than a place
    //     to sit, and the only thing on the far side of it is the next page.
    for (const [where, p] of [
      ['tear', 0.25],
      ['tear', 0.75],
      ['dwell', 0.5],
      ['entrance', 0.5],
    ]) {
      const settled = await page.evaluate(
        async ([where, p]) => {
          const t = window.__pv.track();
          const dwell = window.__pv.dwellWindow(0);
          const span =
            where === 'tear'
              ? { from: t.start[0] + t.pageScroll[0], len: t.exitDistance }
              : where === 'dwell'
                ? { from: dwell.from, len: t.dwellDistance }
                : { from: dwell.to, len: t.enterDistance };
          window.__pv.park(Math.round(span.from + span.len * p));
          await new Promise((r) => setTimeout(r, 40));
          // Wait for the SCROLL to go quiet and stay quiet, rather than for any
          // particular state: the settle's own idle timer has to expire first,
          // and one of the four landings is empty ground, which looks exactly
          // like "nothing happened" to a check that waits for a page.
          const t0 = performance.now();
          let quiet = performance.now();
          while (performance.now() - t0 < 4000) {
            await new Promise((r) => requestAnimationFrame(r));
            if (window.__pv.scrolling()) quiet = performance.now();
            else if (performance.now() - quiet > 500) break;
          }
          const at = window.__pv.layout();
          return {
            sheet: at.sheet !== null,
            segment: at.segment,
            active: at.activeIndex,
            // How long it took to COME TO REST, not how long the check watched
            // it afterwards: the 500ms of quiet is the observation, not the
            // move.
            ms: Math.round(quiet - t0),
          };
        },
        [where, p],
      );
      // A tear before halfway runs back to the page it came off; past halfway
      // it runs on to the ground it finishes on. Everything else runs on to the
      // next page.
      const landed =
        where === 'tear' && p >= 0.5
          ? settled.segment !== 'page'
          : settled.segment === 'page' && settled.active === (where === 'tear' ? 0 : 1);
      check(
        !settled.sheet && landed,
        `settle: a ${where} left at p=${p} runs ${where === 'tear' && p < 0.5 ? 'back' : 'on'}`,
        `${settled.segment}${settled.segment === 'page' ? ` ${settled.active}` : ''} in ${settled.ms}ms`,
      );
      check(settled.ms <= 2000, 'settle: …and lands promptly', `${settled.ms}ms`);
    }

    // A tear that has barely started must not twitch, and the ground just past
    // one is a legitimate place to stop.
    const held = await page.evaluate(async () => {
      const t = window.__pv.track();
      const from = t.start[0] + t.pageScroll[0];
      const out = [];
      for (const p of [0.07, 0.93]) {
        window.__pv.park(Math.round(from + t.exitDistance * p));
        await new Promise((r) => setTimeout(r, 900));
        out.push(Math.round(((window.__pv.position() - from) / t.exitDistance) * 100) / 100);
      }
      // …and the moment the tear is over, nothing pushes you off the ground.
      window.__pv.park(Math.round(window.__pv.dwellWindow(0).from + 4));
      await new Promise((r) => setTimeout(r, 900));
      out.push(window.__pv.layout().segment);
      return out;
    });
    check(
      Math.abs(held[0] - 0.07) < 0.03 && Math.abs(held[1] - 0.93) < 0.03,
      'settle: below the low dial and above the high one, nothing moves',
      JSON.stringify(held.slice(0, 2)),
    );
    check(held[2] !== 'page', 'settle: the ground a tear finishes on is a place to stop', held[2]);

    // The same thing with a real hand on the wheel, end to end.
    await page.evaluate(() => {
      const t = window.__pv.track();
      window.__pv.park(Math.round(t.start[0] + t.pageScroll[0]));
    });
    await page.waitForTimeout(400);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }
    const during = await page.evaluate(() => window.__pv.layout().segment === 'exit');
    const wheeled = await page.evaluate(async () => {
      // Lenis's own smoothing runs on for most of a second after the last wheel
      // event and crawls the last few pixels, so wait for Lenis to say it has
      // stopped rather than guessing.
      const t1 = performance.now();
      while (window.__pv.scrolling() && performance.now() - t1 < 3000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const t = window.__pv.track();
      const from = t.start[0] + t.pageScroll[0];
      const at = (window.__pv.position() - from) / t.exitDistance;
      const t0 = performance.now();
      while (window.__pv.layout().sheet !== null && performance.now() - t0 < 4000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return {
        at,
        sheet: window.__pv.layout().sheet !== null,
        segment: window.__pv.layout().segment,
        ms: Math.round(performance.now() - t0),
      };
    });
    check(during, 'settle: nothing fires while the wheel is still turning');
    check(
      !wheeled.sheet,
      `settle: part of a tear on the wheel (p=${wheeled.at.toFixed(2)}), then stop — it finishes`,
      `${wheeled.segment} after ${wheeled.ms}ms`,
    );

    // A letterhead click owns the scroll while it runs; the settle must not
    // grab it, and it must land on the section it names.
    const clicked = await page.evaluate(async () => {
      window.__pv.park(0);
      await new Promise((r) => setTimeout(r, 400));
      document.querySelectorAll('.pv-letterhead__no')[3].click();
      await new Promise((r) => setTimeout(r, 2400));
      const at = window.__pv.layout();
      return { segment: at.segment, active: at.activeIndex };
    });
    check(
      clicked.segment === 'page' && clicked.active === 3,
      'a letterhead number still lands on its section',
      JSON.stringify(clicked),
    );

    const noisy = page.logs.filter((l) =>
      /ACTIVE SECTION MOVED|pageerror|error:|\[pv:handoff\]/.test(l),
    );
    check(noisy.length === 0, 'no console errors', noisy.slice(0, 3).join(' | '));
    await page.close();
  }

  // ── layout-stable media, and a cold first open ──────────────────────────────
  //
  // A page's height is the input the whole track is built from, so it has to be
  // the same before and after its assets arrive. And the CAPTURES must not be
  // part of that gate at all: their decoding affects no layout, and waiting on
  // one would put a WebGL asset on the critical path of a scroll lock.
  console.log('\n── layout-stable media, captures cold ───────────────────────');
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
    // prove the heights do not move when it lands. The CAPTURES are held longer
    // still, because the claim about them is stronger: the scroll lock has to
    // arm before one of them has arrived at all.
    const MEDIA_MS = 1500;
    const TEXTURE_MS = 3000;
    const seen = [];
    const t0 = Date.now();
    await held.route('**/projects/*/{sheet,tail}-*.webp', async (route) => {
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
    const firstTexture = seen.find((r) => /(sheet|tail)-[\d-]+\.webp/.test(r.url))?.at;
    check(
      now.done > atArm.done,
      'the gate opened before the media did',
      `${atArm.done} of ${atArm.of} decoded when the track armed, ${now.done} after`,
    );
    check(
      firstTexture !== undefined && armedAt < firstTexture,
      'the track armed with the captures cold',
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
      shown: [...document.querySelectorAll('.pv-page')].filter(
        (p) => p.style.visibility !== 'hidden',
      ).length,
      frames: window.__pv.canvasFrames(),
    };
  });
  check(
    deep.active === 3 && deep.segment === 'page' && deep.sheet === null && deep.shown === 1,
    'a deep link lands flat on its section',
    JSON.stringify({ active: deep.active, segment: deep.segment, shown: deep.shown }),
  );
  check(
    deep.frames === 0,
    'a deep link replays no entrance — the canvas never painted',
    `${deep.frames} frames`,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  const resized = await page.evaluate(() => ({
    active: window.__pv.layout().activeIndex,
    drift: (() => {
      const s = window.__pv.sheetRect();
      const r = document.querySelector('.pv-page[data-k="3"]').getBoundingClientRect();
      return Math.max(
        Math.abs(s.left - r.left),
        Math.abs(s.top - r.top),
        Math.abs(s.width - r.width),
        Math.abs(s.height - r.height),
      );
    })(),
  }));
  check(resized.active === 3, 'a resize keeps the reader on their section', `section ${resized.active}`);
  check(
    resized.drift <= RECT_PX,
    'a resize re-fits the plane to the new page rect',
    `${round(resized.drift)}px apart`,
  );

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
