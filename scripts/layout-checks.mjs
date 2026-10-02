/**
 * THE SPACING, as the browser lays it out — the `layout` section `verify:detail`
 * and `verify:reader` share (src/layout/hero.ts, "the book yields to the
 * chrome").
 *
 * The spec is the Studio Display's, measured on `main` at 2560×1440 on
 * 2026-10-01 and written down here as numbers (not read back from the code it
 * checks): the band over the hero and under it is 129.6 — margin 35, the line
 * of chrome, and the gap to the hero/book — and the neighbours sit 40 from a
 * 908.3-wide hero. On every viewport, in both views, the margins, the chrome's
 * sizes and the gaps must be those numbers to ±2px — or, where the chrome
 * shrank on a short screen, those numbers × k (the same k for everything) —
 * and no line's paper (the scallops, not just the base) may overlap the
 * hero/book. In the detail view, no card number may show without its card (a
 * card two or more from the centre is folded out of sight). Writes a
 * screenshot per viewport to `--shots` (default `.context/layout/`).
 */
import { mkdir } from 'node:fs/promises';

export const LAYOUT_VIEWPORTS = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1728, height: 1117 },
  { width: 1512, height: 982 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

/** The Studio Display's spacing, px at k = 1. The top line is the close X
 *  (58); the reader's row carries the 58 book icons, the detail row only 46s. */
export const SPEC = {
  band: 129.6,
  margin: 35,
  top: { box: 58, gap: 36.6 },
  row: { reader: { box: 58, gap: 36.6 }, detail: { box: 46, gap: 48.6 } },
  /** The hero at the reference itself. */
  hero: { w: 908.31, h: 1180.8 },
  /** Hero-to-neighbour gap over the hero's width. */
  neighbourRatio: 40 / 908.3077,
};
const TOL = 2;
/** The hero's least share of the height before the chrome shrinks, and the
 *  face floor the shrink stops at. */
const MIN_SHARE = 0.7;
const FLOOR = 44 / 46;

/** The k the spec gives this viewport: 1, or the share's, held to the floor. */
export const expectedK = (vh) => Math.min(1, Math.max(FLOOR, ((1 - MIN_SHARE) * vh) / (2 * SPEC.band)));

/** The page's numbers: the top line, the row, the hero/book, the neighbours. */
function measure(view) {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const union = (bs) =>
    bs.reduce((a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) }));
  const paperOf = (line) => union([...line.querySelectorAll('.paper__fill:not(.paper-pill__paper .paper__fill), .paper-pill__paper')].map(box));
  const baseOf = (line) => union([...line.querySelectorAll('.paper__shape')].map(box));
  const root = document.querySelector(view === 'reader' ? '.reader' : '.detail');
  const top = root.querySelector('.chrome-top');
  const row = root.querySelector('.chrome-row');
  const out = {
    topBase: baseOf(top),
    topPaper: paperOf(top),
    rowBase: baseOf(row),
    rowPaper: paperOf(row),
    fit: [top, row].map((l) => Number(getComputedStyle(l).getPropertyValue('--chrome-fit').trim() || 1)),
    faces: Math.min(...[...root.querySelectorAll('[data-chrome] .paper__shape')].map((e) => Math.min(box(e).w, box(e).h))),
    hits: Math.min(...[...root.querySelectorAll('button[data-chrome]')].map((e) => Math.min(box(e).w, box(e).h))),
    close: top.getAttribute('aria-label'),
  };
  if (view === 'reader') {
    out.hero = box(document.querySelector('.book'));
  } else {
    out.hero = box(root.querySelector('.detail__panel--center'));
    const panels = [...root.querySelectorAll('.detail__panel:not(.detail__panel--center)')].map(box);
    out.left = panels.filter((p) => p.r <= out.hero.l + 1).sort((a, b) => b.r - a.r)[0];
    out.right = panels.filter((p) => p.l >= out.hero.r - 1).sort((a, b) => a.l - b.l)[0];
    // Every card's number label that is on screen: is its card folded out of
    // sight (two or more from the centre), and does the label show?
    out.labels = [...root.querySelectorAll('.detail__panel')]
      .map((p) => {
        const n = p.querySelector('.detail__panel-num');
        const b = box(n);
        return {
          text: n.textContent.trim(),
          folded: p.hasAttribute('data-folded'),
          shown: Number(getComputedStyle(n).opacity) > 0.01,
          onScreen: b.r > 0 && b.l < innerWidth && b.b > 0 && b.t < innerHeight,
        };
      })
      .filter((l) => l.onScreen);
  }
  return out;
}

/**
 * Every viewport, at rest: the detail view at `#item-01`, or the reader at the
 * cover, an open spread (`openState`, where the book's width is checked) and
 * the back. `open(page, state)` loads and settles a state; `check(pass, label,
 * extra)` reports.
 */
