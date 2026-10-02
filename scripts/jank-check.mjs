/**
 * Frame times across the page's everyday paths, in Chrome — `npm run
 * verify:jank -- --url <origin>`. Works against the dev server and against a
 * production build (`vite preview`): it needs no dev hook, except the one case
 * that opens card 04's DialKit panel (dev `?intro` only).
 *
 *   --url <origin>   the server (in a worktree, always pass it: :5173 is
 *                    usually another checkout's)
 *   --dock           load `/?intro` — the app's dev dock up (dev only)
 *   --early          the first sweep at once, as the grid appears — before
 *                    the warm-up is done (it takes over on demand)
 *   --label <name>   the run's name in the table and the JSON
 *   --json <file>    write the run's rows as JSON
 *   --compare a.json b.json [c.json …]   print runs side by side, no browser
 *
 * One page, 1728×1117 @2×, the pointer moving from the first frame and never
 * parked (it jitters around wherever the next action happens). The cases, in
 * order:
 *
 *   first sweep   the first pass of the pointer over the grid after load: a
 *                 slow sweep across the centre row. It starts at the page's
 *                 `warmup:done` mark (src/warmup.ts); a build without one
 *                 (main) waits as long as the branch's warm-up took, 4 s.
 *   sweep slow    across the centre row in 2.5 s, and back
 *   sweep fast    across in 0.4 s, and back, three times
 *   grid→detail   a click on the centre card: the morph, to the settled hero
 *   next ×3       the Next button three times (01 → 04), one slide each
 *   prev ×3       the Previous button back to 01
 *   keys →←       ArrowRight, ArrowLeft
 *   detail→reader Read issue: the doorway, to the open cover
 *   reader→detail the reader's Close: back to the detail view
 *   detail→grid   the detail's Close: the morph back
 *   04 panel      (`--dock` only) card 04's COVER panel opened, its STATUS
 *                 readout live; the pointer over card 04's tile, then over
 *                 its hero in the detail view
 *   whole run     every frame from the first sweep to the end, the gaps
 *                 between the cases included
 *   warm-up       (informational, before the cases) every frame from the
 *                 first paint to `warmup:done` (main: to the fixed wait)
 *   hidden tab    the idle warm-up's visibility guard, in a page of its own:
 *                 the tab hidden as it loads (another tab activated), shown
 *                 2.5 s later. Pass: it really was hidden, no `warmup:step`
 *                 ran while it was — though idle callbacks did fire, which is
 *                 what makes the zero the guard's — and `warmup:done` came
 *                 within 5 s of showing it. Raw CDP into a Chrome of its own
 *                 (`--chrome <path>`, default the macOS app): Playwright's
 *                 focus emulation keeps every page it drives "visible". A
 *                 build without the mark (main) skips it.
 *
 * Every rAF interval and every Long Animation Frame (with the scripts in it)
 * is recorded; each case reports its frames, the worst, how many were over 33
 * and over 50 ms, and what ran in the worst.
 *
 * Pass (printed, and the exit code): without the dock, no frame over 33 ms in
 * any case; with it, none over 50 ms; and the hidden-tab guard held.
 */
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};

const W = 1728;
const H = 1117;
const DPR = 2;
const NO_MARK_WAIT_MS = 4000;
const HIDDEN_MS = 2500;
const SHOWN_DONE_MS = 5000;

// ── compare ──────────────────────────────────────────────────────────────

if (argv.includes('--compare')) {
  const files = argv.slice(argv.indexOf('--compare') + 1).filter((a) => !a.startsWith('--'));
  const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const names = [...new Set(runs.flatMap((r) => r.rows.map((x) => x.name)))];
  const cell = (row) => (row ? `${row.worst.toFixed(0).padStart(4)} ms ${String(row.over33).padStart(2)}/${String(row.over50).padStart(2)}` : '         —   ');
  console.log(`\n${'case'.padEnd(16)}${runs.map((r) => r.label.padStart(18)).join('')}`);
  console.log(`${''.padEnd(16)}${runs.map(() => 'worst  >33/>50'.padStart(18)).join('')}`);
  for (const n of names) console.log(`${n.padEnd(16)}${runs.map((r) => cell(r.rows.find((x) => x.name === n)).padStart(18)).join('')}`);
  console.log(`${'warmup:done'.padEnd(16)}${runs.map((r) => (r.warmupMs == null ? '—' : `${Math.round(r.warmupMs)} ms`).padStart(18)).join('')}`);
  console.log(`${'hidden tab'.padEnd(16)}${runs.map((r) => (!r.hidden || r.hidden.skipped ? '—' : r.hidden.pass ? `✓ ${r.hidden.stepsHidden} steps hidden` : '✗').padStart(18)).join('')}`);
  process.exit(0);
}

