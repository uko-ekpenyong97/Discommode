import { look } from './portfolioMotion';
import { skyEngine } from '../sky/skyStage';
import type { SkyTarget, SweepSplat } from '../sky/skyEngine';
import type { LiveConfig } from '../config';

/**
 * DEV-ONLY contrast probe — ink on paper, and the letterhead on the ground.
 *
 * The PAPER is opaque, so the ratio under a run of text on it is a property of
 * two colours: read the surface, read the ink, composite, compare. No backdrop
 * to reconstruct, no stack of two translucent layers to put a sampled pixel
 * through.
 *
 * THE GROUND IS THE SKY, and that brings one thing back that the flat blue had
 * retired: the ground's colour has to be read out of the WebGL buffer, because
 * it is a picture and not a value. Three decisions make that a number rather
 * than a distribution over the whole year:
 *
 *   IT IS READ IN THE LETTERHEAD'S BAND and nowhere else. Every run of type on
 *   the ground is in the strip — the whole of {@link GROUND_SELECTORS} is
 *   `.pv-letterhead__*` — so the only sky that can fail anything is the 56px of
 *   it behind that band. Which is also why the wash that answers the bar is the
 *   band's own (`letterheadScrim`) and not the whole screen's (`groundScrim`).
 *
 *   IT IS MEASURED AGAINST THE WORST SKY THE SHADER CAN PAINT by default —
 *   {@link WORST_CASE_SKY} — whatever the weather is actually doing. A bar that
 *   passes on a foggy Tuesday and fails in July is not a bar. Pass `sky` to
 *   measure any other state; `scripts/sky-contrast.mjs` walks all twenty-four.
 *
 *   AND THE WORST SKY IS NOT A CLEAR NOON, which is what this was first written
 *   to assume and what the sweep then disproved. A clear noon comes out at
 *   7.73:1 and an OVERCAST one at 6.78 — because the lit top of the cloud deck
 *   CLIPS. `litCol` is near-white before daylight scales it, the shader clamps
 *   to 1.0, and so any daylit sky with cloud in it puts pure white pixels in
 *   the band. Measured, every combination of `cloud` ≥ 0.5 and `sun` ≥ 0.5 ties
 *   at exactly the same ratio: the ceiling, not a bright example of something.
 *
 *   IT IS THE BRIGHTEST PIXEL IN THE BAND, not the average of it. The strip
 *   runs the full width, its type is white, and a run of it only has to cross
 *   the sun's glow once to be the run that fails.
 *
 * That sample then goes under both washes, ground first and band second, which
 * is the order the compositor paints them in.
 *
 * WHAT IS LEFT IS THE GRAIN, and it is worth keeping. Film grain over a surface
 * moves its local luminance, so "the ratio" is a distribution rather than a
 * number, and a run of type is only as readable as its worst patch. So the
 * grain is MODELLED — every sample below is the same run of text over a
 * different grain value — and the figure reported is the WORST TENTH, not the
 * mean.
 *
 * The two surfaces composite the grain differently and the difference matters:
 *
 *   paper   `mix-blend-mode: multiply`, so the noise only ever DARKENS it
 *   ground  plain source-over, so the noise LIGHTENS a dark field
 *
 * Either way the grain is painted over the type as well as under it, so both
 * sides of the comparison go through it. Modelling it on the backdrop alone
 * would report a worse figure than the screen has, which is a different kind of
 * wrong from reporting a better one but still wrong.
 *
 * TARGET: 7:1 FOR EVERYTHING, with no size exception. The page is dark ink on
 * warm off-white and there is no reason to spend the margin; the letterhead is
 * mono type on the twice-scrimmed sky and is held to the same bar, which is the
 * one thing the paper target says nothing about.
 */

/** The bar. One number, for every run of type in the view. */
export const REQUIRED = 7;

/** Grain values sampled per run. The tail is what matters, so it needs enough
 *  of them that the worst tenth is a tenth rather than a rounding. */
const GRAIN_SAMPLES = 256;

/** Which surface a run of type is printed on. */
export type Surface = 'paper' | 'ground';

/**
 * The sky the ground is measured against: a full overcast with the sun at its
 * highest — the state whose cloud tops are blown to white. See the note at the
 * top: this is the CEILING of what the shader can put in the letterhead's band,
 * not merely a bright sky, and every daylit clouded state ties with it.
 */
