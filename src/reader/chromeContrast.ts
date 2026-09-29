import { skyEngine } from '../sky/skyStage';
import type { SkyTarget, SweepSplat } from '../sky/skyEngine';
import type { LiveConfig } from '../config';
import { SWEEP_WORST_DIALS, WORST_CASE_SKY } from '../portfolio/contrastProbe';
import { CHROME_BAND_PX, CHROME_REQUIRED, READER_GROUND } from './ground';
import { chromeRatio, groundUnderChrome } from './chromeFloor';
import type { RGB, RGBA } from './chromeFloor';

/**
 * DEV-ONLY: the reader's chrome — the back pill and the page bar — against the
 * sky. The project view's letterhead probe (`contrastProbe.ts`) asked this of
 * one band of type; this asks it of two (the pill in the top band, the bar in
 * the bottom), against the same skies and the same sweep, and holds it to
 * 4.5:1 rather than 7 (it is chrome, WCAG AA, not a page of reading).
 *
 * The sky is read out of the WebGL buffer as the BRIGHTEST PIXEL in the
 * chrome's band — full width, which is a superset of what is behind the chips —
 * and put under `readerScrim` and `readerChromeScrim`. The chips' fills and the
 * type's colour are read off the elements (`getComputedStyle`), so this cannot
 * drift from the stylesheet; `chromeFloor.ts` is the same arithmetic.
 *
 * Disabled buttons (Cover and Prev at the cover, Next and Back cover at the
 * back) are drawn at 0.35 opacity and are not measured: WCAG exempts the text
 * of an inactive control, and the page can always be read with them.
 */

const RUNS = ['.reader__back', '.reader__bar .detail__btn:not(:disabled)', '.reader__caption > span'] as const;

export interface ChromeSample {
  kind: string;
  band: 'top' | 'bottom';
  text: string;
  ratio: number;
  pass: boolean;
}

/** What a run is reported as: its own last class, or its chip's (the caption's
 *  "SPREAD n / N" is a bare span). */
const kindOf = (el: HTMLElement): string =>
  el.classList.item(el.classList.length - 1) ?? el.parentElement?.classList.item(0) ?? el.tagName.toLowerCase();

function parse(css: string): RGBA {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}

/** Every run of chrome type on screen: its band, the fills between the ground
 *  and it (outermost first), and its colour. */
function chromeRuns(): { el: HTMLElement; band: 'top' | 'bottom'; fills: RGBA[]; text: RGBA }[] {
  const root = document.querySelector<HTMLElement>('.reader');
  if (!root) return [];
  const out: ReturnType<typeof chromeRuns> = [];
  for (const el of root.querySelectorAll<HTMLElement>(RUNS.join(','))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const fills: RGBA[] = [];
    for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg[3] > 0) fills.unshift(bg);
    }
    out.push({
      el,
      band: r.top + r.height / 2 < window.innerHeight / 2 ? 'top' : 'bottom',
      fills,
      text: parse(getComputedStyle(el).color),
    });
  }
  return out;
}

/** The chrome's two bands as fractions of the viewport height, from the top. */
function bands(): Record<'top' | 'bottom', [number, number]> {
  const h = Math.min(0.5, CHROME_BAND_PX / Math.max(1, window.innerHeight));
  return { top: [0, h], bottom: [1 - h, 1] };
}

interface Washes {
  readerScrim?: number;
  readerChromeScrim?: number;
}

function ground(sky: RGB, w: Washes): RGB {
  return groundUnderChrome(
    sky,
    w.readerScrim ?? READER_GROUND.readerScrim,
    w.readerChromeScrim ?? READER_GROUND.readerChromeScrim,
  );
}

/**
 * Measure every run of chrome type against one sky — {@link WORST_CASE_SKY}
 * (a blown overcast noon) unless told otherwise; `white` asks it of a pure
 * white band, which is the floor no sky goes under. Null with no reader open.
 */
export function probeReaderChrome(
  opts: Washes & { sky?: SkyTarget; white?: boolean } = {},
): { samples: ChromeSample[]; worst: number | null; failures: number } | null {
  const runs = chromeRuns();
  if (runs.length === 0) return null;
  const engine = skyEngine();
  const b = bands();
  const sampled: Record<'top' | 'bottom', RGB> = { top: [255, 255, 255], bottom: [255, 255, 255] };
  if (!opts.white && engine) {
    for (const k of ['top', 'bottom'] as const) {
      sampled[k] = engine.sampleBand(b[k][0], b[k][1], opts.sky ?? WORST_CASE_SKY) ?? sampled[k];
    }
  }
  const samples = runs.map(({ el, band, fills, text }) => {
    const ratio = chromeRatio(ground(sampled[band], opts), fills, text);
    return {
      kind: kindOf(el),
      band,
      text: (el.textContent ?? '').trim().slice(0, 30),
      ratio: Math.round(ratio * 100) / 100,
      pass: ratio >= CHROME_REQUIRED,
    };
  });
  return {
    samples,
    worst: samples.length ? Math.min(...samples.map((s) => s.ratio)) : null,
    failures: samples.filter((s) => !s.pass).length,
  };
}

