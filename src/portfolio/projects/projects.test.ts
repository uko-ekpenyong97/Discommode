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

  it('does not repeat the title in the blocks — the page header carries it', () => {
    for (const project of PROJECTS) {
      for (const section of project.sections) {
        expect(section.blocks.some((b) => b.type === 'title')).toBe(false);
      }
    }
  });

  it('gives the sections of a project distinct hues, so the tabs read apart', () => {
    for (const project of PROJECTS) {
      const hues = project.sections.map((s) => s.hue);
      expect(new Set(hues).size).toBe(hues.length);
    }
  });

  it('covers the one-folder case (03) and the odd-count one (04)', () => {
    // One folder: no pile above, none below, and no turn anywhere.
    expect(projectById('03')!.sections).toHaveLength(1);
    // Six: three full rows, so a read pile, an open folder and an unread pile
    // are all on screen at once.
    expect(projectById('02')!.sections).toHaveLength(6);
    // Seven: an odd count, so the last row holds a left folder on its own and
    // rises alone.
    expect(projectById('04')!.sections).toHaveLength(7);
  });

  it('puts the video and the Rive artboard somewhere in every project', () => {
    for (const project of PROJECTS) {
      const types = project.sections.flatMap((s) => s.blocks.map((b) => b.type));
      expect(types).toContain('video');
      expect(types).toContain('rive');
    }
  });
});