export const WORST_CASE_SKY: SkyTarget = {
  sun: 1,
  dayPhase: 'rising',
  cloud: 1,
  fog: 0,
  rain: 0,
  storm: 0,
  wind: 0,
  // Daylit, so the moon is not drawn at all and this is not the state the
  // moon can fail. The state where it CAN is a clear night with a full moon
  // in the band — see `bandCenter` below, and `docs/sky.md`.
  moonFraction: 1,
  moonAltitude: -90,
  moonAzimuth: 0,
  moonLimb: 0,
};

/** Every run of type on the PAPER, and the name it is reported under. */
const PAPER_SELECTORS = [
  '.pv-letterhead-block__no',
  '.pv-letterhead-block__title',
  '.pv-letterhead-block__ref',
  '.pv-title',
  '.pv-caption',
  '.pv-heading',
  '.pv-body',
  '.pv-twoup__text',
  '.pv-stat__label',
  '.pv-linkpill',
  '.pv-figcaption',
] as const;

/** …and on the GROUND. The letterhead carries the view's whole navigation AND
 *  its way out now, so it is as much a readability question as the prose is —
 *  more so for the way out, which is the one thing on screen a reader has to be
 *  able to find without having been told it is there. */
const GROUND_SELECTORS = [
  '.pv-letterhead__project',
  '.pv-letterhead__no',
  '.pv-letterhead__section',
  '.pv-letterhead__ref',
  '.pv-letterhead__back',
] as const;

export interface ContrastSample {
  /** The element's class, e.g. `pv-body`. */
  kind: string;
  surface: Surface;
  /** A few words of the text, so a failure can be found on screen. */
  text: string;
  fontPx: number;
  /** Always {@link REQUIRED}. Carried per sample so a report reads on its own. */
  required: number;
  /** WCAG ratio against the worst tenth of the grain under it. */
  ratio: number;
  pass: boolean;
}

export interface ContrastReport {
  samples: ContrastSample[];
  /** The lowest ratio measured, or null when nothing was on screen to measure
   *  (the dock's REST playhead has the pane at zero opacity). */
  worst: number | null;
  failures: number;
}

/** Try a surface without committing to it — what the sweep that chose the
 *  shipped defaults is for. Anything not given comes from the live `look`.
 *  `groundColor` here overrides the SKY SAMPLE as well: pass it and the ground
 *  is measured as that flat colour under the washes, which is how you ask "what
 *  would this be if the sky were gone". */
export type SurfaceOverride = Partial<
  Pick<
    typeof look,
    'paperColor' | 'groundColor' | 'grainOpacity' | 'groundScrim' | 'letterheadScrim'
  >
> & {
  /** Measure the ground against this sky rather than {@link WORST_CASE_SKY}. */
  sky?: SkyTarget;
  /**
   * CENTRE the sampled band on this row instead of leaving it at the top of
   * the screen, where the letterhead actually sits. 0..1 of the viewport
   * height, from the top.
   *
   * THE STRIP DOES NOT MOVE; this moves the SAMPLE. There is one thing in
   * the sky that is small and bright — the moon — and the question "would
   * the letterhead read if it were over the moon" cannot be asked of a band
   * the moon is not in. Same band height, different row.
   *
   * The caller gets the row from `skyEngine().moonAt().y`, with the sky it
   * is asking about on screen: the moon moves now, so the row is only the
   * moon's row for the sky that put it there. See the moon section of `docs/sky.md`,
   * and section 8 of `scripts/sky-fluid-verify.mjs`, which is what passes it.
   */
  bandCenter?: number;
};

/* ── colour ──────────────────────────────────────────────────────────────── */

type RGBA = [number, number, number, number];

