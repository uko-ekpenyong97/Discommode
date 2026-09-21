import { describe, expect, it } from 'vitest';
import { flashEnvelope } from './skyEngine';

/**
 * The lightning envelope. It is the one piece of the sky that lives on the CPU
 * — the shader only ever receives `uFlash` — so it is the one piece that can be
 * tested without a GPU, and it is worth testing: a strike that does not decay
 * is a strobe over a page of type.
 */
describe('flashEnvelope', () => {
  it('is silent before the strike and at the moment of it', () => {
    expect(flashEnvelope(-1, 1)).toBe(0);
    expect(flashEnvelope(0, 1)).toBe(0); // the bursts are all strictly after t0
  });

  it('peaks in the first fifth of a second and decays to nothing', () => {
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => flashEnvelope(i / 200, 1)));
    expect(peak).toBeGreaterThan(0.8);
    expect(flashEnvelope(1.5, 1)).toBeLessThan(0.01);
    expect(flashEnvelope(3, 1)).toBeLessThan(0.001);
  });

  it('has three bursts — the light comes back twice before it goes', () => {
    const at = (d: number) => flashEnvelope(d, 1);
    // Sample finely and count the local maxima.
    const xs = Array.from({ length: 600 }, (_, i) => at(i / 1000));
    let peaks = 0;
    for (let i = 1; i < xs.length - 1; i++) {
      if (xs[i] > xs[i - 1] && xs[i] >= xs[i + 1]) peaks++;
    }
    expect(peaks).toBe(3);
  });

  it('never exceeds 1, and scales with how much of a storm there is', () => {
    for (let d = 0; d < 3; d += 0.001) expect(flashEnvelope(d, 1)).toBeLessThanOrEqual(1);
    expect(flashEnvelope(0.2, 0.4)).toBeLessThan(flashEnvelope(0.2, 1));
    expect(flashEnvelope(0.2, 0)).toBe(0);
  });
});
