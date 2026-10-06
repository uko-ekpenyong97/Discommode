/**
 * THE SHADER COVERS AS LIVE SIDE CARDS — cards 02 (rive-site, the lava) and
 * 03 (drex) — for `npm run verify:cover` (docs/covers.md, "The live side
 * card"). Card 04's are `rside`, `rjump` and `rbudgets`; these are theirs. Run
 * in real Chrome, the pointer moving from the first frame; each was run once
 * against the broken path in brackets (`--fault <name>`, src/covers/faults.ts)
 * and failed there.
 *
 *   sside     each as the side card of both its neighbours: the DOM side
 *             card's canvas drawn, then the paper's side plane live, its
 *             pixels moving at rest (the lava drifting; the light on its
 *             `restMode`), while the pointer circles the centre card — whose
 *             dome comes up — and then the side card, whose dome stays at
 *             rest; on a tablet (touch only) a finger on the side card moves
 *             nothing, on the centre card its dome. Under reduced motion and
 *             without WebGL, and card 03 with
 *             its logo failing to load: the still. [sidestill, sideinput]
 *   sjump     NO JUMP, as `rjump`: grid → centre (the morph from a hovered
 *             tile), centre → side (ArrowRight with the pointer still on the
 *             card, warm), side → centre (ArrowLeft), grid → side (the next
 *             card's tile clicked). The cover clock pinned and walked a
 *             1/60 s step a frame; every frame what the surface on screen
 *             last drew — its clock and its dome — redrawn at a fixed size
 *             and compared with the frame before. Over a change of surface:
 *             pixels ≤ max(3 × the run's p95, 0.5%), the dome's height and
 *             card 02's warmth ≤ max(3 × p95, 0.05), the clock +0–4 frames.
 *             [sidestill, siderest]
 *   sbudgets  per frame, per cover and role (centre, side): the paper's draw
 *             of it, main-thread ms + GPU ms (a timer query), the pointer
 *             circling the centre card: p95 ≤ 2.0, and every live cover of a
 *             frame together.
 */

/** card → its cover id, its content index, and its two neighbours' card numbers. */
export const SHADER_SIDES = [
  { card: '02', id: 'rive-site', idx: 1, centres: ['01', '03'] },
  { card: '03', id: 'drex', idx: 2, centres: ['02', '04'] },
];
const SIDE_BUDGET = 2.0;

/**
 * Share of pixels that moved by more than `tol` levels. A side card is drawn
 * at the strip's side opacity, and dimmed further while the pointer is on the
 * centre card (hover-to-isolate), so the lava's drift moves few pixels past
 * the suites' usual 32: motion is judged past 8.
 */
function moved(a, b, tol = 8) {
  let d = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > tol) d++;
  }
  return d / (a.length / 3);
}

