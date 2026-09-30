import { describe, expect, it } from 'vitest';
import { LOOK } from '../portfolio/portfolioMotion';
import { READER_GROUND_DEFAULTS } from './ground';
import { leafEdgeX } from './flipWake';

describe('the reader ground dials', () => {
  it("readerScrim defaults to the project view's groundScrim", () => {
    expect(READER_GROUND_DEFAULTS.readerScrim).toBe(LOOK.groundScrim);
  });

  it('the flip splat ships on', () => {
    expect(READER_GROUND_DEFAULTS.readerFlipSplat).toBeGreaterThan(0);
  });
});

describe('leafEdgeX', () => {
  const spine = 800;
  const pw = 400;

  it('a next leaf swings its free edge from the right page to the left', () => {
    expect(leafEdgeX(spine, pw, 'next', 0)).toBeCloseTo(1200);
    expect(leafEdgeX(spine, pw, 'next', Math.PI / 2)).toBeCloseTo(800);
    expect(leafEdgeX(spine, pw, 'next', Math.PI)).toBeCloseTo(400);
  });

  it('a prev leaf is its mirror', () => {
    expect(leafEdgeX(spine, pw, 'prev', 0)).toBeCloseTo(400);
    expect(leafEdgeX(spine, pw, 'prev', Math.PI)).toBeCloseTo(1200);
  });
});
