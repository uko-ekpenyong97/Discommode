import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { skyEngine, skyTarget } from '../sky/skyStage';
import { skyFallbackColorAt, skyGradientAt } from '../sky/palette';
import type { ViewRect } from '../sky/skyEngine';
import { CHROME, subscribeChrome } from './chromeDials';
import { chromePaint, css, mixPaint } from './chromeColor';
import type { ChromePaint, RGB } from './chromeColor';

/**
 * THE CHROME TAKES ITS COLOUR FROM THE SKY. Every `[data-chrome]` shape under
 * `root` is painted from the sky under it: about twice a second
 * (`chromeSampleMs`) the sky engine reads back the MEAN colour of the live
 * canvas inside each shape's box — asynchronously, through a pixel buffer and
 * a fence, never a stall and never per frame (`SkyEngine.readMeans`) — and
 * `chromePaint` turns it into paper and ink. When a shape's paint changes it
 * cross-fades over `chromeColorEase` (a snap under reduced motion).
 *
 * Before the first read-back lands, and wherever there is no WebGL2, the colour
 * comes from the sky's palette and cloud cover instead — the same colours the
 * CSS fallback paints — so the chrome is never the stylesheet's grey.
 *
 * The paints are written as `--paper`, `--paper-press` and `--ink` on each
 * shape, and each row's first shape's on the ROW too (the shape's parent), so a
 * shape that mounts between two samples (the detail view's action pill
 * changing kind) inherits a paint from its row until its own arrives. Never on
 * `root`: these are inherited properties, and a write on `.reader` or
 * `.detail` restyles the whole book or strip under it — on every frame of a
 * cross-fade, which the flip's wake keeps starting (measured: +1.1ms of main
 * thread at p95 per flip frame, docs/reader.md).
 */

