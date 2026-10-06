/**
 * The detail view's paper, in Chrome. `npm run verify:detail` with the dev
 * server running (`npm run dev`; `--url` for another origin, `--only
 * rects,identity,handoff,sprites,registration,routes,nav,leave,frames,reduced,life,arrival,sidescale,layout`
 * for a subset). `--only arrival` also runs against a production build
 * (`vite preview`): it needs none of the dev hooks.
 *
 * Every check is about what the browser DRAWS, which no unit test can answer:
 *
 *   rects      every on-screen plane (hero + both neighbours), as three.js
 *              projects it, against the DOM panel's getBoundingClientRect — at
 *              1728×996 and 1440×900, 1× and 2×. The hero is also checked against
 *              the hero rect's own CSS variables (hero.ts is the source of truth).
 *   identity   every effect forced to 0: the canvas against the DOM image it
 *              replaces, inside each card: ≤ 0.5% of pixels, both viewports,
 *              both ratios — except card 01, on its own budget (CARD01_IDENTITY).
 *   handoff    (cards 01, 02 — the live cover's transparent hero — and 04)
 *              IN: the last DOM frame against the canvas once it has the cards;
 *              OUT: the canvas at the end of the reverse crossfade against the DOM
 *              it hands back to. Both ≤ 2%, inside the cards (card 01: its
 *              identity budget, since at presence 0 a hand-off IS the identity).
 *   sprites    at #item-01 with the canvas carrying the cover, hovering a
 *              CoverAnimLayer object still mounts and plays its animation, and
 *              the point under the pointer is never the canvas.
 *   registration  at rest, nothing hovered, the hero plane's vertex terms —
 *              ripple, dent, squash, fold — are all exactly 0, so the plate sits
 *              where the DOM sprites over it expect (`heroRipple` 0); the
 *              neighbours keep `ripple`; hovering the hero still dents it, and
 *              leaving takes the dent back to 0.
 *   routes     card 01's cover registers the same however it is reached: a cold
 *              load of #item-01, Prev from #item-02, Next from #item-04, and
 *              01 → 02 → 01. On each, at 1× and 2×: every sprite's rect against
 *              the cold load's, ≤ 1px; every sprite against where the PLATE puts
 *              it — the paper plane's rect, the manifest's displayRect, fitted
 *              as the layer fits it — ≤ 0.5px; and the boil check (plate and
 *              sprites moving together, as in `life`). The layer used to size
 *              its sprites from a bounding rect taken while the arriving panel
 *              was still scaling up, and kept them 6% small; the boil check
 *              alone cannot see that, since it predicts from the sprites' own px.
 *   nav        Next / Prev (including the wrap) land with the hash, the jump
 *              list, the centre panel and the centre PLANE agreeing.
 *   leave      Read issue and Close: the canvas hands the cards back
 *              (on → out → dom) BEFORE the hash moves, so the doorway and the exit
 *              morph start from the DOM; and it takes them again after the reader.
 *   frames     rAF intervals across a Prev slide and across a hover sweep, 1× and
 *              2×: no frame over 20ms.
 *   reduced    prefers-reduced-motion: with the pointer on the hero, two frames
 *              two seconds apart are identical inside the cards.
 *   life       COVER LIFE on the hero (src/reader/coverLife.ts), 1× and 2×:
 *              hovering the page — a point on no object — has all 20 objects
 *              playing within 200ms; during the boil, sampled 10 times, every
 *              DOM sprite sits where the PLATE's own transform (the paper's
 *              uniforms) puts it, to ≤ 0.5px; the canvas plate held boiled
 *              matches the DOM plate boiled the same way, in pixels; no frame
 *              over 20ms; leaving, each object is home within its pass + stagger
 *              + fade, and then nothing is moved at all. Under reduced motion
 *              the objects still play and nothing boils. Writes
 *              docs/detail-paper/boil-steps.webp (two consecutive steps).
 *   arrival    the frame timeline from the tile click (or the navigation) to
 *              the settled hero, for every card, both routes — the grid tile's
 *              click (the morph) and a direct #item-NN — cold (the first
 *              arrival after the page loads) and warm (the second), at
 *              1728×996 @2×, the pointer moving throughout: no frame over two
 *              vsyncs (33.4 ms), p95 one vsync (16.8 ms). Each long frame is
 *              printed with what ran in it (Long Animation Frames, and the
 *              paper's own `paper:*` measures in a dev build). And the WebGL
 *              contexts: counted in the grid and in the detail view, and no
 *              more after the second arrival than after the first. The four
 *              COLD DIRECT rows are informational (printed with ·, never a
 *              failure): a cold direct load is the page's load, and its dropped
 *              frames are there with the paper removed (docs/detail-paper.md,
 *              "The arrival"). The other twelve are enforced.
 *   sidescale  detailSideScale swept across its whole range (0.3 → 1 → 0.3)
 *              at #item-04, the pointer moving on the hero: at every value the
 *              paper hands the cards back in, its hero plane is card 04's live
 *              instance, and it is instance #1 throughout. At 1 it was once
 *              #2, #3, … for as long as the pointer moved.
 *   layout     the Studio Display's spacing at 2560×1440, 1920×1080, 1728×1117,
 *              1512×982, 1440×900 and 1280×720, at #item-01: the margins, the
 *              chrome and the gaps to the hero are the spec to ±2px (× k where
 *              the chrome shrank), the neighbours 4.40% of the hero's width
 *              from it, no paper over the hero, the top shape is "Close", and
 *              a number only on a card you can see — none on a card folded out
 *              of sight (scripts/layout-checks.mjs). A screenshot per viewport to
 *              `--shots` (default .context/layout/).
 *
 * Pixel checks hide the sky and the dev overlays first: the sky drifts, the
 * neighbours are 85% opaque over it, and the env readout's numbers tick.
 * A pixel counts as different past 32 levels (an eighth of the range) on any
 * channel — the portfolio view's hand-off tolerance, for its reason: below that
 * it is two rasterisers antialiasing one edge.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { atRest, boilSteps, emptyPoint, hoverAll, judgeLeave, leaveAll, registration } from './cover-life-checks.mjs';
import { checkLayout } from './layout-checks.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const ORIGIN = arg('--url', 'http://localhost:5173');
const ONLY = arg('--only', 'rects,identity,handoff,sprites,registration,routes,nav,leave,frames,reduced,life,arrival,sidescale,layout').split(',');
/** Where `layout` writes its screenshots. */
const SHOTS = arg('--shots', '.context/layout');
/** `--diff-dir <dir>`: `identity` and `hand-off` save each card's two sides
 *  and its difference map (past TOL in red, over the first side in grey) —
 *  to see WHAT differs when a share is over its budget. */
const DIFF_DIR = arg('--diff-dir', null);
const B = `${ORIGIN}/`;
const VIEWPORTS = [
  { width: 1728, height: 996 },
  { width: 1440, height: 900 },
];
const TOL = 32;
/** The spec's bar: all-zero uniforms, ≤ 0.5% of a card's pixels differ. */
const IDENTITY = 0.005;
/**
 * CARD 01'S OWN BUDGET, and the one number here that is not the spec's.
 *
 * Card 01 is the issue cover: dense line art and small type edge to edge. Where
 * the DOM draws it at scale(0.85), Chrome resamples it softer than any texture
 * made from the same file (a direct resize, trilinear mips, a biased mip level
 * and a quarter-size decode were each measured — docs/detail-paper.md), and on
 * line art that softness is edges everywhere. The flat-art cards meet the spec
 * at every size; this card does not, so it is held to what it measures, and
 * listed as Not done, rather than hiding it inside a looser bar for all four.
 *
 * With the chrome down to 32px with a mouse (2026-10-06, docs/reader.md), the
 * hero at 1440×900 grew from 539×700 to 562×731, and card 01 beside #item-04
 * @1× went from 5.88% (main, two runs) to 7.50% (two runs, the same number).
 * The diff maps (`--diff-dir`, main beside this) are edges alone, the same
 * edges of the same line art, more of them at the new scale; nothing out of
 * register. Side held to the worst + 1 point: 8.5%.
 */
