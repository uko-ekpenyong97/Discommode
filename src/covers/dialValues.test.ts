import { describe, expect, it } from 'vitest';
import { dialDefaults } from './dialValues';
import dials from './covers/rive-site.json';

describe('dialDefaults', () => {
  it('reads DialKit defaults the way DialKit does', () => {
    const v = dialDefaults({
      n: [3, 0, 10, 1],
      inferred: 1.5,
      on: true,
      colour: '#6200FF',
      mode: { type: 'select', default: '3', options: ['0', '3'] },
      go: { type: 'action', label: 'Go' },
      folder: { _collapsed: true, inner: [0.5, 0, 1] },
    });
    expect(v).toEqual({ n: 3, inferred: 1.5, on: true, colour: '#6200FF', mode: '3', folder: { inner: 0.5 } });
  });

  it("keeps the rive-site cover's tuned values (the prototype's) as its defaults", () => {
    const v = dialDefaults(dials) as {
      stages: Record<string, boolean>;
      quality: { rtScale: number };
      base: { textTop: number; circleVisible: boolean };
      dots3: { density: number; cellK: number };
      riso4: { paper: string; paperOpacity: number };
      refraction5: { slugSeed: number; minify: number; dispersionCut: boolean };
    };
    expect(Object.values(v.stages).every(Boolean)).toBe(true);
    expect(v.quality.rtScale).toBe(0.5);
    expect(v.base.textTop).toBe(204);
    expect(v.base.circleVisible).toBe(false);
    expect(v.dots3).toMatchObject({ density: 34, cellK: 200 });
    expect(v.riso4).toMatchObject({ paper: '#9FAFFF', paperOpacity: 0.439 });
    expect(v.refraction5).toMatchObject({ slugSeed: 7, minify: 6, dispersionCut: true });
  });
});