function parseColor(css: string): RGBA {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over: `top` at `alpha` on `under`. */
function over(top: [number, number, number], alpha: number, under: [number, number, number]) {
  return [
    alpha * top[0] + (1 - alpha) * under[0],
    alpha * top[1] + (1 - alpha) * under[1],
    alpha * top[2] + (1 - alpha) * under[2],
  ] as [number, number, number];
}

/**
 * One grain value, `n` in 0…1, applied the way the stylesheet applies it.
 *
 * On paper it multiplies, so the darkest grain is `1 - grainOpacity` of the
 * paper; on the ground it is an ordinary source-over of a noise pixel, so the
 * brightest grain lifts a dark field by `grainOpacity`.
 */
function grained(
  c: [number, number, number],
  n: number,
  surface: Surface,
  opacity: number,
): [number, number, number] {
  if (surface === 'paper') {
    const k = 1 - opacity + opacity * n;
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  const v = n * 255;
  return over([v, v, v], opacity, c);
}

/* ── the probe ───────────────────────────────────────────────────────────── */

function surfaceColor(surface: Surface, overrides: SurfaceOverride): [number, number, number] {
  const wanted = surface === 'paper' ? overrides.paperColor : overrides.groundColor;
  if (wanted) {
    const [r, g, b] = parseColor(cssColor(wanted));
    return surface === 'ground' ? scrimmed([r, g, b], overrides) : [r, g, b];
  }
  if (surface === 'ground') return groundColor(overrides);
  // Read it off the element rather than off the dial, so the probe cannot drift
  // from the stylesheet the way a second copy of a colour always eventually
  // does.
  const el = document.querySelector<HTMLElement>('.pv-page');
  const [r, g, b] = parseColor(el ? getComputedStyle(el).backgroundColor : 'rgb(0,0,0)');
  return [r, g, b];
}

/**
 * Both washes, in the order the compositor paints them: black at `groundScrim`
 * over the whole ground, then black at `letterheadScrim` over the band. The
 * type is inside the band, so it sits on the result of both.
 */
function scrimmed(c: [number, number, number], overrides: SurfaceOverride): [number, number, number] {
  const ground = over([0, 0, 0], overrides.groundScrim ?? look.groundScrim, c);
  return over([0, 0, 0], overrides.letterheadScrim ?? look.letterheadScrim, ground);
}

/**
 * What the letterhead is actually printed on: the brightest pixel of the band
 * the strip occupies, under both washes.
 *
 * Falls back to `.pv-ground`'s own background when there is no sky to read —
 * no WebGL2, or the canvas has not been claimed yet — which is exactly what is
 * on screen in that case.
 */
function groundColor(overrides: SurfaceOverride): [number, number, number] {
  const engine = skyEngine();
  const band = Math.min(1, look.letterheadHPx / Math.max(window.innerHeight, 1));
  const top =
    overrides.bandCenter === undefined
      ? 0
      : Math.max(0, Math.min(1 - band, overrides.bandCenter - band / 2));
  const sampled = engine?.sampleBand(top, top + band, overrides.sky ?? WORST_CASE_SKY) ?? null;
  if (sampled) return scrimmed(sampled, overrides);
  const el = document.querySelector<HTMLElement>('.pv-ground');
  const [r, g, b] = parseColor(el ? getComputedStyle(el).backgroundColor : 'rgb(0,0,0)');
  return scrimmed([r, g, b], overrides);
}

/** Resolve any CSS colour string to `rgb(...)` by asking the browser. */
function cssColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function measure(
  el: HTMLElement,
  surface: Surface,
  base: [number, number, number],
  opacity: number,
): ContrastSample | null {
  const style = getComputedStyle(el);
  const [ir, ig, ib, ia] = parseColor(style.color);
  const fontPx = Number.parseFloat(style.fontSize) || 16;
  // The paint order is surface, then the type, then the grain over both.
  const ink = over([ir, ig, ib], ia, base);

  const ratios: number[] = [];
  for (let i = 0; i < GRAIN_SAMPLES; i++) {
    const n = i / (GRAIN_SAMPLES - 1);
    ratios.push(
      contrast(
        luminance(grained(ink, n, surface, opacity)),
        luminance(grained(base, n, surface, opacity)),
      ),
    );
  }
  ratios.sort((a, b) => a - b);
  const ratio = ratios[Math.max(0, Math.floor(ratios.length * 0.1) - 1)] ?? ratios[0];
  return {
    kind: el.className.split(' ')[0],
    surface,
    text: (el.textContent ?? '').trim().slice(0, 40),
    fontPx: Math.round(fontPx),
    required: REQUIRED,
    ratio: Math.round(ratio * 100) / 100,
    pass: ratio >= REQUIRED,
  };
}

/**
 * Measure every run of text on the live page and on the ground's letterhead.
 * Returns null when there is no view to measure.
 */
export function probeContrast(overrides: SurfaceOverride = {}): ContrastReport | null {
  const ground = document.querySelector<HTMLElement>('.pv-ground');
  if (!ground) return null;
  const opacity = overrides.grainOpacity ?? look.grainOpacity;
  const samples: ContrastSample[] = [];

  // The LIVE page — the one the reader is actually looking at. A page that is
  // not showing is the same colours, but measuring all of them would report one
  // failure per section and hide which one it was.
  const page = Array.from(document.querySelectorAll<HTMLElement>('.pv-page')).find(
    (el) => el.style.visibility !== 'hidden',
  );
  if (page) {
    const paper = surfaceColor('paper', overrides);
    for (const el of page.querySelectorAll<HTMLElement>(PAPER_SELECTORS.join(','))) {
      const sample = measure(el, 'paper', paper, opacity);
      if (sample) samples.push(sample);
    }
  }

  const field = surfaceColor('ground', overrides);
  for (const el of ground.querySelectorAll<HTMLElement>(GROUND_SELECTORS.join(','))) {
    const sample = measure(el, 'ground', field, opacity);
    if (sample) samples.push(sample);
  }

  const report: ContrastReport = {
    samples,
    worst: samples.length ? Math.min(...samples.map((s) => s.ratio)) : null,
    failures: samples.filter((s) => !s.pass).length,
  };
  publish(report);
  return report;
}

/* ── the sweep ───────────────────────────────────────────────────────────── */

/**
 * The dials the sweep holds at the WORST the dock can set them — the maxima of
 * their DialKit ranges (`src/dev/DevPanels.tsx`) — so the figure is a floor for
 * any tuning session and not only for the shipped values. The wake's push on
 * the gradient and its stain, what the pointer puts in, how hard a star in the
 * wake flares, and the star itself.
 */
export const SWEEP_WORST_DIALS: Partial<LiveConfig> = {
  gradientPush: 1,
  gradientSwirl: 0.6,
  fluidStrength: 3,
  starGlow: 4,
  starSize: 4,
};

/** Fastest a pointer puts air in, screen heights / s (the engine's cap). */
const SWIPE_SPEED = 4;

/**
 * THE SWIPE. Two passes of a pointer at the fastest the wake takes, and the
 * wake left to decay after each:
 *
 *   A  straight along the letterhead band, left to right, through its middle
 *      — the one that stirs the band itself;
 *   B  a diagonal rising from low on the left to the top on the right,
 *      through the band — the one that DRAGS the lower sky up into it, which
 *      is what `gradientPush` does to a dusk.
 *
 * In CSS px and px / s, one entry per 60 Hz frame.
 */
export function letterheadSwipe(): SweepSplat[][] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const band = Math.min(1, look.letterheadHPx / Math.max(vh, 1));
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
    ...path(-0.05 * vw, (band / 2) * vh, 1.05 * vw, (band / 2) * vh),
    ...rest(15),
    ...path(0.1 * vw, 0.8 * vh, 0.95 * vw, 0),
    ...rest(30),
  ];
}

