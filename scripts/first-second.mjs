/**
 * The page's first seconds, in Chrome — `node scripts/first-second.mjs --url
 * <origin>`. For a production build (`vite preview`); it needs no dev hook.
 *
 * Each run is a fresh browser (a cold HTTP cache and a cold GPU program
 * cache), the pointer moving from the first frame and never parked:
 *
 *   load      every rAF interval from the navigation to 3 s after it. The
 *             pass bar: no frame over 50 ms. Also judged from the first
 *             contentful paint (before it nothing is on screen).
 *   arrival   the first detail arrival: at 3.5 s the pointer goes to the
 *             centre card, and 600 ms later clicks it — the window is the
 *             pointerdown to the settled hero (the paper's hand-in + its
 *             500 ms settle). Bar: no frame over 50 ms.
 *   warm      every frame after `warmup:done` (src/warmup.ts) to the end of
 *             the arrival. Bar: none over 33 ms.
 *
 * The bars count VSYNCS, as verify:detail does (`Math.round(ms / 16.67)`):
 * a rAF interval is a whole number of them give or take a few tenths, so
 * "over 50 ms" is four or more (50.0 is three), "over 33 ms" three or more.
 *
 *   --url <origin>          the server (always pass it in a worktree)
 *   --size 1728x1117        the viewport, @2× (`2560x1440` for the other)
 *   --runs <n>              default 5
 *   --label <name>          the run's name in the summary and the JSON
 *   --json <file>           write every run
 *   --trace <dir>           record a CDP trace of each run (all processes)
 *                           and attribute every long frame (> 33 ms): WebGL
 *                           context creation, shader compile/link, texture
 *                           uploads, image decodes, fonts, React, layout —
 *                           from the trace and from wrappers around the
 *                           WebGL / createImageBitmap calls (trace runs only:
 *                           the wrappers cost a little themselves)
 *   --compare a.json b.json print two JSON files side by side, no browser
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};

const LOAD_MS = 3000;
const CLICK_AT = 3500;
const SETTLE_MS = 500;

// ── compare ──────────────────────────────────────────────────────────────

if (argv.includes('--compare')) {
  const files = argv.slice(argv.indexOf('--compare') + 1).filter((a) => !a.startsWith('--'));
  for (const f of files) {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    console.log(`\n${r.label}  ${r.size}  (${r.runs.length} runs)`);
    console.log(summary(r.runs));
  }
  process.exit(0);
}

function summary(runs) {
  const col = (xs) => xs.map((x) => (x == null ? '—' : typeof x === 'number' ? x.toFixed(0) : x)).join(', ');
  const lines = [
    `  load: worst frame          ${col(runs.map((r) => r.load.worst))} ms   (>50: ${col(runs.map((r) => r.load.over50))})`,
    `  load: worst after FCP      ${col(runs.map((r) => r.load.worstAfterFcp))} ms   (>50: ${col(runs.map((r) => r.load.over50AfterFcp))})`,
    `  arrival: worst frame       ${col(runs.map((r) => r.arrival?.worst))} ms   (>50: ${col(runs.map((r) => r.arrival?.over50))})`,
    `  after warmup:done: worst   ${col(runs.map((r) => r.warm?.worst))} ms   (>33: ${col(runs.map((r) => r.warm?.over33))})`,
    `  warmup:done at             ${col(runs.map((r) => r.warmupDone))} ms`,
    `  loadavg (1 min) at start   ${runs.map((r) => r.loadavg[0].toFixed(2)).join(', ')}`,
  ];
  return lines.join('\n');
}

// ── the run ──────────────────────────────────────────────────────────────

const ORIGIN = arg('--url', 'http://localhost:5173');
const [W, H] = arg('--size', '1728x1117').split('x').map(Number);
const RUNS = +arg('--runs', '5');
const LABEL = arg('--label', ORIGIN);
const JSON_OUT = arg('--json', null);
const TRACE = arg('--trace', null);

/** Installed before the page's scripts: every rAF interval, LoAF, paint. */
function probe(instrument) {
  const J = (window.__fs = { frames: [], loaf: [], gl: [], bitmaps: [], onAt: 0, downAt: 0 });
  let last = 0;
  const f = (t) => {
    if (last) J.frames.push([last, t]);
    last = t;
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        J.loaf.push({
          start: e.startTime,
          end: e.startTime + e.duration,
          scripts: e.scripts
            .filter((s) => s.duration >= 3)
            .map((s) => `${s.invoker}${s.sourceFunctionName ? ` ${s.sourceFunctionName}` : ''} ${Math.round(s.duration)} (forced style+layout ${Math.round(s.forcedStyleAndLayoutDuration)})`),
          render: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0,
          styleLayout: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0,
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* no LoAF */
  }
  new MutationObserver((ms) => {
    for (const m of ms) if (m.attributeName === 'data-paper' && m.target.dataset?.paper === 'in' && !J.onAt) J.onAt = performance.now();
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-paper'] });
  window.addEventListener('pointerdown', (e) => (J.downAt ||= e.timeStamp), { capture: true });
  if (!instrument) return;
  // WebGL calls the main thread waits in, by kind.
  const KIND = {
    context: ['getExtension', 'getSupportedExtensions', 'getParameter', 'getShaderPrecisionFormat', 'getContextAttributes'],
    shader: ['compileShader', 'linkProgram', 'getShaderParameter', 'getProgramParameter', 'getShaderInfoLog', 'getProgramInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation', 'getAttribLocation', 'shaderSource', 'attachShader', 'useProgram'],
    upload: ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'compressedTexImage2D', 'generateMipmap', 'copyTexImage2D', 'renderbufferStorage', 'renderbufferStorageMultisample', 'bufferData'],
    sync: ['readPixels', 'getError', 'finish', 'clientWaitSync', 'checkFramebufferStatus', 'getBufferSubData'],
    draw: ['drawArrays', 'drawElements', 'clear', 'blitFramebuffer'],
  };
  const wrap = (proto, name, kind) => {
    const fn = proto[name];
    if (typeof fn !== 'function') return;
    proto[name] = function (...a) {
      const t0 = performance.now();
      try {
        return fn.apply(this, a);
      } finally {
        const d = performance.now() - t0;
        if (d > 0.05) J.gl.push([kind, name, t0, d]);
      }
    };
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const [kind, names] of Object.entries(KIND)) for (const n of names) wrap(C.prototype, n, kind);
  }
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    if (!C) continue;
    const gc = C.prototype.getContext;
    C.prototype.getContext = function (type, ...a) {
      const t0 = performance.now();
      const had = this.__fsCtx;
      const r = gc.call(this, type, ...a);
      const d = performance.now() - t0;
      if (/webgl/.test(type) && !had) {
        this.__fsCtx = true;
        J.gl.push(['context', `getContext(${type}) ${this.className || this.constructor.name}`, t0, d]);
      }
      return r;
    };
  }
  const cib = window.createImageBitmap;
  window.createImageBitmap = function (...a) {
    const t0 = performance.now();
    const p = cib.apply(this, a);
    const what = a[0]?.constructor?.name ?? '?';
    p.then((b) => J.bitmaps.push([what, t0, performance.now(), b.width, b.height])).catch(() => {});
    return p;
  };
}

/** A pointer that never rests: jitters around `at()` every ~16 ms. */
function pointer(page, at) {
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

const CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'loading',
  'v8.execute',
  'gpu',
  'gpu.service',
  'cc',
  'viz',
  'blink',
  'toplevel',
  'benchmark',
  'renderer.scheduler',
];

async function oneRun(i) {
  const la = loadavg();
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(probe, !!TRACE);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (TRACE) await browser.startTracing(page, { categories: CATEGORIES });
  const ptr = pointer(page, () => ({ x: W / 2, y: 120 }));
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('.grid-card');
  await page.waitForFunction((ms) => performance.now() > ms, CLICK_AT - 600, { timeout: 30000 });
  // The centre card, hovered as a person is before a click.
  const card = await page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('.grid-card')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight / 2);
      if (!best || d < best.d) best = { d, x: r.x + r.width / 2, y: r.y + r.height * 0.45 };
    }
    return best;
  });
  ptr.set(() => card);
  await page.waitForFunction((ms) => performance.now() > ms, CLICK_AT, { timeout: 30000 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => window.__fs.onAt > 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForFunction((ms) => window.__fs.onAt > 0 && performance.now() > window.__fs.onAt + ms + 150, SETTLE_MS, { timeout: 20000 }).catch(() => {});
  const r = await page.evaluate(
    ({ LOAD_MS, SETTLE_MS }) => {
      performance.mark('fs:sync');
      const J = window.__fs;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      const done = performance.getEntriesByName('warmup:done')[0]?.startTime ?? null;
      const win = (a, b) => J.frames.filter(([s, e]) => e > a && s < b).map(([s, e]) => [s, e - s]);
      const stat = (fr) => ({
        n: fr.length,
        worst: fr.reduce((m, [, d]) => Math.max(m, d), 0),
        over33: fr.filter(([, d]) => Math.round(d / 16.667) > 2).length,
        over50: fr.filter(([, d]) => Math.round(d / 16.667) > 3).length,
        // Every frame that dropped one or more.
        long: fr.filter(([, d]) => Math.round(d / 16.667) >= 2).map(([s, d]) => [Math.round(s), +d.toFixed(1)]),
      });
      const load = stat(win(0, LOAD_MS));
      const afterFcp = fcp == null ? null : stat(win(fcp, LOAD_MS));
      load.worstAfterFcp = afterFcp?.worst ?? null;
      load.over50AfterFcp = afterFcp?.over50 ?? null;
      const end = J.onAt ? J.onAt + SETTLE_MS : performance.now();
      const arrival = J.downAt ? { ...stat(win(J.downAt, end)), downAt: J.downAt, handIn: J.onAt ? J.onAt - J.downAt : null } : null;
      const warm = done != null ? stat(win(done, end)) : null;
      return {
        fcp,
        warmupDone: done,
        load,
        arrival,
        warm,
        sync: performance.getEntriesByName('fs:sync')[0].startTime,
        frames: J.frames,
        loaf: J.loaf,
        gl: J.gl,
        bitmaps: J.bitmaps,
        steps: performance.getEntriesByName('warmup:step').map((m) => m.startTime),
      };
    },
    { LOAD_MS, SETTLE_MS },
  );
  await ptr.stop();
  let trace = null;
  if (TRACE) trace = await browser.stopTracing();
  await browser.close();
  r.loadavg = la;
  r.errors = errors;
  if (TRACE) {
    mkdirSync(TRACE, { recursive: true });
    const base = join(TRACE, `${LABEL.replace(/[^\w.-]+/g, '_')}-${W}x${H}-${i + 1}`);
    writeFileSync(`${base}.json`, trace);
    r.attribution = attribute(JSON.parse(trace.toString()), r);
    writeFileSync(`${base}.frames.json`, JSON.stringify(r));
  }
  return r;
}

// ── attribution ──────────────────────────────────────────────────────────

/**
 * Every long frame (two vsyncs or more) of the load and the arrival, attributed. Main
 * thread (from the trace): React (its scheduler's MessagePort tasks), layout
 * and style, image decodes ON the main thread (an ImageBitmap's crop/resize
 * runs in the task that resolves it, posted from the decoder:
 * `DecodeImageOnDecoderThread`), fonts, other script; from the wrappers,
 * what the main thread spent IN WebGL calls (context set-up, shader
 * compile/link and status reads, uploads, sync reads). Off the main thread:
 * image decodes on the workers, and how busy the GPU process's main thread
 * was. All in ms of overlap with the frame.
 */
function attribute(trace, r) {
  const ev = trace.traceEvents ?? trace;
  const tn = new Map();
  const pn = new Map();
  for (const e of ev) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') tn.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === 'process_name') pn.set(e.pid, e.args.name);
  }
  const sync = ev.find((e) => e.name === 'fs:sync');
  if (!sync) return null;
  const off = sync.ts / 1000 - r.sync;
  const rpid = sync.pid;
  const thread = (e) => tn.get(`${e.pid}:${e.tid}`);
  const X = ev.filter((e) => e.ph === 'X' && e.dur > 0);
  const main = X.filter((e) => e.pid === rpid && thread(e) === 'CrRendererMain');
  const tasks = main.filter((e) => e.name === 'ThreadControllerImpl::RunTask');
  const workers = X.filter((e) => e.pid === rpid && /ThreadPool|TileWorker/.test(thread(e) ?? ''));
  const gpuMain = X.filter((e) => pn.get(e.pid) === 'GPU Process' && thread(e) === 'CrGpuMain' && e.name === 'ThreadControllerImpl::RunTask');
  const t = (e) => [e.ts / 1000 - off, e.ts / 1000 - off + e.dur / 1000];
  const ov = (e, a, b) => {
    const [s, f] = t(e);
    return Math.max(0, Math.min(f, b) - Math.max(s, a));
  };
  const sumOv = (list, a, b) => list.reduce((acc, e) => acc + ov(e, a, b), 0);
  const frames = [
    ...r.load.long.map(([s, d]) => ['load', s, d]),
    ...(r.arrival?.long ?? []).map(([s, d]) => ['arrival', s, d]),
  ];
  const seen = new Set();
  const out = [];
  for (const [phase, s, d] of frames) {
    if (seen.has(s)) continue;
    seen.add(s);
    const a = s;
    const b = s + d;
    const row = { phase, at: s, dt: d };
    // Main-thread tasks by kind.
    const inWin = tasks.filter((e) => ov(e, a, b) > 0);
    const kid = (task, re) => main.filter((e) => e.ts >= task.ts && e.ts + e.dur <= task.ts + task.dur && re.test(e.name));
    let react = 0;
    let decodeMain = 0;
    let other = 0;
    for (const task of inWin) {
      const o = ov(task, a, b);
      const src = task.args?.src_func ?? '';
      if (/DecodeImageOnDecoderThread/.test(src)) decodeMain += o;
      else if (kid(task, /^MessagePort::Accept$/).length) react += o;
      else other += o;
    }
    const layout = sumOv(main.filter((e) => e.name === 'Layout' || e.name === 'UpdateLayoutTree'), a, b);
    const paint = sumOv(main.filter((e) => e.name === 'Paint' || e.name === 'Layerize' || e.name === 'PrePaint'), a, b);
    const fonts = sumOv(main.filter((e) => /Font/i.test(e.name) && e.dur > 100), a, b);
    decodeMain += sumOv(main.filter((e) => e.name === 'Decode Image'), a, b);
    const glk = { context: 0, shader: 0, upload: 0, sync: 0, draw: 0 };
    for (const [kind, , t0, dd] of r.gl) glk[kind] += Math.max(0, Math.min(t0 + dd, b) - Math.max(t0, a));
    const decodeWorkers = sumOv(workers.filter((e) => e.name === 'Decode Image' || e.name === 'Decode LazyPixelRef'), a, b);
    const gpu = sumOv(gpuMain, a, b);
    const mainBusy = sumOv(inWin, a, b);
    // The main thread's CPU time in those tasks (thread time): far under
    // `mainBusy` is the thread waiting or descheduled — the machine, not the page.
    const mainCpu = inWin.reduce((acc, e) => acc + (e.tdur && e.dur ? (ov(e, a, b) * e.tdur) / e.dur : ov(e, a, b)), 0);
    // The biggest named things in the frame, any thread, for the notes.
    const what = new Map();
    for (const e of [...main, ...workers]) {
      if (e.dur < 2000 || /RunTask|ThreadPool_RunTask|BlinkScheduler/.test(e.name)) continue;
      const o = ov(e, a, b);
      if (o < 2) continue;
      const k = `${thread(e) === 'CrRendererMain' ? '' : 'worker: '}${e.name}${e.args?.data?.functionName ? ` ${e.args.data.functionName}` : ''}`;
      what.set(k, Math.max(what.get(k) ?? 0, o));
    }
    const glCalls = new Map();
    for (const [kind, name, t0, dd] of r.gl) {
      const o = Math.max(0, Math.min(t0 + dd, b) - Math.max(t0, a));
      if (o >= 1) glCalls.set(`${kind}:${name}`, (glCalls.get(`${kind}:${name}`) ?? 0) + o);
    }
    const bitmaps = r.bitmaps.filter(([, , done]) => done >= a && done <= b + 5).map(([w, , , bw, bh]) => `${w}→${bw}×${bh}`);
    Object.assign(row, {
      mainBusy,
      mainCpu,
      react,
      layout,
      paint,
      fonts,
      decodeMain,
      decodeWorkers,
      gl: glk,
      other,
      gpu,
      bitmaps,
      top: [...what].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(0)}`),
      glTop: [...glCalls].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}`),
    });
    out.push(row);
  }
  return out;
}

