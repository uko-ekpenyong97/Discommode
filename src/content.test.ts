import { describe, expect, it } from 'vitest';
import { START_COL, START_ROW } from './config';
import { CONTENT, contentIndex, itemFace } from './content';

describe('content issue mapping', () => {
  it('marks item-01 as issue 01 and nothing else', () => {
    const withIssue = CONTENT.filter((item) => item.issue);
    expect(withIssue).toHaveLength(1);
    expect(withIssue[0].slug).toBe('item-01');
    expect(withIssue[0].issue).toBe('01');
  });
});

describe('itemFace', () => {
  it('uses the issue cover for a readable issue, over any sample poster', () => {
    const item01 = CONTENT.find((i) => i.issue === '01')!;
    expect(itemFace(item01)).toBe('/issues/01/cover.webp');
  });

  it('falls back to the sample poster when there is no issue', () => {
    // Item 08 (id 7) carries a sample poster but no issue.
    const poster = CONTENT.find((i) => !i.issue && i.image)!;
    expect(itemFace(poster)).toBe(poster.image);
  });

  it('is undefined for a plain hue item (renders the tint fallback)', () => {
    const plain = CONTENT.find((i) => !i.issue && !i.image)!;
    expect(itemFace(plain)).toBeUndefined();
  });
});

describe('grid home position', () => {
  it('centres the cold-load cell on the first card (01, Discommode)', () => {
    expect(contentIndex(START_COL, START_ROW)).toBe(0);
    expect(CONTENT[contentIndex(START_COL, START_ROW)].slug).toBe('item-01');
  });
});