/** Fastest a pointer puts air in, screen heights / s (the engine's cap). */
const SWIPE_SPEED = 4;

/**
 * THE SWIPE, for the chrome: a pass along the top band through the pill, a pass
 * along the bottom band through the bar, and a diagonal from low left to top
 * right that drags the sky through both — each at the fastest the wake takes,
 * each left to decay. One entry per 60Hz frame, CSS px and px / s.
 */
export function readerChromeSwipe(): SweepSplat[][] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const band = CHROME_BAND_PX;
  const step = (SWIPE_SPEED * vh) / 60;
  const path = (x0: number, y0: number, x1: number, y1: number): SweepSplat[][] => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(len / step);
    const dx = ((x1 - x0) / len) * SWIPE_SPEED * vh;
    const dy = ((y1 - y0) / len) * SWIPE_SPEED * vh;
    return Array.from({ length: n + 1 }, (_, i) => [
      { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, dx, dy },
    ]);
  };
  const rest = (n: number): SweepSplat[][] => Array.from({ length: n }, () => []);
  return [
    ...path(-0.05 * vw, band / 2, 1.05 * vw, band / 2),
    ...rest(15),
    ...path(-0.05 * vw, vh - band / 2, 1.05 * vw, vh - band / 2),
    ...rest(15),
    ...path(0.05 * vw, vh, 0.95 * vw, 0),
    ...rest(30),
  ];
}

export interface ChromeSweep {
  /** Per sky: the worst run of chrome type over the wake, and at rest. */
  ratio: number[];
  kind: string[];
  restRatio: number[];
  /** Per sky: the wake frame the worst was at (−1 = at rest). */
  frame: number[];
  samples: number;
  frames: number;
  ms: number;
}

/**
 * THE CHROME AGAINST A WHOLE DAY OF SKY, WITH A HAND IN IT — the letterhead's
 * sweep (`sweepContrast`), asked of the reader's two bands. Every sky in
 * `skies`, each band's brightest pixel at its worst over
 * {@link readerChromeSwipe} with the wake's dials at the worst the dock can set
 * them, measured against every run of chrome type in that band.
 */
export function sweepReaderChrome(
  skies: SkyTarget[],
  washes: Washes = {},
  dials: Partial<LiveConfig> = SWEEP_WORST_DIALS,
): ChromeSweep | null {
  const engine = skyEngine();
  const runs = chromeRuns();
  if (!engine || runs.length === 0) return null;
  const frames = readerChromeSwipe();
  const b = bands();
  const worst = skies.map(() => ({ ratio: Infinity, kind: '', rest: Infinity, frame: -1 }));
  let samples = 0;
  let ms = 0;
  for (const band of ['top', 'bottom'] as const) {
    const mine = runs.filter((r) => r.band === band);
    if (mine.length === 0) continue;
    const res = engine.sweepBand(b[band][0], b[band][1], skies, { frames, sampleEvery: 3, time: 0, phases: 8, config: dials });
    if (!res) return null;
    samples = res.samples;
    ms += res.ms;
    const memo = new Map<string, { ratio: number; kind: string }>();
    const on = (c: RGB) => {
      const key = c.join(',');
      let hit = memo.get(key);
      if (!hit) {
        hit = { ratio: Infinity, kind: '' };
        const g = ground(c, washes);
        for (const r of mine) {
          const ratio = chromeRatio(g, r.fills, r.text);
          if (ratio < hit.ratio) hit = { ratio, kind: kindOf(r.el) };
        }
        memo.set(key, hit);
      }
      return hit;
    };
    res.colors.forEach((c, i) => {
      const w = on(c);
      if (w.ratio < worst[i].ratio) Object.assign(worst[i], { ratio: w.ratio, kind: `${w.kind} (${band})`, frame: res.frame[i] });
      worst[i].rest = Math.min(worst[i].rest, on(res.rest[i]).ratio);
    });
  }
  return {
    ratio: worst.map((w) => w.ratio),
    kind: worst.map((w) => w.kind),
    restRatio: worst.map((w) => w.rest),
    frame: worst.map((w) => w.frame),
    samples,
    frames: frames.length,
    ms,
  };
}

if (import.meta.env.DEV) {
  const w = window as unknown as {
    __readerChromeProbe?: typeof probeReaderChrome;
    __readerChromeSweep?: typeof sweepReaderChrome;
  };
  w.__readerChromeProbe = probeReaderChrome;
  w.__readerChromeSweep = sweepReaderChrome;
}
