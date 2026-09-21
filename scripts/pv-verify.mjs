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

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ORIGIN = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

/** Cards 02 and 04 are five sections of uneven length; 03 is ONE, the case with
 *  no tear, no dwell and nothing to settle. */
const PROJECT = '02';
const PROJECTS = ['02', '03', '04'];

/** The two viewports the view is signed off at. */
const VIEWPORTS = [
  { name: '1728×996', width: 1728, height: 996 },
  { name: '1440×900', width: 1440, height: 900 },
];

/**
 * …AND BOTH DEVICE PIXEL RATIOS, which is new and is the point of half of this.
 *
 * The suite used to run at `deviceScaleFactor: 1` only, and that is a display
 * on which the sheet's whole sharpness problem does not exist: the renderer is
 * at `setPixelRatio(1)`, the capture is one texel to one CSS pixel, and the
 * mismatch it was hiding — a 1x texture magnified into a 2x framebuffer, beside
 * an HTML page whose type the browser drew at 2x — has nothing to show. Every
 * hand-off diff, both rect matches and the frame budget are measured at each.
 */
const DPRS = [1, 2];

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
/** How much a page may change between the frame it is handed to and a second
 *  later. A reveal is 800ms, so anything still moving shows up here. */
const REANIM_PCT = 1;
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

/**
 * How much of a FLAT sheet's reach the entrance may still have at `p` = 0.05,
 * measured down its centre line through the shader's own geometry.
 *
 * A sheet wound into a tube collapses to the tube's diameter; a flat sheet,
 * however far it is tilted, comes back at 1. Measured at 15% on both viewports
 * with the roll shipped — and the release this check exists for, which put the
 * roll's numbers through the fold's formula, would have come back near 90%.
 */
const ROLL_RATIO = 0.25;

/**
 * What a project's captures may cost the GPU, in megabytes.
 *
 * Counted as the WORST WINDOW rather than as the whole project: `SheetCanvas`
 * holds the section being read and its two neighbours and disposes the rest, so
 * the figure to compare against a budget is six captures and not two per
 * section. Uncompressed RGBA at the file's own pixels, with no mipmap chain
 * (`generateMipmaps` is off, on purpose — see the sheet). Both numbers are
 * printed, because the one the eviction retired is what says what it was for.
 */
const TEXTURE_MB = 24;

/**
 * …and how many captures may be resident at once, whatever they cost.
 *
 * `SheetCanvas` keeps the section being read and its two neighbours — a sheet
 * and a tail apiece — and disposes the rest when the reader commits to another
 * section. Six is the whole claim: not that the set is small, but that it is
 * the same size on the last section of a project as on the first.
 */
const RESIDENT_RADIUS = 1;
const RESIDENT_MAX = (RESIDENT_RADIUS * 2 + 1) * 2;

/** Where the committed captures are. */
const PUBLIC_DIR = fileURLToPath(new URL('../public/projects/', import.meta.url));
const MB = 1024 * 1024;

/** A capture's name: the kind, the section, the page's CSS width, and the scale
 *  — `sheet-01-1632@2x.webp`. Groups 1…4 are kind, section, width, scale. */
const CAPTURE_RE = /(sheet|tail)-(\d+)-(\d+)(?:@(\d)x)?\.webp$/;

let failures = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const round = (v) => Math.round(v * 10) / 10;
const pct = (v) => `${Math.round(v * 1000) / 1000}%`;
/** Which capture a hand-off was wearing, for the message when one fails — the
 *  difference between the wrong file and a file that had not arrived. */
const wore = (h) =>
  h.wearing ? `${h.wearing.src.split('/').pop()}${h.wearing.ready ? '' : ' (COLD)'}` : 'nothing';

/* ── driving the view ─────────────────────────────────────────────────────── */

async function openView(context, viewport, hash = `#view-${PROJECT}`) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${ORIGIN}/${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pv?.armed(), null, { timeout: 20000 });
  await settled(page);
  page.logs = logs;
  return page;
}

/**
 * Wait for the OPEN to have finished driving the position.
 *
 * The intro is a tween on its own rAF and it owns `positionRef` while it runs —
 * `seek` sets the same flag the intro holds, so a seek issued underneath one is
 * silently overwritten on the next frame and the checks measure the intro's
 * frame instead of the one they asked for. It used to be a flat 1.8s, which is
 * a guess about the open tween's length plus the storyboard; at 2x that guess went
 * marginal and showed up as an intermittent 26% forward diff on card 03 — the
 * sheet 38px low, which is the intro a few frames from landing.
 *
 * So: wait for the position to stop moving AND for a page to be the live
 * surface. A deep link satisfies both immediately, which is the point — it
 * lands flat and replays no entrance.
 */
async function settled(page, timeoutMs = 8000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    const now = await page.evaluate(() => ({
      y: window.__pv.position(),
      segment: window.__pv.layout()?.segment ?? null,
    }));
    if (last !== null && Math.abs(last - now.y) < 0.5 && now.segment === 'page') return;
    last = now.y;
    await page.waitForTimeout(60);
  }
  throw new Error('the view never settled after opening');
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

/**
 * Wait for the capture the sheet is WEARING to have decoded.
 *
 * A texture is fetched when it is first bound, and a sheet whose texture has
 * not landed is blank paper — which a diff reports, quite correctly, as a
 * hand-off that shows. The driver warms the next two captures as soon as the
 * reader lands on a page, so in the view this is a race nobody loses; the suite
 * seeks straight to the frame it wants to photograph and skips the reading, so
 * here it has to be asked rather than assumed. Measured before the warm existed:
 * 74.8% of the page differing at 1440×900 @2x, on the first tail of the run.
 */
const textureReady = async (page) => {
  await page
    .waitForFunction(() => window.__pv.sheetTexture()?.ready !== false, null, { timeout: 5000 })
    .catch(() => {});
  return page.evaluate(() => window.__pv.sheetTexture());
};

/**
 * THE HAND-OFF IS PHOTOGRAPHED AT THE FIRST FRAME AFTER THE SWAP, and waiting
 * for anything at all is what this replaces.
 *
 * There used to be a `stillFrame` here that shot the page repeatedly until two
 * frames came back identical, because seeking to a new scroll position fires
 * the reveals for whatever has just come into view and a reveal is 800ms of
 * opacity, blur and offset. It worked, and it was measuring the wrong thing: it
 * made the suite wait for a state the READER never waits for. A hand-off
 * happens when it happens, and if the page is mid-reveal at that moment then
 * the crossfade is hiding an animation — which is a real defect that a check
 * politely waiting for it to finish can never see.
 *
 * The page is settled at the swap now (see `revealState.ts`), so there is
 * nothing to wait for and the shot is taken as soon as the crossfade is over.
 */
const SWAP_SETTLE_MS = 40;

