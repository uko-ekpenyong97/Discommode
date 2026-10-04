/**
 * The chapter-break quotes (docs/reader.md, "Chapter-break quotes"): which
 * pages carry one, where its letters sit, and how the translate morph moves
 * them. `quotes.json` is the source of truth — the brief's file
 * (~/Discommode-pages/01/translate/quotes.json), as given: Figma's positions in
 * page px (2000×2600), the lines broken exactly as printed, the styles, and the
 * morph's settings. A later chapter break is a new entry in `pages` only.
 *
 * This module is the data, typed, and the TRANSLATE dials' store (the `paper`
 * pattern: a module object the dev panel writes into). No DOM.
 */
import data from './quotes.json';
import { EASINGS } from './quoteMorph';
import type { Easing, HintSpec, Lang, MorphSettings, TextBlock } from './quoteMorph';

export interface QuoteSettings extends MorphSettings {
  showHint: boolean;
  /** The language a quote is printed in, and goes back to. */
  defaultLang: Lang;
  /** Back to `defaultLang` once its page is off the open spread. */
  resetWhenPageLeaves: boolean;
  /** The wand cursor (wand.svg) over the quote: its lean, degrees (negative
   *  leans the star toward the text), and its height, CSS px. */
  wandTiltDeg: number;
  wandSizePx: number;
  /** The letters' scale about the quote's centre while the quote is hovered. */
  hoverScale: number;
  /** One loop of `wandPalette` while a morph runs, ms; its first colour is the
   *  wand's at rest. */
  colorCycleMs: number;
  wandPalette: string[];
  /** The breathing guide: its peak scale and its loop. */
  breatheScale: number;
  breathePeriodMs: number;
  /** Breathing stops for good at the first tap on the page (until it resets). */
  breatheUntilFirstTap: boolean;
  /** A tap flicks the wand. */
  flickOnTap: boolean;
}

interface TextStyle {
  family: string;
  weight: number;
  sizePx: number;
  lineHeightPx: number;
  color: string;
  align: 'center' | 'right' | 'left';
}

interface HintStyle {
  family: string;
  /** The line's weight (the spaces); "ES" and "EN" are `labelWeight`. */
  weight: number;
  labelWeight: number;
  /** The drawn ⇄'s stroke: Space Mono's stem at this weight. */
  arrowStrokeWeight: number;
  sizePx: number;
  letterSpacingEm: number;
  color: string;
  text: string;
  inactiveOpacity: number;
}

interface PageEntry {
  page: number;
  /** The quote's and the attribution's colour, and the hint's, on this page's
   *  ground; `styles`' when absent. */
  ink?: string;
  hintColor?: string;
  /** `styles.quote.align` unless given: centred on `centerX`, or set from `left`. */
  quote: { align?: 'center' | 'left'; centerX?: number; left?: number; top: number; es: string[]; en: string[] };
  attribution: { right: number; top: number; es: string[]; en: string[] };
  hint: { centerX: number; top: number };
  hitArea: { x: number; y: number; w: number; h: number };
}

/** One page's quote, ready to lay out. */
export interface QuotePage {
  page: number;
  blocks: TextBlock[];
  colors: Record<string, string>;
  hint: HintSpec & { color: string; inactiveOpacity: number; sizePx: number; arrowStrokeWeight: number };
  hitArea: { x: number; y: number; w: number; h: number };
  /** What a screen reader hears, per language. */
  text: Record<Lang, string>;
}

const styles = data.styles as { quote: TextStyle; attribution: TextStyle; hint: HintStyle };

/** A canvas font string. (The hint's ⇄ is drawn, not set: quoteMorph's `swapArrow`.) */
const fontOf = (s: { weight: number; sizePx: number; family: string }, fallback: string) =>
  `${s.weight} ${s.sizePx}px "${s.family}", ${fallback}`;

export const QUOTE_FONTS = {
  quote: fontOf(styles.quote, 'monospace'),
  attribution: fontOf(styles.attribution, 'serif'),
  /** "ES" and "EN", bold as the prototype's <b>. */
  hint: fontOf({ ...styles.hint, weight: styles.hint.labelWeight }, 'monospace'),
};

/** The faces the page loads (public/fonts, fontsource 5.3.0, OFL), by the
 *  family and weight `quotes.json` names. */
