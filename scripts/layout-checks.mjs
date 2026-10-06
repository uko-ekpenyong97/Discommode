/**
 * THE SPACING, as the browser lays it out — the `layout` section `verify:detail`
 * and `verify:reader` share (src/layout/hero.ts, "the Studio Display's gaps
 * are the maximums").
 *
 * The spec is the Studio Display's at the signed-off dials (detailCardScale
 * 0.81, detailGap 40), written down here as numbers (not read back from the
 * code it checks): at 2560 wide the band over the hero and under it is 136.8 —
 * margin 35, the line of chrome, and the gap to the hero/book — and the
 * neighbours sit 40 from an 897.2-wide hero. A smaller screen scales the
 * margin and the gaps by s = the smaller of its width over 2560 and its height
 * over 1300 (less on a short screen, where the hero would get under 0.7 of the
 * height), never under 16px each; the chrome's faces by s too, the smallest
 * never under 32px with a mouse (×32/46; the suites' pages have a fine
 * pointer), its hit area the same. On every viewport, in
 * both views, the margins, the chrome's sizes and the gaps must be those
 * numbers to ±2px, and no line's paper (the scallops, not just the base) may
 * overlap the hero/book. In the detail view, no card number may show without its card (a
 * card two or more from the centre is folded out of sight). Writes a
 * screenshot per viewport to `--shots` (default `.context/layout/`).
 */
import { mkdir } from 'node:fs/promises';

export const LAYOUT_VIEWPORTS = [
  { width: 2560, height: 1440 },
  { width: 2560, height: 1300 },
  { width: 1920, height: 1080 },
  { width: 1728, height: 1117 },
  { width: 1512, height: 982 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  // A tablet's sizes, with a mouse (the touch layout is the same but for one
  // page at a time in portrait, which docs/mobile.md checks).
  { width: 1366, height: 1024 },
  { width: 1180, height: 820 },
  { width: 1024, height: 1366 },
];

/** The Studio Display's spacing, px at k = 1. The top line is the close X
 *  (58); the reader's row carries the 58 book icons, the detail row only 46s. */
export const SPEC = {
  band: 136.8,
  margin: 35,
  top: { box: 58, gap: 43.8 },
  row: { reader: { box: 58, gap: 43.8 }, detail: { box: 46, gap: 55.8 } },
  /** The hero at the reference itself. */
  hero: { w: 897.23, h: 1166.4 },
  /** Hero-to-neighbour gap over the hero's width. */
  neighbourRatio: 40 / 897.2308,
};
const TOL = 2;
/** The hero's least share of the height before a short screen shrinks the
 *  chrome further, the face floor, and the least margin and gap. */
const MIN_SHARE = 0.7;
const FACE_MIN = 32;
const FLOOR = FACE_MIN / 46;
const MIN_GAP = 16;
/** The height under which the chrome shrinks with the height. */
const HEIGHT_REF = 1300;

/** The viewport's scale: the smaller of its width over 2560 and its height
 *  over 1300, or the share's on a short screen, never over 1. */
export const expectedS = (vw, vh) => Math.min(1, vw / 2560, vh / HEIGHT_REF, ((1 - MIN_SHARE) * vh) / (2 * SPEC.band));
/** The faces' k: s, held to the floor. */
export const expectedK = (vw, vh) => Math.min(1, Math.max(FLOOR, expectedS(vw, vh)));
/** A margin or gap at the reference, on this screen: × s, never under 16. */
const shrunk = (ref, s) => Math.max(Math.min(ref, MIN_GAP), ref * s);

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
    const s = expectedS(vw, vh);
    const k = expectedK(vw, vh);
    const rowSpec = SPEC.row[view];
    // The gap to the book is the band's, under the tallest line (58); the
    // detail row's 46s sit that much further from the hero.
    const margin = shrunk(SPEC.margin, s);
    const side = shrunk(SPEC.band - SPEC.margin - SPEC.top.box, s);
    // The hero fills what the band leaves, the open book (20:13) inside the
    // side gaps; on a screen held by its width, the gaps over and under it grow.
    const band = margin + SPEC.top.box * k + shrunk(SPEC.top.gap, s);
    const heroH = Math.min(vh - 2 * band, ((vw - 2 * side) * 13) / 20);
    const gapToBook = (vh - heroH) / 2 - margin - SPEC.top.box * k;
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
        topMargin: margin,
        topBox: SPEC.top.box * k,
        topGap: gapToBook,
        rowGap: gapToBook + (SPEC.top.box - rowSpec.box) * k,
        rowBox: rowSpec.box * k,
        rowMargin: margin,
      };
      const off = Object.keys(want).filter((key) => !near(got[key], want[key]));
      check(
        off.length === 0,
        `${tag}: margins, chrome and gaps are the spec${s < 1 ? ` at s ${s.toFixed(4)}, faces × ${k.toFixed(4)}` : ''} (±${TOL}px)`,
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
      check(m.faces >= FACE_MIN - 0.01 && m.hits >= FACE_MIN - 0.01, `${tag}: faces ≥ ${FACE_MIN}px, hit areas ≥ ${FACE_MIN}×${FACE_MIN}`, `smallest face ${f(m.faces)}, hit ${f(m.hits)}`);
      check(m.close === 'Close', `${tag}: the top shape is "Close"`, `aria-label "${m.close}"`);
      check(near(m.hero.h, heroH), `${tag}: the ${view === 'reader' ? 'book' : 'hero'} fills the space the chrome leaves`, `height ${f(m.hero.h)}, want ${f(heroH)} (${(100 * m.hero.h / vh).toFixed(1)}% of the height)`);
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
