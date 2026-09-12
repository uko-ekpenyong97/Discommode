import { look } from './portfolioMotion';

/**
 * DEV-ONLY contrast probe for the frosted pages.
 *
 * The page glass is the only thing between the project's text and whatever the
 * grid happens to be showing, and the grid is not a fixed backdrop — it is
 * covers, a live shader sky, and whatever card you opened from. So "is this
 * readable" cannot be answered by looking at it once. This answers it
 * numerically, against the backdrop that is actually behind the sheet right
 * now.
 *
 * HOW. Reconstruct the backdrop at 1/8 scale — the sky as a base, every visible
 * image drawn at its on-screen rect — then put it through the same stack the
 * browser does: the scrim's blur and tint, then the page's. Sample the result
 * under each run of text, composite the text colour (which is often translucent)
 * over each sampled pixel, and take the WORST 10% of the resulting WCAG ratios.
 * The worst 10%, not the mean: a title is unreadable if part of it lands on a
 * bright patch, however dark the average is.
 *
 * It is deliberately PESSIMISTIC. Two things that help real readability are left
 * out — the `text-shadow` on every glyph and the soft dark pool behind each text
 * block — so a pass here is a pass with margin. And if the sky's pixels cannot
 * be read back (a WebGL context without `preserveDrawingBuffer` is not reliably
 * drawable, and making it one would cost frames in production for a dev tool),
 * it falls back to a bright overcast grey rather than to black.
 */

/** Scale the reconstruction runs at. 1/8 is plenty for a blurred backdrop. */
const SCALE = 1 / 8;

/** The fallback sky: bright overcast, so an unreadable buffer errs pessimistic. */
const SKY_FALLBACK = '#b9c5d0';

/** Text this size or larger only needs the 4.5:1 bar; below it, 7:1. */
const LARGE_TEXT_PX = 18;

/** Every run of type in a page, and the name it is reported under. */
const TEXT_SELECTORS = [
  '.pv-title',
  '.pv-caption',
  '.pv-heading',
  '.pv-body',
  '.pv-twoup__text',
  '.pv-stat__label',
  '.pv-linkpill',
  '.pv-figcaption',
] as const;

export interface ContrastSample {
  /** The element's class, e.g. `pv-body`. */
  kind: string;
  /** The hue of the section it was measured on — each one tints its own glass,
   *  so a ratio is only true for the hue it was taken against. */
  hue: number;
  /** A few words of the text, so a failure can be found on screen. */
  text: string;
  fontPx: number;
  /** 4.5, or 7 for body text under 18px. */
  required: number;
  /** WCAG ratio against the worst 10% of the backdrop under it. */
  ratio: number;
  pass: boolean;
}

/** Try a glass setting without committing to it — what the sweep that chose the
 *  shipped defaults is for. Anything not given comes from the live `look`. */
export type GlassOverride = Partial<
  Pick<
    typeof look,
    'pageSurface' | 'pageAlpha' | 'pageBlurPx' | 'pageSaturate' | 'scrimAlpha' | 'scrimBlurPx'
  >
>;

export interface ContrastReport {
  samples: ContrastSample[];
  /** The lowest ratio measured, or null when nothing was on screen to measure
   *  (the dock's REST playhead parks the sheet off the right edge). */
  worst: number | null;
  failures: number;
  /** True when the sky had to be guessed rather than read. */
  skyEstimated: boolean;
}

/* ── colour ──────────────────────────────────────────────────────────────── */

type RGBA = [number, number, number, number];

function parseColor(css: string): RGBA {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
  return [n[0] ?? 255, n[1] ?? 255, n[2] ?? 255, n[3] ?? 1];
}

/** WCAG relative luminance. */
function luminance(r: number, g: number, b: number): number {
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

/* ── the backdrop ────────────────────────────────────────────────────────── */

/** Whatever the sky is showing, or a pessimistic guess. */
function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const sky = document.querySelector<HTMLCanvasElement>('canvas.sky-layer');
  if (sky && sky.width > 0) {
    try {
      ctx.drawImage(sky, 0, 0, w, h);
      // A WebGL buffer that has already been presented reads back as fully
      // transparent; that is the case we cannot use.
      const { data } = ctx.getImageData(0, 0, Math.min(4, w), Math.min(4, h));
      let alpha = 0;
      for (let i = 3; i < data.length; i += 4) alpha += data[i];
      if (alpha > 0) return false;
    } catch {
      // tainted or unreadable — fall through
    }
  }
  ctx.fillStyle = SKY_FALLBACK;
  ctx.fillRect(0, 0, w, h);
  return true;
}