export const QUOTE_FACES = [
  { family: styles.quote.family, weight: String(styles.quote.weight), url: '/fonts/space-mono-latin-700.woff2' },
  { family: styles.attribution.family, weight: String(styles.attribution.weight), url: '/fonts/lora-latin-400.woff2' },
];

function toPage(e: PageEntry): QuotePage {
  const join = (lines: string[]) => lines.join(' ');
  const quoteAlign = e.quote.align ?? styles.quote.align;
  return {
    page: e.page,
    blocks: [
      {
        key: 'quote',
        font: QUOTE_FONTS.quote,
        lineHeight: styles.quote.lineHeightPx,
        align: quoteAlign,
        anchorX: (quoteAlign === 'left' ? e.quote.left : e.quote.centerX) ?? NaN,
        top: e.quote.top,
        lines: { es: e.quote.es, en: e.quote.en },
      },
      {
        key: 'attribution',
        font: QUOTE_FONTS.attribution,
        lineHeight: styles.attribution.lineHeightPx,
        align: styles.attribution.align,
        anchorX: e.attribution.right,
        top: e.attribution.top,
        lines: { es: e.attribution.es, en: e.attribution.en },
      },
    ],
    colors: { quote: e.ink ?? styles.quote.color, attribution: e.ink ?? styles.attribution.color },
    hint: {
      font: QUOTE_FONTS.hint,
      text: styles.hint.text,
      letterSpacingPx: styles.hint.letterSpacingEm * styles.hint.sizePx,
      lineHeight: styles.hint.sizePx,
      centerX: e.hint.centerX,
      top: e.hint.top,
      color: e.hintColor ?? styles.hint.color,
      inactiveOpacity: styles.hint.inactiveOpacity,
      sizePx: styles.hint.sizePx,
      arrowStrokeWeight: styles.hint.arrowStrokeWeight,
    },
    hitArea: e.hitArea,
    text: {
      es: `${join(e.quote.es)} ${join(e.attribution.es)}`,
      en: `${join(e.quote.en)} ${join(e.attribution.en)}`,
    },
  };
}

export const QUOTE_PAGES: QuotePage[] = (data.pages as PageEntry[]).map(toPage);

/** The quote printed on page `n`, if it carries one. */
export function quoteOnPage(n: number): QuotePage | undefined {
  return QUOTE_PAGES.find((q) => q.page === n);
}

/** The pages that carry a quote, ascending. */
export const QUOTED_PAGES: number[] = QUOTE_PAGES.map((q) => q.page).sort((a, b) => a - b);

// ── the TRANSLATE dials ─────────────────────────────────────────────────

const s = data.settings;

/** As shipped: `quotes.json`'s settings. */
export const QUOTE_DEFAULTS: QuoteSettings = {
  durationMs: s.durationMs,
  staggerMs: s.staggerMs,
  arcPx: s.arcPx,
  easing: (EASINGS as string[]).includes(s.easing) ? (s.easing as Easing) : 'inOutCubic',
  reuseOutOfOrder: s.reuseOutOfOrder,
  scramble: s.scramble,
  showHint: s.showHint,
  defaultLang: s.defaultLang === 'en' ? 'en' : 'es',
  resetWhenPageLeaves: s.resetWhenPageLeaves,
  wandTiltDeg: s.wandTiltDeg,
  wandSizePx: s.wandSizePx,
  hoverScale: s.hoverScale,
  colorCycleMs: s.colorCycleMs,
  wandPalette: s.wandPalette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
  breatheScale: s.breatheScale,
  breathePeriodMs: s.breathePeriodMs,
  breatheUntilFirstTap: s.breatheUntilFirstTap,
  flickOnTap: s.flickOnTap,
};

export const quoteSettings: QuoteSettings = { ...QUOTE_DEFAULTS, wandPalette: [...QUOTE_DEFAULTS.wandPalette] };

type Listener = (s: QuoteSettings) => void;
const listeners = new Set<Listener>();

export function setQuoteSettings(next: Partial<QuoteSettings>): void {
  Object.assign(quoteSettings, next);
  for (const fn of listeners) fn(quoteSettings);
}

export function subscribeQuoteSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The settings as `quotes.json` writes them — what the panel's Copy gives. */
export function quoteSettingsSnippet(v: QuoteSettings = quoteSettings): string {
  return `"settings": ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`;
}
