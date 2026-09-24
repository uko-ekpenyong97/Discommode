import { describe, expect, it } from 'vitest';
import { LOOK } from './portfolioMotion';

/**
 * THE FLOOR UNDER THE LETTERHEAD. The sweep (`scripts/sky-contrast.mjs`) found
 * that the worst any sky can put under the letterhead is a PURE WHITE band —
 * stars at a twinkle peak and the wake both reach it — so the 7:1 bar holds
 * for every sky only while a white band clears it. Measured through the probe
 * (both viewports, 2026-09-23): 0.72 → 7.50, 0.70 → 7.20, 0.69 → 7.05,
 * 0.68 → 6.91. So 0.70 is the lowest this ships at, with a little in hand.
 * `groundScrim` is not the lever and is not guarded here.
 */
const FLOOR = 0.7;

describe('letterheadScrim', () => {
  it(`ships at ≥ ${FLOOR}, the white-band floor`, () => {
    expect(
      LOOK.letterheadScrim,
      `letterheadScrim under ${FLOOR} lets a white sky take the letterhead below 7:1 — see docs/sky.md#the-sweep-the-letterhead-under-a-moving-sky`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });
});