const CARD01_IDENTITY = { hero: 0.01, side: 0.085 };
/**
 * CARD 02 AS A NEIGHBOUR. As the hero, card 02 is the live cover and meets the
 * spec's 0.5% (the clock pinned, one shader draws both sides of the hand-off).
 * As a neighbour it is the cover's STILL (docs/covers.md), which is the
 * particle field — noise, edge to edge — and so card 01's problem above in its
 * purest form: Chrome's scale(0.85) resampling of the <img> against a texture
 * resized to the card's device size. Held to card 01's neighbour budget, for
 * card 01's reason; measured 1.0–5.0%.
 */
const COVER_STILL_SIDE = 0.07;
/**
 * CARD 02 AS THE HERO, at one size. 0.000–0.004% at 1728×996 @1× and 1440×900
 * both ratios; 2.1–2.2% at 1728×996 @2×, where the hero box is 628.2 × 816.7
 * CSS px and neither the DOM canvas nor the plane's texture (1256 × 1633) lands
 * on whole device pixels: each is resampled by a fraction of a pixel, by two
 * different resamplers, over a field of noise. The diff grows steadily toward
 * the bottom-right — a 0.4px scale drift, not a clock or a colour. Flat art
 * does not show it; the speckle does. Held to 2.5% until 2026-10-01. Since
 * then card 02 is opaque on its own navy ground (docs/covers.md, "Card 02's
 * lava"), and the same drift over the same dot field — now green and yellow on
 * #425EB6 rather than over the 44% stock with the sky hidden — puts more of its
 * pixels past 32 levels: 3.04% there, every run (main, the same script, the
 * same machine: 2.11%), in the same pattern (0.01% in the top-left ninth, 9.1%
 * in the bottom-right; main 0.02% and 7.0%), and no blob drawn apart. Held to
 * 3.5%. On the ground it shipped with, #0d1220, it is 1.92%: the dots on near
 * black move fewer pixels past 32 levels than on the navy. The bar stays at
 * 3.5%, for a ground tuned lighter again — for card 03's hero (below).
 */
const COVER_HERO = 0.035;
/**
 * CARD 02'S HERO since detailCardScale 0.81 (2026-10-01): 5.68% at 1728×996
 * @2×, every run (0.00–0.06% at the other three sizes). The hero box is
 * 555.7 × 722.4 CSS px there, again off whole device pixels both ways, and
 * the diff map (`--diff-dir`) is the same drift over the same dot field and
 * nothing else: speckle across the navy ground, denser to one side; the
 * letters, the blobs and their outlines clean; the best whole-pixel shift
 * between the two sides 1px (to 2.78%), a σ1 blur 0.37%, the largest
 * connected difference 44 px. Held to what it measures + 1 point: 6.7%.
 *
 * With the bigger hero (2026-10-05, docs/reader.md, "The Studio Display's
 * gaps are the maximums"): 7.47% at 1728×996 @2× (hero 599.0 × 778.7) and
 * 8.29% at 1440×900 @2× (538.8 × 700.4), every run; the diff maps the same
 * speckle over the dot field, the letters, blobs and outlines clean. Held to
 * the worst + 1 point: 9.3%.
 */
const LAVA_HERO = 0.093;
/**
 * CARD 04 AS A NEIGHBOUR. Card 04 is a Rive cover now (docs/covers.md, "Rive
 * covers"); as the hero it meets the spec's 0.5% (0.149–0.434%: the DOM face
 * and the plane show one instance's one canvas). As a neighbour it is its
 * STILL — thin black line art on a transparent ground — and so card 01's
 * problem again: Chrome's scale(0.85) resampling of the <img> against a
 * texture resized to the card, on edges. Measured 0.018–0.891% (the high end at
 * 1440×900 @1×, where the old opaque photo face was 0.1–0.4%). Held to 2%.
 *
 * Since 2026-10-05 card 04 is LIVE as a side card (docs/covers.md, "The live
 * side card"): the DOM side card copies the one instance's stage canvas and
 * the plane samples its plane canvas, the clock pinned — one moment, two
 * resamplers. 0.126–0.393%; the bar stays 2%.
 */
const RIVE_SIDE = 0.02;
/**
 * CARD 04 AS THE HERO, held to the spec's 0.5% until the chrome went down to
 * 32px with a mouse (2026-10-06): the hero at 1440×900 grew from 539×700 to
 * 562×731, and @1× it went from 0.482% (main, two runs) to 0.528% (three runs,
 * the same number). The diff map is the face's circle's 1-px antialiased rim
 * alone, as it is on main; the features register. Held to 0.6%.
 */
const RIVE_HERO = 0.006;
/**
 * CARD 03, the drex cover (docs/covers.md, "Card 03"), held to card 02's
 * budgets for card 02's reason. Its still is a 1-px Bayer dither: noise edge to
 * edge, like card 02's particle field. As a neighbour, Chrome's scale(0.85)
 * resampling of the <img> against a texture resized to the card measured
 * 2.5–6.1% on 2026-10-01 (card 01's line art beside it: 1.2–5.9%). As the hero
 * (`verify:cover`'s `dmorph`: the DOM hero → the paper 0.29–0.56%) it is the
 * same print on both sides, resampled by two resamplers off whole pixels.
 *
 * As a NEIGHBOUR since detailSideScale 1 (2026-10-01; the neighbours at the
 * hero's size, no longer scale(0.85)): 1.1–8.2% (the high end at 1728×996
 * @1×; 7.0–7.2% at 1440×900 @2×). The diff maps (`--diff-dir`, main at 0.85
 * beside this) show the same moiré of the dither in the same places — the
 * teal leaves and the halo — denser, and nothing else out of place: the logo,
 * the wordmark and the number register; the best whole-pixel shift between
 * the sides is 0–1px, after which 0.06–3.6% remain, and a σ1 blur leaves
 * 1.3–2.0%. Held to what it measures + 1 point: 9.2%.
 *
 * With the bigger hero (2026-10-05): 9.79–9.99% at 1440×900 @1×, every run;
 * the diff map the same moiré in the halo and the leaves, the logo and the
 * wordmark in register. Held to the worst + 1 point: 11%.
 */
const DREX_STILL_SIDE = 0.11;
/**
 * CARDS 02 AND 03 AS LIVE SIDE CARDS (2026-10-06, docs/covers.md, "The live
 * side card"): the DOM side card is the stage's draw, the plane the paper's,
 * the clock pinned — one moment, two renderers and two resamplers, as each
 * card's hero is.
 *
 * Card 02: 0.000–3.928% (the high end at 1728×996 @2× beside 01), the dot
 * field's drift as for its hero; held to the worst + 1 point, 5% (its still
 * was held to card 01's 7%).
 *
 * Card 03: 0.231–6.473%, and 12.555% at 1728×996 @2× beside 04, every run.
 * The diff map (`--diff-dir`) is speckle inside the light alone — the 1-px
 * dither of the print under the reveal, resampled off whole device pixels
 * (the side card's left edge is at a fractional x there) — with the dark
 * ground clean and the light's disc, the logo and the wordmark in register:
 * `DREX_STILL_SIDE`'s moiré, now over the lit print instead of the still.
 * Held to the worst + 1 point: 13.6%.
 *
 * NOT the side card's fractional position (2026-10-06, PR #53's round 2).
 * Snapping a resting side card's left edge — the DOM transform and the
 * paper's rect alike — to a whole device pixel, never mid-slide, measured
 * card 03 beside 02 / beside 04 (%, unsnapped → snapped): 1728×996 @1×
 * 0.94 → 3.90 / 3.92 → 3.97; @2× 6.47 → 11.61 / 12.56 → 12.20; 1440×900 @1×
 * 0.23 → 0.40 / 0.53 → 0.79; @2× 4.54 → 4.85 / 5.67 → 6.86. A 1/64 or 1/32 px
 * nudge past Chrome's layout units moved them by tenths, snapping the top
 * edge too made every row worse, and the side opacity (0.85 vs 1) is not it
 * either (1 is higher: more contrast, same pattern). The worst row fell 0.35
 * points while three others rose 2–4×, so the snap was reverted: the two
 * faces disagree in how their renderers sample the one print, not in where
 * the card sits on the pixel grid.
 */
const LAVA_SIDE = 0.05;
const DREX_LIVE_SIDE = 0.136;
/** Content indices of the cards that are live as side cards (content.ts
 *  `side: 'live'`): their side planes must be the live cover. */
