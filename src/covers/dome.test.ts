import { describe, expect, it } from 'vitest';
import { DomeSpring, detailDome } from './dome';

describe('the detail dome', () => {
  it('is one spring per cover, whatever role its card has', () => {
    expect(detailDome('rive-site')).toBe(detailDome('rive-site'));
    expect(detailDome('drex')).not.toBe(detailDome('rive-site'));
  });

  it('let go while up, it eases back to rest rather than snapping', () => {
    const d = new DomeSpring();
    d.point(300, 400);
    for (let ms = 0; ms <= 1000; ms += 16) d.ease(ms, 0.12);
    expect(d.state.amp).toBeGreaterThan(0.99);
    d.leave(); // the card stops being the centre card
    d.ease(1016, 0.12);
    expect(d.state.amp).toBeGreaterThan(0.8);
    expect(d.state.x).toBeCloseTo(300, 0);
    for (let ms = 1032; ms <= 3000; ms += 16) d.ease(ms, 0.12);
    expect(d.state.amp).toBe(0);
  });
});