export interface SweepContrast {
  /** Per state: the worst run of letterhead type over the wake, and at rest. */
  ratio: number[];
  kind: string[];
  restRatio: number[];
  /** Per state: the wake frame the worst was at (−1 = at rest). */
  frame: number[];
  samples: number;
  frames: number;
  /** GPU time for the sweep itself, ms. */
  ms: number;
}

/**
 * THE LETTERHEAD AGAINST A WHOLE DAY OF SKY, WITH A HAND IN IT. Every state in
 * `skies`, the band's brightest pixel at its worst over {@link letterheadSwipe}
 * with {@link SWEEP_WORST_DIALS} held (or `dials`, e.g. `{}` for the shipped
 * values), put under both washes and measured
 * against every run of letterhead type on screen exactly as
 * {@link probeContrast} does — same grain model, same worst tenth.
 *
 * Sky only: nothing is captured and the page on screen does not change. The
 * band is where the letterhead actually is.
 */
export function sweepContrast(
  skies: SkyTarget[],
  overrides: SurfaceOverride = {},
  dials: Partial<LiveConfig> = SWEEP_WORST_DIALS,
): SweepContrast | null {
  const engine = skyEngine();
  const ground = document.querySelector<HTMLElement>('.pv-ground');
  if (!engine || !ground) return null;
  const band = Math.min(1, look.letterheadHPx / Math.max(window.innerHeight, 1));
  const frames = letterheadSwipe();
  const res = engine.sweepBand(0, band, skies, {
    frames,
    sampleEvery: 3,
    time: 0,
    phases: 8,
    config: dials,
  });
  if (!res) return null;
  const opacity = overrides.grainOpacity ?? look.grainOpacity;
  const els = Array.from(ground.querySelectorAll<HTMLElement>(GROUND_SELECTORS.join(',')));
  // Many skies share a brightest pixel (every clouded noon is white), so each
  // colour is measured once.
  const memo = new Map<string, { ratio: number; kind: string }>();
  const worstOn = (c: [number, number, number]) => {
    const key = c.join(',');
    let hit = memo.get(key);
    if (!hit) {
      const field = scrimmed(c, overrides);
      hit = { ratio: Infinity, kind: '' };
      for (const el of els) {
        const sample = measure(el, 'ground', field, opacity);
        if (sample && sample.ratio < hit.ratio) hit = { ratio: sample.ratio, kind: sample.kind };
      }
      memo.set(key, hit);
    }
    return hit;
  };
  const worst = res.colors.map(worstOn);
  return {
    ratio: worst.map((w) => w.ratio),
    kind: worst.map((w) => w.kind),
    restRatio: res.rest.map((c) => worstOn(c).ratio),
    frame: res.frame,
    samples: res.samples,
    frames: frames.length,
    ms: res.ms,
  };
}

