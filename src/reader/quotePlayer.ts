/**
 * The chapter-break quotes on the open spread (docs/reader.md, "Chapter-break
 * quotes"). Plain TS, no React, like the flip engine and the page animations'
 * player, and on the same lifecycle as the latter (pageAnimPlayer.ts).
 *
 * A quote page's static slot carries, over its baked `<img>`, a wrapper
 * FlipBook renders: the page's PLATE (the quote removed), ONE canvas the
 * letters and the ES ⇄ EN hint are drawn on, and the button over the quote.
 * Hidden whenever a turn layer is up — `setTurning(true)` comes synchronously
 * from the engine's `onTurnActive` — and faded in over SETTLE_FADE_MS when the
 * book settles. A morph in flight when a turn starts jumps to its end first.
 *
 * What a turn shows instead is the page BAKED in its current language: the
 * plate with the letters and the hint drawn on at 2000×2600, by the same code
 * that draws the live layer, encoded once per language (WebP) when the page
 * first settles. `mapSpreads` hands the engine and the static slot the bake for
 * the page's language — so the curl's faces, the landing plate and the static
 * `<img>` under the layer all carry it — and the printed page until there is
 * one (the first arrival). Never the bare plate.
 *
 * A click or tap on the quote reaches the player through the engine
 * (`tapTarget`): the engine holds the turn back on a press over the quote and
 * starts it only once the press moves like a drag. Keyboard: the button.
 *
 * Around the morph (quoteMotion.ts): over the quote a fine pointer becomes the
 * WAND (wand.svg, a DOM element following the pointer, its colour cycling while
 * a morph runs); the letters grow ×`hoverScale` about the quote's centre while
 * hovered, and breathe until the first tap — redrawn at their scale, so they
 * stay crisp. None of it reaches a bake: a turn shows the page at rest.
 *
 * Fonts (Space Mono Bold, Lora Regular) are loaded before anything is measured,
 * and nothing is measured again: the letters are drawn, not laid out, so
 * nothing on the page can reflow.
 */
import { registerBusy } from '../activity';
import WAND_SVG from './wand.svg?raw';
import type { Page, Spread } from './issue-01';
import { pagesNear } from './pageAnimGeometry';
import { PAGE_H, PAGE_W } from './pageAnims';
import { SETTLE_FADE_MS } from './pageAnimPlayer';
import { HINT_MS, hintAlpha, hintAlphaAt, layoutBlock, layoutHint, planMorph, sampleMorph, swapArrow } from './quoteMorph';
import type { DrawnGlyph, Glyph, HintGlyph, Lang, Measure, MorphPlan } from './quoteMorph';
import { breathAt, flickAt, FLICK_MS, follow, hexToOklab, labDistance, oklabToHex, paletteAt, settleLab, TURN_EASE_MS, turnEaseAt, tweenAt, tweenDone } from './quoteMotion';
import type { ScaleTween } from './quoteMotion';
import { QUOTE_FACES, quoteOnPage, quoteSettings, subscribeQuoteSettings } from './quotes';
import type { QuotePage } from './quotes';

/** The language every quote is printed in: its page's own `src` shows it. */
const PRINTED: Lang = 'es';
/** Backing-store DPR cap for the letter canvas, as the sprites'. */
const MAX_DPR = 2;
/** The bakes' encoding: as close to the printed pages' own WebPs as costs nothing. */
const BAKE_TYPE = 'image/webp';
const BAKE_QUALITY = 0.92;
/** wand.svg at its native size, and its hotspot (the star's centre) from its
 *  top-left. */
const WAND = { w: 325, h: 690, hx: 162, hy: 171 };

const other = (l: Lang): Lang => (l === 'es' ? 'en' : 'es');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── fonts and measuring ─────────────────────────────────────────────────

let fontsReady: Promise<boolean> | null = null;

/** Both faces loaded and added to the document, once. False if either failed:
 *  the printed page then stays, with no translation. */