const LIVE_SIDE = new Set([1, 2, 3]);
const budget = (r) =>
  r.idx === 0
    ? r.slot === 0
      ? CARD01_IDENTITY.hero
      : CARD01_IDENTITY.side
    : r.idx === 1 || r.idx === 2
      ? r.slot === 0
        ? r.idx === 1
          ? LAVA_HERO
          : COVER_HERO
        : r.idx === 2
          ? LIVE_SIDE.has(2)
            ? DREX_LIVE_SIDE
            : DREX_STILL_SIDE
          : LIVE_SIDE.has(1)
            ? LAVA_SIDE
            : COVER_STILL_SIDE
      : r.idx === 3
        ? r.slot !== 0
          ? RIVE_SIDE
          : RIVE_HERO
        : IDENTITY;
const HANDOFF = 0.02;
const handoffBudget = (r) => Math.max(HANDOFF, budget(r));
const FRAME_BUDGET_MS = 20;
/**
 * The arrival's budget: no frame over 33 ms, p95 ≤ 16.7 ms. rAF timestamps
 * are vsync-aligned, so an interval is a whole number of 16.67 ms vsyncs give
 * or take ~0.2 ms of jitter: "over 33 ms" is three vsyncs (50 ms) or more,
 * and 33.3 is two — one frame dropped. So the budget is counted in vsyncs:
 * every interval ≤ two, the 95th percentile ≤ one.
 */
const VSYNC = 1000 / 60;
const ARRIVAL = { worst: 2, p95: 1 };
const vsyncs = (ms) => Math.round(ms / VSYNC);
/** The paper's SETTLE_MS: the hero is settled this long after it hands in. */
const SETTLE_MS = 500;

let failures = 0;
const ok = (label, extra = '') => console.log(`  ✓ ${label}${extra ? `  ${extra}` : ''}`);
const bad = (label, extra = '') => {
  failures++;
  console.log(`  ✗ ${label}${extra ? `  ${extra}` : ''}`);
};
const check = (pass, label, extra = '') => (pass ? ok(label, extra) : bad(label, extra));
const pct = (x) => `${(100 * x).toFixed(3)}%`;

const errors = [];
async function newPage(browser, viewport, dpr = 1, extra = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, ...extra });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}

/**
 * Load a detail item fresh, pointer parked off every card, canvas carrying.
 *
 * The live covers' clock is PINNED (docs/covers.md): card 02's face is a shader
 * drawn every frame, by the cover stage for the DOM and by the paper's own
 * renderer for the plane, and every pixel check here compares one against the
 * other. Pinned, both draw the same moment — which is what the hand-off has to
 * be anyway — and card 02 is checked like any other card, transparent ground
 * and all.
 */
async function open(page, item = '01', { settle = true } = {}) {
  await page.goto(B);
  // The dev hook installs a beat after the app (a dynamic import): wait for it,
  // or the pin silently does nothing.
  await page.waitForFunction(() => !!window.__covers, null, { timeout: 10000 });
  await page.evaluate(() => window.__covers.pin(3));
  await page.goto(`${B}#item-${item}`);
  await page.mouse.move(3, 3);
  await page.waitForFunction(() => window.__paper?.state() === 'on', null, { timeout: 20000 });
  // Card 04 is a Rive cover, and its file is imported at the first quiet moment
  // (docs/covers.md, "Rendering: one instance, no WebGL"): until then its hero
  // is the still on both sides, which is the still's resampling, not the
  // hand-off. Wait for the live hero.
  if (item === '04') {
    await page.waitForFunction(() => (window.__covers.rive.instance('nosey')?.plane?.version ?? 0) > 0, null, {
      timeout: 20000,
    });
    await page.waitForTimeout(100);
  }
  if (settle) await page.waitForFunction(() => window.__paper.presence() >= 1, null, { timeout: 5000 });
}

/** Take the sky and the dev overlays out of every pixel comparison. */
const quiet = (page) =>
  page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent =
      '.sky-layer, .env-readout, .dialkit-root { visibility: hidden !important; }';
    document.head.append(st);
  });

/** The on-screen cards (slot ≤ 1) as the paper has them. */
const cards = (page) => page.evaluate(() => window.__paper.rects().filter((r) => r.slot <= 1));

async function shot(page) {
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, C: info.channels };
}

/** Share of pixels differing past TOL inside `r` (inset a device pixel, so the
 *  antialiased edge — which the rect check covers — is not counted twice). */
function diffIn(a, b, r, dpr) {
  const x0 = Math.max(0, Math.ceil((r.cx - r.w / 2) * dpr) + 1);
  const x1 = Math.min(a.W, Math.floor((r.cx + r.w / 2) * dpr) - 1);
  const y0 = Math.ceil((r.cy - r.h / 2) * dpr) + 1;
  const y1 = Math.floor((r.cy + r.h / 2) * dpr) - 1;
  let n = 0;
  let d = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.W + x) * a.C;
      const m = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      n++;
      if (m > TOL) d++;
    }
  }
  return n ? d / n : 0;
}

/** Card `r`'s crop of shots `a` and `b` (diffIn's box) and their difference
 *  map, as PNGs in DIFF_DIR. */
async function saveDiff(tag, a, b, r, dpr) {
  if (!DIFF_DIR) return;
  await mkdir(DIFF_DIR, { recursive: true });
  const x0 = Math.max(0, Math.ceil((r.cx - r.w / 2) * dpr) + 1);
  const x1 = Math.min(a.W, Math.floor((r.cx + r.w / 2) * dpr) - 1);
  const y0 = Math.ceil((r.cy - r.h / 2) * dpr) + 1;
  const y1 = Math.floor((r.cy + r.h / 2) * dpr) - 1;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const ca = Buffer.alloc(w * h * 3);
  const cb = Buffer.alloc(w * h * 3);
  const cd = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * a.W + x0 + x) * a.C;
      const o = (y * w + x) * 3;
      let m = 0;
      for (let c = 0; c < 3; c++) {
        ca[o + c] = a.data[i + c];
        cb[o + c] = b.data[i + c];
        m = Math.max(m, Math.abs(a.data[i + c] - b.data[i + c]));
      }
      const g = Math.round((0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2]) * 0.35);
      if (m > TOL) cd.set([255, 40, 40], o);
      else cd.set([g, g, g], o);
    }
  }
  const name = `${DIFF_DIR}/${tag}-card${String(r.idx + 1).padStart(2, '0')}`;
  const raw = { raw: { width: w, height: h, channels: 3 } };
  await sharp(ca, raw).png().toFile(`${name}-a.png`);
  await sharp(cb, raw).png().toFile(`${name}-b.png`);
  await sharp(cd, raw).png().toFile(`${name}-diff.png`);
}

const settleFrames = (page, n = 3) =>
  page.evaluate(
    (n) =>
      new Promise((res) => {
        let k = 0;
        const f = () => (++k >= n ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

// ── rects ────────────────────────────────────────────────────────────────

async function checkRects(browser) {
  console.log('\nrects: plane vs DOM panel, every on-screen card');
  for (const vp of VIEWPORTS) {
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, vp, dpr);
      for (const item of ['01', '03']) {
        await open(page, item, { settle: false });
        const r = await page.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          const hv = ['--hero-x', '--hero-y', '--hero-w', '--hero-h'].map((k) => parseFloat(s.getPropertyValue(k)));
          return window.__paper
            .projected()
            .filter((p) => p && p.slot <= 1)
            .map((p) => {
              const b = document.querySelector(`.detail__panel[data-i="${p.key}"]`).getBoundingClientRect();
              const dom = [b.x, b.y, b.width, b.height];
              const gl = [p.x, p.y, p.w, p.h];
              return {
                slot: p.slot,
                worst: Math.max(...gl.map((v, i) => Math.abs(v - dom[i]))),
                hero: p.slot === 0 ? Math.max(...gl.map((v, i) => Math.abs(v - hv[i]))) : 0,
              };
            });
        });
        const worst = Math.max(...r.map((x) => x.worst));
        const hero = Math.max(...r.map((x) => x.hero));
        // Layout is in 1/64 px, the plane in doubles: "0px" is agreement to
        // under a twentieth of a pixel.
        check(
          r.length === 3 && worst < 0.05 && hero < 0.05,
          `${vp.width}×${vp.height} @${dpr}× #item-${item}: ${r.length} planes`,
          `worst ${worst.toFixed(4)}px vs DOM, hero ${hero.toFixed(4)}px vs --hero-*`,
        );
      }
      await page.context().close();
    }
  }
}

