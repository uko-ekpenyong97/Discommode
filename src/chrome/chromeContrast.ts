import { skyEngine } from '../sky/skyStage';
import type { SkyTarget, ViewRect } from '../sky/skyEngine';
import type { LiveConfig } from '../config';
import { SWEEP_WORST_DIALS } from '../portfolio/contrastProbe';
import { CHROME, CHROME_REQUIRED, setChrome } from './chromeDials';
import { chromePaint, contrast } from './chromeColor';
import type { RGB } from './chromeColor';
import { chromeShapes } from './useSkyChrome';

/**
 * DEV-ONLY: THE CHROME AGAINST THE SKY. Every paper shape on screen (the
 * reader's or the detail view's), each asked the one question that decides
 * its contrast: given the sky under THIS shape, what paper and ink does
 * `chromePaint` make, and is the ink ≥ 4.5:1 on it — and did the paper have to
 * be clamped off `chromeFillLightness` to get there.
 *
 * The sky is the MEAN colour of the canvas under each shape's face, which is
 * exactly what the live chrome reads (`SkyEngine.readMeans`); here it is read
 * synchronously (`sampleMeans`), of any sky, or for a whole day of skies with
 * a hand in them on the GPU (`sweepMeans`), the way the letterhead's sweep is.
 */

interface Face {
  el: HTMLElement;
  kind: string;
  rect: ViewRect;
  disabled: boolean;
}

function faces(): Face[] {
  const out: Face[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-paper]')) {
    const face = el.querySelector<HTMLElement>('.paper__shape') ?? el;
    const r = face.getBoundingClientRect();
    if (r.width === 0) continue;
    // A shape of the app under the reader layer is not on screen.
    if (el.closest('[inert]')) continue;
    out.push({
      el,
      kind: el.dataset.paper ?? '',
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      disabled: (el as HTMLButtonElement).disabled === true,
    });
  }
  return out;
}

const parse = (css: string): RGB => {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
};
const r1 = (c: RGB): RGB => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

export interface ChromeSample {
  kind: string;
  disabled: boolean;
  sky: RGB;
  fill: RGB;
  ink: RGB;
  ratio: number;
  clamp: { from: number; to: number } | null;
  pass: boolean;
  /** Live only: what the stylesheet is painting on the element right now, and
   *  its ratio — so a drift between the model and the page shows. */
  painted?: { fill: RGB; ink: RGB; ratio: number };
}

/**
 * Every shape on screen against one sky: `sky` (a hypothetical sky, drawn
 * into the back buffer and read, the live one untouched), or with no sky the
 * LIVE chrome — the sky it last read and the paint it is showing, and what
 * the page computes for each element. Null with no chrome on screen.
 */
export function probeChrome(opts: { sky?: SkyTarget } = {}): { samples: ChromeSample[]; worst: number; failures: number; clamps: number } | null {
  const fs = faces();
  if (fs.length === 0) return null;
  let samples: ChromeSample[];
  if (opts.sky) {
    const skies = skyEngine()?.sampleMeans(fs.map((f) => f.rect), opts.sky);
    if (!skies) return null;
    samples = fs.map((f, i) => {
      const p = chromePaint(skies[i]);
      return { kind: f.kind, disabled: f.disabled, sky: r1(skies[i]), fill: p.fill, ink: p.ink, ratio: p.ratio, clamp: p.clamp, pass: p.ratio >= CHROME_REQUIRED };
    });
  } else {
    const live = new Map(chromeShapes().map((s) => [s.el, s]));
    samples = fs.flatMap((f) => {
      const s = live.get(f.el);
      if (!s) return [];
      const cs = getComputedStyle(f.el);
      const fill = parse(cs.getPropertyValue('--paper'));
      const ink = parse(cs.getPropertyValue('--ink'));
      return [{
        kind: f.kind,
        disabled: f.disabled,
        sky: r1(s.sky),
        fill: s.paint.fill,
        ink: s.paint.ink,
        ratio: s.paint.ratio,
        clamp: s.paint.clamp,
        pass: s.paint.ratio >= CHROME_REQUIRED,
        painted: { fill, ink, ratio: contrast(fill, ink) },
      }];
    });
  }
  const round = (x: number) => Math.round(x * 100) / 100;
  for (const s of samples) {
    s.ratio = round(s.ratio);
    if (s.painted) s.painted.ratio = round(s.painted.ratio);
  }
  return {
    samples,
    worst: Math.min(...samples.map((s) => Math.min(s.ratio, s.painted?.ratio ?? Infinity))),
    failures: samples.filter((s) => !s.pass || (s.painted && s.painted.ratio < CHROME_REQUIRED)).length,
    clamps: samples.filter((s) => s.clamp).length,
  };
}

