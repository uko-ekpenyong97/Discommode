import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

/**
 * DRAGGING THE GRID — `verify:cover --only drag` (docs/covers.md, "Sizing from
 * the layout box"). The covers must not flicker while the grid is dragged:
 *
 *   writes    no canvas on the page gets a new backing store (a `width` or
 *             `height` write, which clears it) while the grid moves — dragged,
 *             or its transform changed in the last two frames (the settle) —
 *             logged by a hook on HTMLCanvasElement's setters, installed
 *             before the app's scripts. Writes in a case's pauses, the grid
 *             at rest between two flings (card 03's hero print, warmed for a
 *             pointer resting on its tile), are printed, not judged
 *   blank     no frame where a visible grid tile shows nothing: its canvas
 *             empty (never drawn, or cleared) and its still not shown
 *   live      no frame where a visible tile shows its STILL while another
 *             tile of the same cover is live: a wrapped tile is primed from a
 *             sibling's canvas (or the Rive player's) before it is painted, so
 *             it never shows another moment and then jumps to the live one.
 *             (The still is for when there is no source at all.)
 *   siblings  every visible tile of a cover at rest shows the same pixels as
 *             the others in the same frame (they share one draw); a tile whose
 *             card had the pointer in the last 3 s — hit-tested, so its hover
 *             plate counts — is left out (its own dome's draw)
 *   spikes    no tile's sample leaves and comes back in one frame (> 24 of
 *             255 out, the frames either side within 12): the cleared or
 *             mis-sized frame between two good ones
 *   frames    no frame over 33 ms while dragging and settling. Judged on a
 *             production build (`vite preview`) only; on the dev server it is
 *             printed, not judged. Timed in a pass of its own, with no pixel
 *             sampling
 *
 * At 1728×1117 and 2560×1440, @2×, the pointer through the browser: slow drags
 * in all eight directions, flings released mid-move, a fling caught and
 * dragged again during its settle, enough travel for many wraps (cards 01–04
 * recycling through every slot) — and card 02 hover-warmed, then dragged,
 * then left: its own draw must stay as sharp as a sibling's (Laplacian energy
 * of a corner patch, ≥ 0.85 of the sibling's) and be back on the shared draw
 * (agreeing with its siblings) within 150 frames of the pointer leaving.
 *
 * Then a grid → detail morph and a Next slide, with the writes logged: no
 * canvas written more than once a dimension (a new canvas sizes itself once).
 *
 * Samples are read after each frame has rendered (a message posted from rAF):
 * three 3%-wide patches of each visible tile's canvas, drawn into a sampler
 * canvas of the probe's own (`willReadFrequently`), so the tiles themselves
 * are never read back and never leave the GPU.
 */

const DRAG_VIEWPORTS = [
  { width: 1728, height: 1117 },
  { width: 2560, height: 1440 },
].filter((v) => !process.env.DRAG_VP || process.env.DRAG_VP === `${v.width}x${v.height}`);
const SIB_TOL = 24;
const SPIKE_OUT = 24;
const SPIKE_BACK = 12;
const HOVER_HOLD_MS = 3000;
const REJOIN_FRAMES = 150;
const SHARP_MIN = 0.85;
const FRAME_BUDGET = 33.4;
const GPU = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