// ── identity ─────────────────────────────────────────────────────────────

async function checkIdentity(browser) {
  console.log('\nidentity: every effect at 0, canvas vs the DOM image');
  for (const vp of VIEWPORTS) {
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, vp, dpr);
      for (const item of ['01', '02', '04']) {
        await open(page, item);
        await quiet(page);
        await page.evaluate(() => window.__paper.override({ zero: true }));
        await settleFrames(page);
        const rs = await cards(page);
        // Every side card whose cover is live there (cards 02, 03 and 04) is
        // SAMPLED by the paper — its plane is the live cover, not the still.
        const planes = await page.evaluate(() => window.__paper.planes().filter((p) => p.slot === 1));
        const on = await shot(page);
        await page.evaluate(() => window.__paper.set({ paper: 'off' }));
        await page.waitForTimeout(350); // the DOM faces' opacity transition
        const off = await shot(page);
        await page.evaluate(() => {
          window.__paper.override({});
          window.__paper.set({ paper: 'on' });
        });
        const parts = rs.map((r) => ({ r, d: diffIn(on, off, r, dpr) }));
        for (const p of parts) await saveDiff(`identity-${vp.width}x${vp.height}@${dpr}-item${item}`, on, off, p.r, dpr);
        const hero = parts.find((p) => p.r.slot === 0);
        const side = parts.filter((p) => p.r.slot !== 0);
        const liveSides = planes.filter((p) => LIVE_SIDE.has(p.idx));
        const sidesLive = liveSides.length > 0 && liveSides.every((p) => p.shows === 'live');
        check(
          parts.every((p) => p.d <= budget(p.r)) && sidesLive,
          `${vp.width}×${vp.height} @${dpr}× #item-${item}`,
          `hero (${hero.r.idx + 1}) ${pct(hero.d)}; neighbours ${side
            .map((p) => `${String(p.r.idx + 1).padStart(2, '0')} ${pct(p.d)} (≤ ${pct(budget(p.r))})`)
            .join(', ')}; the paper's side planes ${planes.map((p) => `${String(p.idx + 1).padStart(2, '0')} ${p.shows}`).join(', ')}`,
        );
      }
      await page.context().close();
    }
  }
}

// ── hand-off ─────────────────────────────────────────────────────────────

async function checkHandoff(browser) {
  console.log('\nhand-off: both swaps, inside the cards');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    // 02 is the live cover: a transparent hero (docs/covers.md), the clock pinned.
    for (const item of ['01', '02', '04']) {
      // IN — the last DOM frame, then the canvas the moment it has the cards.
      await open(page, item);
      await quiet(page);
      await page.evaluate(() => {
        window.__paper.freezePresence(true);
        window.__paper.set({ paper: 'off' });
      });
      await page.waitForTimeout(350);
      const rs = await cards(page);
      const dom = await shot(page);
      await page.evaluate(() => window.__paper.set({ paper: 'on' }));
      await page.waitForFunction(() => window.__paper.state() === 'on');
      await settleFrames(page);
      const canvasIn = await shot(page);
      const ins = rs.map((r) => ({ r, d: diffIn(dom, canvasIn, r, dpr) }));
      const dIn = Math.max(...ins.map((p) => p.d));
      for (const p of ins) await saveDiff(`handoff-in@${dpr}-item${item}`, dom, canvasIn, p.r, dpr);

      // OUT — fully settled paper, then the reverse held at its last frame.
      await open(page, item);
      await quiet(page);
      await page.evaluate(() => {
        window.__paper.holdOut(true);
        window.__paper.handOut();
      });
      await page.waitForTimeout(250); // past the 120ms crossfade
      // The canvas alone, as it is at the swap: hide the DOM faces for one shot.
      await page.evaluate(() => (document.querySelector('.detail').dataset.paper = 'on'));
      await settleFrames(page);
      const canvasOut = await shot(page);
      await page.evaluate(() => {
        document.querySelector('.detail').dataset.paper = 'out';
        window.__paper.holdOut(false);
      });
      await page.waitForFunction(() => window.__paper.state() === 'dom');
      await page.waitForTimeout(100);
      const domOut = await shot(page);
      const rsOut = await cards(page);
      const outs = rsOut.map((r) => ({ r, d: diffIn(canvasOut, domOut, r, dpr) }));
      const dOut = Math.max(...outs.map((p) => p.d));
      for (const p of outs) await saveDiff(`handoff-out@${dpr}-item${item}`, canvasOut, domOut, p.r, dpr);
      const worstOther = Math.max(...[...ins, ...outs].filter((p) => p.r.idx !== 0).map((p) => p.d));
      check(
        [...ins, ...outs].every((p) => p.d <= handoffBudget(p.r)),
        `@${dpr}× #item-${item}`,
        `worst card: in ${pct(dIn)}, out ${pct(dOut)}; worst of cards 02–04 ${pct(worstOther)}`,
      );
    }
    await page.context().close();
  }
}

// ── sprites ──────────────────────────────────────────────────────────────

async function checkSprites(browser) {
  console.log('\nsprites: the cover hover layer over the canvas');
  const page = await newPage(browser, VIEWPORTS[0], 1);
  await open(page, '01');
  await page.waitForSelector('.detail__panel--center .cover-anim__plate', { state: 'attached' });
  const target = await page.evaluate(() => {
    const objs = [...document.querySelectorAll('.detail__panel--center .cover-anim__obj')];
    // The biggest object, hovered at its centre, so no other box is on top.
    const o = objs
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height)[0];
    const i = objs.indexOf(o.el);
    return { i, x: o.b.x + o.b.width / 2, y: o.b.y + o.b.height / 2 };
  });
  // The boil moves every pixel of the cover; take it out, so "animates" below
  // is about the loop and nothing else.
  await page.evaluate(() => window.__coverLife.set({ boilPx: 0, boilDeg: 0 }));
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.waitForTimeout(400);
  const s = await page.evaluate((t) => {
    const under = document.elementFromPoint(t.x, t.y);
    return {
      // Whichever object is on top at that point is the one that plays.
      frames: Math.max(...[...document.querySelectorAll('.detail__panel--center .cover-anim__obj')].map((o) => o.querySelectorAll('img').length)),
      state: window.__paper.state(),
      canvas: getComputedStyle(document.querySelector('.detail__paper')).visibility,
      under: under?.className ?? '',
      plateHidden: getComputedStyle(document.querySelector('.cover-anim__plate')).visibility,
    };
  }, target);
  check(
    s.frames === 2 && s.state === 'on' && s.canvas === 'visible' && !String(s.under).includes('detail__paper'),
    'hovering an object mounts its animation, canvas underneath',
    `imgs ${s.frames}, paper ${s.state}, canvas ${s.canvas}, under the pointer: .${String(s.under).split(' ')[0]}, DOM plate ${s.plateHidden}`,
  );
  // And the animation actually runs: the loop's frame changes pixels over time.
  const clip = await page.evaluate((t) => {
    const b = document.querySelectorAll('.detail__panel--center .cover-anim__obj')[t.i].getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, target);
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(700);
  const b = await page.screenshot({ clip });
  check(!a.equals(b), 'the hovered object animates');
  await page.context().close();
}

// ── registration ─────────────────────────────────────────────────────────

