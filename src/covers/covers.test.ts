import { describe, expect, it } from 'vitest';
import { COVERS, riveCover, shaderCover } from './covers';
import { dialDefaults } from './dialValues';
import { backdropUnder, coverBackdrop, setSiteCoverDials, SITE_COVER_DEFAULTS } from './coverDials';
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

describe('the backdrop', () => {
  it('cards 02, 03 and 04 are solid; a cover that says nothing lets the sky through', () => {
    expect(coverBackdrop('rive-site')).toBe('solid');
    expect(coverBackdrop('drex')).toBe('solid');
    expect(coverBackdrop('nosey')).toBe('solid');
    expect(coverBackdrop('a-sky-cover')).toBe('sky');
  });

  it("lays the site's colour only under a cover that lets the sky through", () => {
    expect(backdropUnder('a-sky-cover')).toBeNull();
    expect(backdropUnder('rive-site')).toBeNull();
    setSiteCoverDials({ coverBackdrop: 'solid' });
    try {
      expect(backdropUnder('a-sky-cover')).toBe(SITE_COVER_DEFAULTS.coverBackdropColor);
      expect(backdropUnder('rive-site')).toBeNull();
      expect(backdropUnder('nosey')).toBeNull();
    } finally {
      setSiteCoverDials({ coverBackdrop: 'sky' });
    }
  });
});
