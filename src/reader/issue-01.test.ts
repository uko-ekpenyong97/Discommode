import { describe, expect, it } from 'vitest';
import { buildSpreads, folioText, issue01, issueCover, pageLabel, spreadFolios } from './issue-01';
import type { Issue, Spread } from './issue-01';

/** An issue of `count` numbered pages, with the two single-page flags. */
function make(count: number, hasCover: boolean, hasBack: boolean): Issue {
  return {
    id: 'x',
    pageW: 2000,
    pageH: 2600,
    hasCover,
    hasBack,
    pages: Array.from({ length: count }, (_, i) => ({ n: i + 1, src: `/p/${i + 1}.webp` })),
  };
}

/** Spreads as page numbers, with null for an empty slot — readable assertions. */
const shape = (spreads: Spread[]): (number | null)[][] =>
  spreads.map(([l, r]) => [l ? l.n : null, r ? r.n : null]);

describe('buildSpreads', () => {
  it('pairs plainly when there is no cover or back', () => {
    expect(shape(buildSpreads(make(4, false, false)))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('leaves the last right slot empty on an odd page count', () => {
    expect(shape(buildSpreads(make(3, false, false)))).toEqual([
      [1, 2],
      [3, null],
    ]);
  });

  it('gives a cover its own spread, alone on the right', () => {
    expect(shape(buildSpreads(make(5, true, false)))).toEqual([
      [null, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('gives a back page its own spread, alone on the left', () => {
    expect(shape(buildSpreads(make(5, false, true)))).toEqual([
      [1, 2],
      [3, 4],
      [5, null],
    ]);
  });

  it('handles cover and back together, pairing everything between', () => {
    expect(shape(buildSpreads(make(6, true, true)))).toEqual([
      [null, 1],
      [2, 3],
      [4, 5],
      [6, null],
    ]);
  });

  it('is empty for an issue with no pages', () => {
    expect(buildSpreads(make(0, true, true))).toEqual([]);
  });

  it('never puts a page in both slots or drops one', () => {
    const issue = make(9, true, true);
    const seen = buildSpreads(issue).flat().filter((p) => p !== null);
    expect(seen.map((p) => p.n)).toEqual(issue.pages.map((p) => p.n));
  });
});

describe('issue 01', () => {
  const spreads = buildSpreads(issue01);

  it('is 42 pages: a cover, 40 numbered, and a back', () => {
    expect(issue01.pages).toHaveLength(42);
    expect(issue01.pages[0].label).toBe('COVER');
    expect(issue01.pages[41].label).toBe('BACK');
  });

  it('builds 22 spreads, opening on the cover and closing on the back', () => {
    expect(spreads).toHaveLength(22);
    expect(shape([spreads[0]])).toEqual([[null, 0]]);
    expect(shape([spreads[21]])).toEqual([[41, null]]);
  });

  it('closes on the drawn back at rest, keeping its label, while the page keeps the print', () => {
    const [back] = spreads[21];
    expect(back?.src).toBe('/issues/01/back-rest.webp');
    expect(back?.label).toBe('BACK');
    expect(issue01.pages[41].src).toBe('/issues/01/back.webp');
  });

  it('pairs the numbered pages in between', () => {
    expect(shape([spreads[1]])).toEqual([[1, 2]]);
    expect(shape([spreads[20]])).toEqual([[39, 40]]);
  });

  it('labels the plates by name and the pages by zero-padded number', () => {
    expect(pageLabel(issue01.pages[0])).toBe('COVER');
    expect(pageLabel(issue01.pages[41])).toBe('BACK');
    expect(pageLabel(issue01.pages[1])).toBe('01');
    expect(pageLabel(issue01.pages[40])).toBe('40');
  });
});

describe('issueCover', () => {
  it('returns the first page (the cover) for a known issue', () => {
    expect(issueCover('01')).toBe('/issues/01/cover.webp');
  });

  it('is undefined for an unknown issue', () => {
    expect(issueCover('99')).toBeUndefined();
  });
});

describe('spreadFolios — the pill reads the magazine’s own page numbers', () => {
  const texts = (issue: Issue) => spreadFolios(issue).map(folioText);

  it('Issue 01: Cover, then the inside pages two at a time from 01, then Back', () => {
    const t = texts(issue01);
    expect(t).toHaveLength(22);
    expect(t[0]).toBe('Cover');
    expect(t[1]).toBe('01 | 02');
    expect(t[4]).toBe('07 | 08');
    expect(t[5]).toBe('09 | 10');
    expect(t[20]).toBe('39 | 40');
    expect(t[21]).toBe('Back');
  });

  it('counts by position in the page list, not by any number on the page', () => {
    // Pages numbered from 100: the folios still start at 01 after the cover.
    const issue = make(6, true, true);
    issue.pages = issue.pages.map((p, i) => ({ ...p, n: 100 + i }));
    expect(texts(issue)).toEqual(['Cover', '01 | 02', '03 | 04', 'Back']);
  });

  it('shows a lone inside page on its own, at either end', () => {
    // cover, three inside pages, back: the last inside page is open alone.
    expect(texts(make(5, true, true))).toEqual(['Cover', '01 | 02', '03', 'Back']);
    // no cover: the pages pair from the first, and an odd one is alone at the end.
    expect(texts(make(3, false, false))).toEqual(['01 | 02', '03']);
  });

  it('a book with no cover or back has no Cover or Back', () => {
    expect(texts(make(4, false, false))).toEqual(['01 | 02', '03 | 04']);
  });
});