async function checkRegistration(browser) {
  console.log('\nregistration: the hero plate under its DOM sprites');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await open(page, '01');
    await page.waitForSelector('.detail__panel--center .cover-anim__plate', { state: 'attached' });
    await settleFrames(page, 4);
    const uni = () => page.evaluate(() => window.__paper.uniforms().filter((u) => u.slot <= 1));
    const rest = await uni();
    const hero = rest.find((u) => u.slot === 0);
    const sides = rest.filter((u) => u.slot === 1);
    const flat =
      hero.ripple === 0 && hero.hover === 0 && hero.velocity === 0 && hero.fold === 0 &&
      hero.boil.x === 0 && hero.boil.y === 0 && hero.boil.rad === 0;
    check(
      flat && hero.sprites > 0 && sides.length === 2 && sides.every((u) => u.ripple > 0),
      `@${dpr}× at rest: hero flat under ${hero.sprites} sprites, neighbours rippled`,
      `hero ripple ${hero.ripple} dent ${hero.hover} squash ${hero.velocity} fold ${hero.fold} boil ${hero.boil.x},${hero.boil.y},${hero.boil.rad}; neighbours ripple ${sides.map((u) => u.ripple.toFixed(4)).join(', ')}`,
    );
    // The dent still applies on the hero — and only while it is hovered.
    const r = await page.evaluate(() => window.__paper.rects().find((q) => q.slot === 0));
    await page.mouse.move(r.cx + r.w * 0.3, r.cy + r.h * 0.35, { steps: 4 });
    await page.waitForTimeout(450);
    const on = (await uni()).find((u) => u.slot === 0);
    await page.mouse.move(3, 3, { steps: 4 });
    await page.waitForTimeout(700);
    const off = (await uni()).find((u) => u.slot === 0);
    check(
      on.hover > 0.9 && off.hover === 0 && on.ripple === 0,
      `@${dpr}× hovering the hero dents it; leaving flattens it again`,
      `dent ${on.hover.toFixed(3)} hovered → ${off.hover} after`,
    );
    await page.context().close();
  }
}

// ── routes into card 01 ──────────────────────────────────────────────────

/** Every hero sprite's rect on screen, and where the plate puts it at rest:
 *  the paper plane's rect, fitted to the cover as the layer fits it (contain,
 *  centred), times the manifest's displayRect. Independent of the layer's own
 *  measurement, which is what is under test. */
const spritesVsPlate = (page) =>
  page.evaluate(async () => {
    const m = await (await fetch('/issues/01/anim/manifest.json')).json();
    const byId = Object.fromEntries(m.objects.filter((o) => (o.face ?? 'cover') === 'cover').map((o) => [o.id, o]));
    const p = window.__paper.rects().find((q) => q.slot === 0);
    const scale = Math.min(p.w / m.coverW, p.h / m.coverH);
    const x0 = p.cx - p.w / 2 + (p.w - m.coverW * scale) / 2;
    const y0 = p.cy - p.h / 2 + (p.h - m.coverH * scale) / 2;
    const out = [];
    for (const el of document.querySelectorAll('.detail__panel--center .cover-anim__obj')) {
      const r = el.getBoundingClientRect();
      const d = byId[el.dataset.id].displayRect;
      const e = { l: x0 + d.x * scale, t: y0 + d.y * scale, r: x0 + (d.x + d.w) * scale, b: y0 + (d.y + d.h) * scale };
      out.push({
        id: el.dataset.id,
        rect: [r.left, r.top, r.right, r.bottom],
        plate: Math.max(Math.abs(e.l - r.left), Math.abs(e.t - r.top), Math.abs(e.r - r.right), Math.abs(e.b - r.bottom)),
      });
    }
    return out;
  });

async function checkRoutes(browser) {
  console.log('\nroutes: card 01 registers the same however it is reached');
  const ROUTES = [
    ['cold load #item-01', '01', []],
    ['Prev from #item-02', '02', ['Previous item']],
    ['Next from #item-04', '04', ['Next item']],
    ['01 → 02 → 01', '01', ['Next item', 'Previous item']],
  ];
  for (const dpr of [1, 2]) {
    let cold = null;
    for (const [label, start, clicks] of ROUTES) {
      const page = await newPage(browser, VIEWPORTS[0], dpr);
      await open(page, start);
      for (const name of clicks) {
        await page.getByRole('button', { name }).click();
        await page.mouse.move(3, 3);
        await page.waitForTimeout(1300);
      }
      await page.waitForFunction(
        () => location.hash === '#item-01' && window.__paper.state() === 'on' && window.__paper.presence() >= 1,
        null,
        { timeout: 10000 },
      );
      await page.waitForSelector(`${HERO_FACE.layer} .cover-anim__plate`, { state: 'attached' });
      await settleFrames(page, 4);
      const sprites = await spritesVsPlate(page);
      cold ??= sprites;
      let vsCold = 0;
      for (const sp of sprites) {
        const c = cold.find((q) => q.id === sp.id);
        vsCold = Math.max(vsCold, ...sp.rect.map((v, k) => Math.abs(v - c.rect[k])));
      }
      const plate = max(sprites.map((sp) => sp.plate));
      // The boil: plate and sprites move together (the `life` check, here).
      const at = await emptyPoint(page, HERO_FACE);
      await hoverAll(page, HERO_FACE, at);
      const reg = await registration(page, HERO_FACE, 6);
      const moved = reg.filter((r) => r.moved > 0.05 || Math.abs(r.deg) > 0.01).length;
      const boil = max(reg.map((r) => r.worst));
      check(
        sprites.length === 20 && vsCold <= 1 && plate <= 0.5 && boil <= 0.5 && moved >= 4,
        `@${dpr}× ${label}`,
        `${sprites.length} sprites: vs the cold load ${vsCold.toFixed(3)}px ≤ 1; vs the plate at rest ${plate.toFixed(3)}px ≤ 0.5; boiling ${boil.toFixed(3)}px ≤ 0.5 (${moved}/6 samples boiled)`,
      );
      await page.context().close();
    }
  }
}

// ── navigation ───────────────────────────────────────────────────────────

async function checkNav(browser) {
  console.log('\nnav: Prev / Next land, hash and caption agreeing');
  const page = await newPage(browser, VIEWPORTS[0], 1);
  await open(page, '01');
  const state = () =>
    page.evaluate(() => {
      const c = document.querySelector('.detail__panel--center');
      const plane = window.__paper.projected().find((p) => p && p.slot === 0);
      const b = c.getBoundingClientRect();
      return {
        hash: location.hash,
        select: +document.querySelector('.detail__select').value,
        panel: +c.dataset.idx,
        plane: plane.idx,
        off: Math.max(Math.abs(plane.x - b.x), Math.abs(plane.w - b.width)),
        paper: window.__paper.state(),
      };
    });
  for (const [btn, want] of [
    ['Next item', 1],
    ['Next item', 2],
    ['Previous item', 1],
    ['Previous item', 0],
    ['Previous item', 3],
  ]) {
    await page.getByRole('button', { name: btn }).click();
    await page.waitForTimeout(1300);
    const s = await state();
    check(
      s.hash === `#item-0${want + 1}` && s.select === want && s.panel === want && s.plane === want && s.off < 0.05 && s.paper === 'on',
      `${btn} → item-0${want + 1}`,
      `hash ${s.hash}, list ${s.select}, panel ${s.panel}, plane ${s.plane} (${s.off.toFixed(3)}px), paper ${s.paper}`,
    );
  }
  await page.context().close();
}

// ── leave ────────────────────────────────────────────────────────────────

