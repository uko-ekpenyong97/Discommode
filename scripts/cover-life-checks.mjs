/**
 * COVER LIFE in Chrome — the checks `verify:detail` and `verify:reader` share
 * (src/reader/coverLife.ts). Each takes a page already showing a face at rest
 * with the pointer parked off it, and a `face` descriptor:
 *
 *   layer    selector for the face's `.cover-anim`
 *   plate()  in-page: where the PLATE is boiled to, as { cx, cy, dx, dy, rad }
 *            (rotation centre and offset, screen px) — the paper plane's
 *            uniforms in the detail view, the book's static slot in the reader
 *   plateBox in-page, optional: a DOM element that carries the plate, whose
 *            bounding rect is checked against the prediction as well
 *
 * The in-page functions are passed as source strings, since Playwright can only
 * serialise a function as the evaluate body itself.
 */
import sharp from 'sharp';

/** In-page helpers, installed once per document. */
const HELPERS = () => {
  if (window.__lifeH) return;
  // The axis-aligned box of `r` turned by `rad` about (cx, cy), then moved.
  const predict = (r, b) => {
    const cs = Math.cos(b.rad);
    const sn = Math.sin(b.rad);
    const pts = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ].map(([x, y]) => {
      const u = x - b.cx;
      const v = y - b.cy;
      return [b.cx + u * cs - v * sn + b.dx, b.cy + u * sn + v * cs + b.dy];
    });
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
  };
  const edgeDiff = (a, dom) =>
    Math.max(Math.abs(a.l - dom.left), Math.abs(a.t - dom.top), Math.abs(a.r - dom.right), Math.abs(a.b - dom.bottom));
  // Every sprite's REST rect on screen: the layer's parent is never boiled, and
  // its scale (the detail panel's) is its bounding width over its layout width.
  const restRects = (layer) => {
    const host = layer.parentElement;
    const hb = host.getBoundingClientRect();
    // (Computed width, not offsetWidth: that is rounded to a whole px, which
    // at 628.25px is a 0.3px error by the far edge.)
    const k = hb.width / parseFloat(getComputedStyle(host).width);
    return [...layer.querySelectorAll('.cover-anim__obj')].map((o) => ({
      id: o.dataset.id,
      el: o,
      rest: {
        x: hb.x + parseFloat(o.style.left) * k,
        y: hb.y + parseFloat(o.style.top) * k,
        w: parseFloat(o.style.width) * k,
        h: parseFloat(o.style.height) * k,
      },
    }));
  };
  const phases = (layer) => [...layer.querySelectorAll('.cover-anim__obj')].map((o) => o.dataset.phase);
  window.__lifeH = { predict, edgeDiff, restRects, phases };
};

const install = (page) => page.evaluate(HELPERS);

/** A point on the face that is on NO object's hit rect — the page, not a sprite. */
export async function emptyPoint(page, face) {
  return page.evaluate(
    async ({ sel, which }) => {
      const m = await (await fetch('/issues/01/anim/manifest.json')).json();
      const objs = m.objects.filter((o) => (o.face ?? 'cover') === which);
      const W = which === 'back' ? m.back.backW : m.coverW;
      const H = which === 'back' ? m.back.backH : m.coverH;
      const b = document.querySelector(sel).parentElement.getBoundingClientRect();
      for (let gy = 0.06; gy < 1; gy += 0.04) {
        for (let gx = 0.06; gx < 1; gx += 0.04) {
          const x = gx * W;
          const y = gy * H;
          const hit = objs.some((o) => {
            const r = o.hitRect;
            return x >= r.x - 40 && y >= r.y - 40 && x <= r.x + r.w + 40 && y <= r.y + r.h + 40;
          });
          if (!hit) return { x: b.x + gx * b.width, y: b.y + gy * b.height };
        }
      }
      return { x: b.x + b.width * 0.03, y: b.y + b.height * 0.03 };
    },
    { sel: face.layer, which: face.which },
  );
}

/** Rest: nothing moved. The layer, the plate and every boiled element exactly
 *  as they were — no translate, no rotate, a zero plate transform. */
