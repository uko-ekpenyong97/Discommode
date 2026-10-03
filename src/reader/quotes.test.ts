import { describe, expect, it } from 'vitest';
import { ANIMATED_PAGES, PAGE_H, PAGE_W } from './pageAnims';
import { buildSpreads, issue01 } from './issue-01';
import { QUOTED_PAGES, QUOTE_PAGES, quoteOnPage } from './quotes';
import data from './quotes.json';

/** The plates `npm run plates` has written. */
const PLATES = Object.keys(import.meta.glob('../../public/issues/01/plates/*.webp')).map((p) => p.replace('../../public', ''));

describe('quotes.json', () => {
  it('quotes page 05, an inside page that is not animated (one plate per page)', () => {
    expect(QUOTED_PAGES).toEqual([5]);
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