async function checkLeave(browser) {
  console.log('\nleave: the DOM has the cards before anything else moves');
  const page = await newPage(browser, VIEWPORTS[0], 1);
  const record = () =>
    page.evaluate(() => {
      window.__log = [];
      const f = () => {
        window.__log.push([window.__paper?.state() ?? 'gone', location.hash]);
        window.__logRaf = requestAnimationFrame(f);
      };
      f();
    });
  const sequence = () =>
    page.evaluate(() => {
      cancelAnimationFrame(window.__logRaf);
      const s = window.__log;
      return s.filter((x, i) => i === 0 || x[0] !== s[i - 1][0] || x[1] !== s[i - 1][1]).map((x) => x.join(' '));
    });
  await open(page, '01');
  await record();
  await page.getByRole('button', { name: 'Read issue', exact: true }).click();
  await page.waitForSelector('.reader__bar', { timeout: 10000 });
  await page.waitForTimeout(500);
  const read = await sequence();
  // The leave runs in the same task that hands the cards back, so the first
  // frame with the new hash is already a DOM frame — and no frame ever shows
  // the canvas under a hash that is not the item's.
  const clean = (seq, from) => seq.every((x) => x.startsWith('dom') || x.endsWith(from));
  check(
    read[0] === 'on #item-01' && read[1] === 'out #item-01' && read[2]?.startsWith('dom') && clean(read, '#item-01'),
    'Read issue: on → out → dom, then the doorway',
    read.slice(0, 4).join(' → '),
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.reader') && window.__paper?.state() === 'on', null, { timeout: 10000 });
  ok('closing the reader, the canvas takes the cards back');
  await record();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForFunction(() => !document.querySelector('.detail'), null, { timeout: 10000 });
  const back = await sequence();
  check(
    back[0] === 'on #item-01' && back[1] === 'out #item-01' && back[2]?.startsWith('dom') && clean(back, '#item-01'),
    'Close: on → out → dom, then the exit',
    back.slice(0, 4).join(' → '),
  );
  await page.context().close();
}

// ── frames ───────────────────────────────────────────────────────────────

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

async function checkFrames(browser) {
  console.log('\nframes: a Prev slide and a hover sweep');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    for (let run = 0; run < 3; run++) {
      await open(page, '02');
      const slide = await frameTimes(page, async () => {
        await page.getByRole('button', { name: 'Previous item' }).click();
        await page.waitForTimeout(1100);
      });
      await page.mouse.move(3, 3);
      await page.waitForTimeout(400);
      const hero = await page.evaluate(() => window.__paper.rects().find((r) => r.slot === 0));
      const hover = await frameTimes(page, async () => {
        for (let k = 0; k <= 40; k++) {
          const t = k / 40;
          await page.mouse.move(hero.cx - hero.w * 0.4 + hero.w * 0.8 * t, hero.cy - hero.h * 0.3 + hero.h * 0.6 * t);
          await page.waitForTimeout(20);
        }
      });
      const ws = Math.max(...slide);
      const wh = Math.max(...hover);
      check(
        ws <= FRAME_BUDGET_MS && wh <= FRAME_BUDGET_MS,
        `@${dpr}× run ${run + 1}`,
        `Prev slide worst ${ws.toFixed(1)}ms over ${slide.length} frames; hover worst ${wh.toFixed(1)}ms over ${hover.length}`,
      );
    }
    await page.context().close();
  }
}

// ── reduced motion ───────────────────────────────────────────────────────

async function checkReduced(browser) {
  console.log('\nreduced motion: static paper');
  const page = await newPage(browser, VIEWPORTS[0], 1, { reducedMotion: 'reduce' });
  await open(page, '02');
  await quiet(page);
  const hero = await page.evaluate(() => window.__paper.rects().find((r) => r.slot === 0));
  await page.mouse.move(hero.cx, hero.cy, { steps: 4 });
  // Past the neighbours' hover-dim, which eases whatever the paper does.
  await page.waitForTimeout(1500);
  const rs = await cards(page);
  const a = await shot(page);
  await page.mouse.move(hero.cx + 40, hero.cy - 60, { steps: 10 });
  await page.waitForTimeout(2000);
  const b = await shot(page);
  const per = rs.map((r) => {
    let worst = 0;
    const x0 = Math.max(0, Math.ceil(r.cx - r.w / 2));
    const x1 = Math.min(a.W, Math.floor(r.cx + r.w / 2));
    for (let y = Math.ceil(r.cy - r.h / 2); y < Math.floor(r.cy + r.h / 2); y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * a.W + x) * a.C;
        worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      }
    }
    return { slot: r.slot, idx: r.idx, worst };
  });
  const worst = Math.max(...per.map((p) => p.worst));
  const st = await page.evaluate(() => ({ state: window.__paper.state() }));
  check(worst === 0 && st.state === 'on', 'two frames 2s apart, pointer moving on the hero', `max channel difference ${per.map((p) => `${p.slot === 0 ? 'hero' : 'side'} ${p.worst}`).join(', ')}; paper ${st.state}`);
  await page.context().close();
}


// ── cover life ───────────────────────────────────────────────────────────

const HERO_FACE = {
  layer: '.detail__panel--center .cover-anim',
  which: 'cover',
  // The plate's transform, from the plate: the hero plane's boil uniforms,
  // about the plane's own centre.
  plate: `() => {
    const u = window.__paper.uniforms().find((q) => q.slot === 0);
    const r = window.__paper.rects().find((q) => q.slot === 0);
    return { cx: r.cx, cy: r.cy, dx: u.boil.x, dy: u.boil.y, rad: u.boil.rad };
  }`,
};

const max = (xs) => Math.max(...xs);

async function checkLife(browser) {
  console.log('\ncover life: page hover and the boil, on the hero');
  for (const dpr of [1, 2]) {
    const page = await newPage(browser, VIEWPORTS[0], dpr);
    await open(page, '01');
    await page.waitForSelector(`${HERO_FACE.layer} .cover-anim__plate`, { state: 'attached' });
    await settleFrames(page, 4);
    const rest0 = await atRest(page, HERO_FACE);
    check(
      rest0.still && rest0.styles === '' && rest0.phases.every((p) => p === 'rest'),
      `@${dpr}× at rest: nothing boiled, nothing playing`,
      `plate boil ${rest0.plate.dx},${rest0.plate.dy},${rest0.plate.rad}; layer style "${rest0.styles}"`,
    );

    const at = await emptyPoint(page, HERO_FACE);
    const h = await hoverAll(page, HERO_FACE, at);
    check(
      h.ms !== null && h.ms <= 200 && h.n === 20,
      `@${dpr}× hovering the page, on no object: all ${h.n} objects play`,
      `all playing ${h.ms === null ? 'never' : `${h.ms.toFixed(1)}ms`} after the pointer arrived`,
    );

    const reg = await registration(page, HERO_FACE, 10);
    const steps = new Set(reg.map((r) => r.step)).size;
    const moved = reg.filter((r) => r.moved > 0.05 || Math.abs(r.deg) > 0.01).length;
    check(
      max(reg.map((r) => r.worst)) <= 0.5 && moved >= 8 && steps >= 4,
      `@${dpr}× during the boil, plate and sprites move together`,
      `worst sprite vs plate ${max(reg.map((r) => r.worst)).toFixed(3)}px over 10 samples × 20 sprites; ${moved}/10 samples boiled (up to ${max(reg.map((r) => r.moved)).toFixed(2)}px, ${max(reg.map((r) => Math.abs(r.deg))).toFixed(2)}°), ${steps} distinct steps`,
    );

    const fr = await frameTimes(page, async () => {
      for (let k = 0; k < 60; k++) {
        await page.mouse.move(at.x + (k % 9), at.y + (k % 7));
        await page.waitForTimeout(50);
      }
    });
    check(max(fr) <= FRAME_BUDGET_MS, `@${dpr}× frames during the boil`, `worst ${max(fr).toFixed(1)}ms over ${fr.length} frames`);

    const L = await leaveAll(page, HERO_FACE, { x: 3, y: 3 });
    const j = judgeLeave(L);
    check(
      j.all && j.ids.length === 20 && j.over.length === 0,
      `@${dpr}× leaving, every object finishes its pass and fades home`,
      `slowest home ${j.worst.toFixed(0)}ms (bound: its pass + ${L.dials.stagger} + 120 + 60); fades begin ${j.fades[0]?.toFixed(0)}–${j.fades.at(-1)?.toFixed(0)}ms, ${j.distinct} distinct 8ms slots${j.over.length ? `; late: ${j.over.map((x) => `${x.id} ${x.t.toFixed(0)}>${x.bound}`).join(', ')}` : ''}`,
    );
    await page.waitForTimeout(500); // past boilOutMs
    const rest1 = await atRest(page, HERO_FACE);
    check(rest1.still && rest1.styles === '', `@${dpr}× after the leave, everything exactly where it was`, `plate boil ${rest1.plate.dx},${rest1.plate.dy},${rest1.plate.rad}; layer style "${rest1.styles}"`);

    // Pixels: the canvas plate, held boiled, against the DOM plate boiled the
    // same way (paper off) — sprites at rest in both, so only the plate can
    // differ. Every paper effect off (`zero`) for the canvas side.
    await quiet(page);
    await page.evaluate(() => window.__paper.override({ zero: true }));
    await settleFrames(page, 3);
    const rs = (await cards(page)).filter((r) => r.slot === 0);
    const still = await shot(page);
    await page.evaluate(() => window.__coverLife.hold('cover', { step: 7, amp: 1 }));
    await page.waitForTimeout(150);
    const canvas = await shot(page);
    await page.evaluate(() => window.__paper.set({ paper: 'off' }));
    await page.waitForTimeout(350);
    const dom = await shot(page);
    const held = await page.evaluate(() => window.__coverLife.sample('cover'));
    await page.evaluate(() => {
      window.__coverLife.hold('cover', null);
      window.__paper.override({});
      window.__paper.set({ paper: 'on' });
    });
    const dReg = diffIn(canvas, dom, rs[0], dpr);
    const dMove = diffIn(still, canvas, rs[0], dpr);
    check(
      dReg <= CARD01_IDENTITY.hero && dMove > 3 * dReg,
      `@${dpr}× held boiled, the canvas plate is the DOM plate`,
      `canvas vs DOM ${pct(dReg)} (card 01 hero budget ${pct(CARD01_IDENTITY.hero)}); boiled vs rest ${pct(dMove)} — step ${held.step}, ${held.dx.toFixed(2)},${held.dy.toFixed(2)}px ${held.deg.toFixed(2)}°`,
    );

    if (dpr === 2) {
      await page.waitForFunction(() => window.__paper.state() === 'on', null, { timeout: 5000 });
      await page.evaluate(() => window.__paper.override({ zero: false }));
      await settleFrames(page, 3);
      const s = await boilSteps(page, HERO_FACE, 'docs/detail-paper/boil-steps.webp');
      ok('wrote docs/detail-paper/boil-steps.webp', s.map((x) => `step ${x.step}: ${x.dx.toFixed(2)},${x.dy.toFixed(2)}px ${x.deg.toFixed(2)}°`).join(' | '));
    }
    await page.context().close();
  }

  // Reduced motion: the objects still play; nothing boils.
  const page = await newPage(browser, VIEWPORTS[0], 1, { reducedMotion: 'reduce' });
  await open(page, '01');
  await page.waitForSelector(`${HERO_FACE.layer} .cover-anim__plate`, { state: 'attached' });
  const at = await emptyPoint(page, HERO_FACE);
  const h = await hoverAll(page, HERO_FACE, at);
  let worst = 0;
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(100);
    const r = await atRest(page, HERO_FACE);
    worst = Math.max(worst, Math.abs(r.plate.dx), Math.abs(r.plate.dy), Math.abs(r.plate.rad), r.styles.length);
  }
  check(
    h.ms !== null && h.ms <= 200 && worst === 0,
    'reduced motion: the page hover plays all 20, nothing boils',
    `all playing ${h.ms?.toFixed(1)}ms; largest boil seen over 1s: ${worst}`,
  );
  await page.context().close();
}

