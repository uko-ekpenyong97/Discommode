/**
 * The chapter-break quote's translate morph, as pure functions (docs/reader.md,
 * "Chapter-break quotes"): where every letter sits, which letters the two
 * languages share, and where each one is at any moment of the morph. No DOM:
 * the player (quotePlayer.ts) measures with a canvas and draws what these
 * return; the tests run them on a fake monospace.
 *
 * A port of the approved prototype (~/Discommode-pages/01/translate/
 * prototype.html), behaviour for behaviour:
 *
 *   match     an order-preserving LCS over accent-insensitive letters ("á" is
 *             "a"), block by block, then — `reuseOutOfOrder` — a nearest
 *             same-letter pass for what is left, up to 650 page px away.
 *   move      a shared letter slides to its new place on the easing, lifted on
 *             an arc (`arcPx`, scaled by how far it travels up to 400px) and
 *             swaps its accent halfway.
 *   enter     a new letter rises 8px into place while it fades in, scrambling
 *             through random letters for the first 70% of its time.
 *   exit      a leaving letter rises 8px as it fades out, scrambling after the
 *             first 15%.
 *   stagger   by reading order of where each letter ends up (a leaving one by
 *             where it was): 0.65 of its line, 0.35 of its x, × `staggerMs`.
 *             Exits start at half the stagger and take half the time; enters
 *             start 35% of the way in and take 65% of it.
 *
 * Under reduced motion it is a crossfade: nothing is matched, nothing moves or
 * scrambles, the old letters fade out over 180ms and the new in over the last
 * 180 of 300.
 *
 * All positions are PAGE px (2000×2600); a glyph's x is its left edge, its y
 * its BASELINE.
 */
import { cubicBezier } from './jump';

export type Lang = 'es' | 'en';
export type Easing = 'inOutCubic' | 'inOutQuint' | 'outBack';
export const EASINGS: Easing[] = ['inOutCubic', 'inOutQuint', 'outBack'];

export const EASE: Record<Easing, (t: number) => number> = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** What a morph is shaped by: the TRANSLATE dials' share of `QuoteSettings`. */
export interface MorphSettings {
  durationMs: number;
  staggerMs: number;
  arcPx: number;
  easing: Easing;
  reuseOutOfOrder: boolean;
  scramble: boolean;
}

/** The whole crossfade under reduced motion. */
export const REDUCED_MS = 300;
/** The ES ⇄ EN hint's opacity change (the prototype's 0.3s CSS transition). */
export const HINT_MS = 300;
/** How often a scrambling letter picks a new one. */
export const SCRAMBLE_STEP_MS = 55;
/** A new letter rises this far into place; a leaving one this far out. */
const RISE_PX = 8;
/** The arc's full height is reached by letters travelling this far or more. */
const ARC_FULL_PX = 400;
/** The nearest same-letter pass looks no further than this. */
const NEAREST_MAX_PX = 650;
const POOL = 'abcdefghijklmnopqrstuvwxyzñáé';

/** CSS's `ease`, which the prototype's hint transition ran on. */
export const CSS_EASE = cubicBezier([0.25, 0.1, 0.25, 1]);

// ── layout ─────────────────────────────────────────────────────────────

export interface Metrics {
  width: number;
  /** The font's ascent and descent (canvas `fontBoundingBox*`): what CSS
   *  centres a line box's content area by. */
  ascent: number;
  descent: number;
}
export type Measure = (font: string, text: string) => Metrics;

export interface Glyph {
  ch: string;
  x: number;
  /** Baseline. */
  y: number;
  /** Which block: letters only ever match within one. */
  block: string;
}

export interface TextBlock {
  key: string;
  font: string;
  lineHeight: number;
  align: 'center' | 'right' | 'left';
  /** The centre for `center`, the right edge for `right`, the left for `left`. */
  anchorX: number;
  /** The first line box's top. */
  top: number;
  lines: Record<Lang, string[]>;
}

/** Where the baseline sits in a line box of `lineHeight`: CSS's half-leading
 *  either side of the content area. */
export function baselineIn(lineHeight: number, m: Metrics): number {
  return (lineHeight - (m.ascent + m.descent)) / 2 + m.ascent;
}