export function loadQuoteFonts(): Promise<boolean> {
  fontsReady ??= Promise.all(
    QUOTE_FACES.map((f) =>
      new FontFace(f.family, `url(${f.url})`, { weight: f.weight, style: 'normal' }).load().then((face) => {
        document.fonts.add(face);
      }),
    ),
  )
    .then(() => true)
    .catch(() => {
      fontsReady = null;
      return false;
    });
  return fontsReady;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const measure: Measure = (font, text) => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = font;
  const m = ctx.measureText(text);
  return { width: m.width, ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
};

interface Layout {
  es: Glyph[];
  en: Glyph[];
  hint: HintGlyph[];
}

const layouts = new Map<number, Layout>();

/** A page's letters in both languages and its hint, measured once (after the
 *  fonts have loaded — every caller awaits them). */
function layoutOf(q: QuotePage): Layout {
  let l = layouts.get(q.page);
  if (!l) {
    l = {
      es: q.blocks.flatMap((b) => layoutBlock(b, 'es', measure)),
      en: q.blocks.flatMap((b) => layoutBlock(b, 'en', measure)),
      hint: layoutHint(q.hint, measure),
    };
    layouts.set(q.page, l);
  }
  return l;
}

// ── drawing ─────────────────────────────────────────────────────────────

/** The point the letters grow and breathe about: the quote's centre, page px. */
function scaleCentre(q: QuotePage): [number, number] {
  const b = q.blocks.find((x) => x.key === 'quote') ?? q.blocks[0];
  return [b.anchorX, b.top + (b.lines.es.length * b.lineHeight) / 2];
}

/** Letters and hint, page px × k, onto whatever is already in `ctx`. The
 *  letters (not the hint) at `scale` about the quote's centre. */
function paint(
  ctx: CanvasRenderingContext2D,
  k: number,
  q: QuotePage,
  glyphs: DrawnGlyph[],
  hint: HintGlyph[] | null,
  alphaOf: (g: HintGlyph) => number,
  scale = 1,
): void {
  const [cx, cy] = scaleCentre(q);
  const ks = k * scale;
  ctx.setTransform(ks, 0, 0, ks, k * cx * (1 - scale), k * cy * (1 - scale));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // The outlines as drawn: Chrome's default on macOS emboldens canvas text by a
  // device-pixel constant (+8% ink on the quote, +14% on the attribution
  // against the print at 2000px; more at reading size). Measured in
  // docs/reader.md, "Chapter-break quotes".
  ctx.textRendering = 'geometricPrecision';
  for (const b of q.blocks) {
    ctx.font = b.font;
    ctx.fillStyle = q.colors[b.key] ?? '#000';
    for (const g of glyphs) {
      if (g.block !== b.key) continue;
      ctx.globalAlpha = g.alpha;
      ctx.fillText(g.ch, g.x, g.y);
    }
  }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (hint) paintHint(ctx, q, hint, alphaOf, q.hint.sizePx);
  ctx.globalAlpha = 1;
}

/** The ES ⇄ EN line: the labels set in the hint's font, the ⇄ drawn. */
function paintHint(
  ctx: CanvasRenderingContext2D,
  q: QuotePage,
  hint: HintGlyph[],
  alphaOf: (g: HintGlyph) => number,
  sizePx: number,
): void {
  ctx.font = q.hint.font.replace(`${q.hint.sizePx}px`, `${sizePx}px`);
  ctx.fillStyle = q.hint.color;
  ctx.strokeStyle = q.hint.color;
  for (const g of hint) {
    ctx.globalAlpha = alphaOf(g);
    if (!g.arrow) {
      ctx.fillText(g.ch, g.x, g.y);
      continue;
    }
    const a = swapArrow(g.x, g.y, sizePx, q.hint.arrowStrokeWeight);
    ctx.lineWidth = a.width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    for (const path of a.paths) {
      ctx.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const restGlyphs = (l: Layout, lang: Lang): DrawnGlyph[] => l[lang].map((g) => ({ ...g, alpha: 1 }));

/** What a bake holds: the whole page; the page without its letters; the
 *  letters alone on transparent (the last two for a turn that starts with the
 *  letters off ×1, `Page.ease`). */
type BakeKind = 'page' | 'base' | 'letters';

/** The page at rest in `lang` on a 2000×2600 canvas: the plate, then the
 *  letters and (`hint`) the hint — what the live layer draws, at 1:1. */
function renderPage(q: QuotePage, plate: CanvasImageSource, lang: Lang, hint: boolean, kind: BakeKind = 'page'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PAGE_W;
  c.height = PAGE_H;
  const ctx = c.getContext('2d')!;
  if (kind !== 'letters') ctx.drawImage(plate, 0, 0, PAGE_W, PAGE_H);
  const l = layoutOf(q);
  paint(ctx, 1, q, kind === 'base' ? [] : restGlyphs(l, lang), hint && kind !== 'letters' ? l.hint : null, (g) => hintAlpha(g.lang, lang, q.hint.inactiveOpacity));
  return c;
}

// ── the bakes ───────────────────────────────────────────────────────────

interface Bake {
  url: string;
  /** Holds the decoded bitmap while the page is about: the static slot and the
   *  curl's faces load the same URL. */
  img: HTMLImageElement;
}

const bakes = new Map<string, Bake>();
const baking = new Map<string, Promise<Bake | null>>();
const bakeKey = (page: number, lang: Lang, hint: boolean, kind: BakeKind = 'page') => `${page}:${lang}:${hint ? 1 : 0}:${kind}`;

function bakeOne(q: QuotePage, plate: HTMLImageElement, lang: Lang, hint: boolean, kind: BakeKind = 'page'): Promise<Bake | null> {
  const key = bakeKey(q.page, lang, hint, kind);
  const done = bakes.get(key);
  if (done) return Promise.resolve(done);
  let p = baking.get(key);
  if (!p) {
    p = new Promise<Blob | null>((resolve) => renderPage(q, plate, lang, hint, kind).toBlob(resolve, BAKE_TYPE, BAKE_QUALITY))
      .then(async (blob) => {
        if (!blob) return null;
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await img.decode().catch(() => {});
        const b = { url: img.src, img };
        bakes.set(key, b);
        return b;
      })
      .catch(() => null)
      .finally(() => baking.delete(key));
    baking.set(key, p);
  }
  return p;
}

// ── the player ──────────────────────────────────────────────────────────

interface Slot {
  page: Page;
  q: QuotePage;
  wrap: HTMLDivElement;
  plate: HTMLImageElement;
  canvas: HTMLCanvasElement;
  hit: HTMLButtonElement;
  desc: HTMLElement;
  live: HTMLElement;
  shown: boolean;
  fade: Animation | null;
  morph: { plan: MorphPlan; t0: number; from: Lang; to: Lang } | null;
  /** The last frame's letters, for the verify suite. */
  drawn: DrawnGlyph[];
  /** The letters' scale as last drawn, the hover tween in flight, and when
   *  the breathing loop (re)started. */
  drawnScale: number;
  tween: ScaleTween | null;
  breathT0: number;
  /** A turn started with the letters at `from`: the layer stays up while they
   *  ease to ×1, and --quote-s carries the same scale to the leaf. */
  turnEase: { from: number; t0: number } | null;
  onClick: () => void;
}

export interface QuotePlayer {
  /** The open spread's quote pages: each page's wrapper (`.quote-layer`) as
   *  FlipBook rendered it, or null. Called after every committed spread. */
  setSlots: (spread: number, spreads: Spread[], wraps: (HTMLDivElement | null)[]) => void;
  /** From the engine's `onTurnActive`, synchronously. */
  setTurning: (active: boolean) => void;
  /** The engine's `tapTarget`: the quote's toggle if the press is on one. */
  tapAt: (e: PointerEvent) => (() => void) | null;
  /** `spreads` with each quote page's `src` its bake in its current language. */
  mapSpreads: (spreads: Spread[]) => Spread[];
  /** Called whenever `mapSpreads` would change (useSyncExternalStore's). */
  subscribe: (fn: () => void) => () => void;
  /** Bumped whenever `mapSpreads` would change. */
  version: () => number;
  /**
   * Live on `book` (the engine's pointer host, whose cursor gives way to the
   * wand over a quote): listeners, the wand, the busy probe, the dials. Returns the teardown, which
   * leaves the player as it was made — a StrictMode remount attaches again.
   */
  attach: (book: HTMLElement) => () => void;
}

/** Inert until `attach`: FlipBook makes one in render (as state). */
export function createQuotePlayer(): QuotePlayer {
  const langs = new Map<number, Lang>();
  const listeners = new Set<() => void>();
  const platePrefetch = new Map<number, HTMLImageElement>();
  let slots: Slot[] = [];
  let spreadIndex = 0;
  let spreadList: Spread[] = [];
  let turning = false;
  let destroyed = true;
  let book: HTMLElement | null = null;
  let raf = 0;
  let epoch = 0;
  let version = 0;
  /** The quote under a fine pointer, if any. */
  let hoverSlot: Slot | null = null;
  /** Pages tapped since they last reset: they breathe no more. */
  const tapped = new Set<number>();
  const pointer = { x: 0, y: 0 };
  /** The wand: its element (made on attach), where it is drawn, its turn and
   *  its colour (OKLab), and the clock its smoothing steps on. */
  const wand = {
    el: null as HTMLDivElement | null,
    on: false,
    x: 0,
    y: 0,
    angle: 0,
    flickT0: -Infinity,
    lab: hexToOklab(quoteSettings.wandPalette[0] ?? '#E8D555'),
    hex: '',
    last: 0,
  };
  /** When a tap last toggled: the button's own click right after it (an
   *  assistive tech that sends both) is the same press. */
  let lastTap = -Infinity;
  /** DEV: hold a turn's ease at this share of its way (the verify suite). */
  let easeHold: number | null = null;
  let memo: { spreads: Spread[]; version: number; out: Spread[] } | null = null;

  const langOf = (n: number): Lang => langs.get(n) ?? quoteSettings.defaultLang;

  function bump(): void {
    version++;
    for (const fn of listeners) fn();
  }

  /** `page` as the engine and the static slot should show it. */
  function asShown(page: Page | null): Page | null {
    if (!page) return page;
    const q = quoteOnPage(page.n);
    if (!q) return page;
    const lang = langOf(page.n);
    const hint = quoteSettings.showHint;
    const b = bakes.get(bakeKey(page.n, lang, hint));
    if (!b) return page;
    const base = bakes.get(bakeKey(page.n, lang, hint, 'base'));
    const letters = bakes.get(bakeKey(page.n, lang, hint, 'letters'));
    const [cx, cy] = scaleCentre(q);
    const ease = base && letters ? { base: base.url, letters: letters.url, fx: cx / PAGE_W, fy: cy / PAGE_H } : undefined;
    // A riffle's fast leaves keep the printed half-size page in the printed
    // language (it lacks only the hint, for under 150ms); in the other, the bake.
    return { ...page, src: b.url, riffle: lang === PRINTED ? page.riffle : b.url, ease };
  }

  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      const s = slots.find((x) => x.wrap === en.target);
      if (s?.shown && sizeCanvas(s) && !s.morph) drawRest(s);
    }
  });

  function sizeCanvas(s: Slot): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(s.wrap.clientWidth * dpr));
    const h = Math.max(1, Math.round(s.wrap.clientHeight * dpr));
    if (s.canvas.width === w && s.canvas.height === h) return false;
    s.canvas.width = w;
    s.canvas.height = h;
    return true;
  }

  function draw(s: Slot, glyphs: DrawnGlyph[], alphaOf: (g: HintGlyph) => number, scale: number): void {
    const ctx = s.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    paint(ctx, s.canvas.width / PAGE_W, s.q, glyphs, quoteSettings.showHint ? layoutOf(s.q).hint : null, alphaOf, scale);
    s.drawn = glyphs;
    s.drawnScale = scale;
  }

  function drawRest(s: Slot, scale = scaleOf(s, performance.now())): void {
    const lang = langOf(s.page.n);
    draw(s, restGlyphs(layoutOf(s.q), lang), (g) => hintAlpha(g.lang, lang, s.q.hint.inactiveOpacity), scale);
  }

  // ── hover grow and breathing ──────────────────────────────────────────

  /** Breathing: until the page's first tap, never under reduced motion. */
  const breathes = (s: Slot): boolean =>
    !reducedMotion() &&
    s.shown &&
    !turning &&
    quoteSettings.breatheScale !== 1 &&
    !(quoteSettings.breatheUntilFirstTap && tapped.has(s.page.n));

  /** The letters' scale now: a hover tween in flight, else the hover's, else
   *  the breath's. Reduced motion: 1. */
  /** The turn ease's share of its way. */
  const easeP = (s: Slot, now: number): number => (easeHold ?? (now - s.turnEase!.t0) / TURN_EASE_MS);

  function scaleOf(s: Slot, now: number): number {
    if (s.turnEase) return turnEaseAt(s.turnEase.from, Math.min(1, easeP(s, now)) * TURN_EASE_MS);
    if (reducedMotion()) return 1;
    if (s.tween) {
      if (!tweenDone(s.tween, now)) return tweenAt(s.tween, now);
      const to = s.tween.to;
      s.tween = null;
      if (s !== hoverSlot) s.breathT0 = now; // the breath picks up from rest
      return to;
    }
    if (s === hoverSlot) return quoteSettings.hoverScale;
    if (breathes(s)) return breathAt(now - s.breathT0, quoteSettings.breathePeriodMs, quoteSettings.breatheScale);
    return 1;
  }

  /** Something on the slot moves next frame: a tween, a breath. */
  const animating = (s: Slot): boolean => s.shown && (s.tween !== null || (s !== hoverSlot && breathes(s)));

  /** The button's name, the quote it describes and its language. `announce`:
   *  the live region reads the quote now on the page. */
  function label(s: Slot, announce: boolean): void {
    const lang = langOf(s.page.n);
    s.hit.setAttribute('aria-label', lang === 'es' ? 'Translate the quote to English' : 'Show the quote in Spanish');
    s.hit.dataset.lang = lang;
    s.desc.lang = lang;
    s.desc.textContent = s.q.text[lang];
    if (announce) {
      s.live.lang = lang;
      s.live.textContent = s.q.text[lang];
    }
  }

  function hide(s: Slot): void {
    s.fade?.cancel();
    s.fade = null;
    s.shown = false;
    delete s.wrap.dataset.state;
  }

  /** A morph in flight lands where it was going. */
  function finish(s: Slot): void {
    if (!s.morph) return;
    s.morph = null;
    drawRest(s);
  }

  async function reveal(s: Slot): Promise<void> {
    const at = epoch;
    if (!(await loadQuoteFonts())) return;
    if (!s.plate.getAttribute('src') && s.plate.dataset.src) s.plate.src = s.plate.dataset.src;
    await s.plate.decode().catch(() => {});
    if (at !== epoch || destroyed || turning || !slots.includes(s)) return;
    if (!s.plate.naturalWidth) return; // no plate: the printed page stays
    const hint = quoteSettings.showHint;
    const made = await Promise.all((['es', 'en'] as Lang[]).map((l) => bakeOne(s.q, s.plate, l, hint)));
    if (at !== epoch || destroyed || turning || !slots.includes(s)) return;
    if (made.some((b) => !b)) return; // a turn would have nothing to show in the other language
    // The two layers a turn eases the letters on (Page.ease), after: nothing
    // waits for them, and until they exist a turn shows the page at ×1.
    void Promise.all((['es', 'en'] as Lang[]).flatMap((l) => (['base', 'letters'] as BakeKind[]).map((k) => bakeOne(s.q, s.plate, l, hint, k)))).then(() => {
      if (!destroyed) bump();
    });
    sizeCanvas(s);
    s.morph = null;
    s.tween = null;
    s.shown = true;
    s.breathT0 = performance.now();
    drawRest(s);
    label(s, false);
    s.wrap.dataset.state = 'shown';
    const fade = s.wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SETTLE_FADE_MS, easing: 'linear' });
    s.fade = fade;
    hoverAt(pointer.x, pointer.y, lastPointerFine);
    loop();
    // The static slot under the layer takes the bake once the layer covers it:
    // on a first arrival the hint fades in with the layer rather than popping.
    const swap = () => {
      if (s.fade === fade) s.fade = null;
      if (!destroyed) bump();
    };
    void fade.finished.then(swap, swap);
  }

  function toggle(s: Slot): void {
    if (!s.shown || turning || destroyed) return;
    finish(s); // a click mid-morph lands it, then starts the new one
    const from = langOf(s.page.n);
    const to = other(from);
    const l = layoutOf(s.q);
    langs.set(s.page.n, to);
    tapped.add(s.page.n); // the breathing guide has done its work
    s.morph = { plan: planMorph(l[from], l[to], quoteSettings, reducedMotion()), t0: performance.now(), from, to };
    label(s, true);
    bump(); // the static slot and the next turn: the new language's bake
    loop();
  }

  /** A turn's first 180ms: the letters ease to ×1 on the layer (while it is
   *  still what shows) and, through --quote-s, on the leaf. Then the layer goes. */
  function turnTick(now: number): void {
    let any = false;
    for (const s of slots) {
      if (!s.turnEase) continue;
      const scale = scaleOf(s, now);
      if (scale !== s.drawnScale) drawRest(s, scale);
      book?.style.setProperty('--quote-s', String(scale));
      if (easeP(s, now) >= 1 && easeHold === null) {
        s.turnEase = null;
        hide(s);
        book?.style.removeProperty('--quote-s');
      } else any = true;
    }
    if (any) raf = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    raf = 0;
    if (destroyed) return;
    if (turning) {
      turnTick(now);
      return;
    }
    let any = false;
    for (const s of slots) {
      if (!s.shown) continue;
      const scale = scaleOf(s, now);
      if (s.morph) {
        const { plan, t0, from, to } = s.morph;
        const ms = Math.max(0, now - t0);
        if (ms >= Math.max(plan.totalMs, HINT_MS)) {
          finish(s);
        } else {
          any = true;
          const inactive = s.q.hint.inactiveOpacity;
          draw(s, sampleMorph(plan, ms), (g) => hintAlphaAt(g.lang, from, to, ms, inactive), scale);
        }
      } else if (Math.abs(scale - s.drawnScale) > 1e-5 || (scale !== s.drawnScale && (scale === 1 || scale === quoteSettings.hoverScale))) {
        // A step too small to see is skipped, except the one onto a resting
        // value: the letters come to rest at exactly ×1 (or the grow).
        drawRest(s, scale);
      }
      if (animating(s)) any = true;
    }
    if (stepWand(now)) any = true;
    if (any) raf = requestAnimationFrame(tick);
  }

  function loop(): void {
    if (!raf && !turning && !destroyed) raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // ── the cursor ────────────────────────────────────────────────────────

  const inside = (el: Element, x: number, y: number): boolean => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  /** The quote a fine pointer is over changes: the letters tween toward their
   *  new scale (from wherever they are), and the wand shows or goes. */
  function setHover(next: Slot | null): void {
    if (next === hoverSlot || !book) return;
    const now = performance.now();
    for (const s of [hoverSlot, next]) {
      if (!s || !s.shown || s.turnEase || reducedMotion()) continue;
      const from = scaleOf(s, now);
      s.tween = { from, to: s === next ? quoteSettings.hoverScale : 1, t0: now };
    }
    hoverSlot = next;
    if (next) book.dataset.cursor = 'quote';
    else delete book.dataset.cursor;
    showWand(next !== null);
    loop();
  }

  let lastPointerFine = false;
  function hoverAt(x: number, y: number, fine: boolean): void {
    setHover(fine && !turning ? (slots.find((s) => s.shown && inside(s.hit, x, y)) ?? null) : null);
  }
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    // Fine pointers only: a touch keeps no cursor.
    lastPointerFine = e.pointerType === 'mouse' || e.pointerType === 'pen';
    hoverAt(e.clientX, e.clientY, lastPointerFine);
    if (wand.on) loop();
  };
  const onLeave = () => setHover(null);

  // ── the wand ──────────────────────────────────────────────────────────

  function placeWand(): void {
    if (!wand.el) return;
    const k = quoteSettings.wandSizePx / WAND.h;
    wand.el.style.width = `${WAND.w * k}px`;
    wand.el.style.height = `${WAND.h * k}px`;
    wand.el.style.transformOrigin = `${WAND.hx * k}px ${WAND.hy * k}px`;
  }

  function showWand(on: boolean): void {
    if (!wand.el || on === wand.on) return;
    if (on && !wand.el.dataset.on && getComputedStyle(wand.el).opacity === '0') {
      // Appearing from nothing: where the pointer is, not where it last was.
      wand.x = pointer.x;
      wand.y = pointer.y;
    }
    wand.on = on;
    if (on) wand.el.dataset.on = '';
    else delete wand.el.dataset.on;
  }

  /** One frame of the wand: following the pointer, flicking, its colour.
   *  True if it moves again next frame. */
  function stepWand(now: number): boolean {
    if (!wand.el) return false;
    const dt = wand.last ? Math.min(100, now - wand.last) : 16;
    wand.last = now;
    const palette = quoteSettings.wandPalette.length ? quoteSettings.wandPalette : ['#E8D555'];
    const morph = slots.find((s) => s.morph)?.morph ?? null;
    const base = hexToOklab(palette[0]);
    let more = false;
    if (morph) {
      wand.lab = paletteAt(palette.map(hexToOklab), now - morph.t0, quoteSettings.colorCycleMs);
      more = true;
    } else if (labDistance(wand.lab, base) > 1e-4) {
      wand.lab = settleLab(wand.lab, base, dt);
      more = true;
    } else wand.lab = base;
    const hex = oklabToHex(wand.lab);
    if (hex !== wand.hex) {
      wand.hex = hex;
      wand.el.style.setProperty('--wand', hex);
    }
    if (wand.on) {
      wand.x = follow(wand.x, pointer.x, dt);
      wand.y = follow(wand.y, pointer.y, dt);
      const flicking = now - wand.flickT0 < FLICK_MS;
      wand.angle = quoteSettings.wandTiltDeg + flickAt(now - wand.flickT0);
      const k = quoteSettings.wandSizePx / WAND.h;
      wand.el.style.transform = `translate3d(${(wand.x - WAND.hx * k).toFixed(2)}px, ${(wand.y - WAND.hy * k).toFixed(2)}px, 0) rotate(${wand.angle.toFixed(2)}deg)`;
      if (flicking || Math.hypot(pointer.x - wand.x, pointer.y - wand.y) > 0.05) more = true;
    }
    return more;
  }

  // ── neighbours: fonts and plates ahead of the settle ──────────────────

  function prefetch(): void {
    const near = pagesNear(spreadList, spreadIndex, 1);
    let any = false;
    for (const n of near) {
      const q = quoteOnPage(n);
      if (!q) continue;
      any = true;
      const page = spreadList.flat().find((p) => p?.n === n);
      if (page?.plate && !platePrefetch.has(n) && !slots.some((s) => s.page.n === n)) {
        const img = new Image();
        img.src = page.plate;
        platePrefetch.set(n, img);
      }
    }
    if (any) void loadQuoteFonts();
    for (const n of platePrefetch.keys()) if (!near.has(n)) platePrefetch.delete(n);
  }

  // ── the dials ─────────────────────────────────────────────────────────

  let lastHint = quoteSettings.showHint;
  const onSettings = (v: typeof quoteSettings) => {
    placeWand();
    loop();
    if (v.showHint === lastHint) return;
    lastHint = v.showHint;
    // Redrawn now; the bakes for the new hint follow, and the slot takes them.
    for (const s of slots) {
      if (!s.shown) continue;
      if (!s.morph) drawRest(s);
      void Promise.all((['es', 'en'] as Lang[]).map((l) => bakeOne(s.q, s.plate, l, v.showHint))).then(() => {
        if (!destroyed) bump();
      });
    }
    bump();
  };

  const player: QuotePlayer = {
    setSlots(spread, spreads, wraps) {
      spreadIndex = spread;
      spreadList = spreads;
      const next: Slot[] = [];
      for (const wrap of wraps) {
        if (!wrap) continue;
        const kept = slots.find((s) => s.wrap === wrap);
        if (kept) {
          next.push(kept);
          continue;
        }
        const n = Number(wrap.dataset.page);
        const page = spreads[spread]?.find((p) => p?.n === n);
        const q = quoteOnPage(n);
        const plate = wrap.querySelector<HTMLImageElement>('.quote-layer__plate');
        const canvas = wrap.querySelector('canvas');
        const hit = wrap.querySelector('button');
        const desc = wrap.querySelector<HTMLElement>('.quote-layer__text-alt');
        const live = wrap.querySelector<HTMLElement>('[aria-live]');
        if (!page || !q || !plate || !canvas || !hit || !desc || !live) continue;
        const s: Slot = {
          page,
          q,
          wrap,
          plate,
          canvas,
          hit,
          desc,
          live,
          shown: false,
          fade: null,
          morph: null,
          drawn: [],
          drawnScale: 1,
          tween: null,
          breathT0: 0,
          turnEase: null,
          onClick: () => {
            if (performance.now() - lastTap < 400) return;
            toggle(s);
          },
        };
        hit.addEventListener('click', s.onClick);
        hide(s);
        ro.observe(wrap);
        next.push(s);
      }
      for (const s of slots) {
        if (next.includes(s)) continue;
        finish(s); // never reset under a morph: it lands first
        if (s === hoverSlot) setHover(null);
        s.hit.removeEventListener('click', s.onClick);
        ro.unobserve(s.wrap);
      }
      slots = next;

      // Back to the printed language once the page is off the open spread.
      const open = new Set((spreads[spread] ?? []).filter((p): p is Page => !!p).map((p) => p.n));
      let reset = false;
      if (quoteSettings.resetWhenPageLeaves) {
        for (const [n, lang] of langs) {
          if (open.has(n)) continue;
          langs.delete(n);
          if (lang !== quoteSettings.defaultLang) reset = true;
        }
        // Reset to the printed language — even one already back in it by
        // hand: the page breathes again.
        for (const n of tapped) if (!open.has(n)) tapped.delete(n);
      }
      if (reset) bump();
      if (turning) return; // a riffle's inner landing: wait for the book to settle (and fetch nothing)
      prefetch();
      epoch++;
      for (const s of slots) if (!s.shown) void reveal(s);
    },

    setTurning(active) {
      if (active === turning) return;
      turning = active;
      epoch++;
      if (active) {
        // Synchronously, before the strips' first frame: a morph lands, and the
        // page under the layer (its bake) is what shows — at once if the
        // letters are at ×1; else after they ease there (the layer stays up,
        // and the leaf draws them at --quote-s: Page.ease).
        stop();
        const now = performance.now();
        let easing = false;
        for (const s of slots) {
          const from = s.shown ? s.drawnScale : 1;
          s.tween = null;
          if (s.shown && Math.abs(from - 1) > 1e-4) {
            s.turnEase = { from, t0: now };
            book?.style.setProperty('--quote-s', String(from));
            easing = true;
            finish(s);
          } else {
            finish(s);
            hide(s);
          }
        }
        setHover(null);
        if (easing) raf = requestAnimationFrame(tick);
        return;
      }
      book?.style.removeProperty('--quote-s');
      for (const s of slots) {
        if (!s.turnEase) continue;
        s.turnEase = null;
        if (s.shown) drawRest(s);
      }
      prefetch();
      for (const s of slots) if (!s.shown) void reveal(s);
    },

    tapAt(e) {
      if (turning || destroyed) return null;
      const s = slots.find((x) => x.shown && inside(x.hit, e.clientX, e.clientY));
      if (!s) return null;
      return () => {
        lastTap = performance.now();
        if (quoteSettings.flickOnTap && !reducedMotion() && wand.on) wand.flickT0 = performance.now();
        toggle(s);
      };
    },

    mapSpreads(spreads) {
      if (memo && memo.spreads === spreads && memo.version === version) return memo.out;
      const out = spreads.map(([l, r]) => [asShown(l), asShown(r)] as Spread);
      memo = { spreads, version, out };
      return out;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    version: () => version,

    attach(el) {
      book = el;
      destroyed = false;
      lastHint = quoteSettings.showHint;
      el.addEventListener('pointermove', onPointer);
      el.addEventListener('pointerdown', onPointer);
      el.addEventListener('pointerleave', onLeave);
      const offSettings = subscribeQuoteSettings(onSettings);
      // The wand: above everything, never in the way of a pointer.
      const w = document.createElement('div');
      w.className = 'quote-wand';
      w.setAttribute('aria-hidden', 'true');
      w.innerHTML = WAND_SVG;
      document.body.append(w);
      wand.el = w;
      wand.hex = '';
      placeWand();
      const unbusy = registerBusy(() => slots.some((s) => s.morph !== null));
      // The dev handle reads THIS player: StrictMode makes (and drops) a second.
      if (import.meta.env.DEV) {
        devHandle.player = player;
        devHandle.state = () =>
          slots.map((s) => ({
            page: s.page.n,
            lang: langOf(s.page.n),
            shown: s.shown,
            morphing: s.morph !== null,
            morph: s.morph && { totalMs: s.morph.plan.totalMs, moved: s.morph.plan.moved, total: s.morph.plan.total, reduced: s.morph.plan.reduced },
            drawn: s.drawn.map((g) => ({ ...g })),
            label: s.hit.getAttribute('aria-label'),
            live: { lang: s.live.lang, text: s.live.textContent },
            desc: { lang: s.desc.lang, text: s.desc.textContent },
            scale: s.drawnScale,
            hovered: s === hoverSlot,
            breathing: breathes(s) && s !== hoverSlot,
            tapped: tapped.has(s.page.n),
            turnEase: s.turnEase ? { from: s.turnEase.from } : null,
          }));
        devHandle.holdEase = (p) => {
          easeHold = p;
          if (p === null && turning && slots.some((x) => x.turnEase)) raf ||= requestAnimationFrame(tick);
        };
        devHandle.wand = () => {
          const hot = wand.el?.querySelector('.quote-wand__hot')?.getBoundingClientRect();
          return {
            on: wand.on,
            opacity: wand.el ? Number(getComputedStyle(wand.el).opacity) : 0,
            colour: wand.hex,
            angle: wand.angle,
            hot: hot ? { x: hot.left + hot.width / 2, y: hot.top + hot.height / 2 } : null,
            height: wand.el?.getBoundingClientRect().height ?? 0,
          };
        };
        devHandle.langs = () => Object.fromEntries(langs);
        devHandle.toggle = (n) => {
          const s = slots.find((x) => x.page.n === n);
          if (s) toggle(s);
          return !!s;
        };
      }
      return () => {
        destroyed = true;
        epoch++;
        stop();
        offSettings();
        unbusy();
        for (const s of slots) {
          s.hit.removeEventListener('click', s.onClick);
          ro.unobserve(s.wrap);
        }
        slots = [];
        turning = false;
        hoverSlot = null;
        wand.on = false;
        w.remove();
        wand.el = null;
        el.removeEventListener('pointermove', onPointer);
        el.removeEventListener('pointerdown', onPointer);
        el.removeEventListener('pointerleave', onLeave);
        delete el.dataset.cursor;
        el.style.removeProperty('--quote-s');
        platePrefetch.clear();
        book = null;
        if (import.meta.env.DEV && devHandle.player === player) devHandle.player = null;
      };
    },
  };

  return player;
}