/** Card `idx`'s on-screen panel (CSS px, clipped to the viewport), or null. */
const panelOf = (page, idx) =>
  page.evaluate((idx) => {
    let best = null;
    for (const el of document.querySelectorAll(`.detail__panel[data-idx="${idx}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > innerWidth) continue;
      const d = Math.abs(r.x + r.width / 2 - innerWidth / 2);
      if (!best || d < best.d) best = { d, el, r, centre: el.classList.contains('detail__panel--center') };
    }
    if (!best) return null;
    const { r } = best;
    const x0 = Math.max(0, r.x);
    const x1 = Math.min(innerWidth, r.right);
    return { x: x0, y: r.y, w: x1 - x0, h: r.height, centre: best.centre };
  }, idx);

const plane = (page, idx) =>
  page.evaluate((idx) => window.__paper.planes().find((p) => p.idx === idx && p.slot <= 1) ?? null, idx);

export async function checkSideLive(h) {
  const { browser, B, newPage, check, quiet, grab, heroRect, movingAround, pct, VIEWPORT, errors } = h;
  console.log('\nshader side cards: cards 02 and 03 beside the centre card are live, at rest, and the pointer only moves the centre card');
  for (const s of SHADER_SIDES) {
    for (const [dpr, centre] of [
      [1, s.centres[0]],
      [2, s.centres[0]],
      [2, s.centres[1]],
    ]) {
      const page = await newPage(browser, VIEWPORT, dpr);
      const tag = `@${dpr}× card ${s.card} beside ${centre}`;
      await page.goto(B);
      await page.waitForFunction(() => !!window.__covers, null, { timeout: 15000 });
      await quiet(page);
      await page.goto(`${B}#item-${centre}`);
      const hr = await heroRect(page);
      let ptr = movingAround(page, { x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.5 });
      const dom = await page
        .waitForFunction(
          (id) => {
            const el = [...document.querySelectorAll(`.detail__panel:not(.detail__panel--center) .cover-tile[data-cover="${id}"]`)].find((t) => {
              const r = t.closest('.detail__panel').getBoundingClientRect();
              return r.right > 0 && r.left < innerWidth;
            });
            return el && 'drawn' in el.dataset && el.querySelector('.cover-tile__canvas') ? true : null;
          },
          s.id,
          { timeout: 8000 },
        )
        .then(() => true)
        .catch(() => false);
      await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__paper.presence() >= 1, null, { timeout: 20000 });
      await page.waitForTimeout(600);
      const p = await panelOf(page, s.idx);
      const pl0 = await plane(page, s.idx);
      const n0 = await page.evaluate(() => window.__paper.coversDrawn());
      const a = await grab(page, p, dpr, 150, 195);
      await page.waitForTimeout(1500);
      const b = await grab(page, p, dpr, 150, 195);
      const n1 = await page.evaluate(() => window.__paper.coversDrawn());
      const motion = moved(a, b);
      // The pointer on the centre card: the centre's dome comes up (the
      // control), this side card's stays at rest.
      const centreId = { '01': null, '02': 'rive-site', '03': 'drex', '04': null }[centre];
      const centreUp = centreId ? (await page.evaluate((id) => window.__covers.probe.dome(id), centreId)).amp : null;
      const sideOnCentre = await page.evaluate((id) => window.__covers.probe.dome(id), s.id);
      await ptr.stop();
      // Then the pointer circling the side card itself for 1.2 s.
      ptr = movingAround(page, { x: p.x + p.w * 0.5, y: p.y + p.h * 0.45 });
      let worst = 0;
      let unsettled = false;
      for (let k = 0; k < 12; k++) {
        await page.waitForTimeout(100);
        const d = await page.evaluate((id) => window.__covers.probe.dome(id), s.id);
        worst = Math.max(worst, d.amp);
        unsettled ||= !d.settled;
      }
      await ptr.stop();
      const pl1 = await plane(page, s.idx);
      check(
        dom && !p.centre && pl0?.shows === 'live' && pl1?.shows === 'live' && pl1.slot === 1 && n1 - n0 > 30 && motion > 0.02 && worst === 0 && !unsettled && sideOnCentre.amp === 0 && (centreUp === null || centreUp > 0.5),
        tag,
        `DOM side canvas drawn: ${dom}; the paper's side plane ${pl1?.shows} (slot ${pl1?.slot}); the paper drew live covers ${n1 - n0} times in 1.5 s; ${pct(motion)} of the side card's pixels moved (> 8 levels); the pointer on the centre card: ${centreId ? `its dome ${centreUp.toFixed(2)}, ` : ''}this card's ${sideOnCentre.amp.toFixed(2)}; on this card: its dome at most ${worst.toFixed(3)}${unsettled ? ', its warmth NOT settled' : ''}`,
      );
      await page.context().close();
    }
  }
  // A tablet (touch only, as rtouch's): the same side cards, and a finger
  // dragged across the side card moves nothing; across the centre card it
  // moves the centre's dome.
  {
    const page = await newPage(browser, { width: 1180, height: 820 }, 2, { hasTouch: true, isMobile: false });
    await page.goto(B);
    await page.waitForFunction(() => !!window.__covers, null, { timeout: 15000 });
    await quiet(page); // the dev overlays sit over the side card and would take the finger
    await page.goto(`${B}#item-03`); // sides 02 and 04
    await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__paper.presence() >= 1, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const cdp = await page.context().newCDPSession(page);
    const drag = async (r) => {
      const pts = [];
      // A small circle (radius 16 px), under the strip's swipe thresholds
      // (48 px across, 80 down): a finger resting and moving, not a swipe.
      for (let i = 0; i <= 16; i++) pts.push({ x: r.x + r.w * 0.5 + 16 * Math.cos(i / 2.5), y: r.y + r.h * 0.5 + 16 * Math.sin(i / 2.5) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
      let worst = { side: 0, centre: 0 };
      for (const pt of pts.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
        await page.waitForTimeout(40);
        const d = await page.evaluate(() => ({ side: window.__covers.probe.dome('rive-site').amp, centre: window.__covers.probe.dome('drex').amp }));
        worst = { side: Math.max(worst.side, d.side), centre: Math.max(worst.centre, d.centre) };
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return worst;
    };
    const side = await panelOf(page, 1);
    const onSide = side ? await drag({ x: side.x, y: side.y + side.h * 0.2, w: side.w, h: side.h * 0.2 }) : null;
    await page.waitForTimeout(400);
    const centre = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const [x, y, w, h] = ['--hero-x', '--hero-y', '--hero-w', '--hero-h'].map((k) => parseFloat(s.getPropertyValue(k)));
      return { x, y: y + h * 0.4, w: w * 0.5, h: h * 0.2 };
    });
    const onCentre = await drag(centre);
    const planes = await page.evaluate(() => window.__paper.planes().filter((p) => p.slot === 1).map((p) => `${p.idx + 1} ${p.shows}`));
    const hash = await page.evaluate(() => location.hash);
    check(
      !!onSide && onSide.side === 0 && onCentre.centre > 0.3 && onCentre.side === 0 && planes.every((p) => p.endsWith('live')) && hash === '#item-03',
      'tablet 1180×820 @2×, touch: 02 and 04 live beside 03; a finger moves only the centre card',
      `side planes ${planes.join(', ')}; a finger across card 02's side card: its dome ${onSide?.side.toFixed(3)}; across the centre card: card 03's dome ${onCentre.centre.toFixed(2)}, card 02's ${onCentre.side.toFixed(3)}; still at ${hash}`,
    );
    await page.context().close();
  }
  // Reduced motion, no WebGL, and a cover whose assets fail: the still.
  for (const [label, extra, init, route] of [
    ['reduced motion', { reducedMotion: 'reduce' }, null, null],
    [
      'no WebGL',
      {},
      () => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...a) {
          return /webgl/.test(type) ? null : orig.call(this, type, ...a);
        };
      },
      null,
    ],
    ["card 03's logo fails to load", {}, null, '**/projects/drex/cover-logo.svg'],
  ]) {
    const page = await newPage(browser, VIEWPORT, 2, extra, init);
    const errorsBefore = errors.length;
    if (route) await page.route(route, (r) => r.abort());
    await page.goto(`${B}#item-01`);
    await page.waitForTimeout(400);
    await page.goto(`${B}#item-02`); // sides 01 and 03
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => {
      const sides = [...document.querySelectorAll('.detail__panel:not(.detail__panel--center) .cover-tile[data-cover]')].filter((t) => {
        const b = t.closest('.detail__panel').getBoundingClientRect();
        return b.right > 0 && b.left < innerWidth;
      });
      return {
        sides: sides.map((t) => ({
          id: t.dataset.cover,
          canvas: !!t.querySelector('.cover-tile__canvas'),
          drawn: 'drawn' in t.dataset,
          still: (() => {
            const i = t.querySelector('.cover-tile__still');
            return !!i && i.complete && i.naturalWidth > 0;
          })(),
        })),
        planes: window.__paper ? window.__paper.planes().filter((p) => p.slot === 1).map((p) => `${p.idx + 1}:${p.shows}`) : [],
      };
    });
    const drex = r.sides.find((x) => x.id === 'drex');
    const plane03 = r.planes.find((x) => x.startsWith('3:'));
    // The aborted request's own console line is the point of the case.
    if (route) errors.splice(errorsBefore, errors.length - errorsBefore, ...errors.slice(errorsBefore).filter((e) => !/ERR_FAILED/.test(e)));
    // Without WebGL there is no paper to draw a plane ('none'): the DOM is the card.
    check(
      !!drex && drex.still && !drex.drawn && (!plane03 || plane03 === '3:still' || (label === 'no WebGL' && plane03 === '3:none')),
      `${label}: card 03 beside 02 is its still`,
      `DOM: ${drex ? `${drex.canvas ? 'a canvas, ' : 'no canvas, '}${drex.drawn ? 'DRAWN' : 'never drawn'}, the still ${drex.still ? 'loaded' : 'MISSING'}` : 'no side card'}; the paper: ${r.planes.join(', ') || 'none (no WebGL)'}`,
    );
    await page.context().close();
  }
}