/**
 * Every visible letter of `block` in `lang`, in reading order. A letter's x is
 * the width of the line up to and including it, less its own advance: so the
 * kern before it is kept too (the prototype's width-up-to-it dropped it, up to
 * 1.6px at 2000px in Lora — "Yá" on page 12). Spaces take no glyph.
 */
export function layoutBlock(block: TextBlock, lang: Lang, measure: Measure): Glyph[] {
  const out: Glyph[] = [];
  block.lines[lang].forEach((line, li) => {
    const m = measure(block.font, line);
    const x0 = block.align === 'center' ? block.anchorX - m.width / 2 : block.align === 'right' ? block.anchorX - m.width : block.anchorX;
    const y = block.top + li * block.lineHeight + baselineIn(block.lineHeight, m);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') continue;
      out.push({ ch, x: x0 + measure(block.font, line.slice(0, i + 1)).width - measure(block.font, ch).width, y, block: block.key });
    }
  });
  return out;
}

export interface HintGlyph {
  ch: string;
  /** The left of its cell (a letter's origin), page px. */
  x: number;
  /** Baseline. */
  y: number;
  /** The language this letter names, or null (the arrow). */
  lang: Lang | null;
  /** The ⇄, which is DRAWN (`swapArrow`), not typeset: no face here has it. */
  arrow: boolean;
}

/** The hint's arrow, as typed in `quotes.json`. */
export const ARROW = '⇄';

export interface HintSpec {
  font: string;
  text: string;
  letterSpacingPx: number;
  lineHeight: number;
  centerX: number;
  top: number;
}

/**
 * The ES ⇄ EN line, letter by letter: CSS letter-spacing (after every letter,
 * the last included) on one centred line. Its first word names Spanish, its
 * last English.
 */
export function layoutHint(h: HintSpec, measure: Measure): HintGlyph[] {
  // The arrow takes one letter's cell: Space Mono is monospaced, so any letter
  // measures it (the ⇄ itself would measure a fallback face's).
  const text = h.text.replaceAll(ARROW, 'x');
  const m = measure(h.font, text);
  const n = text.length;
  const x0 = h.centerX - (m.width + n * h.letterSpacingPx) / 2;
  const y = h.top + baselineIn(h.lineHeight, m);
  const first = h.text.indexOf(' ');
  const last = h.text.lastIndexOf(' ');
  const out: HintGlyph[] = [];
  for (let i = 0; i < n; i++) {
    const ch = h.text[i];
    if (ch === ' ') continue;
    const lang: Lang | null = first < 0 ? null : i < first ? 'es' : i > last ? 'en' : null;
    out.push({ ch, x: x0 + (i ? measure(h.font, text.slice(0, i)).width : 0) + i * h.letterSpacingPx, y, lang, arrow: ch === ARROW });
  }
  return out;
}

/** Space Mono's metrics, in em, measured from fontsource 5.3.0's faces (2026-10-02):
 *  the vertical stem of its "n" at Regular and Bold, its advance, its caps. */
export const SPACE_MONO = { stemEm: { 400: 0.078, 700: 0.126 } as Record<number, number>, advanceEm: 0.612, capEm: 0.7 };

export interface ArrowStroke {
  /** Stroke width, px. */
  width: number;
  /** Open polylines: each arrow's shaft and its head. */
  paths: [number, number][][];
}

/**
 * The ⇄ in a letter's cell at `x` on `baseline`, `sizePx` the type's size: a
 * right arrow over a left one, centred on half the cap height, drawn the way
 * Space Mono draws its own ↑ and ↓ — a straight shaft, flat ends, a flat-tipped 45°
 * chevron head — at the stem of `weight`.
 */
export function swapArrow(x: number, baseline: number, sizePx: number, weight: number): ArrowStroke {
  const em = sizePx;
  const width = (SPACE_MONO.stemEm[weight] ?? SPACE_MONO.stemEm[700]) * em;
  const cell = SPACE_MONO.advanceEm * em;
  const len = 0.52 * em;
  const x0 = x + (cell - len) / 2;
  const x1 = x0 + len;
  const mid = baseline - (SPACE_MONO.capEm * em) / 2;
  const gap = 0.13 * em; // each shaft this far from the centre line
  const arm = 0.14 * em; // a head's reach back along each axis
  const top = mid - gap;
  const bot = mid + gap;
  return {
    width,
    paths: [
      [[x0, top], [x1, top]],
      [[x1 - arm, top - arm], [x1, top], [x1 - arm, top + arm]],
      [[x1, bot], [x0, bot]],
      [[x0 + arm, bot - arm], [x0, bot], [x0 + arm, bot + arm]],
    ],
  };
}