/* ── publishing to the dock ──────────────────────────────────────────────── */

type Listener = (report: ContrastReport | null) => void;
const listeners = new Set<Listener>();
let last: ContrastReport | null = null;

function publish(report: ContrastReport | null): void {
  last = report;
  listeners.forEach((fn) => fn(report));
}

export function lastContrastReport(): ContrastReport | null {
  return last;
}

export function subscribeContrast(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Probe and print. The worst per kind of text, plus every failure. */
export function logContrastProbe(overrides: SurfaceOverride = {}): ContrastReport | null {
  const report = probeContrast(overrides);
  if (!report) {
    console.log('[pv:contrast] no view to measure');
    return null;
  }
  if (report.samples.length === 0) {
    console.log('[pv:contrast] no text on screen to measure');
    return report;
  }
  const byKind = new Map<string, ContrastSample>();
  for (const s of report.samples) {
    const worst = byKind.get(s.kind);
    if (!worst || s.ratio < worst.ratio) byKind.set(s.kind, s);
  }
  console.log(
    `[pv:contrast] worst ${report.worst}:1 across ${report.samples.length} runs` +
      ` (ground at ${overrides.sky ? 'a forced sky' : 'a blown overcast noon'}, ground scrim ` +
      `${overrides.groundScrim ?? look.groundScrim}, letterhead scrim ` +
      `${overrides.letterheadScrim ?? look.letterheadScrim})` +
      `${report.failures ? `  — ${report.failures} BELOW ${REQUIRED}:1` : '  — all pass'}`,
  );
  console.table(
    [...byKind.values()]
      .sort((a, b) => a.ratio - b.ratio)
      .map((s) => ({
        kind: s.kind,
        on: s.surface,
        px: s.fontPx,
        ratio: s.ratio,
        needs: s.required,
        pass: s.pass ? 'yes' : 'NO',
      })),
  );
  return report;
}

// A handle for tooling: sweeping a paper or a ground against the real type is
// how the shipped defaults were chosen, and that is a thing you do from the
// console — and from `pv-verify`. Dead code in production (and verified absent
// from the bundle).
if (import.meta.env.DEV) {
  const w = window as unknown as { __pvProbe?: typeof probeContrast; __pvSweep?: typeof sweepContrast };
  w.__pvProbe = probeContrast;
  w.__pvSweep = sweepContrast;
}