export async function checkLayout({ browser, view, states, openState, open, check, errors, shots = '.context/layout' }) {
  console.log(`\nlayout: the Studio Display's spacing, every viewport (${view})`);
  await mkdir(shots, { recursive: true });
  const near = (a, b) => Math.abs(a - b) <= TOL;
  const f = (n) => n.toFixed(1);
  for (const viewport of LAYOUT_VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const { width: vw, height: vh } = viewport;
    const k = expectedK(vh);
    const rowSpec = SPEC.row[view];
    for (const state of states) {
      await open(page, state);
      // Off the chrome and off the cards (a hover lifts a shape, and a hovered
      // card dims the others): the corner, over the top band.
      await page.mouse.move(3, 3);
      await page.waitForTimeout(400);
      const m = await page.evaluate(measure, view);
      const tag = `${vw}×${vh}${view === 'reader' ? `, spread ${state}` : ''}`;
      const got = {
        topMargin: m.topBase.t,
        topBox: m.topBase.b - m.topBase.t,
        topGap: m.hero.t - m.topBase.b,
        rowGap: m.rowBase.t - m.hero.b,
        rowBox: m.rowBase.b - m.rowBase.t,
        rowMargin: vh - m.rowBase.b,
      };
      const want = {
        topMargin: SPEC.margin * k,
        topBox: SPEC.top.box * k,
        topGap: SPEC.top.gap * k,
        rowGap: rowSpec.gap * k,
        rowBox: rowSpec.box * k,
        rowMargin: SPEC.margin * k,
      };
      const off = Object.keys(want).filter((key) => !near(got[key], want[key]));
      check(
        off.length === 0,
        `${tag}: margins, chrome and gaps are the spec${k < 1 ? ` × ${k.toFixed(4)}` : ''} (±${TOL}px)`,
        Object.keys(want)
          .map((key) => `${key} ${f(got[key])}${off.includes(key) ? ` ≠ ${f(want[key])}` : ''}`)
          .join(', '),
      );
      check(
        m.fit.every((x) => Math.abs(x - k) < 1e-4),
        `${tag}: both lines are at k`,
        `--chrome-fit ${m.fit.join(' / ')}, want ${k.toFixed(5)}`,
      );
      const topClear = m.hero.t - m.topPaper.b;
      const rowClear = m.rowPaper.t - m.hero.b;
      check(topClear > 0 && rowClear > 0, `${tag}: no paper over the ${view === 'reader' ? 'book' : 'hero'}`, `top ${f(topClear)}px clear, row ${f(rowClear)}px clear`);
      check(m.faces >= 44 - 0.01 && m.hits >= 44 - 0.01, `${tag}: faces ≥ 44px, hit areas ≥ 44×44`, `smallest face ${f(m.faces)}, hit ${f(m.hits)}`);
      check(m.close === 'Close', `${tag}: the top shape is "Close"`, `aria-label "${m.close}"`);
      if (vw === 2560 && vh === 1440) {
        check(
          near(m.hero.h, SPEC.hero.h) && (view === 'reader' || near(m.hero.w, SPEC.hero.w)),
          `${tag}: the hero is the signed-off ${SPEC.hero.w}×${SPEC.hero.h}`,
          `${f(m.hero.w)}×${f(m.hero.h)}`,
        );
      }
      if (view === 'detail') {
        const want = SPEC.neighbourRatio * m.hero.w;
        const gaps = [m.left && m.hero.l - m.left.r, m.right && m.right.l - m.hero.r];
        check(
          gaps.every((g) => g != null && near(g, want)),
          `${tag}: neighbours ${f(want)} from the hero (${(100 * SPEC.neighbourRatio).toFixed(2)}% of its width)`,
          `left ${gaps[0] == null ? '—' : f(gaps[0])}, right ${gaps[1] == null ? '—' : f(gaps[1])}`,
        );
        // A card folded out of sight takes its number with it; the hero's and
        // the neighbours' numbers stay.
        const stray = m.labels.filter((l) => l.folded && l.shown);
        const lost = m.labels.filter((l) => !l.folded && !l.shown);
        check(
          stray.length === 0 && lost.length === 0,
          `${tag}: a number only on a card you can see`,
          m.labels.map((l) => `${l.text}${l.folded ? ' (folded)' : ''} ${l.shown ? 'shown' : 'hidden'}`).join(', '),
        );
      }
      if (view === 'reader' && state === openState) {
        // The open book, inside the side gaps (it is the hero's height that
        // gives way when it does not fit).
        const side = (SPEC.band - SPEC.margin - SPEC.top.box) * k;
        check(m.hero.l >= side - TOL && m.hero.r <= vw - side + TOL, `${tag}: the open book is inside the side gaps`, `${f(m.hero.l)}–${f(m.hero.r)} of ${vw}, gap ${f(side)}`);
      }
      const shot = view === 'reader' ? `${shots}/reader-${vw}x${vh}-spread${state}.png` : `${shots}/detail-${vw}x${vh}.png`;
      // The dev overlays out of the picture, for the eye; nothing measured.
      await page.addStyleTag({ content: '.env-readout, .dialkit-root { visibility: hidden !important; }' });
      await page.screenshot({ path: shot });
    }
    await context.close();
  }
}