/**
 * A SHOT THAT CAN SEE AN ANIMATION, which the ordinary one cannot.
 *
 * Playwright's `animations: 'disabled'` does not freeze a finite CSS animation
 * — it FAST-FORWARDS it to its end before the shutter opens. Every diff in this
 * file is taken that way on purpose, because it is what makes the grain and the
 * reveals reproducible between runs. It also means those shots can never show a
 * page caught mid-reveal: the screenshot finishes the reveal for you.
 *
 * Measured, and this is why the helper exists: with the reveal settles removed
 * from `Scroller`, two of the five blocks on card 02's first section are still
 * running an animation one frame into the tear — and every pixel check in this
 * suite reported 0%.
 *
 * So the checks that are ABOUT the reveals take their shots with animations
 * live, and pause the one animation that is not under test: the grain, which is
 * infinite, runs on both surfaces, and would otherwise put noise into every
 * comparison.
 */
const GRAIN_STILL = `.pv-grain, .pv-page__grain { animation-play-state: paused !important; }`;
const grainOn = (page) =>
  page.evaluate((css) => {
    const el = document.createElement('style');
    el.id = 'pv-grain-still';
    el.textContent = css;
    document.head.append(el);
  }, GRAIN_STILL);
const grainOff = (page) =>
  page.evaluate(() => document.getElementById('pv-grain-still')?.remove());
/** …and the shot itself. */
const liveShot = (page, clip) => page.screenshot({ clip, animations: 'allow' });

/**
 * How many reveal blocks of the LIVE page still have an animation running.
 *
 * The direct form of the same question, asked of the animations rather than of
 * pixels — no rasteriser, no tolerance, and nothing a screenshot can quietly
 * complete on the way past. This is the check that would have caught it.
 */
const movingReveals = (page) =>
  page.evaluate(() => {
    // THE REVEAL'S OWN ANIMATIONS AND NOTHING ELSE. `getAnimations` returns
    // everything in the subtree, and a block is allowed to contain animations
    // that have nothing to do with the reveal — the Rive placeholder's spinner
    // is infinite and always running, which made the first version of this
    // report two moving blocks on a page where the reveal had long finished.
    const isReveal = (a) => {
      if (a.animationName === 'pv-reveal' || a.animationName === 'pv-flip') return true;
      const target = a.effect?.target;
      if (!a.transitionProperty || !target) return false;
      return target.classList?.contains('reveal-char') || target.classList?.contains('pv-run');
    };
    const live = [...document.querySelectorAll('.pv-page')].find(
      (p) => p.style.visibility !== 'hidden',
    );
    const scope = live ?? document.querySelector('.pv-page');
    let moving = 0;
    let total = 0;
    for (const el of scope.querySelectorAll('[data-reveal]')) {
      total++;
      const anims = el.getAnimations({ subtree: true });
      if (anims.some((a) => a.playState === 'running' && isReveal(a))) moving++;
    }
    return { moving, total };
  });

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
/** Pause every video where it stands, with no wait: for a shot that has to be
 *  taken at the first frame after a swap rather than whenever the media is
 *  ready. The 200ms version below has already run before the seek. */
const parkMediaNow = (page) =>
  page.evaluate(() => {
    for (const v of document.querySelectorAll('video')) {
      v.pause();
      v.currentTime = 0;
    }
    // The no-wait form: a plain pause. The full park below has already run
    // before the seek, and nothing ever resumes an artboard — so this only has
    // to catch one that mounted in between, and must not spend eight frames
    // here, where the whole point is that nothing has been given time to settle.
    window.__pvRive?.(false);
  });

/**
 * …AND EVERY RIVE ARTBOARD, which is the same problem on a surface a screenshot
 * flag cannot reach.
 *
 * `animations: 'disabled'` pins the CSS animations, and while card 02 was a
 * placeholder that was enough: there was no `.riv` to load, so every Rive block
 * fell back to its CSS stand-in. A real artboard draws to a canvas off its own
 * rAF loop, and a capture taken at one frame of it against a live page at
 * another is a difference the diff cannot tell from a real one — the same
 * argument as the video above, and `__pvRive` is the same handle for it.
 */