// ── arrival ──────────────────────────────────────────────────────────────

/** Installed before the page's own scripts: WebGL contexts made (each canvas
 *  counted once), every rAF interval, every Long Animation Frame, and when
 *  the paper hands in. Nothing here needs the dev hooks. */
function arrivalProbe() {
  const orig = HTMLCanvasElement.prototype.getContext;
  window.__glMade = 0;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const had = this.__glMade;
    const c = orig.call(this, type, ...a);
    if (c && /webgl/.test(type) && !had) {
      this.__glMade = true;
      window.__glMade++;
    }
    return c;
  };
  const A = (window.__arr = { frames: [], loaf: [], onAt: 0, fcp: 0 });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') A.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
  let last = 0;
  const f = (t) => {
    if (last) A.frames.push([last, t]);
    if (A.frames.length > 4000) A.frames.splice(0, 2000);
    last = t;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        A.loaf.push({
          start: e.startTime,
          end: e.startTime + e.duration,
          render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          scripts: e.scripts
            .filter((s) => s.duration >= 2)
            .map((s) => `${s.invoker}${s.sourceFunctionName ? ` ${s.sourceFunctionName}` : ''} (${(s.sourceURL || '').split('/').pop().split('?')[0]}) ${Math.round(s.duration)}`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* no LoAF: the frames still count */
  }
  // The hand-in: `.detail` gets data-paper="in".
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.attributeName === 'data-paper' && m.target.dataset?.paper === 'in') A.onAt = performance.now();
    }
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-paper'] });
  // The click's own time, for the tile route.
  window.addEventListener('pointerdown', (e) => (A.downAt = e.timeStamp), { capture: true });
}

/** A pointer that never rests: moves around `at()` every ~16 ms until stopped. */
function movingPointer(page, at) {
  const st = { stop: false, at };
  const done = (async () => {
    let k = 0;
    while (!st.stop) {
      k++;
      const p = st.at();
      await page.mouse.move(p.x + 6 * Math.sin(k / 3), p.y + 5 * Math.cos(k / 4)).catch(() => {});
      await page.waitForTimeout(16).catch(() => {});
    }
  })();
  return { set: (fn) => (st.at = fn), stop: async () => ((st.stop = true), await done) };
}

/** The frames from `t0` to the settled hero (hand-in + SETTLE_MS), and what
 *  ran in the long ones. Waits for the settle itself. */
async function arrivalWindow(page, t0Expr) {
  await page.waitForFunction(() => window.__arr.onAt > 0, null, { timeout: 20000 });
  await page.waitForFunction((ms) => performance.now() > window.__arr.onAt + ms + 120, SETTLE_MS, { timeout: 5000 });
  return page.evaluate(
    ({ t0Expr, SETTLE_MS }) => {
      const A = window.__arr;
      const t0 = eval(t0Expr);
      const end = A.onAt + SETTLE_MS;
      const frames = A.frames.filter(([s, e]) => e > t0 && s < end).map(([s, e]) => ({ s: s - t0, dt: e - s }));
      const measures = performance.getEntriesByType('measure').filter((m) => m.name.startsWith('paper:') && m.startTime + m.duration > t0);
      const long = frames
        .filter((f) => f.dt > 17)
        .map((f) => {
          const a = f.s + t0;
          const b = a + f.dt;
          const lo = A.loaf.filter((l) => l.start < b && l.end > a);
          const ms = measures.filter((m) => m.startTime < b && m.startTime + m.duration > a && m.duration >= 1);
          return {
            at: Math.round(f.s),
            dt: f.dt,
            what: [
              ...lo.map((l) => `LoAF ${Math.round(l.end - l.start)}ms (render ${Math.round(l.render)})${l.scripts.length ? `: ${l.scripts.join(', ')}` : ''}`),
              ...ms.map((m) => `${m.name} ${m.duration.toFixed(1)}`),
            ].join('; '),
          };
        });
      return {
        frames: frames.map((f) => f.dt),
        long,
        handIn: A.onAt - t0,
        gl: window.__glMade,
        paperContexts: window.__paper?.contexts?.() ?? null,
      };
    },
    { t0Expr, SETTLE_MS },
  );
}

/** `enforce` false: printed against the budget, never a failure (a cold
 *  direct load, which waits on the page's own load — see checkArrival). */
function judgeArrival(label, w, { enforce = true } = {}) {
  const sorted = [...w.frames].sort((a, b) => a - b);
  const worst = sorted.at(-1) ?? Infinity;
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] ?? Infinity;
  const over = w.frames.filter((d) => vsyncs(d) > 1).length;
  const within = vsyncs(worst) <= ARRIVAL.worst && vsyncs(p95) <= ARRIVAL.p95;
  const detail = `${w.frames.length} frames, worst ${worst.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, ${over} of them dropped a frame or more; handed in at ${Math.round(w.handIn)}ms, settled at ${Math.round(w.handIn + SETTLE_MS)}ms`;
  if (enforce) check(within, label, detail);
  else {
    console.log(`  · ${label} (informational)  ${detail}; ${within ? 'within' : 'over'} the budget`);
    if (!within) console.log('      waits on page-load work, not the paper: the same frames are there with the paper removed (docs/detail-paper.md, "The arrival")');
  }
  for (const l of w.long) console.log(`      ${String(l.at).padStart(5)}ms  ${l.dt.toFixed(1)}ms  ${l.what || '(nothing on the main thread: compositor / GPU)'}`);
  return { worst, p95 };
}

/** Focus card `idx` in the grid with the arrow keys; its tile's centre. */
async function focusTile(page, idx) {
  for (let i = 0; i < idx; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('.grid-card')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight / 2);
      if (!best || d < best.d) best = { d, x: r.x + r.width / 2, y: r.y + r.height * 0.35 };
    }
    return best;
  });
}

