import { describe, expect, it, vi } from 'vitest';
import { plateDue } from './reader/flipEngine';

/**
 * The ambient cap (src/ambient.ts): which frames draw at a screen's refresh.
 * A fresh module per rate — its state is the page's.
 */
async function drawn(hz: number, seconds = 2): Promise<number> {
  vi.resetModules();
  const { ambientFrame } = await import('./ambient');
  let n = 0;
  const frames = Math.round(seconds * hz);
  for (let i = 1; i <= frames; i++) if (ambientFrame(1000 + (i * 1000) / hz)) n++;
  return n / seconds;
}

describe('ambientFrame', () => {
  it('draws every frame at 60 Hz and at a 30 fps cap', async () => {
    expect(await drawn(60)).toBe(60);
    expect(await drawn(30)).toBe(30);
  });

  it('draws 60 a second on a 120 Hz screen', async () => {
    expect(await drawn(120)).toBeCloseTo(60, -1);
  });

  it('keeps 90 Hz whole rather than judder 2 in 3, and halves 144', async () => {
    expect(await drawn(90)).toBeCloseTo(90, -1);
    expect(await drawn(144)).toBeCloseTo(72, -1);
  });

  it('answers the same for one frame asked twice', async () => {
    vi.resetModules();
    const { ambientFrame } = await import('./ambient');
    const a = ambientFrame(5000);
    expect(ambientFrame(5000.4)).toBe(a);
  });
});

describe('plateDue (the page turn hands over to the flat page)', () => {
  it('hands over past PLATE_T, as before', () => {
    expect(plateDue(0.986, 0.98)).toBe(true);
    expect(plateDue(0.98, 0.975)).toBe(false);
  });

  it('hands over early when the next frame would skip the window (30 fps, a late frame)', () => {
    expect(plateDue(0.98, 0.955)).toBe(true);
  });
});