// ── the run ──────────────────────────────────────────────────────────────

const ORIGIN = arg('--url', 'http://localhost:5173');
const DOCK = argv.includes('--dock');
const EARLY = argv.includes('--early');
const LABEL = arg('--label', `${ORIGIN}${DOCK ? ' ?intro' : ''}`);
const JSON_OUT = arg('--json', null);
const CHROME = arg('--chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
// In vsyncs at 60 Hz: two (one frame dropped) without the dock, three with it.
const BUDGET = DOCK ? 50.1 : 33.4;

/** Installed before the page's scripts: every rAF interval and LoAF. */
function probe() {
  const J = (window.__jank = { frames: [], loaf: [] });
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
          block: e.blockingDuration,
          render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          scripts: e.scripts
            .filter((s) => s.duration >= 3)
            .map((s) => `${s.invoker}${s.sourceFunctionName ? ` ${s.sourceFunctionName}` : ''} (${(s.sourceURL || '').split('/').pop().split('?')[0]}) ${Math.round(s.duration)}`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* no LoAF: the frames still count */
  }
}

/** A pointer that never rests: jitters around `at()` every ~16 ms; `path`
 *  runs a scripted move instead, then hands back to the jitter. */
function pointer(page, at) {
  const st = { stop: false, at, path: null };
  const done = (async () => {
    let k = 0;
    while (!st.stop) {
      if (st.path) {
        const p = st.path;
        st.path = null;
        await p.run().catch(() => {});
        p.resolve();
        continue;
      }
      k++;
      const p = st.at();
      await page.mouse.move(p.x + 6 * Math.sin(k / 3), p.y + 5 * Math.cos(k / 4)).catch(() => {});
      await page.waitForTimeout(16).catch(() => {});
    }
  })();
  return {
    set: (fn) => (st.at = fn),
    /** Move through `pts` over `ms`, one step a frame; resolves at the end. */
    path: (pts, ms) =>
      new Promise((resolve) => {
        st.path = {
          resolve,
          run: async () => {
            const steps = Math.max(2, Math.round(ms / 16));
            const t0 = Date.now();
            for (let i = 0; i <= steps; i++) {
              const u = (i / steps) * (pts.length - 1);
              const j = Math.min(Math.floor(u), pts.length - 2);
              const k = u - j;
              await page.mouse.move(pts[j].x + (pts[j + 1].x - pts[j].x) * k, pts[j].y + (pts[j + 1].y - pts[j].y) * k);
              const wait = t0 + ((i + 1) * ms) / steps - Date.now();
              if (wait > 0) await page.waitForTimeout(wait);
            }
            // Jitter where the path ended, not where it began: a click right
            // after it must land on the path's end.
            const end = pts.at(-1);
            st.at = () => end;
          },
        };
      }),
    stop: async () => ((st.stop = true), await done),
  };
}

const now = (page) => page.evaluate(() => performance.now());

/** The frames and long frames between two page times. */
async function windowOf(page, name, t0, t1) {
  return page.evaluate(
    ({ name, t0, t1 }) => {
      const J = window.__jank;
      const frames = J.frames.filter(([s, e]) => e > t0 && s < t1).map(([s, e]) => ({ s, dt: e - s }));
      const worstF = frames.reduce((a, f) => (f.dt > (a?.dt ?? 0) ? f : a), null);
      const lo = worstF ? J.loaf.filter((l) => l.start < worstF.s + worstF.dt && l.end > worstF.s) : [];
      const what = lo.length
        ? lo.map((l) => `LoAF ${Math.round(l.end - l.start)} (block ${Math.round(l.block)}, render ${Math.round(l.render)})${l.scripts.length ? ': ' + l.scripts.slice(0, 3).join(', ') : ''}`).join('; ')
        : worstF && worstF.dt > 20
          ? 'no LoAF: compositor / GPU'
          : '';
      const long = frames.filter((f) => f.dt > 33).map((f) => Math.round(f.dt));
      return {
        name,
        frames: frames.length,
        worst: worstF?.dt ?? 0,
        over33: frames.filter((f) => f.dt > 33.4).length,
        over50: frames.filter((f) => f.dt > 50).length,
        long,
        what,
      };
    },
    { name, t0, t1 },
  );
}

async function centreCard(page) {
  return page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('.grid-card')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight / 2);
      if (!best || d < best.d) best = { d, x: r.x + r.width / 2, y: r.y + r.height * 0.45 };
    }
    return best;
  });
}