/** Fastest a pointer puts air in, screen heights / s (the engine's cap). */
const SWIPE_SPEED = 4;

/**
 * THE SWIPE, for the chrome: along the row of every chrome line on screen
 * (the top shape's, the bottom row's) and a diagonal from low left to top
 * right that drags the sky through both, each at the fastest the wake takes,
 * each left to decay. One entry per 60Hz frame, CSS px and px / s.
 */
export function chromeSwipe(): { x: number; y: number; dx: number; dy: number }[][] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const step = (SWIPE_SPEED * vh) / 60;
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(len / step);
    const dx = ((x1 - x0) / len) * SWIPE_SPEED * vh;
    const dy = ((y1 - y0) / len) * SWIPE_SPEED * vh;
    return Array.from({ length: n + 1 }, (_, i) => [{ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, dx, dy }]);
  };
  const rest = (n: number) => Array.from({ length: n }, () => []);
  const rows = [...new Set(faces().map((f) => Math.round(f.rect.y + f.rect.h / 2)))];
  return [
    ...rows.flatMap((y) => [...path(-0.05 * vw, y, 1.05 * vw, y), ...rest(15)]),
    ...path(0.05 * vw, vh, 0.95 * vw, 0),
    ...rest(30),
  ];
}

export interface ChromeSweep {
  /** Per sky: the worst glyph ratio over the wake and at rest, and which shape. */
  ratio: number[];
  restRatio: number[];
  kind: string[];
  /** Per sky: the wake frame the worst was at (−1 = at rest). */
  frame: number[];
  /** Per sky: how many (shape, sample) pairs had to clamp the paper. */
  clamps: number[];
  /** The deepest clamps seen, for the report: shape, sky, asked → got. */
  clampList: { sky: number; kind: string; color: RGB; from: number; to: number }[];
  shapes: string[];
  samples: number;
  frames: number;
  ms: number;
}

/**
 * THE CHROME AGAINST A WHOLE DAY OF SKY, WITH A HAND IN IT: every sky in
 * `skies`, every shape's paint from the mean of the sky under it, at rest and
 * over {@link chromeSwipe}, with the wake's dials at the worst the dock can
 * set them. `dials` are the chrome's colour dials to hold (the live ones by
 * default).
 */
export function sweepChrome(skies: SkyTarget[], wake: Partial<LiveConfig> = SWEEP_WORST_DIALS, dials = CHROME): ChromeSweep | null {
  const engine = skyEngine();
  const fs = faces().filter((f) => !f.disabled);
  if (!engine || fs.length === 0) return null;
  const frames = chromeSwipe();
  const worst = skies.map(() => ({ ratio: Infinity, rest: Infinity, kind: '', frame: -1, clamps: 0 }));
  const clampList: ChromeSweep['clampList'] = [];
  const memo = new Map<number, ReturnType<typeof chromePaint>>();
  const res = engine.sweepMeans(fs.map((f) => f.rect), skies, { frames, sampleEvery: 3, time: 0, phases: 8, config: wake }, (i, r, c, frame) => {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    let p = memo.get(key);
    if (!p) {
      p = chromePaint(c, dials);
      memo.set(key, p);
    }
    const w = worst[i];
    if (p.ratio < w.ratio) Object.assign(w, { ratio: p.ratio, kind: fs[r].kind, frame });
    if (frame < 0) w.rest = Math.min(w.rest, p.ratio);
    if (p.clamp) {
      w.clamps++;
      const last = clampList.at(-1);
      if (clampList.length < 2000 && !(last && last.sky === i && last.kind === fs[r].kind)) {
        clampList.push({ sky: i, kind: fs[r].kind, color: c, ...p.clamp });
      }
    }
  });
  if (!res) return null;
  clampList.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  return {
    ratio: worst.map((w) => w.ratio),
    restRatio: worst.map((w) => w.rest),
    kind: worst.map((w) => w.kind),
    frame: worst.map((w) => w.frame),
    clamps: worst.map((w) => w.clamps),
    clampList: clampList.slice(0, 20),
    shapes: fs.map((f) => f.kind),
    samples: res.samples,
    frames: frames.length,
    ms: res.ms,
  };
}

if (import.meta.env.DEV) {
  const w = window as unknown as {
    __chromeProbe?: typeof probeChrome;
    __chromeSweep?: typeof sweepChrome;
    __chromeDials?: { dials: typeof CHROME; set: typeof setChrome };
  };
  w.__chromeProbe = probeChrome;
  w.__chromeSweep = sweepChrome;
  w.__chromeDials = { dials: CHROME, set: setChrome };
}
