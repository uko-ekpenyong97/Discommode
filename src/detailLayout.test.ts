import { describe, expect, it } from 'vitest';
import { computeDetailLayout } from './detailLayout';

describe('computeDetailLayout', () => {
  it('makes a large hero card (~cardScale of viewport height, 3:4)', () => {
    const { panelW, panelH } = computeDetailLayout(1440, 900, 0.82, 48, 56);
    expect(panelH).toBeCloseTo(900 * 0.82, 5);
    expect(panelW / panelH).toBeCloseTo(3 / 4, 5);
  });

  it('peeks exactly `peek` px of each side card at the edges', () => {
    const vw = 1440;
    const peek = 56;
    const { panelW, panelStep } = computeDetailLayout(vw, 900, 0.82, 48, peek);
    // Side panel centre when the active one is centred = vw/2 + panelStep.
    const sideLeftEdge = vw / 2 + panelStep - panelW / 2;
    expect(vw - sideLeftEdge).toBeCloseTo(peek, 5);
  });

  it('caps the height at the viewport so it never overflows vertically', () => {
    const { panelH } = computeDetailLayout(2000, 600, 1.3, 48, 56);
    expect(panelH).toBeLessThanOrEqual(600);
  });

  it('shrinks the card on a narrow viewport, preserving the gap', () => {
    const vw = 500;
    const gap = 48;
    const peek = 56;
    const { panelW } = computeDetailLayout(vw, 900, 0.82, gap, peek);
    // Card + gap + peek must fit within each half.
    expect(panelW / 2 + gap + peek).toBeLessThanOrEqual(vw / 2 + 0.001);
  });

  it('responds to the gap dial when the viewport is the binding constraint', () => {
    const wide = computeDetailLayout(500, 900, 0.82, 20, 56).panelW;
    const tight = computeDetailLayout(500, 900, 0.82, 80, 56).panelW;
    expect(tight).toBeLessThan(wide); // a larger gap shrinks the clamped card
  });
});