async function rectOf(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
}

const settle = (page, ms) => page.waitForTimeout(ms);

/**
 * The visibility guard, over raw CDP in a Chrome of its own (see the header).
 * Returns the result row, or { skipped } for a build without the mark.
 */
async function checkHidden() {
  const dir = mkdtempSync(join(tmpdir(), 'jank-hidden-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ws;
  try {
    let ver = null;
    for (let i = 0; i < 75 && !ver; i++) {
      await sleep(200);
      ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!ver) throw new Error(`no Chrome at ${CHROME}`);
    ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', j, { once: true });
    });
    let id = 0;
    const wait = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && wait.has(m.id)) {
        wait.get(m.id)(m);
        wait.delete(m.id);
      }
    });
    const send = (method, params = {}, sessionId) =>
      new Promise((res, rej) => {
        const i = ++id;
        wait.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
        ws.send(JSON.stringify({ id: i, method, params, sessionId }));
      });
    const { targetInfos } = await send('Target.getTargets');
    const A = targetInfos.find((t) => t.type === 'page').targetId;
    const { sessionId: s } = await send('Target.attachToTarget', { targetId: A, flatten: true });
    await send('Page.enable', {}, s);
    // When it was hidden and shown, and how many idle callbacks ran hidden.
    await send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `window.__vis = [[performance.now(), document.visibilityState]];
document.addEventListener('visibilitychange', () => window.__vis.push([performance.now(), document.visibilityState]));
window.__idleHidden = 0;
const tick = () => { if (document.visibilityState === 'hidden') window.__idleHidden++; requestIdleCallback(tick); };
requestIdleCallback(tick);`,
      },
      s,
    );
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s)).result.value;
    await send('Page.navigate', { url: `${ORIGIN}/` }, s);
    const { targetId: B } = await send('Target.createTarget', { url: 'about:blank' });
    await send('Target.activateTarget', { targetId: B });
    await sleep(HIDDEN_MS);
    await send('Target.activateTarget', { targetId: A });
    await sleep(SHOWN_DONE_MS + 500);
    const r = await ev(`(() => {
      const vis = window.__vis;
      const hidAt = vis.find(([, v]) => v === 'hidden')?.[0] ?? null;
      const shownAt = hidAt == null ? null : vis.find(([t, v]) => v === 'visible' && t > hidAt)?.[0] ?? null;
      const steps = performance.getEntriesByName('warmup:step').map((m) => m.startTime);
      const done = performance.getEntriesByName('warmup:done')[0]?.startTime ?? null;
      const hasMark = done != null || steps.length > 0;
      return { hidAt, shownAt, idleHidden: window.__idleHidden, steps, done, hasMark };
    })()`);
    if (!r.hasMark) return { name: 'hidden tab', skipped: true };
    const stepsHidden = r.hidAt == null ? null : r.steps.filter((t) => t >= r.hidAt && (r.shownAt == null || t < r.shownAt)).length;
    const doneAfterShow = r.done != null && r.shownAt != null ? r.done - r.shownAt : null;
    const hidden = r.hidAt != null && r.shownAt != null;
    const pass = hidden && r.idleHidden > 0 && stepsHidden === 0 && doneAfterShow != null && doneAfterShow >= 0 && doneAfterShow <= SHOWN_DONE_MS;
    return {
      name: 'hidden tab',
      pass,
      hidAt: r.hidAt,
      shownAt: r.shownAt,
      idleHidden: r.idleHidden,
      stepsHidden,
      firstStepAfterShow: r.shownAt == null ? null : (r.steps.find((t) => t >= r.shownAt) ?? null),
      done: r.done,
      doneAfterShow,
    };
  } finally {
    ws?.close();
    proc.kill();
    await sleep(500);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

function reportHidden(h) {
  if (h.skipped) {
    console.log(`  · ${'hidden tab'.padEnd(15)} no warmup:step / warmup:done marks: skipped`);
    return;
  }
  const f = (t) => (t == null ? '—' : `${Math.round(t)} ms`);
  console.log(
    `  ${h.pass ? '✓' : '✗'} ${'hidden tab'.padEnd(15)} hidden at ${f(h.hidAt)}, shown at ${f(h.shownAt)}: ${h.idleHidden} idle callbacks while hidden, ${h.stepsHidden ?? '?'} warm-up steps; first step ${f(h.firstStepAfterShow)}, warmup:done ${f(h.done)} (${h.doneAfterShow == null ? 'never' : `${Math.round(h.doneAfterShow)} ms after showing`})`,
  );
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.addInitScript(probe);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rows = [];
  const ptr = pointer(page, () => ({ x: W / 2, y: 120 }));
  const url = `${ORIGIN}/${DOCK ? '?intro' : ''}`;
  await page.goto(url);
  await page.waitForSelector('.grid-card');

  // The warm-up: the page's own `warmup:done` mark, or (a build without one)
  // a fixed wait.
  const hasWarmup = EARLY
    ? false
    : await page
        .waitForFunction(() => performance.getEntriesByName('warmup:done').length > 0, null, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
  let warmupMs = hasWarmup ? await page.evaluate(() => performance.getEntriesByName('warmup:done')[0].startTime) : null;
  if (!hasWarmup && !EARLY) await page.waitForFunction((ms) => performance.now() > ms, NO_MARK_WAIT_MS, { timeout: 20000 });

  // The warm-up's own frames (first paint → warmup:done; a build without the
  // mark: → the same fixed wait), the pointer moving over the top of the
  // grid. Informational: before the cases, and not judged.
  {
    const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
    const end = warmupMs ?? (EARLY ? fcp : NO_MARK_WAIT_MS);
    if (end > fcp) {
      const w = await windowOf(page, 'warm-up', fcp, end);
      w.info = true;
      rows.push(w);
      console.log(`  · ${'warm-up'.padEnd(15)} ${String(w.frames).padStart(4)} frames from first paint (${Math.round(fcp)} ms), worst ${w.worst.toFixed(1)} ms, >33: ${w.over33}, >50: ${w.over50}${w.long.length ? `  [${w.long.join(', ')}]` : ''}  (informational)${w.what ? `\n      worst: ${w.what}` : ''}`);
    }
  }

  const c = await centreCard(page);
  const row = (dir = 1) => {
    const a = { x: 60, y: c.y };
    const b = { x: W - 60, y: c.y };
    return dir > 0 ? [a, b] : [b, a];
  };
  const measure = async (name, fn, tail = 400) => {
    const t0 = await now(page);
    await fn();
    await settle(page, tail);
    const t1 = await now(page);
    const w = await windowOf(page, name, t0, t1);
    rows.push(w);
    console.log(`  ${w.worst > BUDGET ? '✗' : '✓'} ${name.padEnd(15)} ${String(w.frames).padStart(4)} frames, worst ${w.worst.toFixed(1)} ms, >33: ${w.over33}, >50: ${w.over50}${w.long.length ? `  [${w.long.join(', ')}]` : ''}${w.what ? `\n      worst: ${w.what}` : ''}`);
  };

  console.log(`\njank: ${LABEL}  (${W}×${H} @${DPR}×; budget ${BUDGET} ms)${warmupMs != null ? `  warmup:done at ${Math.round(warmupMs)} ms` : '  (no warmup:done mark)'}`);

  ptr.set(() => row()[0]);
  await settle(page, 300);
  const runStart = await now(page);
  await measure(EARLY ? 'early sweep' : 'first sweep', () => ptr.path(row(), 2500));
  if (EARLY) warmupMs = await page.evaluate(() => performance.getEntriesByName('warmup:done')[0]?.startTime ?? null);
  await measure('sweep slow', async () => {
    await ptr.path(row(-1), 2500);
    await ptr.path(row(), 2500);
  });
  await measure('sweep fast', async () => {
    for (let i = 0; i < 3; i++) {
      await ptr.path(row(-1), 400);
      await ptr.path(row(), 400);
    }
  });

  // grid → detail: on the centre card, then the click, to the settled hero.
  const card = await centreCard(page);
  await ptr.path([row()[1], card], 500);
  ptr.set(() => card);
  await settle(page, 600);
  await measure(
    'grid→detail',
    async () => {
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('.detail', { timeout: 10000 });
      await page.waitForFunction(() => document.querySelector('.detail')?.dataset.paper === 'in', null, { timeout: 10000 }).catch(() => {});
    },
    900,
  );

  const press = async (sel, n) => {
    for (let i = 0; i < n; i++) {
      const p = await rectOf(page, sel);
      if (!p) throw new Error(`no ${sel}`);
      await ptr.path([await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 })), p], 250);
      ptr.set(() => p);
      await page.mouse.down();
      await page.mouse.up();
      await settle(page, 900);
    }
  };
  await measure('next ×3', () => press('[data-chrome="next"]', 3));
  await measure('prev ×3', () => press('[data-chrome="prev"]', 3));
  ptr.set(() => ({ x: W / 2, y: H / 2 }));
  await measure('keys →←', async () => {
    await page.keyboard.press('ArrowRight');
    await settle(page, 900);
    await page.keyboard.press('ArrowLeft');
    await settle(page, 900);
  });

  await measure(
    'detail→reader',
    async () => {
      await press('.detail__btn--read', 1);
      await page.waitForFunction(() => /^#read-/.test(location.hash), null, { timeout: 10000 });
      await settle(page, 2500);
    },
    300,
  );
  await measure(
    'reader→detail',
    async () => {
      await press('.reader__back', 1);
      await page.waitForFunction(() => !/^#read-/.test(location.hash) && !document.querySelector('.reader'), null, { timeout: 10000 });
      await settle(page, 1800);
    },
    300,
  );
  await measure(
    'detail→grid',
    async () => {
      await press('.detail__back', 1);
      await page.waitForFunction(() => !document.querySelector('.detail'), null, { timeout: 10000 });
      await settle(page, 1200);
    },
    300,
  );

  if (DOCK) {
    // Card 04's COVER panel open, its STATUS readout live (dev hook).
    const opened = await page.evaluate(() => {
      const s = window.__dialStore;
      const p = s?.getPanels().find((x) => x.name === 'COVER · nosey');
      if (!p) return false;
      s.setPanelOpen(p.id, true);
      return true;
    });
    if (!opened) console.log('  · 04 panel: no COVER · nosey panel registered');
    else {
      await settle(page, 1200);
      // Card 04 to the centre of the grid with the arrow keys (it starts three
      // columns right of 01), clear of the dock.
      ptr.set(() => ({ x: W / 2, y: 80 }));
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowRight');
        await settle(page, 350);
      }
      await settle(page, 1200);
      const tile = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.cover-tile[data-cover="nosey"]')]
          .map((el) => el.getBoundingClientRect())
          .sort((p, q) => Math.abs(p.x + p.width / 2 - innerWidth / 2) - Math.abs(q.x + q.width / 2 - innerWidth / 2))[0];
        return r ? { x0: r.x + 10, x1: r.right - 10, y: r.y + r.height / 2 } : null;
      });
      if (tile) {
        await measure('04 panel grid', async () => {
          for (let i = 0; i < 3; i++) {
            await ptr.path([{ x: tile.x0, y: tile.y }, { x: tile.x1, y: tile.y }], 700);
            await ptr.path([{ x: tile.x1, y: tile.y }, { x: tile.x0, y: tile.y }], 700);
          }
        });
      } else console.log('  · 04 panel grid: card 04 not on screen');
      await page.evaluate(() => (location.hash = '#item-04'));
      ptr.set(() => ({ x: W / 2, y: H / 2 }));
      await page.waitForSelector('.detail', { timeout: 10000 });
      await settle(page, 2500);
      const hero = await rectOf(page, '.detail__panel--center');
      await measure('04 panel hero', async () => {
        for (let i = 0; i < 3; i++) {
          await ptr.path([{ x: hero.x - 200, y: hero.y }, { x: hero.x + 200, y: hero.y }], 700);
          await ptr.path([{ x: hero.x + 200, y: hero.y }, { x: hero.x - 200, y: hero.y }], 700);
        }
      });
    }
  }

  // The whole run, the gaps between the cases included (a dock panel opening
  // for the view once a move has settled lands in them).
  {
    const w = await windowOf(page, 'whole run', runStart, await now(page));
    rows.push(w);
    console.log(`  ${w.worst > BUDGET ? '✗' : '✓'} ${'whole run'.padEnd(15)} ${String(w.frames).padStart(4)} frames, worst ${w.worst.toFixed(1)} ms, >33: ${w.over33}, >50: ${w.over50}${w.what ? `\n      worst: ${w.what}` : ''}`);
  }

  await ptr.stop();
  await browser.close();
  // The visibility guard, in a page of its own (raw CDP).
  let hidden;
  try {
    hidden = await checkHidden();
  } catch (e) {
    hidden = { name: 'hidden tab', pass: false, error: String(e.message ?? e) };
    console.log(`  ✗ ${'hidden tab'.padEnd(15)} ${hidden.error}`);
  }
  if (!hidden.error) reportHidden(hidden);

  const failed = rows.filter((r) => !r.info && r.worst > BUDGET).map((r) => r.name);
  if (!hidden.skipped && !hidden.pass) failed.push('hidden tab');
  console.log(failed.length ? `\n✗ ${failed.length} case(s) failed: ${failed.join(', ')}` : `\n✓ every case within ${BUDGET} ms, and the hidden-tab guard held`);
  if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ label: LABEL, origin: ORIGIN, dock: DOCK, warmupMs, rows, hidden }, null, 1));
  process.exitCode = failed.length ? 1 : 0;
}

await run();
