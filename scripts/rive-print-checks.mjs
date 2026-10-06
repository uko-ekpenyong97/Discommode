/**
 * `rprint` (verify:cover) — WEBKIT'S DRAW PRINT (src/covers/rive/drawPrint.ts)
 * and its 20 fps side card (src/quality.ts `sideFrame`), taken in Chrome with
 * the dev `?webkit` flag: the paper must never be left showing a card 04 frame
 * older than the one its canvas holds, and it must upload far less.
 *
 * Per surface (the hero after the burst at #item-04; the side card at #item-03
 * and #item-01), the pointer moving: every upload of card 04's plane is read
 * back, and after every frame (a message posted from rAF, which runs once the
 * frame's callbacks have) the plane canvas is compared with the last upload,
 * pixel for pixel. A difference with no upload is a STALE frame: 0 allowed.
 *
 * The canvas is read back for 2 s before the count starts: reading a canvas
 * every frame moves Chrome's 2D canvas from the GPU to the CPU, which draws
 * the same commands with a different antialiasing, once — 10–11k px of the
 * face's circle, which a first version of this check counted as stale.
 *
 * Without `?webkit` nothing changes (the control): an upload a frame on every
 * surface, as before.
 */
const SECS = 10;

function recorder() {
  const S = (window.__V = { on: false, src: null, last: null, uploads: 0, frames: 0, stale: 0, staleMax: 0 });
  const P = WebGL2RenderingContext.prototype;
  const o = P.texSubImage2D;
  P.texSubImage2D = function (...a) {
    const src = a[a.length - 1];
    if (src instanceof HTMLCanvasElement && src.width > 300) {
      S.src = src;
      if (S.on) {
        S.last = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
        S.uploads++;
      }
    }
    return o.apply(this, a);
  };
  const mc = new MessageChannel();
  mc.port1.onmessage = () => {
    if (!S.src) return;
    const d = S.src.getContext('2d').getImageData(0, 0, S.src.width, S.src.height).data; // warm, then compare
    if (!S.on || !S.last || d.length !== S.last.length) return;
    S.frames++;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] !== S.last[i] || d[i + 1] !== S.last[i + 1] || d[i + 2] !== S.last[i + 2]) n++;
    if (n) {
      S.stale++;
      S.staleMax = Math.max(S.staleMax, n);
    }
  };
  const tick = () => {
    requestAnimationFrame(tick);
    mc.port2.postMessage(0);
  };
  requestAnimationFrame(tick);
}

export async function checkRivePrint({ browser, B, newPage, check }) {
  console.log(`\nrive print: WebKit's paper uploads card 04 only when its picture changed (?webkit, in Chrome), ${SECS} s a surface, no stale frame`);
  const run = async (hash, query) => {
    const page = await newPage(browser, { width: 1728, height: 1117 }, 2, {}, recorder);
    await page.goto(`${B}${query}`);
    await page.goto(`${B}${query}${hash}`);
    let x = 500;
    const mover = setInterval(() => {
      x = x > 1200 ? 500 : x + 6;
      page.mouse.move(x, 560).catch(() => {});
    }, 16);
    // The hero: through its burst first; the side card: its loop running.
    await page.waitForTimeout(hash === '#item-04' ? 4000 : 5000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => ((window.__V.on = true), r()))));
    await page.waitForTimeout(SECS * 1000);
    clearInterval(mover);
    const v = await page.evaluate(() => ({ ...window.__V, src: undefined, last: undefined, plane: window.__covers.rive.instance('nosey')?.plane }));
    await page.context().close();
    return v;
  };
  for (const hash of ['#item-04', '#item-03', '#item-01']) {
    const role = hash === '#item-04' ? 'the hero' : 'the side card';
    const w = await run(hash, '?webkit');
    check(w.frames > SECS * 30 && w.stale === 0, `${hash} ${role}, ?webkit: no stale frame on the paper`, `${w.frames} frames, ${w.uploads} uploads, ${w.stale} stale${w.stale ? ` (max ${w.staleMax} px)` : ''}; the print ${w.plane?.printed ? 'on' : 'OFF'}, ${w.plane?.same ?? 0} paints the same picture`);
    if (hash === '#item-04') {
      check(w.uploads < w.frames * 0.6, `${hash} ${role}, ?webkit: uploads at 30 fps (every other frame)`, `${w.uploads} of ${w.frames} frames (${((100 * w.uploads) / w.frames).toFixed(0)}%)`);
    } else {
      check(w.plane?.printed && w.uploads < w.frames * 0.4, `${hash} ${role}, ?webkit: uploads cut (the picture steps at ~12 fps; ≤ 20 fps)`, `${w.uploads} of ${w.frames} frames (${((100 * w.uploads) / w.frames).toFixed(0)}%)`);
    }
  }
  // The control: Chrome as it ships — no print, an upload a frame.
  const c = await run('#item-03', '');
  check(!c.plane?.printed && c.uploads >= c.frames * 0.95 && c.stale === 0, '#item-03 without ?webkit: unchanged (no print, an upload a frame)', `${c.uploads} uploads in ${c.frames} frames; the print ${c.plane?.printed ? 'ON' : 'off'}`);
}