/** Installed before the page's scripts. */
function dragProbe() {
  const D = (window.__drag = { phase: 'load', writes: [], frames: [], samples: [], loaf: [], ptr: { x: -1, y: -1 }, sampling: false, sharp: null, movedAt: -1e9 });
  // What ran in a long frame (as verify:jank reports it).
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        D.loaf.push({
          start: e.startTime,
          end: e.startTime + e.duration,
          render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          scripts: e.scripts.filter((x) => x.duration >= 3).map((x) => `${x.invoker}${x.sourceFunctionName ? ` ${x.sourceFunctionName}` : ''} ${Math.round(x.duration)}`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* no LoAF: the frames still count */
  }
  const sampler = document.createElement('canvas');
  sampler.width = 640; // before the hook: the probe's own writes are not logged
  sampler.height = 64;
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (c) => {
    let i = ids.get(c);
    if (!i) ids.set(c, (i = nextId++));
    return i;
  };
  const proto = HTMLCanvasElement.prototype;
  for (const k of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    Object.defineProperty(proto, k, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set(v) {
        const cls = this.className || (this.isConnected ? 'canvas' : 'offscreen');
        // Where an offscreen one comes from (a tile's is the stage's copy).
        const from = cls === 'offscreen' ? new Error().stack.split('\n').slice(2, 9).map((l) => l.trim().replace(/^at /, '').replace(/\(.*\/(.*?)(\?[^:]*)?:(\d+):\d+\)/, '($1:$3)')).join(' < ') : '';
        const moving = performance.now() - D.movedAt < 40;
        D.writes.push({ t: performance.now(), phase: D.phase, moving, id: idOf(this), cls, k, from: d.get.call(this), to: Number(v), stack: from });
        d.set.call(this, v);
      },
    });
  }
  addEventListener(
    'pointermove',
    (e) => {
      D.ptr.x = e.clientX;
      D.ptr.y = e.clientY;
    },
    { capture: true, passive: true },
  );

  const PTS = [
    [0.5, 0.5],
    [0.3, 0.35],
    [0.7, 0.65],
  ];
  const lap = (img, w, h) => {
    // Laplacian energy of the luminance: what a softer draw loses.
    const L = (x, y) => {
      const i = (y * w + x) * 4;
      return 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    };
    let e = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const v = 4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1);
        e += v * v;
      }
    return e / ((w - 2) * (h - 2));
  };
  function sample() {
    const vw = innerWidth;
    const vh = innerHeight;
    const tiles = [];
    for (const host of document.querySelectorAll('.grid-stage .cover-tile[data-cover]')) {
      const r = host.getBoundingClientRect();
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh || r.width < 2) continue;
      if (host.closest('.grid-card')?.style.visibility === 'hidden') continue;
      const tr = host.closest('.grid-card__transform');
      const canvas = host.querySelector('.cover-tile__canvas');
      const still = host.querySelector('.cover-tile__still');
      tiles.push({
        el: canvas,
        slot: tr ? `${tr.dataset.dc},${tr.dataset.dr}` : '?',
        cover: host.dataset.cover,
        cw: canvas ? canvas.width : 0,
        ch: canvas ? canvas.height : 0,
        still: !still ? 'none' : getComputedStyle(still).visibility === 'hidden' ? 'hidden' : still.complete && still.naturalWidth > 0 ? 'shown' : 'loading',
        rect: [r.left, r.top, r.width, r.height],
      });
    }
    const n = Math.min(tiles.length, Math.floor(sampler.width / 12));
    sctx.clearRect(0, 0, sampler.width, sampler.height);
    for (let i = 0; i < n; i++) {
      const c = tiles[i].el;
      if (!c || !c.width || !c.height) continue;
      const sw = Math.max(2, c.width * 0.03);
      const sh = Math.max(2, c.height * 0.03);
      for (let j = 0; j < 3; j++) sctx.drawImage(c, c.width * PTS[j][0] - sw / 2, c.height * PTS[j][1] - sh / 2, sw, sh, i * 12 + j * 4, 0, 4, 4);
    }
    const px = n ? sctx.getImageData(0, 0, n * 12, 4).data : null;
    for (let i = 0; i < n; i++) {
      const rgba = [];
      for (let j = 0; j < 3; j++) {
        const acc = [0, 0, 0, 0];
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const o = (y * n * 12 + i * 12 + j * 4 + x) * 4;
            for (let c = 0; c < 4; c++) acc[c] += px[o + c];
          }
        rgba.push(acc.map((v) => Math.round(v / 16)));
      }
      tiles[i].rgba = rgba;
    }
    let sharp = null;
    if (D.sharp) {
      // A 48×48 device-px corner patch of the warm tile and of a sibling, 1:1.
      const pick = (slot) => tiles.find((t) => t.slot === slot && t.cover === D.sharp.cover)?.el;
      const a = pick(D.sharp.warm);
      const b = tiles.find((t) => t.cover === D.sharp.cover && t.slot !== D.sharp.warm && t.still === 'hidden')?.el;
      if (a && b) {
        const at = (c, x) => sctx.drawImage(c, Math.round(c.width * 0.12), Math.round(c.height * 0.1), 48, 48, x, 8, 48, 48);
        at(a, 0);
        at(b, 64);
        const ia = sctx.getImageData(0, 8, 48, 48).data;
        const ib = sctx.getImageData(64, 8, 48, 48).data;
        sharp = [lap(ia, 48, 48), lap(ib, 48, 48), a.width, b.width];
      }
    }
    // The card that gets the pointer's events: its tile has its own dome up.
    // (Its hover plate floats in front of it, past the tile's own box.)
    const under = D.ptr.x >= 0 ? document.elementFromPoint(D.ptr.x, D.ptr.y)?.closest('.grid-card')?.querySelector('.grid-card__transform') : null;
    D.samples.push({
      t: performance.now(),
      phase: D.phase,
      ptr: [D.ptr.x, D.ptr.y],
      hov: under ? `${under.dataset.dc},${under.dataset.dr}` : null,
      sharp,
      tiles: tiles.map(({ el, ...t }) => (void el, t)),
    });
  }

  // The grid is MOVING while it is dragged or its transform changed (the
  // settle): read each frame, so a write knows whether it fell in motion.
  let lastTf = '';
  const watch = () => {
    const g = document.querySelector('.grid-plane__grid');
    const tf = g ? g.style.transform : '';
    if (tf !== lastTf || document.querySelector('.grid-plane--dragging')) D.movedAt = performance.now();
    lastTf = tf;
  };
  let last = 0;
  const mc = new MessageChannel();
  mc.port1.onmessage = () => {
    if (D.sampling) sample();
  };
  const f = (t) => {
    watch();
    if (last) D.frames.push([last, t, D.phase]);
    last = t;
    if (D.sampling) mc.port2.postMessage(0);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

const setPhase = (page, phase) => page.evaluate((p) => (window.__drag.phase = p), phase);

/** Until the grid's transform holds still for 10 frames (the settle is done). */
const settled = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const g = document.querySelector('.grid-plane__grid');
        let last = '';
        let same = 0;
        const t0 = performance.now();
        const f = () => {
          const tf = g?.style.transform ?? '';
          same = tf === last ? same + 1 : 0;
          last = tf;
          if (same >= 10 || performance.now() - t0 > 4000) res();
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
  );

/** The pointer along `pts` (viewport fractions) over `ms`, a step a frame. */
async function moveAlong(page, vp, pts, ms) {
  const steps = Math.max(2, Math.round(ms / 16));
  const t0 = Date.now();
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * (pts.length - 1);
    const j = Math.min(Math.floor(u), pts.length - 2);
    const k = u - j;
    const x = (pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k) * vp.width;
    const y = (pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k) * vp.height;
    await page.mouse.move(x, y);
    const wait = t0 + ((i + 1) * ms) / steps - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
}

/** One drag: press at the path's start, along it, release at its end — with
 *  no pause before the release, so a fast one is released mid-fling. */
async function drag(page, vp, pts, ms) {
  await page.mouse.move(pts[0][0] * vp.width, pts[0][1] * vp.height);
  await page.mouse.down();
  await moveAlong(page, vp, pts, ms);
  await page.mouse.up();
}

const SLOW = [
  ['slow →', [[0.25, 0.5], [0.75, 0.5]]],
  ['slow ←', [[0.75, 0.5], [0.25, 0.5]]],
  ['slow ↓', [[0.5, 0.2], [0.5, 0.8]]],
  ['slow ↑', [[0.5, 0.8], [0.5, 0.2]]],
  ['slow ↘', [[0.25, 0.2], [0.75, 0.8]]],
  ['slow ↖', [[0.75, 0.8], [0.25, 0.2]]],
  ['slow ↗', [[0.25, 0.8], [0.75, 0.2]]],
  ['slow ↙', [[0.75, 0.2], [0.25, 0.8]]],
];
const FAST = [
  ['fling ← ×3', [[0.8, 0.5], [0.2, 0.5]]],
  ['fling → ×3', [[0.2, 0.5], [0.8, 0.5]]],
  ['fling ↑ ×3', [[0.5, 0.85], [0.5, 0.15]]],
  ['fling ↓ ×3', [[0.5, 0.15], [0.5, 0.85]]],
  ['fling ↗ ×3', [[0.2, 0.8], [0.8, 0.2]]],
  ['fling ↙ ×3', [[0.8, 0.2], [0.2, 0.8]]],
];

/** The visible card-02 tile nearest the centre (and one more, a sibling). */
const lavaTiles = (page) =>
  page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    return [...document.querySelectorAll('.grid-stage .cover-tile[data-cover="rive-site"]')]
      .map((h) => {
        const r = h.getBoundingClientRect();
        const tr = h.closest('.grid-card__transform');
        return { slot: `${tr.dataset.dc},${tr.dataset.dr}`, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, d: Math.hypot(r.left + r.width / 2 - vw / 2, r.top + r.height / 2 - vh / 2) };
      })
      .filter((t) => t.x > t.w / 2 && t.x < vw - t.w / 2 && t.y > t.h / 3 && t.y < vh - t.h / 3)
      .sort((a, b) => a.d - b.d);
  });