/** Every image the app is currently showing, at its on-screen rect. */
function drawAppImages(ctx: CanvasRenderingContext2D): void {
  const app = document.querySelector('.app');
  if (!app) return;
  for (const img of app.querySelectorAll<HTMLImageElement>('img')) {
    if (!img.complete || img.naturalWidth === 0) continue;
    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.right < 0 || r.left > window.innerWidth) continue;
    // The card's own fade and the detail panel's per-panel opacity both matter:
    // a card at 0.4 contributes 0.4 of its brightness to what the blur sees.
    const own = Number(getComputedStyle(img).opacity) || 1;
    const group = img.closest<HTMLElement>('.grid-card__fade, .detail__panel');
    const groupOpacity = group ? Number(getComputedStyle(group).opacity) || 1 : 1;
    ctx.globalAlpha = own * groupOpacity;
    try {
      ctx.drawImage(img, r.left * SCALE, r.top * SCALE, r.width * SCALE, r.height * SCALE);
    } catch {
      // cross-origin — skip rather than taint the canvas
    }
  }
  ctx.globalAlpha = 1;
}

/** Blur + tint, the way one layer of glass does it. The tint is a full colour,
 *  not just an alpha: a section's glass is tinted by its own hue. */
function applyGlass(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blurPx: number,
  tint: string,
  saturate = 1,
): void {
  const filters = [`blur(${(blurPx * SCALE).toFixed(2)}px)`];
  if (saturate !== 1) filters.push(`saturate(${saturate})`);
  ctx.filter = filters.join(' ');
  // `copy`, not the default `source-over`: the filtered draw has to REPLACE
  // what is there, or every pass would composite a blur on top of the sharp
  // original and nothing would actually soften.
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The section's own glass colour, as the browser resolved it — optionally with
 * its alpha replaced, which is what a `pageAlpha` sweep is.
 */
function pageTint(section: HTMLElement, alphaOverride?: number): string {
  // The section itself paints nothing: its glass child is the surface, and the
  // tint that matters is the one the text is actually behind.
  const glass = section.querySelector<HTMLElement>('.pv-section__glass') ?? section;
  const [r, g, b, a] = parseColor(getComputedStyle(glass).backgroundColor);
  return `rgba(${r}, ${g}, ${b}, ${alphaOverride ?? a})`;
}

/* ── the probe ───────────────────────────────────────────────────────────── */

/**
 * Measure every run of text in the active page against the backdrop behind it.
 * Returns null when there is nothing to measure, or when the page is solid (in
 * which case the backdrop is a flat black and the answer is never interesting).
 */
export function probeContrast(over: GlassOverride = {}): ContrastReport | null {
  const glass = { ...look, ...over };
  if (glass.pageSurface !== 'frosted') return null;
  // The section DRAWN ON TOP — the one whose glass the text is actually behind.
  const page = document.querySelector<HTMLElement>('.pv-section[data-top]');
  if (!page) return null;
  const hue = Number(page.dataset.hue ?? 0);

  const w = Math.max(1, Math.round(window.innerWidth * SCALE));
  const h = Math.max(1, Math.round(window.innerHeight * SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const skyEstimated = drawSky(ctx, w, h);
  drawAppImages(ctx);
  // The scrim, then the section's own glass on top of it — the same order, and
  // the same two tints, the compositor applies. The section's tint is READ off
  // the element rather than recomputed here, so the hue formula lives in exactly
  // one place (the stylesheet) and the probe cannot drift from it.
  applyGlass(ctx, w, h, glass.scrimBlurPx, `rgba(0, 0, 0, ${glass.scrimAlpha})`);
  applyGlass(
    ctx,
    w,
    h,
    glass.pageBlurPx,
    pageTint(page, over.pageAlpha),
    glass.pageSaturate,
  );

  const pageRect = page.getBoundingClientRect();
  const field = ctx.getImageData(0, 0, w, h).data;
  const samples: ContrastSample[] = [];

  for (const el of page.querySelectorAll<HTMLElement>(TEXT_SELECTORS.join(','))) {
    const r = el.getBoundingClientRect();
    // Clipped to the page, since that is all the reader can see of it.
    const x0 = Math.max(0, Math.floor(Math.max(r.left, pageRect.left) * SCALE));
    const x1 = Math.min(w, Math.ceil(Math.min(r.right, pageRect.right) * SCALE));
    const y0 = Math.max(0, Math.floor(Math.max(r.top, pageRect.top) * SCALE));
    const y1 = Math.min(h, Math.ceil(Math.min(r.bottom, pageRect.bottom) * SCALE));
    if (x1 <= x0 || y1 <= y0) continue;

    const style = getComputedStyle(el);
    const [tr, tg, tb, ta] = parseColor(style.color);
    const fontPx = Number.parseFloat(style.fontSize) || 16;

    const ratios: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        const br = field[i];
        const bg = field[i + 1];
        const bb = field[i + 2];
        // Translucent text is blended with what is behind it, so that blend is
        // what the reader's eye compares to the backdrop.
        const ink = luminance(
          ta * tr + (1 - ta) * br,
          ta * tg + (1 - ta) * bg,
          ta * tb + (1 - ta) * bb,
        );
        ratios.push(contrast(ink, luminance(br, bg, bb)));
      }
    }
    if (ratios.length === 0) continue;
    ratios.sort((a, b) => a - b);
    // The worst tenth: a title is unreadable if part of it lands on a bright
    // patch, however dark the average behind it is.
    const ratio = ratios[Math.max(0, Math.floor(ratios.length * 0.1) - 1)] ?? ratios[0];
    const required = fontPx < LARGE_TEXT_PX ? 7 : 4.5;
    samples.push({
      kind: el.className.split(' ')[0],
      hue,
      text: (el.textContent ?? '').trim().slice(0, 40),
      fontPx: Math.round(fontPx),
      required,
      ratio: Math.round(ratio * 100) / 100,
      pass: ratio >= required,
    });
  }

  const report: ContrastReport = {
    samples,
    worst: samples.length ? Math.min(...samples.map((s) => s.ratio)) : null,
    failures: samples.filter((s) => !s.pass).length,
    skyEstimated,
  };
  publish(report);
  return report;
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
export function logContrastProbe(over: GlassOverride = {}): ContrastReport | null {
  const report = probeContrast(over);
  if (!report) {
    console.log('[pv:contrast] nothing to measure (solid pages, or no active page)');
    return null;
  }
  const byKind = new Map<string, ContrastSample>();
  for (const s of report.samples) {
    const worst = byKind.get(s.kind);
    if (!worst || s.ratio < worst.ratio) byKind.set(s.kind, s);
  }
  const rows = [...byKind.values()].sort((a, b) => a.ratio - b.ratio);
  if (report.samples.length === 0) {
    console.log('[pv:contrast] no text on screen to measure');
    return report;
  }
  console.log(
    `[pv:contrast] worst ${report.worst}:1 across ${report.samples.length} runs` +
      `${report.failures ? `  — ${report.failures} BELOW TARGET` : '  — all pass'}` +
      `${report.skyEstimated ? '  (sky estimated)' : ''}`,
  );
  console.table(
    rows.map((s) => ({
      kind: s.kind,
      hue: s.hue,
      px: s.fontPx,
      ratio: s.ratio,
      needs: s.required,
      pass: s.pass ? 'yes' : 'NO',
    })),
  );
  return report;
}

// A handle for tooling: sweeping `pageAlpha` against a real backdrop is how the
// shipped default was chosen, and that is a thing you do from the console.
// Dead code in production (and verified absent from the bundle).
if (import.meta.env.DEV) {
  (window as unknown as { __pvProbe?: typeof probeContrast }).__pvProbe = probeContrast;
}
