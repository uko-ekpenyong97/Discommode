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

  it('gives every project at least one page, each with at least one block', () => {
    for (const project of PROJECTS) {
      expect(project.pages.length).toBeGreaterThan(0);
      for (const page of project.pages) expect(page.length).toBeGreaterThan(0);
    }
  });

  it('opens every page on a title, so a stacked sliver says what it is', () => {
    for (const project of PROJECTS) {
      for (const page of project.pages) expect(page[0].type).toBe('title');
    }
  });

  it('keeps the single-page case covered (03), alongside multi-page ones', () => {
    expect(projectById('03')!.pages).toHaveLength(1);
    expect(projectById('02')!.pages.length).toBeGreaterThan(1);
  });
});