/** A card that is not card 02, on screen, for the pointer to go to. */
const otherCard = (page) =>
  page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const c of document.querySelectorAll('.grid-stage .grid-card')) {
      if (c.querySelector('.cover-tile[data-cover="rive-site"]')) continue;
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x > 100 && x < vw - 100 && y > 100 && y < vh - 100) return { x, y };
    }
    return null;
  });

async function circle(page, x, y, ms, r = 14) {
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < ms) {
    k++;
    await page.mouse.move(x + r * Math.cos(k / 3), y + r * Math.sin(k / 3));
    await page.waitForTimeout(16);
  }
}

/** Every scripted case; returns the phases' names. */
async function runCases(page, vp) {
  const names = [];
  const run = async (name, fn) => {
    names.push(name);
    await setPhase(page, `drag:${name}`);
    await fn();
    await settled(page);
    await setPhase(page, 'idle');
    await page.waitForTimeout(250);
  };
  for (const [name, pts] of SLOW) await run(name, () => drag(page, vp, pts, 2000));
  for (const [name, pts] of FAST)
    await run(name, async () => {
      for (let i = 0; i < 3; i++) {
        await drag(page, vp, pts, 160);
        await page.waitForTimeout(500); // the settle, partly
      }
    });
  await run('fling, caught in its settle ×3', async () => {
    for (let i = 0; i < 3; i++) {
      await drag(page, vp, [[0.8, 0.45], [0.25, 0.55]], 160);
      await page.waitForTimeout(90);
      await drag(page, vp, [[0.4, 0.5], [0.6, 0.4], [0.5, 0.6]], 700);
    }
  });
  // Card 02 warmed under the pointer, then dragged (a short drag: the same
  // tile stays under the pointer, no wrap), then left for another card. It is
  // brought to the centre first (ArrowRight, one card a press).
  for (let i = 0; i < 4 && !(await page.$('.grid-card__transform[data-dc="0"][data-dr="0"] .cover-tile[data-cover="rive-site"]')); i++) {
    await page.keyboard.press('ArrowRight');
    await settled(page);
  }
  await page.waitForTimeout(300);
  const lava = (await lavaTiles(page)).filter((t) => t.slot === '0,0');
  let warm = null;
  if (lava.length) {
    const t = lava[0];
    warm = t.slot;
    await page.evaluate((w) => (window.__drag.sharp = { warm: w, cover: 'rive-site' }), warm);
    await setPhase(page, 'warm');
    await circle(page, t.x, t.y, 1500);
    await run('02 warmed, then dragged', async () => {
      await page.mouse.down();
      await moveAlong(page, vp, [[t.x / vp.width, t.y / vp.height], [(t.x - 0.06 * vp.width) / vp.width, (t.y + 0.04 * vp.height) / vp.height]], 600);
      await page.mouse.up();
    });
    const o = await otherCard(page);
    await setPhase(page, 'left');
    if (o) await circle(page, o.x, o.y, 3500, 8);
    await page.evaluate(() => (window.__drag.sharp = null));
    await setPhase(page, 'idle');
  }
  return { names, warm };
}

