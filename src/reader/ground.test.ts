import { describe, expect, it } from 'vitest';
import { LOOK } from '../portfolio/portfolioMotion';
import { CHROME_REQUIRED, READER_GROUND_DEFAULTS } from './ground';
import { worstChrome } from './chromeFloor';
import { leafEdgeX } from './flipWake';

const WHITE: [number, number, number] = [255, 255, 255];

/**
 * THE FLOOR UNDER THE READER'S CHROME. The brightest thing any sky can put
 * under the back pill or the page bar is a PURE WHITE band — the lit top of a
 * noon cloud deck clips to it, a star at its twinkle peak reaches it, the wake
 * reaches it (docs/sky.md, the sweep) — so the chrome holds 4.5:1 over every
 * sky only while it holds it over white. Over white, at `readerScrim` 0.35,
 * the dimmest run (the caption's "SPREAD n / N", white 0.5 on its chip) reads
 * 4.43 at a chrome wash of 0.70, 4.51 at 0.72, 4.62 at 0.75. So 0.72 is the
 * floor and 0.75 ships.
 */
const FLOOR = 0.72;

describe('readerChromeScrim', () => {
  it(`ships at ≥ ${FLOOR}, the white-band floor`, () => {
    expect(
      READER_GROUND_DEFAULTS.readerChromeScrim,
      `readerChromeScrim under ${FLOOR} lets a white sky take the reader's chrome below ${CHROME_REQUIRED}:1 — see docs/reader.md`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it(`holds every run of chrome type to ${CHROME_REQUIRED}:1 over a white band, as shipped`, () => {
    const w = worstChrome(WHITE, READER_GROUND_DEFAULTS.readerScrim, READER_GROUND_DEFAULTS.readerChromeScrim);
    expect(w.ratio, `${w.kind} at ${w.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(CHROME_REQUIRED);
  });

  it('is what sets the floor: under it, white fails', () => {
    const w = worstChrome(WHITE, READER_GROUND_DEFAULTS.readerScrim, 0.7);
    expect(w.kind).toBe('reader__caption');
    expect(w.ratio).toBeLessThan(CHROME_REQUIRED);
  });
});

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