/**
 * One run of the no-jump recorder (in the page) around `act`, for cover `id`:
 * the clock pinned and walked a 1/60 s step a frame; every frame, what the
 * surface on screen last drew, redrawn at W × H, against the frame before.
 */
async function sideJumpRun(page, id, act, { until, ms = 1600 }) {
  await page.evaluate((id) => {
    const P = window.__covers.probe;
    P.set({ drawn: true });
    const J = (window.__sj = { on: true, t: window.__covers.time(), prev: null, rows: [] });
    window.__covers.pin(J.t);
    const W = 240;
    const H = 312;
    const f = () => {
      if (!J.on) return;
      const s = P.shown(id);
      const snap = P.snapshot(id, W, H);
      let d = 0;
      if (snap && J.prev) {
        for (let k = 0; k < snap.length; k += 4) {
          if (Math.max(Math.abs(snap[k] - J.prev[k]), Math.abs(snap[k + 1] - J.prev[k + 1]), Math.abs(snap[k + 2] - J.prev[k + 2])) > 32) d++;
        }
        d /= W * H;
      }
      J.prev = snap ? snap.slice() : null;
      J.rows.push({ d, surface: s?.surface ?? '', t: s?.t ?? -1, amp: s?.amp ?? 0, heat: s?.heat ?? 0, wall: performance.now() });
      J.t += 1 / 60;
      window.__covers.pin(J.t);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, id);
  await page.waitForTimeout(500); // the control's frames, before the change
  await act();
  if (until) await page.waitForFunction(until, null, { timeout: 15000 });
  await page.waitForTimeout(ms);
  const rows = await page.evaluate(() => {
    window.__sj.on = false;
    window.__covers.probe.set({ drawn: false });
    return window.__sj.rows;
  });
  await page.evaluate(() => window.__covers.pin(null));
  rows.shift(); // no frame before it
  // Each frame's change PER VSYNC: the domes ease by wall time, so a long
  // frame (the click's, a morph's first) moves them further for nothing.
  const per = rows.map((r, k) => {
    const v = k > 0 ? Math.max(1, Math.round((r.wall - rows[k - 1].wall) / (1000 / 60))) : 1;
    return {
      d: r.d / v,
      amp: k > 0 ? Math.abs(r.amp - rows[k - 1].amp) / v : 0,
      heat: k > 0 ? Math.abs(r.heat - rows[k - 1].heat) / v : 0,
    };
  });
  const switches = [];
  const near = new Set();
  rows.forEach((r, k) => {
    if (k === 0 || r.surface === rows[k - 1].surface) return;
    // A change is judged over its frame and the two after it (a hand-off
    // frame's motion can land in the next), against the motion AROUND it:
    // the frames after (k+3 … k+8). A dome easing out or in as the card
    // changes role — the light gliding home, the warmth fading — moves as
    // much on the frames after the change as on it; a snap to rest, or to
    // the still, moves everything on the change's frame and nothing after.
    const at = { d: 0, amp: 0, heat: 0 };
    const after = { d: 0, amp: 0, heat: 0 };
    // The least a warm dome (or warmth) kept, per vsync, over the change: a
    // glide keeps most of it each frame, a snap to rest keeps none.
    let keep = 1;
    for (let j = k; j <= k + 8 && j < rows.length; j++) {
      const o = j <= k + 2 ? at : after;
      if (j <= k + 2) {
        near.add(j);
        const v = Math.max(1, Math.round((rows[j].wall - rows[j - 1].wall) / (1000 / 60)));
        for (const key of ['amp', 'heat']) {
          const a = rows[j - 1][key];
          const b = rows[j][key];
          if (a > 0.05 && b < a) keep = Math.min(keep, Math.pow(Math.max(0, b) / a, 1 / v));
        }
      }
      for (const key of ['d', 'amp', 'heat']) o[key] = Math.max(o[key], per[j][key]);
    }
    const dc = rows[Math.min(k + 2, rows.length - 1)].t - rows[k - 1].t;
    switches.push({ k, from: rows[k - 1].surface, to: r.surface, at, after, keep, dc, ampBefore: rows[k - 1].amp, heatBefore: rows[k - 1].heat });
  });
  const control = per.filter((r, k) => k > 0 && !near.has(k));
  return { rows, switches, control };
}

export async function checkSideJump(h) {
  const { browser, B, newPage, check, quiet, focusedTile, heroRect, movingAround, pctl, pct, VIEWPORT } = h;
  console.log('\nshader no jump: cards 02 and 03 through grid → centre → side → centre, and grid → side — the same clock and state across every change');
  /**
   * Over each change of surface (its frame and the two after it):
   *   the STATE — a dome (or card 02's warmth) above 0.05 keeps at least half
   *     of itself per vsync. Easing out at the cover's own rate keeps 0.6–0.9
   *     (card 03's light: 0.88 a frame); a snap to rest keeps 0;
   *   the PIXELS, per vsync — what was drawn, redrawn at a fixed size —
   *     PRINTED beside the most the frames after it move, not judged: the
   *     redraw is a function of the clock and the dome and nothing else, so
   *     the two are what is judged. (`rjump` judges card 04's pixels because
   *     a Rive instance's state cannot be read; a shader cover's can.) Card
   *     03's light gliding home from a click moves 12–23% of the redraw's
   *     pixels in its first frame, more than any quiet frame;
   *   the CLOCK — on by 0–4 frames, never back to 0;
   *   and every surface the route goes through drew it (a still draws
   *   nothing: `sidestill` is a missing surface).
   */
  const judge = (label, r, expect) => {
    const p95 = { d: pctl(r.control.map((c) => c.d), 0.95) };
    const over = r.switches.filter((s) => s.keep < 0.5);
    const seenRoles = expect.every((e) => r.switches.some((s) => s.to === e));
    const clockOk = r.switches.every((s) => s.dc >= 0 && s.dc <= 4 / 60 + 1e-6);
    const each = r.switches
      .map(
        (s) =>
          `${s.from}→${s.to} [dome ${s.ampBefore.toFixed(2)}${s.heatBefore ? `, warmth ${s.heatBefore.toFixed(2)}` : ''}]: kept ${s.keep.toFixed(2)} ≥ 0.5, px ${pct(s.at.d)} (after: ${pct(s.after.d)}), clock +${(s.dc * 60).toFixed(1)}`,
      )
      .join(' | ');
    check(
      r.switches.length > 0 && seenRoles && over.length === 0 && clockOk,
      label,
      `${each} (per vsync; quiet p95 ${pct(p95.d)} of ${r.control.length} frames)${seenRoles ? '' : `; MISSING a change into ${expect.join(', ')}`}`,
    );
  };
  for (const s of SHADER_SIDES) {
    for (const dpr of [1, 2]) {
      const page = await newPage(browser, VIEWPORT, dpr);
      const tag = `@${dpr}× card ${s.card}`;
      // grid → centre: the card's tile hovered (warm), then clicked.
      await page.goto(B, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__covers && window.__covers.frames() > 3, null, { timeout: 20000 });
      await quiet(page);
      for (let i = 0; i < s.idx; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(900);
      let tile = await focusedTile(page);
      let ptr = movingAround(page, { x: tile.x + tile.w * 0.5, y: tile.y + tile.h * 0.55 });
      await page.waitForTimeout(800);
      const a = await sideJumpRun(page, s.id, async () => {
        await ptr.stop();
        await page.mouse.click(tile.x + tile.w * 0.5, tile.y + tile.h * 0.55);
        ptr = movingAround(page, async () => {
          const hr = await heroRect(page);
          return { x: hr.x + hr.w * 0.5, y: hr.y + hr.h * 0.5 };
        });
      }, { until: () => window.__paper?.state() === 'on' });
      judge(`${tag} grid → centre`, a, ['morph', 'paper centre']);
      // centre → side: ArrowRight with the pointer still on the centre card —
      // the card leaves warm, and slides left as the side card.
      await page.waitForTimeout(700);
      const b = await sideJumpRun(page, s.id, () => page.keyboard.press('ArrowRight'), { ms: 1800 });
      judge(`${tag} centre → side (left warm)`, b, ['paper side']);
      // side → centre: ArrowLeft, back.
      const c = await sideJumpRun(page, s.id, () => page.keyboard.press('ArrowLeft'), { ms: 1800 });
      judge(`${tag} side → centre`, c, ['paper centre']);
      await ptr.stop();
      // grid → side: the NEXT card's tile clicked; this one travels in beside it.
      await page.goto('about:blank');
      await page.goto(B, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__covers && window.__covers.frames() > 3, null, { timeout: 20000 });
      await quiet(page);
      for (let i = 0; i < s.idx + 1; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(900);
      tile = await focusedTile(page);
      ptr = movingAround(page, { x: tile.x + tile.w * 0.5, y: tile.y + tile.h * 0.55 });
      await page.waitForTimeout(500);
      const d = await sideJumpRun(page, s.id, async () => {
        await ptr.stop();
        await page.mouse.click(tile.x + tile.w * 0.5, tile.y + tile.h * 0.55);
      }, { until: () => window.__paper?.state() === 'on' });
      judge(`${tag} grid → side`, d, ['morph', 'paper side']);
      await page.context().close();
    }
  }
}

/**
 * Per frame, per cover and role: the main-thread ms of the paper's draw, read
 * every frame (the probe; a 0.1 ms clock) while the pointer circles the
 * centre card, p95 — plus the GPU ms of the same draw at the same size, as
 * `budgets` measures it (bench.ts: batches closed by a pixel read; here its
 * TOTAL, the floor included), benched `GPU_RUNS` times, p95. The side card
 * is benched at rest, the centre card warm (under the pointer). Main has no
 * probe: its rows say so, and its side cards are stills (no cover work).
 */
const GPU_RUNS = 6;
export async function checkSideBudgets(h) {
  const { browser, B, newPage, check, heroRect, pctl, mean, ms, viewports } = h;
  console.log(`\nshader side budgets: per frame, per cover and role, the paper's draw — main-thread p95 + GPU p95 (≤ ${SIDE_BUDGET}), the pointer circling the centre card`);
  const out = [];
  for (const [vp, dpr] of viewports) {
    const page = await newPage(browser, vp, dpr);
    const tag = `${vp.width}×${vp.height} @${dpr}×`;
    await page.goto(B);
    await page.waitForFunction(() => !!window.__covers, null, { timeout: 15000 });
    const probe = await page.evaluate(() => !!window.__covers.probe);
    for (const item of ['01', '02', '03', '04']) {
      await page.goto(`${B}#item-${item}`);
      await page.waitForFunction(() => window.__paper?.state() === 'on' && window.__paper.presence() >= 1, null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const hr = await heroRect(page);
      if (probe) await page.evaluate(() => window.__covers.probe.set({ cost: true }));
      for (let i = 0; i < 150; i++) {
        const a = (i / 150) * Math.PI * 4;
        await page.mouse.move(hr.x + hr.w * (0.5 + 0.4 * Math.cos(a)), hr.y + hr.h * (0.5 + 0.4 * Math.sin(a)));
        await page.waitForTimeout(16);
      }
      const rows = probe ? await page.evaluate(() => window.__covers.probe.costs()) : [];
      if (probe) await page.evaluate(() => window.__covers.probe.set({ cost: false }));
      // Which shader covers this item shows live, in which role.
      // (A build without `planes` — main — has live shader covers only in
      // the centre: its side cards are stills.)
      const live = await page.evaluate(
        (centre) =>
          window.__paper.planes
            ? window.__paper
                .planes()
                .filter((p) => p.slot <= 1 && p.shows === 'live')
                .map((p) => ({ idx: p.idx, role: p.slot === 0 ? 'centre' : 'side' }))
            : [{ idx: centre, role: 'centre' }],
        Number(item) - 1,
      );
      const ids = { 1: 'rive-site', 2: 'drex' };
      let frame = 0;
      for (const { idx, role } of live) {
        const id = ids[idx];
        if (!id) continue; // card 04: rbudgets
        const gpu = [];
        for (let k = 0; k < GPU_RUNS; k++) {
          const b = await page.evaluate(([id, warm]) => window.__paper.benchCover(id, warm), [id, role === 'centre']);
          if (b) gpu.push(b.total);
        }
        const cpu = rows.filter((r) => r.id === id && r.role === role).map((r) => r.cpu);
        const cpuP95 = cpu.length ? pctl(cpu, 0.95) : null;
        const gpuP95 = pctl(gpu, 0.95);
        const p95 = (cpuP95 ?? 0) + gpuP95;
        frame += p95;
        out.push({ vp: tag, item, id, role, frames: cpu.length, cpuP95, cpuMean: cpu.length ? mean(cpu) : null, gpuP95, gpuMedian: pctl(gpu, 0.5), p95 });
        check(
          p95 <= SIDE_BUDGET && (!probe || cpu.length > 100),
          `${tag} #item-${item}: ${id} as the ${role} card`,
          `main thread ${cpuP95 === null ? 'n/a (no probe)' : `p95 ${ms(cpuP95)} over ${cpu.length} frames`}; GPU (draw + floor) p95 ${ms(gpuP95)} of ${gpu.length} benches; per frame ${ms(p95)} ≤ ${SIDE_BUDGET}`,
        );
      }
      console.log(`    #item-${item}: every live shader cover of the frame together ${ms(frame)}`);
      out.push({ vp: tag, item, id: 'frame', role: 'all', p95: frame });
    }
    await page.context().close();
  }
  return out;
}