/** Grid → detail by a click on a card-02 tile, then Next: the writes. */
async function morphAndSlide(page) {
  const lava = await lavaTiles(page);
  if (!lava.length) return false;
  await setPhase(page, 'morph');
  await page.mouse.click(lava[0].x, lava[0].y);
  await page.waitForTimeout(2200);
  await setPhase(page, 'slide');
  await page.click('button[aria-label="Next item"]');
  await page.waitForTimeout(1500);
  await setPhase(page, 'idle');
  return true;
}

function analyse(samples, warm) {
  const out = { blank: [], still: [], sib: [], spikes: [], swaps: 0, tiles: 0, worstSib: 0, rejoin: null, sharp: null };
  const lastHover = new Map();
  const hist = new Map(); // track key → [{i, v}] samples
  const slotCover = new Map();
  let leftAt = -1;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.phase === 'left' && leftAt < 0) leftAt = i;
    const active = s.phase.startsWith('drag:') || s.phase === 'left' || s.phase === 'warm';
    for (const t of s.tiles) {
      const key = `${t.slot}|${t.cover}`;
      if (s.hov === t.slot) lastHover.set(key, s.t);
      if (slotCover.has(t.slot) && slotCover.get(t.slot) !== t.cover) out.swaps++;
      slotCover.set(t.slot, t.cover);
      out.tiles++;
      if (!active) continue;
      const empty = !t.rgba || t.rgba.every((p) => p[3] < 8);
      if (empty && t.still !== 'shown') out.blank.push(`${s.phase} ${t.cover}@${t.slot} canvas ${t.cw}×${t.ch}, still ${t.still}`);
      if (t.rgba && !empty) {
        let a = hist.get(key);
        if (!a) hist.set(key, (a = []));
        a.push({ i, v: t.rgba.flat(), phase: s.phase, cover: t.cover, slot: t.slot });
      }
    }
    if (!active) continue;
    // live: the still on a tile whose cover is live on another tile
    const live = new Set(s.tiles.filter((t) => t.still === 'hidden').map((t) => t.cover));
    for (const t of s.tiles) {
      if (t.still !== 'hidden' && live.has(t.cover)) out.still.push(`${s.phase} ${t.cover}@${t.slot} still ${t.still}, canvas ${t.cw}×${t.ch}`);
    }
    // siblings: the tiles of a cover at rest, against their median
    const by = new Map();
    for (const t of s.tiles) {
      const key = `${t.slot}|${t.cover}`;
      if (!t.rgba || t.still !== 'hidden') continue;
      if (s.t - (lastHover.get(key) ?? -1e9) < HOVER_HOLD_MS) continue;
      let a = by.get(t.cover);
      if (!a) by.set(t.cover, (a = []));
      a.push(t);
    }
    for (const [cover, ts] of by) {
      if (ts.length < 2) continue;
      const med = ts[0].rgba.flat().map((_, k) => {
        const v = ts.map((t) => t.rgba.flat()[k]).sort((p, q) => p - q);
        return v[Math.floor(v.length / 2)];
      });
      for (const t of ts) {
        const d = Math.max(...t.rgba.flat().map((v, k) => Math.abs(v - med[k])));
        out.worstSib = Math.max(out.worstSib, d);
        if (d > SIB_TOL) out.sib.push(`${s.phase} ${cover}@${t.slot} ${d} off its ${ts.length - 1} siblings (canvas ${t.cw}×${t.ch})`);
      }
    }
  }
  // spikes: out and back in one frame, on consecutive samples
  for (const a of hist.values()) {
    for (let j = 1; j + 1 < a.length; j++) {
      if (a[j].i !== a[j - 1].i + 1 || a[j + 1].i !== a[j].i + 1) continue;
      const out1 = Math.max(...a[j].v.map((v, k) => Math.abs(v - a[j - 1].v[k])));
      const back = Math.max(...a[j + 1].v.map((v, k) => Math.abs(v - a[j - 1].v[k])));
      if (out1 > SPIKE_OUT && back <= SPIKE_BACK) out.spikes.push(`${a[j].phase} ${a[j].cover}@${a[j].slot} ${out1} out, ${back} back`);
    }
  }
  // the warm tile: sharp all along, and back with its siblings once left
  if (warm) {
    const sh = samples.filter((s) => s.sharp && (s.phase === 'warm' || s.phase === 'left' || s.phase.startsWith('drag:02')));
    if (sh.length) {
      const ratios = sh.map((s) => s.sharp[0] / Math.max(1e-6, s.sharp[1]));
      out.sharp = { min: Math.min(...ratios), n: ratios.length, widths: [...new Set(sh.map((s) => `${s.sharp[2]}/${s.sharp[3]}`))].join(' ') };
    }
    if (leftAt >= 0) {
      const agrees = (s) => {
        const w = s.tiles.find((t) => t.slot === warm && t.cover === 'rive-site');
        const sibs = s.tiles.filter((t) => t.cover === 'rive-site' && t.slot !== warm && t.rgba && t.still === 'hidden');
        if (!w?.rgba || !sibs.length) return null;
        return sibs.some((o) => Math.max(...w.rgba.flat().map((v, k) => Math.abs(v - o.rgba.flat()[k]))) <= SIB_TOL);
      };
      const left = samples.slice(leftAt).filter((s) => s.phase === 'left');
      let lastBad = -1;
      left.forEach((s, k) => {
        if (agrees(s) === false) lastBad = k;
      });
      out.rejoin = { frames: lastBad + 1, of: left.length };
    }
  }
  return out;
}

