import { describe, expect, it } from 'vitest';
import { COVERS, riveCover, shaderCover } from './covers';
import { dialDefaults } from './dialValues';
import { CONTENT } from '../content';

describe('the cover registry', () => {
  it('narrows by kind', () => {
    expect(shaderCover('rive-site')?.id).toBe('rive-site');
    expect(riveCover('rive-site')).toBeUndefined();
    expect(riveCover('nosey')?.frame).toEqual({ w: 1000, h: 1300 });
    expect(shaderCover('nosey')).toBeUndefined();
  });

  it("has an entry for every card's cover, of the manifest's kind", () => {
    for (const item of CONTENT) {
      if (!item.cover) continue;
      const def = COVERS[item.cover.id];
      expect(def, item.slug).toBeDefined();
      expect(def.kind === 'rive' ? 'rive' : 'shader').toBe(item.cover.kind);
    }
  });

  it("card 04's dials default to the swap at landing, 2× and the full paper light", () => {
    expect(dialDefaults(riveCover('nosey')!.dials)).toEqual({ rive: { riveSwapAt: 'landing', riveMaxDpr: 2, coverPaperShade: 1 } });
  });

  it('card 04 names its file, its two artboards and its state machine', () => {
    const c = CONTENT.find((i) => i.slug === 'item-04')!.cover;
    expect(c).toEqual({
      kind: 'rive',
      id: 'nosey',
      src: '/projects/nosey/cover.riv',
      artboard: { grid: 'Main', detail: 'Main Bounce' },
      stateMachine: 'Main',
    });
  });
});
