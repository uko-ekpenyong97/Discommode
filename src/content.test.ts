import { describe, expect, it } from 'vitest';
import { START_COL, START_ROW } from './config';
import { CONTENT, CONTENT_COUNT, PORTFOLIO, contentIndex, indexForProject, itemFace } from './content';

describe('content manifest', () => {
  it('marks item-01 as the one magazine, issue 01', () => {
    const magazines = CONTENT.filter((item) => item.kind === 'magazine');
    expect(magazines).toHaveLength(1);
    expect(magazines[0].slug).toBe('item-01');
    expect(magazines[0].issue).toBe('01');
  });

  it('carries three portfolio cards, 02/03/04, in sequence after the magazine', () => {
    expect(PORTFOLIO.map((item) => item.project)).toEqual(['02', '03', '04']);
    expect(CONTENT.map((item) => item.slug)).toEqual([
      'item-01',
      'item-02',
      'item-03',
      'item-04',
    ]);
  });

  it('gives every card exactly the id it needs for its kind', () => {
    for (const item of CONTENT) {
      if (item.kind === 'magazine') {
        expect(item.issue).toBeTruthy();
        expect(item.project).toBeUndefined();
      } else {
        expect(item.project).toBeTruthy();
        expect(item.issue).toBeUndefined();
      }
    }
  });

  it('maps a project id back onto the shared sequence', () => {
    expect(indexForProject('03')).toBe(2);
    expect(indexForProject('99')).toBe(-1);
  });
});

describe('itemFace', () => {
  it('uses the issue cover for a readable issue, over any card art', () => {
    const item01 = CONTENT.find((i) => i.issue === '01')!;
    expect(itemFace(item01)).toBe('/issues/01/cover.webp');
  });

  it('falls back to the card art when there is no issue', () => {
    const project = CONTENT.find((i) => i.kind === 'portfolio')!;
    expect(itemFace(project)).toBe(project.image);
  });

  it('is undefined for a card with no art at all (renders the tint fallback)', () => {
    expect(itemFace({ ...CONTENT[1], image: undefined })).toBeUndefined();
  });
});

describe('grid placement', () => {
  it('centres the cold-load cell on the first card (01, Discommode)', () => {
    expect(contentIndex(START_COL, START_ROW)).toBe(0);
    expect(CONTENT[contentIndex(START_COL, START_ROW)].slug).toBe('item-01');
  });

  it('lays 01 → 02 → 03 → 04 side by side along the home row', () => {
    const row = Array.from({ length: CONTENT_COUNT }, (_, i) =>
      CONTENT[contentIndex(START_COL + i, START_ROW)].slug,
    );
    expect(row).toEqual(['item-01', 'item-02', 'item-03', 'item-04']);
  });

  it('repeats that row as the tiling unit', () => {
    expect(contentIndex(START_COL + CONTENT_COUNT, START_ROW)).toBe(contentIndex(START_COL, START_ROW));
  });
});