async function checkArrival(browser) {
  console.log('\narrival: the tile click (or the navigation) to the settled hero, 1728×996 @2×, pointer moving');
  // `?nodials`: without the dev dials' panels and readouts (App.tsx), which a
  // production build does not have. (The dock itself is only at `?intro`.) A
  // production build ignores it.
  const B = `${ORIGIN}/?nodials`;
  const contexts = [];
  const worst = [];
  for (const card of ['01', '02', '03', '04']) {
    const idx = +card - 1;
    // The tile's morph: the grid first, the pointer moving from its first
    // frame; the card focused with the keys, hovered, clicked. Then back to
    // the grid and the same card again.
    {
      const page = await newPage(browser, VIEWPORTS[0], 2);
      await page.addInitScript(arrivalProbe);
      const ptr = movingPointer(page, () => ({ x: 300, y: 300 }));
      await page.goto(B);
      await page.waitForSelector('.grid-card');
      await page.waitForTimeout(1500);
      const grid = await page.evaluate(() => window.__glMade);
      for (const temp of ['cold', 'warm']) {
        const tile = await focusTile(page, temp === 'cold' ? idx : 0);
        ptr.set(() => tile);
        await page.waitForTimeout(600); // on the tile, as a person is before a click
        await page.evaluate(() => (window.__arr.onAt = 0));
        await page.mouse.down();
        await page.mouse.up();
        const w = await arrivalWindow(page, 'window.__arr.downAt');
        worst.push(judgeArrival(`#${card} tile ${temp}`, w));
        contexts.push({ label: `#${card} tile ${temp}`, grid, detail: w.gl, paper: w.paperContexts });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.detail'), null, { timeout: 10000 });
        ptr.set(() => ({ x: 300, y: 300 }));
        await page.waitForTimeout(1500);
      }
      await ptr.stop();
      await page.context().close();
    }
    // Direct: a fresh load of #item-NN, then back to the grid and the hash
    // again. The cold window opens at the page's first contentful paint:
    // before it there is nothing on screen to stutter (the boot — the
    // bundle's evaluation, React's first render, the sky's context — is page
    // load, and is printed below the check, not judged). The cold row is
    // INFORMATIONAL: after the first paint the page is still loading (the
    // compositor and GPU with its first frames and decodes, card 04's Rive
    // runtime for the hidden grid's tiles), and those frames drop whether the
    // paper is there or not. It waits on page-load work; the warm row is
    // enforced.
    {
      const page = await newPage(browser, VIEWPORTS[0], 2);
      await page.addInitScript(arrivalProbe);
      const ptr = movingPointer(page, () => ({ x: 864, y: 498 }));
      await page.goto(`${B}#item-${card}`);
      const cold = await arrivalWindow(page, 'window.__arr.fcp');
      worst.push(judgeArrival(`#${card} direct cold`, cold, { enforce: false }));
      const boot = await page.evaluate(() => ({ fcp: window.__arr.fcp, first: window.__arr.frames.filter(([, e]) => e <= window.__arr.fcp).map(([s, e]) => Math.round(e - s)) }));
      console.log(`      (the page's boot, not judged: first contentful paint at ${Math.round(boot.fcp)}ms; frames before it ${boot.first.join(', ') || 'none'} ms)`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.detail'), null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      const grid = await page.evaluate(() => window.__glMade);
      await page.evaluate((c) => {
        window.__arr.onAt = 0;
        window.__arr.navAt = performance.now();
        location.hash = `#item-${c}`;
      }, card);
      const warm = await arrivalWindow(page, 'window.__arr.navAt');
      worst.push(judgeArrival(`#${card} direct warm`, warm));
      contexts.push({ label: `#${card} direct`, grid, detail: warm.gl, first: cold.gl, paper: warm.paperContexts });
      await ptr.stop();
      await page.context().close();
    }
  }
  // Contexts: however many arrivals, the paper's is made once.
  const tiles = contexts.filter((c) => c.label.includes('tile'));
  const direct = contexts.filter((c) => c.label.includes('direct'));
  const byCard = (xs) => xs.map((c) => `${c.label}: grid ${c.grid}, detail ${c.detail}${c.paper !== null ? ` (paper ${c.paper})` : ''}`).join('; ');
  const pairs = [];
  for (let i = 0; i < tiles.length; i += 2) pairs.push([tiles[i], tiles[i + 1]]);
  check(
    pairs.every(([a, b]) => b.detail === a.detail && a.detail <= a.grid + 1) &&
      direct.every((c) => c.detail === c.first) &&
      contexts.every((c) => c.paper === null || c.paper === 1),
    'WebGL contexts: the paper makes one, once',
    byCard(contexts),
  );
  return worst;
}

// ── detailSideScale ─────────────────────────────────────────────────────

async function checkSideScale(browser) {
  console.log('\nsidescale: detailSideScale across its range, card 04 the hero, pointer moving on it');
  const page = await newPage(browser, VIEWPORTS[0], 2);
  await page.goto(B);
  await page.waitForFunction(() => !!window.__covers && !!window.__config, null, { timeout: 10000 });
  await page.goto(`${B}#item-04`);
  await page.waitForFunction(
    () => window.__paper?.state() === 'on' && (window.__covers.rive.instance('nosey')?.plane?.version ?? 0) > 0,
    null,
    { timeout: 20000 },
  );
  const hero = await page.evaluate(() => window.__paper.rects().find((r) => r.slot === 0));
  const ptr = movingPointer(page, () => ({ x: hero.cx - hero.w * 0.2, y: hero.cy }));
  const read = () =>
    page.evaluate(() => {
      const st = window.__covers.rive.status('nosey');
      return {
        paper: window.__paper.state(),
        inst: st.instance?.instances ?? 0,
        plane: st.plane && performance.now() - st.plane.t < 500 ? st.plane.shows : 'not drawn',
      };
    });
  const seen = [];
  for (const s of [0.3, 0.45, 0.6, 0.75, 0.85, 0.95, 0.99, 1, 0.99, 0.85, 0.3]) {
    await page.evaluate((s) => window.__config.set({ detailSideScale: s }), s);
    // A new side size is a new set of faces: the paper hands back, uploads
    // and hands in again.
    await page.waitForFunction(() => window.__paper.state() === 'on', null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200); // three grace periods of pointer moves
    seen.push({ s, ...(await read()) });
  }
  await page.evaluate(() => window.__config.set({ detailSideScale: 1 }));
  await ptr.stop();
  check(
    seen.every((x) => x.paper === 'on' && x.plane === 'live' && x.inst === 1),
    'the hero stays instance #1, live on the paper, at every side scale',
    seen.map((x) => `${x.s}: ${x.paper}, plane ${x.plane}, #${x.inst}`).join(' | '),
  );
  await page.context().close();
}

/** The hero is sized after the chrome's bands (src/layout/hero.ts): the spec,
 *  at every viewport (scripts/layout-checks.mjs). */
async function checkDetailLayout(browser) {
  await checkLayout({
    browser,
    view: 'detail',
    states: ['01'],
    open: (page, item) => open(page, item),
    check,
    errors,
    shots: SHOTS,
  });
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    if (ONLY.includes('rects')) await checkRects(browser);
    if (ONLY.includes('identity')) await checkIdentity(browser);
    if (ONLY.includes('handoff')) await checkHandoff(browser);
    if (ONLY.includes('sprites')) await checkSprites(browser);
    if (ONLY.includes('registration')) await checkRegistration(browser);
    if (ONLY.includes('routes')) await checkRoutes(browser);
    if (ONLY.includes('nav')) await checkNav(browser);
    if (ONLY.includes('leave')) await checkLeave(browser);
    if (ONLY.includes('frames')) await checkFrames(browser);
    if (ONLY.includes('reduced')) await checkReduced(browser);
    if (ONLY.includes('life')) await checkLife(browser);
    if (ONLY.includes('arrival')) await checkArrival(browser);
    if (ONLY.includes('sidescale')) await checkSideScale(browser);
    if (ONLY.includes('layout')) await checkDetailLayout(browser);
  } finally {
    await browser.close();
  }
  const noise = errors.filter((e) => !/Download the React DevTools|favicon/.test(e));
  check(noise.length === 0, 'no page errors', noise.slice(0, 3).join(' | '));
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