/**
 * `newPage(browser, viewport, dpr, extra, init)` and `check(pass, label,
 * extra)` are the suite's. Returns the rows for a main-vs-branch table.
 */
export async function checkDrag({ browser, origin, newPage, check, log = console.log, dump = null }) {
  // The timing pass runs HEADED: headless Chrome paces its frames on a timer,
  // so a frame the GPU took 60 ms over still reads 16.7 there.
  const headed = await chromium.launch({ headless: false, args: GPU });
  log('\ndrag: the grid dragged, flung and dropped — no canvas resized, no blank or flickering tile');
  const rows = [];
  for (const vp of DRAG_VIEWPORTS) {
    const tag = `${vp.width}×${vp.height} @2×`;
    const row = { viewport: tag };
    for (const pass of ['pixels', 'timing']) {
      const page = await newPage(pass === 'timing' ? headed : browser, vp, 2, {}, dragProbe);
      await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
      // Every visible tile live (its still hidden), then a moment more.
      await page
        .waitForFunction(
          () => {
            const ts = [...document.querySelectorAll('.grid-stage .cover-tile[data-cover]')].filter((h) => {
              const r = h.getBoundingClientRect();
              return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
            });
            return ts.length > 0 && ts.every((h) => getComputedStyle(h.querySelector('.cover-tile__still')).visibility === 'hidden');
          },
          null,
          { timeout: 30000 },
        )
        .catch(() => {});
      await page.waitForTimeout(1500);
      const dev = await page.evaluate(() => !!window.__covers);
      row.build = dev ? 'dev' : 'production';
      await page.evaluate((on) => {
        window.__drag.sampling = on;
        window.__drag.phase = 'idle';
      }, pass === 'pixels');
      const { names, warm } = await runCases(page, vp);
      const D = await page.evaluate(() => {
        const D = window.__drag;
        return { writes: D.writes, frames: D.frames, samples: D.samples, loaf: D.loaf };
      });
      if (dump) await writeFile(`${dump}-${vp.width}-${pass}.json`, JSON.stringify({ warm, ...D }));
      if (pass === 'pixels') {
        const morphed = await morphAndSlide(page);
        const W = await page.evaluate(() => window.__drag.writes);
        const during = D.writes.filter((w) => w.phase.startsWith('drag:') && w.moving);
        // Writes in a case's pauses, the grid at rest (between the flings):
        // not in a drag, but shown, not hidden.
        const paused = D.writes.filter((w) => w.phase.startsWith('drag:') && !w.moving);
        row.pausedWrites = paused.length;
        if (paused.length) log(`  · ${tag}: ${paused.length} writes between drags, the grid at rest: ${paused.slice(0, 4).map((w) => `${w.cls} ${w.k} ${w.from}→${w.to}${w.stack ? ` [${w.stack}]` : ''}`).join(', ')}`);
        const byCls = {};
        for (const w of during) byCls[w.cls] = (byCls[w.cls] ?? 0) + 1;
        row.writes = during.length;
        check(
          during.length === 0,
          `${tag}: no canvas resized while dragging or settling (${names.length} cases)`,
          during.length ? `${during.length} writes: ${Object.entries(byCls).map(([c, n]) => `${c} ${n}`).join(', ')}; e.g. ${during.slice(0, 4).map((w) => `${w.k} ${w.from}→${w.to}${w.stack ? ` [${w.stack}]` : ''}`).join(', ')}` : '0 writes',
        );
        const a = analyse(D.samples, warm);
        row.blank = a.blank.length;
        row.still = a.still.length;
        row.sib = a.sib.length;
        row.worstSib = a.worstSib;
        row.spikes = a.spikes.length;
        row.swaps = a.swaps;
        check(a.swaps >= 8, `${tag}: the drags wrapped (tiles recycled through new covers)`, `${a.swaps} slot→cover changes seen`);
        check(a.blank.length === 0, `${tag}: no blank tile in any frame`, a.blank.length ? `${a.blank.length}: ${a.blank.slice(0, 3).join(' | ')}` : `${a.tiles} tile-frames`);
        check(
          a.still.length === 0,
          `${tag}: no tile on its still while its cover is live on another`,
          a.still.length ? `${a.still.length} tile-frames: ${a.still.slice(0, 3).join(' | ')}` : '',
        );
        check(
          a.sib.length === 0,
          `${tag}: every tile at rest agrees with its siblings (≤ ${SIB_TOL})`,
          a.sib.length ? `${a.sib.length} tile-frames off, worst ${a.worstSib}: ${a.sib.slice(0, 3).join(' | ')}` : `worst ${a.worstSib}`,
        );
        check(a.spikes.length === 0, `${tag}: no one-frame flicker (out > ${SPIKE_OUT}, back ≤ ${SPIKE_BACK})`, a.spikes.length ? `${a.spikes.length}: ${a.spikes.slice(0, 3).join(' | ')}` : '');
        if (warm) {
          row.sharp = a.sharp ? a.sharp.min : null;
          row.rejoin = a.rejoin ? a.rejoin.frames : null;
          check(
            !!a.sharp && a.sharp.min >= SHARP_MIN,
            `${tag}: card 02 warmed and dragged stays as sharp as a sibling (≥ ${SHARP_MIN})`,
            a.sharp ? `least ${a.sharp.min.toFixed(3)} over ${a.sharp.n} frames, canvases ${a.sharp.widths} wide` : 'no frames sampled',
          );
          check(
            !!a.rejoin && a.rejoin.frames <= REJOIN_FRAMES,
            `${tag}: …and is back with its siblings within ${REJOIN_FRAMES} frames of the pointer leaving`,
            a.rejoin ? `${a.rejoin.frames} frames (of ${a.rejoin.of} sampled)` : 'not seen',
          );
        } else check(false, `${tag}: a card-02 tile to warm`, 'none on screen');
        if (morphed) {
          const per = new Map();
          for (const w of W.filter((w) => w.phase === 'morph' || w.phase === 'slide')) {
            const k = `${w.id}|${w.k}`;
            per.set(k, { n: (per.get(k)?.n ?? 0) + 1, cls: w.cls });
          }
          const multi = [...per.entries()].filter(([, v]) => v.n > 1);
          const total = [...per.values()].reduce((s, v) => s + v.n, 0);
          row.morphWrites = total;
          check(
            multi.length === 0,
            `${tag}: grid → detail morph and a slide: no canvas resized more than once`,
            `${total} writes${multi.length ? `; ${multi.map(([k, v]) => `${v.cls} #${k.split('|')[0]} ${k.split('|')[1]} ×${v.n}`).slice(0, 4).join(', ')}` : ''}`,
          );
        }
      } else {
        const fr = D.frames.filter(([, , p]) => p.startsWith('drag:')).map(([s, e]) => e - s);
        const over = fr.filter((d) => d > FRAME_BUDGET);
        // Each long frame, its case and what ran in it.
        for (const [s0, e0, p] of D.frames.filter(([s1, e1, p1]) => p1.startsWith('drag:') && e1 - s1 > FRAME_BUDGET)) {
          const lo = D.loaf.filter((l) => l.start < e0 && l.end > s0);
          const what = lo.length ? lo.map((l) => `LoAF ${Math.round(l.end - l.start)} (render ${Math.round(l.render)})${l.scripts.length ? `: ${l.scripts.slice(0, 3).join(', ')}` : ''}`).join('; ') : 'no LoAF: compositor / GPU';
          log(`      ${p} ${(e0 - s0).toFixed(1)} ms — ${what}`);
        }
        const worst = Math.max(0, ...fr);
        row.frames = fr.length;
        row.over33 = over.length;
        row.worst = worst;
        const label = `${tag}: no frame over 33 ms while dragging (${row.build} build)`;
        const extra = `${fr.length} frames, ${over.length} over 33, worst ${worst.toFixed(1)} ms`;
        if (dev) log(`  · ${label}  ${extra}  (dev server: printed, not judged)`);
        else check(over.length === 0, label, extra);
      }
      await page.context().close();
    }
    rows.push(row);
  }
  await headed.close();
  return rows;
}