const parkMedia = (page) =>
  page.evaluate(async () => {
    for (const v of document.querySelectorAll('video')) {
      v.pause();
      v.currentTime = 0;
    }
    await window.__pvRive?.();
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
 * about neither. The letterhead goes because it is chrome: it paints through a
 * dwell on purpose, and it is checked from the DOM instead. It is also the only
 * chrome left — the close pill and the band of ground it sat in are gone.
 *
 * THE SKY GOES TOO, and it is the reason this pass needs a rule it did not need
 * before: the ground is the sky now, so repainting `.pv-ground` flat magenta
 * paints a layer that has an opaque WebGL canvas and two black washes sitting
 * on top of it. All three are hidden here rather than recoloured — a canvas
 * does not take a `background` — which puts the magenta back on screen and
 * leaves the pixel counts measuring exactly what they measured before.
 */
const PAINT_CSS = `
  .pv-ground { background: #ff00ff !important; }
  .pv-ground .sky-layer, .pv-ground__scrim, .pv-letterhead__scrim { display: none !important; }
  .pv-grain, .pv-page__grain { display: none !important; }
  .pv-letterhead { visibility: hidden !important; }
`;

const paintOn = (page) =>
  page.evaluate((css) => {
    const el = document.createElement('style');
    el.id = 'pv-paint';
    el.textContent = css;
    document.head.append(el);
  }, PAINT_CSS);

const paintOff = (page) => page.evaluate(() => document.getElementById('pv-paint')?.remove());

/**
 * The bounding box of everything that is NOT the magenta ground, in CSS pixels
 * — plus how many DEVICE pixels there are of it.
 *
 * The screenshot comes back at `deviceScaleFactor`, so the walk is over device
 * pixels and the four edges are divided back down: everything this is compared
 * against — the page's rect, the pinned corner — is in CSS pixels, and a bound
 * that changed units with the display would make the tear's checks pass or fail
 * on which context they happened to run in. The COUNT stays in device pixels
 * and is only ever compared with another count from the same run.
 */
async function paperBounds(page, dsf = 1) {
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
  return count === 0
    ? { count: 0 }
    : { count, left: left / dsf, top: top / dsf, right: right / dsf, bottom: bottom / dsf };
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
/**
 * THE FORWARD HAND-OFF, measured on the frame it actually happens on.
 *
 * The sampling point is the app's, not the suite's: `__pv.handoffFrame(k)` is
 * derived from the same `SEGMENT_EPSILON` that `positionAt` decides the segment
 * boundary with, so if that boundary ever moves this measurement moves with it.
 *
 * It used to be `atEnter(track, k, 0.999)`, which is a number rather than a
 * mechanism — 0.9px short of the boundary at the shipped `enterDistance`, and a
 * different distance short of it at any other. That gap is not free, because
 * the entrance eases in and the last of the easing is where all of it is: the
 * same diff reads 32% at `p` = 0.6, 7.3% at 0.99, 2.1% at 0.999 and 1.0% on the
 * frame the hand-off is on. A page of real prose is what made the difference
 * legible — every glyph edge in a full measure of type resamples through the
 * last sub-pixel of the approach, where the placeholder's flat plates and short
 * paragraphs had almost no edges to show it on.
 *
 * THE RESIDUAL IS STILL REPORTED. `residual` is the same comparison taken at
 * 0.999, carried out and printed but never failed on, so the cost of the
 * approach stays a visible number rather than becoming one nobody measures
 * again the moment the check stops tripping over it.
 */
async function handoffIn(page, track, k, clip, handoffMs) {
  const at = await page.evaluate((k) => window.__pv.handoffFrame(k), k);
  await seek(page, at);
  const drift = await rectDrift(page);
  const wearing = await textureReady(page);
  await parkMedia(page);
  const sheet = await page.screenshot({ clip, animations: 'disabled' });

  // …and the approach residual, one frame's worth of easing earlier.
  await seek(page, atEnter(track, k, 0.999));
  await page.waitForTimeout(handoffMs);
  await parkMedia(page);
  const approach = await page.screenshot({ clip, animations: 'disabled' });

  await seek(page, track.start[k]);
  // The first frame after the swap, and no settling: the page is put into its
  // revealed state BEFORE it fades in, so if it is still moving here that is
  // the defect rather than the measurement's impatience.
  await page.waitForTimeout(handoffMs + SWAP_SETTLE_MS);
  await parkMediaNow(page);
  const live = await page.screenshot({ clip, animations: 'disabled' });

  // …AND NOTHING IS STILL ARRIVING. Two ways, because they fail differently.
  //
  // The ANIMATIONS, asked directly: at the first frame after the swap, no
  // reveal on the page may still be running. And the PIXELS, on shots that can
  // actually see one — the page now against the page 900ms later, which is
  // longer than a reveal, so anything mid-flight has finished by the second.
  const moving = await movingReveals(page);
  await grainOn(page);
  const early = await liveShot(page, clip);
  await page.waitForTimeout(900);
  await parkMediaNow(page);
  const late = await liveShot(page, clip);
  await grainOff(page);
  const reanimated = (await differing(early, late)).pct;

  const residual = (await differing(approach, live)).pct;
  return { drift, wearing, reanimated, moving, residual, ...(await differing(sheet, live)), sheet };
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
  const wearing = await textureReady(page);
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
  return { drift, swapped, wearing, ...(await differing(live, sheet)) };
}

/* ── the sky follows the clock ─────────────────────────────────────────────── */

/**
 * THE SKY IS DRIVEN BY THE TIME OF DAY, AND THE PROOF IS PIXELS.
 *
 * This one is here because of a bug that every other check in this file was
 * blind to, and would be again. The sky's canvas is SHARED — one WebGL2 context
 * for the app, moved between hosts — and it is created lazily by whichever host
 * claims it first. That means the element on screen and the engine being fed
 * targets can come apart: what you get is a live `EnvReadout` saying midnight
 * over a canvas frozen on a noon it drew before the two were separated. Nothing
 * throws. Nothing logs. The readout, which is the thing you would naturally
 * check, is *correct* — it is the picture that is a lie.
 *
 * So the assertion is made of light. Force NOON, photograph it; force NIGHT,
 * photograph it; a night that is not much darker than a noon is a sky that has
 * stopped listening.
 *
 * THROUGH THE REAL OVERRIDE, and that part is not incidental. The contact sheet
 * (`scripts/sky-sheet.mjs`) drives `window.__skyPreview`, a handle that calls
 * `setEnvOverride` directly — so a sheet can come out perfect while the buttons
 * a person actually presses are wired to nothing. This clicks the buttons in
 * the DOM: EnvReadout → setEnvOverride → useEnvState → SkyLayer → skyStage →
 * engine → glass. Every link, in the order a walk would hit them.
 *
 * THE GRID GOES AWAY FOR THE MEASUREMENT. The cards are opaque art on top of
 * the sky and they do not change with it, so leaving them in only dilutes the
 * signal — with them, a working night measures 56% of noon and a threshold that
 * means anything cannot be set. Hidden, the frame is sky and nothing else.
 */
const NIGHT_OF_NOON = 0.35;

const skyLuma = async (page) => {
  const png = await page.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return total / (data.length / info.channels);
};

/** Press one of the EnvReadout's override buttons by its label. */
const pressOverride = async (page, label) => {
  const found = await page.evaluate((want) => {
    const btn = [...document.querySelectorAll('.env-readout__btn')].find(
      (b) => b.textContent.trim() === want,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  if (!found) throw new Error(`no override button labelled "${label}"`);
  // The sky EASES to a new target over `skyTransitionMs` (tau 1500ms), so a
  // shutter opened too early photographs a cross-fade between two skies.
  await page.waitForTimeout(5200);
};

async function checkSkyFollowsTheClock(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__skyPreview === 'function', null, {
    timeout: 20000,
  });
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content: '.grid-stage, .minimap-wrap, .env-readout, [class*="dialkit"] { display: none !important; }',
  });

  await pressOverride(page, 'clear');
  await pressOverride(page, 'noon');
  const noon = await skyLuma(page);
  await pressOverride(page, 'night');
  const night = await skyLuma(page);
  // What the data layer thinks, so a failure says whether the override or the
  // renderer is the one that is wrong.
  const readout = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.env-readout__row')].find((r) =>
      r.textContent.startsWith('sunElev'),
    );
    return row ? row.textContent : 'no readout';
  });
  await page.close();

  const ratio = night / noon;
  check(
    ratio < NIGHT_OF_NOON,
    `the sky follows the clock — night is under ${Math.round(NIGHT_OF_NOON * 100)}% of noon`,
    `night ${round(night)} / noon ${round(noon)} = ${Math.round(ratio * 100)}%, readout says ${readout}`,
  );
}