/** DEV: `window.__quote` — the verify suite's and the TRANSLATE panel's way in. */
const devHandle: {
  player: QuotePlayer | null;
  state: () => unknown[];
  langs: () => Record<number, Lang>;
  toggle: (page: number) => boolean;
  /** Where `page`'s letters sit at rest in `lang`, measured afresh. */
  layout: (page: number, lang: Lang) => Promise<Glyph[] | null>;
  /** `page` at rest in `lang` (plate + letters, the hint if asked), 2000×2600, as a PNG data URL. */
  render: (page: number, lang: Lang, hint: boolean) => Promise<string | null>;
  /** The bake a turn shows for `page` in `lang`, if it has been made. */
  bakeUrl: (page: number, lang: Lang) => string | null;
  /** The two layers a turn eases `page`'s letters on in `lang`, if made. */
  easeUrls: (page: number, lang: Lang) => { base: string; letters: string } | null;
  /** Hold a turn's letter ease at share `p` of its way (null lets it go). */
  holdEase: (p: number | null) => void;
  /** The wand: shown, its opacity, colour, turn, and where its hotspot is on screen. */
  wand: () => { on: boolean; opacity: number; colour: string; angle: number; hot: { x: number; y: number } | null; height: number } | null;
} = {
  player: null,
  state: () => [],
  langs: () => ({}),
  toggle: () => false,
  async layout(page, lang) {
    const q = quoteOnPage(page);
    if (!q || !(await loadQuoteFonts())) return null;
    return q.blocks.flatMap((b) => layoutBlock(b, lang, measure));
  },
  async render(page, lang, hint) {
    const q = quoteOnPage(page);
    if (!q || !(await loadQuoteFonts())) return null;
    const img = new Image();
    img.src = `/issues/01/plates/${String(page).padStart(2, '0')}.webp`;
    await img.decode();
    return renderPage(q, img, lang, hint).toDataURL('image/png');
  },
  bakeUrl: (page, lang) => bakes.get(bakeKey(page, lang, quoteSettings.showHint))?.url ?? null,
  wand: () => null,
  holdEase: () => {},
  easeUrls(page, lang) {
    const hint = quoteSettings.showHint;
    const base = bakes.get(bakeKey(page, lang, hint, 'base'));
    const letters = bakes.get(bakeKey(page, lang, hint, 'letters'));
    return base && letters ? { base: base.url, letters: letters.url } : null;
  },
};

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __quote?: typeof devHandle }).__quote = devHandle;
}
