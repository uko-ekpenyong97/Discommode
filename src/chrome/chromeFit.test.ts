import { describe, expect, it } from 'vitest';
import { AIR, MIN_MARGIN, MIN_TARGET, chromeFit } from './chromeFit';
import SHAPES from './shapes.json';

const face = (name: 'cover' | 'prev' | 'next' | 'back-cover') => {
  const b = SHAPES[name].base;
  return { base: b.h, min: Math.min(b.w, b.h), reach: b.y + b.h / 2 };
};
const pill = { base: SHAPES.pill.base.h, min: SHAPES.pill.base.h, reach: SHAPES.pill.base.y + SHAPES.pill.base.h / 2 };
const READER_ROW = [face('cover'), face('prev'), pill, face('next'), face('back-cover')];
const DETAIL_ROW = [face('prev'), pill, pill, face('next')];
const BACK = [face('prev')];

describe('chromeFit', () => {
  it('leaves a line that fits at its natural size and margin', () => {
    const f = chromeFit(200, 35, 1, READER_ROW);
    expect(f).toMatchObject({ fit: 1, margin: 35, floored: false });
    expect(f.clearance).toBeGreaterThan(AIR);
  });

  it('scales down to clear the book by AIR when it can, keeping the margin', () => {
    // 1728×996's top band (89.6) fits the back shape: no change.
    expect(chromeFit(89.6, 35, 1, BACK)).toMatchObject({ fit: 1, margin: 35 });
    // a band just short of the back shape's natural reach: the fit takes it.
    const natural = 23 + face('prev').reach; // box half + reach, at u = 1
    const f = chromeFit(35 + AIR + natural - 2, 35, 1, BACK);
    expect(f.fit).toBeLessThan(1);
    expect(f.fit * 46).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(f.margin).toBe(35);
    expect(f.clearance).toBeCloseTo(AIR, 6);
  });

  it('never takes a face under 44px: at 1440×900 the floor is hit and the margin gives way', () => {
    const f = chromeFit(81, 35, 1, READER_ROW);
    expect(f.floored).toBe(true);
    expect(Math.min(...READER_ROW.map((x) => x.min)) * f.fit).toBeCloseTo(MIN_TARGET, 6);
    expect(f.margin).toBeLessThan(35);
    expect(f.margin).toBeGreaterThanOrEqual(MIN_MARGIN);
    expect(f.clearance).toBeGreaterThanOrEqual(AIR - 1e-9);
  });

  it('clears at both signed-off viewports, for every line', () => {
    // band = (vh − 0.82 vh) / 2, the hero's
    for (const vh of [900, 996]) {
      const band = (vh - 0.82 * vh) / 2;
      for (const line of [READER_ROW, DETAIL_ROW, BACK]) {
        const f = chromeFit(band, 35, 1, line);
        expect(f.clearance, `${vh} ${line.length}`).toBeGreaterThanOrEqual(AIR - 1e-9);
      }
    }
  });

  it('follows chromeScale: a smaller chrome needs no fit', () => {
    expect(chromeFit(81, 35, 0.5, READER_ROW).fit).toBe(1);
  });
});