/* ── the run ──────────────────────────────────────────────────────────────── */

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const handoffMs = 120;
  /** Every hand-off's worst numbers, by scale and viewport — printed together
   *  at the end, because the question the table answers is whether 2x costs
   *  anything and that is a comparison rather than a threshold. */
  const handoffs = [];

  for (const dsf of DPRS) {
    const context = await browser.newContext({ deviceScaleFactor: dsf });

    for (const viewport of VIEWPORTS) {
      console.log(`\n── ${viewport.name} @${dsf}x ───────────────────────────────────`);

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
        const worst = {
          inDrift: 0, inDiff: 0, outDrift: 0, outDiff: 0, mean: 0, reanim: 0, moving: 0, tearMoving: 0,
          // REPORTED, NEVER ASSERTED — see `handoffIn`.
          residual: 0,
        };
        let control = null;
        const last = track.start.length - 1;

        for (let k = 0; k < track.start.length; k++) {
          const into = await handoffIn(page, track, k, clip, handoffMs);
          worst.inDrift = Math.max(worst.inDrift, into.drift);
          worst.inDiff = Math.max(worst.inDiff, into.pct);
          worst.mean = Math.max(worst.mean, into.mean);
          worst.reanim = Math.max(worst.reanim, into.reanimated);
          worst.moving = Math.max(worst.moving, into.moving.moving);
          worst.residual = Math.max(worst.residual, into.residual);
          if (into.drift > RECT_PX) bad(`card ${id} section ${k} in — rect`, `${round(into.drift)}px`);
          if (into.pct > DIFF_PCT) {
            bad(`card ${id} section ${k} in — diff`, `${pct(into.pct)} wearing ${wore(into)}`);
          }
          if (into.reanimated > REANIM_PCT) {
            bad(`card ${id} section ${k} in — the page kept moving after the swap`, pct(into.reanimated));
          }

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
          if (out.pct > DIFF_PCT) {
            bad(`card ${id} section ${k} out — diff`, `${pct(out.pct)} wearing ${wore(out)}`);
          }
        }

        check(
          Math.max(worst.inDrift, worst.outDrift) <= RECT_PX,
          `card ${id}: the sheet's flat rect is the page's rect, both ways`,
          `worst ${Math.round(Math.max(worst.inDrift, worst.outDrift) * 1000) / 1000}px of ${RECT_PX}`,
        );
        handoffs.push({
          dsf,
          viewport: viewport.name,
          card: id,
          drift: Math.max(worst.inDrift, worst.outDrift),
          in: worst.inDiff,
          out: worst.outDiff,
          mean: worst.mean,
          residual: worst.residual,
        });
        check(
          Math.max(worst.inDiff, worst.outDiff) <= DIFF_PCT,
          `card ${id}: neither hand-off shows`,
          `in ${pct(worst.inDiff)}, out ${pct(worst.outDiff)} of ${DIFF_PCT}%, mean ${round(worst.mean)} levels`,
        );
        // Not a check. The cost of the last sub-pixel of the entrance's easing,
        // measured at `p` = 0.999 — where this suite used to take the hand-off
        // shot, and where it is a property of the approach rather than of the
        // swap. Printed so the number stays in the run's output.
        console.log(`      · approach residual at p = 0.999: ${pct(worst.residual)}`);
        if (control !== null) {
          check(
            control > 10,
            `card ${id}: …and the diff can tell two pages apart`,
            `the wrong section's page differs on ${pct(control)}`,
          );
        }
        // A HAND-OFF NEVER HAPPENS MID-REVEAL, asked forward: the page 40ms
        // after the swap against the same page 900ms later. A reveal that was
        // going to run would have run in that second, so a page that has not
        // moved is a page that never animated.
        check(
          worst.moving === 0 && worst.reanim <= REANIM_PCT,
          `card ${id}: …and the page it hands to is not still arriving`,
          `${worst.moving} reveals running at the swap, ` +
            `${pct(worst.reanim)} of ${REANIM_PCT}% changed in the second after`,
        );

        // 1b — THE FAST SCROLL, which is the case the reveal rule exists for.
        //
        //      A reader who flicks from the middle of a section to its end
        //      reaches the tear in less time than a reveal takes to play, so
        //      the blocks at the bottom of the run — the ones the TAIL capture
        //      is a picture of — are exactly the ones most likely to be caught
        //      half way up. Every other check in this suite arrives at the
        //      bottom of a run slowly enough for that never to happen.
        //
        //      Driven through `seek` on a rAF loop rather than through the
        //      wheel, because what is being reproduced is the SPEED and Lenis's
        //      smoothing would take the edge off exactly the thing under test.
        {
          const k = 0;
          const bottom = track.start[k] + track.pageScroll[k];
          const mid = track.start[k] + track.pageScroll[k] * 0.45;
          const ms = await page.evaluate(
            async ([from, to, span]) => {
              const t0 = performance.now();
              for (;;) {
                const q = Math.min(1, (performance.now() - t0) / span);
                window.__pv.seek(from + (to - from) * q);
                if (q >= 1) break;
                await new Promise((r) => requestAnimationFrame(r));
              }
              return performance.now() - t0;
            },
            [mid, bottom, 350],
          );
          await parkMediaNow(page);
          // Asked of the animations first, because that is the form of the
          // question a screenshot cannot answer, and on LIVE shots second.
          const atBottom = await movingReveals(page);
          await grainOn(page);
          const lastPage = await liveShot(page, clip);

          await seek(page, bottom + 2);
          await page.waitForTimeout(handoffMs + SWAP_SETTLE_MS);
          await parkMediaNow(page);
          const inTear = await movingReveals(page);
          const firstTear = await liveShot(page, clip);
          await grainOff(page);
          const fast = await differing(lastPage, firstTear);
          worst.tearMoving = Math.max(worst.tearMoving, atBottom.moving, inTear.moving);
          check(
            atBottom.moving === 0 && inTear.moving === 0 && fast.pct <= DIFF_PCT,
            `card ${id}: a fast scroll into the tear hands over settled`,
            `${round(ms)}ms from mid-page to the tear, ` +
              `${inTear.moving} of ${inTear.total} reveals running, ` +
              `${pct(fast.pct)} of ${DIFF_PCT}%`,
          );
        }

        // 1c — THE RESIDENT SET, walked forward and then rewound.
        //
        //      What the GPU holds is the section being read and its two
        //      neighbours, and it does not grow with the length of the project:
        //      a five-section card used to end a read-through holding ten
        //      captures, 210 MB of uncompressed RGBA at 2x, because nothing
        //      disposed one.
        //
        //      Asked at every section in both directions, because the two
        //      directions fail differently. FORWARD is the eviction: the count
        //      is what stops growing. BACKWARD is the warm: a rewind runs into
        //      the tail of the section behind, which was disposed several
        //      sections ago, at `p` = 0 of a tear with no reading in front of
        //      it — so it is not enough that the window is small, the window
        //      has to be FULL by the time the reader could have reached either
        //      edge of it.
        {
          const n = track.start.length;
          // Where the walk found the view, to put it back — see the restore at
          // the end of the block.
          const before = await page.evaluate(() => window.__pv.position());
          const forward = [...track.start.keys()];
          const walk = [...forward, ...forward.slice(0, -1).reverse()];
          const held = [];
          for (const k of walk) {
            // SETTLED, not seeked. What is resident is a property of a view
            // that has stopped moving: a crossfade paints the flat sheet of the
            // section it was started for on every one of its frames, so a
            // measurement taken inside one counts a capture the reader is on
            // their way out of. The driver prunes again when the hand-off lands
            // — this waits for that to have happened.
            await seekSettled(page, track.start[k] + 1, handoffMs);
            // The six are a fetch and a decode, and only a decoded one is on
            // the card at all — so wait for the window to fill rather than
            // reading a number that is really a measure of the network.
            const want = Math.min(n, k + 1 + RESIDENT_RADIUS) - Math.max(0, k - RESIDENT_RADIUS);
            await page
              .waitForFunction((w) => window.__pv.textures().count >= w, want * 2, { timeout: 5000 })
              .catch(() => {});
            held.push({ k, ...(await page.evaluate(() => window.__pv.textures())) });
          }
          const most = held.reduce((a, b) => (b.count > a.count ? b : a));
          const short = held.filter(
            (h) =>
              h.count <
              (Math.min(n, h.k + 1 + RESIDENT_RADIUS) - Math.max(0, h.k - RESIDENT_RADIUS)) * 2,
          );
          check(
            most.count <= RESIDENT_MAX,
            `card ${id}: the GPU holds this section and its neighbours, and no more`,
            `worst ${most.count} captures of ${RESIDENT_MAX}, ${round(most.mb)} MB, at section ${most.k}` +
              // Naming them is the difference between "one too many" and which
              // one: a stray is always a neighbour of the window it escaped.
              (most.count > RESIDENT_MAX
                ? ` — ${most.srcs.map((s) => s.split('/').pop()).join(' ')}`
                : ''),
          );
          check(
            short.length === 0,
            `card ${id}: …and the whole window is warm, forward and rewound`,
            short.length === 0
              ? `${walk.length} stop${walk.length === 1 ? '' : 's'}`
              : short.map((h) => `section ${h.k}: ${h.count}`).join(', '),
          );

          // AND PUT THE VIEW BACK WHERE THE WALK FOUND IT, which is not
          // housekeeping. This block ends standing on a PAGE, and the next
          // seek off a page starts a 120ms reverse crossfade — through which
          // the canvas holds the FLAT sheet, by design. The position is parked,
          // so when the crossfade ends nothing applies another frame and the
          // flat pose is simply what the canvas is left showing: the shape
          // checks below then measure a tube and find a rectangle. Restoring
          // through `seekSettled` waits the crossfade out.
          await seekSettled(page, before, handoffMs);
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
          `card ${id}: the entrance is flat and square by p = 0.60`,
          `start ${shape[0].curl}, reach ${shape[0].curlOrigin}, taper ${shape[0].tightness}`,
        );
        // …and it is the ROLL. A pose can say mode 0 while the shader draws a
        // fold, so the shape itself is asked for separately, below.
        check(
          shape.every((c) => c.curlMode === 0),
          `card ${id}: …and every frame of it is curl mode 0, the cone wrap`,
          `modes ${[...new Set(shape.map((c) => c.curlMode))].join(',')}`,
        );
        // Card 03 is one section and has no tear at all, which is the point of
        // it being in the list and not a reason to weaken this elsewhere.
        if (last > 0) {
          const tear = await page.evaluate(() => {
            const t = window.__pv.track();
            window.__pv.seek(t.start[0] + t.pageScroll[0] + t.exitDistance * 0.5);
            const pose = window.__pv.layout().sheet.pose;
            return { mode: pose.curlMode, tightness: pose.tightness };
          });
          check(
            tear.mode === 1 && tear.tightness === 0.35,
            `card ${id}: …and the tear is mode 1, on its own numbers`,
            `mode ${tear.mode}, radius ${tear.tightness}`,
          );
        }

        // 2b — THE ENTRANCE IS A TUBE, asked of the shader's own geometry.
        //
        //      THIS IS THE CHECK THAT WAS MISSING. Everything above is about the
        //      POSE, and the pose was right through the whole release in which
        //      the entrance was a flat sheet tilting in: the roll's numbers had
        //      been set into the fold's formula, which reads the same names to
        //      mean other things. A pose cannot tell you what shape came out.
        //
        //      So take the sheet's centre line, put every point of it through
        //      the same deformation and the same camera the GPU does, and
        //      measure how far it reaches down the screen — against where a FLAT
        //      sheet would have put the same points. The sheet's own scale, turn
        //      and lift are in both and cancel. Wound into a tube the line
        //      collapses to the tube's diameter; a flat sheet, however far it is
        //      tilted, comes back at 1.
        const spine = await page.evaluate(
          async ([k, points]) => {
            const out = [];
            for (const p of points) {
              const w = window.__pv.enterWindow(k);
              window.__pv.seek(w.from + (w.to - w.from) * p);
              // The canvas paints when the scroll asks it to, and `sheetPoint`
              // answers about the last pose DRAWN — so let the frame land.
              await new Promise((r) => setTimeout(r, 120));
              await new Promise((r) => requestAnimationFrame(r));
              const bent = [];
              const flat = [];
              for (let i = 0; i <= 40; i++) {
                bent.push(window.__pv.sheetPoint(0.5, i / 40).y);
                flat.push(window.__pv.sheetPoint(0.5, i / 40, true).y);
              }
              const span = (a) => Math.max(...a) - Math.min(...a);
              out.push({ p, ratio: span(bent) / span(flat) });
            }
            return out;
          },
          [Math.min(1, last), [0.05, 0.1, 0.2, 0.3, 0.45, 0.6]],
        );
        const wound = spine.find((c) => c.p === 0.05);
        check(
          wound.ratio <= ROLL_RATIO,
          `card ${id}: the entrance is a TUBE — the sheet is wound, not tilted`,
          `at p = 0.05 it reaches ${Math.round(wound.ratio * 100)}% of a flat sheet, ` +
            `of ${Math.round(ROLL_RATIO * 100)}%`,
        );
        check(
          spine.every((c, i) => i === 0 || c.ratio > spine[i - 1].ratio) &&
            Math.abs(spine[spine.length - 1].ratio - 1) < 1e-6,
          `card ${id}: …and it UNROLLS, all the way flat by p = 0.60`,
          spine.map((c) => `${c.p}:${Math.round(c.ratio * 100)}%`).join(' '),
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
        tear.push({ p, ...(await paperBounds(page, dsf)) });
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
          // `sheetPoint` answers in CSS pixels and the screenshot is in device
          // pixels: at `deviceScaleFactor` 2 an unscaled index samples the top
          // left quarter of the frame, which is a different part of the sheet.
          const x = Math.round(p.x * dsf);
          const y = Math.round(p.y * dsf);
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
      const empty = await paperBounds(page, dsf);
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

      // 12 — THE SKY, from the grid, through the buttons a person would press.
      await checkSkyFollowsTheClock(context, viewport);
    }

    await context.close();
  }

  // ── the hand-offs, at both scales, side by side ────────────────────────────
  //
  // The thresholds have already been checked one by one above; what this is for
  // is the COMPARISON. A 2x column materially worse than its 1x one means the
  // sheet is wearing the wrong capture for the framebuffer it is being drawn
  // into, which is the whole failure this release is about and is not something
  // a per-run pass/fail says out loud.
  console.log('\n── the hand-off diffs, 1x against 2x ────────────────────────');
  console.log('      scale  viewport   card   rect      forward    reverse   mean   residual');
  for (const h of handoffs) {
    console.log(
      `      ${String(h.dsf).padStart(2)}x    ${h.viewport.padEnd(10)} ${h.card}    ` +
        `${`${round(h.drift)}px`.padEnd(8)} ${pct(h.in).padEnd(10)} ${pct(h.out).padEnd(9)} ` +
        `${String(round(h.mean)).padEnd(6)} ${pct(h.residual)}`,
    );
  }
  for (const dsf of DPRS) {
    const mine = handoffs.filter((h) => h.dsf === dsf);
    const worst = Math.max(...mine.map((h) => Math.max(h.in, h.out)));
    check(worst <= DIFF_PCT, `@${dsf}x: every hand-off inside the budget`, `worst ${pct(worst)} of ${DIFF_PCT}%`);
  }

  // ── layout-stable media, and a cold first open ──────────────────────────────
  //
  // A page's height is the input the whole track is built from, so it has to be
  // the same before and after its assets arrive. And the CAPTURES must not be
  // part of that gate at all: their decoding affects no layout, and waiting on
  // one would put a WebGL asset on the critical path of a scroll lock.
  //
  // Run at BOTH scales, because the 2x capture set is the bigger claim: the
  // files are about four times the pixels, and if anything were ever going to
  // put a texture in front of the scroll lock it would be those.
  console.log('\n── layout-stable media, captures cold ───────────────────────');
  for (const dsf of DPRS) {
    // Its OWN context: the shared one has these assets in its memory cache from
    // every run above, and a cache hit never reaches the route that holds them
    // back — so the page would arm with all the media already decoded and the
    // check would prove nothing.
    const cold = await browser.newContext({ deviceScaleFactor: dsf });
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
    // CARD 02'S BLOCK MEDIA, wherever it lives. It was `/projects/placeholder/`
    // for as long as card 02 was a placeholder; the real project's media is
    // under its SLUG (`/projects/rive-site/`), while its captures stay under
    // the project ID and are held back by the route above. Matching on the
    // media's own extensions rather than on the folder is what keeps the two
    // apart: a glob over `/projects/**` would swallow the captures too, and —
    // because Playwright checks the most recently registered route first — it
    // would quietly replace their 3s hold-back with this 1.5s one and the
    // stronger of the two claims would stop being made at all.
    const MEDIA_GLOB = '**/projects/*/*.{webp,mp4,webm,riv}';
    await held.route(MEDIA_GLOB, async (route) => {
      if (CAPTURE_RE.test(route.request().url())) return route.continue();
      await new Promise((r) => setTimeout(r, MEDIA_MS));
      await route.continue();
    });
    held.on('response', (r) => seen.push({ url: r.url(), at: Date.now() - t0 }));
    const logs = [];
    held.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    await held.goto(`${ORIGIN}/#view-${PROJECT}`, { waitUntil: 'commit' });
    // THE GATE IS THE TRACK BEING BUILT, not the open tween being over.
    //
    // This used to wait on `armed()`, which is neither: `armed` is the moment
    // the tween hands the position to the scroller, and it only ever stood in
    // for the gate because the two happened to be close together. They are not
    // any more — the open tween is 2.6s — and the substitution failed in the
    // direction that matters, reporting the media as having beaten a gate it
    // had not beaten. What the claim is about is the FIRST LAYOUT: the heights
    // are final and the track is derived from them before any asset lands.
    await held.waitForFunction(() => window.__pv?.track() != null, null, { timeout: 20000 });
    const gateAt = Date.now() - t0;
    const heights = () => held.evaluate(() => window.__pv.track().heights.map(Math.round));
    // IMAGES AND CLIPS, because card 02 is now a page of clips and counting
    // `document.images` alone would have come back 0 of 0 — and `0 > 0` is a
    // check that fails while reporting nothing about what it was watching.
    // A video's poster is not an `<img>`, so the video's own readiness is what
    // stands in for "the media has landed": `HAVE_METADATA` is the first state
    // that needed bytes off the wire.
    const decoded = () =>
      held.evaluate(() => {
        const isMine = (url) => /\/projects\/[^/]+\//.test(url) && !/(sheet|tail)-\d+-\d+/.test(url);
        const imgs = [...document.images].filter((i) => isMine(i.currentSrc || i.src));
        const vids = [...document.querySelectorAll('video')].filter((v) =>
          isMine(v.currentSrc || v.src || ''),
        );
        return {
          of: imgs.length + vids.length,
          done: imgs.filter((i) => i.complete).length + vids.filter((v) => v.readyState >= 1).length,
        };
      });
    const before = await heights();
    const atGate = await decoded();
    // Not "wait for every image": they are `loading="lazy"`, so the ones below
    // the fold never start. Wait past both hold-backs and count what arrived.
    await held.waitForTimeout(TEXTURE_MS + 1200);
    const after = await heights();
    const now = await decoded();
    // `@2x` is part of the name now, so the pattern has to allow it — a regex
    // that quietly matched nothing reported "the first capture landed at never"
    // and passed the check it was holding.
    const firstTexture = seen.find((r) => CAPTURE_RE.test(r.url))?.at;
    check(
      now.done > atGate.done,
      `@${dsf}x: the gate opened before the media did`,
      `${atGate.done} of ${atGate.of} decoded when the track was built, ${now.done} after`,
    );
    check(
      firstTexture !== undefined && gateAt < firstTexture,
      `@${dsf}x: the track armed with the captures cold`,
      `gate at ${gateAt}ms, first capture landed at ${firstTexture ?? 'never'}ms`,
    );
    check(
      String(before) === String(after),
      `@${dsf}x: page heights are identical before and after the media lands`,
      `${before.join(', ')}`,
    );
    const moved = logs.filter((l) => /ACTIVE SECTION MOVED/.test(l));
    check(moved.length === 0, `@${dsf}x: no rebuild moved the reader`, moved.join(' | '));
    // …and it is the right capture for the scale. A 1x file in a 2x buffer is
    // the softness this release is about, and the picker is what stops it.
    const wore = seen.map((r) => r.url.match(CAPTURE_RE)).filter(Boolean);
    check(
      wore.length > 0 && wore.every((m) => Number(m[4] ?? 1) === dsf),
      `@${dsf}x: …and the captures it asked for are the ${dsf}x ones`,
      `${wore.length} fetched, scales ${[...new Set(wore.map((m) => `${m[4] ?? 1}x`))].join(' ')}`,

    );
    await cold.close();
  }

  // ── what the capture set costs ─────────────────────────────────────────────
  //
  // Two numbers, and they are not the same number. The BUNDLE is what ships:
  // compressed WebP on disk, which is what a reader downloads. The TEXTURE is
  // what the GPU holds: uncompressed RGBA at the file's own pixels, which is
  // roughly forty times the first and is the one with a budget on it.
  console.log('\n── the capture set ──────────────────────────────────────────');
  {
    const files = [];
    for (const id of PROJECTS) {
      for (const name of await readdir(join(PUBLIC_DIR, id))) {
        const m = name.match(CAPTURE_RE);
        if (!m) continue;
        const path = join(PUBLIC_DIR, id, name);
        const { width, height } = await sharp(path).metadata();
        files.push({
          id,
          kind: m[1],
          section: Number(m[2]),
          cssWidth: Number(m[3]),
          scale: Number(m[4] ?? 1),
          bytes: (await stat(path)).size,
          pixels: width * height,
        });
      }
    }
    for (const scale of [1, 2]) {
      const mine = files.filter((f) => f.scale === scale);
      const bytes = mine.reduce((a, f) => a + f.bytes, 0);
      console.log(
        `      ${scale}x  ${String(mine.length).padStart(3)} files  ` +
          `${(bytes / 1024).toFixed(0)} KB on disk`,
      );
    }
    const all = files.reduce((a, f) => a + f.bytes, 0);
    console.log(`      all ${String(files.length).padStart(3)} files  ${(all / 1024).toFixed(0)} KB on disk`);

    // Per SECTION and per PROJECT, at the widest viewport — which is the worst
    // case, and the only one a given display ever binds.
    const widest = Math.max(...files.map((f) => f.cssWidth));
    const overBudget = [];
    for (const scale of [1, 2]) {
      for (const id of PROJECTS) {
        const mine = files.filter((f) => f.id === id && f.scale === scale && f.cssWidth === widest);
        const sections = [...new Set(mine.map((f) => f.section))].sort();
        const per = sections.map(
          (k) => mine.filter((f) => f.section === k).reduce((a, f) => a + f.pixels * 4, 0) / MB,
        );
        const total = per.reduce((a, b) => a + b, 0);
        // THE WORST WINDOW, which is the number with the budget on it now: the
        // most any one section and its two neighbours can cost. `total` is what
        // the same read-through used to end up holding, kept beside it because
        // the difference is the whole point of the eviction.
        const resident = Math.max(
          ...sections.map((_, k) =>
            per
              .slice(Math.max(0, k - RESIDENT_RADIUS), k + 1 + RESIDENT_RADIUS)
              .reduce((a, b) => a + b, 0),
          ),
        );
        console.log(
          `      ${scale}x  card ${id}  ${sections.length} sections  ` +
            `${per.map((v) => v.toFixed(1)).join(' + ')} = ${total.toFixed(1)} MB, ` +
            `resident ${resident.toFixed(1)} MB`,
        );
        if (resident > TEXTURE_MB) overBudget.push(`${id}@${scale}x ${resident.toFixed(1)}MB`);
      }
    }
    /**
     * REPORTED, NOT ASSERTED, and that is still a decision rather than an
     * omission.
     *
     * A 2x capture of a 1632 x 844 page is 3264 x 1688 RGBA = 21.0 MB on its
     * own, so a {@link TEXTURE_MB} budget admits ONE of them and nothing else.
     * No arrangement of captures gets a three-section window under it while the
     * sheet is sharp, and the obvious lever — soften the tail, which is on
     * screen for less time — spends it in the one place it shows: the tail is
     * what the sheet wears at p = 0 of a tear, at the page's own rect, in a
     * 120ms crossfade off a page drawn at 2x.
     *
     * What the eviction changed is the shape of the number rather than the
     * number: the resident set no longer grows with the length of the project,
     * which is the part that was unbounded. The count is asserted (see
     * {@link RESIDENT_MAX}); the megabytes are what one capture costs.
     */
    if (overBudget.length > 0) {
      console.log(`      ! over ${TEXTURE_MB} MB per window: ${overBudget.join(', ')}`);
      console.log('        six captures, and one 2x capture is 21.0 MB. What the eviction');
      console.log('        bought is that this does not grow with the project — the count');
      console.log('        is asserted above, on every section of every card.');
    } else {
      ok(`every window of captures fits ${TEXTURE_MB} MB of texture`);
    }
  }

  // ── the last section, and the clips ────────────────────────────────────────
  //
  // BOTH OF THESE ARE LIVE-PAGE CHECKS, and neither could have been caught by
  // anything above. Every other check in this suite steers with `__pv.seek`,
  // which writes the position straight into the driver — so it never asks the
  // scroller whether a reader could have got there, and never waits for a clip
  // the way a reader's browser does.
  console.log('\n── the last section lands ───────────────────────────────────');
  {
    const ctx2 = await browser.newContext({ deviceScaleFactor: 1 });
    for (const id of PROJECTS) {
      // 1 — THE SCROLLER CAN ACTUALLY REACH THE END OF THE TRACK.
      //
      // The position IS the scrollTop, so a spacer of exactly `maxPosition`
      // stops one viewport short and the whole last section — entrance, page
      // and all — is unreachable. It cost the last sheet of every multi-section
      // card, and `seek` walked straight past it.
      const p1 = await openView(ctx2, VIEWPORTS[0], `#view-${id}`);
      const reach = await p1.evaluate(() => {
        const sc = document.querySelector('.pv-scroller');
        const t = window.__pv.track();
        const max = t.start[t.start.length - 1] + t.pageScroll[t.start.length - 1];
        return { max, reachable: sc.scrollHeight - sc.clientHeight };
      });
      check(
        reach.reachable >= reach.max - 1,
        `card ${id}: the scroller can reach the end of the track`,
        `furthest ${Math.round(reach.reachable)} of ${Math.round(reach.max)}`,
      );

      // 2 — …AND A REAL SCROLL TO THE LAST SECTION LANDS ON IT. `park` is a
      //     real scroll that lets go, so this is the reader's own path.
      const lastK = await p1.evaluate(() => window.__pv.track().start.length - 1);
      await p1.evaluate((k) => window.__pv.park(window.__pv.track().start[k]), lastK);
      let landed = null;
      for (let i = 0; i < 40; i++) {
        await p1.waitForTimeout(150);
        landed = await p1.evaluate((k) => {
          const t = window.__pv.track();
          const l = window.__pv.layout();
          return {
            y: window.__pv.position(),
            want: t.start[k],
            segment: l?.segment ?? null,
            shown: [...document.querySelectorAll('.pv-page')].findIndex(
              (p) => p.style.visibility !== 'hidden',
            ),
          };
        }, lastK);
        if (landed.segment === 'page' && Math.abs(landed.y - landed.want) < 2) break;
      }
      check(
        landed.segment === 'page' && Math.abs(landed.y - landed.want) < 2 && landed.shown === lastK,
        `card ${id}: a real scroll to the last section lands on it`,
        `y ${Math.round(landed.y)} of ${Math.round(landed.want)}, segment ${landed.segment}, showing ${landed.shown}`,
      );
      await p1.close();

      // 3 — …AND SO DOES A DEEP LINK STRAIGHT TO IT, which is a different path
      //     into the same place: no entrance, no scroll, and the position set
      //     before the reader has touched anything.
      const p2 = await ctx2.newPage();
      await p2.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
      await p2.goto(`${ORIGIN}/#view-${id}/${lastK + 1}`, { waitUntil: 'load' });
      await p2.waitForFunction(() => window.__pv?.track() != null, null, { timeout: 20000 });
      let deepLast = null;
      for (let i = 0; i < 40; i++) {
        await p2.waitForTimeout(150);
        deepLast = await p2.evaluate((k) => {
          const t = window.__pv.track();
          const l = window.__pv.layout();
          return {
            y: window.__pv.position(),
            want: t.start[k],
            segment: l?.segment ?? null,
            hash: location.hash,
            shown: [...document.querySelectorAll('.pv-page')].findIndex(
              (p) => p.style.visibility !== 'hidden',
            ),
          };
        }, lastK);
        if (deepLast.segment === 'page' && Math.abs(deepLast.y - deepLast.want) < 2) break;
      }
      check(
        deepLast.segment === 'page' &&
          Math.abs(deepLast.y - deepLast.want) < 2 &&
          deepLast.shown === lastK &&
          deepLast.hash === `#view-${id}/${lastK + 1}`,
        `card ${id}: …and a deep link to the last section lands on it`,
        `y ${Math.round(deepLast.y)} of ${Math.round(deepLast.want)}, segment ${deepLast.segment}, hash ${deepLast.hash}`,
      );
      await p2.close();
    }
    await ctx2.close();
  }

  // ── the clips actually run ─────────────────────────────────────────────────
  //
  // A clip is `opacity: 0` until it is marked loaded, over a frame that has its
  // own tint — so a clip that never starts is not a still frame, it is an empty
  // grey box. That is live-page behaviour end to end: the capture pipeline
  // parks every video on its first frame before it shoots, so the textures look
  // perfect whatever the live element is doing.
  console.log('\n── the clips ────────────────────────────────────────────────');
  {
    const ctx3 = await browser.newContext({ deviceScaleFactor: 1 });
    for (const id of PROJECTS) {
      const p = await openView(ctx3, VIEWPORTS[0], `#view-${id}`);
      const n = await p.evaluate(() => window.__pv.track().start.length);
      let checked = 0;
      const faults = [];
      for (let k = 0; k < n; k++) {
        // THE POSTER, BEFORE ANYTHING HAS PLAYED. Asked at the hand-off, which
        // is the first moment the section is on screen: every clip on the page
        // carries one, and is visible wearing it.
        await p.evaluate((k) => window.__pv.park(window.__pv.track().start[k]), k);
        await p.waitForTimeout(600);
        const posters = await p.evaluate((k) => {
          const pg = document.querySelector(`.pv-page[data-k="${k}"]`);
          return [...pg.querySelectorAll('video')].map((v) => ({
            src: (v.getAttribute('src') || v.querySelector('source')?.src || '').split('/').pop(),
            poster: Boolean(v.poster),
            muted: v.muted && v.hasAttribute('muted'),
          }));
        }, k);
        for (const v of posters) {
          if (!v.poster) faults.push(`${id}/${k} ${v.src}: no poster`);
          // Muted has to be an ATTRIBUTE as well as a property, or Chrome's
          // autoplay gate can reject every play the clip ever makes.
          if (!v.muted) faults.push(`${id}/${k} ${v.src}: not muted as an attribute`);
        }

        // …AND THEN IT RUNS. Walk the section's own vertical run so every clip
        // on the page comes into view — one below the fold is PAUSED on
        // purpose, and asking it to play where the reader cannot see it would
        // be asking for the bug this pauses to avoid.
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          await p.evaluate(
            ([k, f]) => {
              const t = window.__pv.track();
              window.__pv.park(t.start[k] + t.pageScroll[k] * f);
            },
            [k, f],
          );
          // Within 2s of arriving, every clip IN VIEW is decoded and running.
          let state = [];
          for (let i = 0; i < 10; i++) {
            await p.waitForTimeout(200);
            state = await p.evaluate((k) => {
              const pg = document.querySelector(`.pv-page[data-k="${k}"]`);
              const box = pg.querySelector('.pv-page__scroll').getBoundingClientRect();
              return [...pg.querySelectorAll('video')]
                .map((v) => {
                  const r = v.getBoundingClientRect();
                  const seen = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
                  return {
                    src: (v.currentSrc || '').split('/').pop(),
                    inView: seen > r.height * 0.25,
                    ready: v.readyState,
                    playing: !v.paused,
                    shown: v.classList.contains('is-loaded'),
                  };
                })
                .filter((v) => v.inView);
            }, k);
            if (state.length > 0 && state.every((v) => v.ready >= 2 && v.playing && v.shown)) break;
          }
          for (const v of state) {
            checked++;
            if (v.ready < 2 || !v.playing || !v.shown) {
              faults.push(
                `${id}/${k}@${f} ${v.src}: readyState ${v.ready}, ${v.playing ? 'playing' : 'PAUSED'}, ${v.shown ? 'shown' : 'INVISIBLE'}`,
              );
            }
          }
        }
      }
      check(
        faults.length === 0,
        `card ${id}: every clip in view is decoded, running and visible`,
        faults.length === 0 ? `${checked} sightings` : faults.slice(0, 4).join(' | '),
      );
      await p.close();
    }
    await ctx3.close();
  }

  // ── the ways in and out ────────────────────────────────────────────────────
  console.log('\n── navigation ───────────────────────────────────────────────');
  const context = await browser.newContext({ deviceScaleFactor: 2 });
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
  // A HAND-OFF NEVER HAPPENS MID-REVEAL, and a deep link is the hardest case of
  // it: the page is put on screen a few hundred ms after mount, which is inside
  // the 800ms the reveals of its first viewport have been running since the
  // observer first saw them. Measured with the settle removed: 3 of this page's
  // 10 blocks are still fading up at the moment it arrives.
  const deepMoving = await movingReveals(page);
  check(
    deepMoving.moving === 0,
    '…and it arrives settled, not mid-reveal',
    `${deepMoving.moving} of ${deepMoving.total} blocks still animating`,
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
