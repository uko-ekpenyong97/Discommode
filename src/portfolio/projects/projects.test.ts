import { describe, expect, it } from 'vitest';
import { PORTFOLIO } from '../../content';
import { PROJECTS, projectById } from './index';

describe('project registry', () => {
  it('has exactly one project per portfolio card in the manifest', () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(PORTFOLIO.map((item) => item.project));
  });

  it('resolves a `#view-NN` id, and nothing else', () => {
    expect(projectById('02')?.id).toBe('02');
    expect(projectById('01')).toBeNull(); // the magazine is not a project
    expect(projectById('99')).toBeNull();
  });

  it('gives every section a title, a hue and at least one block', () => {
    for (const project of PROJECTS) {
      expect(project.sections.length).toBeGreaterThan(0);
      for (const section of project.sections) {
        expect(section.title).toBeTruthy();
        expect(section.hue).toBeGreaterThanOrEqual(0);
        expect(section.hue).toBeLessThan(360);
        expect(section.blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it('opens every section on its own title, so the page says what the tab says', () => {
    for (const project of PROJECTS) {
      for (const section of project.sections) {
        expect(section.blocks[0]).toMatchObject({ type: 'title', text: section.title });
      }
    }
  });

  it('gives the sections of a project distinct hues, so the tabs read apart', () => {
    for (const project of PROJECTS) {
      const hues = project.sections.map((s) => s.hue);
      expect(new Set(hues).size).toBe(hues.length);
    }
  });

  it('covers the one-section case (03) and the overflowing-tab-column one (04)', () => {
    expect(projectById('03')!.sections).toHaveLength(1);
    expect(projectById('02')!.sections).toHaveLength(5);
    // Eight tabs is more than a 900px-tall viewport holds at the preferred
    // height, which is the case `fitTabHeight` exists for.
    expect(projectById('04')!.sections).toHaveLength(8);
  });

  it('puts the video and the Rive artboard somewhere in every project', () => {
    for (const project of PROJECTS) {
      const types = project.sections.flatMap((s) => s.blocks.map((b) => b.type));
      expect(types).toContain('video');
      expect(types).toContain('rive');
    }
  });
});