/** The hint's opacity for a letter naming `of` while `active` is shown. */
export const hintAlpha = (of: Lang | null, active: Lang, inactive: number): number => (of === null || of === active ? 1 : inactive);

// ── matching ───────────────────────────────────────────────────────────

/** Accent- and case-insensitive: "Á" and "a" are one letter. */
export const norm = (c: string): string => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Which letter of `dst` each letter of `src` becomes: dst index → src index.
 * The longest common subsequence first (so shared letters keep their order),
 * then, with `nearest`, each dst letter still unmatched takes the closest
 * unused src letter of the same kind within 650px.
 */
export function matchGlyphs(src: Glyph[], dst: Glyph[], nearest: boolean): Map<number, number> {
  const n = src.length;
  const m = dst.length;
  const A = src.map((g) => norm(g.ch));
  const B = dst.map((g) => norm(g.ch));
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const pairs = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      pairs.set(j, i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  if (nearest) {
    const used = new Set(pairs.values());
    for (let t = 0; t < m; t++) {
      if (pairs.has(t)) continue;
      let best = -1;
      let bd = NEAREST_MAX_PX;
      for (let s = 0; s < n; s++) {
        if (used.has(s) || A[s] !== B[t]) continue;
        const d = Math.hypot(src[s].x - dst[t].x, src[s].y - dst[t].y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best >= 0) {
        pairs.set(t, best);
        used.add(best);
      }
    }
  }
  return pairs;
}

// ── the plan ───────────────────────────────────────────────────────────

export interface MorphItem {
  kind: 'move' | 'enter' | 'exit';
  block: string;
  chFrom: string;
  chTo: string;
  from: { x: number; y: number; o: number };
  to: { x: number; y: number; o: number };
  delay: number;
  dur: number;
  /** How far it travels (the arc's scale). */
  dist: number;
  /** Its scramble sequence. */
  seed: number;
}

export interface MorphPlan {
  items: MorphItem[];
  /** The last item's end, ms. */
  totalMs: number;
  /** Letters that travel, and all the letters the target has. */
  moved: number;
  total: number;
  ease: (t: number) => number;
  arcPx: number;
  scramble: boolean;
  reduced: boolean;
}

/**
 * The morph from `src` to `dst` (each every block's letters, in reading
 * order). `reduced`: the 300ms crossfade.
 */
export function planMorph(src: Glyph[], dst: Glyph[], s: MorphSettings, reduced: boolean): MorphPlan {
  const fade = reduced;
  const dur = fade ? REDUCED_MS : s.durationMs;
  const stag = s.staggerMs;
  const items: MorphItem[] = [];
  let moved = 0;
  const blocks = [...new Set([...src.map((g) => g.block), ...dst.map((g) => g.block)])];
  for (const block of blocks) {
    const sb = src.filter((g) => g.block === block);
    const db = dst.filter((g) => g.block === block);
    const pairs = fade ? new Map<number, number>() : matchGlyphs(sb, db, s.reuseOutOfOrder);
    const usedSrc = new Set(pairs.values());
    db.forEach((d, j) => {
      const si = pairs.get(j);
      if (si !== undefined) {
        const g = sb[si];
        moved++;
        items.push(item('move', block, g.ch, d.ch, { x: g.x, y: g.y, o: 1 }, { x: d.x, y: d.y, o: 1 }));
      } else {
        items.push(item('enter', block, d.ch, d.ch, { x: d.x, y: d.y + (fade ? 0 : RISE_PX), o: 0 }, { x: d.x, y: d.y, o: 1 }));
      }
    });
    sb.forEach((g, i) => {
      if (usedSrc.has(i)) return;
      items.push(item('exit', block, g.ch, g.ch, { x: g.x, y: g.y, o: 1 }, { x: g.x, y: g.y - (fade ? 0 : RISE_PX), o: 0 }));
    });
  }

  // Reading order of where each letter ends up (a leaving one: where it was).
  const key = (it: MorphItem) => (it.kind === 'exit' ? it.from : it.to);
  const ys = items.map((it) => key(it).y);
  const xs = items.map((it) => key(it).x);
  const minY = Math.min(...ys);
  const spanY = Math.max(...ys) - minY || 1;
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  let totalMs = 0;
  items.forEach((it, i) => {
    const k = key(it);
    const order = 0.65 * ((k.y - minY) / spanY) + 0.35 * ((k.x - minX) / spanX);
    const delay = fade ? 0 : order * stag;
    if (it.kind === 'exit') {
      it.delay = delay * 0.5;
      it.dur = fade ? dur * 0.6 : dur * 0.5;
    } else if (it.kind === 'enter') {
      it.delay = fade ? dur * 0.4 : delay + dur * 0.35;
      it.dur = fade ? dur * 0.6 : dur * 0.65;
    } else {
      it.delay = delay;
      it.dur = dur;
    }
    it.dist = Math.hypot(it.to.x - it.from.x, it.to.y - it.from.y);
    it.seed = i;
    totalMs = Math.max(totalMs, it.delay + it.dur);
  });

  return {
    items,
    totalMs,
    moved,
    total: dst.length,
    ease: fade ? (t) => t : EASE[s.easing] ?? EASE.inOutCubic,
    arcPx: fade ? 0 : s.arcPx,
    scramble: s.scramble && !fade,
    reduced: fade,
  };
}

function item(kind: MorphItem['kind'], block: string, chFrom: string, chTo: string, from: MorphItem['from'], to: MorphItem['to']): MorphItem {
  return { kind, block, chFrom, chTo, from, to, delay: 0, dur: 0, dist: 0, seed: 0 };
}

// ── sampling ───────────────────────────────────────────────────────────

export interface DrawnGlyph {
  ch: string;
  x: number;
  y: number;
  alpha: number;
  block: string;
}

/** A scrambling letter's pick for its `step`th 55ms: a hash, so a frame is a
 *  pure function of time (the prototype drew Math.random at the same rate). */
export function scrambleChar(seed: number, step: number): string {
  let h = (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(step + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return POOL[h % POOL.length];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** One item `ms` after the morph started. */
export function sampleItem(plan: MorphPlan, it: MorphItem, ms: number): DrawnGlyph {
  const p = clamp01((ms - it.delay) / it.dur);
  const e = plan.ease(p);
  const x = it.from.x + (it.to.x - it.from.x) * e;
  let y = it.from.y + (it.to.y - it.from.y) * e;
  if (it.kind === 'move' && plan.arcPx) y -= plan.arcPx * Math.sin(Math.PI * clamp01(e)) * Math.min(1, it.dist / ARC_FULL_PX);
  const alpha = it.kind === 'move' ? 1 : it.from.o + (it.to.o - it.from.o) * p;
  let ch = it.chTo;
  if (it.kind === 'move') ch = p < 0.5 ? it.chFrom : it.chTo;
  else if (plan.scramble && p > 0 && p < 1) {
    const scrambling = it.kind === 'enter' ? p < 0.7 : p > 0.15;
    if (scrambling) ch = scrambleChar(it.seed, Math.floor((ms - it.delay) / SCRAMBLE_STEP_MS));
  }
  return { ch, x, y, alpha, block: it.block };
}

/** Every letter `ms` into the morph; the invisible ones left out. */
export function sampleMorph(plan: MorphPlan, ms: number): DrawnGlyph[] {
  const out: DrawnGlyph[] = [];
  for (const it of plan.items) {
    const g = sampleItem(plan, it, ms);
    if (g.alpha > 0) out.push(g);
  }
  return out;
}

/** The hint's per-language opacity `ms` after a switch from `from` to `to`. */
export function hintAlphaAt(of: Lang | null, from: Lang, to: Lang, ms: number, inactive: number): number {
  const a = hintAlpha(of, from, inactive);
  const b = hintAlpha(of, to, inactive);
  return a + (b - a) * CSS_EASE(clamp01(ms / HINT_MS));
}
