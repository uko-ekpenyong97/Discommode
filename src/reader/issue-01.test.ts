import { describe, expect, it } from 'vitest';
import { buildSpreads, issue01, pageLabel } from './issue-01';
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