export async function atRest(page, face) {
  await install(page);
  return page.evaluate(
    ({ sel, plateSrc, extra }) => {
      const layer = document.querySelector(sel);
      const plate = new Function(`return (${plateSrc})()`)();
      const els = [layer, ...(extra ? [...document.querySelectorAll(extra)] : [])];
      return {
        styles: els.map((e) => (e.style.translate || '') + (e.style.rotate || '')).join(''),
        plate,
        still: plate.dx === 0 && plate.dy === 0 && plate.rad === 0,
        phases: window.__lifeH.phases(layer),
      };
    },
    { sel: face.layer, plateSrc: face.plate, extra: face.boiled },
  );
}

/**
 * Hover the page (a point on no object) and time the objects: from the first
 * pointermove on the page to the frame every object reports `playing`.
 */
export async function hoverAll(page, face, at) {
  await install(page);
  await page.evaluate((sel) => {
    const layer = document.querySelector(sel);
    const box = layer.parentElement.getBoundingClientRect();
    window.__lifeT = { t0: 0, all: 0 };
    const onMove = (e) => {
      if (window.__lifeT.t0) return;
      if (e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) {
        window.__lifeT.t0 = performance.now();
      }
    };
    document.addEventListener('pointermove', onMove, { capture: true });
    const f = () => {
      if (window.__lifeT.t0 && window.__lifeH.phases(layer).every((p) => p === 'playing')) {
        window.__lifeT.all = performance.now();
        document.removeEventListener('pointermove', onMove, { capture: true });
        return;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, face.layer);
  await page.mouse.move(at.x, at.y, { steps: 2 });
  await page.waitForFunction(() => window.__lifeT.all > 0, null, { timeout: 3000 }).catch(() => {});
  return page.evaluate((sel) => ({
    ms: window.__lifeT.all ? window.__lifeT.all - window.__lifeT.t0 : null,
    n: window.__lifeH.phases(document.querySelector(sel)).length,
  }), face.layer);
}

/**
 * Registration during a boil, sampled `n` times ~110ms apart (so the samples
 * fall across steps and across the ramp): every sprite's box against its rest
 * box moved by the PLATE's transform. What the plate does comes from the plate
 * itself (the paper's uniforms, or the slot), what the sprites do from their
 * own laid-out boxes — so a sprite that moved by anything other than what the
 * plate moved by shows up as px here.
 */
export async function registration(page, face, n = 10) {
  await install(page);
  const samples = [];
  for (let i = 0; i < n; i++) {
    samples.push(
      await page.evaluate(
        ({ sel, plateSrc, boxSel, which }) => {
          const H = window.__lifeH;
          const layer = document.querySelector(sel);
          const plate = new Function(`return (${plateSrc})()`)();
          let worst = 0;
          for (const s of H.restRects(layer)) {
            worst = Math.max(worst, H.edgeDiff(H.predict(s.rest, plate), s.el.getBoundingClientRect()));
          }
          let box = null;
          if (boxSel) {
            // The plate's own element, where there is one: its rest box is the
            // layer's parent box (the same rect, by construction).
            const hb = layer.parentElement.getBoundingClientRect();
            const rest = { x: hb.x, y: hb.y, w: hb.width, h: hb.height };
            box = H.edgeDiff(H.predict(rest, plate), document.querySelector(boxSel).getBoundingClientRect());
          }
          return {
            worst,
            box,
            moved: Math.hypot(plate.dx, plate.dy),
            deg: (plate.rad * 180) / Math.PI,
            step: window.__coverLife.sample(which).step,
          };
        },
        { sel: face.layer, plateSrc: face.plate, boxSel: face.plateBox, which: face.which },
      ),
    );
    await page.waitForTimeout(110);
  }
  return samples;
}

/**
 * Leave the page, and time every object back to rest (MutationObserver on its
 * `data-phase`), against its own bound: the pass in flight (≤ its duration),
 * the stagger hold, the fade.
 */
export async function leaveAll(page, face, away) {
  await install(page);
  await page.evaluate((sel) => {
    const layer = document.querySelector(sel);
    window.__lifeL = { t0: 0, back: {}, fade: {} };
    const mo = new MutationObserver((recs) => {
      const now = performance.now();
      for (const r of recs) {
        const el = r.target;
        if (el.dataset.phase === 'fading' && !(el.dataset.id in window.__lifeL.fade)) window.__lifeL.fade[el.dataset.id] = now - window.__lifeL.t0;
        if (el.dataset.phase === 'rest' && !(el.dataset.id in window.__lifeL.back)) window.__lifeL.back[el.dataset.id] = now - window.__lifeL.t0;
      }
    });
    mo.observe(layer, { subtree: true, attributes: true, attributeFilter: ['data-phase'] });
    window.__lifeMo = mo;
    const onLeave = () => {
      if (!window.__lifeL.t0) window.__lifeL.t0 = performance.now();
    };
    // The leave starts on whichever the layer hears first: the host's
    // pointerleave, or a move off the page's box.
    const box = layer.parentElement.getBoundingClientRect();
    document.addEventListener('pointermove', (e) => {
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onLeave();
    }, { capture: true, once: false });
  }, face.layer);
  await page.mouse.move(away.x, away.y, { steps: 2 });
  await page.waitForFunction(
    (sel) => window.__lifeH.phases(document.querySelector(sel)).every((p) => p === 'rest'),
    face.layer,
    { timeout: 5000 },
  ).catch(() => {});
  return page.evaluate(async (sel) => {
    window.__lifeMo.disconnect();
    const m = await (await fetch('/issues/01/anim/manifest.json')).json();
    const dur = Object.fromEntries(m.objects.map((o) => [o.id, o.durationMs]));
    const layer = document.querySelector(sel);
    return {
      back: window.__lifeL.back,
      fade: window.__lifeL.fade,
      dur,
      phases: window.__lifeH.phases(layer),
      dials: window.__coverLife.dials(),
    };
  }, face.layer);
}

/** Judge `leaveAll`'s result: each object home within duration + stagger +
 *  fade (+ 60ms for timers and the rAF that sees it). */
export function judgeLeave(r, fadeMs = 120) {
  const ids = Object.keys(r.back);
  const over = ids
    .map((id) => ({ id, t: r.back[id], bound: r.dur[id] + r.dials.stagger + fadeMs + 60 }))
    .filter((x) => x.t > x.bound);
  const fades = Object.values(r.fade).sort((a, b) => a - b);
  const distinct = new Set(fades.map((t) => Math.round(t / 8))).size;
  const all = r.phases.every((p) => p === 'rest');
  return { ids, over, all, worst: Math.max(...Object.values(r.back)), distinct, fades };
}

/**
 * Two consecutive boil steps side by side (held at full amplitude with the
 * pointer off the page, so nothing but the boil differs), each with a 4×
 * nearest-neighbour crop below it so a 1.5px move can be seen at all.
 */
export async function boilSteps(page, face, file, step = 7) {
  const clip = await page.evaluate((sel) => {
    const b = document.querySelector(sel).parentElement.getBoundingClientRect();
    return { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 };
  }, face.layer);
  const shots = [];
  for (const n of [step, step + 1]) {
    await page.evaluate(({ which, n }) => window.__coverLife.hold(which, { step: n, amp: 1 }), { which: face.which, n });
    await page.waitForTimeout(120);
    shots.push({ n, png: await page.screenshot({ clip }), s: await page.evaluate((w) => window.__coverLife.sample(w), face.which) });
  }
  await page.evaluate((which) => window.__coverLife.hold(which, null), face.which);
  const meta = await sharp(shots[0].png).metadata();
  const W = meta.width;
  const H = meta.height;
  // The crop: the top-left corner of the card, where the edge and the
  // artwork's lines both show the move.
  const Z = 4;
  const cw = Math.floor(W / Z);
  const ch = Math.floor(cw * 0.75);
  const crops = await Promise.all(
    shots.map((s) =>
      sharp(s.png)
        .extract({ left: 0, top: 0, width: cw, height: ch })
        .resize(cw * Z, ch * Z, { kernel: 'nearest' })
        .toBuffer(),
    ),
  );
  const gap = 24;
  const zoomW = cw * Z;
  const colW = Math.max(W, zoomW);
  await sharp({
    create: { width: colW * 2 + gap * 3, height: H + ch * Z + gap * 3, channels: 3, background: '#1b1b1b' },
  })
    .composite([
      { input: shots[0].png, left: gap, top: gap },
      { input: shots[1].png, left: colW + gap * 2, top: gap },
      { input: crops[0], left: gap, top: H + gap * 2 },
      { input: crops[1], left: colW + gap * 2, top: H + gap * 2 },
    ])
    .webp({ quality: 88 })
    .toFile(file);
  return shots.map((s) => s.s);
}