interface Shape {
  shown: ChromePaint;
  from: ChromePaint;
  to: ChromePaint;
  /** The sky it was painted from. */
  sky: RGB;
  t0: number;
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The sky under a shape: under its face (the base box), not its hit area. */
const faceRect = (el: HTMLElement): ViewRect => {
  const r = (el.querySelector<HTMLElement>('.paper__shape') ?? el).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

function fallbackSky(r: ViewRect): RGB {
  const t = skyTarget();
  const g = skyGradientAt(t.sun, t.dayPhase === 'setting' ? 1 : 0);
  return skyFallbackColorAt(g, t.cloud, (r.y + r.h / 2) / Math.max(1, window.innerHeight));
}

/** What each element was last given, so a frame of the cross-fade that
 *  rounds to the same colours writes nothing (and invalidates no style). */
const written = new WeakMap<HTMLElement, string>();
function write(el: HTMLElement, p: ChromePaint): void {
  const fill = css(p.fill);
  const press = css(p.press);
  const ink = css(p.ink);
  const key = `${fill}|${press}|${ink}`;
  if (written.get(el) === key) return;
  written.set(el, key);
  el.style.setProperty('--paper', fill);
  el.style.setProperty('--paper-press', press);
  el.style.setProperty('--ink', ink);
}

/** A new sky is only a new paint past this many levels on any channel of the
 *  paper or the ink: the wake and the twinkle move the mean by a level or two
 *  all the time, and a cross-fade for each would be restyling the chrome
 *  continuously for nothing anyone can see. */
const REPAINT_LEVELS = 3;
const far = (a: RGB, b: RGB) => a.some((c, j) => Math.abs(c - b[j]) >= REPAINT_LEVELS);

/** Everything the probe needs about what is on screen now (dev). */
export interface ChromeShapeState {
  el: HTMLElement;
  kind: string;
  sky: RGB;
  paint: ChromePaint;
}
const live = new Set<() => ChromeShapeState[]>();
/** DEV: every painted shape of every mounted chrome. */
export function chromeShapes(): ChromeShapeState[] {
  return [...live].flatMap((f) => f());
}

export function useSkyChrome(root: RefObject<HTMLElement | null>, enabled = true): void {
  // The palette's paint, before the first paint of the chrome at all.
  useLayoutEffect(() => {
    const host = root.current;
    if (!enabled || !host) return;
    const rows = new Set<HTMLElement>();
    for (const el of host.querySelectorAll<HTMLElement>('[data-chrome]')) {
      const p = chromePaint(fallbackSky(faceRect(el)));
      write(el, p);
      const row = el.parentElement;
      if (row && row !== host && !rows.has(row)) {
        rows.add(row);
        write(row, p);
      }
    }
  }, [root, enabled]);

  useEffect(() => {
    const host = root.current;
    if (!enabled || !host) return;
    const state = new Map<HTMLElement, Shape>();
    let timer = 0;
    let raf = 0;
    let alive = true;

    const frame = () => {
      raf = 0;
      const now = performance.now();
      const ease = reducedMotion() ? 0 : CHROME.chromeColorEase;
      let moving = false;
      const rows = new Set<HTMLElement>();
      for (const [el, s] of state) {
        const t = ease > 0 ? Math.min(1, (now - s.t0) / ease) : 1;
        // ease-in-out on the cross-fade
        const k = t * t * (3 - 2 * t);
        s.shown = mixPaint(s.from, s.to, k);
        write(el, s.shown);
        const row = el.parentElement;
        if (row && row !== host && !rows.has(row)) {
          rows.add(row);
          write(row, s.shown);
        }
        if (t < 1) moving = true;
      }
      if (moving) raf = requestAnimationFrame(frame);
    };

    const paint = (els: HTMLElement[], skies: RGB[], snap: boolean) => {
      const now = performance.now();
      els.forEach((el, i) => {
        const to = chromePaint(skies[i]);
        const s = state.get(el);
        if (!s || snap) {
          state.set(el, { shown: to, from: to, to, sky: skies[i], t0: now - 1e6 });
          return;
        }
        s.sky = skies[i];
        if (!far(to.fill, s.to.fill) && !far(to.ink, s.to.ink)) return;
        s.from = s.shown;
        s.to = to;
        s.t0 = now;
      });
      for (const el of state.keys()) if (!els.includes(el)) state.delete(el);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // WHERE the shapes are is measured only when it can have changed — the
    // set of shapes, the window, a dial — not on every sample: a
    // getBoundingClientRect forces a layout, and mid-riffle the flip engine
    // has dirtied it every frame.
    let els: HTMLElement[] = [];
    let rects: ViewRect[] = [];
    let stale = true;
    const measure = () => {
      const now = [...host.querySelectorAll<HTMLElement>('[data-chrome]')];
      if (!stale && now.length === els.length && now.every((el, i) => el === els[i])) return;
      stale = false;
      const all = now.map((el) => ({ el, r: faceRect(el) }));
      const shown = all.filter((x) => x.r.w > 0 && x.r.h > 0);
      els = shown.map((x) => x.el);
      rects = shown.map((x) => x.r);
    };
    const onResize = () => (stale = true);
    window.addEventListener('resize', onResize);

    const sample = async (snap = false) => {
      window.clearTimeout(timer);
      measure();
      let skies: RGB[] | null = null;
      const engine = skyEngine();
      if (engine && rects.length) skies = await engine.readMeans(rects);
      if (!alive) return;
      if (!skies && !engine) skies = rects.map(fallbackSky);
      if (skies) paint(els, skies, snap || state.size === 0);
      timer = window.setTimeout(() => void sample(), CHROME.chromeSampleMs);
    };

    // Seeded with the palette's paint (what the layout effect put up), so the
    // first read-back cross-fades from it rather than jumping.
    const seed = [...host.querySelectorAll<HTMLElement>('[data-chrome]')];
    paint(seed, seed.map((el) => fallbackSky(faceRect(el))), true);
    void sample();
    // A dial moved: repaint at once, from the skies already read.
    const unsub = subscribeChrome(() => {
      stale = true;
      const shapes = [...state.keys()];
      paint(shapes, shapes.map((el) => state.get(el)!.sky), true);
    });
    const report = () =>
      [...state].map(([el, s]) => ({ el, kind: el.dataset.chrome ?? '', sky: s.sky, paint: s.shown }));
    live.add(report);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener('resize', onResize);
      live.delete(report);
    };
  }, [root, enabled]);
}
