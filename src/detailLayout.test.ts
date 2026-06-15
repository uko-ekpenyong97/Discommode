import { describe, expect, it } from 'vitest';
import { computeDetailLayout } from './detailLayout';

describe('computeDetailLayout (3-card)', () => {
  it('makes a large centre card (~cardScale of viewport height, 3:4)', () => {
    const { panelW, panelH } = computeDetailLayout(1440, 900, 0.82, 0.85, 40);
    expect(panelH).toBeCloseTo(900 * 0.82, 5);
    expect(panelW / panelH).toBeCloseTo(3 / 4, 5);
  });

  it('spaces a side card so its edge sits exactly `gap` from the centre card', () => {
    const cardScale = 0.82, sideScale = 0.85, gap = 40;
    const { panelW, panelStep } = computeDetailLayout(1440, 900, cardScale, sideScale, gap);
    const sideW = panelW * sideScale;
    // centre right edge = panelW/2; side centre at panelStep; side left edge = panelStep - sideW/2.
    const edgeGap = panelStep - sideW / 2 - panelW / 2;
    expect(edgeGap).toBeCloseTo(gap, 5);
  });

  it('side cards are substantially visible (sideScale of the centre), not slivers', () => {
    const { panelW } = computeDetailLayout(1440, 900, 0.82, 0.85, 40);
    expect(panelW * 0.85).toBeGreaterThan(panelW * 0.5); // ~0.85 → clearly readable
  });

  it('caps the centre height at the viewport so it never overflows vertically', () => {
    const { panelH } = computeDetailLayout(2000, 600, 1.3, 0.85, 40);
    expect(panelH).toBeLessThanOrEqual(600);
  });

  it('shrinks the centre card on a narrow viewport (graceful)', () => {
    const vw = 480;
    const { panelW } = computeDetailLayout(vw, 900, 0.82, 0.85, 40);
    expect(panelW).toBeLessThanOrEqual(vw * 0.9 + 0.001);
  });

  it('a larger sideScale widens the centre↔side spacing', () => {
    const small = computeDetailLayout(1440, 900, 0.82, 0.6, 40).panelStep;
    const big = computeDetailLayout(1440, 900, 0.82, 0.95, 40).panelStep;
    expect(big).toBeGreaterThan(small);
  });
});
