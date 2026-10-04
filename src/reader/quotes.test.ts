import { describe, expect, it } from 'vitest';
import { ANIMATED_PAGES, PAGE_H, PAGE_W } from './pageAnims';
import { buildSpreads, issue01 } from './issue-01';
import { QUOTED_PAGES, QUOTE_PAGES, quoteOnPage } from './quotes';
import data from './quotes.json';

/** The plates `npm run plates` has written. */
const PLATES = Object.keys(import.meta.glob('../../public/issues/01/plates/*.webp')).map((p) => p.replace('../../public', ''));

describe('quotes.json', () => {
  it('quotes the chapter breaks 02, 05, 12, 21, 29 and 39, inside pages that are not animated (one plate per page)', () => {
    expect(QUOTED_PAGES).toEqual([2, 5, 12, 21, 29, 39]);
    for (const p of QUOTED_PAGES) {
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(40);
      expect(ANIMATED_PAGES).not.toContain(p);
    }
  });

  it('gives every quote page a plate, shipped', () => {
    for (const p of QUOTED_PAGES) {
      const page = issue01.pages.find((x) => x.n === p)!;
      expect(page.plate).toBe(`/issues/01/plates/${String(p).padStart(2, '0')}.webp`);
      expect(PLATES).toContain(page.plate);
    }
  });

  it('has both languages, line for line where the print breaks, and a hit area on the page', () => {
    for (const e of data.pages) {
      for (const block of [e.quote, e.attribution]) {
        expect(block.es.length).toBeGreaterThan(0);
        expect(block.en.length).toBeGreaterThan(0);
        for (const l of [...block.es, ...block.en]) expect(l.trim()).toBe(l);
      }
      const h = e.hitArea;
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w).toBeLessThanOrEqual(PAGE_W);
      expect(h.y + h.h).toBeLessThanOrEqual(PAGE_H);
    }
  });

  it('puts the quote and the attribution inside the hit area (the hint below it, as in the prototype)', () => {
    for (const e of data.pages) {
      const h = e.hitArea;
      expect(e.quote.top).toBeGreaterThanOrEqual(h.y);
      expect(e.attribution.top + e.attribution.es.length * data.styles.attribution.lineHeightPx).toBeLessThanOrEqual(h.y + h.h);
      expect(e.attribution.right).toBeLessThanOrEqual(h.x + h.w);
      expect(e.hint.top).toBeGreaterThanOrEqual(h.y + h.h);
    }
  });

  it('keeps the prototype’s spacing under the attribution: the hint moved up with it', () => {
    const e = data.pages.find((p) => p.page === 5)!;
    // Figma's 1540 under Figma's 1387; the attribution was registered 24.35 up.
    expect(e.hint.top - e.attribution.top).toBeCloseTo(1540 - 1387, 9);
  });

  it('puts every hint the prototype’s 69px under its attribution’s last line, centred on the page', () => {
    const gap = 1540 - (1387 + 2 * data.styles.attribution.lineHeightPx);
    for (const e of data.pages) {
      expect(e.hint.top - (e.attribution.top + e.attribution.es.length * data.styles.attribution.lineHeightPx)).toBeCloseTo(gap, 9);
      expect(e.hint.centerX).toBe(1000);
    }
  });

  it('draws each page in its own ink: black on 02, 05, 29 and 39, cream on 12 and 21; the hint black on 02, cream on 12 and 21, green elsewhere', () => {
    const ink = (n: number) => quoteOnPage(n)!.colors;
    const hint = (n: number) => quoteOnPage(n)!.hint.color;
    for (const n of [2, 5, 29, 39]) expect(ink(n)).toEqual({ quote: '#000000', attribution: '#000000' });
    for (const n of [12, 21]) expect(ink(n)).toEqual({ quote: '#FFF5EC', attribution: '#FFF5EC' });
    expect(hint(2)).toBe('#000000');
    for (const n of [12, 21]) expect(hint(n)).toBe('#FFF5EC');
    for (const n of [5, 29, 39]) expect(hint(n)).toBe('#519B66');
  });

  it('sets page 39 as printed: one line, left-aligned, and a one-line attribution', () => {
    const [quote, attribution] = quoteOnPage(39)!.blocks;
    expect(quote).toMatchObject({ align: 'left', anchorX: 538.25 });
    expect(quote.lines.es).toEqual(['A vivir solo se aprende viviendo.']);
    expect(quote.lines.en).toHaveLength(1);
    expect(attribution).toMatchObject({ align: 'right' });
    expect(attribution.lines.es).toEqual(['-Sentencia Náhual']);
    for (const q of QUOTE_PAGES) if (q.page !== 39) expect(q.blocks[0]).toMatchObject({ align: 'center' });
    for (const q of QUOTE_PAGES) expect(Number.isFinite(q.blocks[0].anchorX)).toBe(true);
  });

  it('carries no wand colour of its own: every page uses the palette’s first, #EDD431', () => {
    expect(data.settings.wandPalette[0]).toBe('#EDD431');
    for (const e of data.pages) expect(Object.keys(e)).not.toContain('wandBaseColor');
  });

  it('sets the hint as the prototype: the labels bold, the rest regular, the arrow drawn at the bold stem', () => {
    expect(data.styles.hint).toMatchObject({ weight: 400, labelWeight: 700, arrowStrokeWeight: 700, text: 'ES ⇄ EN' });
  });

  it('describes each quote in both languages for a screen reader', () => {
    const q = quoteOnPage(5)!;
    expect(q.text.es).toBe('No podemos celebrar que un pájaro se enamore de su jaula. -Juan Carvajal, escritor');
    expect(q.text.en).toBe('We cannot celebrate a bird falling in love with its cage. -Juan Carvajal, writer');
  });

  it('lands each quote page on a spread the reader can open', () => {
    const spreads = buildSpreads(issue01);
    for (const q of QUOTE_PAGES) expect(spreads.some((s) => s.some((p) => p?.n === q.page))).toBe(true);
  });
});