function printAttribution(rows) {
  if (!rows?.length) return;
  const f = (x) => (x >= 0.5 ? x.toFixed(0) : '·').padStart(4);
  console.log('      frame          main  cpu React layout decM decW  ctx  shdr  upl sync fonts  GPU');
  for (const x of rows) {
    console.log(
      `      ${x.phase.padEnd(7)} ${String(x.at).padStart(5)}+${x.dt.toFixed(0).padStart(3)} ${f(x.mainBusy)}${f(x.mainCpu)} ${f(x.react)}  ${f(x.layout)}  ${f(x.decodeMain)} ${f(x.decodeWorkers)} ${f(x.gl.context)} ${f(x.gl.shader)} ${f(x.gl.upload)} ${f(x.gl.sync)}  ${f(x.fonts)} ${f(x.gpu)}`,
    );
    if (x.top.length) console.log(`          ${x.top.join(' | ')}`);
    if (x.glTop.length) console.log(`          gl: ${x.glTop.join(' | ')}`);
    if (x.bitmaps.length) console.log(`          ImageBitmaps resolved: ${x.bitmaps.join(', ')}`);
  }
}

const runs = [];
console.log(`\nfirst-second: ${LABEL}  ${W}×${H} @2×, ${RUNS} run(s)${TRACE ? ', traced' : ''}`);
for (let i = 0; i < RUNS; i++) {
  const r = await oneRun(i);
  runs.push(r);
  const L = (xs) => (xs.length ? `  [${xs.map(([s, d]) => `${d.toFixed(0)}@${s}`).join(', ')}]` : '');
  console.log(
    `  run ${i + 1} (loadavg ${r.loadavg[0].toFixed(2)}): load worst ${r.load.worst.toFixed(1)} (after FCP ${r.load.worstAfterFcp?.toFixed(1)})${L(r.load.long)}` +
      `\n         arrival worst ${r.arrival?.worst.toFixed(1) ?? '—'}${L(r.arrival?.long ?? [])}; after warmup:done (${r.warmupDone?.toFixed(0) ?? '—'} ms) worst ${r.warm?.worst.toFixed(1) ?? '—'}${L(r.warm?.long ?? [])}` +
      (r.errors.length ? `\n         page errors: ${r.errors.slice(0, 3).join(' | ')}` : ''),
  );
  if (TRACE) printAttribution(r.attribution);
}
console.log(`\n${summary(runs)}`);
const pass = {
  load: runs.every((r) => r.load.over50 === 0),
  loadAfterFcp: runs.every((r) => r.load.over50AfterFcp === 0),
  arrival: runs.every((r) => r.arrival && r.arrival.over50 === 0),
  warm: runs.every((r) => r.warm && r.warm.over33 === 0),
};
console.log(`\n  ${pass.load ? '✓' : '✗'} no frame > 50 ms in the first 3 s (from the navigation)`);
console.log(`  ${pass.loadAfterFcp ? '✓' : '✗'} no frame > 50 ms in the first 3 s (from the first contentful paint)`);
console.log(`  ${pass.arrival ? '✓' : '✗'} no frame > 50 ms in the first detail arrival`);
console.log(`  ${pass.warm ? '✓' : '✗'} no frame > 33 ms after warmup:done`);
if (JSON_OUT) {
  // The long frames' Long Animation Frames (what ran in them) stay; the rest goes.
  const slim = runs.map(({ frames, loaf, gl, bitmaps, ...rest }) => {
    const long = [...rest.load.long, ...(rest.arrival?.long ?? [])];
    return { ...rest, loaf: loaf.filter((l) => long.some(([at, d]) => l.start < at + d && l.end > at)) };
  });
  writeFileSync(JSON_OUT, JSON.stringify({ label: LABEL, origin: ORIGIN, size: `${W}x${H}`, pass, runs: slim }, null, 1));
}
